'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {authorized,adapter}=require('../functions/viber-staging');
test('controlled verification and future-only activation reject historical and non-test events',()=>{
 const p={controlledVerificationEnabled:true,automaticDeliveryActivatedAt:null};
 assert.equal(authorized({type:'VIBER',stagingTest:true,controlledVerification:true},p),true);
 for(const n of [{type:'CUSTOMER',stagingTest:true,controlledVerification:true},{type:'VIBER',controlledVerification:true},{type:'VIBER',stagingTest:true}])assert.equal(authorized(n,p),false);
 const active={controlledVerificationEnabled:false,automaticDeliveryActivatedAt:'2026-11-10T10:00:00.000Z'};
 for(const n of [{createdAt:'2026-11-09T10:00:00.000Z',viberActivation:active.automaticDeliveryActivatedAt},{createdAt:'2026-11-11T10:00:00.000Z'}, {createdAt:'bad',viberActivation:active.automaticDeliveryActivatedAt}])assert.equal(authorized({type:'VIBER',stagingTest:true,...n},active),false);
 assert.equal(authorized({type:'VIBER',stagingTest:true,createdAt:active.automaticDeliveryActivatedAt,viberActivation:active.automaticDeliveryActivatedAt},active),true);
});
test('unmarked events and emulators never look up channel credentials',async()=>{
 let reads=0;const read=()=>{reads++;throw Error('No read');};
 assert.equal((await adapter(read,{GCLOUD_PROJECT:'rocketfix-360-staging'})({}, {type:'VIBER',stagingTest:true})).simulated,true);
 assert.equal((await adapter(read,{GCLOUD_PROJECT:'demo-rocketfix-360',FUNCTIONS_EMULATOR:'true'})({}, {type:'VIBER',stagingTest:true,controlledVerification:true})).simulated,true);assert.equal(reads,0);
});
