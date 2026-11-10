# Reference audit and staging parity

Audited uploaded `reference/Original_Code.gs.txt` (1,437 lines) and `reference/Original_Index.html` (2,398 lines). Original references are preserved verbatim. `source-inventory.json` records hashes and definition/invocation inventories; it is an offline inventory, not a claim of complete source availability.

| Area | Reference evidence | Implemented staging behavior | Remaining gap |
| --- | --- | --- | --- |
| Accounting | `posFinalizeQueuedV1618_`, `posServiceAmounts_` | Separate tips/Excess; proportional service totals; item + letter + per-frame freight weights; final item residual | Differential fixture coverage is not full historic reconciliation |
| Editing | `posSyncRemit_`, browser service forms | IDs, file type, rush date, editor assignment, links, status and versioned file updates | Original Tracking/encoder portal backend is absent; no direct Drive uploads or permissions migration |
| Framing | `posSyncFrame_`, deletion safeguards | Receiver details, supported design/size, mockup URL, tracking, status, safe void restrictions | Shipping-label generation, separate production integrations and original layout parity incomplete |
| Pricing | Browser `rfFrameFormula`, `setFramePrice` | Four standard black acrylic SRPs: 799/999/2299/3199; separate product rate/base/minimum formula and dimension bounds | `rfFrameCfgRead_`, `rfFrameProductKind_`, `rfFrameProductQuote_` server definitions/configuration are absent; browser-derived port requires business review |
| Shipping | Browser `rfClientFrameTier`, `rfGetShippingEstimate` | Small/Medium/Large/XL dimension tiers, per-frame freight, configured LBC area/rate/days, explicit manual quotation | `rfFrameShippingQuote_` and actual approved rate table absent; no guessed charges or live Lalamove quotes |
| Letters | `posFrameAddonValidate_`, `posRecordEarnings_` | ₱200 price, ₱50 commission, allowed employees/fonts/colors and message limits, paid recipient immutability | Legacy grandfathered recipients need offline reconciliation |
| Late letters | `rfLateAddonSave_`, `rfLateAddonRead_` | Receipt confirmation, fixed amount/commission, separate transaction, stable frame payment identity, closed-frame block, atomic retry | Legacy partial Sheet-write recovery cannot be ported without imported legacy records; atomic Firestore writes avoid that partial-write path |
| Employees | `posGetTipEmployees_`, `posRecordEarnings_` | Stable tip/letter earning keys; owner membership management; active editor assignment; date-range earnings | REMIT column L dynamic validation list and `rfDeviceCall` employee permission dispatcher missing; current roles are provisional |
| Sales | Browser `renderReports`, `rfWeeklyRender`, `rfLateAddonSales_` | Full selected date-range staging sales/earnings; separate late-letter sales, tips and Excess | No legacy exports/history imported; recent order list bounded; original weekly charts/layout incomplete |
| Email | Frame metadata; external original delivery system | Escaped staging receipt; real verified-TLS SMTP adapter behind OFF policy; immutable snapshot; durable pre-send attempt log | Original provider code/templates absent; no real delivery tested |
| Viber | `rfLateAddonViberNotify_`, `rfLateAddonViberText_` | Real fixed-HTTPS channel adapter behind OFF policy; simulated runtime; single claim; ambiguous attempt REVIEW; bounded confirmed-failure retries | Original `ViberChannel.gs`/`rfChPost_` bridge absent; no real channel calls |
| Auth | Original temporary `posRequireAuth_` bypass; browser device calls | Active Firebase membership; no browser Firestore access; allowlisted role projections | Bypass intentionally not ported; exact original role policy unavailable |
| Refunds/loyalty | References to external workflows | REFUNDED is an operational status only | No financial refund/reversal or loyalty formula invented; needs authoritative rules |
| Migration | Original Sheets/Drive IDs in reference | Offline CSV preview retained; no live reads/writes/imports | Reconciliation requires offline exports and explicit separate migration work |

## Staging role policy (provisional)

Owner/admin/sales read financial records, create and edit payments, record late letters, and run financial reports. Owner/admin manage pricing, void safe orders, and retry confirmed failed notifications. Only owner updates existing Auth user memberships; self-membership changes are blocked. Encoder manages operational items and assignments, editor sees and updates only assigned editing items, production sees and updates only frame items. No operational role receives price, payment, tip, Excess, proof, or commission values. This is an explicit staging policy, not a recovered original permission matrix.

## Release constraints

No production deployment or live Google Sheets/Drive/provider calls are part of this work. Backend entry points require the explicit demo emulator environment. Production is not supported by this build. Restoring full workflow parity needs the missing offline sources above; a passing file-presence audit does not establish parity.

## Confirmed archive dependencies (user supplied)

The user identified these files in the original archive; they are not yet committed here:

- `reference/legacy/FramePricing.gs`: server product/shipping pricing and configuration reading.
- `reference/legacy/Rocketfix_POS_DeviceAccess_iPad_Response_Reconciliation_V1.gs`: device authorization dispatcher.
- `reference/legacy/Rocketfix_POS_Emailer_V8_Short_Lock.gs`: customer confirmation emailer.
- `reference/legacy/Rocketfix_TransactionMailer_V4_POS_ID_Compatible.gs`: transaction email templates.
- `reference/legacy/Rocketfix_POS_Viber_Channel_v1.gs`: Viber channel backend.

When committed, audit these offline files before porting their logic. Approved shipping values still require an offline export from the configuration sheet; this build must not read the live sheet. The complete Tracking backend remains unavailable.

**Pricing gate:** browser-derived prices/formulas remain unverified examples. Frame saves and frame quotes are disabled by default. Owner/admin may explicitly enable `fixtureOnly` for synthetic emulator tests; every resulting frame order is stored as `pricingStatus: UNVERIFIED_FIXTURE`. Entered rates in that mode remain synthetic test inputs, never approved business rates. This does not satisfy authoritative pricing, permissions, notification, or Tracking verification.

Continuation details: [legacy source intake and missing values](LEGACY_MIGRATION.md), [disabled provider adapters and secure credentials](NOTIFICATIONS.md), [proxy diagnosis and alternative validation](VALIDATION.md).
