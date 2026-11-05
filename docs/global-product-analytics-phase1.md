# Global Product Analytics - Phase 1

Date: 2026-11-04. Scope: analytics in the existing Reports page. No normal installation was restarted, no production data was modified, and nothing was deployed or committed.

## Completed features

Open **Reports -> Global Product Performance**. The new chart supports inclusive quotation-date range, year, month, product, product category, customer, creating employee and quotation-status filters. **All Products** selects all matching quoted products; uncheck it for multiple product selection/comparison.

Choose unique quotation frequency, saved quantity or quoted product value, displayed as grouped bars, stacked bars, multiple lines or area. Backend aggregates drive the chart and accessible monthly table, including zero months. SVG uses local code and existing styling; no chart library/dependency was added. Quoted names/aliases survive renames, archival and removal of catalog records. Chart labels prefer quoted names within the filtered period; a zero-data selection falls back to its known quoted identity, so a later rename does not relabel an earlier report. Missing months/IDs do not create fictitious quotations or names.

The existing quotation summary and CSV remain separate. Its button explicitly identifies the quotation-summary export. Pricing, tax policy, quotation workflow, customer/category management and unrelated screens are unchanged.

## Calculation definitions

| Field | Definition |
| --- | --- |
| `quotationCount` | Distinct quotation IDs per product/month; repeated lines of one product in a quotation count once. The overall count also deduplicates across selected products. |
| `productQuotationCount` | Distinct quotation/product pairs. A quotation containing several products contributes to several series, so stacked frequency heights can exceed overall unique quotations. |
| `lineItemCount` | Persisted matching lines, including repeated products; returned separately from quotation frequency. |
| `quantity` | Sum of stored line quantities. Mixed product units are not converted to a common physical unit or area. |
| `quotedValue` | Integer paise after the one canonical quotation discount and before GST, including line options/charges/authorized overrides; excludes separate quotation delivery/other charges. |
| Inclusive tax | Removed using the existing inclusive-net helper and saved legacy/version-2 calculation policy. Group rounding uses the existing largest-remainder allocator. Inclusive quotation charges participate in group rounding but are not attributed to products. |
| Filtering/discounts | Discount allocation occurs across **all** quotation items before product/category filtering. A filtered product never receives the entire quotation discount. Category/manual replacement follows the existing engine; no second discount is added. |
| Dates | Stored quotation `date`, inclusive endpoints and calendar months. Creation timestamps are not converted to reporting dates. Default year follows existing workspace timezone (`TZ`, otherwise Asia/Kolkata). |

`DP.itemQuotedValues()` reuses canonical totals, discount allocation, inclusive-net extraction and rounding. `DP.totals()` output and stored quotation totals are unchanged. Backfill uses saved amounts and existing legacy fallbacks, never current catalog rates.

Example: January has Product A lines for 3 x INR 100 and 2 x INR 100, plus Product B at INR 50. A 10% quotation discount yields **A 450.00, B 45.00**, before GST. A's frequency is **1 quotation, 2 lines, 5 quantity**. February adds A 100.00 and B 200.00. Overall: **2 unique quotations, 5 lines, 11 quantity, 795.00 before GST, 4 product/quotation pairs**. Missing March is zero.

## API

`GET /api/reports/product-performance`

| Parameters | Behavior |
| --- | --- |
| `from`, `to` | ISO dates, inclusive. With neither, use the chosen/current calendar year. A single bound supplies its calendar year for the missing bound unless year is supplied. Reversed/invalid dates are rejected. |
| `year`, `month` | Optional year 1000-9999 and month 1-12; intersect date bounds. Conflicting filters yield no matching periods/data. |
| `productIds`, `categoryIds` | Comma-separated or repeated stable IDs, maximum 50 each; omitted means all permitted matches. Categories are **product** categories. |
| `customerId`, `employeeId` | Customer ID and creating/owning employee ID (`owner_id`), not free-text salesperson. |
| `status` | An existing workflow status. Omission includes all statuses, including Draft/Cancelled; these are quoted values, not recognized revenue. |
| `metric` | `quotationCount` (default), `quantity`, `quotedValue`. |
| `grouping` | `month` only in Phase 1. |

Returns monthly `periods`; product IDs, quoted labels and aliases; selected-metric `series`; `monthly` cells containing all metrics, line counts and actual names for each month; overall `totals`; `appliedFilters`; scoped filter `options`; scope/timezone/currency/paise metadata, definitions and limits. An explicitly selected historical product can show zero values for an empty year. Unknown/inaccessible IDs receive no invented label or data. Pickers use permitted quotation history, without presenting unquoted catalog records as quoted products.

Limits: **60 calendar months, 50 product series**, 500 initial historical options per picker, 20 displayed product aliases. Truncation is explicit, and active selections survive metadata refreshes. The API accepts known authorized IDs beyond the initial picker list within its ID/series limits. It is not an unlimited catalog-search interface.

Excess chart series return 422 `PRODUCT_SERIES_LIMIT` with **authorized filter options**, allowing users to narrow the report. Monetary data is not silently truncated to top-N products. Invalid/unknown parameters, duplicate scalar parameters, bad IDs/dates/status/metric/grouping and excessive ranges/lists return 422. Aggregate amounts outside safe integer range require narrower filters. See OpenAPI for parameter documentation.

The normal endpoint uses **four fixed reporting queries**: identities, monthly SQL groups, overall totals, scoped metadata. It never calls `store.get()`/`store.readState()` per quotation, returns raw quotation bodies or performs browser quotation aggregation. Output is bounded to at most 3,000 product/month cells. Existing transactional consistency and no-store JSON behavior are retained; no extra cache/service is introduced.

## Authorization, security and isolation

- Existing `reports.view_all` / `reports.view_own` and Reports navigation govern access. Own-report data **and all pickers** constrain `owner_id=user.id`. Another employee ID is rejected for own-only access (403).
- Report labels come from permitted snapshots, without contact profiles, notes, credentials, master prices or internal quotation fields. IDs/predicates are bound SQL parameters. HTML/SVG/table/option text is escaped; hostile names render literally.
- Company isolation remains the existing **separate app/database** model. Foreign sessions cannot cross company databases; client `tenant_id` parameters cannot change scope. Shared-database tenancy/RLS is not introduced.
- User/DOM/request guards suppress late responses after navigation/account changes. Newer form edits are preserved until applied, rather than being discarded when a prior request completes. Failures are recoverable.

## Migration and projection

**009-product-analytics.sql -> schema 9** adds the rebuildable `quotation_item_analytics` table: composite FK to the actual quotation line, cascading deletion, nullable category ID/name/provenance and nonnegative BIGINT net value. Customer/product/quotation bodies, IDs, row versions, credentials, saved document totals and workflow are not rewritten.

The shared engine calculates projected amounts **within the existing quotation-write transaction**. A projection failure rolls back the quote, revision and audit. Discount edits update amounts; removed lines/quotations cascade their projections. Existing category identity remains on metadata edits. New lines snapshot the product category available when saved; master edits alone do not rewrite history.

Startup backfills older history in keyset batches of 50 quotations, fetching each batch's lines together. DDL, backfill and schema marker share the existing transaction/advisory lock. Failed backfill rolls back to schema 8; repeated/concurrent startup skips an applied migration.

**Legacy category limitation:** older line snapshots lacked category identity. Where a catalog record remains, backfill records its real category **at migration time**, marked `migration-current`; it does not reconstruct the original category. Missing mappings remain null/`unknown`. Counts and a UI notice disclose these cases. Product names still come from quoted snapshots; missing names/categories/prices are not invented.

Two indexes match actual filters: `quotation_items(product_id, quotation_id)` and `quotation_item_analytics(category_id, quotation_id)`. Existing quotation date/owner/customer/status indexes remain. The larger-data test confirms PostgreSQL uses both new indexes for selective filters. Normal full PostgreSQL backups include the projection; the restore tool now accepts schema 9 as well as schemas 3-8.

## Verification

| Check | Result |
| --- | --- |
| Complete unit/integration suite | **PASS - 417/417**, zero failures/skips; includes the existing 406 regressions and 11 new analytics tests |
| Complete browser release/regression run | **PASS - 276 checks across 23 suites**; all child processes exit 0, zero reported JavaScript exceptions |
| New analytics UI suite | **PASS - 9 checks**, included above |
| Bundled-image integration | **PASS - 69/69**, including 11 analytics cases and 58 existing customer/category/quotation/migration checks; application source not mounted |
| Built-image HTTP smoke | **PASS**: schema 9, protected endpoint, bundled UI assets, canonical 26298-paise net value, zero months, invalid-ID rejection and saved quotation PDF |
| Syntax | **PASS - 125 JS/CJS files**, `npm run check` |
| Frontend/Docker builds | **PASS**, `npm run build` and final Docker build exit 0 |
| Whitespace | **PASS**, `git diff --check` |
| Dedicated lint/type checks | **NOT CONFIGURED** in this plain-JavaScript repository; syntax is not represented as lint/type checking |

Local image: `paradise-product-analytics:20261104`, identifier `sha256:e0156059c520c5f22848af7e635496a49e539619597bf92d370d38e12ecfd5d2`. This image was not pushed or deployed.


The large fixture has **3,001 quotations / 6,002 lines**, tests four reporting queries, no full-quotation/workspace reads, correct sums/counts/months and actual product/category index use. Exact local timing is in `test-results/product-analytics-performance.json`; it is not a production load SLA. Money tests additionally exercise 400 generated legacy/version-2 conservation cases.

Coverage includes repeated products, multiple months/customers/employees/statuses, leap/inclusive boundaries and year crossover, zero data, renamed/archived/deleted/missing-master products, category/manual/fixed/percentage/100% discounts, malformed/injection filters, authorization/metadata/foreign-company isolation, atomic write failure, projection cascade, backfill failure/retry/idempotence and series-limit recovery.

Browser checks cover every chart mode/metric/filter, native multi-select, safe hostile names, exact table values, keyboard access and widths **1440/1024/768/390/320**, retry, late responses, own/no-report roles, limit recovery and in-flight filter edits. The shared dropdown engine is unchanged: its old regression assertion now correctly excludes intentional native multiple selects from the **single-select** assertion.

Evidence: ignored `test-results/product-analytics-*` logs, consolidated browser JSON, performance/index JSON and desktop/mobile PNGs. Old migration tests update only their expected current schema and future-version sentinel, preserving their original rollback/data assertions. Initial failures were test scope/selector/session-reload assumptions; all final outcomes are recorded above. A canceled disposable browser request may log ECONNRESET during teardown; the consolidated result records each child process exit and UI exception count.

## Files changed

```text
docs/global-product-analytics-phase1.md
public/index.html
public/product-analytics.css
public/product-analytics.js
scripts/restore.js
scripts/test-customer-release.js
server/migrations/009-product-analytics.sql
server/openapi.js
server/product-analytics-projection.js
server/product-analytics.js
server/resources.js
server/store.js
shared/domain.js
tests/access-whatsapp.test.js
tests/browser-ui.cjs
tests/customer-release-migration.test.js
tests/phase1-api.test.js
tests/phase1-migration-review.test.js
tests/phase2-api.test.js
tests/phase3-api.test.js
tests/phase5-api.test.js
tests/product-analytics.browser.cjs
tests/product-analytics.test.js
```

Earlier dirty customer/category/quotation work is preserved. A phase-start SHA-256 manifest verifies unrelated source files stayed unchanged. No reset, Git staging, commit or publishing was performed.

## Release and rollback guidance

All validation uses generated synthetic databases in a separately named disposable PostgreSQL 17 server at loopback 55429. The normal app/database containers remain unchanged. No production migration or deployment was performed.

Before an authorized release, take a verified private full backup, restore it to **isolated staging**, time the schema-9 backfill and compare source row/body/version/total fingerprints, representative reports, permissions and legacy category provenance. Backfill holds the startup write lock; plan cutover from measured real-data staging results. Deploy matching frontend/backend and reload clients. No new environment variable, storage provider, chart service or dependency is required.

For rollback, quiesce writes, preserve the current dump/database and inventory post-backup writes. Restore the verified **pre-release schema-8** backup into a separate unused database and verify it with the matching prior image before an approved traffic switch/reconciliation. Do not blindly drop projection tables in production. The prior binary refuses schema 9. The existing customer release runbook documents backup/restore commands; its schema-8-specific images/counts are historical, while this phase uses schema 9.

**Phase 1 acceptance: PASS for the reviewed source, isolated tests and built image. Production deployment/data validation is not performed or authorized.** Features beyond Phase 1 are not implemented. Validate a restored real backup and the documented category/limit semantics before an approved release.
