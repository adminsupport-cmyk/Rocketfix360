# Rocketfix 360 — Firestore POS (separate staging application)

This is a **new independent Firebase-based Rocketfix POS starter implementation**, built from the supplied November 9, 2026 Rocketfix Admin POS `Code.gs` and the saved `Index.html`. It **does not access or change** the live Google Sheets POS. It is a serious working codebase, not a deployment or migration of existing live data. It has **not yet been deployed or tested with real Firebase, SMTP or Viber credentials**.

## What is included

- Staff Firebase Auth login and server-side active roles (`owner`, `admin`, `sales`, `encoder`, `editor`, `production`).
- New multi-service POS order: editing and frames in one eight-digit POS ID, server validation of editing `RF12345A` and frame `AB1C2` identifiers, duplicate order-key reservation, immutable order linkage.
- Payment date, amount received, customer details, notes, discount, tips, tip recipients, overpayment `Excess`, payment proof link, audit log.
- Frame receiver name, contact, shipping method, shipping fee, address and notes; frame production statuses.
- Personalized Letter add-on ₱200 with ₱50 recipient commission (based on the source), employee earnings mirror keyed to avoid duplicates.
- Editing statuses and rush target, linked frame IDs, Google Drive file URLs and assigned editor UID.
- Server-side atomic order commit through a callable Cloud Function, one primary Firestore database, real-time worker not required; no `PROCESSING` wait before committed record.
- New-order email + Viber Channel outbox docs written in the same transaction; `onDocumentCreated` immediately attempts delivery separately.
- Recent sales dashboard, order history, search, CSV export, email/Viber delivery status inspector, owner/admin void safeguard.
- Strict Firestore rules: no direct browser reads or writes, backend enforces roles.

## Important limitations / parity gaps BEFORE LIVE USE

This is **not a pixel-perfect, fully verified port** of the 1,400+ lines of original Apps Script, the 260 KB original browser interface, and separate external scripts. Some dependencies are missing from the original upload and are not safe to invent:

1. Exact frame design/product pricing, custom canvas sizing and shipping quote formulas (`rfFrameCfgRead_`, `rfFrameProductQuote_`, `rfFrameShippingQuote_`) are external to uploaded `Code.gs`. This Firebase version requires the sales admin to enter **approved item prices and shipping fee**, checked by a user until the actual pricing data is migrated. Do not rely on remembered sample SRPs.
2. The legacy order status/encoder/Tracking portal, refunds/returns, external loyalty calculations, actual direct customer-photo upload, shipping label creation, customer file access permissions, historical imports, Viber Channel webhook and full email templates are **not yet integrated**. Google Drive is used by URL reference only.
3. Admin editing currently updates the full financial order. Configure proper staff access and review the payment edit/void policy before production deployment.
4. New orders receive an email and Viber request only **after** Firestore commit. Delivery is async and may take seconds or longer. `SENT` means provider accepted it; not guaranteed inbox/channel read. A network timeout is marked `REVIEW` to avoid duplicate sending. Email and Viber use different notification events.
5. This version keeps only recent 150 records in the browser and dashboard calculates totals from recent 1,000 records. Production historical dashboard needs precomputed aggregates/pagination.
6. Firestore is the sole live data source **for this new app**. No legacy Google Sheets synchronization or Viber replay is provided, intentionally preventing live-double-entry during staging.
7. Full role-based and payment/notification integration tests with the Firebase Emulator Suite remain mandatory. The pure accounting tests are included.

## One-time deployment procedure (Blaze plan)

Prerequisites: Firebase project (a **new staging project** recommended), Blaze billing, Node 22, Firebase CLI (`npm install -g firebase-tools`), owner Firebase login. No source code contains private credentials.

1. In Firebase Console enable **Authentication → Email/Password** and **Cloud Firestore** (Standard edition). Create a new Web App under Project settings; paste its public `firebaseConfig` values into `public/config.js`. Keep this staging project separate from the existing Firebase marketing project unless reviewed.
2. In terminal inside this directory, sign in and select the new staging project:

   ```sh
   firebase login
   firebase use --add
   cd functions && npm install && cd ..
   ```

3. Create your first staff user in Firebase Console → Authentication → Users. Copy the **UID**. In Firestore, manually create document `staff/<UID>` with fields `name` (string), `role` (string) = `owner`, `active` (boolean) = `true`. **Never enable client writes to staff records.** Create individual accounts for each employee and corresponding active staff documents.
4. **Before deploying Functions**, set secrets in the Firebase CLI, in the same project. The notification function declares these secrets at deploy time (configure even for testing; use test credentials where appropriate):

   ```sh
   firebase functions:secrets:set RF_SMTP_HOST
   firebase functions:secrets:set RF_SMTP_PORT
   firebase functions:secrets:set RF_SMTP_USER
   firebase functions:secrets:set RF_SMTP_PASS
   firebase functions:secrets:set RF_SMTP_FROM
   firebase functions:secrets:set RF_VIBER_CHANNEL_TOKEN
   firebase functions:secrets:set RF_VIBER_CHANNEL_SENDER_ID
   firebase deploy --only firestore,functions,hosting
   ```

   SMTP provider must permit authenticated sending and authorize `RF_SMTP_FROM`. The Viber settings must be for your **existing Rocketfix Viber Channel**, with a sender ID allowed to post there. Never paste tokens into browser code, Firestore rules, screenshots or support chats.
5. Use the new Firebase Hosting URL only for **staging**. Log in as owner; verify test editing-only, frame-only, mixed-service, commission and overpayment orders. Confirm Firebase order, earnings, audit and notification outbox all agree; verify both deliveries on a TEST channel/email. Test concurrency/duplicate POS ID and bad-password access.
6. After testing, perform a controlled, reconciled migration from the existing Google Sheets POS. **Do not manually submit paid historic orders in the new system or send old-order notifications**. The included `tools/preview-legacy.js` only previews an exported `POS Ledger` CSV and NEVER imports or changes records.
7. When a deliberate go-live date is chosen, freeze new edits in the old POS, reconcile final ledgers, switch staff to the new system, and retain the old Sheets read-only as an archive. Do not run both as live sources of truth without a designed migration bridge.

## SMTP and Viber status behavior

At successful new-order transaction commit, `notificationOutbox/<POS>_CUSTOMER` (if valid email) and `notificationOutbox/<POS>_VIBER` are created with `QUEUED`. Firestore events independently transition these to `SENDING` then `SENT`, `NOT_CONFIGURED`, or `REVIEW`. They are **not automatically retried**, because a timeout after a provider accepts a message can otherwise duplicate notifications. The POS UI can inspect these statuses by POS ID.

## Commands for safe local code checks

```sh
node --test tests/core.test.js
node --check functions/index.js
node --check public/app.js
```

## Pricing and financial accounting notes

The calculation follows the provided Rocketfix scheme for prepaid (fully paid) orders:
`subtotal = editing + framing + (₱200 × paid letters)`; `due = subtotal - discount + tip + shippingFee`; `excess = max(0, received - due)`. The **excess is not a tip**. Editing/framing allocations exclude tip and excess, while frame allocation includes frame shipping fee. This version **rejects underpayments**; partial payments require a separately designed payment-ledger workflow.

The source Rocketfix POS has strict frame order statuses and a non-trivial external product/shipping rate system; the new app's price inputs are intentionally not treated as an authoritative automated calculator.

## Security note

The original uploaded Apps Script included a temporary `posRequireAuth_()` bypass; this Firebase code does **not** preserve that bypass. Every financial callable checks authenticated Firebase staff membership. Firestore client rules deny all direct reads/writes. For production, enable and test Firebase App Check, account MFA for admin roles, alerts/budgets, backups and least-privilege IAM. Manual staff provisioning is intentionally private to the Firebase Console.
