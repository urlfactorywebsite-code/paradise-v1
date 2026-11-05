# Reports dashboard Phase 3: production hardening QA

Date: 2026-11-05. Scope: Reports/analytics queries, CSV delivery and associated regression tests. The approved product metric remains **including GST after discounts**, excluding separate quotation delivery and other charges. Overall quotation KPIs include saved GST and all quotation charges.

## Status

The complete automated suite passes: 438 tests, zero failures/skips. The complete browser matrix also passes: 301 checks across 24 suites, with zero failed checks or page exceptions. Final authorization-order verification also passes. No production deployment or production data change has been performed.

## Findings and fixes

1. **Summary N+1 reads removed.** The legacy summary hydrated every quotation, its items and its history. It now aggregates counts, values, unique-product frequency, quantities and current monthly statuses in PostgreSQL. Grouping sets produce the five existing breakdowns in one query. Only the latest quoted product/employee names and relevant customer labels are read; complete private snapshots and history are not returned.
2. **Reports no longer hold the workspace mutation lock.** Summary, product analytics and CSV use a separate read-only repeatable-read transaction. Multiple queries see one coherent committed snapshot while quotation/customer writes can continue. Existing write transaction behavior is unchanged. Tests verify both database read-only enforcement and a concurrent write during a report.
3. **CSV no longer loads summary groups or full quotations.** One scoped query selects the existing CSV columns, item counts and saved grand totals. Integer paise are formatted exactly. Formula escaping, UTF-8 BOM, CRLF, column order and export audit events are preserved. This also keeps expired-report/CSV amounts aligned with saved totals rather than recalculating historical documents with current defaults.
4. **Explicit CSV bounds.** Exports above 50,000 quotations return 422 with instructions to narrow filters. They never silently truncate. The Reports button shows busy state, prevents duplicate downloads, discards stale responses after global filter changes, and handles validation errors without marking the backend connection offline. The existing 20-second request convention is retained.
5. **Report filters fail closed.** Unsupported, empty and duplicate parameters are rejected for summary/CSV; reversed amount bounds are rejected. Both endpoints share the same filter builder and role scope. Product/category controls remain local to the product chart; date/year/month/customer/employee/status controls are global. Listing endpoints retain their original behavior.
6. **Same-day name consistency.** Summary, product series and filter labels resolve the latest quoted snapshot using quotation date and number, with stable identity tie-breakers. Renamed/archived/deleted products continue using saved names and IDs.
7. **WhatsApp behavior preserved.** No WhatsApp implementation files changed. Prepared, Manually Confirmed and Failed retain their existing meaning; there is no delivery/read claim. Database fingerprints confirm report/CSV reads do not change attempts, messages, PDFs or statuses. Standalone history retains all permitted attempts and Details/Retry controls independently of Reports filters.

## Performance evidence

Measurements are disposable local fixtures, not production latency guarantees.

| Same 3,001 quotations / 6,002 lines | Before | After |
| --- | ---: | ---: |
| Summary request database queries, including authentication | 9,014 | 10 |
| Quotation hydrations | 3,001 | 0 |
| Summary elapsed time, one measured run | 5,585 ms | 82 ms |
| Saved quotation value | INR 708,236.00 | INR 708,236.00 |

The endpoint itself uses eight summary statements (seven when document-sharing IDs are not permitted). CSV uses one report query plus its existing authentication/audit work. Query counts do not grow with quotation count. `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` was captured for every summary/export statement on the 3,001-document fixture. Existing date, owner/date, customer/date, product/quotation and category indexes suffice; no speculative index or migration was added. Full-cohort scans in these plans are expected when nearly all fixture rows match.

A separate 50,001-quotation fixture verifies exact totals of INR 5,900,118.00, counts and quantities, explicit oversized-CSV refusal and a successful narrower monthly export. The recorded elapsed time for these requests is in `test-results/reports-phase3-high-volume.json`; fixture insertion is excluded from that request timing. Existing product-performance tests also validate database-side aggregation and selective index plans on large line-item datasets.

## Calculation and source reconciliation

The new integration corpus compares each summary group and CSV row against stored quotation columns, and checks product cells against independently worked examples:

- January: product A is repeated on two lines, quantities 2 and 3 at INR 100, with one 10% discount and 18% exclusive GST: INR 531.00. Product B is INR 118 with GST included; after the same discount it reports INR 106.20, with no second GST addition. Product total is INR 637.20. Separate delivery of INR 10 plus GST contributes INR 11.80 only to the quotation KPI, making INR 649.00.
- February: an employee quotation contains A at INR 118 including GST and two exempt C units totaling INR 198, giving INR 316.00. A separate expired quotation with a 50% discount reports INR 59.00.
- The 2026 cohort has 3 quotations, saved grand value INR 1,024.00, product value INR 1,012.20, 2 customers, 1 customer-approved quotation and approval rate 33.3%. A appears on 3 unique quotations, 4 lines and 7 units. Missing months remain zero.
- Tests cover inclusive date boundaries/leap day, current status, customer, immutable employee ownership, product/category intersections, year/month intersections and empty cohorts. Existing independent money-oracle tests cover 1,200 rounding/tax/discount combinations and all historical projection migration checks.

## Verification results

| Check | Result |
| --- | --- |
| Complete Node/PostgreSQL automated suite | PASS: 438 tests; zero failures, cancellations or skips |
| New backend hardening cases | PASS: source reconciliation, filters, RBAC, separate-company isolation, read concurrency, WhatsApp invariance, bounded queries, 50,001 documents, safe money and same-day names |
| Complete available browser/E2E matrix | PASS: 301 checks across 24 suites; zero failed checks or page exceptions |
| Reports browser checks | PASS: 25 checks |
| Product analytics browser checks | PASS: 9 checks |
| Responsive layout | PASS: 1600, 1280, 1024, 768, 390 and 320 pixel widths |
| Reduced motion, chart modes, keyboard/tooltips/fullscreen | PASS |
| Loading, endpoint errors/retry, empty results and stale responses | PASS |
| Browser console | Zero unexpected console errors and page exceptions in Reports; intentional 401/422/503 request failures are separately recorded |
| Syntax (`npm run check`) | PASS: 130 JavaScript files |
| Build (`npm run build`) | PASS |
| Whitespace (`git diff --check`) | PASS |
| Dedicated lint/static typing | NOT CONFIGURED in this plain JavaScript repository |
| Production image/target deployment validation | NOT RUN; not authorized |

Validation used an isolated PostgreSQL 17 tmpfs container bound to loopback port 55429, with generated databases per suite. The complete automated suite used the existing verification image with current source mounted read-only; browser tests used freshly built assets against disposable local applications. The persistent application/database were not restarted or migrated.

## Files modified in Phase 3

- `server/database.js`: add read-only repeatable-read transactions; retain the writer transaction.
- `server/queries.js`: database summary aggregation, narrow CSV query, safe amount formatting, parameter checks and export bounds.
- `server/resources.js`: route CSV directly to its scoped query; retain export audit.
- `server/product-analytics.js`: use read-only transactions and consistent snapshot-label ordering.
- `server/openapi.js`: document accepted report parameters, snapshot behavior and CSV bounds.
- `public/reports-dashboard.js`: scoped export busy/error/duplicate/stale-response handling.
- `tests/reports-dashboard.browser.cjs`: export interactions, unchanged standalone sharing history and explicit console capture.
- `tests/reports-hardening.test.js`: nine new endpoint/concurrency/volume/security/reconciliation cases.
- `docs/reports-dashboard-phase3-qa.md`: this report and release guidance.

A start-of-phase SHA-256 manifest distinguishes these changes from earlier dirty work. No unrelated page implementation, pricing calculation, quotation write workflow, authentication, WhatsApp workflow, dependency or configuration was changed. Existing tests for those areas are included in the regression run. Phase 3 introduces **no database migration**; the previously prepared schema-10 GST reporting projection remains required.

## Deployment checklist (not executed)

- [ ] Obtain explicit production deployment authorization.
- [ ] Review the isolated Phase 3 diff and all earlier uncommitted work intended for the release; do not stage/reset the entire dirty workspace blindly.
- [ ] Identify the target's current schema/application artifact and retain a tested rollback artifact. Phase 3 expects the existing schema-10 projection; older targets also require the earlier migrations.
- [ ] Follow the existing backup procedure and verify restoration into a separately named staging database. Use `npm run backup` in the approved target environment; existing restore usage is `npm run restore -- <backup.dump> <new_database_name>`. Never overwrite the live database for a restore test.
- [ ] Build the release artifact and test it against the restored copy, including startup/migration duration when upgrading from an older schema, actual data volume, host resource limits and expected concurrent usage.
- [ ] Confirm each company uses its intended separate database, correct origin/cookie settings and authorized accounts. Tenant selection by report parameters is rejected; this is not a row-level multi-tenant database model.
- [ ] Smoke-test summary/product/CSV totals, all global filters, own/all/report-only roles, WhatsApp history and quotation creation on staging. Confirm users can narrow CSV exports above 50,000 rows.
- [ ] During the authorized release, stop old writers if earlier schema migrations are needed, take the final backup, start the new artifact through the existing deployment process, and confirm `/api/ready` at schema 10.
- [ ] Reconcile representative reports and downloads against saved records, verify history/quotation edits, monitor existing request-error logs and database latency, then reopen writes.

## Rollback instructions (not executed)

Phase 3 has no schema changes. To roll back only these performance/export changes, stop/revert the application to the retained pre-Phase-3 schema-10 artifact and rebuild/serve its matching frontend assets. The database and schema-10 reporting values can remain; no destructive data operation is needed. That artifact restores the prior CSV parameter/size behavior and lock-based reporting reads.

If the rollout also applies earlier schema-10 or customer/category migrations, an older schema-9-or-earlier artifact must not be pointed at a newer database: its downgrade guard rejects it. Keep writes stopped, restore the verified pre-upgrade backup into a separate database, point the matching retained artifact at that restored database, validate readiness/data and then resume traffic. Preserve and reconcile any post-upgrade writes before considering restoration; an old backup alone would lose those writes. Do not drop the live schema or manually alter migration versions.

## Outstanding risks and limits

- No target production image, production-sized restored dataset, production load test or deployment was executed. Local 50,001-quotation evidence does not establish a universal latency/capacity guarantee.
- Very large sharing histories retain the existing sequential paginated fetch/caching convention to preserve the standalone report. They may take longer to load than the optimized summary/product aggregates; scope a separate change if real deployment measurements justify it.
- Summary responses still include authorized sharing-cohort IDs and existing detailed-report rows; payload size grows with that cohort. Narrow date filters for extremely large histories.
- CSV remains a bounded in-memory download, not a background export job. Large or slow-network downloads may require narrower filters within the 20-second client timeout.
- Dedicated screen-reader testing, other browser engines and a dedicated linter/type-checker were not available/run. Automated keyboard/ARIA, hostile-label escaping and reduced-motion checks pass in Chromium.
- The existing separate-database company isolation model must be correctly configured operationally. This phase does not introduce a client-selected tenant or shared-database tenant router.

## Acceptance

**Local Phase 3 acceptance: PASS.** All critical implemented calculation, filtering, export, role/isolation, concurrency, volume and UI checks pass; no automated failures remain. Production deployment approval and target-environment verification are separate gates. Do not mark an untested target deployment production-ready before completing that checklist.

- [x] KPI/chart values and monthly product totals reconcile with saved records.
- [x] Global date/customer/employee/status filters synchronize; product/category controls retain their documented chart scope.
- [x] CSV totals/escaping/limits, busy state, duplicate prevention and stale-response handling verified.
- [x] WhatsApp records, manual-sharing semantics and standalone history preserved.
- [x] Reports authorization, own/all scope and separate-company isolation verified.
- [x] Constant-query aggregation, read-only snapshots and concurrent writers verified.
- [x] 50,001-quotation volume, SQL plans and overflow bounds verified.
- [x] Responsive, loading/error/empty, keyboard and reduced-motion checks pass; desktop/mobile screenshots inspected.
- [x] No unrelated source changes or production deployment/data mutation.
- [ ] Target production artifact/restored-volume smoke test and explicit deployment authorization (not executed).

Artifacts: `test-results/reports-phase3-baseline.json`, `reports-phase3-summary-baseline.json`, `reports-phase3-summary-optimized.json`, `reports-phase3-query-performance.json`, `reports-phase3-query-plans.json`, `reports-phase3-high-volume.json`, `reports-phase3-full-tests.log`, `reports-phase3-all-browser-summary.json`, `reports-phase3-changes.json`, `reports-phase3-desktop.png`, and `reports-phase3-mobile.png` under `test-results/`.
