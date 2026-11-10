'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {createManualRemit}=require('../functions/manual-remit');
const {config,plan,createRemitTransport,assertConfig}=require('../functions/remit-transport');
const {validate}=require('../functions/core');
const actor={role:'owner',uid:'owner'};
function order(){return {...validate({posId:'23456789',paymentDate:'2026-11-10',first:'TEST',last:'REMIT',email:'N/A',received:320,tip:10,tipRecipient:'Joyce',discount:20,items:[{kind:'editing',existingId:'RF23456A',amount:100,fileUrl:'https://example.invalid/main',noteFileUrl:'https://example.invalid/note'},{kind:'editing',existingId:'RF23456B',amount:200}]}),stagingTest:true,fixtureAcknowledgement:'FICTIONAL TEST ORDER',fixtureVersion:'ROCKETFIX-STAGING-FICTIONAL-V1',version:1,createdAt:'2026-11-10T00:00:00.000Z',updatedAt:'2026-11-10T00:00:00.000Z'};}
function fakeSheets(){
 const grid=new Map(),calls=[],row=n=>grid.get(n)||[],rules={3:['Fetched','Family','Solo','Couple','Manipulation','Restoration','Enhancement'],4:['NORMAL FILE','RUSH FILE','ADDITIONAL PAYMENT','REVISION PAYMENT','SELECT'],11:['Joyce','Renz','Select','Joy','Lerni']};
 let writeCount=0,uncertain=false,rejected=false;
 const values=n=>row(n).map(c=>c?.userEnteredValue?.numberValue??c?.userEnteredValue?.stringValue??c?.userEnteredValue?.formulaValue??'');
 const client={serviceAccountEmail:config.writerServiceAccount,request:async r=>{
  calls.push(r);
  if(r.method==='POST'){
   if(rejected)throw {response:{status:403}};
   writeCount++;
   for(const q of r.data.requests){const u=q.updateCells,n=u.start.rowIndex+1,c=u.start.columnIndex;const cells=[...row(n)];cells[c]={...(cells[c]||{}),...u.rows[0].values[0]};grid.set(n,cells);}
   if(uncertain)throw {code:'ETIMEDOUT'};return {data:{}};
  }
  if(r.url.includes('/values/')){
   const range=decodeURIComponent(r.url.split('/values/')[1]),m=range.match(/!([A-Z]+)(\d+):([A-Z]+)(\d+)/);let start=Number(m[2]),end=Number(m[4]),a=m[1]==='P'?15:0,b=m[3]==='R'?18:26;
   return {data:{values:Array.from({length:end-start+1},(_,i)=>values(start+i).slice(a,b))}};
  }
  if(r.params.ranges==='REMIT!A5:Z6')return {data:{properties:{timeZone:config.timeZone},sheets:[{properties:{title:'REMIT',sheetId:config.sheetId,gridProperties:{rowCount:config.lastRow}},merges:[{sheetId:config.sheetId,startRowIndex:0,endRowIndex:4,startColumnIndex:0,endColumnIndex:2}],protectedRanges:[],data:[{rowData:[{values:config.headers.map(s=>({userEnteredValue:{stringValue:s}}))},{values:[]}]}]}]}};
  const n=Number(r.params.ranges.match(/A(\d+)/)[1]),cells=[...row(n).slice(0,26)];for(const [c,allowed] of Object.entries(rules))cells[c]={...(cells[c]||{}),dataValidation:{strict:true,condition:{type:'ONE_OF_LIST',values:allowed.map(s=>({userEnteredValue:s}))}}};
  return {data:{sheets:[{data:[{rowData:[{values:cells}]}]}]}};
 }};
 return {grid,calls,client,values,get writes(){return writeCount;},set uncertain(v){uncertain=v;},set rejected(v){rejected=v;}};
}
function setup(){const db=memoryDb(),o=order(),sheet=fakeSheets();db.put('orders/'+o.posId,o);const transport=createRemitTransport({clientFactory:async()=>sheet.client}),api=createManualRemit(db,{transport});return {db,o,sheet,transport,api};}
async function mirror(s,index=0){const p=await s.api.preview({posId:s.o.posId,itemKey:s.o.items[index].itemKey},actor);return s.api.sync({posId:s.o.posId,itemKey:s.o.items[index].itemKey,expectedVersion:s.o.version,confirmationToken:p.confirmationToken},actor);}
test('editing-only REMIT plans preserve saved money, both file references and one tip; never write beyond Z',()=>{
 const o=order(),a=plan(o,o.items[0].itemKey),b=plan(o,o.items[1].itemKey);assert.equal(a.cells[6],o.items[0]._paid);assert.equal(a.cells[23],o.items[0]._paid);assert.equal(a.cells[24],o.items[0]._discount);assert.equal(a.cells[7],'https://example.invalid/main');assert.equal(a.cells[9],'https://example.invalid/note');assert.equal(a.cells[13],10);assert.equal(b.cells[13],0);assert.ok(Object.keys(a.cells).every(c=>Number(c)<=26&&![8,10].includes(Number(c))));
 assert.throws(()=>plan({...o,stagingTest:false},o.items[0].itemKey));assert.throws(()=>assertConfig({...config,spreadsheetId:'10W8zrKf9rX-BFH2VLDyj8dwNlVJDca2_yArN9eIyNwY'}));
});
test('manual create, repeat and versioned resync reuse exact row and preserve all payment records',async()=>{
 const s=setup(),original=structuredClone(s.db.data('orders/'+s.o.posId));s.sheet.grid.set(6,Array.from({length:48},(_,i)=>i===43?{userEnteredValue:{formulaValue:'=IF(B6="","","")'}}:undefined));
 let r=await mirror(s);assert.equal(r.status,'MIRRORED');assert.equal(r.row,6);assert.equal(s.sheet.writes,1);assert.deepEqual(s.db.data('orders/'+s.o.posId),original);
 r=await mirror(s);assert.equal(r.replayed,true);assert.equal(s.sheet.writes,1);
 s.o={...s.o,version:2,last:'REMIT UPDATED',updatedAt:'2026-11-10T01:00:00.000Z'};s.db.put('orders/'+s.o.posId,s.o);r=await mirror(s);assert.equal(r.row,6);assert.equal(s.sheet.writes,2);assert.equal(s.sheet.values(6)[2],'TEST REMIT UPDATED');assert.equal(s.sheet.values(6)[43],'=IF(B6="","","")');
 const second=await mirror(s,1);assert.equal(second.row,7);assert.equal(s.sheet.values(7)[12],0);assert.equal(s.sheet.values(7)[17],s.o.items[1].itemKey);
});
test('concurrent confirmed clicks and request replay issue only one Sheets write',async()=>{
 const s=setup(),p=await s.api.preview({posId:s.o.posId,itemKey:s.o.items[0].itemKey},actor),args={posId:s.o.posId,itemKey:s.o.items[0].itemKey,expectedVersion:1,confirmationToken:p.confirmationToken};
 await Promise.allSettled([s.api.sync(args,actor),s.api.sync(args,actor)]);assert.equal(s.sheet.writes,1);const replay=await s.api.sync(args,actor);assert.equal(replay.replayed,true);assert.equal(s.sheet.writes,1);
});
test('matching POS and item keys are adopted, duplicate keys and formula cells fail closed',async()=>{
 const s=setup(),p=plan(s.o,s.o.items[0].itemKey),cells=[];cells[15]={userEnteredValue:{stringValue:s.o.posId}};cells[16]={userEnteredValue:{stringValue:p.identity}};cells[17]={userEnteredValue:{stringValue:p.key}};s.sheet.grid.set(23,cells);
 assert.equal((await mirror(s)).row,23);assert.equal(s.sheet.writes,1);
 s.sheet.grid.set(24,structuredClone(s.sheet.grid.get(23)));await assert.rejects(s.transport.inspect(p),/DUPLICATE_REMIT/);
 const f=setup();f.sheet.grid.set(6,[{userEnteredValue:{formulaValue:'=SUM(A1:A2)'}}]);assert.equal((await f.api.preview({posId:f.o.posId,itemKey:f.o.items[0].itemKey},actor)).row,7);assert.equal(f.sheet.writes,0);
});
test('confirmed Sheets rejection leaves Firebase payment intact and uncertain acceptance must reconcile, never resend',async()=>{
 const s=setup(),before=structuredClone(s.o);s.sheet.rejected=true;assert.equal((await mirror(s)).status,'FAILED');assert.deepEqual(s.db.data('orders/'+s.o.posId),before);assert.equal(s.sheet.writes,0);
 const u=setup();u.sheet.uncertain=true;const result=await mirror(u);assert.equal(result.status,'REVIEW REQUIRED');assert.equal(u.sheet.writes,1);const preview=await u.api.preview({posId:u.o.posId,itemKey:u.o.items[0].itemKey},actor);assert.equal(preview.needsReconciliation,true);
 const reconciled=await u.api.reconcile({posId:u.o.posId,itemKey:u.o.items[0].itemKey},actor);assert.equal(reconciled.status,'MIRRORED');assert.equal(u.sheet.writes,1);assert.equal((await mirror(u)).replayed,true);assert.equal(u.sheet.writes,1);assert.deepEqual(u.db.data('orders/'+u.o.posId),u.o);
});
test('unauthorized roles and stale or cross-user confirmations cannot issue writes',async()=>{
 const s=setup(),args={posId:s.o.posId,itemKey:s.o.items[0].itemKey};for(const role of ['sales','editor','encoder','production'])await assert.rejects(s.api.preview(args,{role,uid:role}),/Owner or Admin/);
 const p=await s.api.preview(args,actor),request={...args,expectedVersion:1,confirmationToken:p.confirmationToken};await assert.rejects(s.api.sync(request,{role:'admin',uid:'other'}),/confirmation/);
 s.db.put('orders/'+s.o.posId,{...s.o,version:2});await assert.rejects(s.api.sync(request,actor),/Order changed/);assert.equal(s.sheet.writes,0);
});
test('uncertain empty outcomes never become safe retries and active writes cannot be reclaimed',async()=>{
 const db=memoryDb(),o=order();db.put('orders/'+o.posId,o);let calls=0;
 const api=createManualRemit(db,{transport:{inspect:async()=>({row:6,action:'CREATE',matches:false}),write:async()=>{calls++;throw Object.assign(Error('lost response'),{uncertain:true});}}}),args={posId:o.posId,itemKey:o.items[0].itemKey};
 const preview=await api.preview(args,actor);assert.equal((await api.sync({...args,expectedVersion:1,confirmationToken:preview.confirmationToken},actor)).status,'REVIEW REQUIRED');
 assert.equal((await api.reconcile(args,actor)).status,'REVIEW REQUIRED');assert.equal((await api.preview(args,actor)).needsReconciliation,true);assert.equal(calls,1);
 const [ledgerPath,l]=db.entries().find(([p])=>p.startsWith('remitSyncLedger/'));db.put(ledgerPath,{...l,state:'WRITING',startedAt:new Date().toISOString()});await assert.rejects(api.reconcile(args,actor),/STILL_IN_PROGRESS/);assert.equal(calls,1);
});
