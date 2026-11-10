/** ROCKETFIX POS PORTAL LOGIN — SERVER-SIDE SESSION AUTHENTICATION
 * Separate file in POS project; does not change Portal Code.gs or employee records.
 * Staging only until ALL public callable POS add-ons have been audited.
 */
const RF_POS_PORTAL_SPREADSHEET_ID = '1BQMyzxHDzqphIItyF9wSzfNTl1VoaM5Sg7NfU4xr77I';
const RF_POS_SESSION_SECONDS = 28800; // Eight-hour shift; absolute expiry, not sliding.
const RF_POS_SESSION_PROPERTY_PREFIX = 'RF_POS_ACTIVE_SESSION_';
function posPortalSessionKey_(token) {
  return RF_POS_SESSION_PROPERTY_PREFIX + posPortalHash_(token);
}
function posPortalHash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8)
    .map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
}
function posPortalEmployee_(employeeId) {
  const id=String(employeeId||'').trim().toUpperCase();
  if(!/^RF[A-Z0-9-]{1,24}$/.test(id))return null;
  const sh=SpreadsheetApp.openById(RF_POS_PORTAL_SPREADSHEET_ID).getSheetByName('Employees');
  if(!sh)throw Error('Portal Employees sheet missing.');
  const count=sh.getLastRow();if(count<2)return null;
  const header=sh.getRange(1,1,1,Math.min(21,sh.getLastColumn())).getDisplayValues()[0];
  const required=['EmployeeID','PIN','Role','AccessLevel','Status','FullName','TemporaryPIN','TemporaryPINExpiresAt'];
  const ix={};required.forEach(k=>{ix[k]=header.indexOf(k);if(ix[k]<0)throw Error('Portal Employees column missing: '+k);});
  const rows=sh.getRange(2,1,count-1,header.length).getDisplayValues();
  for(const r of rows){if(String(r[ix.EmployeeID]||'').trim().toUpperCase()===id){
    return {employeeId:id,fullName:String(r[ix.FullName]||id).trim().slice(0,100),
      pin:String(r[ix.PIN]||'').trim(),temporaryPin:String(r[ix.TemporaryPIN]||'').trim(),
      tempExpires:String(r[ix.TemporaryPINExpiresAt]||'').trim(),status:String(r[ix.Status]||'').trim().toLowerCase(),
      role:String(r[ix.Role]||'').trim().toLowerCase(),accessLevel:String(r[ix.AccessLevel]||'').trim().toLowerCase()};
  }}return null;
}
function posPortalAllowed_(e){
  // All Portal role/access-level labels are accepted; account must remain Active.
  return !!e && e.status === 'active';
}
function posPortalPinFingerprint_(e){return posPortalHash_(e.employeeId+'|'+e.pin+'|'+e.status+'|'+e.role+'|'+e.accessLevel);}
function posPortalLogin(employeeId,pin){
  const id=String(employeeId||'').trim().toUpperCase(),submitted=String(pin||'').trim();
  if(!id||!submitted||submitted.length>100)throw Error('Invalid Employee ID or PIN.');
  const cache=CacheService.getScriptCache(),failKey='RF_POS_FAIL_'+posPortalHash_(id).slice(0,35);
  const fails=Number(cache.get(failKey)||0);
  if(fails>=5)throw Error('Too many attempts. Please try again in 15 minutes.');
  const employee=posPortalEmployee_(id),now=Date.now();
  const tempExpiry=employee&&employee.tempExpires?new Date(employee.tempExpires).getTime():NaN;
  const temporaryValid=employee&&employee.temporaryPin&&employee.temporaryPin===submitted&&
    Number.isFinite(tempExpiry)&&tempExpiry>=now;
  if(!posPortalAllowed_(employee)||!(employee.pin&&employee.pin===submitted)&&!temporaryValid){
    cache.put(failKey,String(fails+1),900);throw Error('Invalid credentials or account not authorized for POS.');
  }
  cache.remove(failKey);
  const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  const info={employeeId:employee.employeeId,fullName:employee.fullName,
    fingerprint:posPortalPinFingerprint_(employee),created:now,
    expiresAt:now+RF_POS_SESSION_SECONDS*1000};
  // CacheService can evict entries earlier than their requested TTL. Save a durable
  // hashed-token session in Script Properties so uploads and saves don't abruptly fail.
  PropertiesService.getScriptProperties().setProperty(posPortalSessionKey_(token),JSON.stringify(info));
  cache.put('RF_POS_SESSION_'+posPortalHash_(token),JSON.stringify(info),Math.min(RF_POS_SESSION_SECONDS,21600));
  return {ok:true,token,employee:{employeeId:employee.employeeId,fullName:employee.fullName},expiresInSeconds:RF_POS_SESSION_SECONDS};
}
function posPortalSession_(token){
  const t=String(token||'');
  if(!/^[0-9a-f]{64}$/.test(t))throw Error('POS session expired. Please sign in again.');
  const hash=posPortalHash_(t),cacheKey='RF_POS_SESSION_'+hash;
  const props=PropertiesService.getScriptProperties(),propertyKey=posPortalSessionKey_(t);
  // Durable record is the authority, not an unreliable cache-only copy.
  let raw=props.getProperty(propertyKey);
  if(!raw){
    // Allow in-flight sessions created by the previous version until they naturally expire.
    raw=CacheService.getScriptCache().get(cacheKey);
    if(raw){
      try{
        const old=JSON.parse(raw);
        if(!old.expiresAt)old.expiresAt=Number(old.created||0)+3600*1000;
        if(Date.now()<old.expiresAt){raw=JSON.stringify(old);props.setProperty(propertyKey,raw);}
        else raw='';
      }catch(_){raw='';}
    }
  }
  if(!raw)throw Error('POS session expired. Please sign in again.');
  let saved;
  try{saved=JSON.parse(raw);}catch(_){props.deleteProperty(propertyKey);throw Error('POS session invalid. Please sign in again.');}
  const expiry=Number(saved.expiresAt||Number(saved.created||0)+3600*1000);
  if(!Number.isFinite(expiry)||Date.now()>=expiry){
    props.deleteProperty(propertyKey);
    CacheService.getScriptCache().remove(cacheKey);
    throw Error('POS session expired. Please sign in again.');
  }
  const current=posPortalEmployee_(saved.employeeId);
  if(!posPortalAllowed_(current)||saved.fingerprint!==posPortalPinFingerprint_(current)){
    props.deleteProperty(propertyKey);
    CacheService.getScriptCache().remove(cacheKey);
    throw Error('Your Portal account changed or access was revoked. Please sign in again.');
  }
  return {employeeId:current.employeeId,fullName:current.fullName,role:current.role};
}
function posPortalWhoAmI(token){const e=posPortalSession_(token);return {ok:true,employee:e};}
function posPortalLogout(token){
  const t=String(token||'');
  if(/^[0-9a-f]{64}$/.test(t)){
    PropertiesService.getScriptProperties().deleteProperty(posPortalSessionKey_(t));
    CacheService.getScriptCache().remove('RF_POS_SESSION_'+posPortalHash_(t));
  }
  return {ok:true};
}
/** Safe diagnostics: no PIN, session token, customer details, or secrets returned. */
function posPortalSessionHealth(token){
  const employee=posPortalSession_(token);
  return {ok:true,sessionStorage:'persistent',employeeId:employee.employeeId,verifiedAt:new Date().toISOString()};
}
/** The customer-directory and historical-reporting scripts must rename the old
 * public functions to private versions supplied in this package. */
function posPortalGetCustomerDirectory(force,token){posPortalSession_(token);return posGetCustomerDirectory_(force);}
function posPortalGetHistoricalSales(token){posPortalSession_(token);return posGetHistoricalSales_();}
