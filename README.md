# Design Paradise quotation manager - PostgreSQL v3

The quotation manager runs on Node.js with PostgreSQL 17. Docker Compose runs the app and database together. Existing customers, catalog, quotation snapshots, pricing rules, PDFs, reports, roles, sessions, audit history and recovery controls remain supported. The original HTML prototype is preserved.

## Start with Docker

Requires Docker Desktop with Linux containers and Docker Compose v2. Run from this folder:

```powershell
npm run setup:docker
docker compose up -d --build
```

Open **http://127.0.0.1:6400**. The setup command creates a random PostgreSQL password in the private `.env` file without printing it. It preserves an existing configured password. Never commit `.env`.

The app waits for a healthy database and applies its versioned schema transactionally. Fresh installations show administrator setup with no default login. Passwords must contain 12-128 characters. Review sample catalog prices and sample company details before issuing quotations.

The database is available only inside the Compose network. `APP_PORT` in `.env` controls the host app port; it binds to loopback by default. `postgres_data` stores the database and `app_backups` stores database backups. Rebuilding or recreating containers preserves these named volumes.

```powershell
docker compose ps
docker compose logs --tail 50 app
docker compose stop
docker compose up -d --build
```

Do not use `docker compose down -v` unless you intend to delete the database and backup volumes. Ordinary `docker compose down` preserves them. Copy important backups off the computer.

## Import an existing SQLite installation

This is an explicit one-time import into an empty PostgreSQL workspace. Stop the old Node process first to prevent edits after the import snapshot. Keep the original `data/paradise.sqlite` and any old backups.

```powershell
docker compose up -d db
docker compose run --rm --no-deps -v "${PWD}/data:/legacy:ro" app node scripts/import-sqlite.js /legacy/paradise.sqlite
docker compose up -d app
```

The importer reads a consistent SQLite snapshot, upgrades v1 only in a temporary copy if needed, and imports v1/v2 users, password hashes, catalog, customers, quotations, items, status history, settings, record versions, audit history and number sequences in one PostgreSQL transaction. It verifies row counts and business data before committing. It refuses a populated destination, never modifies the source, and revokes old sessions. Sign in again using your existing username/password. SQLite is retained only for this offline importer; the running backend uses PostgreSQL exclusively.

## Backups, restore and administrator recovery

Administrators can create and download PostgreSQL `.dump` backups from Settings > Data and recovery. Backups use `pg_dump` custom format and include private account/business information. JSON business exports omit credentials and sessions; use database backups for recovery.

```powershell
docker compose exec app npm run backup
docker compose exec app npm run restore -- /app/data/backups/paradise-EXAMPLE.dump paradise_restored
docker compose exec -it app npm run recover-admin -- your-admin-username
```

Restore requires a new lowercase database name and refuses to overwrite an existing database. It restores in a transaction, verifies the schema, and revokes restored sessions. A failed new destination remains available for inspection. After verifying a restore, change `POSTGRES_DB` in `.env` to its database name, then recreate the services with `docker compose up -d`. Keep the previous database until the restored application is verified.

Recovery prompts for a hidden password, makes a PostgreSQL backup, reactivates the existing administrator, revokes sessions and audits the operation. Never put account passwords in command arguments. Run these tools inside the app container, which includes compatible PostgreSQL clients.

To copy a backup out of its volume:

```powershell
docker compose cp app:/app/data/backups/paradise-EXAMPLE.dump ./paradise-backup.dump
```

## Development and tests

Node.js 24.14 or newer is required outside Docker. Set `DATABASE_URL` to a PostgreSQL URL in `.env`, or provide `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD`. No SQLite fallback is used. Run `npm ci`, `npm run build`, then `npm start`. Native backup/restore commands also require PostgreSQL 17 client tools.

```powershell
npm run check
npm run build
npm run test:docker
npm audit --omit=dev
```

The Docker test stack uses a separate Compose project and a disposable PostgreSQL database on tmpfs, with independent databases per fixture. It never connects to the app's database volume. Tests cover API behavior, authentication/CSRF/roles, CRUD, pricing/snapshots, PDFs/reports, concurrent app instances, numbering/rollback, persistence, imports and backup/restore/recovery. `npm test` runs the same Node tests against an explicitly configured test PostgreSQL server whose role can create disposable databases. See [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Behavior and API

All accounts share one company workspace. Employees normally view their own quotations, edit their own Drafts, manage permitted customers and view their own reports. User Management supports explicit permission overrides; catalog administration and pricing administration have separate permissions. Quotation deletion requires explicit permission. Independent internal approval is enabled by default, so a creator needs another authorized approver. Disabling an account or changing access revokes sessions; temporary password resets require password rotation. Sessions expire after 12 hours.

Saved quotation prices, customer details, company details and taxes remain snapshots. Repricing explicitly refreshes item prices. Duplicating creates a new Draft with current approved item prices and a new number, provided current product/category/configuration eligibility passes. The original quotation retains its historical snapshots. Historical quotations remain readable and unchanged saved lines can retain their snapshots during editing. Deleted quotation numbers are never reused. Reports show quoted values, not collected revenue. Status changes and downloads do not send email.

While signed in, open `/api.html` or `/api/openapi.json`; see [docs/API.md](docs/API.md). Writes require the login CSRF token and normally JSON; XLSX pricing preview accepts the documented raw workbook MIME type. Record updates/deletes require versions; workspace changes require a revision. Transactions serialize company mutations across app instances, preserve atomic batches and prevent duplicate numbering. PostgreSQL foreign keys and indexes enforce storage dependencies. Updated health/readiness endpoints report `database: postgresql` and schema version 6. The additive migrations preserve existing records, map only unambiguous legacy quotation owners, and add structural product-configuration constraints, private import signing metadata and protected import history without rewriting product or quotation snapshots. Existing installations advance when the updated server starts.

The SRS implementation adds six pricing methods, conditional/numeric product fields, compatibility and charge rules, discount controls, tax treatments, expanded catalog templates, company logo/signatory/footer controls and a dedicated WhatsApp sharing history. Existing workspaces can use **Products & Services > Add missing SRS catalog entries** to add inactive templates without replacing their current catalog or prices. Configure approved prices before activating them.

Phase 1 extends the existing field editor with ALL/ANY conditions, Equals/Not Equals, reusable size breakdowns and customer PDF visibility. Existing T-shirt sizes and single conditions remain supported. See [Phase 1 architecture and verification](docs/PHASE-1-IMPLEMENTATION.md).

Phase 2 extends Visiting Card and Flex Printing through the same editor. After deploying the updated source, open **Products & Services > Edit > Prepare Phase 2 configuration**, review the draft, and save. Setup is explicit and repeatable; it retains current rates and saved quotations. New Flex rates and the separate eyelet counting policy start pending approval. Configure and approve actual business rates before new quoting; the material/printing rates add to the existing base pricing. See [Phase 2 implementation and verification](docs/PHASE-2-IMPLEMENTATION.md).

Phase 3 extends T-Shirt, Logo Design and the five existing promotional gifts. Use **Products & Services > Edit > Prepare Phase 3 configuration**, review the draft, then save. Manage the shared definition through **Manage promotional gift template**; product fields retain their existing options/rates and support overrides. Configure and approve actual named print-location and new paid-option rates before enabling them. Existing quotation snapshots remain unchanged. See the [Phase 3 implementation report](docs/PHASE-3-COMPLETION-2026-10-26.md) and its [historical readiness audit](docs/PHASE-3-READINESS-AUDIT-2026-10-26.md). Phase 4 resolves the inherited-field regression recorded in that earlier audit.

Phase 4 adds **Catalog Verification** within Products & Services, backed by a maintainable manifest of the 28 requested placeholders and 12 existing documented products. Review the catalog preparation plan before applying it; preparation preserves existing IDs, prices and activation and creates only missing records, inactive with unconfigured prices/tax. Print, Area and Stationery use the same template engine as the existing Promotional Gift template. Use the existing product editor and template management to maintain actual available specifications. Configuration readiness and pricing readiness appear separately; preparation never approves prices or activates products. Catalog editors without pricing access can maintain labels/options while private rates remain hidden and preserved. See the [28-product audit and assignment matrix](docs/PHASE-4-CATALOG-AUDIT-2026-10-26.md) and [Phase 4 implementation and test report](docs/PHASE-4-IMPLEMENTATION.md). Full coverage of an unavailable original SRS list remains unverified. Excel import and new pricing approval workflows are outside Phase 4.

Phase 5 adds **Download Price Template**, **Import Prices** and protected import history within the existing Catalog/Pricing interfaces. Upload XLSX, review backend row validation, then explicitly confirm the atomic import. Missing prices stay blank; imported rates never activate products. The product editor displays the authoritative saved activation checklist. Discount Limit maps to the existing company-wide employee percentage ceiling, with separate Settings permission required to change it. See [Phase 5 implementation and production-readiness review](docs/PHASE-5-PRODUCTION-READINESS-2026-10-26.md) and [API contracts](docs/API.md). Upload limits default to 5 MiB and 5000 data rows; optional `MAX_PRICING_UPLOAD_BYTES` and `MAX_PRICING_ROWS` settings are passed through Compose.

The [Phase 4 readiness review](docs/PHASE-4-PRODUCTION-READINESS-2026-10-26.md) documents the subsequent required-field and template-pricing permission refinements, stable catalog-only ordering, conditional numeric input fixes and measured product pagination optimization. Its source/disposable acceptance does not deploy or populate the normal installation.

WhatsApp currently uses the explicit manual fallback: review the message and international recipient number, prepare/download the protected PDF, open WhatsApp, attach and send the PDF manually, then record the outcome. Prepared and Manually Confirmed are not provider delivery receipts. Automated PDF delivery requires an official Business provider and credentials; none were configured or used. See the [SRS coverage and verification](docs/SRS-COVERAGE.md) and [user guide](docs/USER-GUIDE.md).

`server.js` handles HTTP/authentication; `server/database.js` owns the PostgreSQL pool and transaction context; `server/store.js` and `server/schema.sql` own schema/storage; `server/validation.js` enforces business rules; `server/resources.js` and `server/accounts.js` implement business/account APIs. `shared/domain.js` is the shared pricing engine. Browser sources are in `public/`; builds create `dist/`.

This setup is for local use. Remote hosting requires a separately configured HTTPS reverse proxy, exact `APP_ORIGIN`, `COOKIE_SECURE=true`, persistent volumes, supervised startup and off-machine backups. Public/VPS deployment was not performed.
