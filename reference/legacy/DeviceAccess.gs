/** ROCKETFIX ADMIN POS V16.0 — STAFF NAME SIGN-IN
 * Staff enters a name. A signed token expires 24 hours later.
 * No device registry, approval list or IP-address checks.
 * WARNING: Name-only sign-in is identification, NOT employee authentication.
 * Anyone who can open this web app can obtain a session by entering a name.
 * Limit web-app access to trusted accounts wherever possible.
 */
const RF_STAFF_TTL_MS = 24 * 60 * 60 * 1000;
const RF_STAFF_SECRET_PROP = 'ROCKETFIX_POS_V16_STAFF_HMAC_SECRET';
function rfStaffSigningKey_(){
  const props=PropertiesService.getScriptProperties();
  let key=props.getProperty(RF_STAFF_SECRET_PROP);
  if(key)return key;
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    key=props.getProperty(RF_STAFF_SECRET_PROP);
    if(!key){key=Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid();props.setProperty(RF_STAFF_SECRET_PROP,key);}
    return key;
  }finally{lock.releaseLock();}
}
function rfStaffB64_(v){return Utilities.base64EncodeWebSafe(v).replace(/=+$/,'');}
function rfStaffMac_(data){
  const bytes=Utilities.computeHmacSha256Signature(data,rfStaffSigningKey_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}
/**
 * V16.3: Require the shared company PIN before issuing a 24-hour session.
 * PIN verifier and HMAC secret live only in Script Properties.
 * Failed sign-ins are throttled across the deployment (10 attempts / 15 min).
 */
const RF_POS_PIN_VERIFIER_PROP='RF_POS_V163_COMPANY_PIN_VERIFIER';
const RF_POS_PIN_VERSION_PROP='RF_POS_V163_PIN_VERSION';
const RF_POS_PIN_FAIL_PROP='RF_POS_V163_PIN_FAILURES';
const RF_POS_PIN_BLOCK_PROP='RF_POS_V163_PIN_BLOCK_UNTIL';
function rfPosSame_(a,b){
  a=String(a||'');b=String(b||'');
  let diff=a.length^b.length;
  const n=Math.max(a.length,b.length);
  for(let i=0;i<n;i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function rfPosPinVerifier_(pin){
  // Server-secret HMAC prevents offline guessing from a leaked verifier alone.
  const bytes=Utilities.computeHmacSha256Signature('ROCKETFIX-PIN-V163:'+String(pin),rfStaffSigningKey_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}
function rfPosStaffSignIn(name,pin){
  name=String(name||'').trim().replace(/\s+/g,' ');
  pin=String(pin||'').trim();
  if(name.length<2||name.length>60||/[<>\x00-\x1f]/.test(name))throw Error('Enter a valid staff name (2–60 characters).');
  const lock=LockService.getScriptLock();lock.waitLock(12000);
  let expiresAt,version,nonce;
  try{
    const p=PropertiesService.getScriptProperties();
    const verifier=p.getProperty(RF_POS_PIN_VERIFIER_PROP);
    if(!verifier)throw Error('Company PIN is not configured. Ask the POS owner to run RF_POS_SETUP_COMPANY_PIN in Apps Script.');
    const now=Date.now();
    const blockedUntil=Number(p.getProperty(RF_POS_PIN_BLOCK_PROP)||0);
    if(blockedUntil>now)throw Error('Too many unsuccessful sign-ins. Try again after '+Math.ceil((blockedUntil-now)/60000)+' minute(s).');
    if(!/^\d{8,12}$/.test(pin)||!rfPosSame_(rfPosPinVerifier_(pin),verifier)){
      let n=Number(p.getProperty(RF_POS_PIN_FAIL_PROP)||0)+1;
      if(n>=10){p.setProperties({[RF_POS_PIN_FAIL_PROP]:'0',[RF_POS_PIN_BLOCK_PROP]:String(now+15*60*1000)});throw Error('Too many unsuccessful sign-ins. Try again in 15 minutes.');}
      p.setProperty(RF_POS_PIN_FAIL_PROP,String(n));
      throw Error('Incorrect company PIN. '+(10-n)+' attempt(s) remaining before temporary lockout.');
    }
    p.deleteProperty(RF_POS_PIN_FAIL_PROP);
    p.deleteProperty(RF_POS_PIN_BLOCK_PROP);
    version=p.getProperty(RF_POS_PIN_VERSION_PROP)||'';
    if(!version)throw Error('PIN configuration incomplete. Ask the owner to rerun setup.');
    expiresAt=now+RF_STAFF_TTL_MS;
    nonce=Utilities.getUuid();
  }finally{lock.releaseLock();}
  const payload=rfStaffB64_(JSON.stringify({name,exp:expiresAt,nonce,pinVersion:version}));
  return {name,token:payload+'.'+rfStaffMac_(payload),expiresAt};
}
function rfDeviceAuthorized_(token){
  const parts=String(token||'').split('.');
  if(parts.length!==2||parts[0].length>1024||parts[1].length>128)throw Error('Secure staff session missing. Sign in again.');
  if(!rfPosSame_(rfStaffMac_(parts[0]),parts[1]))throw Error('Invalid staff session. Sign in again.');
  let data;
  try{data=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));}
  catch(e){throw Error('Invalid staff session. Sign in again.');}
  const now=Date.now();
  const p=PropertiesService.getScriptProperties();
  const activeVersion=p.getProperty(RF_POS_PIN_VERSION_PROP);
  if(!activeVersion||!p.getProperty(RF_POS_PIN_VERIFIER_PROP)||!data||
     typeof data.name!=='string'||data.name.length<2||data.name.length>60||
     !Number.isFinite(data.exp)||now>data.exp||data.exp>now+RF_STAFF_TTL_MS+60000||
     !data.pinVersion||!rfPosSame_(data.pinVersion,activeVersion))
    throw Error('Staff session expired or company PIN was changed. Sign in again.');
  return {label:data.name,id:'SESSION-'+String(data.nonce||'').slice(0,8)};
}
/** Read-only verification for ambiguous save results (keeps original operation compatibility). */
function rfDevicePosStatus_(posId){
  if(!/^\d{8}$/.test(String(posId||'')))throw Error('Invalid POS ID.');
  const sh=posBook_().getSheetByName('POS Ledger');
  if(!sh)throw Error('Missing POS Ledger.');
  const row=posFindInCol_(sh,1,posId,2);
  if(row<2)return {found:false,posId:String(posId),status:'NOT_FOUND'};
  const vals=sh.getRange(row,14,1,3).getValues()[0];
  const status=String(vals[0]||'').trim().toUpperCase();
  let record=null;
  if(status==='SYNCED'){try{record=JSON.parse(vals[2]);}catch(e){}}
  return {found:true,posId:String(posId),status,error:String(vals[1]||'').slice(0,180),record};
}
/** Keep allowlisted operations (no arbitrary server function dispatch). */
function rfDeviceCall(token,operation,args){
  const staff=rfDeviceAuthorized_(token);
  args=Array.isArray(args)?args:[];
  const editor=staff.label+' ['+staff.id+']';
  switch(String(operation||'')){
    case 'status': return rfDevicePosStatus_(args[0]);
    case 'history': return posGetTransactions_();
    case 'tips': return posGetTipEmployees_();
    case 'phLocations': return rfPhLocations_(args[0],args[1],args[2]);
    case 'framePricingGet': return rfFrameSettingsGet_();
    case 'framePricingSave': return rfFrameSettingsSave_(args[0],editor);
    case 'directory': return posGetCustomerDirectory_(args[0]===true);
    case 'historical': return posGetHistoricalSales_();
    case 'lateAddonLookup': return rfLateAddonLookup_(args[0]);
    case 'lateAddonSave': return rfLateAddonSave_(args[0],editor);
    case 'lateAddonSales': return rfLateAddonSales_();
    case 'legacyGet': return posLegacyEditGet_(args[0]);
    case 'legacySave': return posLegacyEditSave_(args[0],editor);
    case 'proofStart': return posBeginProofUpload_(args[0],args[1],args[2],args[3]);
    case 'proofChunk': return posUploadProofChunk_(args[0],args[1],args[2]);
    case 'save': return posSaveTransaction_(args[0],args[1],editor);
    case 'delete': return posDeleteTransaction_(args[0],args[1],editor);
    default: throw Error('Unsupported POS operation: '+String(operation||''));
  }
}
