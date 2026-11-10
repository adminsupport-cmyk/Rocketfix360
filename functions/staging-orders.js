'use strict';
const fixtures=require('./staging-fixtures.json');
function isLocal(env=process.env){return env.FUNCTIONS_EMULATOR==='true'&&env.GCLOUD_PROJECT==='demo-rocketfix-360';}
function validateFixtureOrder(order,allowedEmails=[]){
 if(order?.stagingTest!==true||order.fixtureAcknowledgement!=='FICTIONAL TEST ORDER'||order.fixtureVersion!==fixtures.fixtureVersion)throw Error('Only explicitly acknowledged fictional staging test orders may be submitted. Real financial calculations remain blocked.');
 if(order.productionEligible===true||order.environment&&order.environment!=='staging')throw Error('Production orders are disabled');
 if(!/^(TEST|SAMPLE)(?:\s|$)/i.test(String(order.first||'').trim()))throw Error('Fictional customer names must begin with TEST or SAMPLE');
 const email=String(order.email||'').trim().toLowerCase();
 if(email!=='n/a'&&!email.endsWith('.invalid')&&!allowedEmails.map(x=>x.toLowerCase()).includes(email))throw Error('Use N/A, a fictional .invalid email, or an explicitly approved test inbox. Real customer emails are blocked.');
 if(order.proofUrl)throw Error('Real payment proofs are not accepted for fictional test orders');
 return true;
}
function fixtureContext(order,cfg,env=process.env,allowedEmails=[]){
 if(order?.stagingTest===true||!isLocal(env)){validateFixtureOrder(order,allowedEmails);return {config:fixtures,stagingTest:true,fixtureVersion:fixtures.fixtureVersion};}
 return {config:cfg||{},stagingTest:true,fixtureVersion:fixtures.fixtureVersion};
}
module.exports={fixtures,isLocal,validateFixtureOrder,fixtureContext};
