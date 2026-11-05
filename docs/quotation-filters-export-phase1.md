# All Quotations advanced filters and CSV export — Phase 1

The follow-up audit and current test evidence are in [quotation-export-review.md](quotation-export-review.md). The verification table below records the initial implementation run.

## Features and behavior

- The All Quotations toolbar retains search and the primary status filter. A single Advanced Filters button opens a keyboard-accessible modal containing status, salesperson, customer, inclusive quotation dates, minimum/maximum GST-inclusive amounts, current customer category, and product.
- Changes in the advanced panel are drafts until Apply Filters. Cancel discards them; Reset Filters clears search and every filter. Active chips clear individual filters. The badge counts active filters other than search.
- Selection survives pagination and filter changes within the current signed-in session. Select-page affects only visible rows. Clear selection removes all selected records. Selection is limited to 1,000 quotations and cleared when the session changes.
- Export CSV opens a configuration dialog with Quotation Details, Customer Details, and Custom Field Selection. Columns are individually selectable and can be ordered with keyboard-accessible up/down buttons. Select All/Deselect All and a live backend count are included.
- Quotation Details offers its nine quotation columns; Customer Details offers eleven customer columns plus quotation number in quotation-wise mode; Custom Field Selection offers both groups, subject to customer permissions.
- Scopes are selected quotation IDs, all filtered records across every page, or all authorized quotations. Selected/all scopes deliberately ignore toolbar filters. The dialog names the selected scope and shows both quotation and output-row counts.
- Customer Details deduplicates by the existing customer relationship. An explicit quotation-wise setting permits one row per quotation and offers a quotation-number column. Custom Field Selection produces one row per quotation, including when customer columns are chosen.
- The automatic customer reference is available only as an optional export column. No manual customer-reference input is added.
- The existing browser-loaded quotation list and its 100-row pagination are retained. Shared validation/matching definitions and matching SQL predicates keep list/export filter semantics aligned. Preview/download query current backend records; records changed since the workspace loaded can therefore change the export count. Reload the workspace to refresh the list.

## Data definitions

| Field | Definition |
| --- | --- |
| Total | Authoritative saved `quotations.total`, including discounts, GST, and quotation charges. Integer paise is formatted with integer/BigInt division as decimal INR. No recalculation or price changes occur during export. |
| Quotation/customer dates | Existing calendar dates, inclusive range endpoints; CSV dates are DD/MM/YYYY. No timestamp/timezone conversion. |
| Quotation customer/company | Saved quotation customer snapshot when available; existing customer relationship is the legacy fallback. |
| Customer Details columns | Current customer relationship: name, company, contact person, independent contact number, mobile, WhatsApp, email, GSTIN, category, billing address, and delivery addresses. |
| Customer category filter | Current customer's managed category ID, including retained inactive/archived associations. Other filters the Other association; its exported label is the customer's custom category text. |
| Product filter | Stable quotation line-item product ID. Referenced archived/renamed products and historical IDs remain usable. Repeated product lines do not duplicate quotation rows. |
| Delivery addresses | Active saved addresses belonging to that customer, combined in one cell with newline separators; each address includes its label and address parts. Default address first, then creation time and ID. Archived addresses are excluded. These are current customer addresses, not historical quotation delivery snapshots. |
| Salesperson | The existing quotation salesperson value (`sales`), independent of the creator displayed by the existing table's By column. |
| Search | Literal, case-insensitive quotation number, current customer name/company/mobile (when customer access is allowed), and historical line-item product names. SQL wildcards are escaped. Internal notes are not searched. |

Verified example: quantity 2 × ₹100 = ₹200; 10% quotation discount = ₹20; taxable value ₹180; 18% GST ₹32.40; saved/exported total **₹212.40**, exactly 21,240 paise. Equal minimum and maximum inputs of `212.40` include the record.

## APIs and authorization

- `GET /api/quotation-export/options` — approved columns, defaults, limits.
- `POST /api/quotation-export/preview` — counts, scope, and applied filters.
- `POST /api/quotation-export/csv` — CSV attachment.

Example request:

```json
{
  "type": "custom",
  "scope": "filtered",
  "columns": ["number", "date", "customer", "total", "status"],
  "filters": {
    "status": "Draft",
    "from": "2026-11-01",
    "to": "2026-11-30",
    "min": "100.00",
    "customerCategory": "cc_bni"
  }
}
```

Filter keys: `q`, `status`, `salesperson`, `customer`, `from`, `to`, `min`, `max`, `customerCategory`, `product`. Amounts are decimal rupee strings with at most two fractional digits. Unknown properties, malformed IDs, invalid dates/ranges, excessive precision, duplicate columns/IDs, unsupported columns, and tenant selectors are rejected.

All endpoints require an authenticated quotation-view permission. `quotation.view_all` permits all quotation owners; otherwise `quotation.view_own` enforces the immutable backend owner ID in every scope. Every selected ID must be authorized and exist; mixed authorized/inaccessible selections fail as a whole. Customer Details and every customer-detail column additionally require `customer.view`. Category filtering also requires customer access. Existing server CSRF validation protects both POST endpoints. No new permission or role migration is introduced.

The application remains one company per database/schema, following its established isolation architecture. No request can choose a tenant, database, schema, table, or SQL column. SQL values are bound; column expressions come exclusively from a server whitelist. Existing Reports and WhatsApp exports are unchanged.

## CSV limits and storage

- Maximum 50,000 output rows; maximum 1,000 selected quotation IDs; maximum 100 MiB encoded CSV.
- Maximum two active downloads per application worker, with one per user. Busy requests return HTTP 429 without consuming another export slot. Preview counts remain available. Multi-worker deployments require corresponding temporary-storage capacity.
- Database-side scope/count/deduplication and keyset batches of 500 rows; no quotation-history hydration or browser aggregation for export.
- One repeatable-read, read-only database snapshot per download. Customer/address/category joins use existing relationships and indexes. No schema or index migration is needed.
- CSV is staged in a uniquely named OS temporary directory with mode 0700 and a mode-0600 file. Complete validation occurs before attachment headers. Successful/error/disconnected requests clean up in `finally`; streaming the finished file observes backpressure.
- Writable private OS temporary storage is required. Allow at least 100 MiB per simultaneous export. Multiple application workers require corresponding capacity. A process/host crash can leave a private temporary file; remove stale `dp-quotation-export-*` directories only after verifying no export owns them. No files enter public asset storage.
- UTF-8 BOM, CRLF records, quoted cells, doubled quotes, embedded Unicode/newlines, and spreadsheet formula neutralization are included. Text starting with formula syntax, including phone numbers beginning `+`, is prefixed with an apostrophe. This is intentional spreadsheet protection.
- A successful preparation records `quotations.exported` with scope/type/row counts/column keys. Customer values, filters, selected IDs, and CSV contents are not logged. Preparation audit is not proof that a recipient opened the file. Quotation bodies, versions, workspace revision, prices, and customer records are not modified.

## Changed files for this task

Pre-existing modified/untracked work was preserved. This list is based on task-start file hashes, rather than the checkout's already-dirty Git baseline.

| File | Change |
| --- | --- |
| `public/quotation-list-ui.js` | Scoped list adapter, filter panel, selection, export dialog/count/download. |
| `public/quotation-list.css` | Responsive teal/white panel, column list, focus states, and persistent action footer. |
| `public/index.html` | Loads new stylesheet, shared filter contract, and page adapter. |
| `shared/quotation-filters.js` | Shared strict filter contract, exact decimal parsing, and list matching. |
| `shared/field-controls.js` | Retains the existing salesperson caption binding in its new advanced-panel location. |
| `server/quotation-export.js` | Scoped preview/export queries, approved projection, limits, CSV security, private staging, audit. |
| `server/resources.js` | Registers the export service in authenticated resource dispatch. |
| `server.js` | Serves the new shared module in the existing development/static setup. |
| `server/openapi.js` | Documents export contract and endpoints. |
| `tests/quotation-export.test.js` | Filter/calculation/export/security/database/size/failure coverage. |
| `tests/quotation-export.browser.cjs` | End-to-end filter/export/selection/mobile/keyboard/error/permission coverage. |
| `tests/dynamic-pages.browser.cjs` | Opens the advanced dialog when exercising the moved salesperson caption; closes it during cleanup. |
| `scripts/test-customer-release.js` | Registers the new browser suite and retains legacy-suite selection. |
| `docs/quotation-filters-export-phase1.md` | This implementation/verification/deployment report. |

## Verification

All automated database work used generated databases on a dedicated loopback/tmpfs PostgreSQL 17 test container, separate from the existing application/database containers. No production deployment, production migration, or production data modification was performed.

| Check | Result | Evidence |
| --- | --- | --- |
| Complete unit/integration suite | PASS — 505 tests, zero failed/cancelled/skipped; 121.14 seconds | `test-results/quotation-export-full-unit.log`; production Node 24 image with PostgreSQL client tools, two test workers. |
| Focused export backend suite | PASS — 14 tests | `test-results/quotation-export-api.log`. Includes actual 50,000-row export/50,001-row rejection, fault-injected 100 MiB rejection/DB failure/cleanup, CSRF, RBAC, independent company databases, archived associations, exact totals, and literal multi-field search. |
| Complete end-to-end suite | PASS — 415 checks across 30 suites; no failed suites or recorded JavaScript exceptions | `test-results/quotation-export-full-browser-summary.json` and `quotation-export-full-browser.log`. |
| Focused UI regressions after keyboard refinements | PASS — export 9, legacy UI 20, application caption integration 59 | `quotation-export-final-focused-summary.json`, `quotation-export-final-legacy-ui-summary.json`, `quotation-export-final-captions-summary.json` under `test-results/`. The export suite was rerun after the final mobile footer adjustment. |
| Syntax validation | PASS — 157 JavaScript files | `npm run check`; `test-results/quotation-export-check.log`. |
| Frontend production assets | PASS | `npm run build`; `test-results/quotation-export-frontend-build.log`. |
| Production Docker build | PASS | `test-results/quotation-export-build.log`; local candidate `paradise-quotation-export:20261105`; exact image ID in `test-results/quotation-export-image.txt`. |
| Separate lint/type checker | NOT CONFIGURED | This plain JavaScript repository defines neither script. Syntax validation is not represented as linting or type checking. |
| Change scope/whitespace | PASS | Task-start SHA-256 comparison identified only the 14 files listed above; generated build/test artifacts excluded. Existing unrelated dirty work retained. `git diff --check` passed for the tracked integration files. |
| Native Excel and production-volume SLA | NOT RUN | Browser CSV downloads/bytes/parsing were verified; no native Excel session or production dataset/load environment was used. |

The broad browser run covered the existing customer/category workflows, dynamic-field customization, quotation creation/editing/history/PDFs, Products & Services, pricing configuration, reports, sharing, and responsive dropdowns. The final focus fixes preserve checkbox nodes during selection and restore focus after column reordering. Mobile inspection confirmed the preview count and export/cancel actions remain visible together.

Failures discovered during development were corrected before these passing runs: decimal maximum-boundary parsing, test assumptions about address ordering and asynchronous chip updates, caption tests targeting controls behind the new modal, keyboard focus after DOM updates, and mobile footer/count visibility. No unresolved automated failure remains.

### Remaining operational limits

- Export data is current at each backend request; preview/download counts may differ if authorized records change between requests. Each individual download is internally snapshot-consistent.
- The existing state bootstrap still loads quotation records for the list. This phase improves export batching and preserves list pagination; it does not redesign application-wide state loading.
- Row/byte limits are per export, with the worker/user concurrency bounds described above. Process crashes may leave private temporary files. Production concurrency and worst-case wide-address datasets were not load-certified.
- Formula neutralization intentionally changes dangerous spreadsheet-leading text by adding an apostrophe. Native Excel behavior remains an operator smoke check.

### Phase 1 acceptance checklist

- [x] Search/status toolbar and one Advanced Filters button.
- [x] Combined status/sales/customer/category/product/date/amount filters, apply/reset/cancel, badge, individual removal.
- [x] Quotation/customer/custom column selection, ordering, defaults, select/deselect all, live backend count.
- [x] Selected records across pages, every filtered page, and all authorized records.
- [x] Deduplicated Customer Details and explicit quotation-wise customer mode; combined active addresses.
- [x] Backend authentication, CSRF, owner permissions, company isolation, strict whitelist/validation, export caps, CSV escaping/formula protection/BOM.
- [x] Historical quotation snapshots and saved GST-inclusive amounts preserved; no manual reference input.
- [x] Keyboard/mobile/loading/empty/error/success behavior verified.
- [x] Automated regressions and production builds pass; existing application/database containers not restarted or modified.
- [x] No new schema migrations; deployment and rollback steps documented below.
- [ ] Operator native Excel smoke check and environment-specific production load/capacity validation.
- [ ] Explicit authorization before production deployment.

**Acceptance: Phase 1 passes local automated acceptance.** Production deployment and environment-specific operational acceptance remain unexecuted.

## Deployment checklist

1. Review this task's bounded changes together with the pre-existing feature work intended for the release. Preserve a known-good image and matching static assets.
2. Use the existing database backup procedure (`npm run backup`) in the intended deployment environment, store the backup privately, and verify the established restore procedure against a separate database. This task did not run a production backup or restore.
3. Run the documented automated checks against disposable PostgreSQL. Build frontend assets and the production image from the reviewed source.
4. Verify private writable temporary storage, appropriate free capacity for simultaneous exports, database connectivity, session/CSRF settings, and normal application logging. No new environment variables are required.
5. Deploy only with explicit authorization. Keep server and frontend assets from the same revision. There are **no new database migrations** for this feature.
6. Smoke-test an administrator and an own-only employee: combined filters, selected/filtered/all scopes, customer-column authorization, Excel Unicode/formula handling, and an export spanning more than one page.
7. Verify quotation creation/edit/PDF, customers, pricing, Reports CSV, and WhatsApp sharing. Monitor export errors, latency, temporary-storage usage, and existing audit events.

## Rollback

1. Stop routing new requests to the candidate and allow active exports to finish, following the existing deployment procedure.
2. Restore the preceding server image and its matching static assets. Existing database schema and data remain compatible; no schema rollback or database restore is needed for this feature.
3. Retain normal audit events. After confirming no active export owns them, remove only stale private temporary export directories.
4. Verify the preceding All Quotations view, quotation creation/PDF, customers, pricing, Reports CSV, and WhatsApp sharing.
5. A database restore is reserved for a separately diagnosed data incident and requires explicit authorization; it is not part of this feature rollback.
