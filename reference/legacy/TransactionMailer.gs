/**
 * ROCKETFIX TRANSACTION MAILER — LIVE-SAFE V4 + POS EDITING ORDER IDs
 * Install as a NEW file inside the Apps Script project attached to:
 *   ROCKETFIX - MASTER SHEET 2025
 *
 * TRANSACTION SOURCES
 * - Editing PAYMENT event: REMIT (has the real payment date).
 * - Editing order/history representation: Tracking (must exist before email sends).
 * - Picture Frame event: separate Frame Orders workbook (has timestamp/order ID).
 * - Loyalty totals/rewards: existing spend-based logic, Customers used only for
 *   customer/reward status lookup. Existing formulas are NOT changed.
 *
 * HARD START DATE
 * - Transaction emails are only for transactions dated 2026-08-01 onward.
 * - Older spend still remains part of the customer's loyalty history/totals.
 *
 * LIVE-SYSTEM SAFETY
 * - setupTransactionMailer() starts in SAFE MODE: no live customer emails.
 * - sendTransactionMailerTest() sends only to the Rocketfix business email.
 * - enableTransactionMailer() is required before live customer emails can send.
 * - Editing payments wait for the minimum Tracking record so the customer's
 *   Rewards account already reflects the transaction before the email is sent.
 */

const RF_TX_MAILER = Object.freeze({
  MASTER_SPREADSHEET_ID: '10W8zrKf9rX-BFH2VLDyj8dwNlVJDca2_yArN9eIyNwY',
  REMIT_SHEET: 'REMIT',
  REMIT_HEADER_ROW: 5,
  TRACKING_SHEET: 'Tracking',
  CUSTOMERS_SHEET: 'Customers',

  FRAME_SPREADSHEET_ID: '1kOtnKnD1eHgmCylidPwGW0veIyokbwVUD4hvNaQf-JU',
  FRAME_SHEET: 'Orders',

  LOG_SHEET: 'Transaction Email Log',
  TIMEZONE: 'Asia/Manila',
  START_YMD: '2026-08-01',

  // Verified live boundary for the Aug 1 backfill: RF8936 is from Jul 31 and
  // RF8937 is the first currently represented Aug 1 Editing order.
  TRACKING_START_ORDER_NUMBER: 8937,
  POS_ID_PATTERN: /^RF\d{5}[A-Z]$/,

  BUSINESS_NAME: 'Rocketfix Editing Services',
  BUSINESS_EMAIL: 'adminsupport@rocketfixeditingservices.com',
  WEBSITE: 'https://www.rocketfixofficial.com',
  REWARDS_URL: 'https://www.rocketfixofficial.com/rewards?source=transaction-email',
  LOGO_URL: 'https://res.cloudinary.com/dgu2kmk8y/image/upload/v1784052899/wwww_r3yf4v.png',
  FRAME_REWARD_IMAGE: 'https://res.cloudinary.com/dgu2kmk8y/image/upload/v1787827336/V2_-_photos_idouhz.jpg',

  MAX_SENDS_PER_RUN: 15,
  MAX_ATTEMPTS: 5,

  // Historical Aug 1 backfill is intentionally processed in small chunks.
  // This keeps each Apps Script execution short and prevents lock timeouts.
  DISCOVERY_BATCH_SIZE: 80
});

const RF_TX_LOG_HEADERS = Object.freeze([
  'Transaction Key',
  'Source',
  'Source Row',
  'Transaction Date',
  'Order ID',
  'Customer ID',
  'Email',
  'Customer Name',
  'Type / Product',
  'Gross Amount',
  'Eligible Loyalty Amount',
  'Detected At',
  'New Stamps Earned',
  'Lifetime Stamps After',
  'Total Loyalty Spend After',
  'Status',
  'Sent At',
  'Attempts',
  'Error'
]);

/* ==========================================================================
   ONE-TIME SETUP + LIVE ENABLE/DISABLE
   ========================================================================== */

function setupTransactionMailer() {
  // Setup must stay fast. Historical discovery is handled by the 1-minute
  // processor in small batches, not inside this setup execution.
  const masterSs = SpreadsheetApp.openById(RF_TX_MAILER.MASTER_SPREADSHEET_ID);
  rfTxEnsureLogSheet_(masterSs);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('RF_TX_ACTIVATED_AT')) {
    props.setProperty('RF_TX_ACTIVATED_AT', new Date().toISOString());
  }

  // Always return to SAFE MODE whenever setup is run.
  props.setProperty('RF_TX_SEND_ENABLED', 'FALSE');
  props.setProperty('RF_TX_BACKFILL_COMPLETE', 'FALSE');

  rfTxInstallTrigger_();

  const message = [
    'Transaction Mailer setup complete in SAFE MODE.',
    'No live customer email will send yet.',
    'Aug 1 historical transactions will be discovered automatically in small batches.',
    'The 1-minute trigger will continue the backfill without one long execution.',
    '',
    'Next: run previewTransactionMailerStatus().',
    'Do not enable live sending until BACKFILL COMPLETE = YES.'
  ].join('\n');
  console.log(message);
  return message;
}

function enableTransactionMailer() {
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('RF_TX_BACKFILL_COMPLETE') || 'FALSE').toUpperCase() !== 'TRUE') {
    props.setProperty('RF_TX_SEND_ENABLED', 'FALSE');
    const message = [
      'NOT ENABLED — the Aug 1 historical backfill is still in progress.',
      'Run previewTransactionMailerStatus() and read the Execution log.'
    ].join('\n');
    console.log(message);
    return message;
  }

  props.setProperty('RF_TX_SEND_ENABLED', 'TRUE');
  const message = 'Transaction Mailer LIVE delivery is ENABLED. The 1-minute trigger will process ready transactions.';
  console.log(message);
  return message;
}

function disableTransactionMailer() {
  PropertiesService.getScriptProperties().setProperty('RF_TX_SEND_ENABLED', 'FALSE');
  const message = 'Transaction Mailer LIVE delivery is DISABLED. Discovery/logging will continue safely.';
  console.log(message);
  return message;
}

function rfTxSendingEnabled_() {
  return String(
    PropertiesService.getScriptProperties().getProperty('RF_TX_SEND_ENABLED') || 'FALSE'
  ).toUpperCase() === 'TRUE';
}

function rfTxInstallTrigger_() {
  const handler = 'processTransactionMailer';

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyMinutes(1)
    .create();
}

/* ==========================================================================
   ONE-MINUTE PROCESSOR
   ========================================================================== */

const RF_TX_PROCESS_LEASE = Object.freeze({
  KEY: 'RF_TX_MAILER_PROCESS_LEASE_V4',
  TTL_MS: 10 * 60 * 1000,
  GUARD_WAIT_MS: 5000
});

/**
 * Claims a Transaction-Mailer-only lease.
 *
 * ScriptLock is held only while reading/writing the lease property, not while
 * scanning sheets or sending emails. This prevents the Transaction Mailer from
 * monopolizing the same project-wide ScriptLock used by other Rocketfix tools.
 */
function rfTxAcquireProcessorLease_() {
  const guard = LockService.getScriptLock();

  if (!guard.tryLock(RF_TX_PROCESS_LEASE.GUARD_WAIT_MS)) {
    return null;
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    const raw = props.getProperty(RF_TX_PROCESS_LEASE.KEY);

    if (raw) {
      try {
        const current = JSON.parse(raw);
        if (Number(current.expiresAt || 0) > now) {
          return null;
        }
      } catch (err) {
        // Corrupt/old lease is treated as expired and replaced.
      }
    }

    const token = Utilities.getUuid();
    props.setProperty(
      RF_TX_PROCESS_LEASE.KEY,
      JSON.stringify({
        token: token,
        startedAt: now,
        expiresAt: now + RF_TX_PROCESS_LEASE.TTL_MS
      })
    );

    return token;
  } finally {
    guard.releaseLock();
  }
}

function rfTxReleaseProcessorLease_(token) {
  if (!token) return;

  const guard = LockService.getScriptLock();
  if (!guard.tryLock(RF_TX_PROCESS_LEASE.GUARD_WAIT_MS)) {
    // Safe fallback: the lease has an expiry and the next trigger can recover.
    return;
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(RF_TX_PROCESS_LEASE.KEY);
    if (!raw) return;

    try {
      const current = JSON.parse(raw);
      if (current && current.token === token) {
        props.deleteProperty(RF_TX_PROCESS_LEASE.KEY);
      }
    } catch (err) {
      props.deleteProperty(RF_TX_PROCESS_LEASE.KEY);
    }
  } finally {
    guard.releaseLock();
  }
}

function processTransactionMailer() {
  const leaseToken = rfTxAcquireProcessorLease_();

  // Only skip when another Transaction Mailer execution owns the dedicated
  // processor lease. The Bulk Loyalty Mailer no longer causes this skip.
  if (!leaseToken) {
    return 'Skipped: another Transaction Mailer run is active.';
  }

  try {
    const masterSs = SpreadsheetApp.openById(RF_TX_MAILER.MASTER_SPREADSHEET_ID);
    const logSheet = rfTxEnsureLogSheet_(masterSs);
    const props = PropertiesService.getScriptProperties();

    const editResult = rfTxDiscoverEditingTransactions_(masterSs, logSheet);
    rfTxRefreshWaitingEditingTransactions_(masterSs, logSheet);

    const frameResult = rfTxDiscoverFrameTransactions_(logSheet);
    rfTxRefreshWaitingFrameTransactions_(logSheet);

    const backfillComplete = !editResult.hasMore && !frameResult.hasMore;
    props.setProperty('RF_TX_BACKFILL_COMPLETE', backfillComplete ? 'TRUE' : 'FALSE');

    const progress = [
      'Editing added this run: ' + editResult.added,
      'Frame added this run: ' + frameResult.added,
      'BACKFILL COMPLETE: ' + (backfillComplete ? 'YES' : 'NO')
    ].join('\\n');

    // Even if the live flag was accidentally left on, never send while the
    // historical window is incomplete. Stamp attribution needs the full window.
    if (!backfillComplete) {
      return 'BACKFILL IN PROGRESS — no customer emails sent.\\n' +
        progress + '\\n' + rfTxStatusSummary_(logSheet);
    }

    if (!rfTxSendingEnabled_()) {
      return 'SAFE MODE — no live emails sent.\\n' +
        progress + '\\n' + rfTxStatusSummary_(logSheet);
    }

    return progress + '\\n' + rfTxSendReadyTransactions_(masterSs, logSheet);
  } finally {
    rfTxReleaseProcessorLease_(leaseToken);
  }
}

/* ==========================================================================
   EDITING PAYMENT SOURCE: REMIT
   A Date | B Email | C Name | D Order Type | E File Type | F Amount

   Only NORMAL FILE / RUSH FILE are treated as initial Editing payments here.
   Fetched revision/additional payments are intentionally NOT turned into a new
   transaction email because the current Loyalty authority is still Tracking.
   ========================================================================== */

function rfTxDiscoverEditingTransactions_(masterSs, logSheet) {
  const remit = masterSs.getSheetByName(RF_TX_MAILER.REMIT_SHEET);
  if (!remit || remit.getLastRow() <= RF_TX_MAILER.REMIT_HEADER_ROW) {
    return { added: 0, hasMore: false };
  }

  const startRow = RF_TX_MAILER.REMIT_HEADER_ROW + 1;
  const rows = remit
    .getRange(startRow, 1, remit.getLastRow() - RF_TX_MAILER.REMIT_HEADER_ROW, 17)
    .getDisplayValues();

  const existing = rfTxLogIndex_(logSheet);
  const used = rfTxUsedEditingOrderIds_(logSheet, 0);
  const trackingByEmail = rfTxBuildTrackingIndex_(masterSs);
  const cutoff = rfTxStartDate_();
  const pending = [];
  let hasMore = false;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const sourceRow = startRow + index;
    const txDate = rfTxParseRemitDate_(row[0]);
    if (!txDate || txDate < cutoff) continue;

    const fileType = rfTxClean_(row[4]).toUpperCase();
    if (!/^(NORMAL|RUSH)\s+FILE$/.test(fileType)) continue;

    const email = rfTxNormalizeEmail_(row[1]);
    const name = rfTxClean_(row[2]);
    const orderType = rfTxClean_(row[3]);
    const amount = rfTxAmount_(row[5]);

    if (!rfTxValidEmail_(email) || !name || !orderType || !(amount > 0)) continue;

    const key = 'EDIT|REMIT|' + sourceRow;
    if (existing[key]) continue;

    if (pending.length >= RF_TX_MAILER.DISCOVERY_BATCH_SIZE) {
      hasMore = true;
      break;
    }

    // New POS transactions have their authoritative Editing ID in REMIT Q.
    // Never link a POS order by coincidence to a different customer's order.
    const posOrderId = rfTxClean_(row[16]).toUpperCase();
    const linked = posOrderId
      ? rfTxFindExactPosTrackingLink_(trackingByEmail, posOrderId, email, orderType, amount, used)
      : rfTxFindTrackingLinkFromIndex_(trackingByEmail, email, orderType, amount, used);

    pending.push({
      key: key,
      source: 'EDITING',
      sourceRow: sourceRow,
      transactionDate: txDate,
      orderId: linked.orderIds.join(', '),
      customerId: '',
      email: email,
      customerName: name,
      typeProduct: orderType,
      grossAmount: amount,
      eligibleAmount: amount,
      detectedAt: new Date(),
      newStamps: '',
      lifetimeAfter: '',
      totalAfter: '',
      status: linked.found ? 'READY' : 'WAITING_TRACKING',
      sentAt: '',
      attempts: 0,
      error: linked.found
        ? ''
        : 'Payment is recorded in REMIT but is waiting for its minimum Tracking order record.'
    });

    existing[key] = true;
    linked.orderIds.forEach(function(id) {
      used[String(id || '').toUpperCase()] = true;
    });
  }

  if (pending.length) {
    rfTxAppendLogsBatch_(logSheet, pending);
  }

  return { added: pending.length, hasMore: hasMore };
}

function rfTxBuildTrackingIndex_(masterSs) {
  const byEmail = {};
  const tracking = masterSs.getSheetByName(RF_TX_MAILER.TRACKING_SHEET);

  if (!tracking || tracking.getLastRow() < 2) return byEmail;

  const rows = tracking
    .getRange(2, 1, tracking.getLastRow() - 1, 6)
    .getDisplayValues();

  rows.forEach(function(row, index) {
    const orderId = rfTxClean_(row[0]).toUpperCase();
    const orderNum = rfTxOrderNumber_(orderId);
    if (!rfTxEligibleTrackingId_(orderId)) return;

    const email = rfTxNormalizeEmail_(row[1]);
    if (!email) return;

    const status = rfTxClean_(row[4]);
    const amountText = rfTxClean_(row[5]);
    if (/REFUND/i.test(status + ' ' + amountText)) return;

    const amount = rfTxAmount_(amountText);
    if (!(amount > 0)) return;

    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push({
      orderId: orderId,
      orderType: rfTxClean_(row[3]).toUpperCase(),
      amountCents: Math.round(amount * 100),
      sourceRow: index + 2
    });
  });

  Object.keys(byEmail).forEach(function(email) {
    byEmail[email].sort(function(a, b) {
      return a.sourceRow - b.sourceRow;
    });
  });

  return byEmail;
}

function rfTxFindTrackingLinkFromIndex_(trackingByEmail, emailInput, typeInput, amountInput, usedOrderIds) {
  const email = rfTxNormalizeEmail_(emailInput);
  const type = rfTxClean_(typeInput).toUpperCase();
  const targetCents = Math.round(Number(amountInput || 0) * 100);

  if (!email || !(targetCents > 0)) {
    return { found: false, orderIds: [] };
  }

  const candidates = (trackingByEmail[email] || []).filter(function(c) {
    // Legacy REMIT rows have no Q Order ID. Never pair them to a POS order
    // through a coincidental email / amount match.
    return !RF_TX_MAILER.POS_ID_PATTERN.test(c.orderId) &&
      !(usedOrderIds && usedOrderIds[c.orderId]);
  });

  let exact = candidates.filter(function(c) {
    return c.amountCents === targetCents && c.orderType === type;
  });

  if (!exact.length) {
    exact = candidates.filter(function(c) {
      return c.amountCents === targetCents;
    });
  }

  if (exact.length) {
    return { found: true, orderIds: [exact[0].orderId] };
  }

  const pool = candidates.slice(0, 18);
  const combo = rfTxFindCandidateCombination_(pool, targetCents, 6);

  if (combo.length) {
    return {
      found: true,
      orderIds: combo.map(function(c) { return c.orderId; })
    };
  }

  return { found: false, orderIds: [] };
}

function rfTxRefreshWaitingEditingTransactions_(masterSs, logSheet) {
  const values = logSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const remit = masterSs.getSheetByName(RF_TX_MAILER.REMIT_SHEET);
  if (!remit) return;

  for (let r = 1; r < values.length; r++) {
    const source = rfTxClean_(values[r][1]);
    const status = rfTxClean_(values[r][15]);

    if (source !== 'EDITING' || status !== 'WAITING_TRACKING') continue;

    const sourceRow = Number(values[r][2] || 0);
    if (sourceRow <= RF_TX_MAILER.REMIT_HEADER_ROW || sourceRow > remit.getLastRow()) continue;

    const row = remit.getRange(sourceRow, 1, 1, 17).getDisplayValues()[0];
    const txDate = rfTxParseRemitDate_(row[0]);
    const fileType = rfTxClean_(row[4]).toUpperCase();
    const email = rfTxNormalizeEmail_(row[1]);
    const name = rfTxClean_(row[2]);
    const orderType = rfTxClean_(row[3]);
    const amount = rfTxAmount_(row[5]);

    if (!txDate || txDate < rfTxStartDate_() || !/^(NORMAL|RUSH)\s+FILE$/.test(fileType)) {
      logSheet.getRange(r + 1, 16).setValue('IGNORED_SOURCE_CHANGED');
      logSheet.getRange(r + 1, 19).setValue('REMIT source row no longer qualifies for transaction emailing.');
      continue;
    }

    if (!rfTxValidEmail_(email) || !name || !orderType || !(amount > 0)) continue;

    const used = rfTxUsedEditingOrderIds_(logSheet, r + 1);
    const posOrderId = rfTxClean_(row[16]).toUpperCase();
    const linked = posOrderId
      ? rfTxFindExactPosTrackingLink_(rfTxBuildTrackingIndex_(masterSs), posOrderId, email, orderType, amount, used)
      : rfTxFindTrackingLink_(masterSs, email, orderType, amount, used);
    if (!linked.found) continue;

    logSheet.getRange(r + 1, 4).setValue(txDate);
    logSheet.getRange(r + 1, 5).setValue(linked.orderIds.join(', '));
    logSheet.getRange(r + 1, 7).setValue(email);
    logSheet.getRange(r + 1, 8).setValue(name);
    logSheet.getRange(r + 1, 9).setValue(orderType);
    logSheet.getRange(r + 1, 10).setValue(amount);
    logSheet.getRange(r + 1, 11).setValue(amount);
    logSheet.getRange(r + 1, 16).setValue('READY');
    logSheet.getRange(r + 1, 19).setValue('');
  }
}

function rfTxUsedEditingOrderIds_(logSheet, excludeLogRow) {
  const used = {};
  const values = logSheet.getDataRange().getDisplayValues();

  for (let r = 1; r < values.length; r++) {
    if (r + 1 === Number(excludeLogRow || 0)) continue;
    if (rfTxClean_(values[r][1]) !== 'EDITING') continue;

    rfTxParseOrderIdList_(values[r][4]).forEach(function(id) {
      used[id] = true;
    });
  }

  return used;
}

function rfTxFindTrackingLink_(masterSs, emailInput, typeInput, amountInput, usedOrderIds) {
  const email = rfTxNormalizeEmail_(emailInput);
  const type = rfTxClean_(typeInput).toUpperCase();
  const targetCents = Math.round(Number(amountInput || 0) * 100);

  if (!email || !(targetCents > 0)) {
    return { found: false, orderIds: [] };
  }

  const tracking = masterSs.getSheetByName(RF_TX_MAILER.TRACKING_SHEET);
  if (!tracking || tracking.getLastRow() < 2) {
    return { found: false, orderIds: [] };
  }

  const rows = tracking.getRange(2, 1, tracking.getLastRow() - 1, 6).getDisplayValues();
  const candidates = [];

  rows.forEach(function(row, index) {
    const orderId = rfTxClean_(row[0]).toUpperCase();
    const orderNum = rfTxOrderNumber_(orderId);
    if (!rfTxEligibleTrackingId_(orderId)) return;
    // Legacy matching must not borrow the ID of a new POS transaction.
    if (RF_TX_MAILER.POS_ID_PATTERN.test(orderId)) return;
    if (usedOrderIds && usedOrderIds[orderId]) return;
    if (rfTxNormalizeEmail_(row[1]) !== email) return;

    const status = rfTxClean_(row[4]);
    const amountText = rfTxClean_(row[5]);
    if (/REFUND/i.test(status + ' ' + amountText)) return;

    const amount = rfTxAmount_(amountText);
    if (!(amount > 0)) return;

    candidates.push({
      orderId: orderId,
      orderType: rfTxClean_(row[3]).toUpperCase(),
      amountCents: Math.round(amount * 100),
      sourceRow: index + 2
    });
  });

  candidates.sort(function(a, b) { return a.sourceRow - b.sourceRow; });

  // Best case: one Tracking order equals the payment. Prefer same Editing type.
  let exact = candidates.filter(function(c) {
    return c.amountCents === targetCents && c.orderType === type;
  });
  if (!exact.length) {
    exact = candidates.filter(function(c) { return c.amountCents === targetCents; });
  }
  if (exact.length) {
    return { found: true, orderIds: [exact[0].orderId] };
  }

  // Some clients pay several Editing orders together. Example: ₱600 + ₱1,200
  // may appear as one ₱1,800 REMIT payment. Find a small exact combination.
  const pool = candidates.slice(0, 18);
  const combo = rfTxFindCandidateCombination_(pool, targetCents, 6);

  if (combo.length) {
    return {
      found: true,
      orderIds: combo.map(function(c) { return c.orderId; })
    };
  }

  return { found: false, orderIds: [] };
}

function rfTxFindCandidateCombination_(candidates, targetCents, maxDepth) {
  let answer = null;

  function walk(start, chosen, sum) {
    if (answer) return;
    if (sum === targetCents) {
      answer = chosen.slice();
      return;
    }
    if (sum > targetCents || chosen.length >= maxDepth) return;

    for (let i = start; i < candidates.length; i++) {
      const next = candidates[i];
      const nextSum = sum + next.amountCents;
      if (nextSum > targetCents) continue;
      chosen.push(next);
      walk(i + 1, chosen, nextSum);
      chosen.pop();
      if (answer) return;
    }
  }

  walk(0, [], 0);
  return answer || [];
}

/* ==========================================================================
   FRAME SOURCE
   A Timestamp | B OrderId | C Size | E Price | J Email | P Notes | S Status
   ========================================================================== */

function rfTxDiscoverFrameTransactions_(logSheet) {
  const frameSs = SpreadsheetApp.openById(RF_TX_MAILER.FRAME_SPREADSHEET_ID);
  const sheet = frameSs.getSheetByName(RF_TX_MAILER.FRAME_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { added: 0, hasMore: false };
  }

  const existing = rfTxLogIndex_(logSheet);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getDisplayValues();
  const cutoff = rfTxStartDate_();
  const pending = [];
  let hasMore = false;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const sourceRow = index + 2;
    const txDate = rfTxParseFrameTimestamp_(row[0]);
    if (!txDate || txDate < cutoff) continue;

    const email = rfTxNormalizeEmail_(row[9]);
    const gross = rfTxAmount_(row[4]);
    const status = rfTxClean_(row[18]);

    if (!rfTxValidEmail_(email) || !(gross > 0)) continue;
    if (/REFUND|CANCEL/i.test(status + ' ' + String(row[4] || ''))) continue;

    const key = 'FRAME|ROW|' + sourceRow;
    if (existing[key]) continue;

    if (pending.length >= RF_TX_MAILER.DISCOVERY_BATCH_SIZE) {
      hasMore = true;
      break;
    }

    const notes = rfTxClean_(row[15]);
    const shippingExcluded = rfTxShippingFee_(notes);
    const eligible = Math.max(0, gross - shippingExcluded);
    if (!(eligible > 0)) continue;

    const orderId = rfTxClean_(row[1]).toUpperCase();
    const size = rfTxClean_(row[2]);
    const fullName = rfTxClean_((row[6] || '') + ' ' + (row[7] || ''));

    let mailStatus = 'WAITING_ORDER_ID';
    let error = 'Waiting for Frame Order ID.';

    if (orderId) {
      if (rfTxFramePaymentVerified_(status)) {
        mailStatus = 'READY';
        error = '';
      } else {
        mailStatus = 'WAITING_VERIFICATION';
        error = 'Waiting for frame payment/order verification.';
      }
    }

    pending.push({
      key: key,
      source: 'PICTURE FRAME',
      sourceRow: sourceRow,
      transactionDate: txDate,
      orderId: orderId,
      customerId: '',
      email: email,
      customerName: fullName,
      typeProduct: size || 'Picture Frame',
      grossAmount: gross,
      eligibleAmount: eligible,
      detectedAt: new Date(),
      newStamps: '',
      lifetimeAfter: '',
      totalAfter: '',
      status: mailStatus,
      sentAt: '',
      attempts: 0,
      error: error
    });

    existing[key] = true;
  }

  if (pending.length) {
    rfTxAppendLogsBatch_(logSheet, pending);
  }

  return { added: pending.length, hasMore: hasMore };
}

function rfTxRefreshWaitingFrameTransactions_(logSheet) {
  const values = logSheet.getDataRange().getValues();
  if (values.length < 2) return;

  const frameSs = SpreadsheetApp.openById(RF_TX_MAILER.FRAME_SPREADSHEET_ID);
  const frameSheet = frameSs.getSheetByName(RF_TX_MAILER.FRAME_SHEET);
  if (!frameSheet) return;

  for (let r = 1; r < values.length; r++) {
    const source = rfTxClean_(values[r][1]);
    const status = rfTxClean_(values[r][15]);

    if (
      source !== 'PICTURE FRAME' ||
      (status !== 'WAITING_ORDER_ID' && status !== 'WAITING_VERIFICATION')
    ) continue;

    const sourceRow = Number(values[r][2] || 0);
    if (sourceRow < 2 || sourceRow > frameSheet.getLastRow()) continue;

    const row = frameSheet.getRange(sourceRow, 1, 1, 19).getDisplayValues()[0];
    const currentOrderId = rfTxClean_(row[1]).toUpperCase();
    const currentStatus = rfTxClean_(row[18]);
    const priceText = rfTxClean_(row[4]);

    if (/REFUND|CANCEL/i.test(currentStatus + ' ' + priceText)) {
      logSheet.getRange(r + 1, 16).setValue('CANCELLED_REFUNDED');
      logSheet.getRange(r + 1, 19).setValue('Frame transaction became refunded/cancelled before email.');
      continue;
    }

    // Keep live source values fresh while waiting.
    const email = rfTxNormalizeEmail_(row[9]);
    const gross = rfTxAmount_(row[4]);
    const shipping = rfTxShippingFee_(row[15]);
    const eligible = Math.max(0, gross - shipping);
    const size = rfTxClean_(row[2]);
    const fullName = rfTxClean_((row[6] || '') + ' ' + (row[7] || ''));

    if (rfTxValidEmail_(email)) logSheet.getRange(r + 1, 7).setValue(email);
    if (fullName) logSheet.getRange(r + 1, 8).setValue(fullName);
    if (size) logSheet.getRange(r + 1, 9).setValue(size);
    if (gross > 0) logSheet.getRange(r + 1, 10).setValue(gross);
    if (eligible > 0) logSheet.getRange(r + 1, 11).setValue(eligible);

    if (!currentOrderId) {
      logSheet.getRange(r + 1, 16).setValue('WAITING_ORDER_ID');
      logSheet.getRange(r + 1, 19).setValue('Waiting for Frame Order ID.');
      continue;
    }

    logSheet.getRange(r + 1, 5).setValue(currentOrderId);

    if (rfTxFramePaymentVerified_(currentStatus)) {
      logSheet.getRange(r + 1, 16).setValue('READY');
      logSheet.getRange(r + 1, 19).setValue('');
    } else {
      logSheet.getRange(r + 1, 16).setValue('WAITING_VERIFICATION');
      logSheet.getRange(r + 1, 19).setValue('Waiting for frame payment/order verification.');
    }
  }
}

/* ==========================================================================
   SEND QUEUE + CONSISTENT PER-TRANSACTION STAMP ATTRIBUTION
   ========================================================================== */

function rfTxSendReadyTransactions_(masterSs, logSheet) {
  const data = logSheet.getDataRange().getValues();
  if (data.length < 2) return 'No transaction emails are waiting.';

  const groups = {};

  // Include every transaction already represented in live loyalty totals, even
  // if its email was already sent or a Frame payment is still being verified.
  // This makes the +NEW STAMP attribution stable in chronological order.
  for (let r = 1; r < data.length; r++) {
    const source = rfTxClean_(data[r][1]);
    const status = rfTxClean_(data[r][15]);
    const email = rfTxNormalizeEmail_(data[r][6]);
    const eligible = Number(data[r][10] || 0);

    if (!email || !(eligible > 0)) continue;
    if (!rfTxRepresentedInLoyalty_(source, status)) continue;

    const tx = {
      logRow: r + 1,
      key: rfTxClean_(data[r][0]),
      source: source,
      sourceRow: Number(data[r][2] || 0),
      transactionDate: data[r][3] instanceof Date ? data[r][3] : null,
      orderId: rfTxClean_(data[r][4]),
      customerId: rfTxClean_(data[r][5]),
      email: email,
      customerName: rfTxClean_(data[r][7]),
      typeProduct: rfTxClean_(data[r][8]),
      grossAmount: Number(data[r][9] || 0),
      eligibleAmount: eligible,
      detectedAt: data[r][11] instanceof Date ? data[r][11] : new Date(0),
      status: status,
      attempts: Number(data[r][17] || 0)
    };

    if (!groups[email]) groups[email] = [];
    groups[email].push(tx);
  }

  let sent = 0;
  let failed = 0;
  const emails = Object.keys(groups);

  for (let e = 0; e < emails.length && sent < RF_TX_MAILER.MAX_SENDS_PER_RUN; e++) {
    const email = emails[e];
    const txs = groups[email];
    txs.sort(rfTxTransactionSort_);

    const live = rfTxGetLiveLoyaltyState_(masterSs, email);
    const postStartEligible = txs.reduce(function(sum, tx) {
      return sum + Number(tx.eligibleAmount || 0);
    }, 0);

    let runningTotal = Math.max(0, Number(live.totalLoyaltySpend || 0) - postStartEligible);
    const calculations = {};

    txs.forEach(function(tx) {
      const totalBefore = runningTotal;
      const stampsBefore = Math.floor(totalBefore / 2000);
      runningTotal = rfTxMoney2_(runningTotal + tx.eligibleAmount);
      const stampsAfter = Math.floor(runningTotal / 2000);

      calculations[tx.logRow] = {
        newStamps: Math.max(0, stampsAfter - stampsBefore),
        state: rfTxStateForTotal_(live, runningTotal)
      };
    });

    for (let i = 0; i < txs.length && sent < RF_TX_MAILER.MAX_SENDS_PER_RUN; i++) {
      const tx = txs[i];
      if (tx.status !== 'READY' && tx.status !== 'RETRY') continue;

      if (tx.attempts >= RF_TX_MAILER.MAX_ATTEMPTS) {
        logSheet.getRange(tx.logRow, 16).setValue('FAILED_MAX_ATTEMPTS');
        continue;
      }

      const calc = calculations[tx.logRow];
      const txState = calc.state;
      const newStamps = calc.newStamps;

      try {
        const customerName = tx.customerName || live.fullName || 'Rocketfix Customer';
        const customerId = live.customerId || tx.customerId || '';

        rfTxSendTransactionEmail_({
          source: tx.source,
          orderId: tx.orderId,
          email: tx.email,
          customerName: customerName,
          typeProduct: tx.typeProduct,
          grossAmount: tx.grossAmount,
          eligibleAmount: tx.eligibleAmount,
          transactionDate: tx.transactionDate,
          customerId: customerId,
          newStampsEarned: newStamps,
          loyalty: txState
        });

        logSheet.getRange(tx.logRow, 6).setValue(customerId);
        logSheet.getRange(tx.logRow, 13).setValue(newStamps);
        logSheet.getRange(tx.logRow, 14).setValue(txState.lifetimeStamps);
        logSheet.getRange(tx.logRow, 15).setValue(txState.totalLoyaltySpend);
        logSheet.getRange(tx.logRow, 16).setValue('SENT');
        logSheet.getRange(tx.logRow, 17).setValue(new Date());
        logSheet.getRange(tx.logRow, 18).setValue(tx.attempts + 1);
        logSheet.getRange(tx.logRow, 19).setValue('');
        sent++;
      } catch (err) {
        const nextAttempts = tx.attempts + 1;
        logSheet.getRange(tx.logRow, 16).setValue(
          nextAttempts >= RF_TX_MAILER.MAX_ATTEMPTS ? 'FAILED_MAX_ATTEMPTS' : 'RETRY'
        );
        logSheet.getRange(tx.logRow, 18).setValue(nextAttempts);
        logSheet.getRange(tx.logRow, 19).setValue(
          err && err.message ? err.message : String(err)
        );
        failed++;
      }
    }
  }

  SpreadsheetApp.flush();
  return 'Transaction Mailer: sent ' + sent + ', failed ' + failed + '.';
}

function rfTxRepresentedInLoyalty_(source, status) {
  if (/CANCEL|REFUND|IGNORED/.test(status)) return false;

  if (source === 'EDITING') {
    return status !== 'WAITING_TRACKING';
  }

  if (source === 'PICTURE FRAME') {
    // The current live loyalty backend counts valid frame spend as soon as the
    // Frame Orders row exists, even while verification/order-id is pending.
    return true;
  }

  return false;
}

function rfTxTransactionSort_(a, b) {
  const aDate = a.transactionDate instanceof Date && !isNaN(a.transactionDate)
    ? a.transactionDate.getTime()
    : a.detectedAt.getTime();
  const bDate = b.transactionDate instanceof Date && !isNaN(b.transactionDate)
    ? b.transactionDate.getTime()
    : b.detectedAt.getTime();

  if (aDate !== bDate) return aDate - bDate;

  // Your real customer journey is Editing payment first, then Frame checkout.
  if (a.source !== b.source) {
    if (a.source === 'EDITING') return -1;
    if (b.source === 'EDITING') return 1;
  }

  return a.sourceRow - b.sourceRow;
}

/* ==========================================================================
   LIVE LOYALTY STATE
   Mirrors current spend-based mechanics without changing Customers.
   ========================================================================== */

function rfTxGetLiveLoyaltyState_(masterSs, emailInput) {
  const email = rfTxNormalizeEmail_(emailInput);
  let editingSpend = 0;
  let frameSpend = 0;

  const tracking = masterSs.getSheetByName(RF_TX_MAILER.TRACKING_SHEET);
  if (tracking && tracking.getLastRow() >= 2) {
    const rows = tracking.getRange(2, 1, tracking.getLastRow() - 1, 6).getDisplayValues();
    rows.forEach(function(row) {
      if (rfTxNormalizeEmail_(row[1]) !== email) return;
      const status = rfTxClean_(row[4]);
      const amountText = rfTxClean_(row[5]);
      if (/REFUND/i.test(status + ' ' + amountText)) return;
      const amount = rfTxAmount_(amountText);
      if (amount > 0) editingSpend += amount;
    });
  }

  const frameSs = SpreadsheetApp.openById(RF_TX_MAILER.FRAME_SPREADSHEET_ID);
  const frameSheet = frameSs.getSheetByName(RF_TX_MAILER.FRAME_SHEET);
  if (frameSheet && frameSheet.getLastRow() >= 2) {
    const rows = frameSheet.getRange(2, 1, frameSheet.getLastRow() - 1, 19).getDisplayValues();
    rows.forEach(function(row) {
      if (rfTxNormalizeEmail_(row[9]) !== email) return;
      const priceText = rfTxClean_(row[4]);
      const status = rfTxClean_(row[18]);
      if (/REFUND/i.test(status + ' ' + priceText)) return;
      const gross = rfTxAmount_(priceText);
      if (!(gross > 0)) return;
      frameSpend += Math.max(0, gross - rfTxShippingFee_(row[15]));
    });
  }

  editingSpend = rfTxMoney2_(editingSpend);
  frameSpend = rfTxMoney2_(frameSpend);
  const total = rfTxMoney2_(editingSpend + frameSpend);
  const customer = rfTxFindCustomer_(masterSs, email);

  return rfTxStateForTotal_({
    customerId: customer.customerId,
    fullName: customer.fullName,
    voucherStatus: customer.voucherStatus,
    frameStatus: customer.frameStatus,
    editingSpend: editingSpend,
    frameSpend: frameSpend
  }, total);
}

function rfTxStateForTotal_(base, totalInput) {
  const total = Math.max(0, rfTxMoney2_(totalInput));
  const lifetimeStamps = Math.floor(total / 2000);
  const currentStamps = lifetimeStamps === 0 ? 0 : ((lifetimeStamps - 1) % 10) + 1;
  const mod = total % 2000;
  const spendToNextStamp = rfTxMoney2_(mod === 0 ? 2000 : 2000 - mod);

  return {
    customerId: base.customerId || '',
    fullName: base.fullName || '',
    voucherStatus: base.voucherStatus || '',
    frameStatus: base.frameStatus || '',
    editingSpend: Number(base.editingSpend || 0),
    frameSpend: Number(base.frameSpend || 0),
    totalLoyaltySpend: total,
    lifetimeStamps: lifetimeStamps,
    currentStamps: currentStamps,
    spendToNextStamp: spendToNextStamp
  };
}

function rfTxFindCustomer_(masterSs, emailInput) {
  const email = rfTxNormalizeEmail_(emailInput);
  const sheet = masterSs.getSheetByName(RF_TX_MAILER.CUSTOMERS_SHEET);

  if (!sheet || sheet.getLastRow() < 2 || !email) {
    return { customerId: '', fullName: '', voucherStatus: '', frameStatus: '' };
  }

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 32).getDisplayValues();
  for (let i = 0; i < rows.length; i++) {
    if (rfTxNormalizeEmail_(rows[i][1]) !== email) continue;
    return {
      customerId: rfTxClean_(rows[i][0]),
      fullName: rfTxClean_(rows[i][2]),
      voucherStatus: rfTxClean_(rows[i][24]),
      frameStatus: rfTxClean_(rows[i][27])
    };
  }

  return { customerId: '', fullName: '', voucherStatus: '', frameStatus: '' };
}

/* ==========================================================================
   EMAIL
   ========================================================================== */

function rfTxSendTransactionEmail_(data) {
  if (!rfTxValidEmail_(data.email)) {
    throw new Error('Invalid recipient email: ' + data.email);
  }

  const sourceLabel =
    data.source === 'PICTURE FRAME'
      ? 'Picture Frame'
      : 'Editing Service';

  const subject =
    'Payment Confirmed | ' +
    (data.customerName || 'Rocketfix Client') +
    ' | ' +
    (data.orderId || sourceLabel) +
    ' | Rocketfix';

  const plainBody = rfTxBuildPlainText_(data);
  const htmlBody = rfTxBuildHtml_(data);

  const options = {
    name: RF_TX_MAILER.BUSINESS_NAME,
    replyTo: RF_TX_MAILER.BUSINESS_EMAIL,
    htmlBody: htmlBody
  };

  try {
    const aliases = GmailApp.getAliases().map(function(a) {
      return String(a || '').toLowerCase();
    });

    if (aliases.indexOf(RF_TX_MAILER.BUSINESS_EMAIL.toLowerCase()) >= 0) {
      options.from = RF_TX_MAILER.BUSINESS_EMAIL;
    }
  } catch (err) {
    // Sending still works from the authorized Gmail account if alias lookup is unavailable.
  }

  GmailApp.sendEmail(
    data.email,
    subject,
    plainBody,
    options
  );
}

function rfTxBuildPlainText_(data) {
  const loyalty = data.loyalty || {};
  const sourceLabel =
    data.source === 'PICTURE FRAME'
      ? 'Picture Frame'
      : 'Editing Service';

  const lines = [
    'ROCKETFIX EDITING SERVICES',
    '',
    'PAYMENT CONFIRMED',
    '',
    'ORDER INFORMATION',
    'Payment Source: ' + sourceLabel,
    (String(data.orderId || '').indexOf(',') >= 0 ? 'Order IDs: ' : 'Order ID: ') + (data.orderId || '—'),
    (data.source === 'PICTURE FRAME' ? 'Product: ' : 'Service: ') + (data.typeProduct || 'Rocketfix Transaction'),
    'Amount Paid: ' + rfTxPeso_(data.grossAmount),
    'Payment Status: Confirmed',
    '',
    'ROCKETFIX LOYAL REWARDS UPDATE'
  ];

  if (Number(data.newStampsEarned || 0) > 0) {
    lines.push(
      '+' + Number(data.newStampsEarned) + ' NEW STAMP' +
      (Number(data.newStampsEarned) === 1 ? '' : 'S')
    );
  }

  lines.push(
    'Current Card: ' + Number(loyalty.currentStamps || 0) + ' / 10',
    'Lifetime Stamps: ' + Number(loyalty.lifetimeStamps || 0),
    'Total Loyalty Spend: ' + rfTxPeso_(loyalty.totalLoyaltySpend),
    'To Next Stamp: ' + rfTxPeso_(loyalty.spendToNextStamp),
    '',
    'Stamp 5: ₱500 Rocketfix Voucher',
    'Stamp 10: FREE standard Large Picture Frame — 18" × 26.5"',
    '',
    'View My Rewards:',
    RF_TX_MAILER.REWARDS_URL,
    '',
    'Please keep this email for your records. If you do not see future Rocketfix updates, check your Spam or Promotions folder.',
    '',
    'Every cumulative ₱2,000 of eligible spend earns 1 stamp. Editing and picture-frame spend are combined. Shipping fees are excluded.',
    '',
    RF_TX_MAILER.BUSINESS_NAME,
    RF_TX_MAILER.WEBSITE
  );

  return lines.join('\n');
}

function rfTxBuildHtml_(data) {
  const loyalty = data.loyalty || {};
  const firstName = rfTxEscape_(rfTxFirstName_(data.customerName));
  const orderId = rfTxEscape_(data.orderId || '—');
  const typeProduct = rfTxEscape_(data.typeProduct || 'Rocketfix Transaction');
  const amountPaid = rfTxPeso_(data.grossAmount);

  const sourceLabel =
    data.source === 'PICTURE FRAME'
      ? 'Picture Frame'
      : 'Editing Service';

  const detailLabel =
    data.source === 'PICTURE FRAME'
      ? 'Product'
      : 'Service';

  const detailValue =
    data.source === 'PICTURE FRAME'
      ? typeProduct
      : typeProduct + (/\bediting\b/i.test(typeProduct) ? '' : ' Editing');

  const currentStamps = Number(loyalty.currentStamps || 0);
  const lifetimeStamps = Number(loyalty.lifetimeStamps || 0);
  const newStamps = Number(data.newStampsEarned || 0);

  const newStampBlock = newStamps > 0
    ? `
        <tr>
          <td align="center" style="padding:17px 20px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                   style="width:100%;max-width:500px;background:#102519;border:1px solid #1cff5a;border-radius:14px;">
              <tr>
                <td align="center" style="padding:14px 16px;">
                  <div style="color:#1cff5a;font-size:18px;font-weight:900;line-height:1.2;">
                    +${newStamps} NEW STAMP${newStamps === 1 ? '' : 'S'}
                  </div>
                  <div style="margin-top:4px;color:#a9cbb4;font-size:10px;line-height:1.55;">
                    Added from your latest eligible transaction.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : '';

  const nextReward = rfTxNextRewardCopy_(currentStamps, loyalty);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Rocketfix Payment Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#eeeeee;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="width:100%;background:#eeeeee;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:24px 10px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
             style="width:100%;max-width:620px;background:#070707;border-radius:24px;border:1px solid #181818;border-collapse:separate;border-spacing:0;overflow:hidden;">

        <tr>
          <td align="center" style="padding:27px 24px 11px;">
            <img src="${RF_TX_MAILER.LOGO_URL}" width="150" alt="Rocketfix"
                 style="display:block;width:150px;max-width:100%;height:auto;border:0;margin:0 auto;">
          </td>
        </tr>

        <tr>
          <td align="left" style="padding:10px 26px 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding:7px 12px;border-radius:999px;background:#10220d;border:1px solid #285b20;color:#7dff68;font-size:10px;font-weight:900;letter-spacing:1px;">
                  PAYMENT CONFIRMED
                </td>
              </tr>
            </table>

            <div style="margin-top:15px;font-size:29px;line-height:1.15;font-weight:900;color:#ffffff;">
              Your order has been confirmed.
            </div>

          </td>
        </tr>

        <tr>
          <td align="center" style="padding:22px 20px 5px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                   style="width:100%;max-width:540px;background:#0d0d0d;border:1px solid #242424;border-radius:18px;border-collapse:separate;border-spacing:0;">
              <tr>
                <td colspan="2" style="padding:18px 18px 10px;color:#ffffff;font-size:14px;font-weight:900;">
                  Order Information
                </td>
              </tr>

              ${rfTxInfoRowHtml_('Payment Source', rfTxEscape_(sourceLabel), true)}
              ${rfTxInfoRowHtml_(String(data.orderId || '').indexOf(',') >= 0 ? 'Order IDs' : 'Order ID', orderId, true)}
              ${rfTxInfoRowHtml_(detailLabel, detailValue, true)}
              ${rfTxInfoRowHtml_('Amount Paid', rfTxEscape_(amountPaid), true)}

              <tr>
                <td style="padding:10px 18px 16px;color:#777777;font-size:12px;">Payment Status</td>
                <td align="right" style="padding:10px 18px 16px;color:#7dff68;font-size:12px;font-weight:900;">Confirmed</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:25px 24px 0;">
            <div style="font-size:10px;letter-spacing:1.6px;color:#f4c542;font-weight:900;">
              ROCKETFIX LOYAL REWARDS UPDATE
            </div>
            <div style="margin-top:9px;font-size:25px;line-height:1.15;font-weight:900;color:#ffffff;">
              Your loyalty progress
            </div>
            <div style="margin:9px auto 0;max-width:470px;font-size:12px;line-height:1.65;color:#8f8f8f;">
              Your latest eligible transaction has already been included in your Rocketfix Rewards balance.
            </div>
          </td>
        </tr>

        ${newStampBlock}

        <tr>
          <td align="center" style="padding:18px 14px 7px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                   style="width:100%;max-width:540px;background:#0d0d0d;border:1px solid #242424;border-radius:18px;">
              <tr>
                <td align="center" style="padding:19px 10px 7px;color:#777777;font-size:9px;font-weight:900;letter-spacing:1.3px;">
                  YOUR STAMP CARD
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:5px 8px 8px;">
                  ${rfTxStampTrackerHtml_(currentStamps)}
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:8px 12px 20px;">
                  <span style="font-size:20px;font-weight:900;color:#ffffff;">${currentStamps} / 10</span>
                  <span style="font-size:10px;color:#777777;"> completed</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:17px 25px 7px;">
            <div style="font-size:9px;color:#777777;font-weight:900;letter-spacing:1px;">
              YOUR NEXT LOYALTY REWARD
            </div>
            <div style="margin-top:7px;font-size:19px;color:#ffffff;font-weight:900;line-height:1.3;">
              ${rfTxEscape_(nextReward.title)}
            </div>
            <div style="margin:9px auto 0;max-width:455px;font-size:12px;line-height:1.7;color:#9b9b9b;">
              ${rfTxEscape_(nextReward.message)}
            </div>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:24px 20px 8px;">
            <div style="color:#f4c542;font-size:10px;font-weight:900;letter-spacing:1.4px;">
              YOUR ROCKETFIX REWARDS
            </div>
            <div style="margin-top:6px;color:#ffffff;font-size:19px;font-weight:900;">
              Easy reward guide
            </div>
            <div style="margin:7px auto 0;max-width:440px;color:#8e8e8e;font-size:10px;line-height:1.6;">
              Reach Stamp 5 for the voucher. Reach Stamp 10 for the free picture frame.
            </div>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:11px 20px 7px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                   style="width:100%;max-width:500px;background:#0b0b0b;border:2px solid #f4c542;border-radius:18px;box-shadow:0 0 18px rgba(244,197,66,.22);">
              <tr>
                <td align="center" style="padding:20px 16px 19px;color:#ffffff;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                    <tr>
                      <td align="center" style="padding:7px 12px;border-radius:999px;background:#181300;border:1px solid #f4c542;color:#f4c542;font-size:11px;font-weight:900;letter-spacing:1.2px;">
                        5TH STAMP REWARD
                      </td>
                    </tr>
                  </table>
                  <div style="margin-top:13px;font-size:42px;line-height:1;font-weight:900;color:#ffffff;">₱500</div>
                  <div style="margin-top:5px;font-size:17px;font-weight:900;letter-spacing:1px;color:#f4c542;">VOUCHER</div>
                  <div style="margin:10px auto 0;max-width:390px;font-size:11px;line-height:1.6;color:#c5c5c5;">
                    Reach <strong style="color:#ffffff;">₱10,000 in cumulative eligible spend</strong> and unlock a
                    <strong style="color:#f4c542;">₱500 voucher</strong> for your next eligible Rocketfix transaction.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:10px 20px 7px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                   style="width:100%;max-width:500px;background:#0b0b0b;border:2px solid #f4c542;border-radius:18px;box-shadow:0 0 18px rgba(244,197,66,.22);overflow:hidden;">
              <tr>
                <td align="center" style="padding:0;">
                  <img src="${RF_TX_MAILER.FRAME_REWARD_IMAGE}" width="500" alt="Rocketfix free picture frame reward"
                       style="display:block;width:100%;max-width:500px;height:auto;border:0;margin:0;">
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:18px 16px 20px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                    <tr>
                      <td align="center" style="padding:7px 12px;border-radius:999px;background:#181300;border:1px solid #f4c542;color:#f4c542;font-size:11px;font-weight:900;letter-spacing:1.2px;">
                        10TH STAMP REWARD
                      </td>
                    </tr>
                  </table>
                  <div style="margin-top:12px;font-size:20px;color:#ffffff;font-weight:900;line-height:1.25;">FREE PICTURE FRAME</div>
                  <div style="margin-top:4px;font-size:25px;color:#f4c542;font-weight:900;line-height:1.1;">LARGE • 18&quot; × 26.5&quot;</div>
                  <div style="margin:10px auto 0;max-width:390px;font-size:11px;line-height:1.6;color:#c5c5c5;">
                    Reach <strong style="color:#ffffff;">₱20,000 in cumulative eligible spend</strong> and unlock a
                    <strong style="color:#f4c542;">FREE Large picture frame — 18&quot; × 26.5&quot;.</strong>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:20px 24px 0;">
            <div style="font-size:10px;color:#666666;line-height:1.7;">
              Lifetime stamps:
              <strong style="color:#ffffff;">${lifetimeStamps}</strong><br>
              Total loyalty spend:
              <strong style="color:#ffffff;">${rfTxPeso_(loyalty.totalLoyaltySpend)}</strong><br>
              To your next stamp:
              <strong style="color:#ffffff;">${rfTxPeso_(loyalty.spendToNextStamp)}</strong>
            </div>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:23px 20px 8px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"
                   style="border-collapse:separate;border-spacing:0;margin:0 auto;">
              <tr>
                <td align="center" bgcolor="#0084ff" style="background:#0084ff;border:1px solid #2196ff;border-radius:999px;">
                  <a href="${RF_TX_MAILER.REWARDS_URL}"
                     style="display:block;color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;padding:14px 24px;border-radius:999px;white-space:nowrap;">
                    View My Rewards
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:16px 25px 0;">
            <div style="max-width:470px;color:#777777;font-size:10px;line-height:1.6;">
              Please keep this email for your records. If you do not see future Rocketfix updates in your inbox,
              please check your Spam or Promotions folder.
            </div>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:18px 24px 28px;color:#5f5f5f;font-size:9px;line-height:1.65;">
            Every cumulative ₱2,000 of eligible spend earns 1 stamp.<br>
            Editing and picture-frame spend are combined. Shipping fees are excluded.<br>
            Past eligible Rocketfix transactions are included when recorded under the same account.<br>
            Rewards repeat every 10 stamps.<br><br>
            <strong style="color:#8b8b8b;">Rocketfix Editing Services</strong><br>
            www.rocketfixofficial.com
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function rfTxInfoRowHtml_(label, value, withBorder) {
  const border = withBorder ? 'border-bottom:1px solid #1d1d1d;' : '';

  return `
    <tr>
      <td style="padding:10px 18px;color:#777777;font-size:12px;${border}">
        ${rfTxEscape_(label)}
      </td>
      <td align="right" style="padding:10px 18px;color:#ffffff;font-size:12px;font-weight:900;${border}">
        ${value}
      </td>
    </tr>`;
}

function rfTxStampTrackerHtml_(currentStampsInput) {
  const currentStamps = Math.max(0, Math.min(10, Number(currentStampsInput || 0)));
  const boxes = [];

  for (let i = 1; i <= 10; i++) {
    const completed = i <= currentStamps;
    const milestone = i === 5 || i === 10;

    if (milestone) {
      boxes.push(
        `<td align="center" valign="middle" width="20%" style="padding:5px 3px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
              <td align="center" valign="middle" width="48" height="48"
                  style="width:48px;height:48px;background:#080808;border:2px solid #f4c542;
                         border-radius:12px;box-shadow:0 0 14px rgba(244,197,66,.62),0 0 24px rgba(244,197,66,.20);">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                  <tr>
                    <td align="center" valign="middle" width="38" height="38"
                        style="width:38px;height:38px;border:0;border-radius:9px;
                               background:#080808;color:#ffffff;font-size:34px;line-height:38px;
                               text-align:center;font-weight:900;">
                      &#127873;
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>`
      );
      continue;
    }

    const background = completed ? '#102519' : '#151515';
    const border = completed ? '#1cff5a' : '#303030';
    const color = completed ? '#1cff5a' : '#777777';
    const text = completed ? '&#10003;' : String(i);
    const fontSize = completed ? '19px' : '14px';

    boxes.push(
      `<td align="center" valign="middle" width="20%" style="padding:5px 3px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
          <tr>
            <td align="center" valign="middle" width="48" height="48"
                style="width:48px;height:48px;background:${background};border:2px solid ${border};
                       border-radius:12px;color:${color};font-size:${fontSize};font-weight:900;
                       line-height:48px;text-align:center;">
              ${text}
            </td>
          </tr>
        </table>
      </td>`
    );
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
           style="width:100%;max-width:338px;margin:0 auto;">
      <tr>${boxes.slice(0, 5).join('')}</tr>
      <tr>${boxes.slice(5, 10).join('')}</tr>
    </table>`;
}

function rfTxNextRewardCopy_(currentStampsInput, loyalty) {
  const current = Number(currentStampsInput || 0);

  if (current < 5) {
    const left = 5 - current;
    return {
      title: '₱500 Rocketfix Voucher',
      message:
        'You are ' + left + ' ' + (left === 1 ? 'stamp' : 'stamps') +
        ' away from unlocking your ₱500 Rocketfix Voucher.'
    };
  }

  if (current === 5) {
    return {
      title: '₱500 Rocketfix Voucher',
      message: 'Stamp 5 is complete. Check your Rewards account for your voucher status.'
    };
  }

  if (current < 10) {
    const left = 10 - current;
    return {
      title: 'FREE Large Picture Frame',
      message:
        'You are ' + left + ' ' + (left === 1 ? 'stamp' : 'stamps') +
        ' away from your FREE Large Picture Frame — 18" × 26.5".'
    };
  }

  return {
    title: 'FREE Large Picture Frame',
    message: 'Stamp 10 is complete. Check your Rewards account for your frame reward status.'
  };
}

/* ==========================================================================
   TEST + STATUS
   ========================================================================== */

function sendTransactionMailerTest() {
  const fake = {
    source: 'EDITING',
    orderId: 'RF-TEST',
    email: RF_TX_MAILER.BUSINESS_EMAIL,
    customerName: 'Rocketfix Test Customer',
    typeProduct: 'Family Picture',
    grossAmount: 2500,
    eligibleAmount: 2500,
    transactionDate: new Date(),
    customerId: 'RFC-TEST',
    newStampsEarned: 1,
    loyalty: {
      totalLoyaltySpend: 8300,
      lifetimeStamps: 4,
      currentStamps: 4,
      spendToNextStamp: 1700,
      voucherStatus: '',
      frameStatus: ''
    }
  };

  rfTxSendTransactionEmail_(fake);
  return 'Test transaction email sent to ' + RF_TX_MAILER.BUSINESS_EMAIL;
}


function sendPictureFrameTransactionMailerTest() {
  const fake = {
    source: 'PICTURE FRAME',
    orderId: 'FRAME-TEST',
    email: RF_TX_MAILER.BUSINESS_EMAIL,
    customerName: 'Rocketfix Test Customer',
    typeProduct: '18"x26.5" - Large',
    grossAmount: 2289,
    eligibleAmount: 2069,
    transactionDate: new Date(),
    customerId: 'RFC-TEST',
    newStampsEarned: 1,
    loyalty: {
      totalLoyaltySpend: 10550,
      lifetimeStamps: 5,
      currentStamps: 5,
      spendToNextStamp: 1450,
      voucherStatus: '🎁 READY TO CLAIM',
      frameStatus: ''
    }
  };

  rfTxSendTransactionEmail_(fake);
  return 'Picture Frame test email sent to ' + RF_TX_MAILER.BUSINESS_EMAIL;
}

function previewTransactionMailerStatus() {
  // Read-only status preview. The result is explicitly written to the
  // Execution log because Apps Script does not display return values by itself.
  const masterSs = SpreadsheetApp.openById(RF_TX_MAILER.MASTER_SPREADSHEET_ID);
  const logSheet = rfTxEnsureLogSheet_(masterSs);
  const props = PropertiesService.getScriptProperties();

  const complete =
    String(props.getProperty('RF_TX_BACKFILL_COMPLETE') || 'FALSE').toUpperCase() === 'TRUE';
  const enabled = rfTxSendingEnabled_();

  const output = [
    'BACKFILL COMPLETE: ' + (complete ? 'YES' : 'NO'),
    'LIVE SENDING: ' + (enabled ? 'ENABLED' : 'DISABLED'),
    '',
    rfTxStatusSummary_(logSheet)
  ].join('\n');

  console.log(output);
  return output;
}

// Manual diagnostic helper. Safe to run while live sending is disabled.
// It performs one normal processor pass and prints the result to Execution log.
function runTransactionMailerNow() {
  const output = processTransactionMailer();
  console.log(output);
  return output;
}

// Repairs the 1-minute processor trigger without touching transaction data.
function repairTransactionMailerTrigger() {
  rfTxInstallTrigger_();
  const message = 'Transaction Mailer 1-minute trigger repaired.';
  console.log(message);
  return message;
}

function rfTxStatusSummary_(logSheet) {
  const values = logSheet.getDataRange().getDisplayValues();
  const counts = {};

  for (let i = 1; i < values.length; i++) {
    const status = rfTxClean_(values[i][15]) || 'BLANK';
    counts[status] = (counts[status] || 0) + 1;
  }

  return Object.keys(counts)
    .sort()
    .map(function(key) {
      return key + ': ' + counts[key];
    })
    .join('\n') || 'No log entries yet.';
}


/* ==========================================================================
   LOG SHEET + DATE / SOURCE HELPERS
   ========================================================================== */

function rfTxEnsureLogSheet_(masterSs) {
  let sheet = masterSs.getSheetByName(RF_TX_MAILER.LOG_SHEET);

  if (!sheet) {
    sheet = masterSs.insertSheet(RF_TX_MAILER.LOG_SHEET);
    sheet.getRange(1, 1, 1, RF_TX_LOG_HEADERS.length).setValues([RF_TX_LOG_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, RF_TX_LOG_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#111111')
      .setFontColor('#ffffff');
    sheet.hideSheet();
    return sheet;
  }

  const current = sheet
    .getRange(1, 1, 1, RF_TX_LOG_HEADERS.length)
    .getDisplayValues()[0];

  for (let i = 0; i < RF_TX_LOG_HEADERS.length; i++) {
    if (current[i] !== RF_TX_LOG_HEADERS[i]) {
      throw new Error(
        'Transaction Email Log header mismatch at column ' + (i + 1) +
        '. Expected "' + RF_TX_LOG_HEADERS[i] + '" but found "' + current[i] + '".'
      );
    }
  }

  try { sheet.hideSheet(); } catch (err) {}
  return sheet;
}

function rfTxLogIndex_(logSheet) {
  const result = {};
  if (logSheet.getLastRow() < 2) return result;

  const keys = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 1).getDisplayValues();
  keys.forEach(function(row, index) {
    const key = rfTxClean_(row[0]);
    if (key) result[key] = index + 2;
  });
  return result;
}

function rfTxLogRowArray_(item) {
  return [
    item.key || '',
    item.source || '',
    item.sourceRow || '',
    item.transactionDate || '',
    item.orderId || '',
    item.customerId || '',
    item.email || '',
    item.customerName || '',
    item.typeProduct || '',
    Number(item.grossAmount || 0),
    Number(item.eligibleAmount || 0),
    item.detectedAt || new Date(),
    item.newStamps == null ? '' : item.newStamps,
    item.lifetimeAfter == null ? '' : item.lifetimeAfter,
    item.totalAfter == null ? '' : item.totalAfter,
    item.status || '',
    item.sentAt || '',
    Number(item.attempts || 0),
    item.error || ''
  ];
}

function rfTxAppendLogsBatch_(sheet, items) {
  if (!items || !items.length) return;

  const rows = items.map(rfTxLogRowArray_);
  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, RF_TX_LOG_HEADERS.length)
    .setValues(rows);
}

function rfTxAppendLog_(sheet, item) {
  rfTxAppendLogsBatch_(sheet, [item]);
}

function rfTxStartDate_() {
  return new Date(2026, 7, 1, 0, 0, 0, 0);
}

function rfTxParseRemitDate_(value) {
  if (value instanceof Date && !isNaN(value)) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  }

  const text = rfTxClean_(value);
  if (!text) return null;

  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 12, 0, 0, 0);
  }

  const parsed = new Date(text);
  return isNaN(parsed) ? null : parsed;
}

function rfTxParseFrameTimestamp_(value) {
  if (value instanceof Date && !isNaN(value)) return value;

  const text = rfTxClean_(value);
  if (!text) return null;

  const m = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[1]) - 1,
      Number(m[2]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0)
    );
  }

  const parsed = new Date(text);
  return isNaN(parsed) ? null : parsed;
}

function rfTxFramePaymentVerified_(statusInput) {
  const status = rfTxClean_(statusInput).toUpperCase();

  if (!status) return false;
  if (/REFUND|CANCEL/.test(status)) return false;
  if (/PENDING\s*VERIFICATION/.test(status)) return false;
  if (/RECEIVING\s*FILES/.test(status)) return false;
  if (/VERIFY/.test(status)) return false;

  // HOLD, READY TO PROCESS, PRINTED/CURING, ASSEMBLING, SHIPPED OUT,
  // COMPLETED, etc. are downstream of the initial payment-verification stage.
  return true;
}

function rfTxShippingFee_(notesInput) {
  const notes = String(notesInput || '');
  if (/free\s+shipping/i.test(notes)) return 0;

  const match = notes.match(
    /shipping\s*fee\s*:\s*(?:PHP|₱)?\s*([\d][\d,\s]*(?:\.\d+)?)/i
  );

  return match ? Math.max(0, rfTxAmount_(match[1])) : 0;
}

function rfTxAmount_(value) {
  const cleaned = String(value == null ? '' : value)
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\d.\-]/g, '');

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function rfTxMoney2_(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function rfTxPeso_(value) {
  const amount = rfTxMoney2_(value);
  try {
    return '₱' + amount.toLocaleString('en-PH', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2
    });
  } catch (err) {
    return '₱' + String(amount);
  }
}

function rfTxNormalizeEmail_(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .trim()
    .toLowerCase();
}

function rfTxValidEmail_(email) {
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(
    String(email || '').trim()
  );
}

function rfTxClean_(value) {
  return String(value == null ? '' : value).replace(/\r/g, '').trim();
}

function rfTxFirstName_(fullName) {
  const clean = rfTxClean_(fullName);
  if (!clean) return 'there';
  return clean.split(/\s+/)[0];
}

function rfTxOrderNumber_(orderId) {
  const match = String(orderId || '').toUpperCase().match(/^RF[-\s]?(\d+)$/);
  return match ? Number(match[1]) : -1;
}

function rfTxEligibleTrackingId_(orderId) {
  const id = rfTxClean_(orderId).toUpperCase();
  return RF_TX_MAILER.POS_ID_PATTERN.test(id) ||
    rfTxOrderNumber_(id) >= RF_TX_MAILER.TRACKING_START_ORDER_NUMBER;
}

function rfTxFindExactPosTrackingLink_(index, idInput, emailInput, typeInput, amountInput, used) {
  const id = rfTxClean_(idInput).toUpperCase();
  if (!RF_TX_MAILER.POS_ID_PATTERN.test(id) || (used && used[id])) {
    return { found: false, orderIds: [] };
  }
  const list = index[rfTxNormalizeEmail_(emailInput)] || [];
  const type = rfTxClean_(typeInput).toUpperCase();
  const amountCents = Math.round(Number(amountInput || 0) * 100);
  const matches = list.filter(function(candidate) {
    return candidate.orderId === id && candidate.orderType === type &&
      candidate.amountCents === amountCents;
  });
  return matches.length === 1
    ? { found: true, orderIds: [id] }
    : { found: false, orderIds: [] };
}

function rfTxParseOrderIdList_(value) {
  const text = rfTxClean_(value).toUpperCase();
  if (!text) return [];
  return text.split(',').map(function(id) { return id.trim(); })
    .filter(function(id) {
      return RF_TX_MAILER.POS_ID_PATTERN.test(id) || /^RF[-\s]?\d+$/.test(id);
    }).map(function(id) {
      const n = rfTxOrderNumber_(id);
      return n >= 0 ? 'RF' + n : id;
    });
}

function rfTxEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}