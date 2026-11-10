/**
 * ROCKETFIX POS — one-time SEPTEMBER 2026+ HISTORICAL REPORTING IMPORT
 *
 * Install as a NEW HistoricalReporting.gs file in your existing POS Apps Script project.
 * Run posHistoricalBackfillSeptember2026() once as an authorized POS admin.
 * Does not modify REMIT, RF Frame Orders, POS Ledger or POS Audit.
 * Creates/replaces ONLY "POS Historical Sales". Safe to run again to rebuild.
 *
 * Historical source amounts are recorded order/remittance amounts, NOT confirmed
 * bank receipts or net accounting revenue. Linked frame amounts are shown but
 * excluded from totals pending split-payment reconciliation.
 */
var RF_HIST28_TAB = 'POS Historical Sales';
var RF_HIST28_START = '2026-09-01';
var RF_HIST28_HEADERS = [
  'Payment/Order Date','Source','Source Row','Source Order ID','Customer',
  'Email','Type','Counted Amount','Original Amount','Review Status','Source Key','Recorded by'
];
function rfHist28Amount_(v) {
  if(typeof v==='number') return Math.max(0, v);
  var x=String(v==null?'':v).replace(/[₱,\s]/g,'').replace(/\((.*?)\)/,'-$1');
  var n=Number(x);return Number.isFinite(n)?Math.max(0,n):0;
}
function rfHist28Date_(v) {
  if(v instanceof Date && !isNaN(v)) return Utilities.formatDate(v,'Asia/Manila','yyyy-MM-dd');
  var s=String(v||'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  var m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(!m)return '';
  var d=new Date(Number(m[3]),Number(m[1])-1,Number(m[2]));
  if(d.getFullYear()!==Number(m[3])||d.getMonth()!==Number(m[1])-1||d.getDate()!==Number(m[2]))return '';
  return Utilities.formatDate(d,'Asia/Manila','yyyy-MM-dd');
}
function rfHist28LinkedIds_(s) {
  return String(s||'').toUpperCase().match(/[A-Z0-9]{4,12}/g)||[];
}
function posHistoricalBackfillSeptember2026() {
  posRequireAuth_();
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    var master=SpreadsheetApp.openById(POS_MASTER_ID),remit=master.getSheetByName('REMIT');
    var frames=SpreadsheetApp.openById(POS_FRAME_ID).getSheetByName('Orders');
    if(!remit||!frames)throw new Error('Missing REMIT or Frame Orders. Nothing was changed.');
    var remitRows=remit.getLastRow()>5?remit.getRange(6,1,remit.getLastRow()-5,17).getValues():[];
    var frameRows=frames.getLastRow()>1?frames.getRange(2,1,frames.getLastRow()-1,47).getValues():[];
    var out=[],linkedFrameIds=new Set(),editing=0,framing=0,linked=0,skippedPos=0;
    remitRows.forEach(function(r,i){
      var date=rfHist28Date_(r[0]);if(!date||date<RF_HIST28_START)return;
      if(String(r[15]||'').trim()){skippedPos++;return;} // POS-managed: counted by current POS Ledger instead
      var amount=rfHist28Amount_(r[5]);if(amount<=0)return;
      rfHist28LinkedIds_(r[10]).forEach(function(id){linkedFrameIds.add(id);});
      out.push([date,'REMIT',i+6,'',String(r[2]||'').trim(),String(r[1]||'').trim(),
        String(r[3]||'Editing').trim(),amount,amount,'Recorded REMIT amount','REMIT|'+(i+6),String(r[11]||'').trim()]);
      editing+=amount;
    });
    frameRows.forEach(function(r,i){
      // For POS-synced frames, use POS Ledger; do not re-count historical Frame Orders.
      if(String(r[38]||'').trim()){skippedPos++;return;}
      var date=rfHist28Date_(r[40]||r[1]);if(!date||date<RF_HIST28_START)return;
      var orderId=String(r[2]||'').trim(),amount=rfHist28Amount_(r[5]);
      if(!orderId||amount<=0)return;
      var status=String(r[19]||'').trim().toUpperCase();
      if(status==='REFUNDED'||status==='CANCELLED'||status==='CANCELED')return;
      var linkedOrder=linkedFrameIds.has(orderId.toUpperCase());
      // Linked legacy orders could already be included in REMIT F; flag rather than double count.
      var counted=linkedOrder?0:amount;
      if(linkedOrder)linked++;else framing+=amount;
      out.push([date,'FRAME',i+2,orderId,String(r[7]||'').trim()+' '+String(r[8]||'').trim(),
        String(r[10]||'').trim(),String(r[3]||'Frame').trim(),counted,amount,
        linkedOrder?'LINKED TO REMIT — amount excluded pending review':'Frame price (not payment-verified)',
        'FRAME|'+orderId+'|'+(i+2),'']);
    });
    out.sort(function(a,b){return a[0].localeCompare(b[0])||a[1].localeCompare(b[1])||a[2]-b[2];});
    // Compute the entire dataset before touching the historical report tab.
    var sheet=master.getSheetByName(RF_HIST28_TAB);
    if(!sheet)sheet=master.insertSheet(RF_HIST28_TAB);
    sheet.clearContents();
    var needed=out.length+1;
    if(sheet.getMaxRows()<needed)sheet.insertRowsAfter(sheet.getMaxRows(),needed-sheet.getMaxRows());
    if(sheet.getMaxColumns()<RF_HIST28_HEADERS.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),RF_HIST28_HEADERS.length-sheet.getMaxColumns());
    sheet.getRange(1,1,1,RF_HIST28_HEADERS.length).setValues([RF_HIST28_HEADERS]);
    for(var i=0;i<out.length;i+=500){var batch=out.slice(i,i+500);sheet.getRange(i+2,1,batch.length,RF_HIST28_HEADERS.length).setValues(batch);}
    sheet.setFrozenRows(1);
    sheet.getRange('H:I').setNumberFormat('#,##0.00');
    PropertiesService.getScriptProperties().setProperty('RF_HIST28_LAST_BACKFILL',new Date().toISOString());
    return {success:true,periodStart:RF_HIST28_START,rows:out.length,editingAmount:editing,frameAmount:framing,
      linkedFrameOrdersExcluded:linked,skippedPosSourceRows:skippedPos,tab:RF_HIST28_TAB};
  } finally {lock.releaseLock();}
}
/** Lightweight read: one snapshot fetch, no scans of original production REMIT/Orders. */
function posGetHistoricalSales() {
  posRequireAuth_();
  var master=SpreadsheetApp.openById(POS_MASTER_ID),sheet=master.getSheetByName(RF_HIST28_TAB);
  if(!sheet||sheet.getLastRow()<2)return {ready:false,rows:[],message:'Run posHistoricalBackfillSeptember2026() once to import Sep 2026+ sales.'};
  var rows=sheet.getRange(2,1,sheet.getLastRow()-1,12).getDisplayValues();
  return {ready:true,rows:rows.map(function(r){return {
    date:r[0],source:r[1],row:r[2],orderId:r[3],customer:r[4],email:r[5],type:r[6],
    amount:rfHist28Amount_(r[7]),originalAmount:rfHist28Amount_(r[8]),note:r[9],key:r[10],recordedBy:r[11]||''
  };})};
}
/**
 * PREVIEW ONLY of suspected test records in POS Ledger.
 * Safe to run; no changes. The operator must review IDs before running archive.
 */
function posPreviewTestLedgerOrders() {
  posRequireAuth_();var sh=SpreadsheetApp.openById(POS_MASTER_ID).getSheetByName('POS Ledger');
  var data=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,16).getValues():[];
  return data.map(function(r,i){return {row:i+2,posId:String(r[0]),customer:String(r[4]),
    date:String(r[1]),received:r[7],status:r[13]};}).filter(function(r){
    return /^(joshua\s+crisostomo0?|joshua\s+cris)$/i.test(r.customer.trim()) && r.status!=='DELETED' && r.status!=='TEST_ARCHIVED';
  });
}
/**
 * OPTIONAL reversible history-only archive of EXACT reviewed POS IDs.
 * Does not delete source REMIT, Frame Orders, proofs, or audit. Adds deletedAt flag
 * so the existing posGetTransactions() hides them from the POS screens.
 * Run manually after checking posPreviewTestLedgerOrders() in Apps Script Logs.
 */
function posArchiveReviewedTestOrderIds() {
  posRequireAuth_();
  var ids=[
    // Paste reviewed eight-digit POS test IDs here, e.g. '12345678'.
  ];
  if(!ids.length)throw new Error('No test IDs approved. Fill ids[] after reviewing posPreviewTestLedgerOrders().');
  var sh=SpreadsheetApp.openById(POS_MASTER_ID).getSheetByName('POS Ledger');
  var audit=SpreadsheetApp.openById(POS_MASTER_ID).getSheetByName('POS Audit');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    var data=sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),16).getValues(),archived=[];
    ids.forEach(function(id){
      var idx=data.findIndex(function(r){return String(r[0])===String(id);});
      if(idx<0)throw new Error('Unknown POS ID '+id+'; stopped before archiving this ID.');
      var row=data[idx],name=String(row[4]||'');
      if(!/^(joshua\s+crisostomo0?|joshua\s+cris)$/i.test(name.trim()))throw new Error('Not an approved test customer: '+id);
      if(row[13]==='DELETED'||row[13]==='TEST_ARCHIVED')return;
      var rec=JSON.parse(String(row[15]||'{}'));
      rec.deletedAt=rec.deletedAt||new Date().toISOString();
      rec.posTestHistoryArchivedAt=rec.deletedAt;
      sh.getRange(idx+2,14).setValue('TEST_ARCHIVED');
      sh.getRange(idx+2,16).setValue(JSON.stringify(rec));
      if(audit)audit.appendRow([new Date(),'TEST_HISTORY_ARCHIVE',id,Session.getActiveUser().getEmail(),row[1],row[1],row[7],row[7],'ARCHIVED','History-only; source order remains intact']);
      archived.push(id);
    });
    return {archived:archived};
  }finally{lock.releaseLock();}
}
