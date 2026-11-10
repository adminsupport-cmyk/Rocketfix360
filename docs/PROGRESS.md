# Modern dark workspace and integration preparation — November 10, 2026

Backup: `backup/firebase-auth-verified-ffc1324` (verified Firebase-only login). Working branch: `feature/modern-admin-pos-integrations`. Original reference sources preserved; no main merge.

Implemented modern dark Dashboard, Admin POS, Editing Database, Frame Database, Remittances and restricted Settings. All original POS fields remain. Databases support search/filter/sort/pagination and structured, version-checked record edits with immutable revisions/audits. Assignment, Drive URLs, receiver/shipping, production/editing status and tracking edits preserve money and existing payment identities. Financial corrections use the original POS form and existing server protections. Dashboard displays actual Firebase data and refreshes while visible. Direct Firebase commit confirmation replaces the Sheets waiting-list screen; an interrupted response is reconciled by request identity without resubmitting a payment.

Sheets mirror events commit atomically with order versions. The server-only adapter reserves stable destination rows, checks identity/header fingerprints/protected cells/formulas/runtime identity, writes RAW values, verifies row keys, and logs outcomes. Confirmed non-writes permit capped, delayed Owner/Admin retries; uncertain results require reconciliation. Current policy blocks all external writes. New/edited orders never recreate notifications to retry Sheets. Viber uses existing Secret Manager/provider/outbox infrastructure, with per-service summaries; real delivery remains disabled. Both workers are private; callable-only Invoker configuration is maintained. The deployment script explicitly targets known functions and handles only the CLI's exact IAM-creation failure via the approved service-level Invoker setting.

Validation: **52 unit tests; 21 complete emulator test records; Firebase authentication browser suite; original editing/framing/combined remittance browser suite; modern database edits/concurrency/permissions and desktop+iPad browser suite all pass.** Screenshots: [dashboard](modern/screenshots/dashboard-desktop.png), [iPad POS](modern/screenshots/pos-ipad.png), [editing database](modern/screenshots/editing-ipad.png). Real test writes to Google Sheets and real Viber channel delivery have NOT passed or been attempted.

External setup blockers: neither requested test workbook was found; IDs remain null. No sanitized test copies were created or claimed. The verified staging runtime identity is `855901392227-compute@developer.gserviceaccount.com`; Editor access cannot be verified until test workbook IDs are supplied. Read-only source metadata/header checks are recorded in `staging/mirror-schema-review.json`; no original workbook was modified. Source schemas have unresolved Tracking/commission-header differences. Staging-only config skeleton: `staging/sheets-mirror.example.json`; actual observed status: `staging/mirror-status.json`. Only sanitized test copies may be shared with that account; production destinations are not authorized. Real Viber credentials/destination and end-to-end channel tests remain unverified. Existing approval restrictions on real financial writes/unverified frame pricing remain in force; sample creation is emulator-only. This remains staging, not a production-ready replacement. Larger historical-load/performance validation remains outstanding.

---

# Prevent stale login bundles — November 10, 2026

User reported a bindWorkflows null-element startup error. Read-only live inspection found no bindWorkflows in current deployed HTML/JS; both files were served with max-age=3600. Versioned the client script URL from source fingerprints and configured staging Hosting assets as no-store to prevent stale HTML/JavaScript pairings. All 42 tests and checks/build pass. Live browser validation loaded the versioned bundle despite an injected obsolete unversioned response, observed no startup errors, and verified editable login fields. No credentials submitted to staging; no backend changes.

---

# Firebase-only authentication — November 10, 2026

Removed the migrated device gate, device-token arguments, old login/session helpers, approval/loading controls and Google Apps Script-shaped runtime transport. The standalone Firebase email/password form is controlled solely by Firebase Auth. Its auth-state observer calls the existing backend myAccess check against active staff membership before starting POS business data loads. Missing, inactive or invalid-role membership shows Access denied. A retry for the same Firebase account rechecks current staff membership. The original POS business layout and financial protections remain intact.

Checks/build and 42 unit tests pass; all 19 emulator integration records pass. Browser tests pass for signed-out startup, Owner/Sales sign-in/sign-out, missing/inactive/invalid-role denial, newly activated membership retry, and original editing/framing/combined sample workflows and desktop/iPad layouts. Staging Hosting only; no backend, production, Google Sheets or notification-provider changes.

---

# Login startup unblocked — November 10, 2026

Login fields now appear immediately without waiting for Firebase initialization or showing a startup spinner. Signing in keeps the form available, and errors do not trap the employee behind a loading screen. Checks/build and 42 tests pass. A browser regression deliberately blocked the Firebase bundle and verified that both account fields remained editable. Authentication and role validation remain required. Staging Hosting only.

---

# Fresh dark login — November 10, 2026

Replaced the session-style gate with a fresh dark login card, Rocketfix green accents, employee email/password fields, and keyboard form submission. Removed session/PIN wording from the visible login. Firebase Authentication, employee role checks, and all financial/sending restrictions remain unchanged. Checks/build and all 42 unit tests pass. Browser checks at desktop 1440×1000 and mobile 390×844 pass, including authorized local Owner sign-in using Enter. Hosting-only staging update; no Functions, production or Sheets changes.

---

# Original Admin POS parity rebuild — November 10, 2026

Branch: `feature/original-admin-pos-parity`, based on `staging/firebase-pos-fast-track` (`7e554b7`). Main and recovery references preserved. Original HTML/CSS now forms the Firebase interface; original reference files unchanged. Source mapping, immutable hashes and local dependency candidates are in [parity/SOURCE-MAP.md](parity/SOURCE-MAP.md).

Actual validation: **42 unit tests and 19 complete emulator test records pass**; syntax/build/source-presence checks pass. Browser tests pass for Owner login, editing/frame/combined sample receipts, versioned edits, a deliberately lost payment response without resubmission, receipt modal, history and daily sales. Original CSS and controls preserved; desktop and both iPad orientations match form geometry. Six [screenshot comparisons](parity/screenshots/desktop-comparison.png) are saved. This does not establish complete pixel or business-rule parity.

Staging deployment targets only `rocketfix-360-staging` / existing `rocketfix360database`. Financial writes and customer quotations are server-blocked outside the isolated local demo pending parity approval. No real financial transactions were made. External sending remains OFF; outbox private; original production Firebase and Google Sheets untouched. Exact payment-request receipts prevent an old order version from falsely confirming an interrupted edit. Full [validation and blockers](parity/VALIDATION.md), [deployed asset/authentication checks](parity/DEPLOYED-CHECKS.json), and [invoker privacy audit](parity/INVOKER-CHECKS.json).

Remaining: approved current pricing/configuration and manual override policy; reconciled historical/customer/loyalty exports and Firebase port; authorized staging Drive uploads; complete source-version/permissions/status parity; short legacy IDs and operational queue UI; remaining report/modal visual comparisons and deployed Owner acceptance. Newly found local scripts are preserved as candidates, not described as missing or approved. **Not production-ready; full parity incomplete.**

---

# Invoker policy resolved — November 10, 2026

Configured all 17 deployed HTTPS callable services in `rocketfix-360-staging` with Google's documented `run.googleapis.com/invoker-iam-disabled: true` setting (equivalent to `gcloud run services update --no-invoker-iam-check`). The managed requireInvokerIam constraint is not enforced; the legacy constraint was not found. Domain Restricted Sharing is unchanged. No allUsers IAM grants or organization-policy changes were made. The v1 annotation update avoids a managed-function revision-name conflict observed with the v2 field patch.

Actual live checks: **17/17 staging OPTIONS responses return 204 with the exact staging origin; 17/17 unauthenticated POSTs return 401 UNAUTHENTICATED.** `deliverOutbox` retains its Invoker IAM check, has no public Invoker bindings, targets `rocketfix360database`, and rejects unauthenticated invocation with 403. Real notifications remain disabled. Existing Firebase Auth, role, pricing, transaction and rules code was not changed. Unit tests 36/36 and emulator test records 18/18 pass; syntax/build pass.

The deployment post-step now audits the effective policy and deployed callable inventory, applies only the supported service annotation, and verifies outbox privacy. It preserves service specs and IAM bindings. Production projects and GitHub main were untouched. Owner UI verification remains unconfirmed: the browsers available to automation still show sign-in despite the user's separate session confirmation; no Owner login success or dashboard/report UI pass is claimed. See [LIVE_STAGING_CHECKS.json](LIVE_STAGING_CHECKS.json) for actual deployed results.

---

# Named database and callable CORS deployment — November 10, 2026

Deployed code/rules/indexes/Hosting only to `rocketfix-360-staging`, using existing `rocketfix360database`; no database was created. All backend reads, writes, Owner staff membership and deliverOutbox trigger explicitly target that database. HTTPS wrappers and standalone myAccess now declare public invocation with staging-origin CORS; Firebase Auth, roles, pricing, transaction replay and deny-all client rules remain intact. Disabled notifications no longer declare unused provider secrets. deliverOutbox remains private and real sending stays off.

Tests: 34 unit tests and 18 emulator test records pass, including all-callable staging OPTIONS and unauthenticated rejection; syntax/build pass. Deployed metadata, named rules, active Owner staff profile and hosting configuration were verified. Live preflights succeed (204 with exact staging origin) for myAccess/listStaff; the other 15 callables, including dashboard/listOrders/salesReport, remain blocked by Cloud Run 403 before the handler. A staging-only additive public Invoker update was attempted, preserving existing bindings and excluding deliverOutbox; Google rejected the first grant. No policy/IAM-check bypass was attempted.

**Exact blocker:** effective `constraints/iam.allowedPolicyMemberDomains` permits only customer `C02wcq3s1`. IAM rejects allUsers with `400 FAILED_PRECONDITION: One or more users named in the policy do not belong to a permitted customer, perhaps due to an organization policy.` Organization-admin authorization/policy change is required before the requested public Invoker bindings can be applied. Code deployment succeeded; overall deployment command correctly exits failure for the incomplete IAM step. Owner dashboard and report browser verification remain blocked. See [LIVE_STAGING_CHECKS.json](LIVE_STAGING_CHECKS.json) for actual results for all 17 callables.

After an organization admin permits the requested public callable access for this project, rerun `node tools/callable-invokers.cjs --project rocketfix-360-staging --apply`, then repeat live preflight/Owner browser validation. This is not permission to bypass organization policy, disable IAM checks, change credentials/roles or make deliverOutbox public. Main, `rocketfix-360` and live Sheets were untouched.

---

## Confirmed staging connection — November 10, 2026

Created ignored `staging/project.json` from the supplied web configuration for `rocketfix-360-staging`. Prepared `.runtime/deploy` with matching browser config and backend allowlist; verified `rocketfix-360` is rejected and real sending remains disabled. Unit tests 34/34, emulator suite 16/16, syntax and build pass. Fixed esbuild staging artifact generation to use its asynchronous plugin API; added `--prepare-only` for offline deployment review. No remote Firebase deployment occurred: the staging-only app-access check reports expired Firebase CLI credentials. Reauthenticate, then run `npm run deploy:staging -- --config staging/project.json --confirm-project rocketfix-360-staging`. No production project or Sheets data was modified.

# Fast-track staging — November 10, 2026

Branch: `staging/firebase-pos-fast-track`, based on preserved `recovery/rocketfix360-32-transcript`. Fixed Firestore FieldValue imports and preservation of editor file/assignment workflow data during financial edits; initial notifications remain deduplicated. Fixed hidden role-navigation CSS. Added guarded separate-project deployment artifacts/script and portable emulator launch helpers.

Validation: 34/34 unit tests, 16/16 emulator test records, syntax and build pass. Actual browser employee login (owner/editor/production), editing/framing/combined remittances, history, sales/earnings, queues and simulated notifications pass. Frame-only integration covers discount, tip, Excess and letter commission. No existing test expectations were weakened. No confirmed separate staging project configuration exists; no remote Firebase deployment occurred. Local browser: http://127.0.0.1:5050. Quick start and final deployment command: [staging/README.md](../staging/README.md). Real sending remains disabled; frame prices are synthetic fixtures only. Production parity/approved pricing/migration remain open. Main and recovery branch preserved; no live Sheets access.

---

# GitHub verification — November 10, 2026 (Asia/Manila)

**The original development branch is not pushed:** GitHub did not advertise `development/rocketfix360-integration-prep`, and an exact fetch of `19f76b212f5539b02214f78d5e74d56a0d5ae8d1` returned `upload-pack: not our ref`. It must not be described as present on GitHub.

**The recovered source is now backed up:** approved commit `ae1183397eae72e4fe7920bc0a554f7d37d38620` was pushed to `recovery/rocketfix360-32-transcript`. A fresh independent GitHub clone returned that exact commit and tree `ff21e35a0a5fd0b2086982b3db6eb30623a01f47`, including all six recovered unit-test files, the emulator integration suite, provider/workflow code, and legacy audit/tooling. Its fresh unit run passed **32/32**, with no failures or skipped tests. Dependencies were reused from the isolated recovery installation; no application source was changed. See GITHUB_VERIFICATION.json for the tracked-file list and evidence.

The historical 32-test changes were uncommitted in **Set up Rocketfix360**; no original 32-test Git commit was found. The recovered source remains a documented reconstruction. The unchanged original 17 test files match their historical SHA-256 values. Original lockfile bytes/uncommitted Git metadata remain unrecovered. The exact `19f76b2` commit and original verified bundle are evidenced in **Edit Rocketfix360**, but remain cloud-only and directly inaccessible from this host; no cloud messages or destructive recovery actions were performed.

The earlier full emulator result remains **12 passing / 2 failing leaf tests**, plus a failed parent (Node summary 12 pass / 3 fail). That suite was not rerun because source/tests did not change. No production-ready claim is made. Main remains at the expected `139f7ea`; no merge, deployment, live Sheets access or external notifications occurred.

A documentation-only follow-up records this successful backup and verification. Historical authentication-blocker notes below are superseded; authentication now works.

---

# Rocketfix360 source recovery — November 10, 2026 (Asia/Manila)

**Feature development paused. STAGING ONLY; NOT PRODUCTION READY.** This branch recovers a previously uncommitted implementation from retained Codex command/file-change history. No Firebase deployment, live Sheets access or real email/Viber delivery occurred. Sending remains hard-disabled in the frozen code policy.

## Recovered source and comparison

- GitHub initially exposes only `main` at `139f7eaa56ed3925c835247ad8e9d7ccb0557ed4`, with its earlier `215c4ef` ancestor. No other remote branches or unreachable objects were found in the isolated clone.
- The separate cloud chat **Edit Rocketfix360** recorded original commit `19f76b212f5539b02214f78d5e74d56a0d5ae8d1` on `development/rocketfix360-integration-prep`, and a successful verification of `/workspace/rocketfix360-development.bundle`. That cloud branch/bundle have not been accessed or changed by this local recovery. Their current bytes could not be independently verified from this host.
- The local desktop project had no `.git` directory. Its separate 20-test implementation remains untouched; it is not the cloud 32-test implementation.
- The 32-test run was located in **Set up Rocketfix360**, turn `01a1c2d9-bfe0-7526-b765-96b721d1397b`. Source was reconstructed in chronological order from retained file additions and file-writing edits; no historical shell, deployment, network or notification commands were replayed.
- Recovery branch: `recovery/rocketfix360-32-transcript`. The recorded six-file change set for `19f76b2` was separately reconstructed as `recovery/reference-19f76b2-transcript` at `c7f2595`; this is a comparison reference, **not the original commit object**. Its 10 tests pass. Original cloud refs remain unmodified.
- `docs/RECOVERY_COMPARISON.json` lists added/removed/changed paths and file checksums relative to the reconstructed reference. Original dependency lockfile bytes and original uncommitted Git metadata were not retained; locks were regenerated using the recorded direct versions (Firebase client 11.10.0, esbuild 0.25.12, Nodemailer 10.4.0). Some synthetic fixture passwords were redacted in the transcript; those literal placeholders are retained and are not real credentials.

## What 19f76b2 lacked

The recorded 19f76b2 checkout contained 8 original accounting tests and 2 environment-flag notification-policy tests (10 total). The recovered implementation contains the unchanged 8 accounting tests plus 9 workflow tests and 15 provider/notification/migration tests (32 total). The two old flag-policy tests are superseded by the recovered hard-OFF policy tests; they are not counted among the 32.

Recovered components include `functions/workflows.js`, `runtime.js`, `notifications.js`, `provider-adapters.js`; transactional delivery claims/attempt logging and safe failure handling; fixed-OFF provider policy; late-letter, pricing-fixture, staff, queue and report workflows; compiled-client tooling; actual Auth/Firestore/Functions/Hosting tests; local TLS SMTP/HTTPS wire tests; legacy intake audit and checksum-verified emulator importer. The original 19f76b2 INTEGRATIONS document remains in the comparison reference; recovered NOTIFICATIONS/LEGACY_MIGRATION/VALIDATION documents contain the expanded contracts.

The two original test-file SHA-256 values exactly match the recorded 17-test run:

- `tests/core.test.js`: `c453e05a03b4a93e53f99259d57d659878303e1bbd8bd60df4f12865c0429779`
- `tests/workflows.test.js`: `4212aca9e9f68c629b02aaed479eff3c2522deb15124a81d90a4207ef3a8ce82`

## Fresh validation of recovered source

| Check | Actual result |
|---|---|
| `npm test` | **32 passed, 0 failed, 0 skipped**; includes only local SMTP/HTTPS fixtures |
| `npm run audit:sources` | PASS, 46/46 scaffold/application files |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| `npm run test:auth-hosting` | PASS: local signup/sign-in/password rejection and compiled Hosting app |
| Full `npm run test:emulators` | **FAIL**: 12 passed / 3 failed as counted by Node, including the failed parent; 12 of 14 leaf subtests pass |
| `npm run audit:legacy` | EXPECTED BLOCKER, exit 1: all five authoritative legacy files absent |
| Browser visual/authenticated end-to-end QA | Not rerun in this recovery |

Full-suite failures: `editor workflow, stale versions and cross-role status protection` throws `Cannot read properties of undefined (reading 'increment')` in the recovered status-update implementation. `financial edits preserve workflow state; updates do not generate another notice` then sees `Not started` rather than the expected `On going`. The parent scenario also fails. The recovery task does not fix these application defects or hide failed checks.

Validation used host Node 24.18.0, Java 21 and cached Firebase CLI 15.27.0 with the same Firestore emulator 1.22.0 metadata/hash. The historical environment used Node 22 / CLI 15.35.0. Exact historical runtime validation remains open. The local cache allowed a genuine full Firestore run; the historical cloud download-policy blocker is not this run's failure.

## Preservation and remote status

A new recovery commit and separately named Git bundle will preserve this reconstruction; original cloud development branch and original verified bundle remain untouched. GitHub read access is confirmed. Write access, push and independent remote verification are recorded in `docs/RECOVERY_REMOTE.md` after attempts. No merge or push to main is authorized.

Pushing the **original** development branch remains dependent on access to the cloud checkout/bundle. The local recovery branch must not be misrepresented as `19f76b2` or as that existing development branch. Messaging the cloud chat requires explicit user authorization, which was requested separately.

## Outstanding blockers

- Original 19f76b2 commit object and original verified bundle are cloud-only; preserve and verify them there before pushing that exact development branch.
- Original recovered lockfiles/uncommitted metadata unavailable; generated locks are not byte-for-byte recovery.
- Two failing emulator leaf tests; exact historical runtime and full authenticated browser QA remain unverified.
- Five legacy sources, approved offline pricing/shipping values, Tracking/loyalty and permission rules remain missing. No invented business rules are approved.
- Production parity, migration reconciliation and security/deployment checks remain open. No production-readiness claim is made.

## Approved backup attempt — authentication blocked

The user approved the recovered-branch GitHub backup. An HTTPS dry-run push failed because local Git has no usable GitHub credentials (`could not read Username`). Strict SSH fallback also failed due to absent trusted host-key configuration; no trust bypass or credential changes were made. The installed GitHub connector exposes no repository-write tool in this session. **No push occurred; remote contents cannot yet be verified.** Authentication for Git on this Mac is required before retrying. The earlier automatic-review authorization issue for this recovery branch is resolved. See RECOVERY_REMOTE.md for exact attempt results. No tests or application files changed in this follow-up.
