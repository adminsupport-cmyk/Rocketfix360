'use strict';
const {createHash}=require('node:crypto');
const policy=require('./notification-policy');
const {mayDeliver}=require('./notification-eligibility');
const {assertStaging}=require('./runtime');

class DeliveryError extends Error{
 constructor(code,confirmedNotDelivered=false){super(code);this.code=code;this.confirmedNotDelivered=confirmedNotDelivered;}
}
function required(value,trim=true){if(typeof value!=='string'||!value.trim()||/[\r\n]/.test(value))throw new DeliveryError('NOT_CONFIGURED',true);return trim?value.trim():value;}
function address(value){const email=required(value);if(!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)||email.length>254)throw new DeliveryError('INVALID_ADDRESS',true);return email.toLowerCase();}
function key(eventId){if(!eventId)throw new DeliveryError('INVALID_EVENT',true);return createHash('sha256').update(String(eventId)).digest('hex');}

// The transport functions are separate from the runtime adapter so tests can
// exercise the wire contract against local doubles without enabling real sends.
async function sendEmail(content,context,credentials,{createTransport=require('nodemailer').createTransport}={}){
 const to=address(content.to),from=address(credentials.smtpFrom),host=required(credentials.smtpHost),port=Number(credentials.smtpPort||587);
 if(!/^[A-Za-z0-9.-]+$/.test(host)||!host.includes('.')||![465,587].includes(port))throw new DeliveryError('INVALID_SMTP_CONFIG',true);
 const messageId='<rocketfix-'+key(context.eventId)+'@'+from.split('@')[1]+'>';
 const transport=createTransport({host,port,secure:port===465,requireTLS:port===587,
  auth:{user:required(credentials.smtpUser),pass:required(credentials.smtpPass,false)},
  tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
  disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
 try{
  const receipt=await transport.sendMail({from,to,subject:String(content.subject||'').replace(/[\r\n]/g,' '),html:String(content.html||''),messageId,
   envelope:{from,to:[to]},disableFileAccess:true,disableUrlAccess:true});
  if(!receipt.accepted?.some(x=>String(x).toLowerCase()===to))throw new DeliveryError('SMTP_RECIPIENT_REJECTED',true);
  return {id:String(receipt.messageId||messageId),provider:'SMTP',status:'ACCEPTED'};
 }catch(e){
  if(e instanceof DeliveryError)throw e;
  // A DATA/socket timeout can occur after acceptance. Never call it a safe retry.
  if(e.code==='EAUTH')throw new DeliveryError('SMTP_AUTH_REJECTED',true);
  if(e.command==='RCPT TO'&&e.responseCode>=500)throw new DeliveryError('SMTP_RECIPIENT_REJECTED',true);
  throw new DeliveryError('SMTP_OUTCOME_UNCERTAIN');
 }finally{transport.close?.();}
}

async function sendViber(content,context,credentials,{fetchImpl=fetch,timeoutMs=20000}={}){
 const token=required(credentials.viberToken),sender=required(credentials.viberSender);
 key(context.eventId);
 if(!content.text||String(content.text).length>6000)throw new DeliveryError('INVALID_VIBER_MESSAGE',true);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  // Fixed HTTPS destination, no redirects that could disclose the channel token.
  // Matches rfLateAddonViberNotify_ in the uploaded Original_Code.gs.txt.
  const response=await fetchImpl('https://chatapi.viber.com/pa/post',{method:'POST',redirect:'error',signal:controller.signal,
   headers:{'Content-Type':'application/json'},body:JSON.stringify({auth_token:token,from:sender,type:'text',text:content.text})});
  const text=await response.text();if(text.length>65536)throw new DeliveryError('VIBER_OUTCOME_UNCERTAIN');
  const result=JSON.parse(text,(field,value,source)=>{
   if(field==='message_token'&&typeof value==='number'){
    if(source?.source)return source.source;
    if(!Number.isSafeInteger(value))throw new DeliveryError('VIBER_OUTCOME_UNCERTAIN');
   }return value;
  });
  if(response.status<500&&typeof result.status==='number'&&result.status!==0){
   const error=new DeliveryError('VIBER_REJECTED',true),header=response.headers?.get('retry-after');
   if(header){const seconds=Number(header),delay=Number.isFinite(seconds)?seconds*1000:Date.parse(header)-Date.now();if(Number.isFinite(delay)&&delay>0)error.retryAfterMs=delay;}
   throw error;
  }
  if(!response.ok||result.status!==0||!String(result.message_token||''))throw new DeliveryError('VIBER_OUTCOME_UNCERTAIN');
  return {id:String(result.message_token),provider:'VIBER',status:'ACCEPTED'};
 }catch(e){if(e instanceof DeliveryError)throw e;throw new DeliveryError('VIBER_OUTCOME_UNCERTAIN');}
 finally{clearTimeout(timer);}
}

function createProviderAdapter({readCredentials,env=process.env,deliveryPolicy=policy}={}){
 return async (content,context)=>{
  assertStaging(env);
  // No secret lookup, SMTP connection or HTTPS request while authorization is off.
  if(!deliveryPolicy.externalSendingAuthorized||!mayDeliver(deliveryPolicy,context))return {id:'SIMULATED',simulated:true,provider:'LOCAL'};
  if(context.type==='CUSTOMER'){
   if(!deliveryPolicy.allowedTestEmails.includes(address(content.to)))throw new DeliveryError('TEST_DESTINATION_BLOCKED',true);
   return sendEmail(content,context,readCredentials());
  }
  const credentials=readCredentials();
  if(!deliveryPolicy.allowedTestViberSenderIds.includes(credentials.viberSender))throw new DeliveryError('TEST_DESTINATION_BLOCKED',true);
  return sendViber(content,context,credentials);
 };
}
module.exports={DeliveryError,sendEmail,sendViber,createProviderAdapter};
