'use strict';
const {sendViber,DeliveryError}=require('./provider-adapters');
const policy=require('./viber-policy.json');
function authorized(n,p=policy){
 if(!['VIBER','LATE_VIBER'].includes(n.type))return false;
 if(n.stagingTest===false){if(p.controlledRealVerificationEnabled===true&&n.controlledRealVerification===true&&n.type==='VIBER'&&/^\d{8}$/.test(p.realVerificationPosId||'')&&n.posId===p.realVerificationPosId)return true;const cutoff=Date.parse(p.realAutomaticDeliveryActivatedAt);return Number.isFinite(cutoff)&&n.realViberActivation===p.realAutomaticDeliveryActivatedAt&&Number.isFinite(Date.parse(n.createdAt))&&Date.parse(n.createdAt)>=cutoff;}
 if(n.stagingTest!==true||p.fictionalDeliveryEnabled===false)return false;
 if(p.controlledVerificationEnabled===true&&n.controlledVerification===true)return true;
 const time=Date.parse(p.automaticDeliveryActivatedAt);
 return Number.isFinite(time)&&n.viberActivation===p.automaticDeliveryActivatedAt&&Number.isFinite(Date.parse(n.createdAt))&&Date.parse(n.createdAt)>=time;
}
function adapter(readCredentials,env=process.env){return async(content,context)=>{
 if(env.GCLOUD_PROJECT!=='rocketfix-360-staging'||env.FUNCTIONS_EMULATOR==='true'||!authorized(context))return {simulated:true,id:'SIMULATED',provider:'LOCAL'};
 const credentials=readCredentials();
 const response=await fetch('https://chatapi.viber.com/pa/get_account_info',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({auth_token:credentials.viberToken}),signal:AbortSignal.timeout(15000)});
 let account;try{account=await response.json();}catch{throw new DeliveryError('VIBER_OUTCOME_UNCERTAIN');}
 if(!response.ok||account.status!==0||account.name!==policy.approvedChannelName||!account.members?.some(m=>m.id===credentials.viberSender&&m.role==='superadmin'))throw new DeliveryError('TEST_DESTINATION_BLOCKED',true);
 return sendViber({text:(context.stagingTest===true?'[FICTIONAL TEST — NO REAL PAYMENT]\n':'')+content.text},context,credentials);
};}
module.exports={authorized,adapter};
