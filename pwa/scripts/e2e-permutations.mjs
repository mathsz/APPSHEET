import puppeteer from 'puppeteer';
import fs from 'fs';
(async ()=>{
  const url = process.env.PWA_URL || 'http://localhost:8000';
  const browser = await puppeteer.launch({args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();

  const equipments = ['TRX','Dumbbell','Kettlebell'];
  const programs = ['Strength','HIIT'];
  const durations = ['10','20','30'];
  const results = [];

  for (const equipment of equipments){
    for (const program of programs){
      for (const duration of durations){
        try{
          await page.goto(url, {waitUntil: 'networkidle2'});
          await page.waitForSelector('#view-setup', {visible:true, timeout:3000}).catch(()=>{});
          // set program, duration, sets
          await page.select('#setup-program-select', program).catch(()=>{});
          await page.select('#setup-duration-select', duration).catch(()=>{});
          await page.$eval('#setup-sets', (el, val)=>el.value = val, '3').catch(()=>{});
          // uncheck all equipment first
          await page.$$eval('#setup-equip-group input[type=checkbox]', els=>els.forEach(e=>{ try{ e.checked=false; }catch(e){} } )).catch(()=>{});
          // click desired equipment
          const selector = `#setup-equip-group input[value="${equipment}"]`;
          await page.click(selector).catch(()=>{});
          // Click Save
          await page.click('#btn-save').catch(()=>{});
          // small wait for generation
          await new Promise(r=>setTimeout(r,1200));
          const saved = await page.$eval('#setup-saved-indicator', el => el.textContent || '').catch(()=>'');
          const status = await page.$eval('#setup-status', el => el.textContent || '').catch(()=>'');
          const globalStatus = await page.$eval('#status', el => el.textContent || '').catch(()=>'');
          await page.waitForSelector('#view-workouts', {visible:true, timeout:3000}).catch(()=>{});
          const workoutText = await page.$eval('#workout-list', el => el.innerText || '').catch(()=>'');
          const firstLine = workoutText.split('\n').slice(0,3).join(' | ');
          const count = workoutText.split('\n').filter(l=>l.trim().length>0).length;
          const entry = {equipment, program, duration, saved, status, globalStatus, count, sample: firstLine};
          console.log(JSON.stringify(entry));
          results.push(entry);
        }catch(err){
          const entry = {equipment, program, duration, error: String(err)};
          console.log(JSON.stringify(entry));
          results.push(entry);
        }
      }
    }
  }

  await browser.close();
  fs.writeFileSync('pwa/scripts/e2e-permutations-output.json', JSON.stringify(results, null, 2));
  console.log('Wrote pwa/scripts/e2e-permutations-output.json');
})();
