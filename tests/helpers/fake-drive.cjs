'use strict';
const {createHash}=require('node:crypto');
module.exports=function fakeDrive(){
 const files=new Map();let generated=0,sessions=0,chunks=0,lostResponse=false,publicFolder=false;
 const api={files,get generated(){return generated;},get sessions(){return sessions;},get chunks(){return chunks;},loseNextResponse(){lostResponse=true;},setPublic(value){publicFolder=value;},
 async inspect(cfg){if(publicFolder)throw Error('DRIVE_PUBLIC_FOLDER_OR_FILE_BLOCKED');return {...cfg,folderName:'PRIVATE TEST PROOFS',connectionStatus:'VERIFIED',identity:'EMULATOR_ONLY'};},
 async generateId(){return 'fake-drive-file-'+ ++generated;},
 async begin(cfg,p){sessions++;if(!files.has(p.fileId))files.set(p.fileId,{bytes:Buffer.alloc(0),trashed:false});return 'https://www.googleapis.com/upload/drive/v3/files?upload_id='+p.fileId;},
 async offset(cfg,p){return {offset:files.get(p.fileId).bytes.length,complete:files.get(p.fileId).bytes.length===p.size};},
 async chunk(cfg,p,bytes,offset){const f=files.get(p.fileId);if(f.bytes.length!==offset)throw Error('OFFSET_MISMATCH');chunks++;f.bytes=Buffer.concat([f.bytes,bytes]);if(lostResponse){lostResponse=false;throw Error('DRIVE_REQUEST_UNCERTAIN');}return {complete:f.bytes.length===p.size};},
 async verify(cfg,p){await this.inspect(cfg);const f=files.get(p.fileId);if(!f||f.bytes.length!==p.size)throw Error('DRIVE_NOT_FOUND');if(createHash('sha256').update(f.bytes).digest('hex')!==p.sha256)throw Error('DRIVE_CHECKSUM_MISMATCH');return {fileId:p.fileId,url:'https://drive.google.com/file/d/'+p.fileId+'/view'};},
 async trash(cfg,p){const f=files.get(p.fileId);if(f)f.trashed=true;}
 };return api;
};
