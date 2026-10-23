# Historical SQLite v2 verification

These results predate the PostgreSQL migration. Current results are in [VERIFICATION.md](VERIFICATION.md).

# Local backend verification — 23 October 2026

Workspace: `F:\Projects\Paradise\Paradise-v1`. Windows, Node.js 24.14.1. All test databases were isolated from the user's database.

| Check | Result |
| --- | --- |
| JavaScript syntax | PASS — all 22 source/script/test files |
| Automated tests | PASS — 44 tests, 0 failures |
| Build | PASS |
| Production dependency audit | PASS — 0 reported vulnerabilities |
| OpenAPI | 41 paths / 65 documented operations |
| Local HTTP readiness | PASS — schema version 2 |
| Live SQLite integrity | PASS — `integrity_check=ok` |
| Live foreign keys | PASS — 0 violations |
| Original HTML prototype | Preserved, 55,868 bytes |

## Automated coverage

- 10 original API tests: setup/login/logout, CSRF/origin checks, stale concurrent writes, authoritative pricing/numbering/history, snapshots, malformed state, employee permissions, password changes, persistence across restart.
- 15 expanded API tests: resource CRUD, duplicate review, pagination/search, record versions, pricing/activation/dependency rules, previews/copies/repricing, historical document snapshots, PDF generation, report/CSV filtering, account lifecycle, session ownership, backups/restore, OpenAPI, selective expiry, persistent throttling, audit retention and forgery protection, payload/file/route restrictions.
- 11 pricing tests: original catalog totals, shared browser/Node behavior, paise arithmetic, tiers, area units/minimums, size counts, malformed configuration, overflow, exact discount allocation, tax snapshots.
- 5 frontend regression tests: approval-preserving conflict recovery and reauthentication, duplicate-account conflict handling, editable area dimensions, deleted-quotation protection.
- 3 migration/recovery tests: backup-first v1-to-v2 migration preserving data and credentials, failed-migration rollback, hidden-input administrator recovery with session revocation.

## Browser checks

Used a separate temporary workspace at `localhost:6402`; no test users or business records were added to the real installation.

PASS: administrator setup; customer creation; product configuration; quotation saving through the atomic changes API; server numbering; PDF download; server reports and CSV download; database backup creation/download; audit history; session listing; team creation/edit/deactivation/password reset; 390-pixel mobile layout; direct reports reload; all API reference operations rendering. Final documentation page had no browser console errors.

## Actual local upgrade

The initialized local database was backed up before cutover and upgraded to schema 2. Direct comparison with the pre-upgrade backup confirmed preservation of company settings, categories, products, customers, quotations, account identities, and password hashes. Workspace revision remained 1. The final installation retained one account and 12 catalog products. Migration backup and later v2 backup files were created without overwriting the originals.

The server at `127.0.0.1:6400` was restarted with the final backend and returned healthy schema-version-2 readiness. Its original administrator setup remains complete.

## Verification boundary

These results establish local application behavior for the existing single-company quotation workflow. Public hosting, VPS operation, HTTPS infrastructure, outbound email and payment integrations were not deployed or verified. SQLite's experimental API warning on Node 24.14 was observed; it did not cause test or runtime failures.
