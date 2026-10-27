# Phase 1 product configuration upgrade

The subsequent [production-readiness review](PHASE-1-PRODUCTION-READINESS.md) records defects found and fixed after this initial implementation, and supersedes the verification counts below with current results.

## Architecture findings and implementation plan

The application is an existing Node.js HTTP application with PostgreSQL 17. It has no ORM: `server/store.js` writes versioned JSON documents to `products.body` and `quotation_items.body` alongside relational identifiers, prices, quantities, ownership and indexes. Schema changes run transactionally under the existing database lock. No new configuration tables are needed.

`shared/domain.js` is loaded by both the browser and server. It owns defaults, conditional visibility, quantity, pricing in integer paise and item construction. `server/validation.js` validates the complete candidate workspace for resource CRUD, whole-workspace saves, batch changes and quotation previews. `server/access.js` independently checks catalog and pricing permissions. Pricing calculation calls the same shared engine. Saved unchanged items retain their historical snapshots; explicit repricing refreshes them.

The frontend loads `public/app.js`, `public/backend-ui.js` and `public/srs-ui.js`. The latter extends the original product editor and configurator. The existing shared dropdown enhancement observes added selects. Quotation editing restores item configurations. `server/pdf.js` produces authenticated customer documents, including PDFs retained for manual WhatsApp handoffs. The browser quotation preview must use the same public specification policy.

Planned file changes:

| Files | Change |
| --- | --- |
| `shared/domain.js` | Extend conditions, resolve dependency visibility, validate definitions, reusable size quantities/pricing, safe configuration normalization, public specification snapshots/formatting. |
| `server/validation.js`, `server/access.js` | Normalize and validate new field metadata/configurations and enforce independent catalog/pricing permissions. |
| `server/migrations/005-product-configuration.sql`, `server/store.js` | Add structural JSON constraints using the existing migration framework without rewriting product or quotation bodies. |
| `public/srs-ui.js`, necessary existing frontend helpers/styles | Extend existing editor, add condition rows and size editor, PDF visibility controls and generic quantity entry. |
| `server/pdf.js` | Use shared public specifications, retaining existing document layout. |
| `server/openapi.js`, `docs/API.md` | Document new definitions and configuration values on existing routes. |
| `tests/phase1-*.test.js`, `tests/phase1.browser.cjs` | Execute domain, validation, HTTP/database, migration, PDF and browser coverage. |

Phase 1 only: no product-specific catalog expansion, new approved prices, navigation redesign or persistent local deployment is part of this change.

## Data and API contract

- Legacy `when: {key, equals}` stays supported. Multiple conditions use `when: {mode: "ALL" | "ANY", conditions: [{key, operator: "equals" | "not_equals", value}]}`. Hidden dependencies cannot activate descendants. Invalid references and cycles are rejected.
- A reusable field uses `t: "SIZE_BREAKDOWN"` and `sizes: [{key, label, enabled, price}]`. Quantity values are stored under that field's configuration key. Prices are optional per-unit INR surcharges; zero preserves existing rates. One size breakdown controls item quantity. Legacy `product.sizes`/`cfg.sz` remains supported.
- `show_on_customer_pdf` controls eligible custom specifications. `internal_only` and protected internal identifiers override visibility. Item-level internal notes remain private. Saved field metadata provides immutable customer presentation alongside existing item snapshots.

## Implemented behavior

The existing field editor now supports adding/removing conditions, ALL/ANY matching and Equals/Not Equals. Definitions are validated on both client and server. Dependency visibility resolves transitively, so stale hidden values cannot enable child fields or add charges. Self-reference, field cycles and indirect cycles through size-derived quantity are rejected. An explicitly present empty string still supports historical Equals comparisons.

Reusable sizes support custom/kids labels, XS through 5XL, ordering, disabling and optional per-piece price adjustments. Enabled size counts drive the existing minimums, tiers, tax and price calculations. Quantities are nonnegative integers with a combined maximum of 1,000,000; at least one positive count is required while the breakdown is visible. Disabled and unknown keys, including zero entries submitted for them, are rejected. Historical disabled selections remain readable in unchanged snapshots; changing/repricing an item validates current availability. The editor offers an explicit action to clear unavailable historical quantities.

Legacy T-shirt configuration continues to use its original sizes and rates. Customizing those sizes creates an explicit field with key `sz`, retaining the same configuration map. A conditional size field can hide and return to the ordinary quantity input. Updating size quantities also updates quantity-dependent fields immediately.

`show_on_customer_pdf` is editable without pricing permission or price changes. Shared public specifications format text, dropdowns, multiselects, numbers, dimensions and sizes; omit empty optional values and deduplicate identical specification strings. `internal_only`, protected internal/private/staff field identifiers and labels, private customer-record notes and item-level internal notes remain excluded despite visibility flags. The server rebuilds submitted item metadata and ignores forged `sp`/`fieldSnapshot` values. Unchanged and duplicated saved items use their trusted historical snapshot. Preview, normal PDF downloads and newly prepared manual WhatsApp PDFs share the same policy. Previously retained WhatsApp PDFs remain immutable.

The existing catalog/pricing permission split is retained: size definition and PDF visibility changes require catalog permission; size price changes require pricing permission. No approved product rates or catalog records were changed by this implementation.

## Database migration

`005-product-configuration.sql` advances the application schema to **5** through the existing startup migration transaction. It adds an immutable structural validator and two JSON shape constraints to the existing `products` and `quotation_items` tables. It adds no tables or columns and rewrites no product, customer, quotation, settings or credential records. Constraints use `NOT VALID` to avoid scanning/rejecting historical rows during deployment; new or updated rows are checked. Detailed conditions, graph dependencies, size availability and pricing limits are enforced by shared application validation.

Both migration SQL reapplication and repeated startup were executed successfully. A version-4 fixture with a legacy item lacking `fieldSnapshot` preserved its exact product/customer/quotation/item bodies, versions, amounts, quantities, settings, revision and credential hash. An invalid new size definition was rejected by the database constraint. Restore accepts schema-5 backups alongside schema 3/4. Existing backup, restore and SQLite import regressions passed.

The normal local application on port **6400 was not rebuilt or migrated**. It remains healthy with schema 4. All writes for verification used a separate Compose project, tmpfs PostgreSQL and a disposable app on port 6402. Starting Docker Desktop also resumed the existing normal containers; no normal business records were used for test mutations. A deployment should follow the repository's backup-first rebuild procedure; production migration/deployment was not run.

## API integration

No new routes are required. Extended product metadata is accepted/returned by product CRUD and `/api/catalog`. Whole-workspace PUT and batch `/api/changes` use the same product-definition and authorization checks. `/api/pricing/calculate` now also uses the shared configuration sanitizer, matching quotation preview/create/edit/reprice validation. Invalid definitions and quantities return 422. Existing CSRF, authentication, permission and version/revision checks remain in place.

Quotation create/edit calculates item quantities and prices server-side and stores additive `fieldSnapshot` JSON metadata. Unchanged saves and duplication preserve historical data; explicit repricing applies current definitions. `/api/quotations/{id}/pdf` and WhatsApp PDF preparation use the shared customer specification formatter. OpenAPI contains concrete condition, size and field schemas. Examples and limits are in [API.md](API.md).

## Files created

- `server/migrations/005-product-configuration.sql`
- `tests/phase1-domain.test.js`
- `tests/phase1-api.test.js`
- `tests/phase1-pdf.test.js`
- `tests/phase1-ui.test.js`
- `tests/phase1.browser.cjs`
- `docs/PHASE-1-IMPLEMENTATION.md`
- `docs/PHASE-1-TEST-RESULTS.md`

## Files modified

- `shared/domain.js`: extended the existing engine, validation, quantity derivation, safe public formatting and snapshots.
- `server/validation.js`: validated metadata, reusable size maps and multiselect values; preserved unchanged historical items.
- `server/access.js`: retained separate metadata and size-price permissions.
- `server/resources.js`: applied shared configuration sanitization to pricing requests.
- `server/pdf.js`: used safe public specifications in the existing Specifications column.
- `server/store.js`: applied migration 005 and guarded newer schemas.
- `scripts/restore.js`: accepted schema-5 backups.
- `server/openapi.js`: documented the extended request/response contract.
- `public/srs-ui.js`: extended existing editor/configurator and safe customer preview.
- `public/styles.css`: added responsive condition and size rows using existing design variables.
- `tests/access-whatsapp.test.js`: updated the expected latest migration version.
- `README.md`, `docs/API.md`: documented schema and configuration behavior.

## Executed verification - 26 October 2026

| Check | Result | Evidence |
| --- | --- | --- |
| Full Node/PostgreSQL regression suite | **PASS: 115 tests, 0 failures, 0 skips** | `test-results/phase1-postgres-suite.log`; 85 existing plus 30 new tests. |
| Expanded legacy migration preservation/HTTP checks | **PASS: 3 tests** | `test-results/phase1-api-migration.log`; rerun after strengthening preservation assertions. |
| Existing application browser suite | **PASS: 20 checks, 0 JavaScript exceptions** | `test-results/phase1-existing-browser.log`, `ui-regressions.json`. |
| Existing dropdown browser suite | **PASS: 20 checks, 0 JavaScript exceptions** | `test-results/phase1-dropdown-browser.log`, `dropdown-regressions.json`. |
| Phase 1 browser workflows | **PASS: 6 checks, 0 JavaScript exceptions** | `test-results/phase1-browser.json`. |
| Desktop/mobile editor and configurator | **PASS** | Clicked controls, saved/reopened data, screenshots; document width 390/390, modal 368/368 on mobile. |
| Rendered customer PDF | **PASS** | Browser-authenticated download rendered as one page; visible fields/custom sizes present, secret absent, no text blocks outside page; PNG visually inspected. |
| JavaScript syntax | **PASS** | `npm run check`: 43 JavaScript files; browser `.cjs` runners separately syntax checked. |
| Frontend build | **PASS** | `npm run build`. |
| Docker application build | **PASS** | `test-results/phase1-docker-build.log`. |
| Production dependency audit | **PASS** | `npm audit --omit=dev`: 0 vulnerabilities. |
| Whitespace checks | **PASS** | `git diff --check`. |
| Standalone lint/type-check | **NOT RUN** | This JavaScript project defines no separate lint/type-check scripts or TypeScript configuration. |
| Firefox/Safari | **NOT RUN** | Browser execution used installed Chromium. |
| Normal database/production deployment | **NOT RUN** | Normal app remains on schema 4; source and disposable schema-5 installation were verified. |

Every executed test/check is listed with PASS in [PHASE-1-TEST-RESULTS.md](PHASE-1-TEST-RESULTS.md). Test fixtures, logs, PDFs, renders and screenshots remain under ignored `test-results/`. The disposable app/database containers and network were removed after verification, along with private fixture credentials. Normal app/database containers remain healthy. Final readiness and served-asset comparisons are retained in `test-results/phase1-final-readiness.json`.

## Phase 1 completion checklist

- [x] Multiple ALL/ANY conditions and Equals/Not Equals work.
- [x] Legacy single conditions, including explicit empty-string equality, remain supported.
- [x] Invalid references/operators/options and direct/indirect dependency cycles are rejected.
- [x] Hidden values cannot persist, price or activate hidden descendants.
- [x] Reusable size definitions, custom/kids labels, ordering, disabled sizes and approved price adjustments work.
- [x] Size totals, integer validation, minimum/tier compatibility and saved quotation editing work.
- [x] Legacy T-shirt quantities and rates remain compatible.
- [x] Public fields appear in specifications; hidden/empty/duplicate entries are omitted.
- [x] Internal fields and notes remain excluded even with forged visibility metadata.
- [x] Server validation covers pricing, previews, CRUD, whole-state writes, batches and repricing.
- [x] Additive migration preserves legacy records and can be reapplied.
- [x] Existing authentication, permissions, pricing snapshots, PDFs, backup/import/recovery and quotation regressions pass.
- [x] Phase 1 only; no Phase 2/catalog expansion or normal installation deployment.

There are no remaining source-level Phase 1 blockers. Deployment against the normal persistent installation and other browser engines remain unverified. Size `price` is a per-unit surcharge within the current pricing model, not an independent replacement base-price model. Existing immutable customer PDFs cannot acquire newly enabled fields without generating a new quotation/PDF through the existing workflow.
