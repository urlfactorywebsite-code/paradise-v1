# Reports Dashboard final readiness review

Review date: 2026-11-05. Scope: the Reports redesign and its reporting integration. Production deployment and production database changes were **not performed**. Validation used generated databases in an isolated PostgreSQL 17 tmpfs container; the persistent application and database were left running untouched.

## Release decision

**PASS for the locally verified release artifact and available automated acceptance checks.** No additional runtime defect was reproduced during this final review. Production rollout remains gated on authorization, backup restoration, and validation against the intended target and its data. This report does not certify target capacity or record an actual deployment.

## Critical requirement matrix

| Requirement | Result | Evidence / limits |
| --- | --- | --- |
| Real data only | PASS | Reports read authenticated reporting APIs. New test starts without demo data, verifies zero values, creates a saved quotation, checks its actual amounts, deletes it, and verifies zero again. No browser quotation aggregation or synthetic production fallback. |
| KPI and monthly chart calculations | PASS | Source-record reconciliation covers all summary breakdowns, monthly cells, counts, quantities, approval rates and distinct customers. Saved quotation grand totals drive overall value. |
| Product frequency and quantity | PASS | Repeated product lines count once per quotation for frequency, separately for line count, and sum their saved quantities. Stable IDs, zero months and archived/renamed snapshots are tested. Mixed units are explicitly not converted. |
| Discount and GST reliability | PASS | Integer-paise canonical allocation; one quotation discount, inclusive/exclusive/exempt GST, historical policies and rounding are tested. Product value includes GST after discounts, excluding separate quotation charges. |
| Historical values | PASS | Saved reporting projections and snapshot names remain stable after current product pricing or configuration changes; report reads do not rewrite quotations. |
| Database query design | PASS | Database aggregation, bounded product/month series, parameter binding and read-only repeatable-read transactions. Fresh query analysis: eight summary statements, one CSV statement, zero quotation hydrations on 3,001 quotations / 6,002 lines. |
| High-volume behavior | PASS | Fresh 50,001-quotation fixture reconciles 590,011,800 paise; oversized CSV returns actionable 422 without partial download. These local fixtures are not target load guarantees. |
| Global filter consistency | PASS | Date/year/month/customer/employee/status scope summary, product analytics and quotation CSV consistently. Product/category comparison controls intentionally scope only the product chart/export. Invalid, unsupported, empty or duplicate parameters fail closed. |
| Chart integration and modes | PASS | Grouped/stacked bars, multi-line and area modes use backend cells; stable colors, accessible legends, exact data tables and tooltips are tested. |
| CSV exports | PASS | Filtered saved values, stable product IDs, zero-filled product months, formula protection and quotation CSV formatting verified. Busy/duplicate/stale/error behavior tested. Quotation export limit is 50,000 rows. |
| Responsive layout | PASS | Browser assertions at 1600, 1280, 1024, 768, 390 and 320 pixels. Desktop packaged-image screenshot also inspected. Scrollable charts retain data tables and visible scrolling guidance. |
| Animation and accessibility | PASS | Reduced-motion CSS, keyboard legend/tooltips, fullscreen focus restoration/modal fallback, loading/error/retry/empty states and retained DOM verified. Maximum 50-product / 60-month chart interaction tested. Manual assistive-technology certification was not performed. |
| Request lifecycle | PASS | Identical requests coalesce; chart-only controls avoid summary reload; late responses cannot overwrite newer filters or another page. No unexpected Reports console errors or page exceptions. Deliberate 422/503 failures are recorded as error-state tests. |
| Backend authorization | PASS | Own/all/report-only/no-report roles, authentication before filter parsing, immutable ownership scope and export permissions tested. Sidebar/route access follows existing permissions. |
| Company isolation | PASS | Separate application/company databases are the existing tenancy boundary. Cross-instance sessions and foreign customer IDs cannot retrieve another company's report. Client-selected tenant parameters are rejected. This is not a shared-database row-level tenancy implementation. |
| Quotation creation and editing | PASS | Complete quotation API/editor/regression suites, packaged-image create/edit/PDF checks, saved total reconciliation. Reporting reads do not modify quotation versions or histories. |
| Customer management | PASS | Complete customer/category/address regression suites plus packaged-image customer creation and independent contact-phone editing. |
| Pricing configuration | PASS | Complete pricing suites; packaged image changes the current unit price from INR 100 to INR 200, calculates 20,000 subtotal + 3,600 GST = 23,600 paise, and retains the old report value. |
| WhatsApp sharing | PASS | Existing history/details/retry and Prepared/Manually Confirmed/Failed semantics retained. Regression tests fingerprint unchanged records; packaged image prepares a manual share without changing quotation totals. No automated delivery/read guarantee is introduced. |
| Production artifact | PASS | Fresh Dockerfile build with production dependencies and non-root `node` user. Full automated tests run inside that image, without source mounts. Its browser assets match the host build by SHA-256. |
| Unrelated changes during final review | PASS | Start/end SHA-256 inventory restricts this turn's repository changes to the Reports browser test and this document. Existing dirty work was preserved. No business workflow, dependency or migration was changed in this turn. |

## Executed checks

| Check | Result |
| --- | --- |
| Complete Node/PostgreSQL suite in fresh production image | PASS: 438 tests, zero failures/cancellations/skips |
| Complete available browser/E2E matrix | PASS: 302 checks across 24 suites, zero failed checks or page exceptions |
| Reports browser suite | PASS: 26 checks, including the new empty/create/refresh/delete source-data regression |
| Product analytics browser suite | PASS: 9 checks |
| Packaged-image smoke checks | PASS: readiness/schema, empty workspace, saved totals/chart/CSV, quotation/customer/pricing edits, PDF/manual sharing; five checks, zero page exceptions |
| JavaScript syntax (`npm run check`) | PASS: 130 files |
| Asset build (`npm run build`) | PASS |
| Production Docker build | PASS: `paradise-reports-final:20261105` |
| Whitespace (`git diff --check`) | PASS |
| Dedicated lint/static typing | NOT CONFIGURED: plain JavaScript repository has no lint/typecheck scripts or toolchain; syntax checks are not represented as static type analysis |
| Target environment / restored production data / production load | NOT RUN |

The full suite ran with `node --test --test-concurrency=2 tests/*.test.js` inside the newly built image. Only tests and output directories were mounted; server/shared/public/scripts came from the image. Browser validation used `node scripts/test-customer-release.js --all` against disposable local applications and freshly built assets. Packaged-image browser smoke used an independently started container with another generated database.

Verified local image: `paradise-reports-final:20261105`, image ID `sha256:262658cdc6774069d192a3045412730a8ed010bdf01021b423d8c1194cd44ddb`. Disposable application/database containers and their dedicated network were removed after validation. The original `paradise-app-1` and `paradise-db-1` remained healthy; the candidate image is retained locally and has not been deployed to the persistent installation.

Fresh SQL evidence: the 3,001-quotation summary/export measurement took 174 ms in one run, with eight summary queries, one CSV query and no hydrations. PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans were regenerated by the suite. The 50,001-quotation test's measured reporting requests took 4,845 ms. These are single local fixture observations, not service-level targets.

Calculation independently checked against saved records and packaged browser output: two lines for the same product, quantities 2 + 3 at INR 100, one 10% discount and 18% exclusive GST give `(500 - 50) + 81 = INR 531.00`. Frequency is one quotation, two lines, quantity five. INR 10 delivery plus its INR 1.80 GST makes the quotation KPI INR 542.80. Product CSV shows INR 531.00. Raising today's product price does not change these saved values.

Evidence is retained under `test-results/`: `reports-final-full-tests.log`, `reports-final-all-browser.log`, `reports-final-all-browser-summary.json`, `reports-dashboard-browser.json`, `reports-final-image-smoke.json`, `reports-final-image-desktop.png`, `reports-final-production-build.log`, `reports-final-syntax.log`, `reports-final-assets-build.log`, `reports-final-whitespace.log`, `reports-phase3-query-performance.json`, `reports-phase3-query-plans.json`, `reports-phase3-high-volume.json`, and `reports-final-changes.json`. Test fixtures are generated local data, not production exports.

## Files changed and migrations

Final review changes:

- `tests/reports-dashboard.browser.cjs`: add real-source lifecycle coverage before any quotation fixture; reload before the existing intercepted first-load test so its request gate observes a real navigation after the new scenario.
- `docs/reports-dashboard-final-readiness.md`: this acceptance report and deployment/rollback checklist.

No runtime code fix was needed after this review. Earlier redesign fixes remain covered by the complete suite; see `reports-dashboard-phase3-qa.md` for the query/filter/export changes and their files. Preserve all unrelated pre-existing uncommitted changes when preparing a release.

No new database migration was introduced here. The complete reporting implementation requires existing migrations `009-product-analytics.sql` (rebuildable line projection and product/category indexes) and `010-product-analytics-gst.sql` (additive GST-inclusive projection). The migration runner backfills using the canonical engine, retains quotation bodies/versions and makes gross values required. Migration/backup/restore tests passed in the complete suite. Historical category assignments predating snapshots may be marked `migration-current` or `unknown`; missing historical category facts are not fabricated.

## Deployment checklist — not executed

- [ ] Obtain explicit production deployment authorization and identify the exact target/company database.
- [ ] Review and commit the intended release diff, including prior dirty work; do not stage/reset the whole workspace indiscriminately. Retain the previous application image and matching assets.
- [ ] Record current schema and configuration. Confirm database connection, application origin, secure cookies, backup storage and separate-company database boundaries. Do not copy local disposable-test settings into production.
- [ ] Use the existing approved backup process (`npm run backup`) and verify `npm run restore -- <backup.dump> <unused_staging_database>` into a separate database. Protect backup files and retain the original database.
- [ ] Run the exact candidate image against that restored copy. Validate schema-10 upgrade/backfill duration, record preservation, representative totals, all roles, CSV exports and expected concurrent load on target-equivalent resources.
- [ ] Reconcile GST-inclusive discounted product totals and saved grand totals separately. Check old renamed/archived products and category lineage warnings.
- [ ] Recheck quotation creation/edit/PDF, customer/address CRUD, pricing changes and manual WhatsApp history on staging.
- [ ] If earlier migrations are needed, stop old writers, take a final backup and start the authorized release using the existing deployment process. No destructive schema command is required.
- [ ] Confirm `/api/ready` at schema 10, matching frontend assets, report permissions, error logs, query latency and backups. Perform post-release source/CSV reconciliation before resuming unrestricted traffic.

## Rollback checklist — not executed

- [ ] Retain the pre-release image, configuration and verified backup before rollout.
- [ ] For an application-only rollback between compatible schema-10 artifacts, stop the candidate and start the retained image with its matching frontend assets. Keep the database and projection data; no downgrade SQL is needed.
- [ ] If this release also upgrades a schema-9-or-earlier database, do not attach the older application to schema 10: the downgrade guard rejects it. Stop writes and restore the verified pre-upgrade backup into a **separate** database for the matching older artifact.
- [ ] Preserve the upgraded database and reconcile any post-upgrade writes before switching to a backup. A backup alone would lose later writes. Do not manually decrement migration versions or drop live reporting/customer tables.
- [ ] Validate readiness, record counts, representative amounts, authentication and quotation/customer/pricing/WhatsApp workflows, then switch traffic using the existing release procedure.

## Remaining risks / final acceptance

All available local critical acceptance checks passed; no unresolved critical reporting defect was reproduced. Production target acceptance remains pending authorization and the staging gates above. There is no production deployment or production data mutation to roll back from this review.

Target production data, migration duration and expected load are untested. Chrome/Chromium was exercised; Firefox/WebKit and manual screen-reader checks were not run. Dedicated lint/type tooling does not exist. Very large sharing histories retain existing sequential pagination/caching; authorized sharing-cohort IDs and detailed summary groups can still grow with the requested scope. Reports retain the existing 20-second frontend timeout; narrow filters for expensive exports. The legacy common application bootstrap can load permitted quotations independently of Reports, although the Reports module itself uses server-side aggregation. These limits should be measured on staging rather than expanded into unrelated changes here.
