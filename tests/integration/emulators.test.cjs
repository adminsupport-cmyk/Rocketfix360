'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
if(process.env.GCLOUD_PROJECT!=='demo-rocketfix-360'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Integration tests require local demo emulators');
const admin=require('../../functions/node_modules/firebase-admin');
admin.initializeApp({projectId:'demo-rocketfix-360'});
const functionsRequire=require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const db=functionsRequire('firebase-admin/firestore').getFirestore(admin.app(),'rocketfix360database');
const {deliver}=require('../../functions/notifications');
const tokens={};
const endpoint='http://127.0.0.1:5001/demo-rocketfix-360/asia-southeast1/';
async function call(name,data={},role='owner'){
 const res=await fetch(endpoint+name,{method:'POST',headers:{'Content-Type':'application/json',...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{})},body:JSON.stringify({data})});const body=await res.json();
 if(body.error)throw Object.assign(Error(body.error.message),{code:body.error.status});assert.ok(res.ok,JSON.stringify(body));return body.result;
}
const base={posId:'11111111',paymentDate:'2026-11-10',first:'Staging',last:'Fixture',email:'fixture@example.invalid',received:2000,discount:0,tip:25,tipRecipient:'Joyce',shipping:{ship:'LBC',area:'Luzon'},items:[{kind:'editing',existingId:'RF12345A',amount:500,assignedTo:'test-editor'},{kind:'frame',existingId:'AB1C2',amount:799,size:'10"x13" - Small',shippingFee:50}]};
const save=(order=base,extra={})=>call('saveOrder',{order,requestId:'request-'+order.posId+'-initial',...extra});
before(async()=>{
 for(const role of ['owner','admin','sales','encoder','editor','production','inactive']){
 const uid='test-'+role,email=role+'@test.invalid';await admin.auth().createUser({uid,email,password:'[REDACTED_SECRET]!'});
 await db.doc('staff/'+uid).set({name:'Test '+role,role:role==='inactive'?'sales':role,active:role!=='inactive'});
 const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'[REDACTED_SECRET]!',returnSecureToken:true})});tokens[role]=(await r.json()).idToken;assert.ok(tokens[role]);
 }
});
after(()=>admin.app().delete());
test('staging workflow across Auth, callables, Firestore, rules and outbox',async t=>{
 await t.test('all HTTPS callables allow staging preflight while retaining Firebase authentication',async()=>{
 const names=require('../../tools/callable-invokers.cjs').callableNames();assert.ok(names.includes('myAccess'));assert.ok(!names.includes('deliverOutbox'));
 for(const name of names){const headers={Origin:'https://rocketfix-360-staging.web.app','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'};
 const preflight=await fetch(endpoint+name,{method:'OPTIONS',headers});assert.equal(preflight.status,204,name);assert.equal(preflight.headers.get('access-control-allow-origin'),headers.Origin,name);
 await assert.rejects(call(name,{},'none'),{code:'UNAUTHENTICATED'});}
 });
 await t.test('myAccess reads active Owner membership from the named database',async()=>{
 assert.equal(db.databaseId,'rocketfix360database');const profile=await call('myAccess');assert.equal(profile.uid,'test-owner');assert.equal(profile.role,'owner');assert.equal(profile.name,'Test owner');
 });
 await t.test('unauthenticated and inactive membership denied',async()=>{
 await assert.rejects(call('listOrders',{},'none'),{code:'UNAUTHENTICATED'});await assert.rejects(call('listOrders',{},'inactive'),{code:'PERMISSION_DENIED'});await assert.rejects(call('saveOrder',{order:base,requestId:'unauthorized-request'},'editor'),{code:'PERMISSION_DENIED'});
 });
 await t.test('pricing configuration and server quote',async()=>{
 await assert.rejects(call('savePricing',{config:{}},'sales'),{code:'PERMISSION_DENIED'});
 const cfg=await call('savePricing',{config:{fixtureOnly:true,rates:{'Luzon|Small':{rate:50,days:'3–5'}},custom:{printRate:1.25}}});assert.equal(cfg.version,1);
 const q=await call('quote',{order:{...base,items:base.items.map(i=>({...i,shippingFee:''}))}});assert.equal(q.order.shippingFee,50);
 await assert.rejects(save({...base,items:[{...base.items[1],amount:1}]}),/price changed/);
 });
 await t.test('atomic commit, immutable revision, reservations and notifications',async()=>{
 await assert.rejects(save({...base,environment:'production'}),/Production orders/);await assert.rejects(save({...base,productionEligible:true}),/cannot be approved/);
 const r=await save();assert.equal(r.version,1);const o=(await db.doc('orders/11111111').get()).data();assert.equal(o.environment,'staging');assert.equal(o.productionEligible,false);assert.equal(o.pricingStatus,'UNVERIFIED_FIXTURE');assert.equal(o.editPaid,500);assert.equal(o.framePaid,849);assert.equal(o.excess,626);assert.equal(o.tip,25);
 assert.ok((await db.doc('orders/11111111/revisions/1').get()).exists);assert.ok((await db.doc('orderKeys/frame%7CAB1C2').get()).exists);
 assert.equal((await db.doc('earnings/TIP%3A11111111').get()).data().amount,25);
 });
 await t.test('identical replay and concurrent duplicate IDs do not double charge',async()=>{
 assert.equal((await save()).version,1);await assert.rejects(save({...base,received:2001}),/Request ID reused/);
 const order={...base,posId:'22222222'};await assert.rejects(save(order),/already used/);assert.equal((await db.doc('orders/22222222').get()).exists,false);
 const a={...base,posId:'33333333',email:'N/A',items:[{kind:'editing',existingId:'RF54321B',amount:500}]},b={...a,posId:'44444444'};
 const results=await Promise.allSettled([save(a),save(b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 });
 await t.test('operational visibility through both list and get filters payments and unrelated items',async()=>{
 for(const role of ['editor','production','encoder'])for(const o of [(await call('getOrder',{posId:base.posId},role)).order,...(await call('listOrders',{},role)).orders]){
 const text=JSON.stringify(o);for(const key of ['amount','due','tip','excess','shippingFee','email'])assert.equal(text.includes('"'+key+'"'),false,key);
 if(role==='editor')assert.ok(o.items.every(i=>i.kind==='editing'&&i.assignedTo==='test-editor'));if(role==='production')assert.ok(o.items.every(i=>i.kind==='frame'));
 }
 });
 await t.test('history pagination is stable and frame lookup retains role projections',async()=>{
 const first=await call('listOrders',{limit:1});assert.equal(first.orders.length,1);assert.ok(first.nextCursor);
 const second=await call('listOrders',{limit:1,cursor:first.nextCursor});assert.equal(second.orders.length,1);assert.notEqual(first.orders[0].posId,second.orders[0].posId);
 const uncommitted=await call('getOrder',{posId:base.posId,requestId:'request-not-yet-committed'});assert.equal(uncommitted.requestCommitted,false);
 const committed=await call('getOrder',{posId:base.posId,requestId:'request-'+base.posId+'-initial'});assert.equal(committed.requestCommitted,true);assert.equal(committed.order.version,1);
 const located=await call('getOrder',{frameId:'AB1C2'});assert.equal(located.order.posId,base.posId);
 const restricted=await call('getOrder',{frameId:'AB1C2'},'production');assert.equal(restricted.order.received,undefined);assert.ok(restricted.order.items.every(i=>i.kind==='frame'));
 assert.equal((await call('listOrders',{},'editor')).nextCursor,null);await assert.rejects(call('listOrders',{cursor:first.nextCursor},'editor'),/financial access/);
 });
 await t.test('direct Firestore client reads and writes denied',async()=>{
 const url='http://127.0.0.1:8080/v1/projects/demo-rocketfix-360/databases/rocketfix360database/documents/orders/'+base.posId;
 for(const method of ['GET','PATCH']){const r=await fetch(url,{method,headers:{Authorization:'Bearer '+tokens.owner,'Content-Type':'application/json'},...(method==='PATCH'?{body:JSON.stringify({fields:{first:{stringValue:'Attack'}}})}:{})});assert.equal(r.status,403);}
 });
 await t.test('editor workflow, stale versions and cross-role status protection',async()=>{
 const o=(await call('getOrder',{posId:base.posId})).order;
 await assert.rejects(call('updateItemStatus',{posId:o.posId,itemKey:o.items[0].itemKey,status:'On going',expectedVersion:99},'editor'),/changed elsewhere/);
 await assert.rejects(call('updateItemStatus',{posId:o.posId,itemKey:o.items[1].itemKey,status:'PRINTED',expectedVersion:o.version},'editor'),/Not assigned/);
 await call('updateItemStatus',{posId:o.posId,itemKey:o.items[0].itemKey,status:'On going',fileUrl:'https://example.invalid/edit',expectedVersion:o.version},'editor');
 await assert.rejects(save(base,{expectedVersion:1,requestId:'stale-request-version'}),/changed elsewhere/);
 });
 await t.test('financial edits preserve workflow state; updates do not generate another notice',async()=>{
 const o=(await call('getOrder',{posId:base.posId})).order;
 await save({...base,received:2100},{expectedVersion:o.version,requestId:'financial-edit-request'});
 const changed=(await call('getOrder',{posId:base.posId})).order;assert.equal(changed.items[0].status,'On going');assert.equal(changed.items[0].fileUrl,'https://example.invalid/edit');
 assert.equal((await db.collection('notificationOutbox').where('posId','==',base.posId).get()).size,2);
 const snapshot=(await db.doc('notificationOutbox/11111111_CUSTOMER').get()).data().snapshot;assert.equal(snapshot.received,2000);
 });
 await t.test('late letter retries record one payment and one commission without repricing original',async()=>{
 const payload={id:'AB1C2',confirmation:'PAYMENT RECEIVED',paymentDate:'2026-11-10',method:'GCash',paymentRef:'fixture',font:'Cursive',color:'Pink',message:'N/A',commissionEmployee:'Renz Malenab'};
 const before=(await call('getOrder',{posId:base.posId})).order;
 const results=await Promise.all([call('saveLateLetter',payload),call('saveLateLetter',payload)]);assert.equal(results.filter(x=>!x.alreadyRecorded).length,1);
 const o=(await call('getOrder',{posId:base.posId})).order;assert.equal(o.due,before.due);assert.equal(o.received,before.received);assert.equal(o.items[1].lateLetter.amount,200);assert.equal((await db.doc('earnings/LETTER%3AAB1C2').get()).data().amount,50);
 await assert.rejects(call('voidOrder',{posId:o.posId,expectedVersion:o.version,reason:'test void'}),/production activity/);
 });
 await t.test('employee membership is owner controlled and assignments require active editors',async()=>{
 await assert.rejects(call('setStaff',{uid:'test-editor',role:'editor',name:'Editor',active:false},'admin'),{code:'PERMISSION_DENIED'});
 await assert.rejects(call('setStaff',{uid:'test-owner',role:'sales',name:'Owner',active:false}),/own membership/);
 await call('setStaff',{uid:'test-inactive',role:'editor',name:'Inactive',active:false});
 await assert.rejects(save({...base,posId:'55555555',items:[{...base.items[0],existingId:'RF76543C',assignedTo:'test-inactive'}]}),/active editor/);
 });
 await t.test('date reports include late letters; tips and excess stay separate from sales',async()=>{
 const s=await call('salesReport',{from:'2026-11-10',to:'2026-11-10'});assert.equal(s.totals.lateLetters,200);assert.ok(s.totals.excess>=626);assert.equal(s.totals.sales,s.totals.editing+s.totals.frames+200);
 const e=await call('earningsReport',{from:'2026-11-10',to:'2026-11-10'});assert.ok(e.rows.some(e=>e.type==='Letter Commission'&&e.amount===50));
 await assert.rejects(call('salesReport',{from:'2026-11-10',to:'2026-11-10'},'production'),{code:'PERMISSION_DENIED'});
 });
 await t.test('notification claim deduplicates, ambiguous delivery stays REVIEW, backoff and retry capped',async()=>{
 const ref=db.doc('deliveryTestEvents/claim_test');const snap=(await db.doc('notificationOutbox/11111111_CUSTOMER').get()).data().snapshot;
 // This collection has no trigger, isolating deterministic adapter failures from event delivery.
 await ref.set({type:'CUSTOMER',status:'REVIEW',snapshot:snap});await ref.update({status:'QUEUED',attempts:0});let calls=0;
 await Promise.all([deliver(db,ref,async()=>{calls++;return {id:'accepted'};}),deliver(db,ref,async()=>{calls++;return {id:'accepted'};})]);assert.equal(calls,1);assert.equal((await ref.get()).data().status,'SENT');
 await ref.update({status:'QUEUED'});await deliver(db,ref,async()=>{throw Error('timeout after possible acceptance');});assert.equal((await ref.get()).data().status,'REVIEW');
 const confirmedRef=db.doc('deliveryTestEvents/confirmed_failure_test');await confirmedRef.set({type:'CUSTOMER',status:'QUEUED',attempts:0,snapshot:snap});await deliver(db,confirmedRef,async()=>{throw Object.assign(Error('refused before delivery'),{confirmedNotDelivered:true});});assert.equal((await confirmedRef.get()).data().status,'NOT_DELIVERED');
 const retryRef=db.doc('notificationOutbox/11111111_CUSTOMER');
 for(let i=0;i<50;i++){if((await retryRef.get()).data().status==='SIMULATED')break;await new Promise(r=>setTimeout(r,200));}
 assert.equal((await retryRef.get()).data().status,'SIMULATED');
 await retryRef.update({status:'REVIEW'});await assert.rejects(call('retryNotification',{eventId:retryRef.id}),/confirmed non-delivery/);
 await retryRef.update({status:'NOT_DELIVERED',attempts:1,nextAttemptAt:new Date(Date.now()+60000).toISOString()});await assert.rejects(call('retryNotification',{eventId:retryRef.id}),/backoff/);
 await retryRef.update({nextAttemptAt:'2020-01-01T00:00:00Z'});await call('retryNotification',{eventId:retryRef.id});assert.equal((await retryRef.get()).data().status,'SIMULATED');
 await retryRef.update({status:'NOT_DELIVERED',attempts:3});await assert.rejects(call('retryNotification',{eventId:retryRef.id}),/limit/);
 });
 await t.test('Firebase trigger produces simulated previews without external deliveries',async()=>{
 const ref=db.doc('notificationOutbox/11111111_VIBER');let n;
 for(let i=0;i<50;i++){n=(await ref.get()).data();if(n.status==='SIMULATED')break;await new Promise(r=>setTimeout(r,200));}
 assert.equal(n.status,'SIMULATED');assert.match(n.preview.text,/Excess: ₱626.00/);assert.equal(n.attempts,1);
 });
 await t.test('structured edits are versioned, audited, atomic with mirroring and never repeat notifications',async()=>{
 const old=(await call('getOrder',{posId:base.posId})).order;
 const notices=(await db.collection('notificationOutbox').where('posId','==',base.posId).get()).size;
 await assert.rejects(call('editOrderRecord',{posId:base.posId,expectedVersion:old.version,patch:{received:1}}),/Unsupported record field/);
 const changes={first:'Database Corrected',shipping:{receiverName:'Database Receiver'},items:[{itemKey:old.items[0].itemKey,status:'Finalizing',fileUrl:'https://drive.google.com/file/d/test/view'}]};
 const result=await call('editOrderRecord',{posId:base.posId,expectedVersion:old.version,patch:changes});assert.equal(result.version,old.version+1);assert.equal(result.order.first,'Database Corrected');
 for(const key of ['received','due','editPaid','framePaid','tip','excess'])assert.equal(result.order[key],old[key]);
 assert.ok((await db.doc('orders/'+base.posId+'/revisions/'+result.version).get()).exists);assert.ok((await db.doc('integrationOutbox/'+base.posId+'_SHEETS_'+result.version).get()).exists);
 assert.equal((await db.collection('notificationOutbox').where('posId','==',base.posId).get()).size,notices);
 await assert.rejects(call('editOrderRecord',{posId:base.posId,expectedVersion:old.version,patch:{phone:'stale'}}),/changed elsewhere/);
 await assert.rejects(call('editOrderRecord',{posId:base.posId,expectedVersion:result.version,patch:{first:'Forbidden'}},'production'),/financial access/);
 const concurrent=await Promise.allSettled(['one','two'].map(remarks=>call('editOrderRecord',{posId:base.posId,expectedVersion:result.version,patch:{remarks}})));assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
 });
 await t.test('integration visibility and retries are owner/admin only; unverified test mirrors never send',async()=>{
 await assert.rejects(call('integrationStatus',{},'sales'),{code:'PERMISSION_DENIED'});const data=await call('integrationStatus');assert.equal(data.sheetsEnabled,false);assert.equal(data.viberEnabled,false);assert.ok(data.sheets.length>0);assert.ok(!JSON.stringify(data).includes('snapshot'));
 const event=(await db.collection('integrationOutbox').limit(1).get()).docs[0];
 await require('../../functions/sheets-mirror').processMirror(db,event.ref,{upsert:async()=>assert.fail('No external test workbook authorized')});assert.equal((await event.ref.get()).data().status,'BLOCKED');
 await assert.rejects(call('retrySheetsMirror',{eventId:event.id}),/confirmed non-write/);
 const dash=await call('dashboard');assert.ok(dash.pendingEditing>=0&&dash.pendingFrames>=0);assert.equal(dash.salesToday,dash.editingToday+dash.framingToday);
 });
 await t.test('hosting serves compiled staging application',async()=>{
 const r=await fetch('http://127.0.0.1:5050');assert.ok(r.ok);assert.match(await r.text(),/app.bundle.js/);const js=await fetch('http://127.0.0.1:5050/app.bundle.js');assert.ok(js.ok);assert.match(await js.text(),/connectAuthEmulator/);
 });
});
test('frame-only fixture validates discounts, tips, Excess and initial letter commission',async()=>{
 const order={...base,posId:'66666666',received:1200,discount:49,tip:10,items:[{kind:'frame',existingId:'XY9Z8',amount:799,size:'10"x13" - Small',shippingFee:50,addOnType:'Personalized Letter',addOnFont:'Regular',addOnColor:'Pink',addOnMessage:'N/A',addOnCommissionRecipient:'Renz Malenab'}]};
 const result=await save(order);assert.equal(result.version,1);
 const o=(await call('getOrder',{posId:order.posId})).order;
 assert.equal(o.due,1010);assert.equal(o.discount,49);assert.equal(o.tip,10);assert.equal(o.excess,190);assert.equal(o.editPaid,0);assert.equal(o.framePaid,1000);
 assert.equal(o.pricingStatus,'UNVERIFIED_FIXTURE');assert.equal(o.productionEligible,false);
 assert.equal((await db.doc('earnings/LETTER%3AXY9Z8').get()).data().amount,50);
 assert.equal((await save(order)).version,1);
});
