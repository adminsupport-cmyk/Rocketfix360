'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.RF_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.RF_BROWSER_EXECUTABLE?{executablePath:process.env.RF_BROWSER_EXECUTABLE}:{})});
 try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:5050');
 const login=async role=>{await page.locator('#loginEmail').fill(role+'@rocketfix.local');await page.locator('#loginPassword').fill('Rocketfix-Staging-2026!');await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});};
 await login('owner');
 const stem=String(Math.floor(Math.random()*90000)+10000),letters=String.fromCharCode(65+Math.floor(Math.random()*26),65+Math.floor(Math.random()*26));
 const editIds=['RF'+stem+'A','RF'+stem+'B'],frameIds=[letters+'1B1',letters+'1B2'],saved=[];
 const field=(index,key)=>page.locator(`[data-item="${index}"][data-key="${key}"]`);
 for(const [n,kind] of ['editing','frame','combined'].entries()){
  await page.locator('[data-page="new"]').click();
  await page.locator('#first').fill('Staging '+kind);await page.locator('#last').fill('Fixture');await page.locator('#email').fill('browser@example.invalid');
  if(kind==='frame'){await page.locator('[data-remove="0"]').click();await page.locator('#addFrame').click();}
  if(kind!=='frame'){await field(0,'existingId').fill(editIds[kind==='combined'?1:0]);await field(0,'amount').fill('500');await field(0,'assignedTo').fill('fixture-editor');}
  if(kind==='combined')await page.locator('#addFrame').click();
  if(kind!=='editing'){
   const i=kind==='frame'?0:1;await field(i,'existingId').fill(frameIds[kind==='frame'?0:1]);await field(i,'shippingFee').fill('50');await page.locator('#area').selectOption('Luzon');
   if(kind==='frame'){await field(i,'addOnType').selectOption('Personalized Letter');await field(i,'addOnCommissionRecipient').selectOption('Renz Malenab');await field(i,'addOnMessage').fill('N/A');}
  }
  await page.locator('#discount').fill('25');await page.locator('#tip').fill('10');await page.locator('#tipRecipient').selectOption('Joyce');await page.locator('#received').fill('2000');
  const pos=await page.locator('#posId').inputValue();saved.push(pos);
  await page.locator('#saveBtn').click();await page.locator('#page-orders').waitFor({state:'visible'});await page.locator('#allOrders').getByText(pos,{exact:true}).waitFor();
  assert.equal(await page.locator('#allOrders').getByText(pos,{exact:true}).count(),1);
 }
 await page.locator('[data-page="editing"]').click();await page.locator('#editingList').getByText(editIds[0],{exact:true}).waitFor();
 await page.locator('[data-page="frames"]').click();await page.locator('#frameList').getByText(frameIds[0],{exact:true}).waitFor();
 await page.locator('[data-page="reports"]').click();await page.locator('#loadReports').click();await page.waitForFunction(()=>document.querySelector('#reportResult').textContent.includes('Letter Commission'));
 assert.match(await page.locator('#reportResult').innerText(),/Excess|Tips/);
 await page.locator('[data-page="notifications"]').click();await page.locator('#notificationId').fill(saved[0]);await page.locator('#checkNotification').click();await page.waitForFunction(()=>document.querySelector('#notificationResult').textContent.includes('SIMULATED'));
 await page.locator('#logout').click();await page.locator('#login').waitFor({state:'visible'});await login('editor');await page.locator('#editingList').getByText(editIds[0],{exact:true}).waitFor();assert.equal(await page.locator('[data-page="new"]').isVisible(),false);
 await page.locator('#logout').click();await page.locator('#login').waitFor({state:'visible'});await login('production');await page.locator('[data-page="frames"]').click();await page.locator('#frameList').getByText(frameIds[0],{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: browser employee login/roles; editing, framing and combined receipts; history, queues, earnings/reporting and simulated notifications. Sample POS IDs: '+saved.join(', '));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
