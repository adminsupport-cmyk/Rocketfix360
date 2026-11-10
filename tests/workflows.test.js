'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {validate}=require('../functions/core');
const {productQuote,quoteOrder,pricingConfig,letter,projection}=require('../functions/workflows');
const base={posId:'12345678',paymentDate:'2026-11-10',first:'Test',email:'N/A',received:10000,discount:17.33,tip:10,tipRecipient:'Joyce',shippingFee:143,items:[{kind:'editing',existingId:'RF12345A',amount:333.33},{kind:'frame',existingId:'AB1C2',amount:799,size:'10"x13" - Small',shippingFee:43},{kind:'frame',existingId:'CD3E4',amount:999,size:'13"x17" - Medium',shippingFee:100}]};
test('financial allocations match uploaded Apps Script for freight and rounding fixtures',()=>{
 const source=fs.readFileSync('reference/Original_Code.gs.txt','utf8');
 const extract=(start,end)=>source.slice(source.indexOf('function '+start),source.indexOf('function '+end));
 const ctx={Logger:{log(){}},posValidateIds_(){},posGetTipEmployees_:()=>['Joyce'],posFrameAddonEnsureHeaders_(){},rfFrameCfgRead_:()=>({}),rfFrameProductKind_:()=>'',rfFrameProductQuote_:()=>({calculated:false}),rfFrameShippingQuote_:r=>({fee:r.shippingFee}),posNum_:Number,posMoney_:n=>Math.round((Number(n)+Number.EPSILON)*100)/100,posFrameAddonCharge_:i=>i.addOnType==='Personalized Letter'?200:0};
 vm.createContext(ctx);vm.runInContext(extract('posServiceAmounts_','posFindBlankRemitRow_')+extract('posFinalizeQueuedV1618_','posSaveTransaction_'),ctx);
 for(const discount of [0,0.01,17.33,100,1000]){
  const raw=structuredClone({...base,discount}),legacy=structuredClone(raw);ctx.posFinalizeQueuedV1618_({},legacy,null);const actual=validate(raw);
  assert.equal(actual.editPaid,legacy.editPaid);assert.equal(actual.framePaid,legacy.framePaid);assert.equal(actual.excess,legacy.excess);
  actual.items.forEach((i,n)=>{assert.equal(i._paid,legacy.items[n]._paid);assert.equal(i._discount,legacy.items[n]._discount);});
 }
});
test('strict calendar, POS length, letter length, rush date',()=>{
 assert.throws(()=>validate({...base,paymentDate:'2026-02-30'}),/date/);
 assert.throws(()=>validate({...base,posId:'123456789'}),/8 digits/);
 assert.throws(()=>validate({...base,items:[{...base.items[0],fileType:'RUSH FILE'}]}),/rush/);
});
test('standard SRPs and configurable custom formula from browser reference',()=>{
 assert.equal(productQuote({size:'10"x13" - Small'}).price,799);
 const item={customSize:true,customWidth:12,customHeight:15,design:'Print Only'};
 assert.throws(()=>productQuote(item),/Configure/);
 assert.equal(productQuote(item,{custom:{printRate:1.25,printBase:20,printMinimum:100}}).price,245);
 assert.throws(()=>productQuote({...item,customWidth:61},{custom:{printRate:1}}),/limits/);
 assert.throws(()=>pricingConfig({custom:{printRate:-1}}),/nonnegative/);
});
test('LBC per-frame rates, manual Lalamove, oversized missing rates and tampering',()=>{
 const input={...base,shipping:{ship:'LBC',area:'Luzon'},items:base.items.map(i=>({...i,shippingFee:''}))};
 assert.throws(()=>quoteOrder(input),/unverified/);
 const q=quoteOrder(input,{fixtureOnly:true,rates:{'Luzon|Small':{rate:50,days:'3–5'},'Luzon|Medium':{rate:80}}});
 assert.equal(q.shippingFee,130);assert.equal(q.items[1].shippingFee,50);assert.equal(q.items[2].shippingFee,80);
 assert.throws(()=>quoteOrder(input,{fixtureOnly:true}),/confirmed shipping/);
 assert.throws(()=>quoteOrder({...input,items:[{...input.items[1],amount:1}]},{fixtureOnly:true}),/price changed/);
 assert.equal(quoteOrder({...input,shipping:{ship:'LALAMOVE'},items:[{...input.items[1],shippingFee:155}]},{fixtureOnly:true}).shippingFee,155);
});
test('late letter preserves fixed charge and commission and validates receipt',()=>{
 const payload={confirmation:'PAYMENT RECEIVED',paymentDate:'2026-11-10',method:'GCash',commissionEmployee:'Renz Malenab',font:'Cursive',color:'Pink',message:'N/A'};
 assert.equal(letter(payload).amount,200);assert.equal(letter(payload).commission,50);
 assert.throws(()=>letter({...payload,confirmation:''}),/Confirm/);
 assert.throws(()=>letter({...payload,message:'x'.repeat(6001)}),/6000/);
});
test('operational projections filter unrelated items and all financial fields',()=>{
 const o=validate(base);o.items[0].assignedTo='editor';o.items[1].lateLetter={amount:200};
 for(const actor of [{role:'editor',uid:'editor'},{role:'production'},{role:'encoder'}]){
 const p=projection(o,actor),text=JSON.stringify(p);for(const key of ['amount','due','tip','shippingFee','addOnCommissionRecipient','_paid','email'])assert.equal(text.includes('"'+key+'"'),false,key);
 if(actor.role==='editor')assert.equal(p.items.length,1);
 if(actor.role==='production')assert.equal(p.items.length,2);
 }
});

const {assertStaging}=require('../functions/runtime');
test('runtime refuses non-emulator and non-demo execution',()=>{
 assert.doesNotThrow(()=>assertStaging({FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-rocketfix-360'}));
 for(const env of [{},{FUNCTIONS_EMULATOR:'false',GCLOUD_PROJECT:'demo-rocketfix-360'},{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'live-project'}])assert.throws(()=>assertStaging(env),/demo Firebase emulators/);
});

const {message}=require('../functions/notifications');
test('staging receipt escapes customer HTML and keeps excess separate',()=>{
 const o=validate({...base,first:'<script>alert(1)</script>'});const n=message({type:'CUSTOMER',snapshot:o});assert.equal(n.html.includes('<script>'),false);assert.match(n.html,/&lt;script&gt;/);assert.match(n.html,/Excess:/);assert.match(n.subject,/STAGING/);
 assert.throws(()=>message({type:'UNKNOWN',snapshot:o}),/Unsupported/);
});
test('letter preserves exact whitespace; email N\/A aliases normalize',()=>{
 const i={...base.items[1],addOnType:'Personalized Letter',addOnFont:'Regular',addOnColor:'White Gold',addOnCommissionRecipient:'Renz Malenab',addOnMessage:'  '+('message '.repeat(15))+'  '};
 const o=validate({...base,email:'na',items:[base.items[0],i,base.items[2]]});assert.equal(o.email,'N/A');assert.equal(o.items[1].addOnMessage,i.addOnMessage);
});
