# Frontend and backend test report - 23 October 2026

Result: **PASS for the local checks performed, with one non-failing driver compatibility warning.**

Workspace: `F:\Projects\Paradise\Paradise-v1`, commit `1bd3f0a`.
Host: Windows / Node.js 24.14.1 / npm 11.15.0 / Docker Desktop 29.3.1.
Database: PostgreSQL 17.11, application schema version 3.

## Results

| Check | Result |
| --- | --- |
| JavaScript syntax (`npm run check`) | PASS - 30 files |
| Frontend build (`npm run build`) | PASS |
| Dependency installation consistency (`npm ls --depth=0`) | PASS - jsPDF 4.2.1, AutoTable 5.0.9, pg 8.23.1 |
| Production dependency audit (`npm audit --omit=dev --json`) | PASS - 0 reported vulnerabilities |
| Both Compose configurations | PASS - configuration validation |
| Test Docker image build | PASS |
| Full automated PostgreSQL suite (`npm run test:docker`) | PASS - 46 tests, 0 failures, 0 skipped, 0 cancelled |
| Additional focused reports test with deprecation tracing | PASS - 1 test; warning reproduced and traced |
| Browser workflows in isolated Chromium | PASS - 24 checks |
| Desktop and mobile visual inspection | PASS - screenshots inspected |
| All nine administrator views at 390 x 844 | PASS - no document-level horizontal overflow |
| Browser page/console errors during successful workflows | PASS - 0 |
| Browser HTTP errors during successful workflows | PASS - 0 |
| Local application and PostgreSQL containers | PASS - both healthy |
| Local health and readiness | PASS - HTTP 200, PostgreSQL, schema 3 |
| Running container source versus checkout | PASS - all 28 compared server, shared, public and script files match SHA-256 hashes |
| Live database constraint/index catalog validity | PASS - 0 unvalidated public constraints, 0 invalid public-table indexes |

## Automated coverage

The 46 tests run against disposable PostgreSQL databases in the separate `paradise-test` Compose project. No application database volume is mounted by that stack.

| Test file | Tests | Coverage |
| --- | ---: | --- |
| `tests/api.test.js` | 10 | Setup, authentication/logout, session attributes, CSRF/origin, stale revisions, server-authoritative pricing and numbering, immutable snapshots, malformed state, employee permissions, password changes, restart persistence |
| `tests/backend.test.js` | 15 | Customer/catalog/category CRUD, duplicates, dependencies, search/pagination, record versions, atomic rollback, quotation previews/status/copy/repricing, PDF snapshots, reports/CSV, roles, account lifecycle, session ownership, backup/restore, OpenAPI, expiry, throttling, audit retention, payload/private-file restrictions |
| `tests/domain.test.js` | 11 | INR formatting, original sample totals, shared browser module, quantity tiers, area units and minimums, invalid configuration/overflow, size quantities, discounts, tax and integer-paise accounting |
| `tests/frontend.test.js` | 5 | Approval-preserving conflict reload and reauthentication, duplicate username handling, area dimensions, deleted-quotation recovery |
| `tests/migration.test.js` | 3 | SQLite imports, account/business/version/audit preservation, rollback, original source preservation |
| `tests/postgres.test.js` | 2 | Independent app process concurrency, revisions and numbering, failed-batch rollback, offline recovery with backup/session revocation |

The full run completed in approximately 5.76 seconds of test execution, excluding image build/startup. Backup/restore and recovery checks used the container's PostgreSQL client tools.

## Browser checks

Browser testing used a fresh headless Chromium context against `http://127.0.0.1:6401`, backed only by the disposable test database. All actions below used synthetic accounts and business records.

1. Create the initial administrator through the setup form.
2. Render all nine administrator views and load team/backup data.
3. Create and edit a customer.
4. Create, rename, deactivate, reactivate and remove a category.
5. Create and edit a product, update quantity-tier pricing, deactivate/reactivate and remove it.
6. Reject saving a quotation without a customer.
7. Configure a product and save a quotation with server-assigned numbering and positive totals.
8. Preview the quotation and download a PDF with a valid `%PDF` signature.
9. Duplicate a quotation, approve internally, search with no results, reload and verify persisted status and unique numbers.
10. Load server reports and download CSV.
11. Save company settings and verify after reload.
12. Create and download a native database backup with a valid `PGDMP` signature.
13. Export parseable workspace JSON and check that password hashes, session token hashes and CSRF tokens are absent.
14. Open audit history and the current-session dialog.
15. Create an employee account.
16. Edit employee access, deactivate and reactivate the account.
17. Render authenticated API documentation: 65 operations plus the schemas section.
18. Capture the desktop dashboard at 1440 x 1000.
19. Navigate all nine administrator views at 390 x 844 and check document width; capture mobile Settings.
20. Sign out and sign in as the employee; verify the five permitted navigation links.
21. Verify employee deep links to Settings, categories, products and pricing fall back to Dashboard.
22. Load employee reports and create a customer.
23. Change the employee password and sign in using its replacement.
24. Verify no browser page errors, console errors or HTTP error responses occurred in these successful workflows.

The shared browser connectors had locked browser profiles. A separate local Playwright process with an isolated Chromium context completed these checks. An initial diagnostic attempt used an exact quotation heading selector that omitted the visible number placeholder; correcting the test selector resolved that harness timeout. No application change was needed.

## Existing local installation

Read-only checks against `http://127.0.0.1:6400` verified:

- HTML, application scripts, stylesheet, shared domain script and favicon return HTTP 200 with appropriate content types.
- `/api/health` and `/api/ready` return `ok: true`, `database: postgresql`, `schemaVersion: 3`.
- Unauthenticated `/api/state` and `/api/openapi.json` return HTTP 401.
- `/.env`, `/server.js` and an unknown JavaScript asset return HTTP 404, with no HTML fallback.
- Responses include `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.
- Database catalog checks found no unvalidated public constraints or invalid public-table indexes.
- The existing database contains 1 account, 12 products, 0 customers and 0 quotations. Browser test records were confined to the separate test installation.

## Finding

**Non-failing PostgreSQL driver deprecation warning.** The reports test emits:

> Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0.

Tracing locates the warning at `server/queries.js:139`, where `report()` reads quotations with `Promise.all` while using one transaction client from `server/database.js:64`. The listing implementation also uses parallel record reads on the transaction connection at `server/queries.js:107`.

The installed `pg` version is 8.23.1. All current tests pass. Before adopting pg 9, serialize reads that share one transaction client or batch them into SQL queries. No code changes were made as part of this testing request.

## Evidence and boundaries

Local diagnostic artifacts are under the Git-ignored `test-results/` folder:

- `automated-tests.log`: full automated test output.
- `browser-results.json`: all browser outcomes, timings, downloaded filenames/sizes and mobile width measurements.
- `browser-smoke.cjs`: the one-off local browser runner; it requires the cached Playwright path and a fresh disposable fixture at port 6401.
- `desktop.png`, `mobile.png`: browser screenshots.
- `driver-warning.log`: focused passing test and warning stack trace.
- `runtime-checks.json`, `running-source-hashes.json`: local HTTP and source-comparison evidence.
- Synthetic PDF, CSV, workspace JSON and database-backup downloads.

The disposable browser container and test Compose services were removed after testing. The existing local app and its database remain running. Application source, account credentials and business records were not changed.

This report covers the checks listed above. It does not establish exhaustive coverage of every input combination, large-dataset performance/load capacity, a complete accessibility audit, Firefox/Safari behavior, or public/VPS/HTTPS infrastructure. No deployment was performed.

## Follow-up: sample company details

After the baseline audit, sample company address, contact details and GSTIN were updated. Settings, quotation previews and server-generated PDFs now clean legacy company labels when rendering, while retaining customized details and saved pricing. No database migration was introduced.

Validation: 46 automated tests and 24 isolated browser checks passed again. Four additional rendering checks covered new defaults, legacy workspace settings, legacy quotation company snapshots and customized company details; settings HTML, preview HTML and PDF text were checked, with no mutation of stored inputs or totals. Build and syntax checks also passed. Evidence: `test-results/sample-company-tests.log` and `test-results/company-details-results.json`.
