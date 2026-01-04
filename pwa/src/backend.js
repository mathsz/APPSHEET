import { FITBOOK_CONFIG } from './config.js'

function readOverride(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

function effectiveBackend() {
  const cfg = FITBOOK_CONFIG?.backend || {}
  const execUrl = readOverride('fitbook_exec_url') || cfg.execUrl || ''
  const token = readOverride('fitbook_token') || cfg.token || ''
  const proxyBase = readOverride('fitbook_proxy_base') || cfg.proxyBase || ''
  return { execUrl, token, proxyBase }
}

function withProxy(url) {
  const { proxyBase } = effectiveBackend()
  if (!proxyBase) return url
  const encoded = encodeURIComponent(url)
  return `${proxyBase}?url=${encoded}`
}

export async function getGlideWodSummary(email) {
  const { execUrl, token } = effectiveBackend()
  const url = `${execUrl}?action=GLIDE_WOD_SUMMARY&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

export async function replaceGlideExercise(glideId, equipment = '', muscle = '') {
  const { execUrl, token } = effectiveBackend()
  const body = { action: 'REPLACE_GLIDE_EXERCISE', token, glideId, equipment, muscle }
  const res = await fetch(withProxy(execUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}
