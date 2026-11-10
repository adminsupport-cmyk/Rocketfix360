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
