# Customer Category Management - Phase 2

## Scope and acceptance

Phase 1 was verified before implementation: 362 automated tests and 15 customer browser checks passed against disposable PostgreSQL. This change adds category administration and, as requested, category highlights in quotation screens, print and generated PDFs. Automatic category discounts remain deferred to Phase 3; the existing pricing and manual discount engines are unchanged.

The application remains single-company per database. There is no request-controlled tenant selector or shared-database tenancy model. Isolation is enforced by the existing application/database boundary and checked with two independent company databases.

## Features

- Permission-filtered **Customer Category Management** sidebar entry and page, using the existing navigation, icons, forms, modal, dropdown and table styling.
- Create/edit, active/inactive status, archive/restore, literal search and server pagination. `Other` remains the protected free-text customer option, excluded from management.
- Seven stable initial categories: BNI, YES, JCI, JCOM, Rotary, RMB and Icon Circle. Migration tracking and conflict-safe seeds prevent duplicate startup records or overwriting configuration. New categories require no code change.
- Exact decimal percentage configuration from 0.00 through 100.00 (`NUMERIC(5,2)`), returned as strings to avoid floating-point conversion. No initial commercial discount or promotional text is invented: seeds start at zero with highlights disabled.
- Plain text multiline highlights with enable/disable, escaped editor preview, and configurable maximum length. `CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH` defaults to 1000, permits 1-4000 and is returned in API editor limits.
- PNG/JPEG/WebP logos, 300000-byte upload limit, signature verification, strict bounded image decoding and re-encoding to static PNG. Maximum input dimensions are 4096 per side; normalized output fits 512 per side and 2 MiB. SVG and invalid/animated inputs are rejected. Original uploads and metadata are discarded.
- Logos live in a separate private asset table with ownership foreign keys, not customer records or a public uploads folder. Authenticated, permission-checked asset reads return PNG, `nosniff`, sandbox CSP and private/no-store headers. Replacement/removal changes the current pointer; old immutable assets remain for historical references. Missing logos use initials.
- Backend category view/manage permissions. Administrators inherit access; employees need explicit permission. Customer readers may fetch active references and protected logos without gaining management access. Writes recheck current permission inside the existing locked transaction, require optimistic versions and record audit events.
- Server-owned quotation category snapshots preserve name, logo key and message. Saved quotations retain their original message, including legacy absence, when settings change. New quotations use the selected customer's current category; inactive/archived categories produce no new highlight. Duplication preserves the source snapshot. Existing customer associations survive archiving.
- Highlights appear immediately above Terms & Conditions in editor, preview, print and server PDFs. Long text paginates. Category logos are managed here; this phase does not introduce a new logo placement in quotation documents.

## Files touched by Phase 2

Preexisting customer and quotation changes were preserved. This list identifies this phase's integration points; the entire dirty working tree includes earlier work.

| Area | Files |
| --- | --- |
| Category module | `server/customer-categories.js`, `server/customer-category-logos.js`, `shared/customer-categories.js` |
| Database | `server/migrations/008-customer-category-management.sql`, `server/store.js`, `server/customer-details.js`, `scripts/restore.js` |
| API/security | `server/customer-api.js`, `server/access.js`, `server/openapi.js`, `server.js` |
| Quotation snapshots/output | `server/validation.js`, `server/resources.js`, `server/pdf.js`, `public/quotation-ui.js`, `public/srs-ui.js` |
| Page/navigation | `public/customer-categories-ui.js`, `public/customer-categories.css`, `public/workspace-ui.js`, `public/index.html` |
| Dependencies/configuration | `package.json`, `package-lock.json`, `.env.example`, `compose.yaml` |
| New regression suites | `tests/customer-categories-api.test.js`, `tests/customer-categories.browser.cjs` |
| PDF/schema regression updates | `tests/srs-pdf.test.js`, `tests/customer-details-api.test.js`, `tests/access-whatsapp.test.js`, `tests/phase1-api.test.js`, `tests/phase1-migration-review.test.js`, `tests/phase2-api.test.js`, `tests/phase3-api.test.js`, `tests/phase5-api.test.js` |
| Report | `docs/customer-phase2.md` |

`sharp` 0.35.5 supplies the raster decoder/normalizer; its native installation was checked in the separate Alpine test image as well as Windows. Existing global logo validation and unrelated storage, users, pricing, reports and workflows were not redesigned.

## Database migration

Migration **008** additively extends `customer_categories` with slug, discount, highlight, timestamps, archive marker, version and private asset reference. It adds the separate `customer_category_logos` table and composite category/asset ownership foreign key. Existing category/customer foreign keys remain intact. Customer bodies, IDs, status, billing information, address rows and quotation history are not rewritten by the migration.

The store applies the migration and schema marker atomically under the existing startup lock. Failed DDL rolls back; repeated startup does not reset configuration. Readiness and restore tooling support schema **8**. No down migration is provided. Automated tests exercise populated schema 7 upgrade, fresh schema creation, rollback injection, concurrent startup, ownership constraints and schema 8 backup/restore with logo bytes and historical snapshot references.

## Verification

All database checks use generated databases in a disposable PostgreSQL 17 container on loopback port 55429. The full suite runs in an isolated app image with PostgreSQL client tools and current source mounted read-only. Browser tests use the actual source frontend and Chromium. The normal installation is not the test target.

**Final acceptance: PASS for Phase 2 source and isolated verification. Deployment acceptance remains pending staging and explicit release authorization.**

| Check | Result |
| --- | --- |
| Complete automated suite (`node --test --test-concurrency=2 tests/*.test.js`) | PASS - 374/374; zero failures/skips |
| Category API/integrity coverage included above | PASS - 10 tests covering CRUD, decimal validation, Unicode names/slugs, search, pagination, authorization/revocation, two-company isolation, logo normalization/replacement/removal, archive/history, rollback, migration, configurable limits and backup/restore |
| Category browser suite | PASS - 11/11; zero JavaScript exceptions |
| Phase 1 customer browser regression | PASS - 15/15; zero JavaScript exceptions |
| Quotation editor browser regression | PASS - 19/19; zero JavaScript exceptions |
| Standard application browser suite (`tests/browser-ui.cjs`) | PASS - 20/20; zero JavaScript exceptions |
| Browser total | PASS - 65 checks across four suites |
| Responsive verification | PASS - category page/editor at 1440, 768, 390 and 320 pixels; table scrolls within its container |
| PDF | PASS - highlight before terms, disabled/legacy omission, immutable message, multiline/long-message pagination regressions; generated standard quotation visually reviewed with no clipping or overlap |
| `npm run check` | PASS - 93 JavaScript source/test files |
| `node --check tests/customer-categories.browser.cjs` | PASS |
| `npm run build` | PASS |
| Separate Docker image build | PASS - native raster dependency installs on Alpine |
| Built-image smoke | PASS - schema 8 readiness, bundled shared script and native WebP decoding/normalization |
| `git diff --check` | PASS |
| Dedicated lint / type check | NOT CONFIGURED - no such scripts/configuration in this plain JavaScript repository |
| Dependency audit | 8 moderate preexisting ExcelJS/archive-chain findings; 0 high/critical |
| Normal application deployment / migration | NOT RUN |

Evidence is in ignored local `test-results/`: `customer-phase2-full.txt`, `customer-phase2-browser.txt`, `customer-categories-browser.json`, `customer-phase2-customer-regression.txt`, `customer-phase2-quotation-regression.txt`, `customer-phase2-general-browser.txt`, `customer-phase2-docker-build.txt`, `customer-phase2-image-smoke.txt`, browser captures and PDF render. Interrupted environment/harness runs were corrected and rerun; the table reports the final runs.

### Acceptance checklist

- [x] Phase 1 verified first; customer form/status/Other/phones/addresses and quotation regressions still pass.
- [x] Authorized navigation and management CRUD, active/inactive, archive/restore, search and pagination.
- [x] Seven initial categories, idempotent startup, future category creation and protected special Other option.
- [x] Bounded, signature-checked raster decoding; private storage, controlled reads, ownership constraints, replacement/removal and fallback.
- [x] Exact 0-100 percentage configuration without applying automatic discounts or altering pricing calculations.
- [x] Safe multiline per-category messages, enable/disable, configurable limits, live preview and consistent placement above terms.
- [x] Backend authorization, transaction-time permission revocation, optimistic conflicts and company database isolation tested.
- [x] Historical customer associations, legacy quotation absence, snapshots, totals and duplicate quotation messages preserved.
- [x] Atomic failures, schema upgrade/rollback and database backup/restore including private logo bytes tested.
- [x] Existing regression suites and builds pass; unrelated functionality was not redesigned.
- [ ] Restore a real release backup in staging and approve production rollout.

## Deployment steps - prepared, not executed

1. Schedule a maintenance window and stop application writes. Take a full PostgreSQL backup with the existing backup tool, keep the current image/source revision, and verify restore into a separate empty database. Include the private asset table in subsequent backups.
2. Build an immutable release image using the lockfile (`npm ci` through the existing Dockerfile). Validate native sharp dependencies, schema 7-to-8 migration and readiness in staging against the restored backup.
3. Configure `CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH` if changing the default. Set employee category permissions explicitly; the normal defaults intentionally do not grant management access.
4. With explicit deployment authorization, start the release app against the backed-up company database. Startup automatically applies migration 008 transactionally. Verify `/api/ready` reports schema 8, then exercise category read/create/edit/archive, a logo replacement and a quotation preview/PDF in staging before reopening writes.
5. Configure actual category discounts/messages through management. Confirm saved quotations remain historical and automatic category discount application is still disabled. Monitor rejected uploads, transaction errors and asset-table growth.

## Rollback steps - prepared, not executed

1. Stop application writes and take a new full backup so post-release records remain available for reconciliation.
2. Restore the verified pre-release backup into a **new empty database** using the existing restore tool. Verify customer counts, statuses, delivery addresses, quotation totals/history and sessions before switching traffic. The restore tool revokes sessions.
3. Start the previous image against that restored database, verify readiness and smoke-test customer editing and quotation creation. Reopen writes only after verification. Retain the schema 8 database and latest dump for reconciliation of records created after the pre-release backup.
4. Do not point the previous schema-7 binary at schema 8: it deliberately rejects a newer schema. Do not drop category/logo tables or blindly roll back a live database. Prefer a forward fix when reconciling new records would risk data loss.

## Remaining limits and risks

- Shared-database multitenancy is outside the existing architecture; this phase does not certify it. Deploy one isolated company database per application boundary.
- Old logo versions are retained intentionally. Storage garbage collection needs a separate policy that respects historical quotation references.
- Existing jsPDF font/character support is retained. This phase does not add Unicode fonts or change longstanding company/product text rendering.
- No dedicated lint/type-check tooling exists in this plain JavaScript repository. Syntax checks, builds, API/unit tests and browser checks provide the available verification; no WCAG certification is claimed.
- Dependency audit currently reports eight moderate findings in the existing ExcelJS/archive dependency chain, with no high/critical findings. A separate dependency remediation is needed; unrelated packages were not broadly upgraded or downgraded.
- No production deployment, production data mutation, normal application rebuild or migration was performed by this work. A Docker daemon interruption during testing required recreation of the disposable database; interrupted runs were rerun.
