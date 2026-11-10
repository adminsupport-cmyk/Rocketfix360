'use strict';
const now=()=>new Date().toISOString();
const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(n){
 const o=n.snapshot;
 if(!o)throw Error('Missing immutable notification snapshot');
 if(n.type==='CUSTOMER')return {to:o.email,subject:'[STAGING] Rocketfix Order Received — '+o.posId,html:`<h2>Staging receipt</h2><p>Hello ${safe(o.first)},</p><p>Order ${safe(o.posId)}</p><ul>${o.items.map(i=>`<li>${safe(i.kind)} ${safe(i.existingId)}</li>`).join('')}</ul><p>Received: ₱${Number(o.received).toFixed(2)}; Due: ₱${Number(o.due).toFixed(2)}; Excess: ₱${Number(o.excess).toFixed(2)}</p>`};
 if(n.type==='LATE_VIBER')return {text:`[STAGING] PERSONALIZED LETTER ${o.id}\nPayment: ₱200\nCommission: ₱50 — ${o.addOnCommissionRecipient}\nDate: ${o.paymentDate}\nMethod: ${o.method}\nReference: ${o.paymentRef}`};
 if(n.type!=='VIBER')throw Error('Unsupported notification type');
 return {text:`[STAGING] ROCKETFIX REMITTANCE ${o.posId}\n${o.paymentDate}\n${o.first} ${o.last}\n${o.items.map(i=>i.kind+': '+i.existingId).join('\n')}\nReceived: ₱${o.received.toFixed(2)}\nEditing: ₱${o.editPaid.toFixed(2)}\nFraming: ₱${o.framePaid.toFixed(2)}\nTip: ₱${o.tip.toFixed(2)}\nExcess: ₱${o.excess.toFixed(2)}\nMethod: ${o.method}`};
}
// Claims and attempt logs commit BEFORE contacting a provider. A crashed SENDING
// claim is never automatically reclaimed: the external outcome may be uncertain.
async function deliver(db,ref,adapter=async()=>({id:'SIMULATED',simulated:true,provider:'LOCAL'})){
 const {createHash}=require('node:crypto');
 const claim=await db.runTransaction(async t=>{
  const snap=await t.get(ref),n=snap.data();if(!n||n.status!=='QUEUED')return null;
  if(n.posId){const order=(await t.get(db.doc('orders/'+n.posId))).data();if(!order||order.voidedAt){t.update(ref,{status:'CANCELLED',detail:'Order missing or voided',updatedAt:now()});return null;}}
  if((n.attempts||0)>=3){t.update(ref,{status:'NOT_DELIVERED',detail:'Retry limit reached',updatedAt:now()});return null;}
  const attempts=(n.attempts||0)+1;
  const attemptId=createHash('sha256').update(ref.path+':'+attempts).digest('hex');
  const attempt=db.doc('notificationAttempts/'+attemptId),startedAt=now();
  t.update(ref,{status:'SENDING',attempts,attemptId,startedAt});
  t.create(attempt,{eventId:ref.id,type:n.type,attempt:attempts,status:'SENDING',startedAt});
  return {n:{...n,attempts},attemptId};
 });
 if(!claim)return;
 const {n,attemptId}=claim,attempt=db.doc('notificationAttempts/'+attemptId);
 let acceptance=null;
 try{
  const content=message(n),result=await adapter(content,{eventId:ref.id,type:n.type,attempt:n.attempts});
  const state={status:result.simulated?'SIMULATED':'SENT',provider:result.provider||'TEST_ADAPTER',providerId:String(result.id||''),updatedAt:now()};
  acceptance=state;
  const batch=db.batch();batch.update(ref,{...state,preview:content});batch.update(attempt,state);await batch.commit();
 }catch(e){
  const codes=new Set(['NOT_CONFIGURED','INVALID_ADDRESS','INVALID_EVENT','INVALID_SMTP_CONFIG','SMTP_RECIPIENT_REJECTED','SMTP_AUTH_REJECTED','SMTP_OUTCOME_UNCERTAIN','INVALID_VIBER_MESSAGE','VIBER_REJECTED','VIBER_OUTCOME_UNCERTAIN','TEST_DESTINATION_BLOCKED']);
  // Raw provider errors/responses can echo passwords or channel tokens. Persist
  // only controlled error codes, never exception messages or request bodies.
  const errorCode=acceptance?'DELIVERY_LOG_WRITE_FAILED':codes.has(e.code)?e.code:'DELIVERY_OUTCOME_UNCERTAIN';
  const safeFailure=!acceptance&&e.confirmedNotDelivered===true;
  const state={status:safeFailure?'NOT_DELIVERED':'REVIEW',errorCode,detail:acceptance?'Provider processing completed; reconcile the delivery log before any resend.':safeFailure?'Confirmed non-delivery; an authorized retry may be possible.':'Delivery outcome uncertain; reconcile before retrying.',updatedAt:now(),nextAttemptAt:new Date(Math.min(8.64e15,Date.now()+Math.max(30000*2**(n.attempts-1),Number.isFinite(e.retryAfterMs)?e.retryAfterMs:0))).toISOString()};
  if(acceptance)Object.assign(state,{provider:acceptance.provider,providerId:acceptance.providerId,providerAccepted:acceptance.status==='SENT'});
  const batch=db.batch();batch.update(ref,state);batch.update(attempt,state);await batch.commit();
 }
}
module.exports={message,deliver};
