'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const notificationPolicy=require('./notification-policy');
const {createProviderAdapter}=require('./provider-adapters');
const credentialNames={smtpHost:'RF_SMTP_HOST',smtpPort:'RF_SMTP_PORT',smtpUser:'RF_SMTP_USER',smtpPass:'RF_SMTP_PASS',smtpFrom:'RF_SMTP_FROM',viberToken:'RF_VIBER_CHANNEL_TOKEN',viberSender:'RF_VIBER_CHANNEL_SENDER_ID'};
const credentialBindings=Object.fromEntries(Object.entries(credentialNames).map(([key,name])=>[key,defineSecret(name)]));
const providerSecrets=notificationPolicy.externalSendingAuthorized?Object.values(credentialBindings):[];
const providerAdapter=createProviderAdapter({readCredentials:()=>Object.fromEntries(Object.entries(credentialBindings).map(([key,binding])=>[key,binding.value()]))});
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const admin=require('firebase-admin');
const {createHash}=require('node:crypto');
const {validate,earnings,editStatuses,frameStatuses}=require('./core');
const {quoteOrder,pricingConfig,letter,projection,date}=require('./workflows');
admin.initializeApp();
const db=admin.firestore(), REGION='asia-southeast1';
const {assertStaging,assertStagingOrder}=require('./runtime');
function staging(){try{assertStaging();}catch(e){throw new HttpsError('failed-precondition',e.message);}}
const permitted=new Set(['owner','admin','sales','encoder','editor','production']);
const now=()=>new Date().toISOString();
function fail(e){if(e instanceof HttpsError)throw e;console.error(e);throw new HttpsError('failed-precondition',String(e.message||e).slice(0,250));}
async function requireRole(req,allowed){
 staging();
 if(!req.auth)throw new HttpsError('unauthenticated','Log in first');
 const d=await db.doc('staff/'+req.auth.uid).get(),s=d.data();
 if(!d.exists||s.active!==true||!permitted.has(s.role)||!allowed.includes(s.role))throw new HttpsError('permission-denied','You are not authorized for this function');
 return {uid:req.auth.uid,role:s.role,name:String(s.name||req.auth.token.email||req.auth.uid)};
}
const writer=['owner','admin','sales'],readers=['owner','admin','sales','encoder','editor','production'];
const call=(roles,handler,options={})=>onCall({region:REGION,timeoutSeconds:60,maxInstances:12,...options},async req=>{const actor=await requireRole(req,roles);try{return await handler(req.data||{},actor);}catch(e){return fail(e);}});
const publicOrder=(o,role,uid)=>projection(o,{role,uid});
exports.myAccess=onCall({region:REGION},async req=>{staging();if(!req.auth)throw new HttpsError('unauthenticated','Sign in');const d=await db.doc('staff/'+req.auth.uid).get();const s=d.data();return d.exists&&s.active===true&&permitted.has(s.role)?{name:s.name||'',role:s.role,uid:req.auth.uid}:{role:null,uid:req.auth.uid};});
exports.listOrders=call(readers,async ({limit:lim=80},actor)=>{
 const size=Math.min(Math.max(Number(lim)||80,1),150);
 const s=await db.collection('orders').orderBy('createdAt','desc').limit(size).get();
 let all=s.docs.map(d=>d.data());if(!writer.includes(actor.role))all=all.filter(o=>!o.voidedAt);
 if(actor.role==='editor')all=all.filter(o=>o.items.some(i=>i.kind==='editing'&&i.assignedTo===actor.uid)).map(o=>({...o,items:o.items.filter(i=>i.kind==='editing'&&i.assignedTo===actor.uid)}));
 if(actor.role==='production')all=all.filter(o=>o.items.some(i=>i.kind==='frame')).map(o=>({...o,items:o.items.filter(i=>i.kind==='frame')}));
 return {orders:all.map(o=>publicOrder(o,actor.role,actor.uid))};
});
exports.getOrder=call(readers,async ({posId},actor)=>{
 if(!/^\d{8}$/.test(String(posId)))throw Error('Invalid POS ID');
 const s=await db.doc('orders/'+posId).get();if(!s.exists)throw Error('Order not found');
 const o=s.data();if(o.voidedAt&&!writer.includes(actor.role))throw Error('Order voided');if(actor.role==='editor'&&!o.items.some(i=>i.kind==='editing'&&i.assignedTo===actor.uid))throw Error('Not assigned');
 if(actor.role==='production'&&!o.items.some(i=>i.kind==='frame'))throw Error('No frame access');
 return {order:publicOrder(o,actor.role,actor.uid)};
});
exports.saveOrder=call(writer,async ({order,expectedVersion,requestId},actor)=>{
 assertStagingOrder(order);
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(String(requestId||'')))throw Error('A stable request ID is required');
 const fingerprint=createHash('sha256').update(JSON.stringify({order,expectedVersion:expectedVersion||null})).digest('hex');
 const replayRef=db.doc('requests/'+actor.uid+'_'+requestId);
 const id=String(order?.posId||''),doc=db.doc('orders/'+id),currentTime=now();
 if(!/^\d{8}$/.test(id))throw Error('Invalid POS ID');
 const outcome=await db.runTransaction(async t=>{
  const replay=await t.get(replayRef);
  if(replay.exists){if(replay.data().fingerprint!==fingerprint)throw Error('Request ID reused with changed content');return replay.data().outcome;}
  const cfg=await t.get(db.doc('stagingConfig/pricing'));
  const clean=validate(quoteOrder(order,cfg.data()||{}));
  const priorSnap=await t.get(doc),prior=priorSnap.exists?priorSnap.data():null;
  if(prior && !expectedVersion)throw Error('POS ID exists. Open it in history to edit; never resubmit a payment.');
  if(!prior && expectedVersion)throw Error('Order was not found; refresh without creating duplicate IDs');
  if(prior){
    if(prior.voidedAt)throw Error('Voided transaction cannot be edited');
    if(prior.version!==expectedVersion)throw Error('Order was changed elsewhere. Reload before editing.');
    if(prior.items.some(old=>!clean.items.some(x=>x.kind===old.kind&&x.existingId===old.existingId)))throw Error('Existing linked order IDs cannot be deleted or changed');
  }
  for(const it of clean.items){
   const old=prior?.items.find(x=>x.itemKey===it.itemKey);
   if(old?.lateLetter&&it.addOnType)throw Error('Late letter already paid; do not add another letter charge');
   if(old?.addOnType==='Personalized Letter'&&(it.addOnType!==old.addOnType||it.addOnCommissionRecipient!==old.addOnCommissionRecipient))throw Error('Paid letter and commission recipient cannot change');
   if(old){for(const k of ['status','trackingNumber','mockupUrl','completedAt','lateLetter'])if(old[k]!==undefined)it[k]=old[k];}
  }
  const assignments=clean.items.filter(x=>x.assignedTo);
  for(const it of assignments){const staff=await t.get(db.doc('staff/'+it.assignedTo));if(!staff.exists||staff.data().active!==true||staff.data().role!=='editor')throw Error('Assigned employee must be an active editor');}
  // All new item-ID lookups happen before writes, respecting Firestore transaction rules.
  const newItems=clean.items.filter(it=>!prior?.items.some(old=>old.itemKey===it.itemKey));
  const keys=newItems.map(it=>db.doc('orderKeys/'+encodeURIComponent(it.kind+'|'+it.existingId)));
  const keySnaps=await Promise.all(keys.map(k=>t.get(k)));
  keySnaps.forEach((s,i)=>{if(s.exists && s.data().posId!==id)throw Error('Order ID already used: '+newItems[i].existingId);});
  const target={...clean,environment:'staging',productionEligible:false,createdAt:prior?.createdAt||currentTime,updatedAt:currentTime,createdBy:prior?.createdBy||actor.uid,updatedBy:actor.uid,version:(prior?.version||0)+1,status:'SYNCED',source:'FIREBASE',voidedAt:null};
  t.set(doc,target);
  t.create(db.doc('orders/'+id+'/revisions/'+target.version),{...target});
  keys.forEach((key,i)=>t.set(key,{posId:id,itemKey:newItems[i].itemKey,kind:newItems[i].kind,orderId:newItems[i].existingId,createdAt:currentTime}));
  // Earnings docs have stable keys. No duplicate tips or letter commissions.
  const nextEarnings=earnings(target),oldEarnings=prior?earnings(prior):[];
  for(const e of oldEarnings.filter(x=>!nextEarnings.some(y=>y.key===x.key))){t.set(db.doc('earnings/'+encodeURIComponent(e.key)),{...e,status:'VOIDED',posId:id,updatedAt:currentTime});}
  for(const e of nextEarnings){t.set(db.doc('earnings/'+encodeURIComponent(e.key)),{...e,status:'ACTIVE',posId:id,paymentDate:target.paymentDate,updatedAt:currentTime});}
  const action=prior?'UPDATED':'CREATED';
  const audit=db.collection('audit').doc();t.set(audit,{posId:id,action,actor:actor.uid,at:currentTime,previousVersion:prior?.version||0,version:target.version,before:prior,after:target});
  // Outbox committed atomically with the order; delivery cannot roll back payment.
  // Notifications on NEW remittances, not every edit. No duplicate sends for a POS ID.
  if(!prior){
   if(target.email&&target.email.toUpperCase()!=='N/A')t.create(db.doc('notificationOutbox/'+id+'_CUSTOMER'),{type:'CUSTOMER',posId:id,snapshot:target,status:'QUEUED',attempts:0,createdAt:currentTime});
   t.create(db.doc('notificationOutbox/'+id+'_VIBER'),{type:'VIBER',posId:id,snapshot:target,status:'QUEUED',attempts:0,createdAt:currentTime});
  }
  const outcome={posId:id,version:target.version,wasEdit:!!prior};
  t.create(replayRef,{fingerprint,outcome,createdAt:currentTime});return outcome;
 });
 return {ok:true,verified:'SYNCED',...outcome,notifications:'QUEUED_AFTER_COMMIT'};
});
exports.updateItemStatus=call(['owner','admin','encoder','editor','production'],async ({posId,itemKey,status,expectedVersion,fileUrl,trackingNumber,mockupUrl,assignedTo},actor)=>{
 const ref=db.doc('orders/'+String(posId));
 const res=await db.runTransaction(async t=>{
  const snap=await t.get(ref);if(!snap.exists)throw Error('Order not found');
  const order=snap.data();if(order.version!==expectedVersion)throw Error('Order was changed elsewhere. Reload before editing.');if(order.voidedAt)throw Error('Order voided');
  const items=order.items.map(x=>({...x})),i=items.findIndex(x=>x.itemKey===itemKey);if(i<0)throw Error('Item not found');
  const it=items[i],allowed=it.kind==='editing'?editStatuses:frameStatuses;
  if(!allowed.includes(status))throw Error('Invalid status');
  if(actor.role==='editor' && (it.kind!=='editing'||it.assignedTo!==actor.uid))throw Error('Not assigned to this editing order');
  if(actor.role==='production'&&it.kind!=='frame')throw Error('Production only updates frames');
  if(assignedTo!==undefined){
   if(!['owner','admin','encoder'].includes(actor.role)||it.kind!=='editing')throw Error('Assignment requires admin or encoder');
   if(assignedTo){const member=await t.get(db.doc('staff/'+String(assignedTo)));if(!member.exists||member.data().active!==true||member.data().role!=='editor')throw Error('Assigned employee must be an active editor');}
   it.assignedTo=String(assignedTo);
  }
  const link=v=>{if(v&&!/^https:\/\//i.test(v))throw Error('File links must begin with https://');return String(v||'').slice(0,2000);};
  if(fileUrl!==undefined){if(it.kind!=='editing')throw Error('Editing file only');it.fileUrl=link(fileUrl);}
  if(mockupUrl!==undefined){if(it.kind!=='frame')throw Error('Frame mockup only');it.mockupUrl=link(mockupUrl);}
  if(trackingNumber!==undefined){if(it.kind!=='frame')throw Error('Frame tracking only');it.trackingNumber=String(trackingNumber).trim().slice(0,120);}
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
  if(o.items.some(i=>i.kind==='frame'&&(i.status!=='HOLD'||i.trackingNumber||i.mockupUrl||i.lateLetter)))throw Error('Frame has production activity. Reconcile manually before voiding');
  t.update(ref,{voidedAt:now(),voidReason:String(reason),voidedBy:actor.uid,status:'VOIDED',updatedAt:now(),version:admin.firestore.FieldValue.increment(1)});
  for(const e of earnings(o))t.update(db.doc('earnings/'+encodeURIComponent(e.key)),{status:'VOIDED',updatedAt:now()});
  t.create(db.collection('audit').doc(),{posId,action:'VOID',actor:actor.uid,reason:String(reason),at:now()});
 });return {ok:true};
});
exports.dashboard=call(writer,async()=>{
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
 const snaps=await db.collection('orders').where('paymentDate','==',today).get();
 const day=snaps.docs.map(s=>s.data()).filter(o=>!o.voidedAt&&o.status==='SYNCED');
 const late=await db.collection('lateLetters').where('paymentDate','==',today).get();
 const sum=key=>Math.round(day.reduce((a,o)=>a+o[key],0)*100)/100;
 return {today,ordersToday:day.length,salesToday:Math.round((sum('editPaid')+sum('framePaid')+late.size*200)*100)/100,editingToday:sum('editPaid'),framingToday:sum('framePaid')+late.size*200,tipsToday:sum('tip'),excessToday:sum('excess'),lateLettersToday:late.size*200,lastRecordsScanned:snaps.size,note:'Manila payment date; sales includes late letters and excludes tips and Excess.'};
});
exports.notificationStatus=call(['owner','admin','sales'],async ({posId})=>{
 if(!/^\d{8}$/.test(String(posId)))throw Error('Invalid POS ID');
 const snaps=await db.collection('notificationOutbox').where('posId','==',posId).get();
 return {notifications:snaps.docs.map(s=>{const {snapshot,...state}=s.data();return {eventId:s.id,...state};})};
});
// Provider adapters exist, but the version-controlled sending policy is OFF.
// No credential lookup or provider connection occurs in the default simulator.
const {deliver}=require('./notifications');
exports.deliverOutbox=onDocumentCreated({document:'notificationOutbox/{eventId}',region:REGION,retry:false,timeoutSeconds:60,secrets:providerSecrets},async event=>{
 staging();if(event.data)await deliver(db,event.data.ref,providerAdapter);
});
exports.retryNotification=call(['owner','admin'],async ({eventId})=>{
 if(!/^[A-Za-z0-9_-]+$/.test(String(eventId)))throw Error('Invalid notification ID');
 const ref=db.doc('notificationOutbox/'+eventId);
 await db.runTransaction(async t=>{const snap=await t.get(ref),n=snap.data();
  if(!n||n.status!=='NOT_DELIVERED')throw Error('Only confirmed non-delivery can be retried; REVIEW requires reconciliation');
  if(n.attempts>=3||!Number.isFinite(Date.parse(n.nextAttemptAt))||Date.parse(n.nextAttemptAt)>Date.now())throw Error('Retry limit or backoff active');
  t.update(ref,{status:'QUEUED',updatedAt:now()});
 });
 await deliver(db,ref,providerAdapter);return {ok:true};
},{secrets:providerSecrets});
exports.getPricing=call(writer,async()=>({...(await db.doc('stagingConfig/pricing').get()).data()||{rates:{},custom:{}}}));
exports.savePricing=call(['owner','admin'],async ({config,expectedVersion},actor)=>{
 const clean=pricingConfig(config||{}),ref=db.doc('stagingConfig/pricing');
 return db.runTransaction(async t=>{const prior=(await t.get(ref)).data();if((prior?.version||0)!==(expectedVersion||0))throw Error('Pricing changed; reload settings');
 const target={...clean,version:(prior?.version||0)+1,updatedAt:now()};t.set(ref,target);
 t.create(db.collection('audit').doc(),{action:'PRICING',actor:actor.uid,at:now(),before:prior||null,after:target});return target;});
});
exports.quote=call(writer,async ({order})=>({order:quoteOrder(order,(await db.doc('stagingConfig/pricing').get()).data()||{},false)}));
exports.listStaff=call(['owner','admin','sales','encoder'],async()=>({staff:(await db.collection('staff').get()).docs.map(d=>({uid:d.id,name:d.data().name,role:d.data().role,active:d.data().active===true}))}));
exports.setStaff=call(['owner'],async ({uid,name,role,active},actor)=>{
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(String(uid))||!permitted.has(role)||typeof active!=='boolean'||!String(name||'').trim())throw Error('Valid staff UID, name, role and active state required');
 if(uid===actor.uid)throw Error('Cannot change your own membership');
 await admin.auth().getUser(uid);
 const ref=db.doc('staff/'+uid);await db.runTransaction(async t=>{const prior=(await t.get(ref)).data();const target={name:String(name).trim().slice(0,120),role,active};t.set(ref,target);t.create(db.collection('audit').doc(),{action:'STAFF',actor:actor.uid,uid,at:now(),before:prior||null,after:target});});return {ok:true};
});
exports.earningsReport=call(readers,async ({from,to},actor)=>{
 date(from);date(to);if(from>to)throw Error('Invalid date range');
 if(!['owner','admin','sales'].includes(actor.role))throw Error('Earnings require financial access');
 const s=await db.collection('earnings').where('paymentDate','>=',from).where('paymentDate','<=',to).get();
 const rows=s.docs.map(d=>d.data()).filter(e=>e.status==='ACTIVE');return {rows,total:Math.round(rows.reduce((a,e)=>a+e.amount,0)*100)/100};
});
exports.salesReport=call(writer,async ({from,to})=>{
 date(from);date(to);if(from>to)throw Error('Invalid date range');
 const snaps=await db.collection('orders').where('paymentDate','>=',from).where('paymentDate','<=',to).get();
 const orders=snaps.docs.map(s=>s.data()).filter(o=>!o.voidedAt&&o.status==='SYNCED');
 const late=await db.collection('lateLetters').where('paymentDate','>=',from).where('paymentDate','<=',to).get();
 const lateLetters=late.docs.map(d=>d.data());
 const sum=key=>Math.round(orders.reduce((a,o)=>a+o[key],0)*100)/100;
 return {orders,lateLetters,totals:{orders:orders.length,editing:sum('editPaid'),frames:sum('framePaid'),tips:sum('tip'),excess:sum('excess'),lateLetters:lateLetters.length*200,sales:Math.round((sum('editPaid')+sum('framePaid')+lateLetters.length*200)*100)/100},note:'Sales excludes tips and Excess; framing includes shipping and at-order letters.'};
});
exports.saveLateLetter=call(writer,async (payload,actor)=>{
 const id=String(payload.id||'').toUpperCase();if(!/^[A-Z]{2}\d[A-Z]\d$/.test(id))throw Error('Invalid frame ID');
 const value=letter(payload),ref=db.doc('lateLetters/'+id);
 return db.runTransaction(async t=>{
  const prior=(await t.get(ref)).data();
  if(prior)return {ok:true,alreadyRecorded:true,id,amount:200};
  const key=(await t.get(db.doc('orderKeys/'+encodeURIComponent('frame|'+id)))).data();if(!key)throw Error('Frame not found');
  const orderRef=db.doc('orders/'+key.posId),o=(await t.get(orderRef)).data();if(!o||o.voidedAt)throw Error('Order unavailable');
  const it=o.items.find(i=>i.kind==='frame'&&i.existingId===id);if(!it||it.addOnType||it.lateLetter||/SHIP|DELIVER|COMPLET|REFUND|CANCEL/i.test(it.status))throw Error('Frame cannot accept another letter');
  const target={...value,id,posId:o.posId,recordedBy:actor.uid,createdAt:now()};
  // Separate late payment: never reprice the original order or charge its ledger twice.
  const items=o.items.map(i=>i===it?{...i,lateLetter:target}:i);
  t.create(ref,target);t.update(orderRef,{items,version:o.version+1,updatedAt:now()});
  t.create(db.doc('earnings/'+encodeURIComponent('LETTER:'+id)),{key:'LETTER:'+id,type:'Letter Commission',employee:value.addOnCommissionRecipient,amount:50,letterSale:200,frameId:id,posId:o.posId,paymentDate:value.paymentDate,status:'ACTIVE',updatedAt:now()});
  t.create(db.collection('audit').doc(),{action:'LATE_LETTER',actor:actor.uid,at:now(),posId:o.posId,after:target});
  t.create(db.doc('notificationOutbox/ADDON_'+id),{type:'LATE_VIBER',posId:o.posId,status:'QUEUED',attempts:0,createdAt:now(),snapshot:target});
  return {ok:true,alreadyRecorded:false,id,amount:200};
 });
});
