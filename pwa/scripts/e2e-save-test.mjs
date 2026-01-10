import puppeteer from 'puppeteer';
(async ()=>{
  const url = 'http://localhost:8000'
  const browser = await puppeteer.launch({args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  await page.goto(url, {waitUntil: 'networkidle2'});
  // Ensure Setup visible
  await page.waitForSelector('#view-setup', {visible:true, timeout:3000}).catch(()=>{});
  // Change some fields
  await page.select('#setup-program-select', 'Strength');
  await page.select('#setup-duration-select', '30');
  await page.$eval('#setup-sets', el=>el.value='3');
  // Click a equipment checkbox (Kettlebell)
  await page.click('#setup-equip-group input[value="Kettlebell"]');
  // Click Save
  await page.click('#btn-save');
  // Wait for saved indicator or generation status
  await new Promise(r=>setTimeout(r,1000));
  const saved = await page.$eval('#setup-saved-indicator', el => el.textContent || '');
  const status = await page.$eval('#setup-status', el => el.textContent || '');
  const globalStatus = await page.$eval('#status', el => el.textContent || '');
  // Wait for workouts view and list
  await page.waitForSelector('#view-workouts', {visible:true, timeout:3000}).catch(()=>{});
  const workoutText = await page.$eval('#workout-list', el => el.innerText || '');
  console.log('SAVED:', saved);
  console.log('SETUP-STATUS:', status);
  console.log('GLOBAL-STATUS:', globalStatus);
  console.log('WORKOUT-LIST:', workoutText.substring(0,200));
  await browser.close();
})();
