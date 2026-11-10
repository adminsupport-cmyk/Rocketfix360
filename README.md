# Rocketfix 360 staging Firebase POS

This build uses only local Firebase emulators for `demo-rocketfix-360`. The browser requires localhost, and every backend entry point refuses non-emulator/non-demo execution. It does not connect to the live Google Sheets POS, send real email or Viber messages, deploy, or import historical payments.

The original uploads remain unchanged in `reference/`. See [the source audit and parity gaps](docs/FEATURE_PARITY.md) and [validation status](docs/PROGRESS.md). This is a staging implementation; full legacy parity is not established.

## Local development

Requires Node 22, Java 21, and Firebase CLI. Cloud onboarding installs Node 22.23.4 and Firebase CLI 15.35.0 outside the checkout at `/workspace/rocketfix-toolchain`. Activate those tools:

```sh
export PATH=/workspace/rocketfix-toolchain/node_modules/.bin:$PATH
export npm_config_cache=/workspace/.npm-cache
cd /workspace/Rocketfix360
npm ci --ignore-scripts
npm ci --prefix functions --ignore-scripts
npm run audit:sources
npm test
npm run check
npm run build
npm run test:emulators
```

The Firebase CLI downloads its Firestore emulator from `storage.googleapis.com`. Keep TLS and the CLI's artifact checksum checks enabled. Emulator binaries are cached outside the checkout. CLI settings and generated logs use ignored `.runtime/` paths to preserve uploaded logs. No Firebase login is required. `tools/smoke-auth-hosting.cjs` can independently verify the Auth/Hosting subset under `firebase emulators:exec --only auth,hosting`.

For a CLI installed elsewhere, set `RF_FIREBASE_CLI` to its `firebase-tools/lib/bin/firebase.js` path. The npm command wrappers start the demo project explicitly.

```sh
npm run emulators
```

In another terminal seed local accounts (safe to repeat; existing memberships are preserved):

```sh
GCLOUD_PROJECT=demo-rocketfix-360 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tools/seed-emulator.cjs
```

Hosting uses port 5050; Auth 9099; Firestore 8080; Functions 5001, all bound to loopback. Sign in with `owner@rocketfix.local` and the local fixture password `Rocketfix-Emulator-Only-2026!`. Other fixture accounts use role names `admin`, `sales`, `encoder`, `editor`, `production` with the same emulator-only password. These are test identities, never production accounts.

Processes and data do not survive an emulator restart unless explicitly exported. Do not seed real customer data. In cloud tasks, use the existing isolated checkout; do not create a Git worktree unless requested.

## Supported staging workflows

- Authenticated active staff membership; owner-controlled membership updates for existing Auth emulator users. The role matrix remains provisional because the original employee permission dispatcher was not uploaded.
- Atomic order save with unique POS/service reservations, stable request ID replay, optimistic version checks, immutable financial revision and audit snapshots, and stable employee earning keys.
- Editing IDs, rush dates, assigned active editors, file URLs, linked frames, statuses; frame production statuses, mockup references and tracking numbers. Worker updates use versions and do not reprice payments.
- Per-frame freight, standard frame prices visible in the uploaded browser reference, configurable custom-product formulas and LBC rates. Frame quoting/saving is disabled by default pending the legacy audit. For synthetic tests only, enable **synthetic staging price fixtures** in Pricing settings; all frame orders are marked `UNVERIFIED_FIXTURE`. These are not approved rates. Use **Calculate server quote** before saving fixtures. Unconfigured rates require configuration or an explicit confirmed per-frame shipping quotation. No rates are guessed. Price tampering and stale calculated prices fail the server save.
- Discount, shipping, tips and Excess accounting matched against uploaded Apps Script allocation functions. Underpayments are rejected. Excess is separate from tips and sales. Operational roles receive allowlisted projections without financial fields.
- At-order letters at ₱200 with ₱50 commission; immutable paid commission recipient. Late letters use a separate atomic payment/commission/outbox record, reject shipped or closed frames, and replay without charging the original ledger again.
- Date-range sales and employee earnings reports. Sales excludes tips and Excess; framing includes freight and at-order letters; late-letter sales are reported separately. The dashboard uses the Manila payment date; normal order lists remain bounded recent views.
- Immutable email/Viber notification snapshots, transactional delivery claim and attempt log. Delivery is **SIMULATED**, never reported as actual provider delivery. Ambiguous outcomes remain REVIEW; only confirmed non-delivery permits an admin retry, with backoff and a three-attempt cap. Real SMTP/Viber adapters are wired behind a code-level OFF policy; no credentials are read and no external requests occur in normal operation. See [secure bindings and delivery semantics](docs/NOTIFICATIONS.md).

`npm run test:integration` requires already running demo emulators; `npm run test:emulators` starts an isolated suite and shuts it down afterward. The integration tests use only local fixtures and fail if local demo environment variables are absent.

`node tools/browser-smoke.cjs` checks compiled login/form rendering against an existing local server. It uses Chromium and Playwright installed by cloud setup; it does not substitute for authenticated integration tests.

## Remaining inputs

The user identified the missing legacy pricing, device-access, emailer, transaction-mailer and Viber files in the original archive; they await committing under `reference/legacy/` and an offline audit. Approved shipping rates still require an offline configuration export, and the complete Tracking backend remains unavailable. Loyalty/refund rules and historical exports also remain absent. The browser contains some formulas, but is not sufficient to prove parity with these missing server systems. Supply their offline source/configuration to complete the audit. Do not connect this build to the live POS to discover or infer rules.

## Legacy parity continuation

[Legacy intake and exact missing inputs](docs/LEGACY_MIGRATION.md) track FramePricing.gs, DeviceAccess.gs, POS_Emailer.gs, TransactionMailer.gs and ViberChannel.gs under `reference/legacy/`. `npm run audit:legacy` fails until those offline sources are present and reviewed. The original 17 tests remain unchanged. Production-intended saves are rejected and stored orders are server-marked staging / ineligible for production.

If the Firestore artifact is blocked, run `npm run validate:staging` for interim validation and follow [the verified-artifact alternative](docs/VALIDATION.md). The interim suite is not proof of Firestore rules or callable integration.
