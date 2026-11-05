# Phase 3: category discounts and quotation integration

Follow-up: [production review](customer-phase3-review.md) fixes immediate document validation, decimal rounding and customer contact transitions. New quotations and duplicates now use server-owned calculation version 2; existing records retain their historical policy. Its final verification results supersede the initial results below.

## Existing calculation order, inspected before implementation

The authoritative engine is `shared/domain.js`, invoked by backend validation, preview, saved-total persistence and server PDF generation. The browser uses the same engine for immediate feedback.

1. Each product calculation resolves quantity, area/tier/base/package rules, options and item-level charges. Approved manual price overrides are separate from quotation discounts. There is no independent line-item discount field.
2. INR rates/charges become integer paise using the existing `R` conversion. Item amounts and the product subtotal (`isub`) are safe integer paise. The subtotal includes item-level charges.
3. Exactly one quotation discount (`disc`, percentage or fixed INR amount) applies to `isub`. It does not discount quotation-level delivery or other charges. Existing manual percentage arithmetic and fixed-amount behavior are retained.
4. The discount is allocated to items by integer largest-remainder allocation, preserving the exact total discount.
5. Undiscounted delivery/other charges enter a separate bucket with the quotation's saved tax rate and treatment.
6. Discounted items and quotation charges are grouped by GST rate and tax treatment. Exclusive GST is rounded on each group's net amount. Inclusive GST is extracted from its discounted inclusive amount; exempt groups have zero GST.
7. GST groups are combined. In split mode CGST receives the floored half and SGST the remaining paise; IGST uses the full GST amount. Grand total is net taxable/exempt amounts plus GST.

Existing saved item/customer/company/address snapshots, record versions, transaction locks, quotation ownership and status permissions remain the baseline. Existing quotation history records status changes; ordinary edits use record versions and audit events. No separate revision model is introduced.

## Phase 3 rules

- Reuse `disc`; never add a second category discount. An eligible managed category supplies the initial percentage. Other, uncategorized, inactive and archived categories supply no new automatic discount.
- Preserve existing manual discount behavior and employee limits. Staff can explicitly choose a manual discount subject to existing permissions/limits. Category selection replaces the current discount; leaving an automatic category clears that automatic amount, while changing between customers without an automatic category retains manual values.
- Category percentages use exact integer basis points and BigInt half-up rounding to paise. Allocation, GST treatment, charges and manual-discount calculations remain in the existing engine.
- Persist category percentage, amount and source alongside the existing category message/logo/name snapshot in the quotation JSON body. Existing quotations, including pre-Phase-3 drafts, are not silently upgraded or repriced. Duplicates retain the source policy snapshot while following the existing product repricing behavior.
- Drafts can explicitly apply current category settings through the normal versioned save workflow. This action updates the category discount/message snapshot; finalized quotations cannot use this refresh action.
- Keep the existing highlight immediately above Terms & Conditions. Keep billing/contact placement unchanged. Delivery selection uses existing customer-owned address management and historical snapshots.

## Persistence and compatibility

The quotation body now stores `categorySnapshot.discountPercentage` as a canonical decimal string, `discountSource` as `category` or `manual`, and `categoryDiscountAmount` in integer paise. Existing name/message/logo references stay in the same category snapshot. The amount is derived after canonical item calculation; incoming snapshot percentages, amounts and totals are not trusted. Manual overrides have zero category amount and still use the existing `disc` field.

No DDL migration is needed. Schema version **8** is retained; existing quotation JSON is not backfilled at startup. Legacy records keep both their existing discount behavior and absence of newer fields until a deliberate draft refresh. Backup/restore tests retain the percentage, amount, source and asset references.

API consumers can set `discountSource: "manual"` to request an existing-style manual discount on an eligible new quotation. Otherwise its managed category supplies the default. `PATCH` changing the customer resolves that customer's category unless a source was explicitly supplied. `_applyCategoryDiscount: true` explicitly refreshes current settings on a Draft; the flag is not persisted. Existing optimistic versions, permissions and employee caps apply. No default category policy is created for Other.

## UI and output behavior

Customer selection and inline customer creation apply the category default. The editor displays its name/percentage, one discount amount, and server validation status. Debounced preview requests use the existing authorized backend service; stale responses cannot overwrite a newer customer selection. Validated financial values replace inconsistent client item amounts before totals are marked confirmed. If that requires correcting a stale local pricing breakdown, it is summarized into base amount and item charges until the saved quotation returns the full canonical breakdown.

Preview/print and server PDFs label the existing discount row with the saved category name and percentage. The same escaped, multiline highlight remains immediately before Terms & Conditions; disabled/empty messages produce no box. Existing protected WhatsApp PDFs use that server renderer. Logo references are preserved, without adding an optional new logo placement. Long category names wrap on narrow screens and in print previews.

Delivery address creation uses the existing authorized customer editor. Selection is customer-scoped, billing is kept separate, and saved address snapshots survive subsequent edits/archives. The independent contact-person number is retained in the customer snapshot and made available in the safe preview model; existing template placement is unchanged.

## Files changed in Phase 3

| Area | Files |
| --- | --- |
| Shared discount resolution and exact arithmetic | `shared/customer-categories.js`, `shared/domain.js` |
| Backend normalization, projections and API documentation | `server/validation.js`, `server/resources.js`, `server/openapi.js` |
| PDF discount label | `server/pdf.js` |
| Editor integration and authoritative preview | `public/category-quotation-ui.js` (new), `public/quotation-ui.js`, `public/index.html` |
| Category context, wrapping and preview/print label | `public/customer-categories-ui.js`, `public/customer-categories.css`, `public/srs-ui.js` |
| New regression suites | `tests/customer-category-quotation.test.js`, `tests/customer-category-quotation.browser.cjs` |
| Phase 2 expectations and snapshot restore assertions | `tests/customer-categories-api.test.js`, `tests/customer-categories.browser.cjs` |
| Calculation analysis and report | `docs/customer-phase3.md` |

Earlier uncommitted work was retained. This phase adds no dependency, unrelated feature, permission category, tax policy or database migration.

## Verification and acceptance

**PASS for Phase 3 source and isolated verification. Production deployment was not performed.** All database tests use generated databases in a separate disposable PostgreSQL 17 instance on loopback port 55429. Financial API tests were also run against the final built image without mounting application source.

| Check | Result |
| --- | --- |
| Complete automated suite | PASS - 390/390, zero failures/skips |
| New Phase 3 unit/API cases (included above) | PASS - 10/10 |
| New Phase 3 browser suite | PASS - 13/13, zero JavaScript exceptions |
| Category management browser regression | PASS - 13/13 |
| Customer/address browser regression | PASS - 15/15 |
| Quotation editor browser regression | PASS - 19/19 |
| General application/browser regression | PASS - 20/20 |
| Total browser checks | PASS - 80 across five suites, zero JavaScript exceptions |
| Exact arithmetic / GST | PASS - basis-point/half-paise cases, large safe amounts, 0%/100%, inclusive/exclusive/exempt and split/IGST |
| Historical preservation | PASS - settings changes, customer category changes, legacy drafts, explicit draft refresh, finalized refresh rejection and duplicates |
| Ownership/security | PASS - employee caps, forged discount metadata/client amounts, address ownership, existing cross-company/session/logo isolation and CSRF regressions |
| PDF / print / responsive | PASS - saved-total parity, multiline highlight before terms, existing pagination tests, visual PDF review, long-name wrapping and 1440/768/390/320 viewport checks |
| Syntax / frontend build / Docker build | PASS - 95 JavaScript files plus explicit new browser-runner syntax check |
| Final built-image Phase 3 integration | PASS - 10/10 tests against bundled application code |
| `git diff --check` | PASS |
| Dedicated lint / type check | NOT CONFIGURED - no such tasks/configuration in this plain JavaScript repository |

Evidence is in ignored local `test-results/customer-phase3-*` logs, browser JSON/captures and generated PDF/render. Before-final failures were corrected, including a test fixture needing a state refresh after external address edits; the table reports the final runs.

## Remaining limits and release steps

- The existing eight moderate ExcelJS/archive-chain dependency findings are outside this scoped integration; no new dependency was added. The repository still lacks dedicated lint/type-check tooling.
- Company isolation remains the existing separate app/database model, rather than shared-database tenancy. Existing jsPDF Unicode/font limitations remain; no font pipeline was changed.
- Before release, stop writes, take a complete backup, restore it in isolated staging, build the locked release image and repeat category/quotation/PDF smoke checks. Existing category settings remain authoritative; no real discount values were invented or seeded in this work.
- Deploy only with explicit authorization. Reload browser clients to load the shared category helper before the pricing engine and the new editor integration.
- Prefer a forward fix. If rollback is necessary, stop writes, retain a new dump, restore the pre-Phase-3 backup into a separate empty database and use the prior image after verification. Reconcile post-release records before reopening writes. **Schema 8 alone does not guarantee old-code compatibility with the new JSON fields/exact category rounding; do not blindly downgrade the application against Phase 3 data.**
- No production data was accessed or changed, and the normal application/database containers were not rebuilt, restarted or migrated by this work.
