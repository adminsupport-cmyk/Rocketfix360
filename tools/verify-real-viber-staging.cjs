'use strict';
// Read-only acceptance checks. Delivery is requested through the Owner POS UI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline=path.join(root,'.runtime/real-viber-baseline.json'),posId='64088235',eventId=posId+'_VIBER';
function value(v){if(v.stringValue!==undefined)return v.stringValue;if(v.booleanValue!==undefined)return v.booleanValue;if(v.integerValue!==undefined)return Number(v.integerValue);if(v.doubleValue!==undefined)return v.doubleValue;if(v.nullValue!==undefined)return null;if(v.arrayValue)return (v.arrayValue.values||[]).map(value);if(v.mapValue)return fields(v.mapValue.fields||{});return null;}
function fields(f){return Object.fromEntries(Object.entries(f||{}).map(([k,v])=>[k,value(v)]));}
function canonical(o){return Array.isArray(o)?o.map(canonical):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,canonical(o[k])])):o;}
const hash=o=>createHash('sha256').update(JSON.stringify(canonical(o))).digest('hex');
(async()=>{const {firestore:api,project}=await require('./staging-google.cjs').clients(),base='/projects/'+project+'/databases/rocketfix360database/documents';
 const get=async p=>fields((await api.get(base+'/'+p)).body.fields);
 const query=async(c,f,id)=>((await api.post(base+':runQuery',{structuredQuery:{from:[{collectionId:c}],where:{fieldFilter:{field:{fieldPath:f},op:'EQUAL',value:{stringValue:id}}}}})).body||[]).filter(x=>x.document).map(x=>fields(x.document.fields));
 const order=await get('orders/'+posId),event=await get('notificationOutbox/'+eventId),events=await query('notificationOutbox','posId',posId),attempts=await query('notificationAttempts','eventId',eventId);
 require('../functions/real-orders').assertRealSavedOrder(order);assert.equal(events.filter(e=>e.type==='VIBER').length,1);
 if(process.argv.includes('--before')){assert.equal(event.status,'SIMULATED');assert.equal(event.provider,'LOCAL');assert.equal(attempts.filter(a=>a.provider==='VIBER').length,0);fs.mkdirSync(path.dirname(baseline),{recursive:true});fs.writeFileSync(baseline,JSON.stringify({orderHash:hash(order),version:order.version,notificationCount:events.length}));console.log('Captured unchanged-payment baseline; no message sent.');return;}
 const prior=JSON.parse(fs.readFileSync(baseline));assert.equal(hash(order),prior.orderHash,'Payment must remain unchanged');assert.equal(order.version,prior.version);assert.equal(events.length,prior.notificationCount);assert.equal(event.status,'SENT');assert.equal(event.provider,'VIBER');assert.ok(event.providerId);const real=attempts.filter(a=>a.provider==='VIBER');assert.equal(real.length,1);assert.equal(real[0].status,'SENT');
 const report={project,database:'rocketfix360database',verifiedAt:new Date().toISOString(),posId,eventId,eventStatus:event.status,provider:event.provider,providerResponseRecorded:true,realProviderAttempts:real.length,notificationEventCount:1,paymentUnchanged:true,refreshAndReplayVerified:process.argv.includes('--refresh-verified')};
 if(report.refreshAndReplayVerified)fs.writeFileSync(path.join(root,'staging/real-viber-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error('Real Viber acceptance check failed: '+e.message);process.exitCode=1;});
