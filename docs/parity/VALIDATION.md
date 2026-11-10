# Strict original-interface rebuild — actual validation

Branch `feature/original-admin-pos-parity`, based on `staging/firebase-pos-fast-track` (`7e554b7`). Main/recovery branches preserved.

- `npm test`: 42/42 passing (36 preserved + 6 original-interface regressions).
- `npm run check` and `npm run build`: passing; inline original script also parsed by regression test.
- Complete Emulator Suite: 19/19 Node test records passing, including parent record. Added pagination, indexed frame lookup authorization, and exact request-commit receipt verification. Existing atomic allocation, stale versions, cross-role status protections, immutable revisions, duplicate-payment/outbox protections and direct-client denial remain passing.
- Real local browser: Owner Firebase login, editing/frame/combined synthetic sample remittances, letter selection, phone preservation, versioned edit, deliberate lost save-response reconciliation with exactly one submission, history, receipt popup and daily sales pass. No live financial transactions made.
- Desktop 1440×1000, iPad portrait 810×1080 and landscape 1080×810: editing and frame/letter field inventories, dark body color, and all original new-remittance panel rectangles match exactly. Original CSS blocks are byte-identical. Six side-by-side PNG comparisons in `screenshots/`.
- Screenshots visually inspected. Intended wording differences identify Firebase credentials, blocked Drive/directory dependencies and disabled sending. This is not a claim of pixel-perfect parity for every screen, modal or business rule.
- Browser execution used actual local Firebase emulators. Original comparison page was offline; no Apps Script dispatch existed. Only original logo image was allowed outside localhost.

Financial changes/quotations are server-blocked outside the isolated `demo-rocketfix-360` emulator, regardless of stored fixture flags or client input. Staging UI offers no fixture activation control. Real email/Viber policy remains OFF and deliverOutbox stays private.

Outstanding acceptance: approved pricing/config export and standard-price override policy; reconciled historical/customer/loyalty migration; staging Drive integration; exact source-version/role/status review; full historical/short-ID and operational queue UI port; remaining modal/report visual comparisons; authenticated deployed Owner acceptance. Local dependency code candidates are preserved rather than reported missing.
