# Phase 3 - advanced product configuration and promotional gifts

For the current checkout, use the [26 October completion and verification report](PHASE-3-COMPLETION-2026-10-26.md). It records the new quantity-dependency correction, fresh execution and Phase 4 work already present at entry. The assessment below describes the earlier implementation snapshot.

The subsequent [production-readiness review](PHASE-3-PRODUCTION-READINESS.md) found and fixed additional security, validation and usability defects. Its final verification results supersede the initial readiness assessment below.

## Initial architecture findings and implementation plan

The existing application uses a Node.js HTTP server, PostgreSQL 17, plain browser JavaScript, existing styled dropdowns, and jsPDF. Products and quotation item configurations are stored as versioned JSON documents alongside relational identifiers, prices, quantities and ownership. `shared/domain.js` provides the existing integer-paise pricing, quantity tiers, conditions, configuration validation and customer specification snapshots. `server/validation.js` validates all write paths; `server/access.js` enforces separate catalog and pricing permissions. Existing quotations retain saved item and customer/company snapshots until an explicit existing repricing workflow.

Phase 1's reusable `SIZE_BREAKDOWN`, advanced conditions, PDF visibility and backend checks are present. Phase 2's managed active/approved options and backend-authoritative pricing are also present. Both are reused; existing uncommitted work is preserved. The initial isolated PostgreSQL regression baseline passed **158 tests, zero failures or skips** (`test-results/phase3-baseline.log`).

Before implementation, the remaining gaps were the legacy T-shirt size/location setup, customer requirements for T-shirt and Logo Design, and shared gift inheritance. The existing five gift products have compatible local keys/options/rates that must remain authoritative. The application has a single workspace, with user permissions and quotation ownership; it has no tenant model.

| Files | Planned change |
| --- | --- |
| `shared/domain.js` | One shared gift definition, reference resolution, explicit product setup, stable mappings/overrides/disabling, text/custom-choice/selection metadata and validation. |
| `server/validation.js`, `server/access.js` | Normalize the resolved effective definition, persist local fields plus references, validate all endpoints, preserve independent permissions including inherited rates. |
| `server/resources.js`, `server/openapi.js`, `docs/API.md` | Shared-template retrieval/update using existing transactional workspace mutation, catalog template discovery and authoritative effective pricing. |
| `public/srs-ui.js`, minimal existing styles | Extend current Admin editor/configurator and pricing view; retain navigation and visual design. |
| `tests/phase3-*`, `tests/phase3.browser.cjs` | Domain, PostgreSQL/HTTP, permissions, historical preservation, customer PDF, real browser and responsive verification. |

No Phase 3 tables or destructive migration are needed. Existing schema 5 JSON storage supports the additive metadata. Setup is an explicit reviewable Admin draft, followed by the existing save workflow; it does not automatically alter saved Admin definitions or the 28 placeholder products. The normal persistent app/database and production deployment are outside the verification mutations.

## Shared gift template architecture

`state.set.giftTemplate` stores one `promotional_gift` definition with seven stable semantics: `model`, `material`, `color`, `customization`, `printing`, `packaging`, `artwork`. Products retain their existing/local `f` array and a `giftTemplate` reference with mappings, disabled semantics and explicit replacement overrides. Resolution projects effective fields for rendering, validation, pricing and new item snapshots. Resolved inherited fields are not copied into every persisted product.

Mappings preserve existing field identifiers and charges. Mug `type` and calendar `stand` are presented as Product Model; paper bag `print`, key chain `cust`, and shield `plate` reuse the compatible existing printing/customization definitions. Additional local fields, including Size, Setup, Sheets and Plate, coexist without duplicate controls or charges. Unknown references, conflicting mappings and nested/circular inheritance are rejected.

## Data, pricing and compatibility decisions

T-shirt preparation converts the legacy sizes to the existing reusable `sz` field without changing their prices. Admin can add sizes, reorder/disable entries and set existing-model per-piece adjustments. Size quantities drive the backend item quantity, minimums and tiers. New print locations use a unique multiselect and the existing fixed/per-unit/percentage/area/quantity charge bases. The original location-count field and its exact options/rates are archived as compatibility metadata; historical quotations are not mapped to invented physical locations. Editing a historical item requires explicitly replacing its location count before new pricing.

New location rates and new gift dropdown choices start pending, unavailable and unapproved. Required selections cannot silently become free. Optional new gift selections may remain blank, retaining the existing product price. Admin can explicitly approve a zero charge if the business intends that rate. Custom dropdown values require an approved configured custom charge. No actual business prices are supplied by this implementation.

Design Requirements, Logo Additional Requirements and gift Artwork Requirement use the existing text field with multiline input and existing safe length/character validation. `show_on_customer_pdf` controls public specifications. Existing internal-field protection and snapshot rendering keep internal notes private and historical customer documents consistent.

## Backend/API and frontend integration

`GET/PUT /api/configuration-templates/promotional-gift` reads/updates the shared definition with a workspace revision. It uses the existing authentication, CSRF, transaction, audit and permission enforcement. Catalog metadata and rate approvals retain independent permissions; a template edit does not grant company-settings access. `/api/catalog` returns the shared definition. Existing product CRUD, state saves, atomic batches, pricing, quotation preview/create/edit and explicit repricing share validation. All raw local definitions and overrides are normalized, including definitions hidden by an active override or disabled field.

Authorization compares effective fields, retained raw master fields, disabled overrides and archived legacy fields in distinct namespaces. Tests verify that a custom local key cannot hide a changed price, and that a catalog-only user can change mapped PDF visibility without acquiring pricing permission. Invalid metadata returns 422, unauthorized changes return 403 and stale revisions return 409.

The existing product editor provides **Prepare Phase 3 configuration** for the seven scoped products and a shared gift-template editor. Setup prepares a reviewable draft; the normal save applies it. Existing editor controls manage sizes/options/rates, PDF visibility and conditions. Products can disable inherited semantics, add local fields and create explicit overrides. Effective fields also drive the existing pricing screen and quotation editor. New narratives use textareas. The existing CSS, navigation and PDF design are retained; Phase 3 requires no CSS change.

## Files created

- `tests/phase3-domain.test.js`
- `tests/phase3-api.test.js`
- `tests/phase3-pdf.test.js`
- `tests/phase3-ui.test.js`
- `tests/phase3.browser.cjs`
- `docs/PHASE-3-IMPLEMENTATION.md`
- `docs/PHASE-3-TEST-RESULTS.md`

## Files modified by Phase 3

- `shared/domain.js`: reusable shared gift projection/setup, requirements, managed custom selections, selection limits and private Notes protection.
- `server/validation.js`: shared field normalization, effective product validation, template metadata and explicit Phase 3 size-total consistency.
- `server/access.js`: independent catalog/pricing authorization across template, local, overridden, disabled and archived definitions.
- `server/resources.js`: shared-template endpoint, catalog metadata and resolved authoritative pricing.
- `server/openapi.js`, `docs/API.md`: concrete template/reference/field contracts and existing endpoint behavior.
- `public/srs-ui.js`: existing Admin/configurator/pricing integration, multiline inputs and historical location display.
- `tests/phase1-pdf.test.js`: preserve public-text coverage with a public Memo fixture and verify internal Notes cannot be published.

Other dirty files found on entry belong to the pre-existing Phase 1/2 work and were preserved. Phase 3 adds **no database migration**, changes no approved catalog prices automatically, and does not migrate placeholder products. Deploying the combined source still requires the existing Phase 1 schema-5 migration; this was exercised only in disposable databases.

## Executed verification

| Check | Result | Evidence |
| --- | --- | --- |
| Pre-change full Node/PostgreSQL baseline | **PASS: 158 tests** | `test-results/phase3-baseline.log` |
| Final full Node/PostgreSQL suite | **PASS: 193 tests, 0 failures, 0 skips** | `test-results/phase3-postgres.log`; source hashes match before/after execution. |
| Existing UI browser | **PASS: 20 checks** | `phase3-existing-browser-regression.json` |
| Existing dropdown browser | **PASS: 20 checks** | `phase3-dropdown-browser-regression.json` |
| Phase 1 / review / Phase 2 browsers | **PASS: 6 / 4 / 7 checks** | Respective `phase3-*-browser-regression.json` files. |
| Final Phase 3 browser | **PASS: 7 checks** | `phase3-browser.json`; rerun after final backend security changes. |
| Browser total / JavaScript exceptions | **PASS: 64 / 0** | `test-results/phase3-browser-summary.json` |
| Mobile Admin/configurator, 390px | **PASS** | Browser bounds assertions and visually inspected screenshots. |
| Customer PDF rendering | **PASS** | Four ordinary examples each one page; long sample two pages; six rendered pages inspected, no out-of-page text. |
| JavaScript syntax / browser runner syntax | **PASS: 52 / 6 files** | `phase3-check.log`, `phase3-browser-syntax.log` |
| Frontend build / production Docker image | **PASS** | `phase3-build.log`, final suite's Docker build log. |
| Production dependency audit | **PASS: 0 reported vulnerabilities** | `phase3-audit.log` |
| Whitespace | **PASS** | `git diff --check`; line-ending normalization warnings only. |
| Separate lint / TypeScript | **NOT RUN** | No separate lint/type-check tool or TypeScript project is configured. |
| Cross-tenant test | **NOT RUN** | No multi-tenant model exists; existing account/ownership tests pass. |
| Firefox/Safari / production load | **NOT RUN** | Actual browser execution used installed Chrome. |
| Normal/production deployment | **NOT RUN** | Normal port 6400 remains healthy on schema 4. Disposable app used schema 5. |

All test artifacts are under ignored `test-results/`. [PHASE-3-TEST-RESULTS.md](PHASE-3-TEST-RESULTS.md) maps the requested 45 cases to executed evidence.

Disposable browser/test containers and networks were removed after verification, along with their private credential/env fixtures. Final readiness confirms only the normal app/database remain running and healthy; `test-results/phase3-normal-final-readiness.json` reports PostgreSQL schema 4.

## Phase 3 acceptance checklist

| Criterion | Status |
| --- | --- |
| T-shirt dynamic sizes work | PASS |
| Size breakdown reuses Phase 1 | PASS |
| Total quantity is accurate and mismatches rejected | PASS |
| Multiple print locations work | PASS |
| Print charges respect configured basis | PASS |
| T-shirt Design Requirements | PASS |
| Logo Additional Requirements | PASS |
| Paper Bag configuration | PASS |
| Key Chain configuration | PASS |
| Mug configuration and historical type mapping | PASS |
| Table Calendar configuration and Stand mapping | PASS |
| Shield & Trophy configuration | PASS |
| Shared gift template | PASS |
| Product overrides, disabling/restoring and additional fields | PASS |
| Existing prices preserved | PASS |
| Backend pricing validation | PASS |
| Eligible customer PDF fields | PASS |
| Internal Notes excluded | PASS |
| Historical quotations compatible | PASS |
| No duplicate charges | PASS |
| No new regression failures | PASS |

## Outstanding risks and GO / NO-GO

**GO for Phase 3 source integration:** implementation, final full regressions and browser/PDF verification pass. There are no known remaining Phase 3 source blockers.

**NO-GO for enabling pending new paid choices until Admin supplies and approves their actual rates.** No price was invented or approved for the business. Optional new gift selections can remain blank; preparing T-shirt named locations makes its required location selection unavailable until approved rates exist. Existing legacy location-count rates remain archived and are never assigned to guessed physical locations.

Normal/production deployment, backup/rebuild and actual business configuration are **NOT RUN**. The persistent normal database and quotation records were not used for test writes. The normal running app is still the pre-existing schema-4 installation; source/disposable results do not certify that install as Phase 3. Visible size breakdowns retain Phase 1's role as the positive-quantity driver; conditional hiding switches back to ordinary quantity. Requirements fields honor their independent required/optional flags. Other browser engines and production load remain unverified.

Phase 4 placeholder migration, Excel pricing import, catalog checklist screens and Phase 5 enhancements were not started.
