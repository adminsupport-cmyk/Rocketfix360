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
test('deployment rejects automatic activation without controlled delivery and duplicate proof',()=>{
 const {validateViberActivation}=require('../tools/deploy-staging.cjs');
 const p={controlledVerificationEnabled:false,automaticDeliveryActivatedAt:'2026-11-10T10:00:00.000Z'};
 const e={project:'rocketfix-360-staging',database:'rocketfix360database',orderSaved:true,orderVersion:2,notificationEventCount:1,eventStatus:'SENT',provider:'VIBER',providerResponseRecorded:true,attempts:1,attemptLogCount:1,refreshAndEditVerified:true};
 assert.doesNotThrow(()=>validateViberActivation(p,e));
 for(const patch of [{eventStatus:'REVIEW'},{notificationEventCount:2},{attempts:2},{refreshAndEditVerified:false},{project:'rocketfix-360'},{orderVersion:1}])assert.throws(()=>validateViberActivation(p,{...e,...patch}));
 assert.throws(()=>validateViberActivation(p,null));
});
test('real notifications require an exact activation epoch; fictional and historical events stay disabled',()=>{
 const cutoff='2026-11-11T01:00:00.000Z',p={fictionalDeliveryEnabled:false,controlledRealVerificationEnabled:true,realVerificationPosId:'64088235',realAutomaticDeliveryActivatedAt:cutoff};
 const n={type:'VIBER',stagingTest:false,posId:'12345678',createdAt:cutoff,realViberActivation:cutoff};
 assert.equal(authorized(n,p),true);assert.equal(authorized({...n,type:'LATE_VIBER'},p),true);
 for(const patch of [{stagingTest:true},{createdAt:'2026-11-10T01:00:00Z'},{realViberActivation:null},{realViberActivation:'old'},{type:'CUSTOMER'}])assert.equal(authorized({...n,...patch},p),false);
 assert.equal(authorized({type:'VIBER',stagingTest:false,posId:'64088235',controlledRealVerification:true},p),true);
 assert.equal(authorized({type:'VIBER',stagingTest:false,controlledRealVerification:true},{controlledRealVerificationEnabled:true}),false);
 const {validateRealViberActivation}=require('../tools/deploy-staging.cjs'),policy={...p,controlledRealVerificationEnabled:false};
 const evidence={project:'rocketfix-360-staging',database:'rocketfix360database',posId:'64088235',eventStatus:'SENT',provider:'VIBER',providerResponseRecorded:true,realProviderAttempts:1,notificationEventCount:1,paymentUnchanged:true,refreshAndReplayVerified:true};
 assert.doesNotThrow(()=>validateRealViberActivation(policy,evidence));
 for(const patch of [{eventStatus:'REVIEW'},{realProviderAttempts:2},{notificationEventCount:2},{paymentUnchanged:false},{refreshAndReplayVerified:false},{project:'rocketfix-360'}])assert.throws(()=>validateRealViberActivation(policy,{...evidence,...patch}));
});
