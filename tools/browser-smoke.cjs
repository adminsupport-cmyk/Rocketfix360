'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.RF_PLAYWRIGHT_MODULE||'/workspace/rocketfix-toolchain/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5050');await page.waitForSelector('#items .line-item',{state:'attached'});
 assert.equal(await page.locator('#login').isVisible(),true);assert.match(await page.locator('#posId').inputValue(),/^\d{8}$/);
 // Rendering-only checks: reveal the form without impersonating authentication.
 // These do not substitute for authenticated emulator integration tests.
 await page.evaluate(()=>{document.getElementById('login').hidden=true;document.getElementById('workspace').hidden=false;document.querySelectorAll('.page').forEach(e=>e.hidden=e.id!=='page-new');});
 await page.locator('#addFrame').click();assert.equal(await page.locator('#items .line-item').count(),2);
 assert.equal(await page.locator('[data-item="1"][data-key="size"]').inputValue(),'10"x13" - Small');
 await page.locator('[data-item="1"][data-key="shippingFee"]').fill('50');
 await page.locator('[data-item="1"][data-key="addOnType"]').selectOption('Personalized Letter');
 assert.equal(await page.locator('[data-item="1"][data-key="shippingFee"]').inputValue(),'50');
 await page.locator('[data-item="1"][data-key="addOnFont"]').selectOption('Cursive');
 await page.locator('[data-item="1"][data-key="addOnMessage"]').fill('N/A');
 assert.match(await page.locator('#totals').innerText(),/999.00/);
 const ids=await page.locator('[id]').evaluateAll(es=>es.map(e=>e.id));assert.equal(new Set(ids).size,ids.length,'duplicate DOM IDs');assert.deepEqual(errors,[]);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/rocketfix-staging-form.png',fullPage:true});
 await browser.close();console.log('PASS: compiled login and staging form render, frame defaults, letter rerender, totals, unique DOM IDs, no uncaught browser errors. Authentication not exercised.');
})().catch(e=>{console.error(e);process.exitCode=1;});
