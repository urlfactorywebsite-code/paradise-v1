# PostgreSQL and Docker verification - 23 October 2026

Workspace: `F:\Projects\Paradise\Paradise-v1`. Host: Windows with Docker Desktop Linux containers. App: Node.js 24 container; database: PostgreSQL 17. Test data used an independent Compose project and disposable PostgreSQL databases, separate from the local app volume.

| Check | Result |
| --- | --- |
| JavaScript syntax | PASS - 30 source/script/test files |
| Automated PostgreSQL tests | PASS - 46 tests, 0 failures, 0 skipped |
| Frontend build | PASS |
| Production dependency audit | PASS - 0 reported vulnerabilities |
| Compose configuration and image build | PASS |
| Local app and database health | PASS - both containers healthy |
| HTTP health/readiness | PASS - PostgreSQL, schema version 3 |
| Browser sign-in smoke check | PASS - existing-account login page shows connected backend |
| Existing SQLite import | PASS - all 9 business/account tables compared exactly |
| Credential preservation | PASS - account IDs and password hashes preserved |
| Container recreation | PASS - both recreated, account/catalog persisted |
| Database backup | PASS - native PostgreSQL custom-format backup created |
| Backup restore | PASS - isolated restore preserves records, revokes sessions, refuses existing destinations |

The 46 tests cover the existing API, pricing and frontend regressions; PostgreSQL resource queries, pagination, case-insensitive search, permissions/CSRF, historical quotation snapshots, PDFs/CSV/reports, record versions, two-process concurrent revisions and numbering, asynchronous transaction rollback, persistence across app restart, backup/download/restore, account recovery, and SQLite v1/v2 imports with source preservation and populated-destination refusal.

The actual local cutover preserved 1 account, 3 categories and 12 products. The existing workspace had 0 customers and 0 quotations. Imported settings, revisions, record versions, account credentials and all business rows match the original SQLite source exactly. Sessions were intentionally discarded, so the user must sign in again. No test accounts or sample business records were added to the actual local installation.

The original SQLite database remains at `data/paradise.sqlite`; an online pre-migration backup was saved under `data/migration-backups/`. A PostgreSQL backup is retained in the `app_backups` volume and copied to `backups/postgres-after-migration.dump`. Both persistent volumes survived container recreation. The running app is **http://127.0.0.1:6400**; PostgreSQL has no published host port.

The original HTML prototype is preserved. A fresh isolated browser context displayed the existing-account sign-in page and connected-backend status. Authenticated browser flows were not re-audited for this storage migration; the frontend build and existing frontend regression tests passed, and the running HTML page returned HTTP 200. The prior SQLite/browser verification is retained as historical evidence in [VERIFICATION-SQLITE-V2.md](VERIFICATION-SQLITE-V2.md).

These results describe the local Docker installation. Public/VPS hosting, HTTPS infrastructure, outbound email and payment integrations were not deployed or verified.
