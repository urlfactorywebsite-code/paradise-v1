# Design Paradise quotation manager - PostgreSQL v3

The quotation manager runs on Node.js with PostgreSQL 17. Docker Compose runs the app and database together. Existing customers, catalog, quotation snapshots, pricing rules, PDFs, reports, roles, sessions, audit history and recovery controls remain supported. The original HTML prototype is preserved.

## Start with Docker

Requires Docker Desktop with Linux containers and Docker Compose v2. Run from this folder:

```powershell
npm run setup:docker
docker compose up -d --build
```

Open **http://127.0.0.1:6400**. The setup command creates a random PostgreSQL password in the private `.env` file without printing it. It preserves an existing configured password. Never commit `.env`.

The app waits for a healthy database and applies its versioned schema transactionally. Fresh installations show administrator setup with no default login. Passwords must contain 12-128 characters. Review sample catalog prices and company placeholders before issuing quotations.

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

All accounts share one company workspace. Employees manage customers and quotations and view reports. Administrators additionally manage catalog, pricing, settings, team, approvals, audit, exports and backups. Employees cannot delete quotations beyond Draft/Cancelled. Disabling an account or changing access revokes sessions; temporary password resets require password rotation. Sessions expire after 12 hours.

Saved quotation prices, customer details, company details and taxes remain snapshots. Repricing explicitly refreshes item prices. Duplicating retains snapshots and creates a Draft with a new number. Deleted quotation numbers are never reused. Reports show quoted values, not collected revenue. Status changes and downloads do not send email.

While signed in, open `/api.html` or `/api/openapi.json`; see [docs/API.md](docs/API.md). Writes require JSON and the login CSRF token. Record updates/deletes require versions; workspace changes require a revision. Transactions serialize company mutations across app instances, preserve atomic batches and prevent duplicate numbering. PostgreSQL foreign keys and indexes enforce storage dependencies. Health/readiness endpoints `/api/health` and `/api/ready` report `database: postgresql` and schema version 3.

`server.js` handles HTTP/authentication; `server/database.js` owns the PostgreSQL pool and transaction context; `server/store.js` and `server/schema.sql` own schema/storage; `server/validation.js` enforces business rules; `server/resources.js` and `server/accounts.js` implement business/account APIs. `shared/domain.js` is the shared pricing engine. Browser sources are in `public/`; builds create `dist/`.

This setup is for local use. Remote hosting requires a separately configured HTTPS reverse proxy, exact `APP_ORIGIN`, `COOKIE_SECURE=true`, persistent volumes, supervised startup and off-machine backups. Public/VPS deployment was not performed.
