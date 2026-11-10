/**
 * ROCKETFIX — TRACKING ID PASTE AUTO-FILL V3 (2026-11-01)
 * Paste one or multiple POS Editing Order IDs into Tracking column A.
 * Finds exact ID in REMIT column Q and fills blank new-order fields.
 *
 * Tracking A = REMIT Q (ID pasted by admin)
 * Tracking B = REMIT B (Email)
 * Tracking C = REMIT C (Name)
 * Tracking D = REMIT D (Type)
 * Tracking E = "Handed"
 * Tracking F = REMIT F (Amount)
 * Tracking G:H = REMIT G:H (Main file)
 * Tracking I:J = REMIT I:J (Note file)
 * Tracking K = "Ready" (NOT payment proof URL)
 * Tracking L = REMIT E (NORMAL FILE -> Normal; RUSH FILE -> Urgent)
 * Tracking N = REMIT AA (Rush target date, M/D/Y)
 * Tracking O = REMIT K (specific Frame Order ID for this editing item)
 *
 * REMIT G:J Drive smart chips are copied with copyTo(), keeping their links.
 * Preserves populated Tracking fields, other workflow columns and old rows.
 * Doesn't send email or change other triggers.
 */
const RF_PASTE_FILL = Object.freeze({
  SPREADSHEET_ID: '10W8zrKf9rX-BFH2VLDyj8dwNlVJDca2_yArN9eIyNwY',
  TRACKING_TAB: 'Tracking', REMIT_TAB: 'REMIT',
  TRACKING_FIRST_NEW_ROW: 10251, REMIT_FIRST_DATA_ROW: 6,
  MAX_ROWS_PER_EDIT: 500, MAX_ROWS_PER_MANUAL_RUN: 1000
});

/** Run once if the on-edit trigger for rfPasteTrackingIdOnEdit isn't installed. */
function rfPasteInstallAutoFillTrigger() {
  const ss = SpreadsheetApp.openById(RF_PASTE_FILL.SPREADSHEET_ID);
  const handlers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'rfPasteTrackingIdOnEdit');
  // Avoid multiplying triggers; do not touch email-related triggers.
  if (handlers.length === 0) {
    ScriptApp.newTrigger('rfPasteTrackingIdOnEdit').forSpreadsheet(ss).onEdit().create();
    console.log('Rocketfix Tracking auto-fill trigger installed.');
  } else {
    console.log('Existing Tracking auto-fill trigger found (' + handlers.length + '). No new trigger added.');
  }
}

/** Human paste in Tracking A, including a multi-row paste. */
function rfPasteTrackingIdOnEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getParent().getId() !== RF_PASTE_FILL.SPREADSHEET_ID ||
      sheet.getName() !== RF_PASTE_FILL.TRACKING_TAB ||
      range.getColumn() > 1 || range.getLastColumn() < 1 ||
      range.getLastRow() < RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW) return;
  const start = Math.max(RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW, range.getRow());
  const end = range.getLastRow();
  if (end - start + 1 > RF_PASTE_FILL.MAX_ROWS_PER_EDIT) {
    console.warn('More than 500 rows pasted; run rfPasteFillExistingIds manually.');
    return;
  }
  rfPasteFillRows_(sheet, start, end);
}

/** Fill/repair existing new-order rows, including previously pasted test IDs. */
function rfPasteFillExistingIds() {
  const sheet = SpreadsheetApp.openById(RF_PASTE_FILL.SPREADSHEET_ID)
    .getSheetByName(RF_PASTE_FILL.TRACKING_TAB);
  const end = Math.min(sheet.getLastRow(),
    RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW + RF_PASTE_FILL.MAX_ROWS_PER_MANUAL_RUN - 1);
  if (end >= RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW) {
    rfPasteFillRows_(sheet, RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW, end);
  }
}

/** Repair file links for existing new-POS Tracking rows (no other columns cleared).
 * Source of truth: REMIT Q matching Tracking A; only G:J are re-copied.
 * Run rfPastePreviewExistingIds first if you want to check matching IDs.
 */
function rfPasteRepairExistingFileLinks() {
  const ss=SpreadsheetApp.openById(RF_PASTE_FILL.SPREADSHEET_ID);
  const tracking=ss.getSheetByName(RF_PASTE_FILL.TRACKING_TAB);
  const remit=ss.getSheetByName(RF_PASTE_FILL.REMIT_TAB);
  if (!tracking || !remit) throw Error('Tracking or REMIT tab missing.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw Error('Sheet is busy; try again shortly.');
  try {
    const start=RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW;
    const end=Math.min(tracking.getLastRow(),start+RF_PASTE_FILL.MAX_ROWS_PER_MANUAL_RUN-1);
    if(end<start)return;
    const index=rfPasteRemitIndex_(ss);
    const allIds=tracking.getRange(2,1,Math.max(1,tracking.getLastRow()-1),1).getDisplayValues();
    const counts=Object.create(null);
    allIds.forEach(v=>{const id=rfPasteNormalizeId_(v[0]);if(id)counts[id]=(counts[id]||0)+1;});
    const target=tracking.getRange(start,1,end-start+1,10).getDisplayValues();
    const report={repaired:0,duplicateIds:[],unmatchedIds:[],skippedCustomizedCells:[],noSourceFiles:0};
    target.forEach((row,i)=>{
      const id=rfPasteNormalizeId_(row[0]);
      if(!id)return;
      if(counts[id]>1){report.duplicateIds.push(id);return;}
      const src=index[id];
      if(!src){report.unmatchedIds.push(id);return;}
      const source=remit.getRange(src._sourceRow,7,1,4);
      const display=source.getDisplayValues()[0];
      if(!display.some(v=>String(v||'').trim())){report.noSourceFiles++;return;}
      const dest=row.slice(6,10);
      const canCopyRange=display.every((v,j)=>!String(dest[j]||'').trim() ||
        String(dest[j]).trim()===String(v||'').trim());
      const targetRow=start+i;
      if(canCopyRange){
        source.copyTo(tracking.getRange(targetRow,7,1,4));
        report.repaired++;
      } else {
        let repaired=false;
        for(let j=0;j<4;j++){
          const srcText=String(display[j]||'').trim();
          if(!srcText)continue;
          const destText=String(dest[j]||'').trim();
          if(destText && destText!==srcText){
            report.skippedCustomizedCells.push(id+' '+['G','H','I','J'][j]);
            continue;
          }
          remit.getRange(src._sourceRow,7+j).copyTo(tracking.getRange(targetRow,7+j));
          repaired=true;
        }
        if(repaired)report.repaired++;
      }
    });
    console.log('Tracking file smart-chip repair: '+JSON.stringify(report));
  } finally {lock.releaseLock();}
}

/** Read-only report. */
function rfPastePreviewExistingIds() {
  const ss = SpreadsheetApp.openById(RF_PASTE_FILL.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(RF_PASTE_FILL.TRACKING_TAB);
  const end = Math.min(sheet.getLastRow(),
    RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW + RF_PASTE_FILL.MAX_ROWS_PER_MANUAL_RUN - 1);
  if (end < RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW) return;
  const rows = sheet.getRange(RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW, 1,
    end - RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW + 1, 15).getDisplayValues();
  const index = rfPasteRemitIndex_(ss);
  const report = rows.map((r, i) => ({row: RF_PASTE_FILL.TRACKING_FIRST_NEW_ROW + i,
    id: rfPasteNormalizeId_(r[0]), matched: Boolean(index[rfPasteNormalizeId_(r[0])]),
    K: r[10], L:r[11], O:r[14]})).filter(x=>x.id);
  console.log(JSON.stringify(report, null, 2));
}

function rfPasteFillRows_(tracking, start, end) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.warn('Auto-fill skipped: script busy.'); return; }
  try {
    const index = rfPasteRemitIndex_(tracking.getParent());
    const count = end - start + 1;
    const existing = tracking.getRange(start, 1, count, 15).getValues();
    const allIds = tracking.getRange(2, 1, Math.max(1, tracking.getLastRow() - 1), 1).getDisplayValues();
    const idCounts = Object.create(null);
    allIds.forEach(v => { const id=rfPasteNormalizeId_(v[0]); if(id)idCounts[id]=(idCounts[id]||0)+1; });
    const report={filled:0, fileLinkRowsCopied:0, fileLinksSkippedCustom:[], notFound:[], duplicate:[], skipped:[], invalidFileType:[]};
    const remit=tracking.getParent().getSheetByName(RF_PASTE_FILL.REMIT_TAB);
    const targetFileDisplay=tracking.getRange(start,7,count,4).getDisplayValues();
    existing.forEach((row, i) => {
      const id=rfPasteNormalizeId_(row[0]);
      if (!id) return;
      if (idCounts[id] > 1) { report.duplicate.push(id); return; }
      const src=index[id];
      if (!src) { report.notFound.push(id); return; }
      const priority=rfPastePriority_(src[4]);
      if (!priority) { report.invalidFileType.push(id); return; }
      const targetRow=start+i;
      // Only fill blank values. For K, specifically repair earlier version's
      // mistaken payment-proof URL, without changing a workflow status otherwise.
      const target={
        2:src[1], 3:src[2], 4:src[3], 5:'Handed', 6:src[5],
        7:src[6], 8:src[7], 9:src[8], 10:src[9], 11:'Ready',
        12:priority, 14:(priority==='Urgent'?src[26]:''), 15:src[10]
      };
      const changes=[];
      for (const [colText, value] of Object.entries(target)) {
        const col=Number(colText);
        if (value===null || value===undefined || value==='') continue;
        const current=String(row[col-1]===null || row[col-1]===undefined?'':row[col-1]).trim();
        const previouslyWrongProof = col===11 && /^https?:\/\//i.test(current);
        if (current && !previouslyWrongProof) continue;
        changes.push({col,value});
      }
      // G:J are Google Drive smart chips on REMIT. setValue() strips the link,
      // so copy the actual Sheets cells after writing other columns.
      const ordinaryChanges=changes.filter(c=>c.col<7 || c.col>10);
      ordinaryChanges.forEach(change=>{
        const cell=tracking.getRange(targetRow,change.col);
        cell.setValue(change.value);
        if(change.col===14)cell.setNumberFormat('m/d/yyyy');
      });
      let fileCopy=false;
      if (src._sourceRow) {
        const sourceRange=remit.getRange(src._sourceRow,7,1,4);
        const sourceDisplay=sourceRange.getDisplayValues()[0];
        const destDisplay=targetFileDisplay[i];
        const safe=sourceDisplay.every((v,j)=>!String(destDisplay[j]||'').trim() ||
          String(destDisplay[j]).trim()===String(v||'').trim());
        if (sourceDisplay.some(v=>String(v||'').trim()) && safe) {
          // Apps Script copyTo preserves Drive smart chips and their URLs,
          // unlike getValues()/setValues()/setValue().
          sourceRange.copyTo(tracking.getRange(targetRow,7,1,4));
          fileCopy=true;
          report.fileLinkRowsCopied++;
        } else if (sourceDisplay.some(v=>String(v||'').trim())) {
          // Never overwrite a hand-edited Tracking file cell with a different label.
          // Copy compatible individual cells so unrelated custom data stays intact.
          for(let j=0;j<4;j++) {
            const sourceText=String(sourceDisplay[j]||'').trim();
            const targetText=String(destDisplay[j]||'').trim();
            if (!sourceText) continue;
            if (targetText && targetText!==sourceText) {
              report.fileLinksSkippedCustom.push(id+' '+['G','H','I','J'][j]);
              continue;
            }
            remit.getRange(src._sourceRow,7+j).copyTo(tracking.getRange(targetRow,7+j));
            fileCopy=true;
          }
          if(fileCopy)report.fileLinkRowsCopied++;
        }
      }
      if (!ordinaryChanges.length && !fileCopy) {report.skipped.push(id);return;}
      report.filled++;
    });
    console.log('Rocketfix Tracking ID Auto-Fill V3 smart-chip links: '+JSON.stringify(report));
  } finally {lock.releaseLock();}
}

function rfPasteRemitIndex_(ss) {
  const remit=ss.getSheetByName(RF_PASTE_FILL.REMIT_TAB);
  if (!remit) throw new Error('REMIT sheet not found.');
  const last=remit.getLastRow(), index=Object.create(null);
  if (last < RF_PASTE_FILL.REMIT_FIRST_DATA_ROW) return index;
  const rows=remit.getRange(RF_PASTE_FILL.REMIT_FIRST_DATA_ROW,1,
    last - RF_PASTE_FILL.REMIT_FIRST_DATA_ROW + 1, 27).getValues();
  rows.forEach((src,i)=>{
    src._sourceRow=RF_PASTE_FILL.REMIT_FIRST_DATA_ROW+i;
    const id=rfPasteNormalizeId_(src[16]);
    if (!id) return;
    // A duplicate ID is ambiguous; never guess the correct source row.
    if (Object.prototype.hasOwnProperty.call(index,id)) index[id]=null;
    else index[id]=src;
  });
  return index;
}
function rfPasteNormalizeId_(v) {
  const s=String(v===null||v===undefined?'':v).trim().toUpperCase();
  return /^RF\d+[A-Z]?$/.test(s)?s:'';
}
function rfPastePriority_(v) {
  const s=String(v||'').trim().toUpperCase();
  if (s==='NORMAL FILE')return 'Normal';
  if (s==='RUSH FILE')return 'Urgent';
  return '';
}
