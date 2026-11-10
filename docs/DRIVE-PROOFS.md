# Private Google Drive payment proofs — staging only

Target: `rocketfix-360-staging`, Firestore `rocketfix360database`. Supplied folder: `1HBnKsg81SyR3CKAH65bp3ryHclMqSNXt` (ROCKETFIX360 - PAYMENT PROOFS), confirmed by Owner as **My Drive**. Live setup completed November 11, 2026: Owner-approved public-link removal, private folder/backend access, saved VERIFIED settings, one actual Drive upload and atomic Firebase proof attachment to fictional POS 83946792 v8 all passed. No live Sheets write was performed. See [live acceptance](../staging/drive-proof-live-acceptance.json).

## One-time My Drive connection

1. In the Google Cloud console, select **rocketfix-360-staging**. Enable Google Drive API if needed. In Google Auth Platform, configure Branding/Audience, authorize the folder-owning Google account (test user if the app is in Testing), and add the Drive scope `https://www.googleapis.com/auth/drive`.
2. Create an **OAuth client → Desktop app** in this staging project. Download its JSON outside this repository, for example into Downloads. Do not paste credentials in chat or commit this file.
3. Run the following from the repository, replacing only the local file path:

   ```sh
   node tools/connect-drive-oauth.cjs --project rocketfix-360-staging /absolute/path/to/Desktop-client.json
   ```

4. Open the printed Google consent URL in your browser and authorize the account that owns the private proof folder. The helper uses a loopback callback, state validation and PKCE. It keeps tokens in memory and writes credentials only to the staging **RF_DRIVE_OAUTH** Secret Manager secret. It grants the staging runtime identity access to this specific secret only. No access/refresh tokens are returned to the POS browser or printed. Staging CLI authentication needs permission to create/add secret versions and set the secret's IAM policy.
5. In the POS, open **Settings → Payment Proof Storage**. Choose My Drive, enter the folder ID above, click **Test Connection**, then **Save Settings** as Owner. Admin can view/test, but cannot change the saved destination. Verify the saved status after refreshing.

Google's OAuth testing-mode expiry and verification requirements apply; an external consent app in Testing can issue refresh tokens that expire after seven days with Drive scopes. This requires a durable approved OAuth app before ongoing operational use. A revoked/expired connection fails closed and requires reconnecting. See [Google OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration) and [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).

Do not substitute Firebase's web API key, browser credentials, Firebase CLI refresh tokens, or a public Drive folder. The application requests the Drive scope because an arbitrary existing Owner-selected folder must be inspected and permission-checked; tokens stay server-side. Employee access to the private files is managed by the folder owner; Firebase login alone does not grant permission to open Drive links.

## Shared Drive alternative

Select Shared Drive and grant `855901392227-compute@developer.gserviceaccount.com` the ability to add files and inspect permissions in the chosen private Shared Drive folder. The backend uses Application Default Credentials and refuses service-account uploads to a My Drive folder. No service-account key is downloaded. No folder permissions are changed automatically.

## Commit and retry behavior

- Authorized Owner/Admin/Sales employees send 256 KiB chunks through authenticated Firebase callable handlers. The browser never receives a Drive token, resumable session URL, or upload permission. Files are limited to JPG/PNG/WEBP/PDF, 25 MiB, matching MIME, extension and initial byte signatures.
- Employee + POS + SHA-256 + size + MIME identifies the upload. One preallocated Drive ID is persisted before file creation. Lost responses query the resumable session and verify the same reserved Drive file, never create a second completed file. The final file's parent, app properties, size, type, privacy and SHA-256 are verified before READY. SHA-256 uses Drive's checksum or a bounded server-side download if unavailable.
- Upload sessions and leases are private Firestore data. A timeout may leave a lease active for up to 90 seconds; retry shortly. Completed uploaded files are READY until the financial transaction atomically attaches them. Payment success is shown only after the existing Firebase commit/reconciliation confirms it. Proof failures preserve the form and display a Retry button; no save request is issued before proof verification.
- The financial transaction verifies employee ownership, POS identity, READY/ATTACHED state and cleanup lock, then atomically stores `proofUploadId`, `proofDriveFileId`, `proofUrl`, `proofFileName` and updates the upload to ATTACHED alongside the payment, revisions, immutable audit and outbox records. Existing proof metadata survives financial corrections. Payment retries retain the existing stable request identity.
- The Editing Database exposes Open proof to financial roles. Existing REMIT mapping uses `proofUrl` in **column O / POS Proof URL**. Actual Google Sheets mirroring remains manual and test-only, and rejects real customer orders. Production mirroring has not been enabled by this feature.
- Settings lists the latest 50 upload records for recovery. An employee can resume by selecting the same file for the same POS; an Owner can trash unattached files older than 24 hours. Attached files are protected by the same transactional ledger. Cleanup only moves the exact app-owned reserved file to Drive Trash; it never deletes payment records or unrelated Drive files. Failed cleanup remains available for review. No automatic cleanup worker or historical backfill runs.

## Acceptance status

Live acceptance completed November 11, 2026. The existing fictional POS **83946792** was updated from v7 to v8 through the actual POS file chooser and Update Transaction button. Exactly one private Drive file was created, checksum/size/parent verified, and its ID/link atomically attached in Firebase. Open proof displayed the labelled sample PDF in the native Drive viewer; settings and the database link persisted across page refreshes. Monetary values and the existing one-attempt SENT Viber event were unchanged. No new payment or notification was created.

Automated validation remains 73 unit tests, 29 emulator test records and three browser suites (Drive API doubles), with 32 deployed access checks. Those prior checks were supplemented by the real Google OAuth/Drive/Firestore/browser acceptance, not replaced or claimed to have been rerun for the configuration change.

No live Sheets mirroring was performed; existing REMIT rows were deliberately left unchanged. Production Sheets writes and real-order-to-test-workbook mirroring remain blocked. Any future live sample must account for existing fictional Viber automation before creating a new remittance. OAuth app Testing/production audience status was not independently inspected, so the testing-mode token-expiry caveat above remains relevant. Overall production parity/readiness remains outside this completed proof-storage setup.
