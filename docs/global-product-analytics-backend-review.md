# Global Product Analytics backend review

Date: 2026-11-04. Scope: the Phase 1 product-performance backend, projection, calculations, migration and API integration. Existing customer/category/quotation work was preserved. No deployment, restart, or production data modification was performed.

## Outcome and refinement

**PASS for the reviewed source and isolated validation.** No incorrect totals, discount duplication, ownership bypass, or cross-company access was found in the exercised cases. The only runtime change improves filter-metadata query efficiency without changing the response contract, quotation calculations, authorization rules, or stored records.

Previously, the metadata query materialized every permitted quotation body and accumulated arrays of all historical labels to select their first element. It now materializes only quotation identifiers, ownership, customer identifiers and dates. `DISTINCT ON` selects the latest permitted product/category labels, and the latest customer/employee records are limited before reading their snapshot labels. Ordering includes a deterministic item-ID tie breaker. All metadata still comes from the authorized quotation history.

## Actual local records

A direct PostgreSQL **repeatable-read, read-only transaction** inspected the current local installation: schema **7**, **2 quotations**, **3 line items**. Names and identifiers were anonymized before copying the calculation/date/status/ownership data to the disposable database. No password, session, customer contact information or quotation text was exported. Source line quantities and subtotals agreed with their saved JSON snapshots.

The anonymized records were imported into an isolated schema-8 fixture and migrated to schema 9. The copy's quotation bodies, totals and versions remained unchanged by the analytics migration. Every projected line value matched an independent integer-arithmetic oracle, and four all-product/product-specific backend report comparisons matched the saved records. This was a focused record reconciliation, not a full schema-7 production backup/restore rehearsal.

| Local sample, 2026-10-24 | Product subtotal | Discount | Product value before GST | Separate charges before GST | GST | Saved grand total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Quotation 1, one line, quantity 15 | INR 3,350.00 | INR 335.00 | INR 3,015.00 | INR 230.00 | INR 584.10 | INR 3,829.10 |
| Quotation 2, two lines, quantity 200 | INR 1,100.00 | INR 0.00 | INR 1,100.00 | INR 0.00 | INR 198.00 | INR 1,298.00 |

October product analytics therefore reports **2 unique quotations, 3 lines, quantity 215, and INR 4,115.00 quoted product value**. The second quotation's individual line values are INR 500.00 and INR 600.00. Separate charges and GST are deliberately excluded from this product-value metric; combined saved document totals remain INR 5,127.10.

The running app remains schema 7 and does not acquire these source changes until a separately authorized release. Only its records were read.

## Independent calculation and security checks

New automated reconciliation reads the actual persisted quotation and line columns, left-joining the projection so missing projected rows cannot disappear from the test. It derives expected discounts, inclusive tax extraction and per-line allocations without calling the domain calculation helpers or using projected amounts as its oracle.

- **22 persisted quotations / 87 lines**, every saved grand total and projected line reconciled.
- **26 filter/scope combinations**: product, product category, customer, creating employee, status, month, year, date intersections, and own-only scope. Every returned monthly cell, overall distinct count, product/quotation count, line count, quantity and value is independently checked.
- **1,200 additional generated cases** compare individual line values and grand totals with an independent oracle across legacy/version-2 rounding, mixed tax treatments, fractional percentages, fixed discounts and inclusive/exclusive/exempt separate charges.
- Repeated products are counted once per quotation/product/month; overall quotation totals deduplicate across products. Discounts are allocated across the whole quotation before report filters.
- Verified fixed-discount penny allocation: INR 1.00 across product subtotals INR 200.00 and INR 100.00 allocates 67 and 33 paise. Filtering the first product returns **INR 199.33**, rather than reallocating the full discount.
- Verified category 12.34% rounding: line subtotals 101/118/99 paise, mixed exclusive/inclusive/exempt treatment, produce discount **39 paise**, product net values **89/87/87 paise**, charge net **100 paise**, GST **50 paise**, grand total **413 paise**.
- Catalog rename, recategorization, archival/removal and later customer-category discount configuration changes do not rewrite saved report amounts or quoted identities.
- Own-only metadata exposes only the employee's quoted products, product categories, customers, employees and years. Guessed IDs belonging to another owner return no data or labels. Explicit other-employee requests remain forbidden.
- Anonymous/permission-revoked requests, malformed/injection parameters, series/range limits, and foreign sessions across separate company databases remain covered.
- Schema-8 backfill failure/retry, transaction rollback on projection-write failure, and quotation deletion/cascades pass. Existing schema-7/8 customer migration regressions also pass in the complete suite.

An initial new fixture correctly received 403 because its employee category discount exceeded the configured employee limit. The fixture was corrected to use an authorized discount; the application authorization policy was retained.

## Database query analysis

PostgreSQL 17 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` was executed on all four actual report statements, plus the actual three aggregation/identity statements for selective product and category requests. No normal-installation query plan or data was modified.

Fixture: **3,001 quotations / 6,002 lines**, plus one rare-product quotation for selective checks. No full workspace/quotation loader is used. The endpoint still makes **four reporting statements** regardless of quotation count.

| Local warm execution | Before | After |
| --- | ---: | ---: |
| Metadata statement | 157.427 ms | approximately 56 ms |
| Metadata temporary blocks written | 1,537 | 0 |

Identity, monthly and total queries measured approximately 48/40/20 ms respectively in the captured run. Selective product/category statements measured below 1 ms each and used `quotation_items_product_quotation` / `quotation_item_analytics_category` in the actual endpoint plans. Existing date/owner/customer/status indexes remain intact; **no new migration or index was necessary**. Timing varies with load/cache and is not a production SLA.

## Final test results

| Check | Result |
| --- | --- |
| Complete unit/integration suite | **PASS: 420/420**, zero failures, skips or cancellations |
| Analytics unit/integration suite | **PASS: 14/14**, included above |
| Analytics browser regression | **PASS: 9/9**, including filters, modes, exact values, responsive/keyboard behavior and role restrictions |
| Syntax validation | **PASS: 125 JavaScript/CJS files** |
| Frontend build | **PASS: `npm run build`** |
| Whitespace check | **PASS: `git diff --check`** |
| Actual local-record reconciliation | **PASS: 2 quotations / 3 lines**, all projected amounts and saved grand totals |
| Dedicated lint/type checks | **NOT CONFIGURED**; this plain-JavaScript repository has no lint or type-check task |
| Full browser release suite / new Docker image build | **NOT RUN in this backend review**; targeted analytics browser and full automated regressions were run |

Automated tests used a separately named disposable PostgreSQL server at loopback port 55429. The full suite ran with current source mounted read-only into the existing local test image, including real PostgreSQL backup/restore clients. It does not certify a newly built release image. The intentionally injected projection failure logs `Request failed: Error` while its rollback assertions pass.

Ignored evidence: `test-results/product-analytics-review-full-suite.log`, `product-analytics-review-targeted.log`, `product-analytics-review-browser.log`, `product-analytics-review-query-plans-before.json`, `product-analytics-review-query-plans.json`, `product-analytics-review-selective-plans.json`, `product-analytics-review-reconciliation.json`, and `product-analytics-review-local-records-result.json`. Per-run timings in the JSON plans may vary slightly from the representative measurements above.

## Files changed in this review

1. `server/product-analytics.js`: narrow historical metadata CTE, bounded latest-record lookups, deterministic snapshot label selection.
2. `tests/product-analytics.test.js`: persisted-record independent oracle, own-metadata isolation, mixed-rounding coverage, and analysis of actual endpoint statements.
3. `docs/global-product-analytics-backend-review.md`: this report.

A review-start SHA-256 manifest confirms no unrelated source file changed during this review. No frontend, money engine, access-policy, database schema, dependency, or configuration change was needed. Earlier dirty workspace changes remain intact.

## Remaining risks and release limits

- Company separation is the application's existing **separate app/database** model. Shared-database multi-tenant isolation/RLS is not implemented or claimed.
- Legacy product categories are inferred from the catalog at migration time and marked `migration-current`; missing masters remain `unknown`. Original historical categories cannot be reconstructed when they were never saved.
- Metadata still examines the permitted quotation history. The existing workspace transaction convention serializes the read with application writes. Very large real datasets need staging measurements for query time, lock waits and startup backfill duration.
- Limits remain 50 product series, 60 months, 500 initial options and 20 displayed aliases. Quantities preserve saved units, including mixed units; they are not a common physical measure.
- This review checked all current local records, whose small size cannot establish production-scale performance. A full privately restored production backup, real traffic/concurrency load, and the matching release image remain release gates.
- Apply the already documented schema-9 backup/migration/rollback procedure only during an authorized release. This review introduces no additional migration. The running schema-7 installation was not upgraded or restarted.

**Acceptance: PASS for the scoped backend review; production deployment and production-scale certification remain unperformed.**
