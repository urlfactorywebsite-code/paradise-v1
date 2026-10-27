# Phase 4 implementation and verification - 26 October 2026

## Result and validation boundary

Phase 4 implements the documented scope of requirements **21, 22, 23 and 26** through the existing application. The complete Node/PostgreSQL suite passes **278/278**, with no skipped or cancelled tests. The 28-product inventory and assignment matrix are in [the catalog audit](PHASE-4-CATALOG-AUDIT-2026-10-26.md); the file-level analysis and implementation plan are in [the implementation plan](PHASE-4-IMPLEMENTATION-PLAN.md).

This is source and disposable-installation verification. The normal installation at `http://127.0.0.1:6400` was read only: its schema remains **4**, its original **12 products** remain, and its 28 missing placeholders were not silently inserted. The updated source uses schema **5** through the existing additive migration from Phase 1. No production/VPS deployment, real rate approval, normal product activation, Phase 5 implementation or Phase 6 production validation was performed.

The documented manifest has **40 required entries**: the supplied 28 plus 12 existing documented seed products. The original complete SRS product-list artifact is unavailable. Coverage of that unavailable list is **BLOCKED**, rather than claimed complete.

## Architecture findings

| Area | Existing architecture and Phase 4 decision |
| --- | --- |
| Frontend | Plain browser JavaScript in `public/srs-ui.js`, existing dialogs, shared field editor and dropdown system; production assets in `dist/`. No framework replacement or navigation/theme redesign. |
| Backend | Node HTTP server, existing resource routing, CSRF, permissions, optimistic versions/revisions, audit and PostgreSQL transactions. No parallel API service. |
| Persistence | PostgreSQL 17, relational product/category/quotation tables with JSON product definitions and workspace settings. Templates and assignments fit existing documents. |
| Categories | Three existing flat categories; no subcategory model. Existing category IDs are retained. No speculative taxonomy migration. |
| Configuration | `shared/domain.js` remains the shared browser/server engine. Phase 1 conditions, numeric/SIZE_BREAKDOWN and PDF visibility; Phase 2 managed options/compatibility/backend validation; Phase 3 gift references/overrides are reused. |
| Inheritance | A product references a template with semantic-to-local field mapping, disabled fields, explicit full overrides, order and required-field policy. Private projection provenance prevents forged/flattened inherited fields. Recursive template inheritance is unsupported and rejected. |
| Pricing | Existing integer-paise calculation, quantity semantics, area units/conversion, taxes, tiers and charge rules. No new commercial pricing model or guessed rates. |
| Quotations/PDF | Existing saved item/configuration/product snapshots and jsPDF generation. Current template edits do not rewrite historical quotations. Internal fields remain excluded from customer PDFs. |
| Authorization | One company workspace with existing roles/permission overrides. Catalog and pricing permissions are independent; master rates require pricing read/manage access. No tenant model exists. |

## Catalog and template implementation

`shared/catalog.js` owns a maintainable manifest, exact documented aliases, identity matching, preparation and readiness. Stable product codes and persistent manifest links take priority. Alias fallback also requires the expected category and pricing method. There is no fuzzy merge. Conflicting codes, ambiguous records and duplicate aliases are surfaced for explicit review; preparation does not merge or create another ambiguous record.

Preparation is explicit, previewable, transactional and repeatable. It creates only genuinely missing records with stable IDs, `on:0`, `priceConfigured:false`, `rate:null` and `tax:null`. Existing approved prices, IDs and activation are retained. Existing active products are preserved and flagged for configuration review where needed. Existing inactive approved options and custom definitions are preserved. Cleanup archives only unchanged known generic sample fields; referenced fields, Delivery, dimensions and compatible extras remain, including their rates. No quotation history is rewritten.

| Template | Implementation |
| --- | --- |
| Print Product | Shared Size, Paper, Sides and Finish. Seven specifically requested print products inherit these; actual choices/rates remain Admin maintained. Required-field assignment policy allows future shared labels/options to propagate without creating accidental full overrides. |
| Area Product | Existing Width, Height and Unit dimension field plus Material, optional Lamination and optional Installation. Existing measurement/rounding engine is reused. Effective Dimensions cannot be overridden/mapped to an incompatible type. |
| Gift Product | Existing Phase 3 Promotional Gift template: Product Model, Material, Colour, Customization Type, Printing Method, Packaging and Artwork Requirement. The same projection/override mechanism is reused. |
| Stationery Product | Shared Paper, Size, Sides and optional Binding. Product-specific disabling, conditions and overrides remain available through the existing editor. |

All four use the same additional-field, order, required/optional, visibility, conditions, compatibility, option management, backend validation and customer-PDF contracts. Mapped fields retain local IDs/options/rates and are charged once. Explicit full Admin overrides remain isolated to their product. Existing quantity behavior is retained.

Readiness was measured in both relevant preparation paths. The 28 genuinely new records prepared from the normal copy have 12 Incomplete / 16 Complete configurations; the 28 prepared existing source-seed records have 26 Incomplete / 2 Complete configurations because their mapped required Material/Customization policies are preserved. In each path, all 28 remain pricing Pending and inactive. Structural Complete does not approve optional commercial choices or rates.

The seven requested Print products are Envelope, ID Card & Lanyard, Bill Book, Catalogue, Invitation, Danglers and Menu Card. ID Card adds optional Lanyard Type and Lanyard Customization; Bill Book adds required Admin-managed Number of Copies and optional Carbon Sets; Catalogue adds required positive integral Page Count. The broad 1..1,000,000 numeric bound is structural input validation, not an approved commercial page limit. No DL/C5 availability, paper grammage, finishing method, lanyard option or associated rate was invented.

Social Media Poster and Custom Graphic Designs retain their existing service pricing method, disable inherited physical controls and add Design Requirements/Output Specifications. Offset/Digital Printing use Stationery with optional Binding. Ink-Transfer Sticker material/transfer choices need confirmation. Gazebo/Kiosk uses Area configuration while retaining its existing **unit** pricing method; construction, measurement and the commercial pricing basis need business confirmation. These mappings are visible warnings, with details in the assignment matrix.

## Backend and API changes

The existing resource layer supplies template management, catalog preparation preview/apply and catalog verification. See [the API reference](API.md) and `server/openapi.js` for exact request/response and permission contracts.

- Catalog reads load categories, products and template settings in three queries, without loading historical quotation state or making per-product queries.
- Checklist status derives from actual activation and pricing evidence: Missing, Inactive (Price Pending), Active, plain Inactive when pending evidence is absent, and Conflict for unresolved identities. Active products with incomplete pricing receive a separate warning and are not silently deactivated.
- Configuration and pricing readiness are independent. Structural/option/relationship/template errors remain visible even when base pricing exists. Defined options can make configuration complete while their unapproved prices remain pending.
- Search includes documented aliases; category, status and template filters and bounded pagination preserve backend global counts. Filter aliases and `template=none` are normalized.
- Existing permission/CSRF/revision enforcement protects every write. Stale or malformed preparation requests do not partially commit.
- Users without `pricing.view` or `pricing.manage` receive redacted master prices in catalog/product/template/state/settings responses. Saved quotation amounts remain available under quotation permissions.
- Omitted private pricing is restored server-side during authorized metadata saves. Explicit price tampering is rejected. New name-only options persist as null-priced, unapproved options; a blank price is never silently approved as zero. Explicit configured zero remains distinguishable.
- Creating a new quotation, including a duplicate with saved snapshots, checks current product/category activation before accepting saved-price shortcuts. Reading and editing unchanged historical lines retain their snapshots. Rejected creation consumes no quotation number.

## Admin and quotation integration

Catalog Verification is part of the existing Products & Services screen. It shows the backend's required/missing/inactive/active/conflict counts, source coverage, product/category/template, actual status, separate readiness and detailed missing requirements. It supports name/alias search, category/status/template filtering, page size and paging, and opening the existing product editor.

The existing template manager edits all four definitions through the common field editor. Review/apply identifies stable records and intended templates before mutation; informational mapping warnings remain reviewable, while actual assignment conflicts block preparation of the affected record. Safe other records can still be prepared with issues reported. Existing assignments can be reviewed/prepared again. Loading, error/retry, empty, stale-response and mobile states are covered.

The restricted-user browser check reproduced omitted prices displayed as zero and a legacy option dialog exposing rate controls without pricing access. The canonical product table now distinguishes Pricing access restricted from Pricing pending. The existing editor hides private price/approval controls and makes them read-only for users who can view but cannot manage rates. Pending option creation retains null/unapproved values for both kinds of catalog editor. A focused regression exercises these permission combinations; backend rejection of unauthorized pricing changes remains enforced.

Quotations use the existing dynamic configurator and selector. Inactive/pending products cannot bypass backend activation/pricing checks. Synthetic approved fixtures were used only in disposable databases to exercise all seven print products and each template family through create, save, reopen, edit and protected PDF download. Normal business prices and activation were not changed.

## Files and migrations

The repository already had unrelated and prior-phase uncommitted work. It was preserved without reset, broad staging or commit. This list describes this Phase 4 refinement, not every dirty file in the checkout.

| Kind | Files |
| --- | --- |
| Created | `docs/PHASE-4-IMPLEMENTATION-PLAN.md`, `docs/PHASE-4-CATALOG-AUDIT-2026-10-26.md`, `docs/PHASE-4-IMPLEMENTATION.md`, `tests/phase4-catalog.test.js`, `tests/phase4.browser.cjs` |
| Refined existing Phase 4/domain work | `shared/catalog.js`, `shared/domain.js`, `tests/phase4-domain.test.js`, `tests/phase4-api.test.js`, `tests/phase4-ui.test.js` |
| Backend | `server/access.js`, `server/resources.js`, `server/store.js`, `server/validation.js`, `server/openapi.js` |
| UI/docs | `public/app.js`, `public/srs-ui.js`, `public/styles.css`, `docs/API.md`, `README.md` |
| Regression fixtures | `tests/backend.test.js`, `tests/phase2-api.test.js`, `tests/phase3-api.test.js`, `tests/phase3-readiness-api.test.js`, `tests/phase3-review-api.test.js` |
| New Phase 4 SQL migrations | **None.** Existing JSON structures suffice. Existing Phase 1 migration `005-product-configuration.sql` was tested on restored schema-4 data. |

The previous full-suite shared Finish label propagation failure is resolved by persisting requiredness separately from a full field override. The concurrency regression fixture now asserts one successful update and one conflict independently of which simultaneous request wins. Catalog role fixtures refresh their own permission-scoped state after login; price-tampering fixtures explicitly receive `pricing.view` but not `pricing.manage`, retaining their rejection assertions. These corrections preserve the authorization and concurrency contracts rather than suppressing assertions.

## Executed validation

| Check | Result | Evidence |
| --- | --- | --- |
| Entry full Node/PostgreSQL baseline | FAIL: 244/246 | `test-results/phase4-implementation-baseline.log`: inherited shared-label failure and nondeterministic concurrent-winner assumption. |
| Final complete Node/PostgreSQL suite | PASS: **278/278**, zero failures/skips | `test-results/phase4-implementation-final-full.log`; isolated project `paradise-phase4-implementation-all`. Includes 54 Phase 4 tests across catalog/domain/API/UI. The earlier 277/277 snapshot is retained as `phase4-implementation-full-before-ui-permission-fix.log`. |
| Restored normal database migration/preparation | PASS | `test-results/phase4-implementation-database.json`; source schema 4 -> disposable schema 5, repeated migration and preparation. |
| Original records and history | PASS | Every complete original product JSON body compared equal: **12/12**, including all definitions, metadata, IDs, rates and activation. User/category/customer/quotation/item/history/sequence row hashes unchanged. Normal source hashes unchanged. |
| New missing records | PASS | Exactly 28 created, all inactive, null new prices/tax; 40 total, 12 active, 28 inactive, 0 missing, 0 conflicts after explicit preparation in the restored copy. |
| Approved quotation preservation | PASS | Actual source has zero approved quotations; two explicitly approved disposable fixtures retain rows and totals. This is fixture proof, not a claim of existing approved source records. |
| Referential integrity | PASS | Zero product/category, quotation/customer or item/quotation orphans in restored/prepared copy. |
| Database dump handling | PASS | Native PGDMP verified/restored in memory; no source dump written to disk. Disposable copy removed afterward. |
| Prior browser regression suites | PASS: **75/75** | `test-results/phase4-regression-browser-summary.json`: existing 20, dropdown 20, Phase 1 6, Phase 1 review 4, Phase 2 7, Phase 3 7, Phase 3 review 6, quantity 2, readiness 3; all nine processes exit 0. Dropdown suite explicitly asserts no browser exceptions. |
| Phase 4 browser workflows | PASS: **25/25**, zero exceptions | `test-results/phase4-browser.json`: Admin plan/apply/idempotence, all 28 assignments, inactive exclusion, four template editors, filters/global counts/paging/error/mobile, isolated overrides, seven print products plus six representative families through create/save/reopen/edit/PDF, unchanged history/original products, and a real catalog-only label/new-option save preserving hidden rates. |
| PDF rendering and visual review | PASS: **13 documents / 13 pages** | `test-results/phase4-pdf-review.json` and `phase4-pdf-render/`: every page rendered with PyMuPDF because Poppler is unavailable; all 13 contact-sheet pages inspected, representative Print/Gift/Area/Digital pages also at full resolution. No clipping, overlap, missing eligible specifications, unreadable glyphs or private-note markers observed. |
| Syntax and production build | PASS | `npm run check`: 65 JavaScript files; `node --check`: 10 browser CJS scripts; `npm run build`; logs `test-results/phase4-implementation-check-final.log` and `phase4-implementation-build-final.log`. |
| Production dependency audit | PASS: zero reported vulnerabilities | `npm audit --omit=dev --json`, `test-results/phase4-implementation-audit.json`. |
| Standalone lint and TypeScript | NOT RUN | No lint script, TypeScript source/compiler configuration or typecheck script exists. JavaScript syntax checks were executed. |
| Cross-tenant requests | NOT RUN / not applicable | One shared company workspace; no tenant identity or cross-tenant route contract. Actual user/permission restrictions were tested. |
| Other browsers, production load, VPS/deployment | NOT RUN | Outside this Phase 4 source/disposable acceptance scope. |

The final browser evidence totals **100 passing checks** across the 75 prior regressions and 25 Phase 4 checks. Browser fixtures deliberately use synthetic approved prices only on guarded disposable loopback installations, with `TEST_DISPOSABLE=1`; the Phase 4 runner refuses the normal port 6400. UI runner-only locator/sign-out confirmation corrections were replayed to a complete passing run. Earlier attempt artifacts are retained and are not counted as passing runs. Production source and Node test hashes remained unchanged across the final automated run; only the independent browser runner changed while its final replay was being prepared (`test-results/phase4-implementation-tested-source.json`).

All three root-owned disposable Compose projects and the temporary restored-copy container were removed after verification. Their private fixture environment/credential files were removed; test logs, JSON evidence, screenshots and rendered PDFs remain under ignored `test-results/`. Pre-existing containers were preserved. Final normal `/api/ready` returns `ok:true`, `database:postgresql`, `schemaVersion:4` (`test-results/phase4-implementation-normal-readiness.json`).

## Acceptance mapping

PASS below means the behavior was exercised by the executed domain/API/UI/full-suite checks and, where indicated, browser/database evidence. It does not approve actual business rates or certify deployment.

| User test | Acceptance | Status | Evidence |
| --- | --- | --- | --- |
| 1 | All 28 accounted for | PASS | Catalog manifest/catalog audit test and identity matrix. |
| 2 | Missing detection | PASS | Catalog/API tests and read-only normal inventory (28 missing). |
| 3 | No existing duplication | PASS | Alias/conflict tests and prepared-copy inventory. |
| 4 | Idempotent setup | PASS | Catalog/API tests and twice-run restored-copy preparation. |
| 5 | Stable existing IDs | PASS | Catalog tests and original 12 copy comparison. |
| 6 | No accidental activation | PASS | Catalog/API tests, 28 inactive prepared-copy result. |
| 7 | No invented mandatory price | PASS | Null-rate/tax copy assertions and pricing/option API tests. |
| 8 | Approved active products preserved | PASS | Catalog fixtures and original 12 copy comparison. |
| 9 | Print template | PASS | Domain/UI/API rendering and configuration tests. |
| 10 | Area template | PASS | Domain/UI tests including supported unit conversions. |
| 11 | Phase 3 Gift reuse | PASS | Existing template identity/projection and all Phase 3 regressions. |
| 12 | Stationery template | PASS | Domain/UI template tests. |
| 13 | Isolated product overrides | PASS | Domain/API/UI override tests. |
| 14 | Shared definitions reusable | PASS | Shared update propagation and normalized save/reload tests. |
| 15 | Duplicate fields prevented | PASS | Mapped overlap, single-charge and invalid definition tests. |
| 16 | Invalid template reference rejected | PASS | Domain/API atomic rejection tests. |
| 17 | Circular inheritance rejected | PASS | Domain/catalog dependency rejection tests. |
| 18 | Existing products compatible | PASS | Full prior-phase regressions and preserved original 12 fixtures. |
| 19 | Envelope | PASS | Seven-print HTTP create/save/reopen/PDF test. |
| 20 | ID Card & Lanyard | PASS | Same, plus documented optional lanyard fields. |
| 21 | Bill Book | PASS | Same, plus managed copies/carbon sets. |
| 22 | Catalogue | PASS | Same, plus positive integral Page Count rejection tests. |
| 23 | Invitation | PASS | Seven-print HTTP create/save/reopen/PDF test. |
| 24 | Danglers | PASS | Seven-print HTTP create/save/reopen/PDF test. |
| 25 | Menu Card | PASS | Seven-print HTTP create/save/reopen/PDF test. |
| 26 | Invalid options rejected | PASS | Backend configuration/option tests. |
| 27 | Product-specific values persist | PASS | API save/reopen assertions and snapshot tests. |
| 28 | Existing quotations readable | PASS | Historical API tests and unchanged row hashes. |
| 29 | Missing status | PASS | Checklist catalog/API/UI tests. |
| 30 | Inactive price pending status | PASS | Checklist evidence-based status tests. |
| 31 | Actual active status | PASS | Checklist tests, including incomplete-active warning. |
| 32 | Accurate global counts | PASS | Backend filtering/paging and UI tests. |
| 33 | Filters | PASS | Category/status/template/none/conflict API/UI tests. |
| 34 | Search | PASS | Actual names/codes/documented alias tests. |
| 35 | Assignment display | PASS | Checklist/template UI and preview tests. |
| 36 | Incomplete warnings | PASS | Separate configuration/pricing readiness tests. |
| 37 | Unauthorized Admin access blocked | PASS | Independent role/CSRF/pricing API tests. |
| 38 | Cross-tenant rejection | NOT RUN | No multi-tenant model; user permissions tested separately. |
| 39 | Existing active selectable | PASS | Prior configuration/UI/API regressions. |
| 40 | Inactive cannot be newly quoted | PASS | New quote and duplicate-with-snapshot API tests. |
| 41 | Dynamic fields | PASS | Four-family UI and seven-print API tests. |
| 42 | Backend rejects invalid config | PASS | Required/disabled/incompatible/page-count tests. |
| 43 | Existing prices unchanged | PASS | Mapped rates/single charges and original 12 copy comparison. |
| 44 | Historical quotations unchanged | PASS | Snapshot tests, row hashes and approved copy fixtures. |
| 45 | Quotation editing | PASS | Seven-product API save/reopen and historical edit tests. |
| 46 | PDF generation | PASS | Seven-product PDF HTTP tests plus full PDF regression suite. |
| 47 | Authentication | PASS | Full login/session/account/CSRF/role regression suite. |
| 48 | Production build | PASS | `npm run build`. |
| 49 | Relevant regressions | PASS | Full 278-test Node/PostgreSQL suite and 100 browser checks. |

| Phase 4 requirement | Status | Remaining boundary |
| --- | --- | --- |
| 21: all 28 identity/status/configuration audit and safe setup | PASS | Applying to normal installation was not requested as deployment and was not performed. |
| 22: four reusable templates | PASS | Actual commercial options and approved rates remain Admin/business inputs. |
| 23: seven product configurations and integration | PASS | Synthetic approved disposable fixtures prove the technical path; no live business approval is inferred. |
| 26: backend-driven Admin checklist | PASS | Full original SRS coverage beyond documented 40 remains BLOCKED. |

## Business approvals and Phase 5 recommendation

All 28 unapproved placeholders remain inactive in the prepared copy. New missing products have no base price/tax; inherited/new mandatory option rates are pending. Existing seed placeholders with sample zero/rate metadata retain `priceConfigured:false` and must not be treated as approved free products. Business owners must supply actual sizes, paper/material specifications, sides/finishes, gift/customization/printing/packaging options, Bill Book copies/carbon choices, approved prices/taxes and applicable constraints. Confirm the exceptional mappings described above and provide the authoritative complete SRS manifest when available.

**GO for separately authorized Phase 5 development** once this Phase 4 source is reviewed. **NO-GO for activating the pending products or claiming full SRS/production readiness** until approved business inputs, complete manifest coverage and a separately authorized deployment/production validation are available. Phase 5 Excel import, bulk pricing, new approval/activation workflows and Phase 6 work were not started.
