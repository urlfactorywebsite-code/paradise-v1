# Phase 3 product fields: independent review

Date: 2026-11-05. Scope: product-specific fields, dropdowns, quotation integration and pricing integrity. Review status: **PASS for the tested local scope**. This report supplements the original Phase 3 implementation report; it does not replace its historical execution record.

## Defects fixed

1. **Unstable initial option order.** New option arrays without explicit positions previously received equal order values and were returned in random ID order. This also affected native product binding initialization. Creation now defaults to array position, preserving explicitly supplied order values. Native initialization respects existing canonical option display order.
2. **Native order overrides did not always render.** Catalog `optionMeta.order` could override the central editor's saved order. The display adapter now sets order on its cloned metadata as well as its cloned option rows. Original catalog keys, rates and pricing rules remain unchanged.
3. **Hidden unsaved values could block quotation saving.** Deactivating a field while entering a quotation left an unavailable draft value attached to the line. Refresh now discards unsaved values for unavailable fields, or restores an existing saved value/snapshot, with a notification. It does not erase saved historical selections.
4. **Unsaved lines could claim historical exceptions.** The browser treated any line already added to the current draft as a saved line. Historical grandfathering and retired-choice retention now use the last server-confirmed workspace snapshot (`SAVED`), matching backend enforcement. A new required field is enforced on an unsaved line; an unchanged actually saved line remains editable. Unsaved archived choices must be replaced with available choices.
5. **Invalid number input could bypass validation.** A saved optional null value and invalid numeric input could compare equally through JSON serialization. The unchanged-value shortcut now checks actual input validity before allowing the historical exception.
6. **Session and Edit Mode cleanup.** Session expiry could leave the native product management dialog above the sign-in page. Central session/mode notifications now close the manager, clear its configuration session and ignore late initialization responses. Turning Edit Mode off also closes its management dialog.
7. **Editor presentation and keyboard focus.** Corrected encoding-damaged close/drag/arrow/separator/loading text. Product management refreshes restore focus to the corresponding control, and closing the manager restores its originating control where available.

The first inactive-field failure was reproduced as a real quotation POST returning 422 after the form accepted its hidden value. Numeric and newly required-field reproductions showed Update incorrectly closing the configurator. Session-expiry reproduction left the manager visible after sign-in rendered. The broader browser run exposed the option-order tie defect; a separate API/display regression covers canonical order metadata and saved override behavior.

## Verification

| Requirement | Result / evidence |
| --- | --- |
| Product-specific configuration isolation | PASS: same-named dropdown/number definitions on different products retain distinct IDs, types and values; foreign product values are rejected |
| Field creation, labels and options | PASS: seven types, immutable identities, native/custom labels, option label/order/archive saves and safe native restrictions |
| Switching products | PASS: no field/value leakage; late responses discarded; loading failures retry without adding an incomplete item |
| Saving and validation | PASS: required values, typed input, new versus genuinely saved lines, unavailable fields and retired choices |
| Archived selections and historical quotations | PASS: saved selections/snapshots remain readable and unchanged; generated PDF and browser print retain historical labels |
| Pricing integrity | PASS: full canonical product objects, versions and rules remain unchanged by metadata customization; preview/saved amounts match canonical pricing |
| Authorization and company isolation | PASS: employee mutation denial, scoped product IDs, separate company databases, finalized metadata protection and expired-session cleanup |
| Native option ordering | PASS: canonical initial display order, explicit override order, rendered dropdown order and unchanged saved price |
| Full Node/PostgreSQL test suite | PASS: 482 tests, no failures, skips or cancellations, final candidate image; approximately 137 seconds with concurrent browser QA |
| New review browser cases | PASS: 10 checks |
| Complete browser matrix plus final focused reruns | PASS: 344 checks across 27 suites, no remaining failures or page exceptions |
| Syntax validation | PASS: 144 JavaScript files |
| Frontend and production image builds | PASS |
| Dedicated lint/static typing | NOT CONFIGURED in this plain JavaScript repository |
| Production deployment or persistent database mutation | NOT RUN |

Targeted final browser regressions cover Products & Services, Pricing Configuration and its refinement suite, Create Quotation, the quotation/PDF audit, and the original Phase 3 integration suite. The quotation audit compares nine controlled calculation cases across frontend totals, backend preview, saved records, SQL amounts and PDF rows. The original Phase 3 suite also extracts historical selected labels from generated and browser-print PDFs after renaming/archiving.

Tests run against a task-only PostgreSQL 17 container on loopback port 55429, with fresh random fixture databases. The candidate image is `paradise-product-fields-review:20261105` (`sha256:e9abc62c3e750a2cfc3406c0dc3454f793404f7b096408dd5027815f6c805e45`). Backend failure-injection cases intentionally produce generic request-error logs while asserting atomic rollback.

## Files changed by this review

The task-start SHA-256 inventory distinguishes these changes from the existing dirty workspace:

- `public/product-fields-ui.js`: saved-line provenance, unavailable draft values, validation, session cleanup, focus and clean UI text.
- `public/dynamic-fields-ui.js`: reusable session/mode lifecycle notifications.
- `shared/product-fields.js`: apply effective option order to display-only metadata.
- `server/dynamic-fields.js`: deterministic option creation and canonical-order-aware native initialization.
- `tests/product-fields.test.js`: initial order assertions and native ordering/pricing compatibility regression.
- `tests/product-fields-review.browser.cjs`: ten new review regressions.
- `scripts/test-customer-release.js`: include the new suite and retain legacy-only suite selection.
- `docs/dynamic-fields-phase3-review.md`: findings and verification evidence.

No pricing calculator, product master schema, quotation workflow, PDF implementation, package dependency or environment configuration changed. No new migration is required; the schema remains **13**. Previously stored orders are retained rather than silently rewriting administrator data; new initialization is deterministic and explicit reordering applies consistently.

## Remaining limits and acceptance

- Production-data restoration and target-environment verification were not performed. Local tests do not authorize deployment.
- Browser coverage uses Chromium/Chrome at desktop/mobile viewport sizes; other engines, physical touch devices and screen readers remain untested.
- The existing PDF font/language limits and per-database company isolation model remain unchanged.
- Changes in other sessions appear on configuration revalidation, not through a new push channel. Stale writes remain version protected.
- Dedicated lint/type checking cannot be claimed; the available syntax, build and automated test checks are reported separately.

The existing [Phase 3 deployment and rollback guide](dynamic-fields-phase3.md) remains applicable. These review fixes are compatible with schema 13 and do not require a schema downgrade. An authorized application-only rollback to the previous schema-13 artifact would reintroduce the reviewed defects; preserve backups and prefer a forward fix. Production deployment, rollback and production data changes require separate authorization.

Final acceptance: **PASS for the reviewed local Phase 3 scope**. All requested product/field/quotation/pricing regression checks pass. No unresolved critical defect remains in this tested scope. The task-only database container was removed; the persistent app/database remained healthy and were not restarted or migrated.

Evidence: `test-results/product-fields-review-full-tests.log`, `product-fields-review-browser.json`, `product-fields-review-final-browser-summary.json`, `product-fields-review-targeted-browser.log`, original per-suite artifacts, `product-fields-review-build.log`, `product-fields-review-syntax.log` and the review baseline/changed-file inventory. Initial failures are retained in logs; final results use the corrected code and latest successful suite artifacts.
