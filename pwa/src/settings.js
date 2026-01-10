// Centralized settings helper — use homeworkouts_* keys only
import { HOMEWORKOUTS_CONFIG } from './config.js'

// Telemetry helper: best-effort ping when migrating legacy keys.
function incLocalMigrationCount() {
  try {
    const k = 'homeworkouts_migration_local_count'
    const n = parseInt(localStorage.getItem(k) || '0', 10) || 0
    localStorage.setItem(k, String(n + 1))
  } catch (e) {}
}

function sendMigrationTelemetry(key) {
  try {
    const payload = { event: 'homeworkouts_migration', key: String(key || ''), ts: new Date().toISOString() }
    // If global gtag exists (Firebase/GA), use it.
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      try { window.gtag('event', 'homeworkouts_migration', { event_category: 'migration', event_label: key, non_interaction: true }) } catch (e) {}
      incLocalMigrationCount()
      return
    }

    // Prefer configured telemetry URL from build-time config, fallback to localStorage
    let url = ''
    try { url = String(HOMEWORKOUTS_CONFIG.telemetryUrl || '') } catch (e) { url = '' }
    if (!url) {
      try { url = localStorage.getItem('homeworkouts_telemetry_url') || '' } catch (e) { url = '' }
    }
    if (url && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try { navigator.sendBeacon(url, JSON.stringify(payload)) } catch (e) {}
      incLocalMigrationCount()
      return
    }

    // Fallback: increment local counter so we have a local metric.
    incLocalMigrationCount()
  } catch (e) {}
}
export function getSetting(key) {
  try {
    // Prefer the new key
    const newKey = `homeworkouts_${key}`
    const oldKey = `fitbook_${key}`
    const vNew = localStorage.getItem(newKey)
    if (vNew !== null) return vNew

    // Fallback to legacy key and migrate it over once
    const vOld = localStorage.getItem(oldKey)
    if (vOld !== null) {
      try {
        localStorage.setItem(newKey, vOld)
      } catch (e) {}
      try {
        localStorage.removeItem(oldKey)
      } catch (e) {}
      // Telemetry: record that we migrated a legacy key
      try { sendMigrationTelemetry && sendMigrationTelemetry(key) } catch (e) {}
      return vOld
    }

    return null
  } catch (e) { return null }
}

export function setSetting(key, value) {
  try { localStorage.setItem(`homeworkouts_${key}`, String(value)) } catch (e) {}
}

export function removeSetting(key) {
  try { localStorage.removeItem(`homeworkouts_${key}`) } catch (e) {}
}

export function getSettingInt(key, fallback = null) {
  try {
    const v = getSetting(key)
    if (v === null || v === undefined) return fallback
    const n = parseInt(String(v||''), 10)
    return isNaN(n) ? fallback : n
  } catch { return fallback }
}

export function getSettingString(key, fallback = '') {
  try { const v = getSetting(key); return v === null ? fallback : String(v) } catch { return fallback }
}

// Run a one-time migration pass to eagerly migrate common legacy keys.
export function runSettingsMigrationOnce() {
  try {
    const sentinel = 'homeworkouts_migration_done'
    if (localStorage.getItem(sentinel)) return
    const keys = ['program_type', 'equipment', 'sets', 'duration_min', 'hiit_minutes', 'hiit_work_s', 'hiit_rest_s', 'setup_temp', 'setup_saved_at']
    for (const k of keys) {
      try { getSetting(k) } catch (e) {}
    }
    try { localStorage.setItem(sentinel, '1') } catch (e) {}
  } catch (e) {}
}
