# Rocketfix360 staging progress

Updated 2026-11-10 (Asia/Manila). `git pull --ff-only origin main` confirms main is current at `139f7eaa56ed3925c835247ad8e9d7ccb0557ed4`. Existing working changes were preserved. Nothing was pushed, deployed, sent to an external recipient/channel, or read/written in the live Google Sheets POS.

## Completed in this continuation

1. Preserved all original 17 passing tests without editing their files. SHA-256 remains `c453e05a03b4a93e53f99259d57d659878303e1bbd8bd60df4f12865c0429779` for `tests/core.test.js` and `4212aca9e9f68c629b02aaed479eff3c2522deb15124a81d90a4207ef3a8ce82` for `tests/workflows.test.js`.
2. Prepared `reference/legacy/manifest.json` and intake instructions for FramePricing.gs, DeviceAccess.gs, POS_Emailer.gs, TransactionMailer.gs and ViberChannel.gs, including original archive filename aliases. No fake `.gs` placeholders were created. `audit:legacy` checks missing/ambiguous sources, hashes and exact review provenance without executing Apps Script.
3. Documented all pricing/shipping inputs observable from current sources: 21 custom product fields, four unapproved standard price examples, 12 shipping fee/day pairs, editing tariffs/override authority, tip validation data, shipping exceptions and version/effectivity rules. [LEGACY_MIGRATION.md](LEGACY_MIGRATION.md) separates present Tracking helpers from absent backend contracts and unknown function names.
4. Implemented real SMTP and Viber adapters, wired behind an explicit code-level **OFF** policy. Firebase secret parameters name credentials without embedding values. Disabled runtime does not read secrets or open provider connections. Test destination allowlists are empty. Actual provider accounts/channel identity and legacy templates are not yet verified.
5. Strengthened notification processing: transactional claim plus deterministic attempt log before the provider call, stable email Message-ID, preserved Viber acceptance token, safe error codes instead of raw credential-bearing errors, provider Retry-After/backoff, three-attempt cap, and REVIEW for uncertain results or post-acceptance log failures. Crashed SENDING claims are not automatically reclaimed. This is not a claim of provider-side exactly-once delivery.
6. Strengthened production exclusion: every callable remains demo-emulator-only; order saves reject a requested production environment or eligibility approval, ignore client claims of verified frame pricing, and persist server-owned `environment: staging` / `productionEligible: false`. Frame saves remain disabled by default; explicit synthetic fixture mode always stores UNVERIFIED_FIXTURE.
7. Diagnosed the emulator download denial and added a checksum-verified artifact importer plus an executable partial validation command. See [VALIDATION.md](VALIDATION.md) and [NOTIFICATIONS.md](NOTIFICATIONS.md).

Refreshed `start_skill` instructions were saved in the environment configuration draft with the legacy intake, disabled sending policy, and alternative validation procedure. This save does not apply the pending network rule or publish the environment; review/save settings and publish only after required setup validation.

## Current validation results

| Check | Outcome |
| --- | --- |
| Original 17 tests | PASS, unchanged |
| Expanded `npm test` | PASS: 32 tests, 0 failures, 0 skipped |
| Local SMTP wire test | PASS: real Nodemailer authentication and message acceptance over a trusted local TLS server; no external mail |
| Local Viber wire test | PASS: expected channel payload over a trusted local HTTPS fixture; no external channel post |
| Provider/state-machine tests | PASS: OFF policy before secret lookup, TLS options, stable identity, 64-bit tokens, rejection vs uncertainty, single claim, durable pre-send log, credential redaction, crash/write-failure handling and retry cap/backoff |
| Migration/integrity tests | PASS: missing/reviewed/changed/ambiguous sources, production guards, valid/tampered/truncated artifact behavior |
| `npm run audit:sources` | PASS: 46 required scaffold/application files; does not claim legacy source completeness |
| `npm run audit:legacy` | BLOCKED as expected, exit 1: all five originals are still missing |
| `npm run check`, `npm run build` | PASS |
| `npm run validate:staging` | PASS: source/syntax/tests/build plus real Auth + Hosting smoke |
| Auth + Hosting subset | PASS: local fixture signup, successful sign-in, bad-password rejection, Hosting HTML and compiled client |
| Backend module discovery | PASS: 18 staging exports load with external sending false |
| Frozen Functions install | PASS with updated lockfile and Nodemailer 10.4.0 |
| Original references/uploaded logs | Unchanged; Git whitespace checks pass |
| Full `npm run test:emulators` | BLOCKED before integration tests execute: Firestore artifact download denied |
| Real SMTP/Viber accounts | NOT RUN; actual sending disabled and no matching credential bindings configured |
| Authenticated Firestore/callable browser flows | NOT RUN; requires the full emulator suite |

Node 22.23.4, Java 21, OpenSSL 3.5.7 and Firebase CLI 15.35.0 are available. New provider TLS keys/certificates are generated temporarily for loopback tests and removed afterward. Existing Chromium rendering smoke evidence is retained from the previous continuation; it does not establish authenticated backend behavior.

## Firebase HTTP 403 investigation and alternatives

A fresh probe returns `CONNECT tunnel failed, response 403` with proxy headers for the official `storage.googleapis.com` artifact URL. Runtime status reports current observations and an enforced restricted policy with no custom hosts. The saved draft contains the required domain but is not applied to this instance. This denial occurs before Google's TLS service; it is not evidence that a Firebase token, billing change, checksum bypass or different application code is needed. The supported writable emulator cache is already configured.

- Apply the existing saved `storage.googleapis.com` setting, verify with a fresh connection, then rerun the full suite. Publication is a separate later action after setup validation.
- Or transfer the official CLI-matched artifact from a permitted machine and run `node tools/cache-firestore-emulator.cjs /absolute/path/to/artifact.jar`. The tool verifies exact size, SHA-256 and MD5 from the installed CLI before atomic caching. No official artifact has yet been supplied; only importer integrity behavior is tested.
- Meanwhile `npm run validate:staging` is a tested interim procedure. Its in-memory transaction double verifies application state transitions, not Firestore transaction retries, security rules, indexes or query semantics. No full integration pass is claimed.

## Remaining parity blockers

- The five named legacy originals are still absent from `reference/legacy/`. Source audit/porting must wait for their offline addition.
- Approved product configuration and all 12 shipping fee/day pairs require a sanitized offline configuration export. Browser examples/defaults and fixture inputs are not approved rates.
- The complete Tracking backend remains unavailable. Observed REMIT/Tracking, rush propagation, assignment, files, deletion/recovery, linkage and history contracts are documented; unknown function names/rules have not been invented.
- Original permission dispatcher, customer/transaction templates, channel bridge and test-channel credential scope require audit. Current role policy and receipt/report text remain provisional.
- No real provider testing is authorized yet. No new credential values were requested or persisted; enablement requires explicit future authorization, verified test destinations and secure bindings. No production work is authorized.

The environment is prepared for the interim staging checks, **not ready for the full Firestore workflow or production parity**. Next actions are to apply the pending network setting (or provide the verified artifact), add the offline legacy sources/configuration, run the retained integration suite, and port only rules supported by the audited originals.
