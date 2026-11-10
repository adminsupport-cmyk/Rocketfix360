# Legacy migration dependencies

The selected main branch remains `139f7eaa56ed3925c835247ad8e9d7ccb0557ed4`. `reference/legacy/manifest.json` tracks the five pending offline files and their exact reviewed hashes. `npm run audit:legacy` fails while they are missing or unreviewed. None has arrived at this audit. All current frame prices are UNVERIFIED_FIXTURE examples.

## Required pricing values

| Data | Required values | Evidence and current state |
| --- | --- | --- |
| Standard framed SRPs | Approved Small/Medium/Large/XL prices, dimensions and product mapping | Browser `setFramePrice` shows 799/999/2299/3199; these remain unapproved examples pending FramePricing.gs and configuration export |
| Framed custom calculation | `framedRate`, `framedBase`, `framedMinimum`, `framedMinWidth`, `framedMaxWidth`, `framedMinHeight`, `framedMaxHeight` | All seven approved values missing |
| Print-only calculation | `printRate`, `printBase`, `printMinimum`, `printMinWidth`, `printMaxWidth`, `printMinHeight`, `printMaxHeight` | All seven approved values missing |
| Canvas calculation | `canvasRate`, `canvasBase`, `canvasMinimum`, `canvasMinWidth`, `canvasMaxWidth`, `canvasMinHeight`, `canvasMaxHeight` | All seven approved values missing |
| Pricing rules | Custom rounding, orientation, standard/custom exceptions, supported design names, oversize behavior, minimums, quote/version invalidation | Browser formulas are partial evidence; `rfFrameCfgRead_`, `rfFrameProductKind_`, `rfFrameProductQuote_` definitions are absent |
| Editing prices | Approved editing service/rush price rules, any discounts, employee authority for overrides | Starter accepts entered editing amount; no authoritative tariff supplied |
| Tips/staff | Actual REMIT column L validation choices and allowed tip/commission recipients | Five letter recipients appear in uploaded source; dynamic tip list and dispatcher permissions still missing |

No absent numeric field is approved as zero. Browser fallback bounds of 4–60 inches are also examples, not confirmed production limits. ₱200 letters and ₱50 commissions are present in uploaded Apps Script, but grandfathering and late-payment interactions still require complete-source parity verification.

## Required shipping export

Each cell needs the approved **fee and delivery-day text**, effective date/version, applicable dimensions/tier, and evidence of which configuration export supplied it:

| Area | Small | Medium | Large | XL |
| --- | --- | --- | --- | --- |
| Luzon | Missing fee/days | Missing fee/days | Missing fee/days | Missing fee/days |
| Visayas | Missing fee/days | Missing fee/days | Missing fee/days | Missing fee/days |
| Mindanao | Missing fee/days | Missing fee/days | Missing fee/days | Missing fee/days |

All 12 rate cells / 24 fee-day fields are unavailable. Also missing: authoritative `rfFrameShippingQuote_`; destination-to-area mappings/exceptions; whether rates sum per frame or combine under special conditions; XL/oversize handling; Lalamove quotation/approval policy; manual freight override permissions; delivery-day exceptions; shipping discount/refund handling. Browser tier boundaries 10×13, 13×17, 18×26.5, 25.5×35 are unverified server mappings. Obtain a sanitized offline configuration export; do not query live Sheets.

## Tracking and encoder functions

The complete backend is unavailable, so an exhaustive list of its actual function names cannot be asserted. The following is the complete set of Tracking dependencies observable in the uploaded POS files:

| Observed contract | Existing evidence | Missing implementation or verification |
| --- | --- | --- |
| Editing ID uniqueness | `posValidateIds_` scans Tracking column A plus REMIT column Q | Existing Tracking records/export, reserved IDs and server creation dispatcher |
| REMIT → Tracking materialization | `posSyncRemit_` writes REMIT A:F, K:N and POS metadata O:Z | The trigger/worker that creates or updates Tracking rows, field/schema mapping and replay identity; function name unknown |
| Rush target propagation | `posSyncRemit_` writes REMIT AA; comment specifies Tracking N | The propagation function, scheduling semantics and date/timezone rules; function name unknown |
| Employee/editor assignment | Browser/queue concepts; device-dispatch calls | Original encoder/editor permission checks, assignment/update functions, state transitions and ownership rules; names unknown |
| Customer editing files | `fileType`, frame link and Drive references | Upload, Drive sharing/access, file lifecycle and delivery functions; names unknown |
| Delete cleanup | `posClearDeletedTrackingDetails_`, alias `posClearDeletedTrackingFiles_`, `posPreviewDeletedTrackingFileCleanup_`, `posRepairDeletedTrackingFileLinks_` are present | Actual Tracking schema and row-era evidence; source clears content only for exact persisted IDs at rows 10251+, rejects duplicates and rechecks IDs. Do not infer those row numbers as a Firebase data model |
| Frame linkage and production | REMIT K linked frame ID; frame metadata includes editing IDs | Authoritative bidirectional updates, safe unlink/repair policy, production/Tracking orchestration |
| History/customer records | Browser dispatcher actions `history`, `status`, `directory`, `historical`, `legacyGet`, `legacySave` | `rfDeviceCall` routing/authorization and underlying history/directory/reconciliation implementations |
| Refund/closure and loyalty | External references; operational REFUNDED status | Financial reversal, reopening, loyalty and notification eligibility rules; names unknown |

Other pending dispatcher routes observed in the browser: `framePricingGet`, `framePricingSave`, `save`, `proofStart`, `proofChunk`, `delete`, `tips`, `lateAddonLookup`, `lateAddonSave`, `lateAddonSales`, `phLocations`. These routes are not evidence of complete Tracking implementations. No unsupported function names have been invented.

## Notifications and permissions migration

- DeviceAccess.gs must establish the action/role matrix, device/session expiry/revocation, reconciliation access and error contract. Current Firebase roles remain provisional.
- POS_Emailer.gs and TransactionMailer.gs must establish recipients, eligibility, full templates, edit/void behavior and stable POS identity. The existing staging receipt is not the original template.
- ViberChannel.gs must establish channel/sender identity, exact report templates, deduplication log keys and accepted/error response rules. The low-level adapter follows the visible `rfLateAddonViberNotify_` HTTPS contract; complete channel parity is pending.
- Credentials belong in runtime secret bindings, not the reference archive, browser bundle, Firestore documents or logs. Actual sending is disabled in `functions/notification-policy.js` and is not enabled by environment variables or admin callables.

## Production exclusion

Every callable still requires the demo emulator runtime. Order saves additionally reject a requested production environment or `productionEligible: true`, and persist server-owned `environment: staging` / `productionEligible: false`. Clients cannot relabel fixture rates as verified. There is no production order, promotion or deployment path in this work.
