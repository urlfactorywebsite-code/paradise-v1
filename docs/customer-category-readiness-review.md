# Customer Category Management readiness review

**4 November 2026 - PASS for the reviewed module within the existing company-per-database architecture. Production deployment remains pending staging verification and release authorization.**

## Defects reproduced and fixed

1. Explicit null/false/empty category IDs were silently replaced with generated IDs; null slugs were silently generated. Invalid supplied types now return 422 without creating records.
2. Null bytes in category search reached PostgreSQL and returned 500. Unsupported control characters now return 422 before a database query.
3. Reducing the configured message-length limit stranded existing longer messages: disabling, renaming or restoring their category failed. Unchanged historical configuration is now retained; new or edited message text must meet the current limit. Historical quotation snapshots remain unchanged.
4. Out-of-order detail responses could open the first clicked category instead of the last. Responses are now bound to their originating modal instance, including stale errors.
5. A save completing after another editor was opened could close that newer editor and discard its unsaved fields. Save completion/error handling now targets its originating form; pending-save controls are disabled and restored independently.

All five defects have regression coverage. No new migration or dependency change was required; schema 8 is retained.

## Modified files in this review

| File | Change |
| --- | --- |
| `server/customer-categories.js` | Strict IDs/slugs/search input and preservation of unchanged messages after limit reductions |
| `public/customer-categories-ui.js` | Modal response ownership and save isolation |
| `tests/customer-categories-api.test.js` | Six new security/integrity cases plus stricter existing input assertions |
| `tests/customer-categories.browser.cjs` | Two deterministic regressions for overlapping detail loads and saves |
| `docs/customer-category-readiness-review.md` | This report |

Earlier uncommitted implementation files were retained. This review did not redesign unrelated users, customers, pricing, reporting, PDF layout or storage workflows.

## Checks and security findings

| Check | Result |
| --- | --- |
| Complete automated suite | PASS - 380/380, zero failures/skips; includes 16 category API/integrity tests |
| Category browser suite | PASS - 13/13, zero JavaScript exceptions |
| Customer browser regressions | PASS - 15/15, zero JavaScript exceptions |
| Quotation editor browser regressions | PASS - 19/19, zero JavaScript exceptions |
| Standard application browser suite | PASS - 20/20, zero JavaScript exceptions |
| Total browser coverage | PASS - 67 checks across four suites |
| Syntax (`npm run check`, changed browser script `node --check`) | PASS - 93 JavaScript files plus the changed CJS runner |
| Frontend build / isolated Docker build | PASS |
| Final built-image smoke | PASS - schema 8, authenticated category creation, invalid search rejection, native raster normalization, protected logo read and bundled shared script |
| `git diff --check` | PASS |
| Dedicated linting | NOT CONFIGURED - no lint task/configuration exists |
| Type checking | NOT CONFIGURED - no type-check task/TypeScript configuration exists |
| Dependency audit | 8 moderate existing ExcelJS/archive-chain findings; zero high/critical |

Confirmed behavior:

- Category create/read/update, inactive status, archive/restore, exact decimal percentages from 0 to 100, customized plain text messages, literal search, pagination and duplicate rejection pass. Case-insensitive names and unique slugs remain protected by database indexes; stale concurrent writes return 409.
- Sidebar/deep-link authorization and read-only management roles pass. Backend write permissions are refreshed inside the transaction. Missing/wrong CSRF tokens are rejected. Forging category metadata through the legacy workspace API does not modify the category table.
- Two separate company databases contain the same category ID with different names/messages/logos. Each app returns only its own data, even with another company named in query parameters. Reusing the other app's session returns 401; foreign asset keys return 404. Supplied storage keys are rejected, and the composite ownership FK prevents another category's logo being attached. Logo-object mutation routes are unavailable.
- Upload checks cover MIME/signature mismatch, SVG/script/GIF payloads, corrupt/truncated data, oversized bytes/dimensions, APNG headers, malformed WebP lengths and noncanonical base64. Bounded raster decoding/re-encoding produces PNG; EXIF and appended script data are removed, dimensions are capped, stored bytes match their SHA-256, and authenticated responses carry private/no-store, nosniff and sandbox headers.
- Database constraints reject out-of-range/NaN percentages, overlong messages, invalid versions and unsafe stored MIME types. Referenced logos cannot be deleted. Injected write failures roll back category, logo, audit and revision together.
- Archiving retains existing customer associations and permits unrelated customer edits, but removes the category from new selection. Historical quotations retain their message/totals and still generate PDFs. Duplicate quotations retain historical snapshots. Category-only managers can restore a category without changing existing quotation bodies or totals.
- Fresh schema creation, populated schema 7 upgrade, repeat/concurrent startup, migration failure rollback and schema 8 backup/restore including private logo bytes pass in the full suite.

## Remaining risks and release boundary

- **Isolation is verified at the separate app/database boundary.** Shared-database multitenancy, tenant columns and PostgreSQL RLS are not implemented or certified. Production provisioning must preserve separate company connections and credentials. This review does not validate a hosted tenant-provisioning system.
- The eight moderate dependency findings remain outside this bounded category review. Dedicated lint/type-check tooling is also absent; neither is represented as passing.
- Previous logo versions are retained for historical references. Capacity monitoring and a reference-aware retention policy remain operational work.
- A real release backup must still be restored in staging before rollout. Existing deployment/rollback instructions are in `docs/customer-phase2.md`; these source fixes require no additional schema migration.
- No production data was accessed or mutated, and no normal application container was rebuilt, restarted or deployed. Tests used generated databases on a dedicated disposable PostgreSQL 17 container at loopback port 55429, plus a separate review image.

Evidence: ignored local `test-results/customer-category-review-full.txt`, `customer-category-review-browser.txt`, customer/quotation/general regression logs, `customer-category-review-audit.json`, `customer-category-review-docker-build.txt` and `customer-category-review-image-smoke.txt`. Before-fix logs retain the reproduced validation/modal failures; the table above reports final successful runs. The initial archival PDF test fixture was corrected to include an item, as required by the existing PDF endpoint.
