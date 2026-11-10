/**
 * Rocketfix POS customer lookup V25: one-time full REMIT import, then incremental updates.
 * Install as CustomerDirectory.gs in the SAME POS Apps Script project.
 * Requires existing Code.gs: posRequireAuth_() and POS_MASTER_ID.
 * Read-only against REMIT. Maintains an independent 'POS Customer Directory' index tab.
 * Manual Refresh reads ONLY newly appended REMIT rows, not the entire history.
 * Historical edits/deletions require manually running posRebuildCustomerDirectory() once.
 */
const RF_DIR25_TAB = 'POS Customer Directory';
const RF_DIR25_CURSOR = 'RF_POS_REMIT_IMPORTED_ROW_V25';
const RF_DIR25_HEADER = ['Email','Customer Name','Last REMIT Row'];

function posGetCustomerDirectory(forceRefresh) {
  posRequireAuth_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('Customer directory is updating. Please try again.');
  try {
    const book = SpreadsheetApp.openById(POS_MASTER_ID);
    const remit = book.getSheetByName('REMIT');
    if (!remit) throw new Error('REMIT sheet was not found.');
    let directory = book.getSheetByName(RF_DIR25_TAB);
    if (!directory) {
      directory = book.insertSheet(RF_DIR25_TAB);
      directory.getRange(1, 1, 1, 3).setValues([RF_DIR25_HEADER]);
      directory.setFrozenRows(1);
    }
    const properties = PropertiesService.getScriptProperties();
    let cursor = Number(properties.getProperty(RF_DIR25_CURSOR) || 0);
    // An empty or accidentally cleared index must be rebuilt, not silently skipped.
    if (!Number.isInteger(cursor) || cursor < 5 || directory.getLastRow() < 2) {
      cursor = 5;
      const oldLast = directory.getLastRow();
      if (oldLast > 1) directory.getRange(2, 1, oldLast - 1, 3).clearContent();
      properties.deleteProperty(RF_DIR25_CURSOR);
    }
    const remitLast = Math.max(5, remit.getLastRow());
    const indexLast = directory.getLastRow();
    const indexed = indexLast > 1 ? directory.getRange(2, 1, indexLast - 1, 3).getDisplayValues() : [];
    const byEmail = new Map();
    for (let i = 0; i < indexed.length; i++) {
      const email = String(indexed[i][0] || '').trim().toLowerCase();
      if (email) byEmail.set(email, { index: i, name: String(indexed[i][1] || ''), sourceRow: Number(indexed[i][2]) || 0 });
    }
    const newEntries = [];
    const existingChanged = new Set();
    let scanned = 0;
    // Only fetch unprocessed rows from REMIT B:C. Do NOT read old rows repeatedly.
    if (remitLast > cursor) {
      const rows = remit.getRange(cursor + 1, 2, remitLast - cursor, 2).getDisplayValues();
      scanned = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const email = String(rows[i][0] || '').trim().toLowerCase();
        const name = String(rows[i][1] || '').trim().replace(/\s+/g, ' ');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
        const sourceRow = cursor + 1 + i;
        const prior = byEmail.get(email);
        if (!prior) {
          const obj = {index: indexed.length + newEntries.length, name, sourceRow};
          byEmail.set(email, obj);
          newEntries.push([email, name, sourceRow]);
        } else if ((name && name !== prior.name) || sourceRow > prior.sourceRow) {
          // Preserve the latest non-empty name and track the most recently seen REMIT row.
          if (name) prior.name = name;
          prior.sourceRow = sourceRow;
          if (prior.index >= indexed.length) newEntries[prior.index - indexed.length] = [email, prior.name, sourceRow];
          else existingChanged.add(prior.index);
        }
      }
      // Commit data before cursor, so a failed write is safe to retry.
      if (newEntries.length) directory.getRange(indexed.length + 2, 1, newEntries.length, 3).setValues(newEntries);
      if (existingChanged.size) {
        // Usually very few returning clients; write only their changed index rows.
        for (const i of existingChanged) {
          const email = String(indexed[i][0] || '').trim().toLowerCase();
          const updated = byEmail.get(email);
          if (updated) directory.getRange(i + 2, 1, 3).setValues([[email, updated.name, updated.sourceRow]]);
        }
      }
      SpreadsheetApp.flush();
      properties.setProperty(RF_DIR25_CURSOR, String(remitLast));
    }
    // Customer lookup reads the compact indexed sheet, NEVER the full REMIT history.
    const size = directory.getLastRow() - 1;
    const current = size > 0 ? directory.getRange(2, 1, size, 2).getDisplayValues() : [];
    const customers = current.filter(r => r[0]).map(r => ({email:String(r[0]).trim().toLowerCase(),name:String(r[1] || '')}));
    return {customers, cached:scanned === 0, mode:'incremental', initialized:cursor === 5 && scanned > 0,
      added:newEntries.length, rowsScanned:scanned, lastRemitRow:remitLast, refreshedAt:new Date().toISOString()};
  } finally {
    lock.releaseLock();
  }
}

/** Admin-only recovery for edited/deleted historical REMIT rows. Never runs automatically. */
function posRebuildCustomerDirectory() {
  posRequireAuth_();
  const properties = PropertiesService.getScriptProperties();
  const book = SpreadsheetApp.openById(POS_MASTER_ID);
  const directory = book.getSheetByName(RF_DIR25_TAB);
  if (directory && directory.getLastRow() > 1) directory.getRange(2,1,directory.getLastRow()-1,3).clearContent();
  properties.deleteProperty(RF_DIR25_CURSOR);
  return posGetCustomerDirectory(true);
}
