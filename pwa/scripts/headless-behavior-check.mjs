import puppeteer from 'puppeteer'
import http from 'http'
import fs from 'fs'
import path from 'path'

const DIST = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist')
const PORT = 58824
const APP_URL = `http://localhost:${PORT}/`

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
    await page.setViewport({ width: 1280, height: 900 })
    await page.setCacheEnabled(false)
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 60000 })

    // Clear SW/storage
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
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 })

    // Go to setup, select HIIT, set duration, click Save
    await page.waitForSelector('#nav-setup', { timeout: 15000 })
    await page.click('#nav-setup')
    await page.waitForSelector('#setup-program-select', { timeout: 5000 })
    await page.select('#setup-program-select', 'HIIT')
    await page.evaluate(() => { const el = document.getElementById('setup-program-select'); if (el) el.dispatchEvent(new Event('change', { bubbles: true })) })
    await new Promise(r => setTimeout(r, 300))
    await page.select('#setup-duration-select', '60')
    await page.evaluate(() => { const el = document.getElementById('setup-duration-select'); if (el) el.dispatchEvent(new Event('change', { bubbles: true })) })
    await new Promise(r => setTimeout(r, 500))
    await page.click('#btn-save')
    await page.waitForSelector('#workout-list, #view-workouts', { timeout: 10000 })
    await new Promise(r => setTimeout(r, 500))
    await page.screenshot({ path: '/tmp/pwa_behavior_save.png', fullPage: true })

    // (Mode buttons pruned) just continue in workout view.
    await page.screenshot({ path: '/tmp/pwa_behavior_hiit.png', fullPage: true })

    // --- after you have the workout view ---
    // mark all per-card "Done" checkboxes/buttons
    try {
      // Click all HIIT round Done buttons one by one; re-query each time because the app re-renders.
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
          // Wait for the corresponding card to get .disabled-card
          await page.waitForFunction((idx) => {
            const cards = document.querySelectorAll('#workout-list .card.hiit-round')
            return cards[idx] && cards[idx].classList.contains('disabled-card')
          }, {}, i)
        } catch (e) { console.log('wait for disabled-card failed', e) }
        i++
      }
      // Wait for Workout Complete button to appear
      try { await page.waitForSelector('#btn-workout-complete', { timeout: 2000 }) } catch (e) { console.log('wait for complete button failed', e) }
      // After marking done, log class and style for each card
      const cardStates = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#workout-list .card')).map(card => ({
          className: card.className,
          style: card.getAttribute('style'),
          dataset: Object.assign({}, card.dataset),
          html: card.outerHTML.slice(0, 500)
        }))
      })
      console.log('CARD_STATES_AFTER_DONE:', JSON.stringify(cardStates, null, 2))
    } catch (e) { console.log('mark done failed', e) }
    await page.screenshot({ path: '/tmp/pwa_behavior_done.png', fullPage: true })

    // click Workout Complete (if exists)
    try {
      await page.click('#btn-workout-complete')
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) { console.log('click complete failed', e) }
    await page.screenshot({ path: '/tmp/pwa_behavior_complete.png', fullPage: true })

    // dump relevant localStorage keys used by the app
    try {
      const keys = await page.evaluate(() => {
        const out = {}
        const names = ['homeworkouts_last_history_block', 'homeworkouts_last_history_block_generated', 'homeworkouts_history']
        for (const k of names) { out[k] = localStorage.getItem(k) }
        out._all = Object.keys(localStorage).reduce((acc,k)=>{ acc[k]=localStorage.getItem(k); return acc }, {})
        return out
      })
      console.log('LOCALSTORAGE_DUMP:', JSON.stringify(keys, null, 2))
    } catch (e) { console.log('localStorage read failed', e) }

    // Optionally, navigate to Fatigue tab and capture screenshot
    try {
      await page.click('#nav-fatigue')
      await page.waitForSelector('#fatigue-grid', { timeout: 3000 })
      await new Promise(r => setTimeout(r, 500))
      await page.screenshot({ path: '/tmp/pwa_behavior_fatigue.png', fullPage: true })
    } catch (e) { console.log('fatigue tab failed', e) }

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
