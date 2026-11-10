# Manual editing mirror — TEST ONLY

Destination: `ROCKETFIX360 - MASTER TEST`, REMIT row 5 headers, data rows 6–10628. Only the server-configured test spreadsheet and sheet GID are permitted. The production Master and Frame workbook IDs are explicitly denied. No automatic mirroring or Tracking/Orders writes.

| Columns | Source / behavior |
|---|---|
| A | Payment date, numeric Sheets date, `m/d/yyyy` |
| B–C | Saved email and customer name |
| D–E | Saved editing order type and file type, existing dropdown constraints enforced |
| F | Saved editing item `_paid`, never recalculated by mirroring |
| G | Saved main-file HTTPS URL |
| H | Untouched merge companion |
| I | Saved note-file HTTPS URL |
| J | Untouched merge companion |
| K | Linked frame order ID |
| L | Saved tip recipient / neutral `Select`, same list as source |
| M | Saved POS tip on first editing item only; zero on later items |
| N | Saved service notes, falling back to remittance notes |
| O | Saved proof URL |
| P | POS transaction ID, string |
| Q | Original editing order ID, string |
| R | Stable `POS ID|editing|editing ID` item key |
| S–T | Encoded / updated timestamps as numeric Sheets dates in UTC+8 |
| U–V | Saved payment and shipment methods |
| W–X | Saved item paid and discount allocations |
| Y | `SYNCED` only after the immutable saved financial record is selected |
| Z | Saved POS received amount (same transaction total on each item, per original source) |

No column after Z is written. AA has no verified header; rush date stays in Firebase. AB/AC summary formulas and AR/AT/AV Tracking/Frame Orders Loyalty formulas remain untouched. G/H and I/J merges are respected; only their anchor cells can be updated. Formula/protected target cells fail closed. Dates and numeric amounts use typed native Sheets values; strings cannot become formulas.

`remitSyncLedger` records POS/item, spreadsheet/GID/row, last successful timestamp/version, actor, attempt count and controlled error. Stable per-version request records prevent concurrent/replayed calls; a transaction reserves a row before network effects. Before writing, the backend searches the complete bounded P:R table for matching POS + item keys, rejects conflicts/duplicates, and verifies ownership again. The write is one atomic sparse Sheets batch. Timeout or acceptance-log failure becomes REVIEW REQUIRED; reconciliation only reads the reserved row, never appends or resends. Payments, earnings, audits and Viber outbox records are not changed by mirror actions.

The single-sheet native copy retains all grid rows, formatting, validations and formulas. Customer literals and rich references in data rows were removed before sharing. It intentionally does not copy unrelated source tabs or Apps Script projects: dependent formulas remain preserved but may be blank/#REF without those tabs. This does not approve live spreadsheet automation compatibility. Live installed Apps Script triggers still require review before any production switch.
