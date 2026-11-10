'use strict';
const assert=require('node:assert/strict');
if(process.env.GCLOUD_PROJECT!=='demo-rocketfix-360'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local emulators only');
const {chromium}=require(process.env.RF_PLAYWRIGHT_MODULE||'playwright');
const admin=require('../functions/node_modules/firebase-admin');admin.initializeApp({projectId:'demo-rocketfix-360'});
const {getFirestore}=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'))('firebase-admin/firestore');const db=getFirestore(admin.app(),'rocketfix360database');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.RF_BROWSER_EXECUTABLE});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto('http://127.0.0.1:5050');await page.locator('#loginEmail').fill('sales@rocketfix.local');await page.locator('#loginPassword').fill('Rocketfix-Staging-2026!');await page.locator('#loginSubmit').click();await page.locator('#firebaseLogin').waitFor({state:'hidden'});
 // Exercise the deployed unchecked mode against demo backend; local builds otherwise force fixtures.
 await page.evaluate(()=>Object.defineProperty(window.firebasePOS,'fixtureMode',{get(){return document.getElementById('fixtureMode').checked;}}));
 await page.locator('[data-tab="new"]').click();await page.getByRole('button',{name:'＋ Start New',exact:true}).click();await page.locator('#fixtureMode').uncheck();
 await page.locator('#fullName').fill('Agreed Price Customer');await page.locator('#email').fill('customer@example.com');await page.locator('[data-name="amount"]').first().fill('375.50');await page.locator('#received').fill('375.50');const id=await page.locator('#posId').textContent();
 await page.locator('#saveButtonText').click();await page.waitForFunction(()=>document.getElementById('rfSubmitTitle').textContent==='PAYMENT SAVED ✓');
 const record=(await db.doc('orders/'+id).get()).data();assert.equal(record.stagingTest,false);assert.equal(record.received,375.5);assert.equal(record.paymentMode,'REAL_POS_V1');assert.equal(record.items.length,1);assert.equal(record.excess,0);
 const event=(await db.doc('notificationOutbox/'+id+'_VIBER').get()).data();assert.equal(event.stagingTest,false);assert.equal(event.realViberActivation,require('../functions/viber-policy.json').realAutomaticDeliveryActivatedAt);
 assert.deepEqual(errors,[]);console.log('PASS: browser Sales editing-only exact payment saved without fictional label or external Viber eligibility.');
 }finally{await browser.close();await admin.app().delete();}})().catch(e=>{console.error(e);process.exitCode=1;});
