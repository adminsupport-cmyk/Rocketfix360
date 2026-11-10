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
function realEditingContext(order){
 if(order?.paymentMode!=='AGREED_EDITING_V1'||order.stagingTest!==false)throw Error('Confirm an agreed-price editing payment');
 if(order.fixtureVersion||order.fixtureAcknowledgement)throw Error('Real payments cannot use fictional pricing metadata');
 if(!Array.isArray(order.items)||!order.items.length||order.items.some(i=>i.kind!=='editing'||i.frameOrderId||i.addOnType))throw Error('Only standalone editing orders are enabled for real payments; frame payments remain blocked');
 for(const field of ['discount','tip','shippingFee'])if(Number(order[field]||0)!==0)throw Error('Real editing payments currently require zero discounts, tips and shipping charges pending rule approval');
 if(order.items.some(i=>!Number.isFinite(Number(i.amount))||Number(i.amount)<=0))throw Error('Enter a positive agreed price for every editing service');
 if(!['GCash','BDO','BPI','GoTyme','Cash','Bank Transfer','Other'].includes(order.method))throw Error('Select a valid payment method');
 const clean=require('./core').validate(order);
 if(clean.excess!==0)throw Error('Enter the exact agreed payment amount; Excess rules await approval');
 return {config:{},stagingTest:false,fixtureVersion:null,paymentMode:'AGREED_EDITING_V1'};
}
function paymentContext(order,cfg,env=process.env,allowedEmails=[]){
 if(order?.paymentMode==='AGREED_EDITING_V1')return realEditingContext(order);
 return fixtureContext(order,cfg,env,allowedEmails);
}
function fixtureContext(order,cfg,env=process.env,allowedEmails=[]){
 if(order?.stagingTest===true||!isLocal(env)){validateFixtureOrder(order,allowedEmails);return {config:fixtures,stagingTest:true,fixtureVersion:fixtures.fixtureVersion};}
 return {config:cfg||{},stagingTest:true,fixtureVersion:fixtures.fixtureVersion};
}
module.exports={fixtures,isLocal,validateFixtureOrder,fixtureContext,realEditingContext,paymentContext};
