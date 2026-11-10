'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../functions/core'),{applyRecordEdit}=require('../functions/record-edits'),{dashboardTotals}=require('../functions/dashboard'),{mirrorPlan,processMirror,digest}=require('../functions/sheets-mirror'),{createSheetsTransport}=require('../functions/sheets-transport'),{memoryDb}=require('./helpers/memory-db.cjs');
const sample=()=>({...validate({posId:'12345678',paymentDate:'2026-11-10',first:'Sample',last:'Customer',email:'sample@example.invalid',phone:'09123456789',received:2000,tip:10,tipRecipient:'Joyce',shippingFee:50,shipping:{ship:'LBC',area:'Luzon',receiverName:'Other Receiver',contactPhone:'09999999999'},items:[{kind:'editing',existingId:'RF12345A',amount:500,fileType:'NORMAL FILE',assignedTo:'editor-a',frameOrderId:'AB1C2'},{kind:'frame',existingId:'AB1C2',amount:799,size:'10"x13" - Small',shippingFee:50}]}),version:1,status:'SYNCED',createdAt:'2026-11-10T02:00:00.000Z',updatedAt:'2026-11-10T02:00:00.000Z'});
const actor={role:'owner',uid:'owner-a'};
const header=Array(27).fill('');header[15]='POS Transaction ID';header[16]='POS Editing Order ID';header[17]='POS Item Key';
const cfg={environment:'test',schemaVerified:true,workbooks:{master:'MASTER_TEST',frames:'FRAME_TEST'},writerServiceAccount:'writer@test.invalid',timeZone:'Asia/Manila',headerFingerprints:{'master:REMIT':digest([header])},schemas:{'master:REMIT':{headerRange:'REMIT!A5:AA5',nextRow:6}}};
const policy={testWritesAuthorized:true,liveMirroringAuthorized:false,approvedTestWorkbookIds:['MASTER_TEST','FRAME_TEST']};
function mirrorFixture(){const db=memoryDb(),o=sample(),ref=db.doc('integrationOutbox/12345678_SHEETS_1');db.put('orders/'+o.posId,o);db.put('stagingConfig/sheetsMirror',cfg);db.put(ref.path,{status:'QUEUED',manualRequested:true,attempts:0,posId:o.posId,snapshot:o});return {db,o,ref};}
test('structured record edits preserve payments, allocations, tips, Excess and identifiers',()=>{
 const old=sample(),next=applyRecordEdit(old,{first:'Corrected',shipping:{receiverName:'Correct Recipient'},items:[{itemKey:old.items[0].itemKey,status:'Finalizing',fileUrl:'https://drive.google.com/file/d/example/view'}]},actor);
 for(const key of ['received','due','editPaid','framePaid','tip','excess','discount','posId'])assert.equal(next[key],old[key]);assert.equal(next.items[0].existingId,old.items[0].existingId);assert.equal(next.items[0]._paid,old.items[0]._paid);assert.equal(next.first,'Corrected');assert.equal(next.items[0].status,'Finalizing');
 assert.throws(()=>applyRecordEdit(old,{received:1},actor),/Unsupported/);assert.throws(()=>applyRecordEdit(old,{items:[{itemKey:old.items[0].itemKey,amount:1}]},actor),/Unsupported/);
});
test('record edit roles protect cross-role status, assignment and customer data',()=>{
 const o=sample(),edit=o.items[0].itemKey,frame=o.items[1].itemKey;
 assert.throws(()=>applyRecordEdit(o,{items:[{itemKey:frame,status:'PRINTED'}]},{role:'editor',uid:'editor-a'}),/Not assigned/);
 assert.throws(()=>applyRecordEdit(o,{items:[{itemKey:edit,status:'Delivered'}]},{role:'editor',uid:'other'}),/Not assigned/);
 assert.throws(()=>applyRecordEdit(o,{items:[{itemKey:edit,status:'Delivered'}]},{role:'sales',uid:'s'}),/operational/);
 assert.throws(()=>applyRecordEdit(o,{first:'X'},{role:'production',uid:'p'}),/financial/);
 assert.equal(applyRecordEdit(o,{items:[{itemKey:edit,status:'Delivered'}]},{role:'editor',uid:'editor-a'}).items[0].status,'Delivered');
});
test('dashboard uses payment date, excludes voided sales, includes late letters and counts pending work',()=>{
 const o=sample(),d=dashboardTotals([o,{...o,voidedAt:'now'}],[{paymentDate:'2026-11-10'}],'2026-11-10');assert.equal(d.salesToday,o.editPaid+o.framePaid+200);assert.equal(d.tipsToday,10);assert.equal(d.excessToday,o.excess);assert.equal(d.newOrdersToday,1);assert.equal(d.pendingEditing,1);assert.equal(d.pendingFrames,1);
});
test('legacy sparse row plans preserve original IDs, single tip, receiver, dates and protected gaps',()=>{
 const o=sample(),p=mirrorPlan(o),remit=p.find(x=>x.tab==='REMIT'),frame=p.find(x=>x.tab==='Orders');assert.equal(remit.cells[17],'RF12345A');assert.equal(remit.cells[18],'12345678|editing|RF12345A');assert.equal(remit.cells[13],10);assert.equal(remit.cells[7],undefined);assert.equal(frame.cells[8],'Other');assert.equal(frame.cells[9],'Receiver');assert.equal(frame.cells[20],undefined);assert.equal(frame.cells[39],o.posId);assert.equal(remit.cells[1],46336);assert.ok(frame.newOnly[2]>46336);
 o.items[0].fileType='REVISION PAYMENT';assert.ok(!mirrorPlan(o).some(x=>x.tab==='Tracking'),'Tracking source skips non-Normal/Rush rows');
});
test('disabled mirror policy blocks network and credential lookup before delivery',async()=>{
 const {db,ref}=mirrorFixture();let calls=0;await processMirror(db,ref,{upsert:async()=>{calls++;}});assert.equal(calls,0);assert.equal(db.data(ref.path).status,'BLOCKED');
});
test('mirror processing claims once, logs attempts, and does not change the financial receipt',async()=>{
 const {db,ref,o}=mirrorFixture();let calls=0;const transport={upsert:async p=>{calls++;assert.equal(db.data(ref.path).status,'PROCESSING');return {tab:p.tab,row:7};}};
 await Promise.all([processMirror(db,ref,transport,{integrationPolicy:policy}),processMirror(db,ref,transport,{integrationPolicy:policy})]);assert.equal(calls,2);assert.equal(db.data(ref.path).status,'SYNCED');assert.deepEqual(db.data('orders/'+o.posId),o);await processMirror(db,ref,transport,{integrationPolicy:policy});assert.equal(calls,2);
});
test('Sheets failures retain the payment; uncertain results never auto-replay or expose raw errors',async()=>{
 for(const confirmedNoWrite of [true,false]){const {db,ref,o}=mirrorFixture();let calls=0;const adapter={upsert:async()=>{calls++;throw Object.assign(Error('private provider response'),{confirmedNoWrite});}};await processMirror(db,ref,adapter,{integrationPolicy:policy});assert.equal(db.data(ref.path).status,confirmedNoWrite?'FAILED':'REVIEW');assert.deepEqual(db.data('orders/'+o.posId),o);await processMirror(db,ref,adapter,{integrationPolicy:policy});assert.equal(calls,1);assert.ok(!JSON.stringify(db.entries()).includes('private provider response'));}
});
test('Sheets transport reuses reserved rows across events and refuses formula/historical cells',async()=>{
 const o=sample(),plan=mirrorPlan(o).find(x=>x.tab==='REMIT'),db=memoryDb();let stored=[],writes=0;
 const api={serviceAccountEmail:cfg.writerServiceAccount,request:async request=>{
  if(request.url.includes('/values:batchUpdate')){writes++;stored=[];for(const d of request.data.data){const col=d.range.match(/!([A-Z]+)/)[1];let n=0;for(const c of col)n=n*26+c.charCodeAt(0)-64;stored[n-1]=d.values[0][0];}return {data:{}};}
  if(request.url.endsWith(':batchUpdate'))return {data:{}};
  if(!request.url.includes('/values/'))return {data:{properties:{timeZone:'Asia/Manila'},sheets:[{properties:{title:'REMIT',sheetId:1},protectedRanges:[]}]}};
  const range=decodeURIComponent(request.url.split('/values/')[1]);return {data:{values:range===cfg.schemas['master:REMIT'].headerRange?[header]:range.endsWith('!R6')?[[stored[17]]]:stored.length?[stored]:[]}};
 }};
 const adapter=createSheetsTransport(db,{integrationPolicy:policy,clientFactory:async()=>api});await adapter.upsert(plan,cfg);await adapter.upsert(plan,cfg);assert.equal(writes,1);assert.equal(db.data('mirrorMappings/'+digest(['MASTER_TEST','REMIT',plan.key])).row,6);
 const next={...plan,version:2};stored[5]='=SUM(A1:A2)';await assert.rejects(adapter.upsert(next,cfg),/CONFIRMED_NO_WRITE/);assert.equal(writes,1);
});

test('unrequested payment intents never mirror automatically and editing uses REMIT only',async()=>{
 const {db,ref,o}=mirrorFixture();db.put(ref.path,{...db.data(ref.path),manualRequested:false});
 await processMirror(db,ref,{upsert:async()=>assert.fail('No automatic Sheets writes')},{integrationPolicy:policy});
 assert.equal(db.data(ref.path).status,'NOT_REQUESTED');assert.deepEqual(db.data('orders/'+o.posId),o);
 assert.deepEqual(mirrorPlan(o).filter(x=>x.destination==='master').map(x=>x.tab),['REMIT']);
});
