'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {validate}=require('../functions/core'),{assertFinancialTesting}=require('../functions/runtime');
const {toFirebase,fromFirebase,runner}=require('../public/legacy-adapter.cjs');
const sample=()=>({posId:'12345678',paymentDate:'2026-11-10',first:'N/A',email:'N/A',received:500,items:[{kind:'editing',existingId:'RF12345A',amount:500,orderType:'Fetched',fileType:'NORMAL FILE'}]});
test('original CSS is retained verbatim and generated interface is reproducible',()=>{
 const source=fs.readFileSync('reference/Original_Index.html','utf8'),output=fs.readFileSync('public/index.html','utf8');
 assert.equal(output,require('../tools/restore-original-ui.cjs').generate());
 const styles=s=>[...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]);assert.deepEqual(styles(output),styles(source));
 for(const match of source.matchAll(/\bid="([^"]+)"/g))assert.ok(output.includes('id="'+match[1]+'"'),match[1]+' retained');
 for(const match of output.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 assert.ok(!output.includes('script.google.com/macros'));assert.ok(!output.includes('UNVERIFIED_FIXTURE'));
});
test('source editing receipt types and Fetched survive validation; non-rush dates clear',()=>{
 for(const fileType of ['NORMAL FILE','RUSH FILE','REVISION PAYMENT','ADDITIONAL PAYMENT']){
  const o=sample();Object.assign(o.items[0],{fileType,rushTargetDate:'2026-11-11'});const r=validate(o);assert.equal(r.items[0].fileType,fileType);assert.equal(r.items[0].orderType,'Fetched');assert.equal(r.items[0].rushTargetDate,fileType==='RUSH FILE'?'2026-11-11':'');
 }
});
test('customer phone, region and shipping notes remain lossless across Firebase boundary',()=>{
 const o={...sample(),updatedAt:7,phone:'09123456789',proof:'https://drive.google.com/file/d/test/view',shipping:{receiverName:'N/A',region:'NCR',shippingNotes:'Leave at desk'},items:sample().items};
 const input=toFirebase(o);const clean=validate(input);assert.equal(clean.phone,o.phone);assert.equal(clean.shipping.region,'NCR');assert.equal(clean.shipping.notes,'Leave at desk');
 const back=fromFirebase({...clean,version:8,createdAt:'2026-11-10',recordedByName:'Owner'});assert.equal(back.updatedAt,8);assert.equal(back.proof,o.proof);assert.equal(back.shipping.shippingNotes,'Leave at desk');assert.equal(back.admin,'Owner');
});
test('one frame cannot be linked twice from separate editing outputs',()=>{
 const o=sample();o.received=3000;o.shippingFee=50;o.items.push({...o.items[0],existingId:'RF12345B',frameOrderId:'AB1C2'},{kind:'frame',existingId:'AB1C2',amount:799,shippingFee:50});o.items[0].frameOrderId='AB1C2';assert.throws(()=>validate(o),/multiple editing/);
});
test('financial writes require isolated local sample environment regardless of client or staging configuration',()=>{
 assert.doesNotThrow(()=>assertFinancialTesting({FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-rocketfix-360'}));
 for(const env of [{},{GCLOUD_PROJECT:'rocketfix-360-staging'},{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'rocketfix-360-staging'}])assert.throws(()=>assertFinancialTesting(env),/blocked/);
});
test('legacy callback chains stay isolated and dispatch errors reach failure handler',async()=>{
 const api=runner(async(name,args)=>{if(name==='bad')throw Error('denied');return args[0];});
 const results=await Promise.all([new Promise((resolve,reject)=>api.withSuccessHandler(resolve).withFailureHandler(reject).first('a')),new Promise(resolve=>api.withSuccessHandler(()=>assert.fail()).withFailureHandler(e=>resolve(e.message)).bad())]);assert.deepEqual(results,['a','denied']);
});
