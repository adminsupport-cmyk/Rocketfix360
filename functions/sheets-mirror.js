'use strict';
const {createHash}=require('node:crypto');
const policy=require('./mirror-policy');
const now=()=>new Date().toISOString();
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
// Sparse cell maps from Original_Code.gs posSyncRemit_, posSyncFrame_ and
// TrackingAutofill candidate. They are NOT approval of current workbook schemas.
function mirrorPlan(o){
 const rows=[];
 for(const i of o.items){
  const key=o.posId+'|'+i.kind+'|'+i.existingId,sh=o.shipping||{};
  if(i.kind==='editing'){
   const first=o.items.find(x=>x.kind==='editing')===i;
   rows.push({destination:'master',tab:'REMIT',firstDataRow:6,keyColumn:18,identityColumn:17,identity:i.existingId,key,cells:{...(i.fileUrl?{7:i.fileUrl}:{}),...(i.noteFileUrl?{9:i.noteFileUrl}:{}),1:o.paymentDate,2:o.email,3:[o.first,o.last].filter(Boolean).join(' '),4:i.orderType,5:i.fileType,6:i._paid,11:i.frameOrderId||'',12:o.tipRecipient||'Select',13:first?o.tip:0,14:i.notes||o.remarks||'',15:o.proofUrl||'',16:o.posId,17:i.existingId,18:key,19:o.createdAt,20:o.updatedAt,21:o.method,22:sh.ship||'',23:i._paid,24:i._discount,25:'SYNCED',26:o.received,27:i.rushTargetDate||''}});
  }else{
   const parts=String(sh.receiverName||[o.first,o.last].filter(Boolean).join(' ')).trim().split(/\s+/),last=parts.length>1?parts.pop():'';
   const cells={1:sh.ship||'LBC',3:i.existingId,4:i.size,5:i.design,6:i.amount,7:o.method,8:parts.join(' '),9:last,10:sh.contactPhone||o.phone||'',11:o.email,12:sh.street||'',13:sh.barangay||'',14:sh.city||'',15:sh.province||'',16:sh.postal||'',17:[`Shipping: ₱${Number(i.shippingFee||0).toFixed(2)} (${sh.area||''}, ${i.shippingTier||''}, ${i.shippingDays||''})`,sh.notes,i.notes,o.remarks].filter(Boolean).join(' | '),39:o.posId,40:key,41:o.paymentDate,42:i._paid,43:i._discount,44:o.createdAt,45:o.updatedAt,46:o.items.filter(x=>x.kind==='editing'&&x.frameOrderId===i.existingId).map(x=>x.existingId).join(', '),47:'SYNCED'};
   if(i.photoUrl)cells[18]=i.photoUrl;if(o.proofUrl)cells[19]=o.proofUrl;
   if(i.addOnType){Object.assign(cells,{48:i.addOnType,49:200,50:i.addOnFont,51:i.addOnMessage,52:i.addOnColor,53:i.addOnCommissionRecipient,54:50});}
   rows.push({destination:'frames',tab:'Orders',firstDataRow:2,keyColumn:40,identityColumn:3,identity:i.existingId,key,cells,newOnly:{2:o.createdAt,18:i.photoUrl||'',19:o.proofUrl||'',20:i.status||'HOLD'}});
  }
 }
 return rows.map(row=>{
  const formats=row.tab==='REMIT'?{1:'m/d/yyyy',19:'m/d/yyyy hh:mm:ss',20:'m/d/yyyy hh:mm:ss',27:'m/d/yyyy'}:row.tab==='Orders'?{2:'m/d/yyyy hh:mm:ss',41:'m/d/yyyy',44:'m/d/yyyy hh:mm:ss',45:'m/d/yyyy hh:mm:ss'}:{14:'m/d/yyyy'};
  const serial=(value,timestamp)=>{if(!value)return '';const time=Date.parse(value.length===10?value+'T00:00:00Z':value);if(!Number.isFinite(time))throw Error('INVALID_MIRROR_DATE');return time/86400000+25569+(timestamp?8/24:0);};
  for(const [column,pattern] of Object.entries(formats)){if(row.cells[column])row.cells[column]=serial(String(row.cells[column]),pattern.includes('hh:'));if(row.newOnly?.[column])row.newOnly[column]=serial(String(row.newOnly[column]),pattern.includes('hh:'));}
  const expectedHeaders=row.tab==='REMIT'?{16:'POS Transaction ID',17:'POS Editing Order ID',18:'POS Item Key'}:row.tab==='Orders'?{3:'OrderId',39:'POS Transaction ID',40:'POS Item Key',...(row.cells[48]?{48:'Add-on Type',53:'Letter Commission Employee',54:'Letter Commission Amount'}:{})}:{};
  return {...row,formats,expectedHeaders,posId:o.posId,version:o.version};
 });
}
function validateConfig(cfg,p=policy){
 if(p.testWritesAuthorized!==true||p.liveMirroringAuthorized!==false)throw Error('TEST_MIRROR_DISABLED');
 if(!cfg||cfg.environment!=='test'||cfg.schemaVerified!==true||!cfg.workbooks?.master||!cfg.workbooks?.frames)throw Error('VERIFIED_TEST_WORKBOOKS_REQUIRED');
 const ids=Object.values(cfg.workbooks);const production=Object.values(require('./mirror-destinations.json').eventualProductionDestinations).map(x=>x.spreadsheetId);if(ids.some(id=>production.includes(id)))throw Error('PRODUCTION_DESTINATION_DISABLED');if(new Set(ids).size!==2||ids.some(id=>!p.approvedTestWorkbookIds.includes(id)))throw Error('TEST_DESTINATION_BLOCKED');
 if(!cfg.writerServiceAccount||!cfg.headerFingerprints)throw Error('SCHEMA_AND_WRITER_REQUIRED');
 return cfg;
}
// Claims precede effects. Unknown outcomes are REVIEW; no blind append retries.
async function processMirror(db,ref,transport,{integrationPolicy=policy}={}){
 const claim=await db.runTransaction(async t=>{
  const snap=await t.get(ref),event=snap.data();if(!event||event.status!=='QUEUED')return null;
  if(event.manualRequested!==true){t.update(ref,{status:'NOT_REQUESTED',updatedAt:now()});return null;}
  const cfg=(await t.get(db.doc('stagingConfig/sheetsMirror'))).data();
  try{validateConfig(cfg,integrationPolicy);}catch(error){t.update(ref,{status:'BLOCKED',errorCode:error.message,updatedAt:now()});return null;}
  if((event.attempts||0)>=3){t.update(ref,{status:'FAILED',errorCode:'RETRY_LIMIT',updatedAt:now()});return null;}
  const order=(await t.get(db.doc('orders/'+event.posId))).data();if(!order||order.voidedAt){t.update(ref,{status:'CANCELLED',updatedAt:now()});return null;}
  const plans=mirrorPlan(event.snapshot),attempt=(event.attempts||0)+1,attemptRef=db.doc('integrationAttempts/'+digest([ref.id,attempt]));
  t.update(ref,{status:'PROCESSING',attempts:attempt,startedAt:now()});t.create(attemptRef,{eventId:ref.id,status:'PROCESSING',attempt,at:now()});return {event,cfg,plans,attemptRef,attempt};
 });
 if(!claim)return;
 try{
  const mappings=[];for(const plan of claim.plans)mappings.push(await transport.upsert(plan,claim.cfg));
  const b=db.batch(),state={status:'SYNCED',mappings,updatedAt:now()};b.update(ref,state);b.update(claim.attemptRef,state);await b.commit();
 }catch(error){
  const state={status:error.confirmedNoWrite===true?'FAILED':'REVIEW',errorCode:error.confirmedNoWrite===true?'CONFIRMED_NO_WRITE':'MIRROR_OUTCOME_UNCERTAIN',nextAttemptAt:new Date(Date.now()+30000*2**(claim.attempt-1)).toISOString(),updatedAt:now()};const b=db.batch();b.update(ref,state);b.update(claim.attemptRef,state);await b.commit();
 }
}
module.exports={mirrorPlan,validateConfig,processMirror,digest};
