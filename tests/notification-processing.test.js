'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {deliver}=require('../functions/notifications');
function fixture(){const db=memoryDb(),ref=db.doc('notificationOutbox/12345678_CUSTOMER');db.put('orders/12345678',{voidedAt:null});db.put(ref.path,{type:'CUSTOMER',posId:'12345678',status:'QUEUED',attempts:0,snapshot:{posId:'12345678',first:'Test',email:'fixture@example.invalid',items:[],received:100,due:90,excess:10}});return {db,ref};}
test('concurrent consumers claim once and persist attempt before provider invocation',async()=>{
 const {db,ref}=fixture();let calls=0;
 const adapter=async(content,context)=>{calls++;assert.equal(context.eventId,ref.id);assert.equal(db.data(ref.path).status,'SENDING');assert.equal(db.entries().filter(([p,v])=>p.startsWith('notificationAttempts/')&&v.status==='SENDING').length,1);return {id:'accepted-1',provider:'SMTP'};};
 await Promise.all([deliver(db,ref,adapter),deliver(db,ref,adapter)]);assert.equal(calls,1);assert.equal(db.data(ref.path).status,'SENT');assert.equal(db.entries().find(([p])=>p.startsWith('notificationAttempts/'))[1].providerId,'accepted-1');
 await deliver(db,ref,adapter);assert.equal(calls,1);
});
test('uncertain errors are REVIEW, never replayed, with no raw credentials in logs',async()=>{
 const {db,ref}=fixture();let calls=0;await deliver(db,ref,async()=>{calls++;throw Error('password=[REDACTED_SECRET]');});
 assert.equal(db.data(ref.path).status,'REVIEW');assert.equal(JSON.stringify(db.entries()).includes('do-not-store-this-secret'),false);await deliver(db,ref,async()=>{calls++;});assert.equal(calls,1);
});
test('provider acceptance followed by log failure remains REVIEW rather than resending',async()=>{
 const {db,ref}=fixture();let calls=0;db.failNextBatch=true;
 await deliver(db,ref,async()=>{calls++;return {id:'accepted-before-write-failure'};});assert.equal(db.data(ref.path).status,'REVIEW');assert.equal(db.data(ref.path).providerId,'accepted-before-write-failure');assert.equal(db.data(ref.path).providerAccepted,true);await deliver(db,ref,async()=>{calls++;});assert.equal(calls,1);
});
test('confirmed failure logs backoff; stale SENDING, cancelled and capped events never send',async()=>{
 const {db,ref}=fixture();await deliver(db,ref,async()=>{throw Object.assign(Error('must not persist raw response'),{code:'VIBER_REJECTED',confirmedNotDelivered:true});});assert.equal(db.data(ref.path).status,'NOT_DELIVERED');assert.ok(Date.parse(db.data(ref.path).nextAttemptAt)>Date.now());
 for(const state of [{status:'SENDING',attempts:1},{status:'QUEUED',attempts:3}]){db.put(ref.path,{...db.data(ref.path),...state});await deliver(db,ref,async()=>{assert.fail('must not send');});}
 db.put(ref.path,{...db.data(ref.path),status:'QUEUED',attempts:0});db.put('orders/12345678',{voidedAt:'2026-11-10'});await deliver(db,ref,async()=>assert.fail('voided'));assert.equal(db.data(ref.path).status,'CANCELLED');
});
