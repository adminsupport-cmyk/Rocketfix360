'use strict';
const config=require('./remit-config.json');
const {validateFixtureOrder}=require('./staging-orders');
const {mirrorPlan,digest}=require('./sheets-mirror');
const {column,overlaps}=require('./sheets-transport');
const productionIds=Object.values(require('./mirror-destinations.json').eventualProductionDestinations).map(d=>d.spreadsheetId);
function assertConfig(cfg=config){
 if(cfg.environment!=='test'||cfg.enabled!==true||cfg.productionWritesEnabled!==false||productionIds.includes(cfg.spreadsheetId)||cfg.spreadsheetId!==config.spreadsheetId||cfg.sheetId!==config.sheetId||cfg.tab!=='REMIT'||cfg.firstRow!==6||cfg.lastRow!==10628||cfg.headers?.length!==26||!cfg.writerServiceAccount)throw Error('VERIFIED_TEST_REMIT_REQUIRED');
 return cfg;
}
function plan(order,itemKey){
 validateFixtureOrder(order);
 if(order.stagingTest!==true||order.voidedAt)throw Error('Only saved non-void fictional staging orders may mirror to TEST REMIT');
 const p=mirrorPlan(order).find(x=>x.destination==='master'&&x.key===itemKey);if(!p)throw Error('Saved editing item not found');
 delete p.cells[27];delete p.formats[27];p.cells[7]=order.items.find(i=>i.itemKey===itemKey)?.fileUrl||'';p.cells[9]=order.items.find(i=>i.itemKey===itemKey)?.noteFileUrl||'';
 for(const c of [6,13,23,24,26])if(!Number.isFinite(p.cells[c]))throw Error('Saved financial allocation required');
 return p;
}
function equal(a,b){return typeof b==='number'?typeof a==='number'&&Math.abs(a-b)<1e-8:String(a??'')===String(b??'');}
function matches(row,p){return Object.entries(p.cells).every(([c,v])=>equal(row[Number(c)-1],v));}
function createRemitTransport({clientFactory,cfg=config}={}){
 let cached;
 async function client(){if(clientFactory)return clientFactory();if(process.env.FUNCTIONS_EMULATOR==='true')throw Error('REMIT_EMULATOR_EXTERNAL_ACCESS_DISABLED');if(!cached){const {GoogleAuth}=require('google-auth-library'),auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets']});cached=await auth.getClient();cached.serviceAccountEmail=(await auth.getCredentials()).client_email;}if(cached.serviceAccountEmail!==cfg.writerServiceAccount)throw Error('WRITER_IDENTITY_MISMATCH');return cached;}
 const tab="'REMIT'",base='https://sheets.googleapis.com/v4/spreadsheets/'+cfg.spreadsheetId;
 async function readRange(api,range){return (await api.request({url:base+'/values/'+encodeURIComponent(range),params:{valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}})).data.values||[];}
 async function schema(api){
  assertConfig(cfg);
  const r=await api.request({url:base,params:{ranges:'REMIT!A5:Z6',includeGridData:true,fields:'properties(timeZone),sheets(properties,merges,protectedRanges,data(startRow,rowData(values(userEnteredValue,dataValidation,userEnteredFormat(numberFormat))))),namedRanges'}});
  const sheet=r.data.sheets?.find(s=>s.properties.sheetId===cfg.sheetId&&s.properties.title===cfg.tab);
  if(!sheet||r.data.properties?.timeZone!==cfg.timeZone||sheet.properties.gridProperties.rowCount<cfg.lastRow)throw Error('REMIT_SCHEMA_CHANGED');
  const header=sheet.data?.[0]?.rowData?.[0]?.values?.map(c=>c.userEnteredValue?.stringValue||'')||[];
  if(digest(header)!==digest(cfg.headers))throw Error('REMIT_HEADER_CHANGED');
  return sheet;
 }
 async function locate(api,p){
  const rows=await readRange(api,tab+'!P'+cfg.firstRow+':R'+cfg.lastRow),found=[];
  rows.forEach((r,i)=>{if(String(r[2]||'')===p.key){if(String(r[0])!==p.posId||String(r[1])!==p.identity)throw Error('REMIT_IDENTITY_CONFLICT');found.push(cfg.firstRow+i);}});
  if(found.length>1)throw Error('DUPLICATE_REMIT_KEYS_REQUIRE_REVIEW');return found[0]||null;
 }
 function validateCells(sheet,row,p,existing){
  for(const [raw,v] of Object.entries(p.cells)){
   const col=Number(raw),cell=row[col-1];if(cell?.userEnteredValue?.formulaValue)throw Error('REMIT_FORMULA_PROTECTED');
   for(const m of sheet.merges||[])if(overlaps(m,cfg.sheetId,p.row,col)&&((m.startRowIndex??0)!==p.row-1||(m.startColumnIndex??0)!==col-1))throw Error('REMIT_MERGED_CELL_PROTECTED');
   if((sheet.protectedRanges||[]).some(r=>!r.warningOnly&&(!r.range||overlaps(r.range,cfg.sheetId,p.row,col))))throw Error('REMIT_PROTECTED_CELL');
   const rule=cell?.dataValidation;if(rule?.strict){if(rule.condition?.type!=='ONE_OF_LIST'||!(rule.condition.values||[]).some(x=>equal(x.userEnteredValue,v)))throw Error('REMIT_VALIDATION_REJECTED');}
  }
  if(!existing&&row.some(c=>c?.userEnteredValue))throw Error('REMIT_UNOWNED_ROW_OCCUPIED');
 }
 async function rowData(api,row){const r=await api.request({url:base,params:{ranges:`REMIT!A${row}:Z${row}`,includeGridData:true,fields:'sheets(data(rowData(values(userEnteredValue,dataValidation))))'}});return r.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values||[];}
 return {
  async inspect(p,nextRow=cfg.firstRow,reservedRow=null){
   assertConfig(cfg);const api=await client(),sheet=await schema(api),found=await locate(api,p);
   if(reservedRow&&found&&found!==reservedRow)throw Error('REMIT_ROW_MOVED_REQUIRES_REVIEW');
   let row=found||reservedRow;
   if(!row){
    const start=Math.max(cfg.firstRow,nextRow);if(start>cfg.lastRow)throw Error('TEST_REMIT_CAPACITY_REACHED');
    const candidates=await readRange(api,tab+'!A'+start+':Z'+Math.min(start+99,cfg.lastRow));
    for(let n=start;n<=Math.min(start+99,cfg.lastRow);n++)if(!(candidates[n-start]||[]).some(v=>v!==''&&v!==null&&v!==undefined)){row=n;break;}
    if(!row)throw Error('NO_SAFE_BLANK_REMIT_ROW');
   }
   if(row<cfg.firstRow||row>cfg.lastRow)throw Error('ROW_OUTSIDE_REMIT_TABLE');
   const cells=await rowData(api,row),values=cells.map(c=>c?.userEnteredValue?.numberValue??c?.userEnteredValue?.stringValue??(c?.userEnteredValue?.formulaValue||''));
   validateCells(sheet,cells,{...p,row},!!found);
   return {schemaEvidence:{writerServiceAccount:cfg.writerServiceAccount,headerVerified:true,mergedRangeCount:(sheet.merges||[]).length,protectedRangeCount:(sheet.protectedRanges||[]).length,timeZone:cfg.timeZone},row,action:found?'UPDATE':'CREATE',matches:!!found&&matches(values,p),sheetId:cfg.sheetId,spreadsheetId:cfg.spreadsheetId,tab:cfg.tab};
  },
  async write(p,row){
   // Repeat ownership, schema, validation and formula checks immediately before a
   // single atomic Sheets batch. No append, insert, sort or column changes.
   const checked=await this.inspect(p,row,row);if(checked.row!==row)throw Error('ROW_RESERVATION_CHANGED');
   const requests=Object.entries(p.cells).map(([raw,value])=>{const col=Number(raw),pattern=p.formats?.[col],cell={userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value??'')}};if(pattern)cell.userEnteredFormat={numberFormat:{type:pattern.includes('hh:')?'DATE_TIME':'DATE',pattern}};return {updateCells:{start:{sheetId:cfg.sheetId,rowIndex:row-1,columnIndex:col-1},rows:[{values:[cell]}],fields:'userEnteredValue'+(pattern?',userEnteredFormat.numberFormat':'')}};});
   const api=await client();try{await api.request({url:base+':batchUpdate',method:'POST',timeout:20000,data:{requests}});}catch(error){const status=Number(error.response?.status||error.code);if(status>=400&&status<500&&status!==408&&status!==429)throw Object.assign(Error('REMIT_WRITE_REJECTED'),{confirmedNoWrite:true});throw Object.assign(Error('REMIT_WRITE_OUTCOME_UNCERTAIN'),{uncertain:true});}
   let verified;try{verified=await this.inspect(p,row,row);}catch{throw Object.assign(Error('REMIT_VERIFICATION_UNCERTAIN'),{uncertain:true});}
   if(!verified.matches)throw Object.assign(Error('REMIT_VERIFICATION_MISMATCH'),{uncertain:true});return verified;
  }
 };
}
module.exports={config,assertConfig,plan,matches,createRemitTransport};
