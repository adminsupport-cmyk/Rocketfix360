'use strict';
// Explicitly approved one-message connection test. Never retries an uncertain send.
const fs=require('node:fs'),path=require('node:path');
const project='rocketfix-360-staging';
async function main(){
 const evidence=path.resolve(__dirname,'../staging/viber-controlled-test.json');
 if(fs.existsSync(evidence))throw Error('Existing test record requires reconciliation; no resend permitted');
 const verified=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../staging/viber-verification.json')));
 if(verified.project!==project||verified.channelName!=='REMIT - RF'||verified.channelNameConfirmedByOwner!==true||verified.storedSenderIsSuperadmin!==true)throw Error('Approved identity is required');
 const lib=path.resolve(path.dirname(require('./firebase-cli.cjs').cliPath()),'..');
 const auth=require(path.join(lib,'auth')),opts={project,nonInteractive:true},account=auth.getGlobalDefaultAccount();
 if(!account)throw Error('Firebase authentication required');
 auth.setActiveAccount(opts,account);await require(path.join(lib,'requireAuth')).requireAuth(opts);
 const {Client}=require(path.join(lib,'apiv2')),sm=new Client({urlPrefix:'https://secretmanager.googleapis.com',apiVersion:'v1'});
 async function secret(name){const response=await sm.get(`/projects/${project}/secrets/${name}/versions/latest:access`);return Buffer.from(response.body.payload.data,'base64').toString('utf8').trim();}
 const credentials={viberToken:await secret('RF_VIBER_CHANNEL_TOKEN'),viberSender:await secret('RF_VIBER_CHANNEL_SENDER_ID')};
 const record={project,channelName:'REMIT - RF',startedAt:new Date().toISOString(),status:'SENDING',automaticDeliveryEnabled:false,paymentCreated:false};
 fs.writeFileSync(evidence,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
 try{
  await require('../functions/provider-adapters').sendViber({text:'[STAGING TEST] Rocketfix360 notification connection verified. No payment or customer order was created.'},{eventId:'approved-staging-connection-test-20261110'},credentials);
  record.status='PROVIDER_ACCEPTED';
 }catch(e){record.status=e.confirmedNotDelivered===true?'CONFIRMED_NOT_DELIVERED':'REVIEW_REQUIRED';record.errorCode=['VIBER_REJECTED','VIBER_OUTCOME_UNCERTAIN','NOT_CONFIGURED'].includes(e.code)?e.code:'VERIFICATION_UNAVAILABLE';}
 record.completedAt=new Date().toISOString();fs.writeFileSync(evidence,JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify(record));
}
main().catch(()=>{console.error('Controlled test unavailable; inspect sanitized evidence. No automatic retry.');process.exitCode=1;});
