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
    await page.setViewport({ width: 1280, height: 900 })
    await page.setCacheEnabled(false)
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 60000 })

    // clear SW/storage like the other script
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

    // navigate to setup view
    await page.waitForSelector('#nav-setup', { timeout: 15000 })
    await page.click('#nav-setup')
    await page.waitForSelector('#setup-program-select', { timeout: 5000 })

    // set to HIIT
    await page.select('#setup-program-select', 'HIIT')
    await page.evaluate(() => { const el = document.getElementById('setup-program-select'); if (el) el.dispatchEvent(new Event('change', { bubbles: true })) })
    await new Promise(r => setTimeout(r, 300))

    // set duration to 60 minutes
    try { await page.select('#setup-duration-select', '60'); await page.evaluate(() => { const el = document.getElementById('setup-duration-select'); if (el) el.dispatchEvent(new Event('change', { bubbles: true })) }) } catch (e) {}
    await new Promise(r => setTimeout(r, 500))

    // click Save to persist and generate
    try { await page.click('#btn-save') } catch (e) { console.log('click save failed', e) }
    try { await page.waitForSelector('#workout-list, #view-workouts', { timeout: 10000 }) } catch (e) {}
    await new Promise(r => setTimeout(r, 500))

    // capture presence and outerHTML
    const info = await page.evaluate(() => {
      const getOuter = (sel) => {
        const el = document.querySelector(sel)
        return el ? el.outerHTML : null
      }
      const list = Array.from(document.querySelectorAll('#workout-list .card')).map((c, i) => ({ idx: i, outer: c.outerHTML.slice(0, 2000), className: c.className, dataset: Object.assign({}, c.dataset) }))
      const btn = document.getElementById('btn-workout-complete')
      const btnOuter = btn ? btn.outerHTML : null
      const doneRounds = Array.from(document.querySelectorAll('.btn-done-round')).map((el, i) => ({ idx: i, outer: el.outerHTML, dataset: Object.assign({}, el.dataset), text: el.textContent }))
      // find any button with text "Workout complete"
      const btnText = Array.from(document.querySelectorAll('button')).filter(b => (b.textContent||'').trim().toLowerCase().includes('workout complete')).map(b => b.outerHTML)
      return { cardsCount: list.length, cards: list, btnExists: !!btn, btnOuter, doneRounds, btnText }
    })

    console.log('INSPECT_BEFORE:', JSON.stringify(info, null, 2))
    // log parent of #workout-list to see where workout-actions would be inserted
    try {
      const parentInfo = await page.evaluate(() => {
        const list = document.getElementById('workout-list')
        const parent = list ? list.parentElement : null
        if (!parent) return null
        return { tag: parent.tagName, id: parent.id || null, className: parent.className || null, outer: parent.outerHTML ? parent.outerHTML.slice(0, 2000) : null, childCount: parent.childElementCount }
      })
      console.log('PARENT_INFO:', JSON.stringify(parentInfo, null, 2))
    } catch (e) { console.log('parent inspect failed', e) }
    try { await page.screenshot({ path: '/tmp/pwa_inspect_before.png', fullPage: true }) } catch (e) {}
    try { const html = await page.content(); await fs.promises.writeFile('/tmp/pwa_inspect_before.html', html) } catch (e) {}

    // if there is a .btn-done-round, click the first and then inspect that card
    let after = null
    try {
      const has = await page.$('.btn-done-round')
      if (has) {
        // get some info about the nearest card before
        const beforeCard = await page.evaluate(() => {
          const el = document.querySelector('.btn-done-round')
          const card = el ? el.closest('.card') : null
          return card ? { className: card.className, dataset: Object.assign({}, card.dataset), outer: card.outerHTML.slice(0,2000) } : null
        })
        console.log('CLICKING_BTN_DONE_ROUND')
        try { await page.click('.btn-done-round') } catch (e) { console.log('click btn-done-round failed', e) }
        await new Promise(r => setTimeout(r, 500))
        const afterCard = await page.evaluate(() => {
          const el = document.querySelector('.btn-done-round')
          const card = el ? el.closest('.card') : null
          return card ? { className: card.className, dataset: Object.assign({}, card.dataset), outer: card.outerHTML.slice(0,2000) } : null
        })
        after = { beforeCard, afterCard }
      } else {
        console.log('NO btn-done-round found')
      }
    } catch (e) { console.log('done-round click flow failed', e) }

    console.log('INSPECT_AFTER:', JSON.stringify(after, null, 2))
    try { await page.screenshot({ path: '/tmp/pwa_inspect_after.png', fullPage: true }) } catch (e) {}

    // also try to find Workout Complete by text and click it (no changes to app code)
    try {
      const found = await page.$x("//button[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'workout complete')]")
      console.log('WORKOUT_COMPLETE_BY_TEXT_COUNT:', found.length)
      if (found.length) {
        try { await found[0].click(); console.log('CLICKED_WORKOUT_COMPLETE_BY_TEXT') } catch (e) { console.log('click by text failed', e) }
        await new Promise(r => setTimeout(r, 800))
      }
    } catch (e) { console.log('xpath search failed', e) }

    // dump localStorage keys of interest
    try {
      const keys = await page.evaluate(() => {
        const names = ['homeworkouts_last_history_block', 'homeworkouts_last_history_block_generated', 'homeworkouts_history', 'homeworkouts_setup_temp']
        const out = {}
        for (const k of names) out[k] = localStorage.getItem(k)
        out._allKeys = Object.keys(localStorage)
        return out
      })
      console.log('LOCALSTORAGE_POST:', JSON.stringify(keys, null, 2))
    } catch (e) { console.log('localStorage read failed', e) }

    // Try calling the completion flow directly to simulate Workout Complete
    try {
      // simulate signed-in user
      await page.evaluate(() => {
        try { localStorage.setItem('homeworkouts_user_email', 'test@example.com') } catch (e) {}
        try { localStorage.setItem('homeworkouts_token', 'TEST_TOKEN') } catch (e) {}
        const emailEl = document.getElementById('user-email')
        if (emailEl) emailEl.textContent = 'test@example.com'
      })

      // enqueue a synthetic pending batch so flushAllPending has something to process
      await page.evaluate(() => {
        try {
          const sampleBatch = {
            email: localStorage.getItem('homeworkouts_user_email') || 'test@example.com',
            items: [
              { glideId: 'test-1', is_done: true, sets: [{ setNumber: 1, reps: '10', load: '' , done: true }] }
            ]
          }
          const arr = JSON.parse(localStorage.getItem('homeworkouts_pending_batches') || '[]')
          arr.push(sampleBatch)
          localStorage.setItem('homeworkouts_pending_batches', JSON.stringify(arr))
        } catch (e) { console.warn('enqueue synthetic batch failed', e) }
      })

      const completeResult = await page.evaluate(async () => {
        try {
          if (typeof window.showCompleteAndFlush === 'function') {
            await window.showCompleteAndFlush()
            return { called: true }
          }
          return { called: false, missing: typeof window.showCompleteAndFlush }
        } catch (e) { return { error: (e && e.message) || String(e) } }
      })
      console.log('SHOW_COMPLETE_RESULT:', JSON.stringify(completeResult, null, 2))
      await new Promise(r => setTimeout(r, 800))
      const afterKeys = await page.evaluate(() => {
        const names = ['homeworkouts_last_history_block', 'homeworkouts_last_history_block_generated', 'homeworkouts_history', 'homeworkouts_setup_temp', 'homeworkouts_pending_batches']
        const out = {}
        for (const k of names) out[k] = localStorage.getItem(k)
        out._allKeys = Object.keys(localStorage)
        return out
      })
      console.log('LOCALSTORAGE_AFTER_COMPLETE:', JSON.stringify(afterKeys, null, 2))
    } catch (e) { console.log('call complete failed', e) }

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
