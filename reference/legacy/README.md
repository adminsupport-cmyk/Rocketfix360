# Legacy source intake

Place the five original offline sources here under the canonical names in `manifest.json`. Their original archive filenames are accepted as aliases; preserve original contents and record provenance. No `.gs` placeholders are supplied: a placeholder must never pass a source-presence check. These files are evidence only and must never be executed against live Sheets, Drive or providers.

Run `npm run audit:legacy` after adding files. It records SHA-256 hashes and function names without executing Apps Script or printing source/credentials. Missing files fail with exit 1; present files without a matching reviewed hash fail with exit 2. Matching reviewed hashes establish recorded review provenance, not feature parity or deployment approval. Two candidate names for the same source fail as ambiguous rather than silently selecting one.

For each source, compare the archive hash, inspect callers/dependencies, document its actual rules and configuration in `docs/LEGACY_MIGRATION.md`, then port small functions with differential tests against offline legacy fixtures. Set `reviewedSha256` only after reviewing that exact source; future content changes invalidate the review. Keep original source unchanged; put sanitized fixture inputs under tests. Do not commit credentials. If originals contain embedded credentials, preserve them in the secure archive and obtain a redacted export with its own provenance before committing.

Missing shipping/product/staff configuration must come from a separately provided offline export. The build must not read the live configuration sheet. No example price, zero/base default, dimension default, inferred region, or entered fixture rate counts as approved data. Tracking implementation and function names remain unknown until its backend is supplied.

Source review order: FramePricing; DeviceAccess; TransactionMailer and POS_Emailer together; ViberChannel; Tracking when available. Preserve documented business behavior and add parity fixtures before changing the Firebase implementation. Provider adapters already exist, but actual sending remains disabled until separately authorized testing and verified destinations.
