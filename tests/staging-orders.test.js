'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixtures,fixtureContext,validateFixtureOrder}=require('../functions/staging-orders');
const order={first:'TEST',last:'VIBER INTEGRATION 20261110',email:'N/A',stagingTest:true,fixtureVersion:fixtures.fixtureVersion,fixtureAcknowledgement:'FICTIONAL TEST ORDER'};
test('remote financial entry requires fictional identity and exact server fixture acknowledgement',()=>{
 assert.equal(validateFixtureOrder(order),true);
 for(const patch of [{first:'Actual customer'},{email:'real@example.com'},{stagingTest:false},{fixtureVersion:'invented'},{proofUrl:'https://example.com/proof'},{fixtureAcknowledgement:''},{productionEligible:true}])assert.throws(()=>fixtureContext({...order,...patch},{},{GCLOUD_PROJECT:'rocketfix-360-staging'}));
 assert.equal(fixtureContext(order,{rates:{tampered:1000}},{GCLOUD_PROJECT:'rocketfix-360-staging'}).config,fixtures);
});
