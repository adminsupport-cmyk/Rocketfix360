/** ROCKETFIX POS V15.7 — audited legacy REMIT / Frame Orders edits.
 * Source rows remain in their ORIGINAL sheets. No POS IDs or new orders are made.
 * Install as a NEW file in the existing device-guarded POS Apps Script project.
 * Add the two cases in the existing rfDeviceCall() switch (see README).
 */
const RF_LEGACY_AUDIT_TAB = 'POS Historical Edit Audit';
const RF_LEGACY_SNAPSHOT_TAB = 'POS Historical Sales';
function rfLegacyDigest_(array){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(array));
  return bytes.map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');
}
function rfLegacyCtx_(sourceKey){
  const key=String(sourceKey||'').trim();
  let m=key.match(/^REMIT\|(\d+)$/);
  if(!m)m=key.match(/^FRAME\|([A-Z0-9-]+)\|(\d+)$/i);
  if(!m)throw Error('Invalid historical source key. Refresh history.');
  const kind=key.startsWith('REMIT|')?'REMIT':'FRAME';
  const row=Number(kind==='REMIT'?m[1]:m[2]);
  if(!Number.isSafeInteger(row)||row<(kind==='REMIT'?6:2))throw Error('Invalid historical row.');
  const book=SpreadsheetApp.openById(POS_MASTER_ID),snapshot=book.getSheetByName(RF_LEGACY_SNAPSHOT_TAB);
  if(!snapshot)throw Error('Historical snapshot missing. Import historical sales first.');
  const match=snapshot.getRange(2,11,Math.max(1,snapshot.getLastRow()-1),1)
    .createTextFinder(key).matchEntireCell(true).matchCase(true).findNext();
  if(!match)throw Error('Historical transaction not found. Refresh report.');
  const snapshotRow=match.getRow(),historic=snapshot.getRange(snapshotRow,1,1,12).getValues()[0];
  if(String(historic[1])!==kind||Number(historic[2])!==row||String(historic[10])!==key)throw Error('Historical row mismatch.');
  const sheet=kind==='REMIT'?book.getSheetByName('REMIT'):
    SpreadsheetApp.openById(POS_FRAME_ID).getSheetByName('Orders');
  if(!sheet||row>sheet.getLastRow())throw Error('Original order row no longer exists.');
  const width=kind==='REMIT'?17:41;
  const raw=sheet.getRange(row,1,1,width).getValues()[0];
  const display=sheet.getRange(row,1,1,width).getDisplayValues()[0];
  // POS-managed source rows must be edited through the existing POS Ledger editor.
  if(kind==='REMIT'&&String(raw[15]||'').trim())throw Error('This is a POS-linked order. Edit it using its POS reference.');
  if(kind==='FRAME'&&String(raw[38]||'').trim())throw Error('This is a POS-linked frame. Edit it using its POS reference.');
  if(kind==='FRAME'&&String(raw[2]||'').trim().toUpperCase()!==String(m[1]||'').toUpperCase())throw Error('Frame order ID changed. Refresh history.');
  return {key,kind,row,book,snapshot,snapshotRow,historic,sheet,raw,display,version:rfLegacyDigest_(display)};
}
function posLegacyEditGet_(key){
  posRequireAuth_();const c=rfLegacyCtx_(key),r=c.raw,h=c.historic;
  const first=String(c.kind==='FRAME'?r[7]:r[2]||'').trim(),last=c.kind==='FRAME'?String(r[8]||'').trim():'';
  return {key:c.key,kind:c.kind,row:c.row,orderId:c.kind==='FRAME'?String(r[2]||''):'',version:c.version,
    date:String(h[0]||''),name:c.kind==='FRAME'?[first,last].filter(Boolean).join(' '):first,
    email:String(c.kind==='FRAME'?r[10]:r[1]||''),type:String(c.kind==='FRAME'?r[3]:r[3]||''),
    amount:Number(c.kind==='FRAME'?r[5]:r[5])||0,
    note:c.kind==='FRAME'?String(r[16]||''):String(r[13]||''),
    warning:c.kind==='FRAME'?'Frame price is not verified payment; editing may affect historical sales. Production status and shipment data will stay unchanged.':'Updating the recorded REMIT amount changes historical sales reporting.'};
}
function posLegacyEditSave_(input,deviceLabel){
  posRequireAuth_();if(!input||typeof input!=='object')throw Error('Missing edit data.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const c=rfLegacyCtx_(input.key);
    if(c.version!==String(input.version||''))throw Error('The original order changed. Reopen it to avoid overwriting someone else’s changes.');
    const name=String(input.name||'').trim().replace(/\s+/g,' ').slice(0,160);
    const email=String(input.email||'').trim().slice(0,160);
    const type=String(input.type||'').trim().slice(0,150);
    const note=String(input.note||'').trim().slice(0,1000);
    const amount=Number(input.amount);
    const date=String(input.date||'');
    if(!name||!type||!email)throw Error('Customer, email and service/size are required.');
    if(!(/^N\/A$/i.test(email)||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('Email must be valid or N/A.');
    if(!Number.isFinite(amount)||amount<=0||amount>1e9)throw Error('Recorded amount must be greater than zero.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'2026-09-01'||isNaN(new Date(date+'T12:00:00Z').getTime()))throw Error('Enter a valid reporting date from September 2026 onward.');
    const old=c.raw,oldHistory=c.historic.slice(),oldFields={date:String(c.historic[0]),name:c.kind==='FRAME'?[old[7],old[8]].join(' ').trim():String(old[2]),email:String(c.kind==='FRAME'?old[10]:old[1]),type:String(old[3]),amount:Number(old[5]),note:String(c.kind==='FRAME'?old[16]:old[13])};
    const audit=posEnsureSheet_(c.book,RF_LEGACY_AUDIT_TAB,['Timestamp','Source Key','Source Type','Source Row','Operator','Old Values JSON','New Values JSON','Result']);
    const actor=String(deviceLabel||'Approved POS device').slice(0,120);
    const updated={date,name,email,type,amount,note};
    // Snapshot is updated ONLY after source save. In case of a partial failure, audit logs PENDING.
    const auditRow=audit.getLastRow()+1;
    audit.appendRow([new Date(),c.key,c.kind,c.row,actor,JSON.stringify(oldFields),JSON.stringify(updated),'PENDING']);
    try{
      if(c.kind==='REMIT'){
        // Keep all file links, frame associations, employee allocations and workflow columns unchanged.
        c.sheet.getRange(c.row,1).setValue(new Date(date+'T12:00:00Z'));
        c.sheet.getRange(c.row,1).setNumberFormat('m/d/yyyy');
        c.sheet.getRange(c.row,2).setValue(email);
        c.sheet.getRange(c.row,3).setValue(name);
        c.sheet.getRange(c.row,4).setValue(type);
        c.sheet.getRange(c.row,6).setValue(amount);
        c.sheet.getRange(c.row,14).setValue(note);
      }else{
        // Frame B is the original creation timestamp. AO is the historical payment/order
        // date override already read by the historical importer; keep B unchanged.
        c.sheet.getRange(c.row,41).setValue(new Date(date+'T12:00:00Z'));
        c.sheet.getRange(c.row,41).setNumberFormat('m/d/yyyy');
        const p=name.split(' ');const last=p.length>1?p.pop():'';
        c.sheet.getRange(c.row,8).setValue(p.join(' '));
        c.sheet.getRange(c.row,9).setValue(last);
        c.sheet.getRange(c.row,11).setValue(email);
        c.sheet.getRange(c.row,4).setValue(type);
        c.sheet.getRange(c.row,6).setValue(amount);
        c.sheet.getRange(c.row,17).setValue(note);
      }
      // Preserve linked-frame exclusion instead of converting it into additional revenue.
      const excluded=c.kind==='FRAME'&&Number(oldHistory[7])===0;
      c.snapshot.getRange(c.snapshotRow,1).setValue(date);
      c.snapshot.getRange(c.snapshotRow,5,1,5).setValues([[name,email,type,excluded?0:amount,amount]]);
      // Keep source key, review classification, recorded-by and linking unchanged.
      audit.getRange(auditRow,8).setValue('SYNCED');
      return {ok:true,key:c.key,kind:c.kind,excludedFromTotals:excluded};
    }catch(error){
      audit.getRange(auditRow,8).setValue('CHECK SOURCE AND SNAPSHOT — '+String(error.message||error).slice(0,180));
      throw Error('Historical edit may be partially saved. Check the original row and Historical Sales before retrying: '+String(error.message||error));
    }
  }finally{lock.releaseLock();}
}
