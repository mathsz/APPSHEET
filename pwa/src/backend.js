import { FITBOOK_CONFIG } from './config.js'

function withProxy(url) {
  const base = FITBOOK_CONFIG?.backend?.proxyBase
  if (!base) return url
  const encoded = encodeURIComponent(url)
  // Simple pass-through: worker should fetch the URL and return JSON with permissive CORS
  return `${base}?url=${encoded}`
}

export async function getGlideWodSummary(email) {
  const exec = FITBOOK_CONFIG?.backend?.execUrl || ''
  const token = FITBOOK_CONFIG?.backend?.token || ''
  const url = `${exec}?action=GLIDE_WOD_SUMMARY&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

export async function replaceGlideExercise(glideId, equipment = '', muscle = '') {
  const exec = FITBOOK_CONFIG?.backend?.execUrl || ''
  const token = FITBOOK_CONFIG?.backend?.token || ''
  const body = {
    action: 'REPLACE_GLIDE_EXERCISE',
    token,
    glideId,
    equipment,
    muscle
  }
  const res = await fetch(withProxy(exec), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}
