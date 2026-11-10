'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cfg,assertLiveConfig,livePlan,createLiveRemit}=require('../functions/live-remit');
const {createRemitTransport,assertConfig}=require('../functions/remit-transport'),{validate}=require('../functions/core'),{memoryDb}=require('./helpers/memory-db.cjs');
function order(){return {...validate({posId:'54321098',paymentDate:'2026-11-11',first:'Customer',email:'N/A',method:'Cash',received:100,items:[{kind:'editing',existingId:'RF54321A',amount:100}]}),environment:'staging',status:'SYNCED',stagingTest:false,paymentMode:'AGREED_EDITING_V1',fixtureVersion:null,fixtureAcknowledgement:null,version:1,createdAt:'2026-11-11T00:00:00.000Z',updatedAt:'2026-11-11T00:00:00.000Z'};}
function sheets(){const grid=new Map(),writes=[];const scalar=c=>c?.userEnteredValue?.stringValue??c?.userEnteredValue?.numberValue??c?.userEnteredValue?.formulaValue??'';
 const set=(n,c,v)=>{const row=grid.get(n)||[];row[c-1]={userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v}};grid.set(n,row);};set(10,1,46200);set(10,3,'Existing last order');set(11,12,'Select');
 const client={request:async r=>{
 if(r.method==='POST'){writes.push(r);for(const q of r.data.requests){const u=q.updateCells,row=grid.get(u.start.rowIndex+1)||[];row[u.start.columnIndex]={...(row[u.start.columnIndex]||{}),...u.rows[0].values[0]};grid.set(u.start.rowIndex+1,row);}return {data:{}};}
 if(r.url.includes('/values/')){const range=decodeURIComponent(r.url.split('/values/')[1]),m=range.match(/!([A-Z]+)(\d+):([A-Z]+)(\d+)/),a=m[1]==='P'?15:0,b=m[3]==='R'?18:m[3]==='C'?3:26;return {data:{values:Array.from({length:Number(m[4])-Number(m[2])+1},(_,i)=>(grid.get(Number(m[2])+i)||[]).slice(a,b).map(scalar))}};}
 if(r.params.ranges==='REMIT!A5:Z6')return {data:{properties:{timeZone:cfg.timeZone},sheets:[{properties:{sheetId:cfg.sheetId,title:'REMIT',gridProperties:{rowCount:cfg.lastRow}},data:[{rowData:[{values:cfg.headers.map(s=>({userEnteredValue:{stringValue:s}}))}]}]}]}};
 const row=Number(r.params.ranges.match(/!A(\d+)/)[1]);return {data:{sheets:[{data:[{rowData:[{values:grid.get(row)||[]}]}]}]}};
 }};return {client,grid,writes,set};}
test('live REMIT authorization pins the one approved destination and excludes fictional/unconfirmed/frame orders',()=>{
 assert.equal(assertLiveConfig(cfg),cfg);assert.throws(()=>assertConfig(cfg),/VERIFIED_TEST_REMIT_REQUIRED/);
 for(const patch of [{spreadsheetId:'different'},{sheetId:1},{productionWritesEnabled:false},{authorization:''},{tab:'Tracking'}])assert.throws(()=>assertLiveConfig({...cfg,...patch}));
 const o=order();assert.equal(livePlan(o,o.items[0].itemKey).cells[16],o.posId);
 for(const patch of [{stagingTest:true},{status:'PENDING'},{environment:'production'},{received:101},{items:[{...o.items[0],kind:'frame'}]}])assert.throws(()=>livePlan({...o,...patch},o.items[0].itemKey));
});
test('live REMIT chooses next row after last order, not earlier holes; preserves placeholders and existing rows',async()=>{
 const s=sheets(),o=order(),p=livePlan(o,o.items[0].itemKey),transport=createRemitTransport({cfg,validateConfig:assertLiveConfig,appendAfterLast:true,clientFactory:async()=>s.client}),before=JSON.stringify(s.grid.get(10));
 const inspected=await transport.inspect(p);assert.equal(inspected.row,11);assert.equal(inspected.action,'CREATE');await transport.write(p,11);assert.equal(JSON.stringify(s.grid.get(10)),before);assert.equal(s.writes.length,1);assert.equal((await transport.inspect(p)).matches,true);assert.ok(s.writes[0].data.requests.every(q=>q.updateCells.start.rowIndex===10));assert.ok(!s.writes[0].data.requests.some(q=>[7,9].includes(q.updateCells.start.columnIndex)));
});
test('live REMIT refuses occupied, formula and stale-reservation rows',async()=>{
 const s=sheets(),o=order(),p=livePlan(o,o.items[0].itemKey),transport=createRemitTransport({cfg,validateConfig:assertLiveConfig,appendAfterLast:true,clientFactory:async()=>s.client});
 s.set(11,7,'unrelated file');await assert.rejects(transport.inspect(p),/UNOWNED_ROW_OCCUPIED/);s.grid.delete(11);s.grid.set(11,Array.from({length:7},(_,i)=>i===6?{userEnteredValue:{formulaValue:'=1'}}:{}));await assert.rejects(transport.inspect(p),/FORMULA_PROTECTED/);s.set(12,1,46200);await assert.rejects(transport.write(p,11),/ROW_RESERVATION_CHANGED/);assert.equal(s.writes.length,0);
});
test('live manual mirror retains Owner/Admin authorization, idempotency and immutable audit without changing payment',async()=>{
 const o=order(),db=memoryDb(),s=sheets(),transport=createRemitTransport({cfg,validateConfig:assertLiveConfig,appendAfterLast:true,clientFactory:async()=>s.client}),api=createLiveRemit(db,{transport}),actor={uid:'owner',role:'owner'};
 db.put('orders/'+o.posId,o);
 await assert.rejects(api.preview({posId:o.posId,itemKey:o.items[0].itemKey},{uid:'sales',role:'sales'}),/Owner or Admin/);
 const preview=await api.preview({posId:o.posId,itemKey:o.items[0].itemKey},actor);assert.equal(preview.testOnly,false);assert.equal(preview.spreadsheetId,cfg.spreadsheetId);const input={posId:o.posId,itemKey:o.items[0].itemKey,expectedVersion:1,confirmationToken:preview.confirmationToken};assert.equal((await api.sync(input,actor)).status,'MIRRORED');assert.equal((await api.sync(input,actor)).replayed,true);assert.equal(s.writes.length,1);assert.deepEqual((await db.doc('orders/'+o.posId).get()).data(),o);
});
