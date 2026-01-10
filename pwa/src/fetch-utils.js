// Helpers to safely resolve fetch URLs and find cached Exercices.json across
// environments (browser, jsdom, node tests). This avoids `new URL()` throwing
// when no base is available and centralizes cache lookup logic.
export function resolveFetchUrl(path) {
  // In browser builds, `location` exists globally.
  // In Vitest/JSDOM, `window` exists but `location` may not be hoisted to global.
  try {
    // If already absolute, keep as-is.
    try {
      const u = new URL(path)
      if (u && u.href) return u.href
    } catch (e) {}

    const loc = (typeof globalThis !== 'undefined' ? (globalThis.location || globalThis.window?.location) : null)
    const base = (loc && loc.href) ? loc.href : ((typeof globalThis !== 'undefined' && globalThis.document && globalThis.document.baseURI) ? globalThis.document.baseURI : 'http://localhost/')
    return new URL(path, base).href
  } catch (e) {
    // As a last resort, return the original input.
    return path
  }
}

export async function getCachedResponse(path) {
  if (typeof caches === 'undefined' || !caches.match) return null

  const candidates = []
  try {
    candidates.push(resolveFetchUrl(path))
  } catch (e) {}
  candidates.push(path)

  for (const c of candidates) {
    try {
      const m = await caches.match(c)
      if (m) return m
    } catch (e) {}
  }

  try {
    if (caches.keys) {
      const keys = await caches.keys()
      for (const k of keys) {
        try {
          const cache = await caches.open(k)
          for (const c of candidates) {
            try {
              const m = await cache.match(c)
              if (m) return m
            } catch (e) {}
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  return null
}
