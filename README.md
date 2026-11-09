# Rocketfix 360 Firebase Admin POS

**Staging only. Not production ready.** This is an iterative replacement under development, grounded in the supplied original files and diagnostic/fix revisions. The current build runs exclusively in the local Firebase Emulator Suite with project ID `demo-rocketfix-360`. It refuses non-emulator Functions execution and non-local browser use. No production deployment or live Google Sheets access is authorized.

Start with [the feature-parity checklist](docs/FEATURE_PARITY.md), [source inventory](docs/source-inventory.json), and [progress/blockers](docs/PROGRESS.md). The original layout has not yet been ported: the current interface remains the starter layout. The original files are preserved without modification in `reference/`.

## Current staging implementation

- Firebase Authentication staff sign-in and server-controlled active membership. Roles are **provisional staging policy**, pending the missing original permission dispatcher.
- Cloud Functions v2 transactions commit validated order, unique service-ID reservations, immutable financial revision, audit snapshot, replay result, staff earnings, and new-order notification outbox together.
- A stable idempotency key returns the prior commit result for identical retries; changed content with the same key fails. Optimistic versions reject stale edits. Existing linked service IDs cannot be removed or changed; paid letter recipients cannot change.
- Calculations match original `posFinalizeQueuedV1618_` / `posServiceAmounts_` for tested fixtures. Per-frame freight contributes to allocation weights; Excess remains separate from tips/sales. Underpayments are rejected as in the supplied source.
- Personalized letters retain ₱200 price, ₱50 commission, supported colors/fonts, and message validation. Late-letter purchase/recovery is not yet ported.
- Operational roles receive allowlisted service projections with financial data omitted. Firestore client reads and writes are denied, including for owners; callables enforce roles.
- Firestore outbox events dispatch promptly after commit. **External email and Viber delivery are disabled and simulated.** Transactional claims deduplicate delivery; attempt logs record outcomes. Confirmed non-delivery can be retried by owner/admin with exponential backoff and a three-attempt cap. Uncertain delivery stays in REVIEW. Notification paths never modify payments or orders. A crash leaving SENDING requires review; it is never blindly replayed.
- Recent-order dashboard, local search, editing/frame queues, recent earnings report, and recent-record CSV export. These are bounded views, not complete historical reporting.
- Customer photo/proof links stay as references; no photo migration or Google Drive access occurs.
- Offline CSV preview and JSON reconciliation tooling. No historical records are imported and no historical notifications are generated.

## Local setup and tests

Requires Node 22 (the declared Functions runtime), Java 21, and Firebase CLI. Current emulator verification used host Node 24; exact Node 22 validation remains open.

```sh
npm ci --prefix functions --ignore-scripts
npm test
npm run audit:sources
npm run test:emulators
```

`test:emulators` isolates Firebase CLI settings from saved user login and uses an explicit demo project. If your Firebase CLI executable is unavailable, set `RF_FIREBASE_CLI` to the local `firebase-tools/lib/bin/firebase.js` path. No login is needed for emulator testing.

To use the app interactively:

```sh
npm run emulators
```

Then, in another terminal, seed local fixture accounts:

```sh
GCLOUD_PROJECT=demo-rocketfix-360 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tools/seed-emulator.cjs
```

Open `http://127.0.0.1:5050`. Local fixture login: `owner@rocketfix.local` / `Rocketfix-Emulator-Only-2026!`. Other fixture users use role names (`admin`, `sales`, `encoder`, `editor`, `production`) with the same local-only password. These accounts are created only in Auth Emulator; no production accounts exist.

Frame saves are disabled by default because server pricing/shipping source is missing. To exercise manual frame fixtures, seed with `--manual-frame-fixtures`. This sets `stagingConfig/businessRules.allowManualFrameQuotes=true` locally. All such orders are labeled staging placeholders, with loyalty blocked. No manual quote should be treated as an authoritative production price.

## Offline migration review

```sh
node tools/reconcile-export.cjs /absolute/path/offline-ledger.json
```

The JSON input is an array of exported ledger records. The report includes input checksum, duplicate/missing-link/allocation errors and per-date totals in integer centavos, with tips and Excess separate. It excludes deleted, voided and explicitly non-SYNCED records. It does not infer missing historical allocations, reprice records, import data or send notifications. A successful local report is **not** migration approval; reconciliation with REMIT, Tracking, frames, late add-ons, historical sales and staff earnings still requires their offline exports.

The existing CSV preview can also be run after installing `tools/` dependencies. Its structural checks alone do not prove financial reconciliation.

## Remaining release gates

Complete original-layout/workflow parity; restore missing authoritative rules and employee permissions; full historical reporting; isolated real provider/Drive integration; migration reconciliation on real offline exports; exact-runtime and dependency-security checks; IAM, backup/restore, App Check, and deployment-target review. Detailed checklist and evidence are maintained in `docs/`. **There is no production deployment procedure in this build.**
