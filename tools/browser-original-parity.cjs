'use strict';
// Real local-emulator browser test. The offline original is a visual reference
// only: no Apps Script dispatcher, live data, or production network allowed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.RF_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.runtime/parity');fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(path.join(root,'reference/Original_Index.html'));
const server=http.createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(original);});
(async()=>{
 await new Promise(resolve=>server.listen(5051,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.RF_BROWSER_EXECUTABLE});
 try{
 const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(u.hostname)||u.protocol==='data:')return route.continue();
  // The unchanged original logo is the sole external image, never Apps Script.
  if(u.hostname==='res.cloudinary.com'&&u.pathname.endsWith('/LOGO.png'))return route.continue();
  return route.abort();
 });
 await page.goto('http://127.0.0.1:5050');
 await page.locator('#firebaseLoginForm').waitFor({state:'visible'});
 await page.locator('#loginEmail').fill('owner@rocketfix.local');await page.locator('#loginPassword').fill('Rocketfix-Staging-2026!');await page.locator('#loginSubmit').click();await page.locator('#firebaseLogin').waitFor({state:'hidden'});
 let interrupted=false,saveRequests=0;
 await page.route('**/saveOrder',async route=>{saveRequests++;if(!interrupted){interrupted=true;await route.fetch();await route.abort('failed');return;}await route.continue();});
 await page.locator('[data-tab="new"]').click();
 const saved=[];
 for(const kind of ['editing','frame','combined']){
  await page.getByRole('button',{name:'＋ Start New',exact:true}).click();
  await page.locator('#fullName').fill('Sample '+kind);await page.locator('#email').fill('browser@example.invalid');await page.locator('#phone').fill('09123456789');
  if(kind==='frame'){await page.locator('.service .text-button').click();await page.locator('#modeFrame').click();}
  if(kind!=='frame')await page.locator('[data-name="amount"]').first().fill('500');
  if(kind==='combined')await page.locator('#modeFrame').click();
  if(kind!=='editing'){
   await page.locator('#shippingArea').selectOption('Luzon');await page.locator('#receiverName').fill('Sample Receiver');await page.locator('[data-name="shippingFee"]').fill('50');
   if(kind==='frame'){
    await page.locator('.rf-addon-add').click();await page.locator('[data-name="addOnType"]').selectOption('Personalized Letter');await page.locator('[data-name="addOnCommissionRecipient"]').selectOption('Renz Malenab');await page.locator('[data-name="addOnMessage"]').fill('N/A');
   }
  }
  await page.locator('#tipRecipient').selectOption('Joyce');await page.locator('#tip').fill('10');await page.locator('#received').fill('2000');
  const id=await page.locator('#posId').textContent();saved.push(id);
  await page.locator('#saveButtonText').click();await page.waitForFunction(()=>document.getElementById('rfSubmitTitle').textContent==='TEST ORDER SAVED ✓');
  await page.locator('.rf-submit-close').click();await page.locator('[data-tab="history"]').click();await page.locator('#historyRows').getByText(id,{exact:true}).waitFor();
  assert.equal(await page.locator('#historyRows').getByText(id,{exact:true}).count(),1);
  await page.locator('#historyRows tr').filter({hasText:id}).getByRole('button',{name:'View receipt',exact:true}).click();await page.locator('#rfConfirmedOverlay').waitFor({state:'visible'});await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.locator('[data-tab="new"]').click();
 }
 assert.equal(saveRequests,3,'Lost save response must be reconciled by reads, never a second payment request');
 // Confirm existing edit uses version, same POS and original field groups.
 await page.locator('[data-tab="history"]').click();await page.locator('#historyRows tr').filter({hasText:saved[0]}).getByRole('button',{name:'Edit transaction',exact:true}).click();
 assert.equal(await page.locator('#posId').textContent(),saved[0]);assert.equal(await page.locator('#phone').inputValue(),'09123456789');
 await page.locator('#remarks').fill('Edited sample receipt');await page.locator('#saveButtonText').click();await page.waitForFunction(()=>document.getElementById('rfSubmitTitle').textContent==='TEST ORDER SAVED ✓');await page.locator('.rf-submit-close').click();
 await page.locator('[data-tab="dashboard"]').click();await page.locator('[data-open="daily"]').click();assert.match(await page.locator('#statReceived').textContent(),/₱/);
 // Reference snapshots use neutral empty form values, never call a live backend.
 const ref=await context.newPage();await ref.goto('http://127.0.0.1:5051');
 await ref.evaluate(()=>{document.getElementById('rfDeviceGate').hidden=true;const label=document.getElementById('rfDeviceUser');label.hidden=false;label.textContent='Staff: Staging owner';});
 for(const [label,width,height] of [['desktop',1440,1000],['ipad-portrait',810,1080],['ipad-landscape',1080,810]]){
  await page.setViewportSize({width,height});await ref.setViewportSize({width,height});
  await page.locator('[data-tab="new"]').click();await page.getByRole('button',{name:'＋ Start New',exact:true}).click();
  for(const target of [ref,page])await target.evaluate(()=>{
   document.getElementById('posId').textContent='12345678';document.querySelector('[data-name="existingId"]').value='RF12345A';
   document.getElementById('paymentDate').value='2026-11-10';document.getElementById('summaryDate').textContent='2026-11-10';
  });
  await ref.screenshot({path:path.join(out,label+'-original.png'),fullPage:true});await page.screenshot({path:path.join(out,label+'-firebase.png'),fullPage:true});
  const metrics=async p=>p.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,panels:[...document.querySelectorAll('#new .panel')].map(x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}),fields:[...document.querySelectorAll('#new input,#new select,#new textarea')].map(x=>x.id||x.dataset.name)}));
  const before=await metrics(ref),after=await metrics(page);assert.equal(after.background,'rgb(9, 12, 16)');assert.deepEqual(after.fields,before.fields);assert.ok(after.panels.every(panel=>panel.x>=0&&panel.width<=width),'Modern POS panels fit the viewport');
  for(const target of [ref,page])await target.evaluate(()=>{
   addService('frame');const id=services.find(x=>x.kind==='frame').uid;services.find(x=>x.kind==='frame').existingId='AB1C2';renderServices();rfAddonToggle(id);
   document.querySelector('[data-name="addOnType"]').value='Personalized Letter';rfAddonChanged(document.querySelector('[data-name="addOnType"]'));
  });
  await ref.screenshot({path:path.join(out,label+'-frame-original.png'),fullPage:true});await page.screenshot({path:path.join(out,label+'-frame-firebase.png'),fullPage:true});
  const frameBefore=await metrics(ref),frameAfter=await metrics(page);assert.deepEqual(frameAfter.fields,frameBefore.fields);assert.ok(frameAfter.panels.every(panel=>panel.x>=0&&panel.width<=width),'Modern frame panels fit the viewport');
  await ref.evaluate(()=>resetForm());
 }
 assert.deepEqual(errors,[]);console.log('PASS: original Admin POS Owner login; editing/frame/combined sample receipts; versioned edit, history, receipt modal and daily report; desktop/iPad field completeness, responsive panel bounds and dark colors. Screenshots: '+out);
 }finally{await browser.close();server.close();}
})().catch(e=>{server.close();console.error(e);process.exitCode=1;});
