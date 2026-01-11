let _wakeLock = null
let _noSleep = null

export async function enableWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen')
      _wakeLock.addEventListener('release', () => { _wakeLock = null })
    } else if (typeof NoSleep !== 'undefined') {
      if (!_noSleep) _noSleep = new NoSleep()
      try { _noSleep.enable() } catch {}
    }
    document.addEventListener('visibilitychange', _handleVisibility)
  } catch (e) {
    // ignore
  }
}

export async function releaseWakeLock() {
  try {
    if (_wakeLock) { await _wakeLock.release(); _wakeLock = null }
    if (_noSleep) { try { _noSleep.disable() } catch {} }
    document.removeEventListener('visibilitychange', _handleVisibility)
  } catch (e) {
    // ignore
  }
}

async function _handleVisibility() {
  if (document.visibilityState === 'visible' && !_wakeLock) {
    try { if ('wakeLock' in navigator) _wakeLock = await navigator.wakeLock.request('screen') } catch {}
  }
}
