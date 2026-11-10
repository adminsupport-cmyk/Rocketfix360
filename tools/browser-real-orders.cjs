'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
if(process.env.GCLOUD_PROJECT!=='demo-rocketfix-360'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Demo emulators only');
const {chromium}=require(process.env.RF_PLAYWRIGHT_MODULE||'playwright'),admin=require('../functions/node_modules/firebase-admin');admin.initializeApp({projectId:'demo-rocketfix-360'});
const {getFirestore}=require('node:module').createRequire(path.resolve(__dirname,'../functions/package.json'))('firebase-admin/firestore'),db=getFirestore(admin.app(),'rocketfix360database');
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(require('./restore-original-ui.cjs').generate({hosted:true}));}const file=path.join(__dirname,'../public',new URL(req.url,'http://localhost').pathname);if(!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/plain');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(resolve=>server.listen(5052,'127.0.0.1',resolve));await db.doc('stagingConfig/pricing').set({...require('../functions/real-pricing-source.json'),version:1});const browser=await chromium.launch({headless:true,executablePath:process.env.RF_BROWSER_EXECUTABLE});try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER:',e.message);});page.on('console',m=>{if(m.type()==='error')console.error('PAGE:',m.text());});
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(url.hostname))return route.abort();return route.continue();});
 await page.goto('http://127.0.0.1:5052');assert.equal(await page.locator('#fixtureMode').count(),0);
 await page.locator('#loginEmail').fill('owner@rocketfix.local');await page.locator('#loginPassword').fill('Rocketfix-Staging-2026!');await page.locator('#loginSubmit').click();await page.locator('#firebaseLogin').waitFor({state:'hidden'}).catch(async e=>{console.error(await page.locator('#loginError').textContent());throw e;});
 await page.evaluate(()=>{Object.defineProperty(window.firebasePOS,'fixtureMode',{get(){return false;}});rfLoadFramePricing();});await page.waitForFunction(()=>rfFramePricing?.sourceVerified===true);
 for(const kind of ['frame','combined']){
 await page.locator('[data-tab="'+(kind==='frame'?'frameDatabase':'editingDatabase')+'"]').click();await page.getByRole('button',{name:kind==='frame'?'Add frame order':'Add editing order',exact:true}).click();await page.locator('#fullName').fill('Emulator '+kind+' workflow');await page.locator('#email').fill('N/A');
 if(kind==='combined'){await page.locator('[data-name="amount"]').first().fill('500');await page.locator('#modeFrame').click();}
 await page.locator('#shippingArea').selectOption('Luzon');await page.locator('#receiverName').fill('Local Receiver');
 if(kind==='frame'){await page.locator('.rf-addon-add').click();await page.locator('[data-name="addOnType"]').selectOption('Personalized Letter');await page.locator('[data-name="addOnCommissionRecipient"]').selectOption('Renz Malenab');await page.locator('[data-name="addOnMessage"]').fill('N/A');}
 await page.locator('#discount').fill('49');await page.locator('#tipRecipient').selectOption('Joyce');await page.locator('#tip').fill('10');await page.locator('#received').fill('2000');
 const id=await page.locator('#posId').textContent();await page.locator('#saveButtonText').click();await page.waitForFunction(()=>document.getElementById('rfSubmitOverlay').classList.contains('on')&&document.getElementById('rfSubmitTitle').textContent==='PAYMENT SAVED ✓');
 const order=(await db.doc('orders/'+id).get()).data();assert.equal(order.paymentMode,'REAL_POS_V1');assert.equal(order.stagingTest,false);assert.equal(order.pricingStatus,'SOURCE_VERIFIED');assert.equal(order.shippingFee,220);assert.equal(order.due,kind==='frame'?1180:1480);assert.equal(order.excess,kind==='frame'?820:520);
 assert.equal((await db.collection('notificationOutbox').where('posId','==',id).get()).size,1);
 if(kind==='frame')assert.equal((await db.doc('earnings/'+encodeURIComponent('LETTER:'+order.items[0].existingId)).get()).data().amount,50);
 const centered=await page.locator('#rfSubmitOverlay').evaluate(el=>{const r=el.getBoundingClientRect();return r.width===innerWidth&&r.height===innerHeight&&getComputedStyle(el).alignItems==='center'&&getComputedStyle(el).justifyContent==='center';});assert.equal(centered,true);
 await page.locator('.rf-submit-close').click();await page.locator('[data-tab="frameDatabase"]').click();const row=page.locator('#frameDbRows tr').filter({hasText:id});await row.getByRole('button',{name:'Mirror to Orders',exact:true}).waitFor();
 if(kind==='frame'){
  page.on('dialog',dialog=>dialog.accept(dialog.message().startsWith('Type POS')?id:'Local duplicate entry test'));
  await row.getByRole('button',{name:'Delete remittance',exact:true}).click();
  await page.getByText('Remittance voided · POS '+id,{exact:true}).waitFor();
  assert.equal((await db.doc('orders/'+id).get()).data().status,'VOIDED');
  await page.locator('.rf-submit-close').click();
 }
 }
 await page.locator('nav [data-tab="settings"]').click();await page.locator('[data-settings="framePricing"]').click();await page.waitForFunction(()=>document.querySelector('[data-rate="Luzon|Small"]')?.value==='220');
 const out=path.resolve(__dirname,'../.runtime/real-orders');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'verified-pricing.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: hosted UI has no fictional switch; real frame and combined submission, source pricing/freight, discounts, tips, Excess, commission, one outbox event and Orders mirror action (local emulators; no external writes).');
 }finally{await browser.close();server.close();await admin.app().delete();}})().catch(e=>{console.error(e);process.exitCode=1;});
