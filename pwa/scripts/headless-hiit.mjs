import puppeteer from 'puppeteer'
import http from 'http'
import fs from 'fs'
import path from 'path'

const __file = new URL(import.meta.url).pathname
const DIST = path.resolve(path.dirname(__file), '..', 'dist')
const PORT = process.env.PWA_PORT || 58824
const APP_URL = process.env.PWA_URL || `http://localhost:${PORT}/`
console.log('SERVE DIST:', DIST)

function startStaticServer(dir, port = PORT) {
  const server = http.createServer((req, res) => {
    try {
      const reqPath = decodeURIComponent(new URL(req.url, `http://localhost`).pathname)
      const relPath = reqPath.replace(/^\//, '')
      let filePath = path.join(dir, relPath)
      if (!relPath || relPath === '' || !fs.existsSync(filePath)) {
        filePath = path.join(dir, 'index.html')
      }
      const ext = path.extname(filePath).toLowerCase()
      const typeMap = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }
      const stat = fs.statSync(filePath)
      res.writeHead(200, { 'Content-Type': typeMap[ext] || 'application/octet-stream', 'Content-Length': stat.size })
      const stream = fs.createReadStream(filePath)
      stream.pipe(res)
    } catch (e) {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve(server))
    server.on('error', reject)
  })
}

;(async () => {
  let server = null
  let browser = null
  try {
    server = await startStaticServer(DIST, PORT)
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()))
    page.on('pageerror', err => console.log('PAGE ERROR:', err && err.stack ? err.stack : err))
    page.on('requestfailed', req => { try { const f = req.failure(); console.log('REQFAIL', req.url(), f && f.errorText) } catch (e) {}})
    page.on('response', res => { if (res.status() >= 400) console.log('RESP', res.status(), res.url()) })
    await page.setViewport({ width: 1280, height: 900 })
    // disable cache
    await page.setCacheEnabled(false)
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 60000 })
    // dump content for debugging
    try { const html = await page.content(); await fs.promises.writeFile('/tmp/pwa_page.html', html) } catch (e) { console.log('write page failed', e) }

    // unregister service workers and clear caches + storage
    await page.evaluate(async () => {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations()
          for (const r of regs) await r.unregister()
        }
      } catch (e) {}
      try { await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))) } catch (e) {}
      try { localStorage.clear(); sessionStorage.clear() } catch (e) {}
    })

    // hard reload
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 })

    // navigate to setup view
    await page.waitForSelector('#nav-setup', { timeout: 15000 })
    await page.click('#nav-setup')
    await page.waitForSelector('#setup-program-select', { timeout: 5000 })

    // set to HIIT
    await page.select('#setup-program-select', 'HIIT')
    // dispatch change event
    await page.evaluate(() => {
      const el = document.getElementById('setup-program-select')
      if (el) el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // allow UI to update
    await new Promise(r => setTimeout(r, 300))

    // set duration to 60 minutes
    try {
      await page.select('#setup-duration-select', '60')
      await page.evaluate(() => {
        const el = document.getElementById('setup-duration-select')
        if (el) el.dispatchEvent(new Event('change', { bubbles: true }))
      })
    } catch (e) { console.log('set duration failed', e) }

    // allow UI to update
    await new Promise(r => setTimeout(r, 500))

    // click Save to persist and generate
    try {
      await page.click('#btn-save')
    } catch (e) { console.log('click save failed', e) }

    // wait for workout view or list to appear
    try { await page.waitForSelector('#workout-list, #view-workouts', { timeout: 10000 }) } catch (e) {}

    // read current checkbox states and any workout-list items
    const states = await page.$$eval('#setup-equip-group input[type="checkbox"]', els => els.map(e => ({ value: e.value, disabled: e.disabled, checked: e.checked })))
    const workoutCount = await page.$$eval('#workout-list .card', els => els.length).catch(() => 0)

    const out = { url: APP_URL, states, workoutCount }
    console.log(JSON.stringify(out, null, 2))
    // screenshot for debugging
    try { await page.screenshot({ path: '/tmp/pwa_hiit_test.png', fullPage: true }) } catch (e) {}

    // --- Additional behavior testing: mark all sets done, click Workout Complete, dump localStorage ---
    try {
      // wait a moment for any dynamic render
      await new Promise(r => setTimeout(r, 500))

      // mark all HIIT rounds done one by one (app re-renders each click)
      try {
        let i = 0
        while (true) {
          const count = await page.$$eval('.btn-done-round', els => els.length).catch(() => 0)
          if (i >= count) break
          try {
            await page.evaluate((idx) => {
              const btns = document.querySelectorAll('.btn-done-round')
              const el = btns[idx]
              if (el) el.click()
            }, i)
            await page.waitForFunction((idx) => {
              const cards = document.querySelectorAll('#workout-list .card.hiit-round')
              return cards[idx] && cards[idx].classList.contains('disabled-card')
            }, {}, i)
          } catch (e) { console.log('wait for disabled-card failed', e) }
          i++
        }
      } catch (e) { console.log('mark done failed', e) }

      // allow UI to update styles
      await new Promise(r => setTimeout(r, 500))

      // click Workout Complete if present
      try {
        try { await page.waitForSelector('#btn-workout-complete', { timeout: 3000 }) } catch (e) {}

        const hasComplete = await page.$('#btn-workout-complete').then(Boolean).catch(() => false)
        console.log('WORKOUT_COMPLETE_BUTTON_PRESENT:', hasComplete)

        if (hasComplete) {
          await page.click('#btn-workout-complete')
          console.log('WORKOUT_COMPLETE_BUTTON_CLICKED: true')
          await new Promise(r => setTimeout(r, 1000))
        } else {
          console.log('WORKOUT_COMPLETE_BUTTON_CLICKED: false')
        }
      } catch (e) { console.log('click complete failed', e) }

      // navigate to Fatigue tab to ensure dashboard updated
      try { await page.click('#nav-fatigue'); await page.waitForSelector('#fatigue-grid', { timeout: 3000 }) } catch (e) {}

      // dump relevant localStorage
      try {
        const keys = await page.evaluate(() => {
          const out = {}
          const names = ['homeworkouts_last_history_block', 'homeworkouts_last_history_block_generated', 'homeworkouts_history', 'homeworkouts_setup_temp']
          for (const k of names) { out[k] = localStorage.getItem(k) }
          out._all = Object.keys(localStorage).reduce((acc, k) => { acc[k] = localStorage.getItem(k); return acc }, {})
          return out
        })
        console.log('LOCALSTORAGE_DUMP:', JSON.stringify(keys, null, 2))
      } catch (e) { console.log('localStorage read failed', e) }
    } catch (e) { console.log('behavior test failed', e) }

    await browser.close()
    try { server.close() } catch (e) {}
    process.exit(0)
  } catch (e) {
    console.error('ERROR', e && e.stack ? e.stack : e)
    try { if (browser) await browser.close() } catch (e) {}
    try { server && server.close() } catch (e) {}
    process.exit(2)
  }
})()
