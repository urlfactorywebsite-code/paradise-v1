# Global Dynamic Field and Dropdown Customization — final release audit

Audit date: 2026-11-05. This is a fresh source review and verification pass over the complete engine and integrations, including Phase 5 tests. Earlier reports provide implementation history; the execution results in this report identify the current candidate.

## Release decision

**PASS: current local critical release acceptance.** The candidate is ready for an authorized target-environment rehearsal/rollout, subject to the operational gates below. No unresolved feature-related defect remains in the executed scope. Production deployment, production migration and production data changes have not been performed or authorized. The existing application/database were kept running.

## Finding resolved in this audit

The protected pricing-method registry advertised only `unit`, `area` and `fixed`, while the authoritative validator/pricing engine also supports `tier`, `package` and `base`. The registry now consumes `DP.METHODS` from the same shared domain module used by backend validation. A regression assertion failed before this correction and passed afterwards.

This changes configuration metadata only. It does not change pricing methods, rates, calculations, form options, IDs, permissions or stored records. The entry remains protected against generic editing. No schema migration, dependency or environment change is required.

## Architecture and feature acceptance

| Area / acceptance criterion | Review conclusion and evidence | Status |
| --- | --- | --- |
| Central architecture | One database-backed engine in `server/dynamic-fields.js`; shared registry, typed validator, resolver, editor and page/product adapters. No independent per-page option stores or authoritative localStorage configuration. | PASS |
| API conventions | Existing cookie/CSRF conventions; validated envelopes, identifiers, scopes, enums, pagination and parameterized SQL. Every mutation has backend authorization and version checks. | PASS |
| Database integrity | Immutable field/option identity triggers, scope-specific uniqueness, reference restrictions, bounded settings and transactional revision/audit writes. Existing business JSON stores values/snapshots by immutable IDs. | PASS |
| RBAC and revocation | Admin-only Edit Mode UI; backend `fields.manage` independently enforced and rechecked under the workspace write lock. Explicit delegated backend permissions retain existing semantics. Normal employees cannot acquire management by toggling UI state. | PASS |
| Company isolation | Separate database per company; server-owned connection/schema, rejected client ownership parameters, foreign field/option rejection and company/actor/permission/scope-specific cache validators. Shared-table row tenancy is not implemented or claimed. | PASS within existing architecture |
| Protected fields | Roles/permissions, workflow/payment/status, tax, pricing bases/methods, canonical units and entity IDs remain under their existing APIs. Caption permission never grants arbitrary entity/enum option editing. | PASS |
| Global/page/product scopes | Explicit product > page > global resolution, whole-field overrides, namespace isolation, inactive override semantics and real product ownership. Only existing persistence adapters expose custom-value creation. | PASS |
| Safe labels and values | Seven descriptive custom types; plain escaped labels/help/value/history text; immutable internal keys and native pricing mappings. All 31 application caption definitions are exercised in the browser. | PASS |
| UI and navigation | Shared Edit Mode/editor, Settings management, search/filter/history, option/field ordering, Save/Cancel/Reset, loading/retry, accessible names and normal-mode controls. | PASS for executed checks |
| Open-form archival | A newly selected archived choice is rejected against current backend configuration with no partial record. Draft entries survive. Already saved choices retain trusted snapshots; forged snapshots cannot grant new selection. | PASS |
| Historical quotations | Server-owned snapshots, saved native/custom labels, retained prices, archive/rename compatibility, finalized mutation rejection and trusted duplication are covered. Public projections continue excluding private metadata. | PASS |
| Pricing safety | Custom descriptive values do not enter canonical charge configuration. Backend integer-paise pricing remains authoritative. Nine controlled quotation cases reconcile UI, preview, saved records, SQL and generated PDF. | PASS |
| Concurrent editing | Missing version returns 428; stale version returns 409. Two administrators across separate app instances have one winner and an accurate actor audit. Order, versions, audits and cache revision roll back together on failure. | PASS |
| Cache consistency | ETags/revisions and shared pending-request coalescing; permission validation before 304; navigation/refresh revalidates external caption edits. No real-time push is promised. | PASS |
| Performance | Bounded configuration reads and management/history pagination; database plans and maximum-size metadata fixture measured separately from browser regressions below. | PASS within measured envelope |
| Migration/recovery | Populated schema 10/11/12 upgrade failure/retry/idempotence and complete schema-13 backup/restore tested. Existing-database overwrite refused; restored sessions revoked. | PASS |
| Existing application | Full tests cover customers, addresses, products/catalog, pricing, quotations, report filters/exports, PDF/print projections and WhatsApp. Current totals below distinguish uninterrupted passes from interrupted/retried runs. | PASS |

## Page-by-page coverage

Each of the 13 business pages is checked as an administrator with Edit Mode OFF, with Edit Mode ON, and as a non-admin with relevant business permissions but no field-management permission. These tests do not change default employee permissions. The management page has separate authorized navigation and unauthorized-route checks. All-caption interaction tests also preserve original control nodes, values and options during refresh.

| Page | Approved customization | Intentionally canonical / protected | Automated role/mode checks |
| --- | --- | --- | --- |
| Dashboard | Period/customer/employee/status captions | Existing filter enums and actual entities | PASS |
| Create Quotation | Catalog caption; existing quotation/product descriptive fields | Customer/product/address IDs, workflow, discount kinds, tax and measurement units | PASS |
| All Quotations | Status/salesperson captions | Valid statuses and real salesperson IDs | PASS |
| Customers | Existing name/type labels, address caption and custom fields | Category association, Other business rules and owned delivery references | PASS |
| Reports | Ten approved filter/metric/mode/product captions | Actual scoped entities and supported analytics/status values | PASS |
| Products & Services | Four catalog-filter captions; product fields and guarded native display bindings | Category references, pricing methods/tax/templates, priced keys and charges | PASS |
| Product Categories | Category-name input caption | Existing category CRUD; no nonexistent select is fabricated | PASS |
| Pricing Configuration | Existing guarded product display adapter | Pricing bases/operators/conditions, compatibility, quantity keys and tax | PASS |
| Catalog Verification | Category/status/template/page-size filter captions | Actual categories, readiness states, template IDs and bounded pagination | PASS |
| User Management | Name caption | Roles and permissions | PASS |
| Settings | Signatory caption; field-management navigation | Tax display/treatment and canonical settings | PASS |
| WhatsApp Sharing History | Status-filter caption | Sharing states, ownership and workflow | PASS |
| Customer Category Management | Status-filter caption | Category active/archive business state and real associations | PASS |
| Field Customization Management | Same definitions/editor/options/order/history as inline editing | Page/type/policy enums and actual product scope | PASS: authorized access and unauthorized denial |

The [inventory](dynamic-fields-phase4-inventory.md) and [JSON details](dynamic-fields-phase4-inventory.json) cover 79 literal select callsites in 21 frontend JS/HTML files, expanding template builders into 87 field rows, plus five non-select picker/menu integrations. There are 46 explicit runtime bindings: 31 caption definitions and 15 protected controls. Existing customer label and custom/native value adapters are additional explicit integrations. Unknown controls remain protected; no runtime editor is inferred from a matching name.

## Current test execution and evidence

| Check | Current result | Evidence |
| --- | --- | --- |
| Complete unit/integration suite | PASS: 491 tests; zero failures, skips or cancellations | `test-results/dynamic-final-unit.log` |
| Engine-specific API/integration tests included above | PASS: 53 cases across five engine test files | Same complete suite |
| All available browser suites | PASS: 406 checks across 29 suites in the current final artifacts | `test-results/dynamic-final-browser-summary.json` |
| Engine-specific browser checks included above | PASS: 104 checks across five suites | Per-suite artifacts in final summary |
| Syntax validation | PASS: 152 JavaScript files | `npm run check` |
| Frontend production build | PASS | `npm run build` |
| Docker candidate build | PASS: `paradise-dynamic-final:20261105` | `test-results/dynamic-final-build.log` |
| Candidate/source consistency | PASS: 90 runtime/package files match byte-for-byte | `test-results/dynamic-final-candidate-hashes.json` |
| Dependency advisory audit, including dev dependencies | PASS: zero known advisories from `npm audit --json` | `test-results/dynamic-final-dependency-audit.json` |
| Inventory attributes and page attribution | PASS: no unattributed select rows | Generated inventory validation |
| Whitespace validation | PASS with repository CRLF handling | Scoped `git diff --check` |
| Dedicated lint/static type checking | NOT CONFIGURED | Repository package scripts/toolchain reviewed |
| Production deployment/data mutation | NOT RUN | Not authorized |

Candidate image ID: `sha256:f2c28c514c4ec48faf8cc2331444026e5772eddd2444064c0954542e631d540a`.

The complete unit suite passed in one final invocation. The browser total is a consolidation of the initial complete-matrix attempt and successful sequential reruns/resumption after Windows memory pressure; it is **not** one uninterrupted clean invocation. All 29 available browser files are represented and all final artifacts have zero failed checks or recorded page exceptions. Initial failure/interruption evidence is preserved in `dynamic-final-browser.log` and `dynamic-final-browser-interrupted-summary.json`; resumption evidence is in `dynamic-final-browser-resume.log`. No earlier phase's result is substituted for an unexecuted suite.

| Browser suite | Passed checks | Final result |
| --- | --- | --- |
| `dynamic-production.browser.cjs` | 3 | PASS |
| `dynamic-pages.browser.cjs` | 59 | PASS |
| `product-fields-review.browser.cjs` | 10 | PASS |
| `product-fields.browser.cjs` | 11 | PASS |
| `dynamic-inline.browser.cjs` | 21 | PASS |
| `product-analytics.browser.cjs` | 9 | PASS |
| `customer-details.browser.cjs` | 15 | PASS |
| `customer-categories.browser.cjs` | 13 | PASS |
| `customer-category-quotation.browser.cjs` | 18 | PASS |
| `customer-release.browser.cjs` | 11 | PASS |
| `quotation-editor.browser.cjs` | 19 | PASS |
| `quotation-audit.browser.cjs` | 12 | PASS |
| `browser-ui.cjs` | 20 | PASS |
| `dropdowns.browser.cjs` | 20 | PASS |
| `dashboard.browser.cjs` | 17 | PASS |
| `products.browser.cjs` | 19 | PASS |
| `pricing-editor.browser.cjs` | 18 | PASS |
| `pricing-refinement.browser.cjs` | 11 | PASS |
| `phase1.browser.cjs` | 6 | PASS |
| `phase1-review.browser.cjs` | 4 | PASS |
| `phase2.browser.cjs` | 7 | PASS |
| `phase3.browser.cjs` | 7 | PASS |
| `phase3-review.browser.cjs` | 6 | PASS |
| `phase3-quantity.browser.cjs` | 2 | PASS |
| `phase3-readiness.browser.cjs` | 3 | PASS |
| `phase4.browser.cjs` | 25 | PASS |
| `phase4-review.browser.cjs` | 5 | PASS |
| `phase5.browser.cjs` | 9 | PASS |
| `reports-dashboard.browser.cjs` | 26 | PASS |

This checkout has no configured dedicated lint or static type-check script and no TypeScript toolchain. `npm run check` is JavaScript syntax validation; it is not described as linting or type checking. Browser automation uses local Chrome/Chromium at desktop/mobile viewports; this is not exhaustive cross-engine, physical-device or assistive-technology certification.

Tests use generated random databases in a task-only loopback PostgreSQL container. Backups/restores, failure injection and destructive fixture rewinds are confined to those disposable databases. The running installation is not the test target. Unit tests run inside the candidate application image with PostgreSQL 17 client tools; browser suites use freshly built assets and isolated apps. Dependencies and data are not downloaded into production.

## Performance evaluation

The capacity fixture uses 500 total definitions, 433 choice fields, 43,300 options and 20,000 audit rows with before/after snapshots of a 100-option field. API assertions require one fields query and one options query, no business-record hydration, bounded management/history pages and zero field/option queries for an unchanged ETag response. Index-assisted option/history plans are checked without forcing planner choices. A small metadata scope scan is allowed when economical; no speculative index is added.

| Fresh isolated measurement | Result |
| --- | --- |
| Five non-conditional resolver responses | Median 569.46 ms; maximum 579.94 ms |
| Unchanged ETag response | 304 in 4.13 ms; zero field/option queries |
| Resolver payload | 9,360,703 bytes |
| Configuration query count | One fields query + one options query; no business hydration |
| Management list (25 fields) | 30.2 ms |
| History (20 of 20,000 full-snapshot records) | 23.24 ms |
| Option lookup plan execution | 0.45 ms, index-assisted |
| History lookup plan execution | 0.086 ms, indexed |
| Small scope query execution | 0.653 ms; economical scan/sort |
| Browser 40-field ready time | 71.34 ms; one resolver batch |

Capacity runs used a Node container limited to 512 MiB / one CPU / 256 MiB JS heap and PostgreSQL limited to 1 GiB / two CPUs. They ran separately from browser regressions. Evidence: `test-results/dynamic-final-performance.json` and `dynamic-final-performance-isolated.log`. The earlier parallel attempt terminated before producing valid final measurements; it is not counted as a benchmark pass.

 They are local shared-machine samples, not production p95 or latency guarantees. The approximately 9.36 MB worst-case resolver response remains a capacity concern for slow links and unusually dense forms. The browser suite separately exercises a 40-dropdown form with 781 available options, one configuration batch, keyboard interaction and 320/390/768/1440px layouts. Maximum-size mobile rendering is not claimed.

The first capacity run was launched alongside browser tests and terminated a Windows verification worker. Windows commit headroom subsequently measured below 1 GB; a dashboard login failed and a Products renderer crashed during that pressure. The affected verification process tree and only its disposable container were stopped. Remaining browser checks and capacity evaluation were separated and rerun with bounded test resources. Final results below retain the interruption and distinguish verified reruns from missing coverage. No authentication/pricing behavior was changed to mask resource failures.

## Database migrations and deployment steps

No new migration is introduced by this final fix. Existing engine migrations are:

| Migration | Purpose |
| --- | --- |
| `011-dynamic-fields.sql` | Configuration fields/options, immutable identities, normalized scopes, revision state, audits and indexes |
| `012-inline-field-editor.sql` | Supported descriptive field-type expansion |
| `013-product-dynamic-fields.sql` | Product-owned roots, product-root uniqueness and native display bindings |

The current schema is **13**. Phase 4 registry definitions are seeded idempotently on startup without overwriting customized labels or business records. The final pricing-method metadata correction is supplied by the runtime registry and requires no row rewrite. There are no new packages, environment variables, services or storage providers for this release.

Deployment checklist — instructions only, not executed:

1. Obtain explicit authorization for the target release/migration window. Review the bounded engine change set separately from unrelated pending workspace changes. Retain the previous approved image, configuration and schema information.
2. Establish a write cutoff for release/rollback reconciliation. Create and verify the established backup in the authorized environment:

   ```powershell
   docker compose exec -T app npm run backup
   docker compose exec -T app pg_restore --list /app/data/backups/<approved-backup>.dump
   ```

3. Retain a verified copy in approved private backup storage. The existing `app_backups` volume is mounted at `/app/data/backups`. Rehearse restore into a fresh database; never overwrite the live database for rehearsal.
4. Validate the approved candidate against that restored copy first. Check startup migration/retry, schema 13, original row counts/fingerprints, field IDs/options/audits, finalized quotations and exact prices. Coordinate old writers before any authorized migration.
5. Build/deploy the reviewed candidate through the existing process. Verify health/readiness, login, normal/admin modes, Settings navigation, field mutation/cache refresh, stale versions, archival, customer/quotation saves, reports, pricing, PDF/print and WhatsApp.
6. Review existing request/error logs and configuration audit history. Validate target latency, storage growth, private backups, recovery time and proxy/session behavior. Resume writes only when operational acceptance is complete.

## Rollback instructions

1. Obtain authorization, pause writes and preserve the candidate database plus its backup. Record legitimate changes since the original backup cutoff.
2. If the previous approved binary supports schema 13, restore its image/assets/configuration through the normal deployment process. Keep additive definitions, option rows, snapshots and audit history. Do not delete metadata to hide UI controls.
3. If the old binary does not support the migrated schema, restore the matching verified pre-upgrade backup into a **new, unused database**:

   ```powershell
   docker compose exec -T app npm run restore -- /app/data/backups/<approved-pre-upgrade-backup>.dump <unused_database_name>
   ```

4. Restore refuses an existing database and revokes restored sessions. Validate with the matching old binary, reconcile post-backup writes, then switch the approved application connection under explicit authorization. Do not point an unsupported binary at schema 13 or manually lower migration versions.
5. Verify health, authentication, saved selections, archived values, finalized quotations, exact prices/taxes, PDF output, reports and customer/address ownership before resuming writes. Retain both databases/backups until rollback acceptance and normal retention approval.

The final fix can be reversed by restoring the previous compatible artifact; doing so would restore incomplete pricing-method registry metadata. It requires no destructive schema rollback. A forward metadata correction is preferable to a database restoration for this isolated fix.

## Files and scope

Files changed by this independent audit, compared with its task-start SHA-256 baseline:

- `server/field-registry.js` — protected pricing-method metadata now uses authoritative `DP.METHODS`.
- `tests/dynamic-fields.test.js` — regression assertion comparing registry and canonical methods.
- `docs/dynamic-fields-final-release-report.md` — this release report.

Feature file map across the prior phases (not a claim that the entire dirty Git diff belongs to this feature):

- Core backend: `server/dynamic-fields.js`, `server/field-registry.js`, `server/field-values.js`, `server/product-field-values.js`.
- Shared engine/display: `shared/dynamic-values.js`, `shared/product-fields.js`, `shared/field-controls.js`; public specification integration in `shared/domain.js`.
- Reusable UI: `public/dynamic-fields-ui.js`, `public/product-fields-ui.js`, `public/field-pages-ui.js`, `public/dynamic-fields.css`.
- Existing integrations: `server.js`, `server/access.js`, `server/resources.js`, `server/store.js`, `server/validation.js`, `server/openapi.js`, `public/app.js`, `public/index.html`, `public/workspace-ui.js`, `public/customer-ui.js`, `public/quotation-ui.js`, `public/products-ui.js`, `scripts/restore.js`.
- Engine migrations: the three SQL files listed above.
- Verification tooling: `scripts/test-customer-release.js`, `scripts/inventory-dropdowns.js`, `scripts/benchmark-dynamic-fields.js`.
- Engine tests: `tests/dynamic-fields.test.js`, `tests/dynamic-inline.test.js`, `tests/product-fields.test.js`, `tests/dynamic-pages.test.js`, `tests/dynamic-production.test.js`; browser equivalents `dynamic-inline`, `product-fields`, `product-fields-review`, `dynamic-pages`, `dynamic-production`.
- Existing regression maintenance includes schema-ceiling/rewind fixtures and quotation/PDF cases. Exact earlier changes are recorded in the [Phase 1](dynamic-fields-phase1.md), [Phase 2](dynamic-fields-phase2.md), [Phase 3](dynamic-fields-phase3-report.md), [Phase 4](dynamic-fields-phase4.md), [application-wide audit](dynamic-fields-phase4-audit.md) and [Phase 5](dynamic-fields-phase5-production-validation.md) reports.

This audit changes no pricing calculation, business record schema, role permission, customer management, report implementation, quotation/PDF implementation, package dependency or environment configuration. Broader pre-existing dirty work is preserved. Generated `dist/` and `test-results/` artifacts are separate from source changes.

## Remaining limits and acceptance checklist

Remaining limits: unusually large uncached metadata payloads; production-specific capacity/recovery/proxy checks; no real-time cross-tab push; database-per-company rather than shared-table tenant isolation; no configured lint/type checker; Chrome automation rather than exhaustive real-device/screen-reader testing. An npm advisory audit does not replace source review, image/OS assessment or an external penetration test.

- [x] Architecture/API/registry and protected business boundaries independently reviewed.
- [x] Incorrect protected pricing-method metadata fixed and regression-tested.
- [x] RBAC, CSRF, company isolation, immutable identities and transaction/audit behavior verified.
- [x] Global/page/product scopes, archived choices, saved values, pricing and finalized snapshots verified.
- [x] Optimistic concurrency, stale editor behavior and rollback/retry tests verified.
- [x] Migration and representative fresh-database backup/restore readiness verified locally.
- [x] Current full test/build/dependency/performance evidence finalized above.
- [ ] Authorized target backup/restore rehearsal, deployment and post-deployment smoke checks completed.

The final item is an operational release gate, not an operation performed by this audit.
