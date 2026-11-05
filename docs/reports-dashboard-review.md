# Reports dashboard UI/UX and code review

Date: 2026-11-05. Scope: redesigned Reports view and reporting integration, including the user-approved GST-inclusive product value definition.

## Improvements

- Coalesce identical in-flight requests by user, mounted view and filter query. Explicit refresh and retry still request fresh results; stale responses cannot update a replacement view.
- Product-only filter submissions retain KPI cards, secondary charts and detailed reports, and avoid a summary request when global filters have not changed.
- Invalid product comparisons display a product-specific error without suppressing valid global reports or their CSV export.
- Legend changes reuse SVG series for grouped, line and area charts. The comparison scale and bar positions remain stable; stacked charts recalculate their stacks. Mode and legend changes retain the monthly table and expansion state, and do not replay entry animations.
- Preserve unchanged filter-option nodes rather than rebuilding up to 500 historical options on every response.
- Disambiguate duplicate product names with stable IDs in the chart and legend. Keep hidden-series labels readable instead of fading interactive text below adequate contrast.
- Associate focus/pointer tooltips with their triggering marks using aria-describedby; retain pre-existing descriptions and remove the temporary relationship on dismissal. Tooltips support Escape and pointer movement onto the tooltip.
- Make fallback fullscreen a labelled modal, isolate the background, exclude controls inside collapsed sections from its focus trap, and restore focus, button state and scrolling on exit.
- Expose horizontal-scrolling hints only when charts overflow, including both axes on narrow screens. Preserve existing teal/orange branding and navigation.
- Format monetary labels and product CSV decimals directly from integer paise, including the safe-integer boundary, to avoid a one-paise display loss.
- Remove the minimum visible width for zero-valued ranking bars, expose ranking contents as a group, and reuse the sharing date formatter.
- Apply the approved product-value definition: GST included after the quotation discount, with separate quotation delivery/other charges excluded. Retain inclusive GST once and allocate rounded exclusive GST with the canonical calculation engine. A rebuildable gross-value projection keeps aggregation in PostgreSQL.
- Supply the authoritative workspace timezone on the summary response and correct date presets at server calendar boundaries. Sharing months no longer depend on whether the product request has completed. Quotation pricing, saved totals and document output logic remain unchanged; the new shared reporting helper uses their existing discount/tax policy.

## Files changed by this review

1. `public/reports-dashboard.js` - request coordination, independent errors, sharing timezone, tooltip lifecycle and overflow observation.
2. `public/product-analytics.js` - coalesced product requests, incremental chart interactions, stable options, duplicate labels and fullscreen accessibility.
3. `public/reports-charts.js` - reusable SVG series groups, scrolling hints, zero-safe ranking semantics and sharing formatter reuse.
4. `public/reports-dashboard.css` - scroll hints, zero-width bars, tooltip pointer access and local animation suppression.
5. `public/product-analytics.css` - readable hidden-series labels.
6. `server/resources.js` - additive timezone field on the existing report summary response.
7. `server/openapi.js` - document that timezone field.
8. `tests/reports-dashboard.test.js` - timezone agreement and maximum-size chart/zero-value regression coverage.
9. `tests/reports-dashboard.browser.cjs` - eight additional browser checks, stronger CSV assertions, table/option identity, scrolling hints and tooltip descriptions.
10. `shared/domain.js` - add GST-inclusive per-product reporting values using canonical rounding and discount allocation.
11. `server/product-analytics.js` - aggregate GST-inclusive projected values and describe the approved definition.
12. `server/product-analytics-projection.js` - persist gross values atomically and backfill existing projections in bounded batches.
13. `server/store.js` - transactional schema 10 migration with downgrade protection.
14. `server/migrations/010-product-analytics-gst.sql` - additive gross-value column and check constraint.
15. `tests/product-analytics.test.js` - GST-inclusive oracle, historical migration, rollback, constraints and API expectations.
16. `tests/product-analytics.browser.cjs` - verify GST-inclusive charts, tables and labels.
17. `tests/phase1-api.test.js` - current schema-version expectation only.
18. `tests/phase2-api.test.js` - current schema-version expectation only.
19. `tests/phase3-api.test.js` - current schema-version expectation only.
20. `tests/access-whatsapp.test.js` - current schema-version expectation only.
21. `tests/phase1-migration-review.test.js` - current migration list/version expectations only.
22. `tests/customer-release-migration.test.js` - current schema-version expectation only.
23. `scripts/restore.js` - accept backups at the new schema version while retaining restoration safeguards.
24. `tests/phase5-api.test.js` - current schema-version expectation only.
25. `docs/reports-dashboard-review.md` - this report.

A SHA-256 baseline captured the already-dirty workspace before this review. Only the files above were changed by this review; earlier customer, category, quotation and analytics work was preserved. No dependencies or configuration were added. Schema 10 is the only new migration; it was applied only to disposable test databases.

## Verification

| Check | Result |
| --- | --- |
| Complete Node/PostgreSQL automated suite | PASS: 429 tests; 0 failures, cancellations or skips |
| Complete available browser/E2E suite | PASS: 296 checks across 24 suites; 0 failures/exceptions; final Reports/Product Analytics recheck: 30 checks across 2 suites |
| Reports browser suite | PASS: 21 checks on final source; no page exceptions |
| Product analytics browser suite | PASS: 9 checks on final source; no page exceptions |
| JavaScript syntax (`npm run check`) | PASS: 129 files |
| Frontend build (`npm run build`) | PASS |
| Whitespace validation (`git diff --check`) | PASS |
| Dedicated linter | NOT CONFIGURED: no lint script or lint configuration in this plain JavaScript project |
| Static type checking | NOT CONFIGURED: no TypeScript/checkJs project or type-check script |

Validation used a separate PostgreSQL 17 container with tmpfs storage on loopback port 55429. Each test suite created and removed its own database/application. The complete automated suite ran in the existing verification image with the current source mounted read-only. Browser suites ran against freshly built current assets in disposable local applications. This verifies source and built frontend assets; it is not a new production image or deployment validation.

### Accuracy and interaction evidence

- The Reports fixture contains 18 saved quotations, 37 line items, 6 products, 3 customers and 3 employees. Saved quotation value is INR 406,985.30 including GST; GST-inclusive product value is also INR 406,985.30 (this fixture has no separate quotation charges); the retained net projection is INR 344,902.80. Approved count is 3 and the approval rate is 16.7% (3/18).
- The independent product browser fixture quotes product A twice on one quotation (quantities 2 and 3) and product B once (quantity 1), each at INR 100 with one 10% quotation discount. After discount and 18% GST, January product values are A = INR 531, B = INR 106.20. A separate March quotation adds INR 118; total product value is INR 755.20, with February zero-filled. A occurs on two unique quotations despite three line items across those quotations.
- Every exported product CSV row is compared with its API cell, including IDs, unique count, line count, quantity and GST-inclusive discounted value. An independent saved-record oracle also reconciles mixed inclusive/exclusive/exempt lines, charges, both rounding policies, category/manual discounts and filtered aggregates. The property check covers 1,200 combinations without using domain helpers to derive expected tax. Global CSV filters match summary/product date, month and status filters.
- Request instrumentation verifies two simultaneous identical refreshes send one summary and one product request. A product-only metric change sends one product request and zero summary requests while retaining global report DOM nodes.
- The 50-product by 60-month synthetic stress fixture verifies a 3,000-cell table remains the same DOM node across legend interactions. Measured initial rendering was approximately 374 ms; a legend change was 41 ms on this machine (about 400 ms before SVG reuse). This is local fixture evidence, not a production latency guarantee.
- Browser coverage includes all four modes, all metrics, historical labels, stable colors, all eight existing detailed reports, sharing status truthfulness, authorization, own-report scope, invalid selections, independent endpoint failures/retries, empty periods, stale requests, native and fallback fullscreen, keyboard controls, tooltip dismissal and reduced motion.
- Responsive geometry and scroll hints pass at 1600, 1280, 1024, 768, 390 and 320 pixels. Desktop and mobile screenshots were visually inspected. Chart overflow is contained in keyboard-scrollable regions, preserving readable month labels rather than shrinking them into overlap.

The full browser matrix ran after the GST integration; the two Reports-related suites were then rerun after the final currency formatter/calendar-preset refinements. Other pages do not use these Reports chart renderers. Final focused results supersede the earlier Reports count of 20 in the full-matrix artifact.

Artifacts: `test-results/reports-review-full-tests.log`, `test-results/reports-review-all-browser-summary.json`, `test-results/reports-dashboard-browser.json`, `test-results/reports-review-desktop.png`, `test-results/reports-review-mobile.png`, and `test-results/reports-review-changes.json`.

## Migration and controlled rollout

- Migration 010 adds `quotation_item_analytics.gross_value` as BIGINT with a nonnegative check, backfills it in 50-quotation batches, then applies NOT NULL and records schema 10, all in the existing transaction.
- Existing quotation bodies, versions, totals, timestamps and line items remain byte-for-byte unchanged. Existing net values and category associations/provenance remain unchanged. Failed backfills roll back the new column and migration version. Repeated startup is idempotent.
- Disposable migration checks cover fresh databases, pre-analytics schema 8, schema 9, injected failure, repeat startup, and NULL/negative constraint rejection. The existing production-like customer/category migration regression also runs with schema 10.
- Before an authorized deployment: stop writes and old application instances, take a verified full database backup using the existing backup/pg_dump procedure, retain the previous application artifact, test restoring the backup into an isolated database, then start the new application so its normal startup migration runs. Check readiness at schema 10, reconcile sample reports with saved quotations, and smoke-test CSV/quotation creation before allowing writes.
- Rollback: do not start the old schema-9 server against schema 10; its downgrade guard rejects that database. While writes remain stopped, restore the verified pre-upgrade backup into a separate database and point the retained prior artifact at that restored database. Validate readiness and records before reopening writes. If writes occurred after upgrade, preserve the current database and reconcile them before any restore; restoring an old backup alone would lose those writes. No destructive down migration is supplied or executed.
- The `quotedValue` API field now intentionally includes GST after discounts; client integrations must use the returned definition and updated labels. Historical quotation documents are unchanged. Earlier phase reports describe the previous, superseded net reporting definition.

## Remaining limits

- Schema 10 backfills historical reporting rows inside the startup transaction and holds schema locks. Measure migration time on a restored production-sized copy and use a maintenance window before any authorized rollout. No production-sized migration duration is claimed.
- The legacy summary endpoint still hydrates matching quotations for its existing detailed reports. Very large global cohorts may remain slower than the database-aggregated product endpoint; eliminating redundant requests reduces this cost without changing the legacy reporting contract.
- Validation used Chromium and automated keyboard/ARIA checks. Dedicated screen-reader testing and other browser engines were not run.
- Dense charts retain the existing 50-product/60-month limits and horizontal scrolling. The exact-value table and CSV remain available for large comparisons.
- No production data was read or modified for this review. No persistent application/database restart, production migration or deployment was performed. Disposable databases alone were migrated.

## Acceptance

PASS for this scoped local review: the approved GST-inclusive metric, scoped UI fixes, historical backfill, backup/restore compatibility, automated tests, complete available browser matrix, final focused UI recheck, syntax validation and frontend build all pass. No unresolved test failures remain. Dedicated lint/type tooling is not configured; screen-reader, other-engine and production-volume validation remain outside the executed checks. No production deployment is implied.

- [x] Existing branding and navigation preserved.
- [x] Monthly/product counts, quantities and GST-inclusive values reconcile with saved records.
- [x] Global/product filters and exports remain synchronized without duplicate in-flight requests.
- [x] Empty/loading/error/retry states, stale requests and role scopes verified.
- [x] Responsive overflow, keyboard/tooltips/fullscreen, reduced motion and large comparisons verified.
- [x] Existing eight detailed reports and unrelated page regressions pass.
- [x] Reporting migration preserves historical business records and rolls back atomically on failure.
- [x] Backup/restore accepts schema 10; controlled deployment and rollback documented.
- [x] No production deployment or production data mutation performed.
