'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixtures,fixtureContext,validateFixtureOrder}=require('../functions/staging-orders');
const order={first:'TEST',last:'VIBER INTEGRATION 20261110',email:'N/A',stagingTest:true,fixtureVersion:fixtures.fixtureVersion,fixtureAcknowledgement:'FICTIONAL TEST ORDER'};
test('remote financial entry requires fictional identity and exact server fixture acknowledgement',()=>{
 assert.equal(validateFixtureOrder(order),true);
 for(const patch of [{first:'Actual customer'},{email:'real@example.com'},{stagingTest:false},{fixtureVersion:'invented'},{proofUrl:'https://example.com/proof'},{fixtureAcknowledgement:''},{productionEligible:true}])assert.throws(()=>fixtureContext({...order,...patch},{},{GCLOUD_PROJECT:'rocketfix-360-staging'}));
 assert.equal(fixtureContext(order,{rates:{tampered:1000}},{GCLOUD_PROJECT:'rocketfix-360-staging'}).config,fixtures);
});
const {paymentContext}=require('../functions/staging-orders');
const real={paymentMode:'AGREED_EDITING_V1',stagingTest:false,posId:'88776655',first:'Customer',email:'customer@example.com',paymentDate:'2026-11-10',method:'GCash',received:300.3,items:[{kind:'editing',existingId:'RF54321A',amount:100.1},{kind:'editing',existingId:'RF54322A',amount:200.2}]};
test('agreed editing payments accept real identity and preserve exact monetary validation',()=>{
 const result=paymentContext(real,{}, {GCLOUD_PROJECT:'rocketfix-360-staging'});assert.equal(result.stagingTest,false);assert.equal(result.paymentMode,'AGREED_EDITING_V1');assert.deepEqual(result.config,{});
 for(const patch of [{discount:1},{tip:1},{shippingFee:1},{received:301},{received:299},{stagingTest:true},{fixtureVersion:fixtures.fixtureVersion},{method:'invalid'},{items:[{...real.items[0],kind:'frame'}]},{items:[{...real.items[0],frameOrderId:'AB1C2'}]},{items:[{...real.items[0],amount:0}]}])assert.throws(()=>paymentContext({...real,...patch},{}));
});
