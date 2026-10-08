// Run: node tests/browser.cjs (requires Playwright; PLAYWRIGHT_MODULE can point to it).
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true,args:['--no-sandbox']});
 const context = await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page = await context.newPage(); const errors=[];
 page.on('pageerror', e=>errors.push(e.message));
 const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
 const out = process.env.SCREENSHOT_DIR || '/tmp/enkryptr-qa/screenshots'; fs.mkdirSync(out,{recursive:true});
 await page.goto(base,{waitUntil:'networkidle'});
 await page.screenshot({path:out+'/welcome-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'Open password generator'}).click();
 await page.waitForLoadState('networkidle');
 await page.getByRole('button',{name:'Generate password',exact:true}).click();
 let password = await page.locator('#output').inputValue();
 assert.equal(password.length,12); assert.match(password,/[A-Z]/); assert.match(password,/[a-z]/); assert.match(password,/[0-9]/); assert.match(password,/[~!@#$%^&*+=?<>]/);
 await page.locator('#len-range').fill('32');
 assert.equal(await page.locator('#len-val').innerText(),'32');
 await page.locator('#but').click(); assert.equal((await page.locator('#output').inputValue()).length,32);
 await page.locator('#copy').click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await page.locator('#output').inputValue());
 await page.getByText('Show',{exact:true}).first().click();
 assert.notEqual(await page.locator('.masked-pass').first().innerText(),'••••••••');
 await page.getByText('Hide',{exact:true}).click();
 assert.equal(await page.locator('.masked-pass').first().innerText(),'••••••••');
 for(let i=0;i<6;i++) await page.locator('#but').click();
 assert.equal(await page.locator('.history-item').count(),5);
 await page.locator('#clear-history-btn').click(); assert.equal(await page.locator('.history-item').count(),0);
 for(const id of ['uc','lc','num','spec']) await page.locator('#'+id).uncheck();
 await page.locator('#but').click(); await page.getByText('Select options!',{exact:true}).waitFor();
 await page.locator('#lc').check(); await page.locator('#but').click();
 assert.match(await page.locator('#output').inputValue(),/^[a-z]{32}$/);
 for(const id of ['uc','num','spec']) await page.locator('#'+id).check();
 await page.locator('#len-range').fill('12'); await page.locator('#but').click();
 await page.waitForFunction(()=>!document.querySelector('.toast'));
 await page.screenshot({path:out+'/workspace-desktop.png',fullPage:true});
 await page.locator('#vault-tab-btn').click(); assert.equal(await page.locator('#view-vault').isVisible(),true);
 assert.equal(await page.locator('#vault-login-msg').isVisible(),true);
 await page.screenshot({path:out+'/vault-desktop.png',fullPage:true});
 await page.locator('#theme-toggle').click(); assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark-mode')),true);
 await page.reload({waitUntil:'networkidle'}); assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark-mode')),true);
 await page.screenshot({path:out+'/workspace-dark.png',fullPage:true});
 await page.locator('#theme-toggle').click();
 for(const width of [320,390,768,1440]) {
  await page.setViewportSize({width,height:900});
  for(const route of ['/index.html','/app.html']) {
   await page.goto(base+route,{waitUntil:'networkidle'});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} overflows at ${width}`);
   if(width===390) await page.screenshot({path:out+(route.includes('app')?'/workspace-mobile.png':'/welcome-mobile.png'),fullPage:true});
  }
 }
 await page.evaluate(()=>document.querySelector('#save-modal').showModal());
 assert.equal(await page.locator('#save-modal').isVisible(),true);
 await page.locator('#modal-cancel').click(); assert.equal(await page.locator('#save-modal').isVisible(),false);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('#but').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 assert.deepEqual(errors,[]);
 console.log('PASS: generation, required character sets, length, clipboard, masked history, five-entry limit, clearing, validation, vault navigation, theme persistence, dialog cancellation, reduced motion, 320/390/768/1440px layouts; no uncaught JavaScript errors.');
 console.log('Screenshots: '+out);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
