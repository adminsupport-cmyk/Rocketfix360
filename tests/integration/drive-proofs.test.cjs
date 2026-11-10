'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
if(process.env.GCLOUD_PROJECT!=='demo-rocketfix-360'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Local emulators required');
const admin=require('../../functions/node_modules/firebase-admin');admin.initializeApp({projectId:'demo-rocketfix-360'});const {getFirestore}=require('node:module').createRequire(require('node:path').resolve('functions/package.json'))('firebase-admin/firestore');const db=getFirestore(admin.app(),'rocketfix360database');
const {createDriveProofs,CHUNK}=require('../../functions/drive-proofs'),transport=require('../helpers/fake-drive.cjs')(),api=createDriveProofs(db,{transport}),actor={uid:'proof-sales',role:'sales'},tokens={};
async function call(name,data={},role='sales'){const r=await fetch('http://127.0.0.1:5001/demo-rocketfix-360/asia-southeast1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens[role]},body:JSON.stringify({data})});const b=await r.json();if(b.error)throw Object.assign(Error(b.error.message),{code:b.error.status});return b.result;}
const bytes=Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(CHUNK+20,65)]),sha256=createHash('sha256').update(bytes).digest('hex'),input={posId:'77441122',mimeType:'application/pdf',name:'TEST-payment-proof.pdf',size:bytes.length,sha256};
before(async()=>{for(const role of ['owner','admin','sales','editor']){const uid='proof-'+role,email=uid+'@test.invalid';await admin.auth().createUser({uid,email,password:'Proof-Emulator-Only-2026!'});await db.doc('staff/'+uid).set({name:uid,active:true,role});const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Proof-Emulator-Only-2026!',returnSecureToken:true})});tokens[role]=(await r.json()).idToken;}});
after(()=>admin.app().delete());
test('proof storage persists, checks configuration version and protects roles',async()=>{
 const c=await api.save({folderId:'private-test-folder',mode:'MY_DRIVE_OAUTH',expectedVersion:0},{uid:'proof-owner'});assert.equal(c.version,1);assert.equal((await createDriveProofs(db,{transport}).settings()).folderId,'private-test-folder');
 await assert.rejects(api.save({folderId:'private-test-folder',mode:'MY_DRIVE_OAUTH',expectedVersion:0},{uid:'proof-owner'}),/changed/);
 await assert.rejects(call('saveProofStorage',{},'admin'),{code:'PERMISSION_DENIED'});await assert.rejects(call('startProofUpload',input,'editor'),{code:'PERMISSION_DENIED'});await assert.rejects(call('proofStorageSettings',{},'sales'),{code:'PERMISSION_DENIED'});await assert.rejects(call('testProofStorage',{folderId:'private-test-folder',mode:'MY_DRIVE_OAUTH'},'owner'),/EXTERNAL_ACCESS_DISABLED/);
});
test('Drive upload retry recovers accepted bytes and final response without duplicate files',async()=>{
 let p=await api.start(input,actor);assert.equal(p.state,'UPLOADING');assert.equal(JSON.stringify(p).includes('sessionUrl'),false);assert.equal(transport.generated,1);
 transport.loseNextResponse();await assert.rejects(api.chunk({uploadId:p.uploadId,offset:0,data:bytes.subarray(0,CHUNK).toString('base64')},actor),/UNCERTAIN/);
 p=await api.start(input,actor);assert.equal(p.offset,CHUNK);assert.equal(transport.generated,1);assert.equal(transport.sessions,1);
 await assert.rejects(api.resume({uploadId:p.uploadId},{uid:'another-employee'}),/owned/);
 transport.loseNextResponse();await assert.rejects(api.chunk({uploadId:p.uploadId,offset:CHUNK,data:bytes.subarray(CHUNK).toString('base64')},actor),/UNCERTAIN/);
 p=await api.start(input,actor);assert.equal(p.state,'READY');assert.ok(p.fileId);assert.equal(transport.chunks,2);assert.equal(transport.generated,1);assert.equal((await db.doc('orders/'+input.posId).get()).exists,false);
});
test('verified proof attaches atomically to one payment and flows to REMIT Proof URL',async()=>{
 const p=await api.start(input,actor),order={posId:input.posId,first:'Proof Customer',email:'N/A',paymentDate:'2025-01-01',method:'Cash',received:100,paymentMode:'AGREED_EDITING_V1',stagingTest:false,proofUploadId:p.uploadId,proofUrl:p.url,items:[{kind:'editing',existingId:'RF77441A',amount:100}]};
 const payload={order,requestId:'proof-atomic-payment-77441122'};const saved=await call('saveOrder',payload);assert.equal(saved.record.proofDriveFileId,p.fileId);assert.equal(saved.record.proofUrl,p.url);assert.equal((await db.doc('proofUploads/'+p.uploadId).get()).data().state,'ATTACHED');assert.equal((await call('saveOrder',payload)).version,1);
 const plan=require('../../functions/sheets-mirror').mirrorPlan(saved.record);assert.equal(plan[0].cells[15],p.url);
 await assert.rejects(api.cleanup({uploadId:p.uploadId},{uid:'proof-owner'}),/unattached/);
 const before=(await db.collection('notificationOutbox').where('posId','==',input.posId).get()).size;
 const edited=await call('saveOrder',{order:{...order,remarks:'corrected',proofUploadId:undefined,proofUrl:undefined},expectedVersion:1,requestId:'proof-payment-correction-77441122'});assert.equal(edited.record.proofDriveFileId,p.fileId);assert.equal(edited.record.proofUrl,p.url);assert.equal((await db.collection('notificationOutbox').where('posId','==',input.posId).get()).size,before);
 await assert.rejects(call('saveOrder',{order:{...order,posId:'77441123',items:[{kind:'editing',existingId:'RF77442A',amount:100}]},requestId:'proof-cross-pos-blocked-77441123'}),/not verified/);assert.equal((await db.doc('orders/77441123').get()).exists,false);
});
test('public folders, invalid bytes, active cleanup and in-flight concurrent chunks fail safely',async()=>{
 const m={...input,posId:'77441124'};transport.setPublic(true);await assert.rejects(api.start(m,actor),/PUBLIC/);transport.setPublic(false);let p=await api.start(m,actor);
 await assert.rejects(api.chunk({uploadId:p.uploadId,offset:0,data:Buffer.alloc(CHUNK).toString('base64')},actor),/contents/);
 const result=await Promise.allSettled([api.chunk({uploadId:p.uploadId,offset:0,data:bytes.subarray(0,CHUNK).toString('base64')},actor),api.chunk({uploadId:p.uploadId,offset:0,data:bytes.subarray(0,CHUNK).toString('base64')},actor)]);assert.ok(result.some(x=>x.status==='fulfilled'));assert.equal(transport.files.get((await db.doc('proofUploads/'+p.uploadId).get()).data().fileId).bytes.length,CHUNK);
 await db.doc('proofUploads/'+p.uploadId).update({createdAt:'2020-01-01T00:00:00.000Z'});assert.equal((await api.cleanup({uploadId:p.uploadId},{uid:'proof-owner'})).state,'TRASHED');await assert.rejects(api.start(m,actor),/discarded/);assert.equal((await db.doc('orders/'+m.posId).get()).exists,false);
});
test('fictional proof completes the manual REMIT pipeline with API doubles only',async()=>{
 const data=Buffer.from('%PDF-1.4\nTEST ONLY\n%%EOF'),m={posId:'77441125',mimeType:'application/pdf',name:'TEST-only.pdf',size:data.length,sha256:createHash('sha256').update(data).digest('hex')};let p=await api.start(m,actor);p=await api.chunk({uploadId:p.uploadId,offset:0,data:data.toString('base64')},actor);
 const order={posId:m.posId,first:'TEST',last:'DRIVE PROOF',email:'N/A',paymentDate:'2025-01-01',method:'Cash',received:100,stagingTest:true,fixtureVersion:'ROCKETFIX-STAGING-FICTIONAL-V1',fixtureAcknowledgement:'FICTIONAL TEST ORDER',proofUploadId:p.uploadId,proofUrl:p.url,items:[{kind:'editing',existingId:'RF77445A',amount:100}]};const saved=await call('saveOrder',{order,requestId:'proof-fictional-mirror-77441125'});
 // Isolate this API-double mirror's singleton counter from the concurrently running original mirror suite.
 const isolatedDb={doc:p=>db.doc(p.startsWith('remit')?'proofTest_'+p:p),collection:p=>db.collection(p.startsWith('remit')?'proofTest_'+p:p),runTransaction:fn=>db.runTransaction(fn),batch:()=>db.batch()};
 let mirrored=false,writes=0;const cfg=require('../../functions/remit-config.json'),manual=require('../../functions/manual-remit').createManualRemit(isolatedDb,{transport:{inspect:async()=>({row:99,action:mirrored?'UPDATE':'CREATE',matches:mirrored,spreadsheetId:cfg.spreadsheetId,sheetId:cfg.sheetId}),write:async(plan,row)=>{assert.equal(plan.cells[15],p.url);writes++;mirrored=true;return {row};}}}),owner={uid:'proof-owner',role:'owner'},key=saved.record.items[0].itemKey;
 const preview=await manual.preview({posId:m.posId,itemKey:key},owner),input={posId:m.posId,itemKey:key,expectedVersion:1,confirmationToken:preview.confirmationToken};assert.equal((await manual.sync(input,owner)).status,'MIRRORED');assert.equal((await manual.sync(input,owner)).replayed,true);assert.equal(writes,1);assert.equal((await db.doc('orders/'+m.posId).get()).data().proofDriveFileId,p.fileId);
});
test('Owner destination can persist pending OAuth while uploads remain blocked',async()=>{
 const isolatedDb={doc:p=>db.doc(p==='stagingConfig/paymentProofStorage'?'stagingConfig/pendingProofTest':p),collection:p=>db.collection(p),runTransaction:fn=>db.runTransaction(fn)},pending=createDriveProofs(isolatedDb,{transport:{inspect:async()=>{throw Error('DRIVE_OAUTH_CONNECTION_NOT_CONFIGURED');}}});
 const saved=await pending.save({folderId:'private-test-folder',mode:'MY_DRIVE_OAUTH',expectedVersion:0},{uid:'proof-owner'});assert.equal(saved.connectionStatus,'NOT_CONNECTED');assert.equal((await pending.settings()).version,1);await assert.rejects(pending.start(input,actor),/Configure and test/);
});
