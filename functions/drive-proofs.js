'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {folderId}=require('./drive-proof-transport');
const MAX=25*1024*1024,CHUNK=256*1024,MIMES={'image/jpeg':['jpg','jpeg'],'image/png':['png'],'image/webp':['webp'],'application/pdf':['pdf']};
function metadata(p){if(!/^\d{8}$/.test(p.posId||'')||!Number.isSafeInteger(p.size)||p.size<1||p.size>MAX||!MIMES[p.mimeType]||!MIMES[p.mimeType].includes(String(p.name||'').split('.').pop().toLowerCase())||!/^[a-f0-9]{64}$/.test(p.sha256||''))throw Error('Proof must be JPG, PNG, WEBP or PDF, up to 25 MB, with a valid POS ID and checksum');return {...p,extension:MIMES[p.mimeType][0]};}
function signature(bytes,mime){const yes=mime==='image/jpeg'?bytes.length>=3&&bytes.subarray(0,3).equals(Buffer.from([255,216,255])):mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/webp'?bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP':mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':false;if(!yes)throw Error('The proof contents do not match the selected file type');}
const hash=v=>createHash('sha256').update(v).digest('hex'),at=()=>new Date().toISOString();
function createDriveProofs(db,{transport=require('./drive-proof-transport').createDriveProofTransport()}={}){
 const settings=db.doc('stagingConfig/paymentProofStorage'),uploads=db.collection('proofUploads');
 const visible=p=>({uploadId:p.id,posId:p.posId,state:p.state,size:p.size,offset:p.offset||0,fileId:['READY','ATTACHED'].includes(p.state)?p.fileId:null,url:['READY','ATTACHED'].includes(p.state)?p.url:null,createdAt:p.createdAt});
 async function getConfig(){const cfg=(await settings.get()).data();if(!cfg||cfg.connectionStatus!=='VERIFIED')throw Error('Configure and test Payment Proof Storage in Settings first');return cfg;}
 const cfgOf=p=>({folderId:p.folderId,mode:p.mode});
 async function lock(id,actor){if(!/^[a-f0-9]{64}$/.test(id||''))throw Error('Invalid proof upload identity');const ref=uploads.doc(id),token=randomUUID();const p=await db.runTransaction(async t=>{const s=await t.get(ref),p=s.data();if(!p||p.uid!==actor.uid)throw Error('Proof upload is not owned by this employee');if(p.lockUntil>Date.now())throw Error('Proof upload is still processing; retry shortly');if(['CLEANING','TRASHED'].includes(p.state))throw Error('Proof was discarded; select it again for a new transaction');t.update(ref,{lock:token,lockUntil:Date.now()+90000});return p;});return {p,ref,token};}
 async function unlock(ref,token){await db.runTransaction(async t=>{const s=await t.get(ref);if(s.data()?.lock===token)t.update(ref,{lock:null,lockUntil:0});});}
 async function failed(ref,p,e){try{const code=/^DRIVE_[A-Z_]+$/.test(e.message||'')?e.message:'PROOF_UPLOAD_NOT_CONFIRMED',b=db.batch();b.update(ref,{lastError:code,updatedAt:at()});b.create(db.collection('audit').doc(),{action:'PROOF_UPLOAD_NOT_CONFIRMED',uploadId:p.id,posId:p.posId,actor:p.uid,errorCode:code,at:at()});await b.commit();}catch{}}
 async function finish(ref,p){const f=await transport.verify(cfgOf(p),p);await ref.update({state:'READY',offset:p.size,url:f.url,verifiedAt:at(),updatedAt:at()});return visible({...p,state:'READY',offset:p.size,url:f.url});}
 return {
  async settings(){const c=(await settings.get()).data();return c?{folderId:c.folderId,mode:c.mode,folderName:c.folderName||'',connectionStatus:c.connectionStatus,identity:c.identity||'',lastError:c.lastError||null,version:c.version,verifiedAt:c.verifiedAt}: {folderId:'1HBnKsg81SyR3CKAH65bp3ryHclMqSNXt',mode:'MY_DRIVE_OAUTH',connectionStatus:'NOT_CONNECTED',version:0};},
  async test(input){return transport.inspect({folderId:folderId(input.folderId),mode:input.mode});},
  async save(input,actor){let checked;try{checked=await this.test(input);}catch(e){if(e.message!=='DRIVE_OAUTH_CONNECTION_NOT_CONFIGURED')throw e;checked={folderId:folderId(input.folderId),mode:input.mode,connectionStatus:'NOT_CONNECTED',lastError:e.message};}return db.runTransaction(async t=>{const prior=(await t.get(settings)).data();if((prior?.version||0)!==input.expectedVersion)throw Error('Proof settings changed; reload Settings');const c={...checked,version:(prior?.version||0)+1,verifiedAt:checked.connectionStatus==='VERIFIED'?at():null,updatedBy:actor.uid};t.set(settings,c);t.create(db.collection('audit').doc(),{action:'PROOF_STORAGE_CONFIGURED',actor:actor.uid,at:at(),folderId:c.folderId,mode:c.mode,version:c.version});return c;});},
  async start(input,actor){const m=metadata(input),cfg=await getConfig();const id=hash(actor.uid+'|'+m.posId+'|'+m.sha256+'|'+m.size+'|'+m.mimeType),ref=uploads.doc(id);
   await db.runTransaction(async t=>{const s=await t.get(ref);if(s.exists){if(s.data().state==='TRASHED')throw Error('This proof was discarded; use a new POS transaction');return;}const p={id,uid:actor.uid,posId:m.posId,size:m.size,sha256:m.sha256,mimeType:m.mimeType,extension:m.extension,name:String(m.name).replace(/[\x00-\x1f/\\]/g,'_').slice(0,150),folderId:cfg.folderId,mode:cfg.mode,createdAt:at(),updatedAt:at(),state:'RESERVED',offset:0};t.create(ref,p);t.create(db.collection('audit').doc(),{action:'PROOF_UPLOAD_RESERVED',actor:actor.uid,at:at(),uploadId:id,posId:m.posId});});return this.resume({uploadId:id},actor);
  },
  async resume({uploadId},actor){const {p,ref,token}=await lock(uploadId,actor);try{
   if(p.state==='ATTACHED')return visible(p);
   if(p.state==='READY')return await finish(ref,p);
   await transport.inspect(cfgOf(p));
   if(!p.fileId){p.fileId=await transport.generateId(cfgOf(p));await ref.update({fileId:p.fileId});}
   // A completed Drive write may have lost its response. Confirm the reserved ID before starting a session.
   try{return await finish(ref,p);}catch(e){if(e.message!=='DRIVE_NOT_FOUND')throw e;}
   if(p.sessionUrl){const status=await transport.offset(cfgOf(p),p);if(status.complete)return await finish(ref,p);if(!status.expired){await ref.update({offset:status.offset,state:'UPLOADING'});return visible({...p,state:'UPLOADING',offset:status.offset});}}
   p.sessionUrl=await transport.begin(cfgOf(p),p);await ref.update({sessionUrl:p.sessionUrl,state:'UPLOADING',offset:0,updatedAt:at()});return visible({...p,state:'UPLOADING',offset:0});
  }catch(e){await failed(ref,p,e);throw e;}finally{await unlock(ref,token);}},
  async chunk({uploadId,offset,data},actor){const {p,ref,token}=await lock(uploadId,actor);try{
   if(['READY','ATTACHED'].includes(p.state))return visible(p);
   if(p.state!=='UPLOADING'||!p.sessionUrl)throw Error('Resume the proof upload first');
   if(typeof data!=='string'||data.length>Math.ceil(CHUNK/3)*4||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('Invalid proof chunk');const bytes=Buffer.from(data,'base64');
   if(!Number.isSafeInteger(offset)||offset<0||!bytes.length||bytes.length>CHUNK||offset+bytes.length>p.size||(offset+bytes.length<p.size&&bytes.length!==CHUNK))throw Error('Invalid proof chunk range');if(offset===0)signature(bytes,p.mimeType);
   const state=await transport.offset(cfgOf(p),p);if(state.complete)return await finish(ref,p);if(state.expired)throw Error('Proof upload expired; retry to resume');if(state.offset!==offset){await ref.update({offset:state.offset});return visible({...p,offset:state.offset});}
   const result=await transport.chunk(cfgOf(p),p,bytes,offset);if(result.complete)return await finish(ref,p);await ref.update({offset:offset+bytes.length,updatedAt:at()});return visible({...p,offset:offset+bytes.length});
  }catch(e){await failed(ref,p,e);throw e;}finally{await unlock(ref,token);}},
  async list(){const s=await uploads.orderBy('createdAt','desc').limit(50).get();return s.docs.map(d=>visible(d.data()));},
  async cleanup({uploadId},actor){if(!/^[a-f0-9]{64}$/.test(uploadId||''))throw Error('Invalid upload');const ref=uploads.doc(uploadId);const p=await db.runTransaction(async t=>{const s=await t.get(ref),p=s.data();if(!p||p.state==='ATTACHED'||p.attachedAt||p.lockUntil>Date.now()||Date.now()-Date.parse(p.createdAt)<86400000)throw Error('Only unattached uploads older than 24 hours can be discarded');if(p.state==='TRASHED')return null;t.update(ref,{state:'CLEANING',lockUntil:Date.now()+90000});return p;});if(!p)return {state:'TRASHED'};try{if(p.fileId)await transport.trash(cfgOf(p),p);const batch=db.batch();batch.update(ref,{state:'TRASHED',lockUntil:0,updatedAt:at()});batch.create(db.collection('audit').doc(),{action:'ABANDONED_PROOF_TRASHED',uploadId,actor:actor.uid,at:at()});await batch.commit();return {state:'TRASHED'};}catch(e){await ref.update({state:'CLEANUP_REVIEW',lockUntil:0,updatedAt:at()});throw e;}}
 };
}
async function proofForCommit(t,db,order,prior,actor){
 if(!order.proofUploadId){if(order.proofUrl&&order.proofUrl!==prior?.proofUrl)throw Error('Payment proof must be uploaded and verified through the POS');if(prior?.proofUploadId)return {fields:Object.fromEntries(['proofUploadId','proofDriveFileId','proofUrl','proofFileName'].map(k=>[k,prior[k]||''])),ref:null};return {fields:{},ref:null};}
 if(!/^[a-f0-9]{64}$/.test(order.proofUploadId))throw Error('Invalid proof upload identity');const ref=db.doc('proofUploads/'+order.proofUploadId),p=(await t.get(ref)).data();
 if(!p||p.posId!==order.posId||!['READY','ATTACHED'].includes(p.state)||p.lockUntil>Date.now()||!p.fileId||!p.url||p.state==='ATTACHED'&&prior?.proofUploadId!==p.id||p.uid!==actor.uid&&prior?.proofUploadId!==p.id)throw Error('Proof upload is not verified for this transaction');
 return {fields:{proofUploadId:p.id,proofDriveFileId:p.fileId,proofUrl:p.url,proofFileName:p.name},ref};
}
module.exports={MAX,CHUNK,metadata,signature,createDriveProofs,proofForCommit};
