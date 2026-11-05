# Customer/category/quotation release and rollback guide

Applies to the reviewed Phases 1-3 plus Phase 4 hardening. These are operator instructions; no production deployment, backup, migration or data modification was executed by the QA task.

## Before approving a release

- [ ] Select and review the intended committed release snapshot. Preserve unrelated work; do not stage/reset the whole dirty workspace automatically.
- [ ] Record the prior app image and database connection target, and the new immutable image identifier. The locally verified image tag is `paradise-customer-final-review:20261104`; pin its actual immutable digest for deployment.
- [ ] Confirm one company per isolated app/database boundary. Use unique credentials and restrict database/network access. Do not repoint a company application to another company's database.
- [ ] Quiesce writes for the final consistent release backup and cutover. Ensure an old app process cannot continue writing during/after migration.
- [ ] Create a full backup using the existing procedure below; verify its hash/size and restore it into a separate staging database/server. Do not test a restore against production.
- [ ] Start the release image against that staging restore. Verify schema 8, row counts/versions, sample historical quotation totals, delivery/category relations, logo bytes and protected PDF handoffs.
- [ ] Run the customer-to-PDF/Print workflow and representative production-language messages on staging, including any non-Latin text. Validate the existing PDF font limitations against actual content before approval.
- [ ] Configure HTTPS/reverse proxy, exact `APP_ORIGIN`, `COOKIE_SECURE=true`, persistent PostgreSQL/backups storage and restricted backup access. Verify login cookies, CSRF/origin rejection and authenticated asset/PDF access through the real proxy.
- [ ] Review the eight moderate dependency advisories, operational capacity and rollback/reconciliation plan. No high/critical dependency advisory was found during QA, but this is not a future guarantee.
- [ ] Obtain explicit deployment authorization. Passing local tests is not that authorization.

## Existing backup procedure

The application already provides an Administrator backup UI/API and a CLI. From the approved Compose project directory, the existing CLI command is:

```powershell
docker compose exec -T app npm run backup
```

It creates a PostgreSQL custom-format `paradise-<timestamp>-<uuid>.dump` in `/app/data/backups` (or `BACKUP_DIR`). The command prints only its saved path. The existing backup routine uses the configured database/schema, no-owner/no-ACL export, a temporary file and atomic rename. Files are private (0600), and the directory is private (0700 when created). Ensure the mounted volume and host access preserve appropriate permissions.

Capture the exact filename from that command, then copy it to approved private storage using the existing download UI or a reviewed `docker compose cp` command for that filename. Verify a SHA-256 and `pg_restore --list` using compatible PostgreSQL tools. The custom archive begins with `PGDMP`. Encrypt/protect off-host copies according to the installation policy; never commit a dump or include its contents/credentials in logs. Do not use workspace JSON export as a full database/logo backup.

The dump includes customer metadata/addresses, categories, private logo versions, quotation JSON/calculation policies, item/history rows, users and protected WhatsApp PDF data. It therefore contains sensitive business/account material and requires privileged access. Record recovery point, backup size, hash and a restore-test outcome without recording credentials.

## Staging restore validation

Use the existing restore tool **configured to connect to a separate staging PostgreSQL server**, with a local trusted backup and an unused target database name:

```powershell
npm run restore -- <trusted-backup.dump> paradise_release_staging_20261104
```

Run it in an environment with PostgreSQL client tools, such as an approved staging app container. Verify the staging connection target before executing it; do not print or paste connection credentials. The target name is illustrative and must be unused.

The tool checks the archive listing, creates a new database and restores transactionally. It refuses to overwrite an existing database and retains a failed new database for inspection; the source database is not changed. It supports prior schema levels 3-8, revokes restored sessions/auth-attempt state, and does not automatically redirect a running app. Its internal schema removal is limited to the newly created restore target, never the source database.

Point only the isolated staging application at the restored target, then start the reviewed release image. Startup applies pending migrations within the existing advisory-lock/transaction boundary. Verify `/api/health`, `/api/ready` and schema 8. Compare saved IDs/counts/versions/statuses, customer billing/contact metadata, address ownership/defaults, category associations, private logo reads, finalized totals/messages and protected handoff PDF hashes. Confirm repeated startup does not duplicate categories or reset settings.

Do not rename/drop production tables, run a down migration, clear data or modify production while validating. Real production-backup validation was not performed in the local QA run; the automated drill used populated synthetic schema-6 data and separate generated databases.

## Configuration and storage

| Item | Requirement |
| --- | --- |
| Runtime | Compatible Node version from `package.json`; reviewed Dockerfile installs locked production dependencies and PostgreSQL 17 client tools |
| Database | PostgreSQL 17, persistent volume, isolated company application connection/credentials |
| `APP_ORIGIN` | Exact approved application origin behind HTTPS; verify proxy routing/host/origin behavior |
| `COOKIE_SECURE` | `true` for HTTPS production; example/local default `false` is for loopback development |
| `CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH` | Optional integer 1-4000; default 1000. Existing unchanged longer configuration remains preservable after a limit reduction. |
| Category percentages | Configure actual approved values in Customer Category Management; 0-100%, two decimal places, numeric database storage; no invented rates |
| Category roles | Explicit `customer_categories.manage` for changes; `customer_categories.view` for read-only management. Default employees do not manage categories. |
| Delivery permissions | `customer.view` is required to look up/select a live delivery address, including through quotation preview/create/edit. Quote-only roles retain existing customer document access and saved address snapshots, but do not automatically inherit a live default address. |
| Logos | Supported PNG/JPEG/WebP input <=300,000 bytes; bounded decoding and normalized PNG <=512 pixels per side and <=2 MiB |
| Asset storage | Private PostgreSQL `customer_category_logos` rows, immutable version keys and protected application URLs; no public bucket/directory or customer-record binary storage |
| Retention/capacity | Old logo assets remain for historical quotations. Monitor table/backup growth; never prune blindly. Customer address cap is 100 including archived rows. |
| Backups | Existing persistent `/app/data/backups` volume or `BACKUP_DIR`; restricted access, off-host protection and tested restore |
| Frontend | Reload clients after release so shared helpers/engine and editor scripts are from the same build |
| Monitoring | Retain existing health/readiness endpoints, request IDs, error code/name logs and audit events. Watch authorization/upload rejections, conflicts, 5xx/readiness failures, DB capacity and backup freshness. Never log request credentials/bodies. |

No new Phase 4 production environment variable, storage service, migration or logging subsystem is required. Existing pricing-import limits are unchanged. Native sharp support is built/tested in the release image; ensure the deployed architecture matches the built image.

## Authorized deployment checklist

1. Keep writes quiesced, retain the verified final backup and prior image, and confirm production is the intended company/database. Do not issue deployment commands until authorization is explicit.
2. Deploy the approved immutable release image using the established Compose/reverse-proxy process. Startup performs additive migrations 007/008 as needed; there is no Phase 4 migration. Expect schema **8**. Do not keep the old application writing to the upgraded database.
3. Verify health/readiness and logs through the production proxy. Inspect only necessary metadata and avoid secrets in command output.
4. Perform approved smoke checks: customer edit/Other/contact number, managed category selection/logo, multiple customer-owned addresses, automatic/manual replacement, save/read/PDF/Print parity and a historical finalized quotation. Use an approved test-data policy; do not create arbitrary production fixtures.
5. Reload clients, verify actual category settings/roles, and reopen writes only after acceptance. Monitor the existing endpoints/audit/error logs and backup freshness. Record the image identifier and backup recovery point.

The QA task built/tested an isolated image and synthetic workspaces only. None of these production steps was executed.

## Rollback guide

Prefer a forward fix when post-release records would otherwise need reconciliation. For a required rollback:

1. Quiesce writes and preserve a new full post-release dump plus the current image/database. Record the recovery point and the records requiring reconciliation. Do not delete or overwrite the upgraded database.
2. Restore the verified **pre-release** backup into a separate, unused database with the existing restore tool. Confirm its connection target and restore result. Sessions are revoked; users must sign in again.
3. Start the prior image against that restored target in isolation. Verify compatible schema, historical totals, customer/address records, category associations and PDFs before any traffic switch.
4. Reconcile writes made since the pre-release backup under an approved plan. Do not reopen writes until data loss/duplication risks are resolved. Retain both databases/dumps until reconciliation is signed off.
5. Switch traffic/connection only with explicit authorization, recheck health/readiness and smoke behavior, then reopen writes and monitor.

Do not use `DROP COLUMN`, `DROP TABLE`, `TRUNCATE`, database deletion or a blind down migration as a live rollback. A pre-schema-8 binary rejects schema 8, and an older schema-8 binary may strip Phase 3 JSON or recompute version-2 amounts with legacy arithmetic. Matching schema numbers alone do not establish downgrade compatibility. Restore and verify the correct pre-release data/image pair.

## Repeat local QA

Use only an explicitly disposable PostgreSQL server at loopback port 55429 and development dependencies:

```powershell
$env:DATABASE_URL='postgresql://paradise_test@127.0.0.1:55429/paradise_test'
$env:TEST_DISPOSABLE='1'
npm run check
npm run build
npm run test:customer-release:browser -- --all
```

The browser runner with `--all` includes all 22 available suites (the default runs the 12 current release/regression suites). Each legacy suite gets a fresh, normalized synthetic demo fixture; no existing installation is reused. The runner starts fresh app/database fixtures, accepts an optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, and writes `test-results/customer-phase4-browser-summary.json` plus per-suite evidence. Its broad PDF audit suites use the locally installed Python/PyMuPDF test dependency. The deployed application does not require it. Never point this runner at a normal installation or put production credentials into test environment variables.

Run the complete `node --test tests/*.test.js` suite with compatible PostgreSQL client tools; local QA used the reviewed image attached to the disposable database container, with current test/source directories mounted read-only. The final built-image 58-case customer/category/quotation run mounted tests only, proving bundled application behavior. The [final release report](customer-final-release-report.md) records the image identifier, final counts and remaining release gates.
