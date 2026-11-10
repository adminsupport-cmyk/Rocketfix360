'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {eligibility,mayDeliver}=require('../functions/notification-eligibility');
const {createProviderAdapter}=require('../functions/provider-adapters');
const activated='2026-11-10T08:00:00.000Z';
const policy={externalSendingAuthorized:true,automaticDeliveryActivatedAt:activated,allowedTestEmails:[],allowedTestViberSenderIds:[]};
test('future activation cannot backfill old, simulated or unmarked remittance events',async()=>{
 let reads=0;
 const adapter=createProviderAdapter({deliveryPolicy:policy,env:{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-rocketfix-360'},readCredentials:()=>{reads++;throw Error('No historical secrets lookup');}});
 for(const context of [
 {createdAt:'2026-11-09T08:00:00.000Z',...eligibility(policy,'2026-11-09T08:00:00.000Z')},
 {createdAt:activated,...eligibility({...policy,externalSendingAuthorized:false},activated)},
 {createdAt:activated},
 {createdAt:activated,externalDeliveryEligible:true,deliveryActivation:'2026-11-09T08:00:00.000Z'}
 ])assert.equal((await adapter({text:'Test'},context)).simulated,true);
 assert.equal(reads,0);
});
test('only events committed under the current valid activation can be eligible',()=>{
 assert.equal(mayDeliver(policy,{createdAt:activated,...eligibility(policy,activated)}),true);
 assert.equal(eligibility({...policy,automaticDeliveryActivatedAt:null},activated).externalDeliveryEligible,false);
 assert.equal(eligibility(policy,'invalid').externalDeliveryEligible,false);
 assert.equal(mayDeliver({...policy,externalSendingAuthorized:false},{createdAt:activated,...eligibility(policy,activated)}),false);
});
