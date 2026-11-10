'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {metadata,signature,MAX,CHUNK,proofForCommit}=require('../functions/drive-proofs');
const {folderId,safeSession,createDriveProofTransport}=require('../functions/drive-proof-transport');
const p={posId:'12345678',name:'proof.png',mimeType:'image/png',size:10,sha256:'a'.repeat(64)};
test('Drive proof metadata, byte signatures and strict size/type validation',()=>{
 assert.equal(metadata(p).extension,'png');for(const patch of [{posId:'../bad'},{size:MAX+1},{size:0},{mimeType:'image/svg+xml'},{name:'proof.exe'},{sha256:'invalid'}])assert.throws(()=>metadata({...p,...patch}));
 signature(Buffer.from([137,80,78,71,13,10,26,10]),'image/png');signature(Buffer.from('%PDF-1.4'),'application/pdf');signature(Buffer.from([255,216,255]),'image/jpeg');signature(Buffer.from('RIFF1234WEBP'),'image/webp');assert.throws(()=>signature(Buffer.from('<script>'),'image/png'));assert.equal(CHUNK,256*1024);
 assert.equal(folderId('https://drive.google.com/drive/folders/1HBnKsg81SyR3CKAH65bp3ryHclMqSNXt?usp=sharing'),'1HBnKsg81SyR3CKAH65bp3ryHclMqSNXt');assert.throws(()=>safeSession('https://evil.invalid/upload/drive/v3/files'));assert.throws(()=>safeSession('https://www.googleapis.com/drive/v3/files'));
});
test('Drive transport blocks service account My Drive and publicly shared destinations',async()=>{
 let mode='my',publicFolder=false;const transport=createDriveProofTransport({clientFactory:async()=>({request:async opts=>({data:opts.url.endsWith('/permissions')?{permissions:publicFolder?[{type:'anyone',role:'reader'}]:[{type:'user',role:'owner'}]}:{id:'private-folder-id',name:'Private Proofs',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true},...(mode==='shared'?{driveId:'shared-drive-id'}:{})}})})});
 await assert.rejects(transport.inspect({folderId:'private-folder-id',mode:'SHARED_DRIVE'}),/MY_DRIVE_REQUIRES_OAUTH/);mode='shared';assert.equal((await transport.inspect({folderId:'private-folder-id',mode:'SHARED_DRIVE'})).connectionStatus,'VERIFIED');publicFolder=true;await assert.rejects(transport.inspect({folderId:'private-folder-id',mode:'MY_DRIVE_OAUTH'}),/PUBLIC/);
});
test('Drive requests never leak provider credentials in reported failures',async()=>{
 const transport=createDriveProofTransport({clientFactory:async()=>({request:async()=>{throw Object.assign(Error('sensitive-token'),{response:{status:403},config:{headers:{Authorization:'secret'}}});}})});
 await assert.rejects(transport.inspect({folderId:'private-folder-id',mode:'MY_DRIVE_OAUTH'}),e=>e.message==='DRIVE_ACCESS_DENIED'&&!e.message.includes('secret'));
 await assert.rejects(createDriveProofTransport({env:{GCLOUD_PROJECT:'rocketfix-360'}}).generateId({mode:'SHARED_DRIVE'}),/EXTERNAL_ACCESS_DISABLED/);
});
test('proof commits require verified ownership and exact POS; existing attached proofs survive corrections',async()=>{
 const state={id:'b'.repeat(64),uid:'u1',posId:'12345678',state:'READY',fileId:'drive-id',url:'https://drive.google.com/file/d/drive-id/view'};const db={doc:path=>({path})},t={get:async()=>({data:()=>state})};
 const order={posId:'12345678',proofUploadId:state.id};const ready=await proofForCommit(t,db,order,null,{uid:'u1'});assert.equal(ready.fields.proofDriveFileId,'drive-id');
 await assert.rejects(proofForCommit(t,db,order,null,{uid:'u2'}),/not verified/);await assert.rejects(proofForCommit(t,db,{...order,posId:'99999999'},null,{uid:'u1'}),/not verified/);
 state.state='CLEANING';await assert.rejects(proofForCommit(t,db,order,null,{uid:'u1'}),/not verified/);state.state='ATTACHED';await assert.rejects(proofForCommit(t,db,order,null,{uid:'u1'}),/not verified/);
 assert.equal((await proofForCommit(t,db,order,{proofUploadId:state.id},{uid:'u2'})).fields.proofDriveFileId,'drive-id');await assert.rejects(proofForCommit(t,db,{proofUrl:'https://unverified.invalid'},null,{uid:'u1'}),/uploaded and verified/);
});
test('Drive resumable transport confines sessions and reports accepted byte ranges',async()=>{
 const calls=[],requests=async o=>{calls.push(o);if(o.url.endsWith('/generateIds'))return {data:{ids:['preallocated-id']}};if(o.method==='POST')return {headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=private'}};if(o.headers['Content-Range'].startsWith('bytes */'))return {status:308,headers:{range:'bytes=0-262143'}};return {status:200};};
 const transport=createDriveProofTransport({clientFactory:async()=>({request:requests})}),cfg={mode:'MY_DRIVE_OAUTH',folderId:'private-folder-id'},record={id:'upload-id',posId:'12345678',fileId:'preallocated-id',size:300000,mimeType:'application/pdf',extension:'pdf'};
 assert.equal(await transport.generateId(cfg),'preallocated-id');record.sessionUrl=await transport.begin(cfg,record);assert.equal(calls[1].data.id,record.fileId);assert.deepEqual(calls[1].data.parents,[cfg.folderId]);assert.equal((await transport.offset(cfg,record)).offset,262144);await transport.chunk(cfg,record,Buffer.alloc(37856),262144);assert.equal(calls[3].headers['Content-Range'],'bytes 262144-299999/300000');assert.equal(calls[3].retry,false);
});
test('Drive final verification checks parent, private permissions, size and checksum',async()=>{
 const record={id:'upload-id',posId:'12345678',fileId:'drive-file-id',size:8,mimeType:'image/png',sha256:'a'.repeat(64)},cfg={mode:'MY_DRIVE_OAUTH',folderId:'private-folder-id'};let sha=record.sha256;
 const transport=createDriveProofTransport({clientFactory:async()=>({request:async o=>({data:o.url.endsWith('/permissions')?{permissions:[{type:'user',role:'owner'}]}:o.url.endsWith('/private-folder-id')?{id:cfg.folderId,name:'private',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}}:{id:record.fileId,size:8,mimeType:record.mimeType,parents:[cfg.folderId],sha256Checksum:sha,appProperties:{rocketfixUpload:record.id,rocketfixPos:record.posId}}})})});
 assert.equal((await transport.verify(cfg,record)).fileId,record.fileId);sha='b'.repeat(64);await assert.rejects(transport.verify(cfg,record),/CHECKSUM/);
});
