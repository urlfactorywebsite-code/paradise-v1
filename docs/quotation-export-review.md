# All Quotations filters and CSV export — independent review

Date: 2026-11-05. Scope: the completed advanced-filter/export feature and its integration with the existing quotation actions. All database validation uses disposable local PostgreSQL databases. No production deployment or production data modification is authorized or performed.

## Corrections

1. **Search parity:** backend search previously appended a separator even for quotations with no line items. A query ending in a space could export a record excluded by the list. SQL now constructs the same field separators as the shared browser predicate, retaining literal `%`, `_`, backslash, and quote handling.
2. **Strict request containers:** explicit `null`, `false`, zero, or empty-string `filters`/`selectedIds` no longer silently become empty defaults. Invalid inputs return 422; omitted optional settings still default normally.
3. **Validity date mapping:** export now uses authoritative `quotations.valid_until`, including legacy records whose JSON body omits `valid`.
4. **Session race:** a delayed 401 from a dismissed export could clear a subsequently authenticated user's frontend session. Download errors now verify both the originating session and current dialog before changing UI/authentication state. A deterministic browser test switches accounts while an old export request is delayed.
5. **Invalid-filter state:** failed list validation now clears the matching-record set and pagination, disables select-page, and displays an alert. Hidden records from the preceding filter cannot accidentally be selected through a stale select-page state.
6. **Mode-specific columns:** Quotation Details is limited to its nine quotation columns, Customer Details to eleven customer columns plus quotation number in explicitly enabled quotation-wise mode, and Custom Field Selection to both approved groups. Backend validation and Select All agree. Customer permissions remain mandatory for customer-detail columns.
7. **Bounded concurrency:** at most two downloads per application worker, one per user. Busy requests receive 429 while count previews remain available. Response completion releases a slot before disk cleanup; unique job tokens prevent a previous cleanup from releasing a newer job's slot. Regression tests cover overlapping jobs, temporary-storage errors, delayed cleanup, and immediately repeated downloads.
8. **List performance:** validation, amount conversion, and query normalization are compiled once per filter application rather than repeated for every quotation. Record selection retains existing checkbox nodes and keyboard behavior.

## Verified data and security behavior

- Three export modes × three scopes, including both customer row representations, are checked against exact expected quotation numbers/customer cohorts. Selected/all scopes intentionally ignore active filters; filtered scope includes all matching backend pages. The selected-ID set fails as a whole when any record is unavailable or unauthorized.
- Customer Details deduplicates customers by their relationship ID. Quotation-wise Customer Details is explicit. Custom Field Selection remains one row per quotation, as stated in the dialog, even when only customer columns are chosen.
- All 20 column mappings are exercised in a real CSV response: saved quotation customer/company versus updated customer-master values; independent contact-person phone/mobile/WhatsApp; GSTIN; Other category text; billing address; and only active delivery addresses belonging to that customer. Multiple addresses share a quoted, newline-separated cell.
- Saved total is exported directly from integer paise, including discounts, GST, and quotation charges. Example: 2 × ₹100, less 10%, plus 18% GST = **₹212.40**, exactly 21,240 paise. No pricing recalculation or quote mutation occurs during export.
- CSV byte checks verify UTF-8 BOM `EF BB BF`, matching Content-Length, CRLF row endings, Unicode, embedded quotes/commas/line breaks, and formula neutralization. Every cell is quoted; leading spreadsheet formulas, including leading whitespace/control characters, receive an apostrophe. International phone numbers beginning `+` are intentionally protected this way.
- Authentication, CSRF, quotation-view permissions, immutable owner scope, customer-column permission checks, unknown/tenant parameter rejection, and independent company databases are covered. The existing one-company-per-database architecture is retained; no client can select a database or tenant.
- SQL values are bound and projections are whitelisted. Neither internal IDs, private notes, credentials, nor arbitrary JSON fields can become export columns. Audit events contain only approved column keys, scope/type, and counts—not customer values, selected IDs, filters, or CSV contents.
- Limits remain 50,000 rows, 1,000 selected IDs, and 100 MiB per file. Private staging and error cleanup prevent a database/validation/size error from producing a successful-looking partial CSV. The completed file streams with backpressure.
- Concurrent customer changes, deletion of a not-yet-read quotation, and insertion of a later quotation do not change an in-flight, multi-batch export: all its rows use one repeatable-read snapshot. A subsequent download sees the new records normally.

## Existing quotation actions

Direct browser interactions from filtered rows verify View, Print, PDF, WhatsApp review, Duplicate, Edit/Save, Status, and Delete. PDF bytes begin with `%PDF`; viewing/downloading/reviewing sharing does not change the quotation. Duplicate allocates a new number; the duplicate can be deleted; editing saves the existing record; and status updates use the existing backend transition endpoint. WhatsApp review sends no message and creates no sharing log.

The original action-handler, quotation-editor, permission, resource-dispatch, and pricing-engine files are compared with the review-start baseline. Those implementations are unchanged. Existing dirty work outside this feature is preserved.

## Performance validation

`tests/quotation-export.test.js` records `test-results/quotation-export-review-performance.json` with:

- A 50,000-record list-predicate comparison, checking the same 25,000 matching records using the original per-record normalization path and the compiled predicate.
- A real 50,000-row CSV download and rejection of row 50,001.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for a customer/date-filtered query and the actual first 500-row keyset export batch. Representative statistics are collected with ANALYZE only on the disposable fixture.

The export retains database-side owner/filter predicates, counts and customer deduplication, existing lookup indexes, 500-row batches, narrow projections, and private file streaming. No new database index or migration is introduced. The 50,000-row load case uses a single-column CSV and minimal legacy bodies; it is not a production-wide-payload latency certification.

Measured in the disposable verification environment: 50,000-row CSV, **738,922 bytes**, **3.81 seconds** including request/file preparation; customer/date LIMIT-500 query, **0.212 ms** database execution; first real keyset export batch, **500 rows / 0.355 ms** database execution. Predicate comparison: **405.36 ms → 12.29 ms** for 50,000 records with the same 25,000 matches. These are single fixture measurements, not production SLAs or whole-page rendering timings.

## Test results

| Check | Result | Evidence |
| --- | --- | --- |
| Complete backend unit/integration suite | PASS — **514 tests**, zero failures/cancellations/skips; **114.70 seconds** | `test-results/quotation-export-review-full-unit.log`; production Node 24 Linux image with PostgreSQL client tools, two test workers. |
| Focused backend coverage | PASS — **23 tests** within the full run | Export modes/scopes, all columns, encoding, injection, auth/CSRF/company isolation, exact money, archived associations, limits, concurrent updates/downloads, and file failures. |
| Focused browser coverage | PASS — **14 checks** | `test-results/quotation-export-review-focused-browser.json`; includes direct original actions and the session-switch regression. |
| Complete browser regression suite | PASS — **420 checks across 30 suites**, zero failed suites or recorded JavaScript exceptions | `test-results/quotation-export-review-full-browser-summary.json` and `quotation-export-review-full-browser.log`. |
| JavaScript syntax | PASS — **157 files** | `npm run check`; `test-results/quotation-export-review-check.log`. |
| Frontend production assets | PASS | `npm run build`; `test-results/quotation-export-review-frontend-build.log`. |
| Production Docker image build | PASS | `test-results/quotation-export-review-build.log`; candidate `paradise-export-review:20261105`, exact ID in `quotation-export-review-image.txt`. |
| Linting | NOT CONFIGURED / NOT RUN | No linter dependency/configuration/script is provided by the repository. |
| Static type checking | NOT CONFIGURED / NOT RUN | No type-checker dependency/configuration/script is provided; this is plain JavaScript. |

Syntax validation is not represented as linting or type checking. Negative-path tests intentionally inject database/storage/authentication failures; their expected errors are not failed acceptance checks. The full suite caught and drove the fix for the response-completion/export-slot race before the passing run above.

The candidate image is `sha256:c5422b9b55810c2685fbffe09c8243f77d2e4f7a9ec3de3796f51987673d2da6`. SHA-256 checks confirm its filter/export/frontend/OpenAPI files match the reviewed source. The original handlers also match the saved baseline from before the advanced-filter/export feature was introduced. No unrelated source file changed in this review; generated build/test artifacts are excluded from that comparison.

**Acceptance: PASS for the reviewed feature's automated functional, security, data-mapping, and regression checks.** No unresolved automated failure remains. Separate lint/type checks and native Excel/production-load checks retain the explicit limitations listed below. The persistent application/database containers were not restarted, migrated, or modified.

## Files changed in this review

| File | Purpose |
| --- | --- |
| `server/quotation-export.js` | Search parity, strict containers, validity column, mode boundaries, concurrency/cleanup guards. |
| `shared/quotation-filters.js` | Compile reusable validated filter predicates. |
| `public/quotation-list-ui.js` | Compiled list filtering, stale-state clearing, mode-specific columns, session-safe download failures. |
| `server/openapi.js` | Document mode restrictions and 429/concurrency behavior. |
| `tests/quotation-export.test.js` | Cohort/mapping/byte/snapshot/concurrency/performance regression coverage. |
| `tests/quotation-export.browser.cjs` | Every mode's Select All, invalid filters, actual quotation actions, and account-switch race. |
| `docs/quotation-filters-export-phase1.md` | Link current review and document corrected limits/modes. |
| `docs/quotation-export-review.md` | This review report. |

## Remaining risks and operational checks

- No standalone linter or type-checker is available; neither is represented as a passing check.
- CSV bytes and browser downloads are verified, but native Excel import is not exercised. Import long/leading-zero phone numbers as text when spreadsheet type inference matters.
- Production traffic and worst-case wide customer/address/quotation payloads are not load-tested. The list still uses the existing state bootstrap; this review does not replace application-wide state loading with server pagination.
- Concurrency bounds apply per application worker. Allow private temporary-storage capacity and cleanup headroom per worker. A process/host crash or filesystem cleanup failure can leave private temporary files; remove only verified stale `dp-quotation-export-*` directories using the existing operational procedure.
- Preview and download are separate current-data requests, so counts can change between them when records change. Each completed CSV is internally snapshot-consistent.
- API callers requesting customer-detail columns must use Customer Details or Custom Field Selection; Quotation Details now enforces its documented column group.

## Deployment and rollback

No new schema migration, permission, environment variable, or production data repair is required. Build matching backend/frontend assets from the reviewed source, retain the preceding image, follow the existing private backup procedure, and deploy only with explicit authorization. Smoke-test own-only/admin scopes, a multi-page export, Excel handling, and the existing quotation actions in the target environment.

Rollback restores the preceding application image and its matching assets. No database restore/schema rollback is needed for this feature. Retain audit events and clean only verified stale private export files after active requests have finished. Production deployment remains unexecuted.
