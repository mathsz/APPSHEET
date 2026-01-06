const CACHE_NAME = 'fitbook-static-v0.1';
const DATA_CACHE = 'fitbook-data-v0.1';
const EXERCISES_URL = '/exercises.json';
const VERSION_URL = '/version.json';

self.addEventListener('install', (evt) => {
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  clients.claim();
});

// Helper: fetch and cache updated response
async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      return response;
    }
  } catch (e) {}
  return null;
}

self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);
  if (url.pathname === EXERCISES_URL) {
    // Stale-while-revalidate with version.json first, fallback to payload compare
    evt.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(EXERCISES_URL);

      // Background updater: check version.json first
      (async () => {
        try {
          const verRes = await fetch(VERSION_URL).catch(()=>null);
          if (verRes && verRes.ok) {
            const newVer = await verRes.clone().json();
            const oldVerRes = await cache.match(VERSION_URL);
            const oldVer = oldVerRes ? await oldVerRes.clone().json() : null;
            if (!oldVer || oldVer.version !== newVer.version || oldVer.hash !== newVer.hash) {
              // Update version cache
              await cache.put(VERSION_URL, verRes.clone());
              // Fetch and cache new exercises.json
              const exRes = await fetch(EXERCISES_URL).catch(()=>null);
              if (exRes && exRes.ok) {
                await cache.put(EXERCISES_URL, exRes.clone());
                const all = await clients.matchAll({ includeUncontrolled: true });
                for (const c of all) c.postMessage({type: 'exercises-updated'});
              }
            }
          } else {
            // Fallback: network fetch and payload compare if version.json not available
            const res = await fetchAndCache(EXERCISES_URL, DATA_CACHE);
            if (res && cached) {
              try {
                const newJson = await res.clone().json();
                let oldJson = null;
                try { oldJson = cached ? await cached.clone().json() : null } catch(e) {}
                const newHash = JSON.stringify(newJson).length + '_' + (newJson[0] && newJson[0].id ? newJson[0].id : '')
                const oldHash = oldJson ? (JSON.stringify(oldJson).length + '_' + (oldJson[0] && oldJson[0].id ? oldJson[0].id : '')) : null
                if (oldHash !== null && newHash !== oldHash) {
                  const all = await clients.matchAll({ includeUncontrolled: true });
                  for (const c of all) c.postMessage({type: 'exercises-updated'});
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      })()

      return cached || fetch(evt.request);
    })());
    return;
  }

  if (url.pathname === VERSION_URL) {
    evt.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(VERSION_URL);
      const network = fetch(evt.request).then(res => { cache.put(VERSION_URL, res.clone()); return res; }).catch(()=>null)
      return cached || network || new Response('{}', {status:200, headers:{'Content-Type':'application/json'}})
    })());
    return;
  }

  // Default: pass through
});
