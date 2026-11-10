'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sendEmail,sendViber,createProviderAdapter}=require('../functions/provider-adapters');
const policy=require('../functions/notification-policy');
const context={eventId:'12345678_CUSTOMER',type:'CUSTOMER'},email={to:'fixture@example.invalid',subject:'Staging\r\nsubject',html:'<p>Fixture</p>'};
const credentials={smtpHost:'smtp.example.invalid',smtpPort:'587',smtpFrom:'staging@example.invalid',smtpUser:'test-user',smtpPass:' test-password ',viberToken:'local-test-token',viberSender:'test-channel'};
test('real delivery is disabled before reading any credentials, even with enable-like environment values',async()=>{
 assert.equal(policy.externalSendingAuthorized,false);assert.deepEqual(policy.allowedTestEmails,[]);assert.deepEqual(policy.allowedTestViberSenderIds,[]);
 let reads=0;const adapter=createProviderAdapter({env:{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-rocketfix-360',RF_SEND_ENABLED:'true'},readCredentials:()=>{reads++;throw Error('must not read');}});
 assert.equal((await adapter(email,context)).simulated,true);assert.equal(reads,0);
 await assert.rejects(createProviderAdapter({env:{GCLOUD_PROJECT:'live-project'}})(email,context),/demo Firebase/);
});
test('SMTP contract enforces verified TLS, one recipient and stable message identity',async()=>{
 const sent=[];let closed=0;
 const createTransport=options=>{assert.equal(options.requireTLS,true);assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.tls.minVersion,'TLSv1.2');assert.equal(options.disableFileAccess,true);assert.equal(options.disableUrlAccess,true);assert.equal(options.auth.pass,' test-password ');return {sendMail:async msg=>{sent.push(msg);return {accepted:[msg.to],messageId:msg.messageId};},close:()=>closed++};};
 const a=await sendEmail(email,context,credentials,{createTransport}),b=await sendEmail(email,context,credentials,{createTransport});assert.equal(a.id,b.id);assert.equal(closed,2);assert.equal(sent[0].subject,'Staging  subject');assert.deepEqual(sent[0].envelope.to,[email.to]);
 await assert.rejects(sendEmail({...email,to:'one@example.invalid,two@example.invalid'},context,credentials,{createTransport}),{code:'INVALID_ADDRESS'});
 await assert.rejects(sendEmail(email,context,{...credentials,smtpPort:'25'},{createTransport}),{code:'INVALID_SMTP_CONFIG'});
});
test('SMTP authentication rejection is safely classified; DATA timeouts remain uncertain',async()=>{
 for(const [error,code,safe] of [[{code:'EAUTH',message:'credential should not escape'},'SMTP_AUTH_REJECTED',true],[{command:'DATA',code:'ETIMEDOUT'},'SMTP_OUTCOME_UNCERTAIN',false]]){
 await assert.rejects(sendEmail(email,context,credentials,{createTransport:()=>({sendMail:async()=>{throw error;},close(){}})}),e=>e.code===code&&e.confirmedNotDelivered===safe&&!e.message.includes('credential'));
 }
});
test('Viber adapter uses the legacy HTTPS channel contract and preserves 64-bit acceptance tokens',async()=>{
 let request;
 const fetchImpl=async(url,options)=>{request={url,options};return new Response('{"status":0,"message_token":9223372036854775801}',{status:200});};
 const result=await sendViber({text:'Staging report'},{eventId:'12345678_VIBER'},credentials,{fetchImpl});assert.equal(result.id,'9223372036854775801');assert.equal(request.url,'https://chatapi.viber.com/pa/post');assert.equal(request.options.redirect,'error');assert.deepEqual(JSON.parse(request.options.body),{auth_token:credentials.viberToken,from:'test-channel',type:'text',text:'Staging report'});
});
test('Viber rejection is distinct from timeout, malformed response, missing token and 5xx uncertainty',async()=>{
 const c={eventId:'event'};
 await assert.rejects(sendViber({text:'Test'},c,credentials,{fetchImpl:async()=>new Response('{"status":2}',{status:429,headers:{'retry-after':'120'}}) }),e=>e.code==='VIBER_REJECTED'&&e.confirmedNotDelivered===true&&e.retryAfterMs===120000);
 for(const fetchImpl of [async()=>{throw Error('local-test-token');},async()=>new Response('bad response'),async()=>new Response('{"status":0}'),async()=>new Response('{"status":1}',{status:503})])await assert.rejects(sendViber({text:'Test'},c,credentials,{fetchImpl}),e=>e.code==='VIBER_OUTCOME_UNCERTAIN'&&!e.confirmedNotDelivered&&!e.message.includes(credentials.viberToken));
});
