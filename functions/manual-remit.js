'use strict';
const {randomUUID}=require('node:crypto');
const {config,assertConfig,plan,createRemitTransport}=require('./remit-transport');
const {digest}=require('./sheets-mirror');
const now=()=>new Date().toISOString();
const safeCode=e=>/^(REMIT_|TEST_REMIT_|NO_SAFE_|ROW_|DUPLICATE_REMIT_|VERIFIED_TEST_)[A-Z_]+$/.test(e?.message||'')?e.message:'GOOGLE_SHEETS_ACCESS_OR_SCHEMA_UNAVAILABLE';
function createManualRemit(db,{transport=createRemitTransport(),cfg=config,planOrder=plan,validateConfig=assertConfig}={}){
 const actorCheck=actor=>{if(!['owner','admin'].includes(actor?.role))throw Error('Only Owner or Admin may mirror to REMIT');validateConfig(cfg);};
 const refs=(posId,itemKey,version)=>{if(!/^\d{8}$/.test(String(posId))||typeof itemKey!=='string'||itemKey.length>100)throw Error('Invalid editing order identifiers');const key=digest([cfg.spreadsheetId,cfg.sheetId,itemKey]);return {order:db.doc('orders/'+posId),ledger:db.doc('remitSyncLedger/'+key),request:db.doc('remitSyncRequests/'+key+'_'+version),counter:db.doc('remitSyncCounters/'+digest([cfg.spreadsheetId,cfg.sheetId]))};};
 const result=l=>({posId:l.posId,itemKey:l.itemKey,editingId:l.editingId,status:l.status,row:l.row,spreadsheetId:l.spreadsheetId||cfg.spreadsheetId,sheetId:l.sheetId??cfg.sheetId,tab:l.tab||cfg.tab,lastSyncedVersion:l.lastSyncedVersion||0,lastSuccessfulSyncAt:l.lastSuccessfulSyncAt||null,lastError:l.lastError||null,attempts:l.attempts||0});
 async function finish(refs,ledger,request,state){
  await db.runTransaction(async t=>{const current=(await t.get(refs.ledger)).data();if(!current||current.requestPath!==ledger.requestPath||current.startedAt!==ledger.startedAt||current.version!==ledger.version||!['WRITING','REVIEW'].includes(current.state))throw Error('REMIT_RECONCILIATION_STATE_CHANGED');t.update(refs.ledger,state);t.update(request,state);t.create(db.doc('remitSyncAudit/'+randomUUID()),{action:'RECONCILE',posId:ledger.posId,itemKey:ledger.itemKey,actor:state.reconciledBy||null,priorState:ledger.state,nextState:state.state,at:now()});});return result({...ledger,...state});
 }
 return {
  async preview({posId,itemKey},actor){
   actorCheck(actor);const r=refs(posId,itemKey,0),[o,l,c]=await Promise.all([r.order.get(),r.ledger.get(),r.counter.get()]);if(!o.exists)throw Error('Saved Firebase order not found');const order=o.data(),p=planOrder(order,itemKey),prior=l.data();
   if(prior&&['WRITING','REVIEW'].includes(prior.state))return {...result(prior),status:'REVIEW REQUIRED',needsReconciliation:true};
   let inspected;try{inspected=await transport.inspect(p,c.data()?.nextRow||cfg.firstRow,prior?.row);}catch(e){const code=safeCode(e);await db.runTransaction(async t=>{const current=(await t.get(r.ledger)).data();if(!current||!['WRITING','REVIEW'].includes(current.state))t.set(r.ledger,{...(current||{}),posId,itemKey,editingId:p.identity,spreadsheetId:cfg.spreadsheetId,sheetId:cfg.sheetId,tab:cfg.tab,row:current?.row||null,state:'FAILED',status:'FAILED',lastSyncedVersion:current?.lastSyncedVersion||0,lastSuccessfulSyncAt:current?.lastSuccessfulSyncAt||null,lastError:code,version:order.version,attempts:current?.attempts||0,updatedAt:now()});t.create(db.doc('remitSyncAudit/'+randomUUID()),{action:'PREVIEW_FAILURE',posId,itemKey,actor:actor.uid,errorCode:code,at:now()});});throw Error(code);}
   if(prior?.lastSyncedVersion===order.version&&!inspected.matches)throw Error('REMIT_EXTERNAL_CHANGE_REQUIRES_REVIEW');
   if(prior?.state==='FAILED'&&prior.lastSyncedVersion===order.version&&inspected.matches){await db.runTransaction(async t=>{const current=(await t.get(r.ledger)).data();if(current?.state==='FAILED'&&current.lastSyncedVersion===order.version)t.update(r.ledger,{state:'SYNCED',status:'MIRRORED',lastError:null,updatedAt:now()});});prior.status='MIRRORED';}
   const token=randomUUID(),previewRef=db.doc('remitSyncPreviews/'+token),preview={uid:actor.uid,posId,itemKey,version:order.version,planDigest:digest(p),configDigest:digest(cfg),row:inspected.row,action:inspected.action,createdAt:now(),expiresAt:new Date(Date.now()+300000).toISOString(),used:false};
   await db.runTransaction(async t=>{t.create(previewRef,preview);});
   return {...inspected,posId,itemKey,editingId:p.identity,version:order.version,status:prior?.status||'NOT MIRRORED',alreadyMirrored:inspected.matches&&prior?.lastSyncedVersion===order.version,confirmationToken:token,destinationLabel:cfg.destinationLabel||'ROCKETFIX360 - MASTER TEST / REMIT',testOnly:cfg.environment==='test'};
  },
  async sync({posId,itemKey,expectedVersion,confirmationToken},actor){
   actorCheck(actor);if(!/^[a-f0-9-]{36}$/.test(String(confirmationToken||'')))throw Error('Confirmed mirror preview required');
   const r=refs(posId,itemKey,expectedVersion),previewRef=db.doc('remitSyncPreviews/'+confirmationToken);
   const claim=await db.runTransaction(async t=>{
    const [os,ps,ls,qs,cs]=await Promise.all([t.get(r.order),t.get(previewRef),t.get(r.ledger),t.get(r.request),t.get(r.counter)]),o=os.data(),preview=ps.data(),prior=ls.data(),previous=qs.data();
    if(!preview||preview.uid!==actor.uid||preview.posId!==posId||preview.itemKey!==itemKey||preview.version!==expectedVersion)throw Error('Mirror confirmation does not match this order');
    if(previous?.state==='SYNCED')return {replay:true,result:result(prior)};
    if(preview.used||Date.parse(preview.expiresAt)<Date.now())throw Error('Mirror preview expired or used; preview again');
    if(!o||o.version!==expectedVersion)throw Error('Order changed; preview the current version before mirroring');
    const p=planOrder(o,itemKey);if(digest(p)!==preview.planDigest||digest(cfg)!==preview.configDigest)throw Error('Mirror plan changed; preview again');
    if(prior&&['WRITING','REVIEW'].includes(prior.state))throw Error('REMIT_RECONCILIATION_REQUIRED');
    if((previous?.attempts||0)>=3)throw Error('Manual mirror retry limit reached');
    if(!prior?.row&&preview.action==='CREATE'&&(cs.data()?.nextRow||cfg.firstRow)>preview.row)throw Error('Row reservation changed; preview again');
    const attempts=(previous?.attempts||0)+1,startedAt=now(),ledger={posId,itemKey,editingId:p.identity,spreadsheetId:cfg.spreadsheetId,sheetId:cfg.sheetId,tab:cfg.tab,row:prior?.row||preview.row,state:'WRITING',status:'MIRRORING',lastSyncedVersion:prior?.lastSyncedVersion||0,lastSuccessfulSyncAt:prior?.lastSuccessfulSyncAt||null,lastError:null,attempts,version:expectedVersion,desiredPlan:p,previousPlan:prior?.syncedPlan||null,requestPath:r.request.path,actor:actor.uid,startedAt,updatedAt:startedAt};
    if(!prior?.row&&preview.action==='CREATE')t.set(r.counter,{nextRow:preview.row+1});
    t.set(r.ledger,ledger);t.set(r.request,{...ledger,confirmationToken});t.update(previewRef,{used:true});
    t.create(db.doc('remitSyncAttempts/'+digest([r.request.path,attempts])),{posId,itemKey,version:expectedVersion,attempt:attempts,state:'WRITING',actor:actor.uid,at:startedAt});
    return {r,p,ledger,attemptRef:db.doc('remitSyncAttempts/'+digest([r.request.path,attempts]))};
   });
   if(claim.replay)return {...claim.result,replayed:true};
   try{
    const inspected=await transport.write(claim.p,claim.ledger.row),state={state:'SYNCED',status:'MIRRORED',lastSyncedVersion:expectedVersion,lastSuccessfulSyncAt:now(),lastError:null,syncedPlan:claim.p,updatedAt:now()};
    const b=db.batch();b.update(r.ledger,state);b.update(r.request,state);b.create(db.doc('remitSyncAudit/'+randomUUID()),{action:'MIRROR_SUCCESS',posId,itemKey,version:expectedVersion,row:inspected.row,actor:actor.uid,at:now()});b.update(claim.attemptRef,{state:'SYNCED',row:inspected.row,at:now()});await b.commit();return result({...claim.ledger,...state});
   }catch(e){
    // Pre-write failures are safe to retry manually. Timeouts or failure to
    // persist acceptance are REVIEW and cannot be reissued before reconciliation.
    const uncertain=e.uncertain===true||!e.confirmedNoWrite&&safeCode(e)==='GOOGLE_SHEETS_ACCESS_OR_SCHEMA_UNAVAILABLE';
    const state={state:uncertain?'REVIEW':'FAILED',status:uncertain?'REVIEW REQUIRED':'FAILED',lastError:uncertain?'REMIT_OUTCOME_UNCERTAIN':safeCode(e),updatedAt:now()};
    const b=db.batch();b.update(r.ledger,state);b.update(r.request,state);b.create(db.doc('remitSyncAudit/'+randomUUID()),{action:'MIRROR_FAILURE',posId,itemKey,version:expectedVersion,actor:actor.uid,errorCode:state.lastError,at:now()});b.update(claim.attemptRef,state);await b.commit();return result({...claim.ledger,...state});
   }
  },
  async reconcile({posId,itemKey},actor){
   actorCheck(actor);const r=refs(posId,itemKey,0),snap=await r.ledger.get(),l=snap.data();if(!l||!['WRITING','REVIEW'].includes(l.state))throw Error('Only uncertain mirror outcomes need reconciliation');
   if(l.state==='WRITING'&&Date.parse(l.startedAt)+120000>Date.now())throw Error('REMIT_WRITE_STILL_IN_PROGRESS');
   let inspected;try{inspected=await transport.inspect(l.desiredPlan,l.row,l.row);}catch(e){throw Error(safeCode(e));}
   if(inspected.matches)return finish(r,l,db.doc(l.requestPath),{state:'SYNCED',status:'MIRRORED',lastSyncedVersion:l.version,lastSuccessfulSyncAt:now(),lastError:null,syncedPlan:l.desiredPlan,reconciledBy:actor.uid,updatedAt:now()});
   // An empty/old-looking row does not prove that a timed-out write cannot
   // still commit. Only an exact positive match may resolve uncertainty.
   return {...result(l),status:'REVIEW REQUIRED'};
  },
  async statuses({posIds},actor){actorCheck(actor);if(!Array.isArray(posIds)||posIds.length>30||posIds.some(id=>!/^\d{8}$/.test(String(id))))throw Error('At most 30 saved POS IDs required');if(!posIds.length)return {records:[]};const docs=await db.collection('remitSyncLedger').where('posId','in',[...new Set(posIds)]).get();return {records:docs.docs.map(d=>result(d.data()))};}
 };
}
module.exports={createManualRemit};
