'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
const nodemailer=require('nodemailer');
const {validate,earnings,editStatuses,frameStatuses}=require('./core');
admin.initializeApp();
const db=admin.firestore(), REGION='asia-southeast1';
const SMTP_HOST=defineSecret('RF_SMTP_HOST');
const SMTP_PORT=defineSecret('RF_SMTP_PORT');
const SMTP_USER=defineSecret('RF_SMTP_USER');
const SMTP_PASS=defineSecret('RF_SMTP_PASS');
const SMTP_FROM=defineSecret('RF_SMTP_FROM');
const VIBER_TOKEN=defineSecret('RF_VIBER_CHANNEL_TOKEN');
const VIBER_SENDER=defineSecret('RF_VIBER_CHANNEL_SENDER_ID');
const permitted=new Set(['owner','admin','sales','encoder','editor','production']);
const now=()=>new Date().toISOString();
function fail(e){if(e instanceof HttpsError)throw e;console.error(e);throw new HttpsError('failed-precondition',String(e.message||e).slice(0,250));}
async function requireRole(req,allowed){
 if(!req.auth)throw new HttpsError('unauthenticated','Log in first');
 const d=await db.doc('staff/'+req.auth.uid).get(),s=d.data();
 if(!d.exists||s.active!==true||!permitted.has(s.role)||!allowed.includes(s.role))throw new HttpsError('permission-denied','You are not authorized for this function');
 return {uid:req.auth.uid,role:s.role,name:String(s.name||req.auth.token.email||req.auth.uid)};
}
const writer=['owner','admin','sales'],readers=['owner','admin','sales','encoder','editor','production'];
const call=(roles,handler)=>onCall({region:REGION,timeoutSeconds:60,maxInstances:12},async req=>{const actor=await requireRole(req,roles);try{return await handler(req.data||{},actor);}catch(e){return fail(e);}});
function publicOrder(o,role){
 // Production/editors cannot view payments, customer email, or financial allocations.
 if(['owner','admin','sales'].includes(role))return o;
 const {received,discount,excess,tip,editPaid,framePaid,due,subtotal,method,proofUrl, ...rest}=o;
 const items=rest.items.map(it=>{const {_paid,_discount,...item}=it;return item;});
 return {...rest,items,email:undefined};
}
exports.myAccess=onCall({region:REGION},async req=>{if(!req.auth)throw new HttpsError('unauthenticated','Sign in');const d=await db.doc('staff/'+req.auth.uid).get();const s=d.data();return d.exists&&s.active?{name:s.name||'',role:s.role,uid:req.auth.uid}:{role:null,uid:req.auth.uid};});
exports.listOrders=call(readers,async ({limit:lim=80},actor)=>{
 const size=Math.min(Math.max(Number(lim)||80,1),150);
 const s=await db.collection('orders').orderBy('createdAt','desc').limit(size).get();
 let all=s.docs.map(d=>d.data());
 if(actor.role==='editor')all=all.filter(o=>o.items.some(i=>i.kind==='editing'&&i.assignedTo===actor.uid)).map(o=>({...o,items:o.items.filter(i=>i.kind==='editing'&&i.assignedTo===actor.uid)}));
 if(actor.role==='production')all=all.filter(o=>o.items.some(i=>i.kind==='frame')).map(o=>({...o,items:o.items.filter(i=>i.kind==='frame')}));
 return {orders:all.map(o=>publicOrder(o,actor.role))};
});
exports.getOrder=call(readers,async ({posId},actor)=>{
 if(!/^\d{8}$/.test(String(posId)))throw Error('Invalid POS ID');
 const s=await db.doc('orders/'+posId).get();if(!s.exists)throw Error('Order not found');
 const o=s.data();if(actor.role==='editor'&&!o.items.some(i=>i.kind==='editing'&&i.assignedTo===actor.uid))throw Error('Not assigned');
 if(actor.role==='production'&&!o.items.some(i=>i.kind==='frame'))throw Error('No frame access');
 return {order:publicOrder(o,actor.role)};
});
exports.saveOrder=call(writer,async ({order,expectedVersion},actor)=>{
 const clean=validate(order),id=clean.posId,doc=db.doc('orders/'+id),currentTime=now();
 const outcome=await db.runTransaction(async t=>{
  const priorSnap=await t.get(doc),prior=priorSnap.exists?priorSnap.data():null;
  if(prior && !expectedVersion)throw Error('POS ID exists. Open it in history to edit; never resubmit a payment.');
  if(!prior && expectedVersion)throw Error('Order was not found; refresh without creating duplicate IDs');
  if(prior){
    if(prior.voidedAt)throw Error('Voided transaction cannot be edited');
    if(prior.version!==expectedVersion)throw Error('Order was changed elsewhere. Reload before editing.');
    if(prior.items.some(old=>!clean.items.some(x=>x.kind===old.kind&&x.existingId===old.existingId)))throw Error('Existing linked order IDs cannot be deleted or changed');
  }
  // All new item-ID lookups happen before writes, respecting Firestore transaction rules.
  const newItems=clean.items.filter(it=>!prior?.items.some(old=>old.itemKey===it.itemKey));
  const keys=newItems.map(it=>db.doc('orderKeys/'+encodeURIComponent(it.kind+'|'+it.existingId)));
  const keySnaps=await Promise.all(keys.map(k=>t.get(k)));
  keySnaps.forEach((s,i)=>{if(s.exists && s.data().posId!==id)throw Error('Order ID already used: '+newItems[i].existingId);});
  const target={...clean,createdAt:prior?.createdAt||currentTime,updatedAt:currentTime,createdBy:prior?.createdBy||actor.uid,updatedBy:actor.uid,version:(prior?.version||0)+1,status:'SYNCED',source:'FIREBASE',voidedAt:null};
  t.set(doc,target);
  keys.forEach((key,i)=>t.set(key,{posId:id,itemKey:newItems[i].itemKey,kind:newItems[i].kind,orderId:newItems[i].existingId,createdAt:currentTime}));
  // Earnings docs have stable keys. No duplicate tips or letter commissions.
  const nextEarnings=earnings(target),oldEarnings=prior?earnings(prior):[];
  for(const e of oldEarnings.filter(x=>!nextEarnings.some(y=>y.key===x.key))){t.set(db.doc('earnings/'+encodeURIComponent(e.key)),{...e,status:'VOIDED',posId:id,updatedAt:currentTime});}
  for(const e of nextEarnings){t.set(db.doc('earnings/'+encodeURIComponent(e.key)),{...e,status:'ACTIVE',posId:id,paymentDate:target.paymentDate,updatedAt:currentTime});}
  const action=prior?'UPDATED':'CREATED';
  const audit=db.collection('audit').doc();t.set(audit,{posId:id,action,actor:actor.uid,at:currentTime,previousVersion:prior?.version||0,version:target.version});
  // Outbox committed atomically with the order; delivery cannot roll back payment.
  // Notifications on NEW remittances, not every edit. No duplicate sends for a POS ID.
  if(!prior){
   if(target.email&&target.email.toUpperCase()!=='N/A')t.create(db.doc('notificationOutbox/'+id+'_CUSTOMER'),{type:'CUSTOMER',posId:id,status:'QUEUED',attempts:0,createdAt:currentTime});
   t.create(db.doc('notificationOutbox/'+id+'_VIBER'),{type:'VIBER',posId:id,status:'QUEUED',attempts:0,createdAt:currentTime});
  }
  return {posId:id,version:target.version,wasEdit:!!prior};
 });
 return {ok:true,verified:'SYNCED',...outcome,notifications:'QUEUED_AFTER_COMMIT'};
});
exports.updateItemStatus=call(['owner','admin','encoder','editor','production'],async ({posId,itemKey,status},actor)=>{
 const ref=db.doc('orders/'+String(posId));
 const res=await db.runTransaction(async t=>{
  const snap=await t.get(ref);if(!snap.exists)throw Error('Order not found');
  const order=snap.data();if(order.voidedAt)throw Error('Order voided');
  const items=order.items.map(x=>({...x})),i=items.findIndex(x=>x.itemKey===itemKey);if(i<0)throw Error('Item not found');
  const it=items[i],allowed=it.kind==='editing'?editStatuses:frameStatuses;
  if(!allowed.includes(status))throw Error('Invalid status');
  if(actor.role==='editor' && (it.kind!=='editing'||it.assignedTo!==actor.uid))throw Error('Not assigned to this editing order');
  if(actor.role==='production'&&it.kind!=='frame')throw Error('Production only updates frames');
  const old=it.status;it.status=status;
  t.update(ref,{items,updatedAt:now(),version:admin.firestore.FieldValue.increment(1)});
  t.create(db.collection('audit').doc(),{action:'ITEM_STATUS',posId,actor:actor.uid,at:now(),itemKey,old,status});
  return {old,kind:it.kind,order};
 });
 return {ok:true,oldStatus:res.old,newStatus:status};
});
exports.voidOrder=call(['owner','admin'],async ({posId,expectedVersion,reason},actor)=>{
 if(String(reason||'').trim().length<5)throw Error('Reason is required');
 await db.runTransaction(async t=>{
  const ref=db.doc('orders/'+String(posId)),snap=await t.get(ref);if(!snap.exists)throw Error('Order not found');
  const o=snap.data();if(o.voidedAt)throw Error('Already voided');
  if(o.version!==expectedVersion)throw Error('Refresh order before voiding');
  if(o.items.some(i=>i.kind==='frame'&&i.status!=='HOLD'))throw Error('Frame has production activity. Reconcile manually before voiding');
  t.update(ref,{voidedAt:now(),voidReason:String(reason),voidedBy:actor.uid,status:'VOIDED',updatedAt:now(),version:admin.firestore.FieldValue.increment(1)});
  for(const e of earnings(o))t.update(db.doc('earnings/'+encodeURIComponent(e.key)),{status:'VOIDED',updatedAt:now()});
  t.create(db.collection('audit').doc(),{posId,action:'VOID',actor:actor.uid,reason:String(reason),at:now()});
 });return {ok:true};
});
exports.dashboard=call(['owner','admin','sales'],async ({limit:lim=500})=>{
 const snaps=await db.collection('orders').orderBy('createdAt','desc').limit(Math.min(Number(lim)||500,1500)).get();
 const orders=snaps.docs.map(s=>s.data()).filter(x=>!x.voidedAt);
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
 const day=orders.filter(x=>x.paymentDate===today);
 const sum=(items,key)=>Math.round(items.reduce((a,x)=>a+(Number(x[key])||0),0)*100)/100;
 return {today,ordersToday:day.length,salesToday:sum(day,'due'),editingToday:sum(day,'editPaid'),framingToday:sum(day,'framePaid'),tipsToday:sum(day,'tip'),excessToday:sum(day,'excess'),lastRecordsScanned:snaps.size,note:'Summary scans most recent orders only; configure aggregate counters for longer history.'};
});
exports.notificationStatus=call(['owner','admin','sales'],async ({posId})=>{
 const ids=[String(posId)+'_CUSTOMER',String(posId)+'_VIBER'];
 const snaps=await Promise.all(ids.map(x=>db.doc('notificationOutbox/'+x).get()));
 return {notifications:snaps.map((s,i)=>({type:i?'VIBER':'CUSTOMER',...(s.exists?s.data():{status:'NOT_QUEUED'})}))};
});
// Email and Viber are dispatched asynchronously immediately after commit (no 1-minute polling).
// Deliberately at-most-once attempt; uncertain delivery requires manual reconciliation.
exports.deliverOutbox=onDocumentCreated({document:'notificationOutbox/{eventId}',region:REGION,secrets:[SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS,SMTP_FROM,VIBER_TOKEN,VIBER_SENDER],retry:false,timeoutSeconds:90},async event=>{
 const ref=event.data?.ref;if(!ref)return;
 const n=event.data.data(),o=(await db.doc('orders/'+n.posId).get()).data();
 if(!o){await ref.update({status:'REVIEW',detail:'Order missing',updatedAt:now()});return;}
 // Claim BEFORE network call. Never automatically resend after an ambiguous timeout.
 try{await db.runTransaction(async t=>{const s=await t.get(ref);if(s.data().status!=='QUEUED')throw Error('Already claimed');t.update(ref,{status:'SENDING',attempts:1,startedAt:now()});});}
 catch(e){return;}
 try{
  if(n.type==='CUSTOMER'){
    if(!SMTP_HOST.value()||!SMTP_USER.value()||!SMTP_PASS.value()||!SMTP_FROM.value()){
      await ref.update({status:'NOT_CONFIGURED',detail:'SMTP secrets missing; no attempt sent',updatedAt:now()});return;
    }
    const transporter=nodemailer.createTransport({host:SMTP_HOST.value(),port:Number(SMTP_PORT.value()||587),secure:Number(SMTP_PORT.value())===465,auth:{user:SMTP_USER.value(),pass:SMTP_PASS.value()},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
    const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const html=`<h2>Rocketfix Order Received</h2><p>Hello ${safe(o.first)},</p><p>We have recorded your order <b>${safe(o.posId)}</b>.</p><p>Services: ${o.items.map(i=>safe(i.kind+' '+i.existingId)).join(', ')}</p><p>Amount received: ₱${o.received.toFixed(2)}</p><p>Thank you for choosing Rocketfix Editing Services.</p>`;
    const receipt=await transporter.sendMail({from:SMTP_FROM.value(),to:o.email,subject:'Rocketfix Order Received — '+o.posId,html});
    await ref.update({status:'SENT',providerId:String(receipt.messageId||''),sentAt:now(),updatedAt:now()});
  }else if(n.type==='VIBER'){
    if(!VIBER_TOKEN.value()||!VIBER_SENDER.value()){
      await ref.update({status:'NOT_CONFIGURED',detail:'Viber secrets missing; no attempt sent',updatedAt:now()});return;
    }
    const detail=o.items.map(i=>'• '+(i.kind==='editing'?'Edit':'Frame')+': '+i.existingId+' ('+i.orderType+')').join('\n');
    const text=['✅ ROCKETFIX REMITTANCE SAVED','POS ID: '+o.posId,'Date: '+o.paymentDate,'Customer: '+o.first+' '+o.last,'Services:',detail,'Amount paid: ₱'+o.received.toFixed(2),'Payment: '+o.method,'Recorded by: '+(o.updatedBy||'Staff'),o.proofUrl?'Payment proof: '+o.proofUrl:''].filter(Boolean).join('\n').slice(0,6000);
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
    let response;
    try{response=await fetch('https://chatapi.viber.com/pa/post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auth_token:VIBER_TOKEN.value(),from:VIBER_SENDER.value(),type:'text',text}),signal:controller.signal});}finally{clearTimeout(timeout);}
    const data=await response.json();
    if(!response.ok||data.status!==0)throw Error('Viber HTTP '+response.status+' status '+data.status+' '+String(data.status_message||''));
    await ref.update({status:'SENT',providerId:String(data.message_token||''),sentAt:now(),updatedAt:now()});
  }
 }catch(e){
  console.error('Notification review '+event.params.eventId,String(e));
  await ref.update({status:'REVIEW',detail:String(e.message||e).slice(0,350),updatedAt:now()});
 }
});
