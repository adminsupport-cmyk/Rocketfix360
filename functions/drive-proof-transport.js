'use strict';
const {createHash}=require('node:crypto');
const PROJECT='rocketfix-360-staging',FOLDER='application/vnd.google-apps.folder';
function folderId(value){const s=String(value||'').trim(),id=s.match(/\/folders\/([\w-]+)/)?.[1]||s;if(!/^[\w-]{10,150}$/.test(id))throw Error('Enter a valid Drive folder ID or folder URL');return id;}
function safeSession(url){const u=new URL(url);if(u.origin!=='https://www.googleapis.com'||!u.pathname.startsWith('/upload/drive/v3/files'))throw Error('DRIVE_INVALID_UPLOAD_SESSION');return u.href;}
function createDriveProofTransport({clientFactory,env=process.env}={}){
 const cachedClients=new Map();
 const client=async mode=>{
  if(clientFactory)return clientFactory(mode);
  if(env.GCLOUD_PROJECT!==PROJECT||env.FUNCTIONS_EMULATOR==='true')throw Error('DRIVE_EXTERNAL_ACCESS_DISABLED');
  const cached=cachedClients.get(mode);if(cached&&cached.expires>Date.now())return cached.client;
  const {GoogleAuth,OAuth2Client}=require('google-auth-library');
  if(mode==='MY_DRIVE_OAUTH'){
   try{
    const adc=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
    const r=await adc.request({url:`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/RF_DRIVE_OAUTH/versions/latest:access`,timeout:10000});
    const c=JSON.parse(Buffer.from(r.data.payload.data,'base64').toString('utf8'));
    if(!c.client_id||!c.client_secret||!c.refresh_token)throw Error();
    const auth=new OAuth2Client(c.client_id,c.client_secret);auth.setCredentials({refresh_token:c.refresh_token});cachedClients.set(mode,{client:auth,expires:Date.now()+60000});return auth;
   }catch{throw Error('DRIVE_OAUTH_CONNECTION_NOT_CONFIGURED');}
  }
  const auth=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/drive']}).getClient();cachedClients.set(mode,{client:auth,expires:Date.now()+60000});return auth;
 };
 async function req(mode,options){try{return await (await client(mode)).request({timeout:20000,retry:false,...options});}catch(e){if(e.message==='DRIVE_OAUTH_CONNECTION_NOT_CONFIGURED'||e.message==='DRIVE_EXTERNAL_ACCESS_DISABLED')throw e;const status=e.response?.status;throw Error(status===401?'DRIVE_RECONNECT_REQUIRED':status===403?'DRIVE_ACCESS_DENIED':status===404?'DRIVE_NOT_FOUND':'DRIVE_REQUEST_UNCERTAIN');}}
 const base='https://www.googleapis.com/drive/v3';
 async function privatePermissions(mode,id){let pageToken;do{const r=await req(mode,{url:base+'/files/'+id+'/permissions',params:{supportsAllDrives:true,fields:'nextPageToken,permissions(type,role)',pageSize:100,...(pageToken?{pageToken}:{})}});if(!Array.isArray(r.data.permissions)||!r.data.permissions.length)throw Error('DRIVE_PRIVACY_NOT_VERIFIED');if(r.data.permissions.some(p=>p.type==='anyone'))throw Error('DRIVE_PUBLIC_FOLDER_OR_FILE_BLOCKED');pageToken=r.data.nextPageToken;}while(pageToken);}
 async function get(mode,id){const r=await req(mode,{url:base+'/files/'+id,params:{supportsAllDrives:true,fields:'id,name,mimeType,driveId,parents,trashed,size,sha256Checksum,appProperties,capabilities(canAddChildren)'}});return r.data;}
 return {
  async serverOAuthClient(){return client('MY_DRIVE_OAUTH');},
  async inspect(cfg){const id=folderId(cfg.folderId);if(!['SHARED_DRIVE','MY_DRIVE_OAUTH'].includes(cfg.mode))throw Error('Select the Drive connection type');const f=await get(cfg.mode,id);if(f.mimeType!==FOLDER||f.trashed||f.capabilities?.canAddChildren!==true)throw Error('DRIVE_FOLDER_NOT_WRITABLE');if(cfg.mode==='SHARED_DRIVE'&&!f.driveId)throw Error('DRIVE_MY_DRIVE_REQUIRES_OAUTH');await privatePermissions(cfg.mode,id);return {folderId:id,folderName:f.name,mode:cfg.mode,driveId:f.driveId||null,connectionStatus:'VERIFIED',identity:cfg.mode==='SHARED_DRIVE'?'855901392227-compute@developer.gserviceaccount.com':'Authorized Google user (server OAuth)'};},
  async generateId(cfg){const r=await req(cfg.mode,{url:base+'/files/generateIds',params:{count:1,space:'drive',type:'files'}});if(!/^[\w-]+$/.test(r.data.ids?.[0]||''))throw Error('DRIVE_FILE_ID_UNAVAILABLE');return r.data.ids[0];},
  async begin(cfg,p){const r=await req(cfg.mode,{url:'https://www.googleapis.com/upload/drive/v3/files',method:'POST',params:{uploadType:'resumable',supportsAllDrives:true,fields:'id'},headers:{'X-Upload-Content-Type':p.mimeType,'X-Upload-Content-Length':String(p.size)},data:{id:p.fileId,name:'POS-'+p.posId+'-'+p.id+'.'+p.extension,mimeType:p.mimeType,parents:[cfg.folderId],appProperties:{rocketfixUpload:p.id,rocketfixPos:p.posId}}});return safeSession(r.headers.get?.('location')||r.headers.location);},
  async offset(cfg,p){const r=await req(cfg.mode,{url:safeSession(p.sessionUrl),method:'PUT',headers:{'Content-Length':'0','Content-Range':'bytes */'+p.size},data:Buffer.alloc(0),validateStatus:s=>[200,201,308,404,410].includes(s)});if([404,410].includes(r.status))return {expired:true};if(r.status!==308)return {complete:true,offset:p.size};const range=r.headers.get?.('range')||r.headers.range;const offset=range?Number(/^bytes=0-(\d+)$/.exec(range)?.[1])+1:0;if(!Number.isSafeInteger(offset)||offset>p.size)throw Error('DRIVE_INVALID_RANGE');return {offset};},
  async chunk(cfg,p,bytes,offset){const r=await req(cfg.mode,{url:safeSession(p.sessionUrl),method:'PUT',headers:{'Content-Type':p.mimeType,'Content-Length':String(bytes.length),'Content-Range':`bytes ${offset}-${offset+bytes.length-1}/${p.size}`},data:bytes,validateStatus:s=>[200,201,308].includes(s)});return {complete:r.status!==308};},
  async verify(cfg,p){await this.inspect(cfg);const f=await get(cfg.mode,p.fileId);if(f.trashed||f.id!==p.fileId||f.mimeType!==p.mimeType||Number(f.size)!==p.size||!f.parents?.includes(cfg.folderId)||f.appProperties?.rocketfixUpload!==p.id||f.appProperties?.rocketfixPos!==p.posId)throw Error('DRIVE_FILE_VERIFICATION_FAILED');await privatePermissions(cfg.mode,f.id);let sha=f.sha256Checksum;if(!sha){const r=await req(cfg.mode,{url:base+'/files/'+f.id,params:{alt:'media',supportsAllDrives:true},responseType:'arraybuffer',maxContentLength:25*1024*1024});sha=createHash('sha256').update(Buffer.from(r.data)).digest('hex');}if(sha!==p.sha256)throw Error('DRIVE_CHECKSUM_MISMATCH');return {fileId:f.id,url:'https://drive.google.com/file/d/'+f.id+'/view'};},
  async trash(cfg,p){const f=await get(cfg.mode,p.fileId);if(f.appProperties?.rocketfixUpload!==p.id||f.appProperties?.rocketfixPos!==p.posId||!f.parents?.includes(cfg.folderId))throw Error('DRIVE_CLEANUP_OWNERSHIP_MISMATCH');await req(cfg.mode,{url:base+'/files/'+p.fileId,method:'PATCH',params:{supportsAllDrives:true},data:{trashed:true}});}
 };
}
module.exports={folderId,safeSession,createDriveProofTransport};
