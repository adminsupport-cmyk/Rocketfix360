# Staging email and Viber adapters

Actual external sending is **disabled** in `functions/notification-policy.js`. The policy is frozen, version-controlled, has no permitted test recipients/senders, and cannot be enabled by an environment variable, order field or callable. Runtime delivery returns SIMULATED before reading credentials or constructing a provider connection. The backend also refuses execution outside demo emulators.

The real transport implementations exist in `functions/provider-adapters.js` and are wired into both the Firestore outbox trigger and authorized retry handler. They are tested with local doubles and actual local TLS SMTP/HTTPS servers. **No real email service or Viber channel has been contacted.** Full legacy template/eligibility/channel parity remains pending the five offline legacy files.

## Credentials

Firebase Functions secret parameters declare these names only; no values are in source:

| Binding | Use |
| --- | --- |
| `RF_SMTP_HOST`, `RF_SMTP_PORT` | Approved SMTP endpoint; only implicit TLS 465 or required STARTTLS 587 |
| `RF_SMTP_USER`, `RF_SMTP_PASS` | SMTP authentication |
| `RF_SMTP_FROM` | Authorized single sender email address |
| `RF_VIBER_CHANNEL_TOKEN` | Credential for the separately verified test channel |
| `RF_VIBER_CHANNEL_SENDER_ID` | Sender permitted for that channel |

No matching credentials are configured in this instance, and none are required while sending is disabled. Secret bindings are attached to the trigger only if the source policy authorizes external testing; the current emulator startup does not try to fetch missing secrets from Secret Manager. `defineSecret().value()` is evaluated lazily, after the authorization and test-destination checks.

After explicit authorization, use approved runtime secret bindings / Firebase Secret Manager for a staging runtime, or securely injected local emulator variables. Never put values in chat, source, browser config, Firestore outbox/audit records, shell command history or logs. `.secret.local` and Functions `.env*` are ignored as a local safeguard, not an invitation to commit or share credential files. HTTPS-proxy placeholders are not raw SMTP passwords: SMTP needs native runtime credentials and approved TLS connectivity; do not extract proxy credentials. Do not create or deploy a remote project as part of this work.

## Transport contract

Email uses Nodemailer 10.4.0, verified certificates, TLS 1.2+, required TLS, bounded connection/socket timeouts, one recipient and stable `Message-ID` derived from the outbox event ID. File/URL attachment loading and transport debug logging are disabled. Password whitespace is preserved. A stable Message-ID assists reconciliation; it does not establish provider-side exactly-once delivery.

Viber uses only `https://chatapi.viber.com/pa/post`, with the visible legacy channel body (`auth_token`, `from`, `type`, `text`). Redirects are rejected to avoid forwarding credentials. A 20-second abort bounds the request. Acceptance requires an OK response, status 0, and a message token; numeric 64-bit tokens are preserved without lossy conversion. Timeouts, invalid JSON, redirects, missing acceptance tokens and 5xx responses remain uncertain. Exact full reports and channel bridge behavior require ViberChannel.gs audit.

## Idempotency and delivery logs

1. The financial transaction creates a stable outbox ID and immutable notification snapshot. Edits do not create another initial remittance message.
2. Delivery transactionally reads QUEUED, checks the order still exists and is not voided, and commits SENDING plus a deterministic `notificationAttempts` record **before** calling a provider.
3. A duplicate worker sees an existing claim/terminal state and does not send. A crashed SENDING claim is never automatically reclaimed.
4. Provider acceptance becomes SENT with provider ID and the attempt log updated atomically. SENT means accepted, not inbox delivery or a person reading the message. Disabled runtime delivery becomes SIMULATED.
5. Explicit pre-delivery rejection becomes NOT_DELIVERED. Only owner/admin can retry, after exponential backoff (respecting a longer provider Retry-After), capped at three attempts. Invalid/missing retry timestamps are rejected.
6. Ambiguous results, including a provider acceptance followed by a persistence failure, become REVIEW. No automatic or callable retry is allowed. Reconcile externally before deciding a separate recovery action; no recovery is authorized here.

Provider exception text, request bodies and credentials are never copied to delivery logs. Logs retain controlled error codes, attempt ID/count, timestamps, provider message ID and safe outcome detail. The existing preview contains customer/financial content and remains restricted to financial roles under deny-all browser Firestore rules.

## Before any future external testing

Explicit user authorization is still required. Audit the pending emailer/mailer/channel sources; verify test mailbox and test channel/token association; verify sender authorization and network access; provision secure test-only bindings; and review a narrowly scoped code-policy change permitting only those verified destinations. Adding credentials alone must not cause sending. That future work does not authorize production orders, live POS reads/writes or deployment.
