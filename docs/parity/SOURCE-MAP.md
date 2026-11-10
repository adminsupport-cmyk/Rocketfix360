# Original Admin POS migration audit

Branch: feature/original-admin-pos-parity, based on staging/firebase-pos-fast-track.
Original HTML (2,398 lines) and connector (1,437 lines) reviewed before interface changes. Embedded MP3 is opaque binary media, retained byte-for-byte. Original reference files remain immutable. All source inspection is offline; no Apps Script executed.

| Original surface / action | Firebase mapping | Status / dependency |
| --- | --- | --- |
| Dark styles, responsive desktop/iPad, four navigation tabs | Original HTML/CSS retained verbatim | Visual regression comparison required |
| Original login/device system | Removed; independent Firebase email/password form + myAccess | Firebase Auth only; active staff and permitted role required. No device token or legacy session |
| Customer full name, N/A email, phone | saveOrder / getOrder | Preserve original first/last split and exact stored split on edits |
| Editing IDs, types, file types, rush dates, service notes | saveOrder | Fetched, revision and additional payment labels restored from original; these are receipt labels, not a new partial-payment ledger |
| Editing ↔ frame linkage, combined eight-digit POS ID | saveOrder atomic transaction | Duplicate link validation required |
| Frame product, size, dimensions, letter, receiver/address | quote / saveOrder | Original UI retained; live financial writes blocked pending parity approval |
| Discount, service allocation, tips, Excess | core.validate | Existing service-first calculation retained; Excess separate |
| Personalized letter / late letter | saveOrder / saveLateLetter + indexed getOrder | Atomic existing backend retained; standard ID lookup and disabled-delivery status adapted; short legacy IDs require reconciliation |
| Serialized saving queue, lost callback status reads | Firebase posAPI transport + stable saveOrder request ID + exact immutable request receipt via getOrder | Never repeat payment to retry notification |
| Edit saved order | expectedVersion mapped from record version | Backend preserves workflow state and paid recipient |
| Delete active record | voidOrder | Intentional immutable audited void, never destructive deletion |
| History / daily / weekly | listOrders pagination; original rendering | No fabricated historical backfill |
| Customer directory | staged order customers only | Original REMIT directory export missing; UI explicitly states scope |
| Historical get/save/backfill | unavailable | Local historical source recovered; reconciliation/import not yet implemented |
| Proof upload / chunk | blocked | Dedicated staging Drive folder/service identity/delegation not configured |
| PH locations | original local province fallback | Local PhilippinesLocations candidate recovered; current nationwide dataset not validated; manual city/barangay retained |
| Frame settings | getPricing / savePricing | Original controls retained; fixture flag absent from employee UI |
| Email / Viber | existing atomic outbox and private trigger | Sending disabled; no simulated delivery described as real |
| Staff production/editor queues | existing backend preserved | Not a screen in Original_Index; separate queue UI parity is unresolved |

## Additional local evidence

`local-source-inventory.json` contains discovered paths, hashes and sizes, including duplicate versions. Latest local V14.7 FramePricing reviewed: standard framed price is client-entered in the legacy server, custom price is max(minimum, ceil(width*height*rate+base)), shipping is per frame with manual override. Defaults in source do **not** prove the current edited workbook rates. Current Firebase fixed-standard validation is stricter and remains a parity blocker rather than being silently weakened.

DeviceAccess V16.5 and reconciliation patch reviewed: shared PIN/HMAC sessions and allowlisted dispatch; the Firebase role enforcement is retained instead of the original no-op posRequireAuth_. Notification scripts reviewed for entrypoints, property dependencies, template/version conflicts and loyalty coupling. TransactionMailer includes cumulative stamps and reads live workbook loyalty state; this is evidence, not approval to invent migrated balances. No sending scripts were executed.

## Blocking acceptance items

- Current approved POS Frame Pricing workbook export (including production bounds and manual standard-price policy).
- Tracking/editor assignment/status source and approved employee permissions matrix; current roles remain enforced.
- Reconciled historical/customer/loyalty export. HistoricalReporting, Directory and LegacyEdit source candidates are now preserved locally; their Firebase port and provenance validation remain outstanding.
- Authorized staging Drive proof upload destination and access identity.
- Graduation/Wedding requested, but absent from Original_Index choices; preserved backend support, no invented original controls. Original Fetched retained.
- Full end-to-end equivalence for historical repairs and short legacy frame IDs is not established.
- Real financial transactions are prohibited until parity approval; emulator sample orders only.

Additional dependency discovery: see `recovered-dependencies.json` and `reference/legacy/`. Local historical editing, customer-directory, locality, PortalAuth and Tracking autofill code candidates were found. They are not missing source; they remain unverified as the exact deployed versions. No workbook exports or secret values were fetched.
