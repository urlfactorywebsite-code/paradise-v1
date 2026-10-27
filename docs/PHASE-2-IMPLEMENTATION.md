# Phase 2 - product configuration and compatibility

## Initial architecture and file-level plan

The existing application uses Node.js HTTP APIs, PostgreSQL 17 and versioned JSON product/item bodies. Browser code is plain JavaScript with the established shared dropdown controls. `shared/domain.js` supplies defaults, conditions, pricing in integer paise and snapshots to both browser and server. `server/validation.js` normalizes API input; `server/access.js` separates catalog and pricing permissions. `server/store.js` writes transactions and historical quotation snapshots. PDFs use the shared customer-specification policy.

Phase 1 dependencies are present and were inspected: ALL/ANY, Equals/Not Equals, dependency checks, hidden-value sanitization, reusable fields, backend authorization and PDF visibility. They will be reused. Existing uncommitted Phase 1 work is retained.

Planned files, before implementation:

| File | Necessary change |
| --- | --- |
| `shared/domain.js` | Backward-compatible option metadata, approved/active rates, structured size geometry, compatibility filtering/reconciliation/validation, derived eyelet quantities and explicit idempotent Phase 2 product setup. |
| `server/validation.js`, `server/access.js` | Validate the new metadata and policy, preserve separate pricing/catalog permission checks and reject invalid definitions. |
| `public/srs-ui.js`, minimal `public/styles.css` | Extend existing product/option editor and configurator with active/rate/approval/order/geometry controls and safe compatibility updates. |
| `server/openapi.js`, `docs/API.md` | Describe the extended existing product/pricing/quotation contracts. |
| `tests/phase2-*.test.js`, `tests/phase2.browser.cjs` | Domain, HTTP, permissions, snapshots, migration/schema reuse, PDF, editor and actual browser coverage. |

No new tables are needed. Phase 2 setup is an explicit Admin draft action, followed by the existing versioned save, rather than a migration that silently replaces Admin catalog/rule/pricing records. Setup is restricted to Visiting Card and Flex Printing and must be idempotent. Historical quotes keep their item snapshots and rates. Existing unmapped free-text material/printing values remain readable; editing/repricing offers current approved selections.

## Pricing and approval decisions

New material and printing examples are inactive, unpriced choices until Admin supplies and approves rates. Ropes, Stands and separate Hemming likewise start pending. None means no extra charge. Existing rates, including Pipe Pockets and the bundled Hemming & Eyelets charge, are retained. A separate eyelet choice cannot be combined with the retained bundle.

Eyelet policy proposed for explicit business approval: Corners Only = four corners per piece. Every 2 Feet uses `2 * (ceil(widthFt / 2) + ceil(heightFt / 2))`, with each corner counted once, then multiplies by item quantity. Non-None eyelets remain blocked until both rate and policy approval are configured. Tests may explicitly approve fixture policies; that does not approve production policy or prices.

Existing area conversion, quantity, minimum base charge, taxes, discount and rounding remain authoritative. Material/printing/accessory option amounts are additional charges on top of the current base model, shown separately. No replacement base rate or price split is inferred.

## Implementation summary

All seven Phase 2 capabilities are implemented within the existing engine/editor. The setup action is available only for existing `GD-VC` and `PR-FX` products and requires catalog and pricing permissions. It creates a reviewable draft; the normal versioned product save applies it. Repeating setup does not duplicate fields or managed rules. Manual rules are preserved and checked for conflicts; an existing rule using a reserved Phase 2 ID blocks initial setup with a clear message rather than being overwritten.

1. **Visiting Card Custom finish:** existing finishes remain. Custom adds no automatic surcharge and exposes required Custom Finish Details, stored in configuration and restored on edit. Its default customer visibility is enabled and remains configurable under the existing PDF policy. Any additional job cost must be configured/approved through Admin pricing.
2. **Shape and Size:** three managed constraints derive allowed sizes from explicit width/height/unit or custom geometry. Labels are not parsed to classify geometry. Canonical template dimensions can initialize known existing choices, independently of their order; unknown choices require Admin geometry. Shape changes retain a valid size or reset to an allowed one. Custom geometry exposes existing measurement inputs; the backend validates dimensions and rejects incompatible combinations.
3. **Flex Material:** the text field becomes an Admin-managed per-area dropdown. Example names start inactive with null, unapproved rates. Admin can add, rename display labels, order and disable choices without rewriting stable values. Existing text defaults are retained as Admin provenance for mapping; historical quotation values stay readable.
4. **Flex Printing Type:** the text field becomes an Admin-managed dropdown with existing charge bases. Rates are server-controlled and require explicit approval before new selection. Missing/unavailable mandatory prices produce errors; Material and Printing cannot be hidden or made optional to bypass pricing.
5. **Eyelets:** a separate dropdown supports None, Corners Only and Every 2 Feet. Rates and counting-policy approval are separate. Server-derived per-piece and total counts are persisted on new items and appear in public specifications. The user explicitly chose to leave the production counting policy pending Admin approval. Approved policy/rates in tests are disposable fixtures only.
6. **Accessories:** None and Pipe Pockets remain, retaining the existing Pipe Pockets rate. Ropes and Stands are added as inactive/unpriced choices. Supported charge bases remain available. For per-unit bases, Admin can select item quantity or a positive integer configuration field; the supplied accessory count is per piece. Its visibility follows applicable options. A single selected accessory prevents duplicate/mutually incompatible selections.
7. **Compatibility:** Visiting Card gets three geometry-driven rules. Flex gets a bundle-protection rule. Rules use the existing product-specific condition/allowed-option architecture. Backend checks cover invalid references, meaningful cycles, pairwise and higher-order contradictions, including multiselect controllers. Complex searches are bounded and fail clearly. Harmless legacy self-rules that retain their triggering choice remain operational. No Fabric/Printing restriction was added: no approved mapping was supplied or established in the repository.

## Configuration and pricing changes

Existing option tuples stay `[stableValue, chargeType, amount]`. Optional `optionMeta` adds display label, enabled status, approval, order, geometry, quantity source/rule and bundle metadata. Null means pending pricing; it never silently becomes zero. A legacy numeric option without metadata retains its prior behavior. An explicitly approved zero amount remains a valid no-extra-charge choice.

Material, printing, hemming, eyelets and accessories flow through the existing shared charge calculation. Material/area charges use existing converted area multiplied by item quantity and configured rate. The retained base charge/minimum is applied as before. Field charges are additional to that base, not replacement base prices. Existing tiers, base-only percentage supplements, minimum charge, discounts, tax modes/GST and integer-paise rounding remain unchanged.

The eyelet candidate policy counts each rectangular corner once: four for Corners Only; `2 * (ceil(widthFt/2) + ceil(heightFt/2))` for maximum two-foot spacing. It multiplies the per-piece count by item quantity and uses the existing unit-conversion factors. Approval is required before non-None use. Accessory quantity fields multiply item quantity only for unit bases; fixed, percentage and area bases retain their established meanings.

The original Hemming & Eyelets option and rate remain intact. Its structured bundle flag generates a constraint permitting only None for separately priced eyelets. A new separate Hemming choice starts unpriced/inactive; no split of the old bundled rate is guessed. Manual setup or rate changes do not automatically reprice any quotation.

## Backend, API and security integration

No new routes or separate material/printing/accessory controllers were introduced. Product CRUD and catalog/state responses carry the metadata. Product updates, batch changes and whole-state saves share the extended validation and authorization. Pricing, preview, quotation create/edit/reprice and PDF generation use the shared engine and snapshot policy.

Catalog changes and pricing approval remain separately authorized. Rate, quantity-pricing, geometry and policy changes receive pricing checks; activating/removing a Phase 2 profile requires both catalog and pricing rights. Client totals, lines, specifications and derived quantities are ignored/rebuilt. Saved unchanged and duplicated items retain trusted snapshots. A changed item or explicit reprice validates current choices and approvals. Existing ownership, CSRF, authentication and record version/revision protections remain in force.

OpenAPI and [API.md](API.md) document the new optional metadata and computed quantities. A pricing response/new item can contain `computed.eyelets:{perPiece,total}`. Public specifications use readable labels and counts while retaining internal-only field/notes exclusion. Historical unmapped values are shown as saved/unavailable choices when editing, with a requirement to select a currently approved value for a changed item.

## Frontend integration

The existing product editor now provides **Prepare Phase 2 configuration**, managed option cards, approval/enabled checkboxes, ordering controls, supported rate bases, geometry inputs, eyelet policy approval and accessory quantity-source selection. Managed geometry/bundle constraints are visibly read-only; other Admin rules remain editable. All controls use existing forms, cards, grids and the shared dropdown enhancement. No navigation, theme, page or stylesheet redesign was needed.

The quotation configurator filters incompatible choices, preserves valid selections, reports compatibility resets, restores saved values, shows unapproved/unavailable pricing errors and updates existing calculation lines. Backend totals were compared with the browser preview. Customer previews/PDFs use the existing layout and visibility policy.

## Database and rollback

**No additional SQL migration is necessary.** Phase 2 reuses Phase 1 schema **5**, existing JSON product/item bodies and transactional writes. No tables/columns were added, no records were removed, and no deployment-time product/rate seed is run. Existing schema constraints accept the extended JSON; semantic checks remain in shared/backend validation.

Executed verification includes fresh version 3/4/5 startup, populated legacy migration preservation, SQL/startup repeatability, concurrent startup, failed-DDL rollback/retry and newer-schema refusal from the retained regression suite. Phase 2 API tests persist/read the metadata and verify that restoring the original product through versioned PUT preserves both original and subsequently created quotation snapshots. The original product definition and database backup should be retained for an actual rollout; no normal-installation rollback or deployment was performed here.

A read-only copy of the normal installation contained **12 products and 2 quotations**. Both Phase 2 profiles were staged on the copy and validated: item snapshots and totals stayed identical. This was an in-memory compatibility check, not a migration or write to that database. Private copied inputs and fixture credentials were removed after verification. The disposable browser container, database and network were removed; the normal installation remained healthy and its final `/api/ready` response reported PostgreSQL schema 4.

## Files created

- `tests/phase2-domain.test.js`
- `tests/phase2-api.test.js`
- `tests/phase2-ui.test.js`
- `tests/phase2.browser.cjs`
- `docs/PHASE-2-IMPLEMENTATION.md`
- `docs/PHASE-2-TEST-RESULTS.md`

## Files modified for Phase 2

- `shared/domain.js`: option metadata, setup/synchronization, geometry, compatibility availability/conflict checks, derived quantities and safe specification formatting.
- `server/validation.js`: normalized/validated metadata, pending rates, policy, stable rule IDs and managed constraints.
- `server/access.js`: preserved metadata/pricing permission separation and protected profile/quantity-policy changes.
- `public/srs-ui.js`: existing Admin/configurator integration and approval controls.
- `server/openapi.js`: extended existing contracts.
- `README.md`, `docs/API.md`: usage and data/approval semantics.

Existing Phase 1 files and unrelated dirty work were preserved. No Phase 2 changes were made to T-shirt size breakdowns/locations, Logo Design requirements, promotional shared templates, catalog migration, Excel import or catalog checklists.

## Executed results - 26 October 2026

| Check | Actual result |
| --- | --- |
| Full Node/PostgreSQL suite in separate Compose project | **PASS - 158 tests, 0 failures, 0 skips**; includes all prior 133 and 25 Phase 2 additions. |
| Existing application browser suite | **PASS - 20 checks**, zero JavaScript exceptions. |
| Existing shared-dropdown browser suite | **PASS - 20 checks**, zero JavaScript exceptions. |
| Phase 1 feature browser suite | **PASS - 6 checks**, zero JavaScript exceptions. |
| Phase 1 review-fix browser suite | **PASS - 4 checks**, zero JavaScript exceptions. |
| Phase 2 browser workflows | **PASS - 7 checks**, zero JavaScript exceptions. |
| Admin/configurator 390px mobile overflow and visual checks | **PASS**. |
| Authenticated Visiting Card and Flex PDFs | **PASS** - both one page, expected specifications/counts present, no text outside page, rendered pages inspected. |
| `npm run check` | **PASS - 48 JavaScript files**. |
| Explicit syntax checks for five browser `.cjs` files | **PASS**. |
| `npm run build` and Docker image build | **PASS**. |
| `npm audit --omit=dev` | **PASS - zero reported vulnerabilities**. |
| `git diff --check` | **PASS**; Git reports only line-ending normalization warnings. |
| Static lint / TypeScript checking | **NOT RUN** - this project defines no separate lint/type-check tooling or TypeScript project. |
| Firefox/Safari and production load | **NOT RUN**. |
| Normal-installation rebuild/deployment | **NOT RUN** - normal application remains schema 4; verified disposable source installation uses schema 5. |
| Actual business price/policy approval | **NOT APPROVED** - new business rates and the eyelet policy remain pending. |

Raw evidence is retained under ignored `test-results/`: `phase2-postgres.log`, `phase2-docker-build.log`, `phase2-existing-browser.log`, `phase2-dropdown-browser.log`, `phase2-phase1-browser.log`, `phase2-phase1-review-browser.log`, `phase2-browser.log`/JSON, mobile screenshots, `phase2-card.pdf`, `phase2-flex.pdf`, PDF renders and the live-copy compatibility result. Individual tests and the requested 34-case mapping are in [PHASE-2-TEST-RESULTS.md](PHASE-2-TEST-RESULTS.md).

Testing also caught a maximum-length stable-option key producing a managed rule ID longer than the prior rule-ID limit. The bounded rule-ID allowance now accommodates the generated prefix plus an option value, and an authenticated save/re-save/rollback regression verifies the round trip. The initial reproduction is retained in `phase2-boundary-reproduction.log`; the final full suite passes. Unknown existing geometry, reserved-ID collisions, retained text defaults and unchanged historical items are covered without guessed mappings or prices.

## Acceptance status

| Acceptance criterion | Status |
| --- | --- |
| Custom Finish and required details | PASS - domain, HTTP, editor and browser. |
| Structured Shape/Size compatibility and custom dimensions | PASS - domain, HTTP, browser and geometry-label tests. |
| Admin Material pricing | PASS - implementation and approved fixtures; actual rates pending. |
| Admin Printing Type pricing | PASS - implementation and approved fixtures; actual rates pending. |
| Independent Eyelets and correct quantities/charges | PASS - implementation and explicitly approved fixture policy; business approval remains pending as requested. |
| Additional accessories, rates and quantities | PASS - domain/API/editor/browser; actual new rates pending. |
| Hemming/Eyelets do not double-charge | PASS - preserved bundle rate, generated constraint, HTTP rejection and browser reset. |
| Approved sample compatibility setup | PASS - three Visiting Card rules and Flex bundle protection; repeatable and manual-rule safe. |
| Backend rejects invalid combinations/pricing | PASS - pricing, previews, CRUD, batch/state writes and permission tests. |
| Existing quotations/prices remain operational | PASS - old snapshots, free-text history, edits, duplicate/reprice/rollback and normal-data copy. |
| PDF generation | PASS - generated tests and authenticated downloads/render review. |
| New and existing regressions | PASS - 158 automated tests and 57 browser checks. |

## Remaining approvals and risks

New 220/280 GSM/Backlit material rates, Solvent/Eco-solvent charges, separate Hemming, eyelet piece rates, Ropes and Stands rates need actual business input. None was invented or marked approved in the setup defaults. Existing priced choices remain as configured. The proposed eyelet convention is mechanically tested but intentionally unapproved for business use. No unsupported Fabric/Printing mapping was seeded.

Applying setup to customized products may require classifying unknown sizes, mapping retained free-text defaults and resolving conflicting manual rules. Errors block saving/quoting rather than guessing. Profile setup is explicit because it changes new-item configuration requirements. A backed-up normal deployment and actual Admin approvals remain outside the executed source/disposable verification. Other browser engines and production load are unverified. There are no remaining known Phase 2 implementation test failures.
