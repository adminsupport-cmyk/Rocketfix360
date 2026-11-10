'use strict';
const {digest,validateConfig}=require('./sheets-mirror');
const policy=require('./mirror-policy');
function column(n){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function overlaps(range,sheetId,row,col){return range.sheetId===sheetId&&(range.startRowIndex??0)<=row-1&&(range.endRowIndex??Infinity)>row-1&&(range.startColumnIndex??0)<=col-1&&(range.endColumnIndex??Infinity)>col-1;}
function createSheetsTransport(db,{integrationPolicy=policy,clientFactory}={}){
 let authClient;
 const client=async()=>{if(clientFactory)return clientFactory();if(!authClient){const {GoogleAuth}=require('google-auth-library');const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets']});authClient=await auth.getClient();authClient.serviceAccountEmail=(await auth.getCredentials()).client_email;}return authClient;};
 return {async upsert(plan,cfg){
  validateConfig(cfg,integrationPolicy);
  const workbook=cfg.workbooks[plan.destination],slot=plan.destination+':'+plan.tab,schema=cfg.schemas?.[slot];
  if(!schema||!schema.headerRange||!Number.isSafeInteger(schema.nextRow)||schema.nextRow<plan.firstDataRow)throw Object.assign(Error('TEST_SCHEMA_REQUIRED'),{confirmedNoWrite:true});
  const mapping=db.doc('mirrorMappings/'+digest([workbook,plan.tab,plan.key])),counter=db.doc('mirrorCounters/'+digest([workbook,plan.tab]));
  const reserved=await db.runTransaction(async t=>{
   const prior=(await t.get(mapping)).data();
   if(prior){if(prior.posId!==plan.posId||prior.identity!==plan.identity)throw Error('ROW_OWNERSHIP_CONFLICT');if(prior.lastVersion>=plan.version)return {...prior,skip:true};if(prior.state==='WRITING')throw Error('ROW_RECONCILIATION_REQUIRED');t.update(mapping,{state:'WRITING'});return prior;}
   const c=(await t.get(counter)).data(),row=c?.nextRow||schema.nextRow;
   const value={workbook,tab:plan.tab,row,posId:plan.posId,identity:plan.identity,key:plan.key,lastVersion:0,state:'WRITING'};
   t.set(counter,{nextRow:row+1});t.create(mapping,value);return value;
  });
  if(reserved.skip)return {workbook,tab:plan.tab,row:reserved.row,version:reserved.lastVersion};
  let issuedWrite=false;
  try{
   const api=await client();if(api.serviceAccountEmail!==cfg.writerServiceAccount)throw Error('WRITER_IDENTITY_MISMATCH');const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(workbook),tab="'"+plan.tab.replaceAll("'","''")+"'";
   const [headers,metadata,cells]=await Promise.all([
    api.request({url:base+'/values/'+encodeURIComponent(schema.headerRange),params:{valueRenderOption:'FORMULA'}}),
    api.request({url:base,params:{fields:'properties(timeZone),sheets(properties,protectedRanges)'}}),
    api.request({url:base+'/values/'+encodeURIComponent(tab+'!A'+reserved.row+':BB'+reserved.row),params:{valueRenderOption:'FORMULA'}})
   ]);
   if(digest(headers.data.values||[])!==cfg.headerFingerprints[slot])throw Error('HEADER_SCHEMA_CHANGED');
   for(const [col,name] of Object.entries(plan.expectedHeaders||{}))if(String(headers.data.values?.[0]?.[Number(col)-1]||'')!==name)throw Error('LEGACY_COLUMN_MAPPING_UNVERIFIED');
   if(!['Asia/Manila','Asia/Hong_Kong'].includes(cfg.timeZones?.[plan.destination]||cfg.timeZone)||metadata.data.properties?.timeZone!==(cfg.timeZones?.[plan.destination]||cfg.timeZone))throw Error('WORKBOOK_TIMEZONE_UNVERIFIED');
   const sheet=metadata.data.sheets.find(s=>s.properties.title===plan.tab);if(!sheet)throw Error('DESTINATION_TAB_MISSING');
   const existing=cells.data.values?.[0]||[],key=String(existing[plan.keyColumn-1]||''),identity=String(existing[plan.identityColumn-1]||'');
   if((key&&key!==plan.key)||(identity&&identity!==plan.identity))throw Error('DESTINATION_ROW_OCCUPIED');
   // A reserved row with data but no ownership marker is never adopted as a historical order.
   if(!key&&existing.some(v=>v!==''&&v!=null))throw Error('HISTORICAL_OR_FORMULA_ROW_BLOCKED');
   const target={...plan.cells,...(!key?plan.newOnly||{}:{})},data=[];
   for(const [raw,value] of Object.entries(target)){
    const col=Number(raw),prior=existing[col-1];if(value===undefined)continue;
    if(typeof prior==='string'&&prior.startsWith('='))throw Error('FORMULA_CELL_BLOCKED');
    if((sheet.protectedRanges||[]).some(p=>!p.warningOnly&&(!p.range||overlaps(p.range,sheet.properties.sheetId,reserved.row,col))))throw Error('PROTECTED_CELL_BLOCKED');
    if(plan.blankOnly&&prior!==''&&prior!=null&&String(prior)!==String(value))continue;
    data.push({range:tab+'!'+column(col)+reserved.row,values:[[value]]});
   }
   issuedWrite=true;
   // RAW values preserve exact letter text and never evaluate customer input as formulas.
   await api.request({url:base+'/values:batchUpdate',method:'POST',data:{valueInputOption:'RAW',data}});
   const formats=Object.entries(plan.formats||{}).filter(([col])=>data.some(d=>d.range===tab+'!'+column(Number(col))+reserved.row)).map(([col,pattern])=>({repeatCell:{range:{sheetId:sheet.properties.sheetId,startRowIndex:reserved.row-1,endRowIndex:reserved.row,startColumnIndex:Number(col)-1,endColumnIndex:Number(col)},cell:{userEnteredFormat:{numberFormat:{type:pattern.includes('hh:')?'DATE_TIME':'DATE',pattern}}},fields:'userEnteredFormat.numberFormat'}}));
   if(formats.length)await api.request({url:base+':batchUpdate',method:'POST',data:{requests:formats}});
   const verify=await api.request({url:base+'/values/'+encodeURIComponent(tab+'!'+column(plan.keyColumn)+reserved.row)});
   if(String(verify.data.values?.[0]?.[0]||'')!==plan.key)throw Error('ROW_VERIFICATION_FAILED');
   await mapping.update({state:'SYNCED',lastVersion:plan.version,updatedAt:new Date().toISOString()});
   return {workbook,tab:plan.tab,row:reserved.row,version:plan.version};
  }catch(error){if(!issuedWrite){await mapping.update({state:'READY'});throw Object.assign(Error('CONFIRMED_NO_WRITE'),{confirmedNoWrite:true});}throw Error('SHEETS_OUTCOME_UNCERTAIN');}
 }};
}
module.exports={createSheetsTransport,column,overlaps};
