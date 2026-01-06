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
    // Stale-while-revalidate: respond with cache first, then update cache from network and notify clients if changed
    evt.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(EXERCISES_URL);
      // Kick off network update
      fetchAndCache(EXERCISES_URL, DATA_CACHE).then(async (res) => {
        try {
          if (!res) return;
          // Compare versions with cached body
          const newJson = await res.clone().json();
          let oldJson = null;
          try { oldJson = cached ? await cached.clone().json() : null } catch(e) {}
          const newHash = JSON.stringify(newJson).length + '_' + (newJson[0] && newJson[0].id ? newJson[0].id : '')
          const oldHash = oldJson ? (JSON.stringify(oldJson).length + '_' + (oldJson[0] && oldJson[0].id ? oldJson[0].id : '')) : null
          if (oldHash !== null && newHash !== oldHash) {
            // Notify clients to refresh automatically
            const all = await clients.matchAll({ includeUncontrolled: true });
            for (const c of all) {
              c.postMessage({type: 'exercises-updated'});
            }
          }
        } catch (e) {}
      }).catch(()=>{})
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
