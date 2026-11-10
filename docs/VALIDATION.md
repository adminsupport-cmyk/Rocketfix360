# Validation while the Firestore download is blocked

## Confirmed diagnosis

On 2026-11-10, fresh `curl --head` probes and Firebase CLI 15.35.0 both failed for:

```
https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar
```

The probe reports `CONNECT tunnel failed, response 403`, with proxy response headers (`server: envoy`). This happens before a TLS session to Google's artifact service. Managed status reports current observations and an enforced restricted runtime policy with no custom allowed hosts. The configuration draft already contains `storage.googleapis.com`, but it has not been applied to the running instance. This is an outbound policy blocker, not evidence of missing Firebase credentials, project billing or an application defect. The earlier default-cache filesystem problem is fixed by the supported `FIREBASE_EMULATORS_PATH` cache setting.

First option: review/save the existing domain addition in environment settings, refresh managed status, then make a fresh probe and run `npm run test:emulators`. Publication is separate and should follow validated setup. No new credential or duplicate domain requirement is necessary. An optional CLI MOTD request to firebase-public.firebaseio.com also fails; that warning does not prevent the Auth/Hosting subset and is not the Firestore blocker.

## Alternative A: a verified official artifact from a permitted machine

On a permitted development machine with Firebase CLI **15.35.0**, use its normal `firebase setup:emulators:firestore` download, or retrieve the exact official URL above with normal TLS verification. Transfer the resulting artifact through an approved file transfer into this workspace. Do not use arbitrary mirrors, disable certificate validation, override the emulator version, or edit checksum metadata.

In this environment:

```sh
export PATH=/workspace/rocketfix-toolchain/node_modules/.bin:$PATH
cd /workspace/Rocketfix360
node tools/cache-firestore-emulator.cjs /absolute/path/to/cloud-firestore-emulator-v1.22.0.jar
npm run test:emulators
```

The importer reads trusted installed Firebase CLI metadata, streams the artifact to a temporary cache file, verifies exact size, SHA-256 and MD5, then atomically installs it. A mismatch never replaces an existing cache entry. It does not accept caller-supplied expected checksums. For this pinned CLI, expected values are:

- Size: `136707194` bytes
- SHA-256: `9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c`
- MD5: `5d74cc6bee9e18560d2eae2c6440fd13`

The importer is tested with synthetic valid/tampered/truncated data; no official JAR is currently available to import. This procedure is prepared, not a claim that full integration tests have passed. If a different approved CLI is selected, `RF_FIREBASE_CLI` selects its metadata and `FIREBASE_EMULATORS_PATH` selects its cache; keep CLI version, artifact filename and trusted hashes consistent.

## Alternative B: executable interim validation

```sh
export PATH=/workspace/rocketfix-toolchain/node_modules/.bin:$PATH
cd /workspace/Rocketfix360
npm run validate:staging
npm run audit:legacy
```

`validate:staging` runs the source audit, syntax checks, all automated tests, compiled client build, and actual Auth + Hosting emulators. Its tests preserve the original 17 and add provider state-machine/credential-policy tests, real Nodemailer SMTP over a trusted local TLS fixture, Viber wire-contract tests over a trusted local HTTPS fixture, production pricing guards, legacy source auditing and artifact integrity checks. Local TLS tests require OpenSSL; Node 22 and Java 21 are available in this instance. Generated test certificates/keys are temporary and removed. No external recipient or Viber channel is contacted.

`audit:legacy` is expected to fail until the five originals are added and reviewed; do not suppress its exit code or describe a missing-file result as a pass. The regular source audit checks the migration scaffolding, not the absent legacy files.

**This interim procedure is not a replacement for Firestore validation.** Transaction tests use an explicitly labeled serialized in-memory double: they exercise application claim/state transitions, not real Firestore contention, retries, queries, indexes or security rules. Auth/Hosting smoke does not exercise authenticated callables. `npm run test:integration` still requires all demo emulators; its existing real-Firestore suite is retained and must execute before readiness can be claimed.

Run the browser rendering smoke only with a local server already running. Required authenticated browser order/notification workflows remain pending the full emulator suite. No production order, live Sheets read/write, deployment or external delivery is part of any validation command here.
