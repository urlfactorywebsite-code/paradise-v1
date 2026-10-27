# Phase 1 production-readiness review - 26 October 2026

**Recommendation: GO for Phase 2 development.** The reviewed Phase 1 source has no remaining known Critical or High defects after the fixes below. All executed acceptance checks pass in source and the disposable installation. Production deployment approval remains pending: the normal installation is still schema 4 and was not rebuilt/migrated during this review.

## Review scope

Reviewed all Phase 1 modified and created files, including shared calculations/defaults/visibility, validation, access control, resource endpoints, schema migration/startup/restore, OpenAPI, editor/configurator, PDF and browser preview, styles, tests and documentation. Phase 1 was uncommitted when the review began; that work was preserved. No Phase 2 functionality or UI redesign was introduced.

The application still uses the existing shared `DP` engine and JSON documents. HTTP writes retain authentication, CSRF, ownership, permissions, versions and transaction checks. A saved unchanged item ignores client-supplied calculated specifications and presentation metadata; new/changed items rebuild these server-side. Historical prices and presentation remain snapshots, with protected internal names overriding PDF visibility.

## Issues identified and fixed

Concrete failures were reproduced in executable tests before fixes; additional regressions cover implicit dimension cycles and invalid rule-reference choices. Initial failing outputs are retained in `test-results/phase1-review-reproductions.log` and `phase1-review-second-reproductions.log`.

| ID | Severity before fix | Finding and correction | Verification |
| --- | --- | --- | --- |
| R1 | High | Camel-case labels such as `InternalNotes`, `PrivateMemo` and `StaffNotes` bypassed public-specification label filtering. Centralized protected-name detection across keys, labels and legacy specifications. | Generated new/legacy PDFs; HTTP create and unchanged-save metadata forgery; actual browser preview/download. PASS. |
| R2 | High | Hidden dimensions retained `w`/`h`/`u`, allowing stale values to activate descendant specifications or extra charges. Dimension availability now follows visible dimension fields, with the existing intrinsic area-product behavior preserved. Inactive values are removed. | Hidden/visible dimension pricing and specifications; actual browser charge changes. PASS. |
| R3 | Medium | Circular dependency validation omitted implicit links from width/height/unit back to dimension fields. Those graph edges are now included. | Direct and transitive dimension cycles rejected; size/quantity and ordinary field cycle regressions pass. |
| R4 | Medium | Fixed/package visibility conditions could use a submitted quantity different from the billed quantity of one. Zero size totals could retain a stale positive quantity for conditions. Normalize actual quantity before visibility evaluation. | Fixed/package required fields and snapshots; zero/nonzero size conditions; existing quantity/tier/financial regressions. PASS. |
| R5 | Medium | Reappearing conditional dropdowns displayed a first option absent from `CF`; stale hidden defaults also remained on initial open. Added one editor preparation helper using shared defaults followed by shared hidden-field normalization. Size/quantity-driven reveals use it too. | New UI tests plus clicked browser hide/show, price, save and edit checks. PASS. |
| R6 | Medium | A malformed size row such as `null` caused an authorization TypeError before semantic validation, yielding an HTTP 500. Made metadata/price projections defensive so invalid definitions reach normal 422 validation. | Pure authorization checks and authenticated malformed product PATCH requests. PASS. |
| R7 | Medium | New reference-value checks rejected valid legacy optional-dropdown comparisons against None. Conversely, impossible string-to-number or number-to-text conditions were accepted. Allow the valid optional empty choice and enforce scalar reference types. | Legacy optional None, blank/missing values, typed references and ALL/ANY truth tables. PASS. |
| R8 | Low | Existing charge-rule dropdowns offered the new size-map type as a scalar condition reference, which the server correctly rejects. Excluded size maps from that choice list. | Scoped source inspection; editor/rule regression and browser suites. PASS. |
| R9 | Medium | A historical zero-count size that later became disabled/unavailable was rejected on item editing, but the UI only offered its clear action for nonzero entries. The recovery action now includes every unavailable key, including zero quantities. | Historical disabled-zero UI test and actual browser clear/update/save workflow. PASS. |

No approved catalog rates were edited. Financial fixes change how conditional charges are selected or how actual quantity is represented; they preserve existing pricing methods, integer-paise accounting and explicit snapshot/reprice behavior.

## Test execution and actual results

| Command/check | Result |
| --- | --- |
| `docker compose -p paradise-phase1-review -f compose.test.yaml build test` | PASS - current application image built. |
| `docker compose -p paradise-phase1-review -f compose.test.yaml run --rm --no-deps test node --test 'tests/*.test.js'` | PASS - **133 tests, 0 failures, 0 skips**. Includes the prior 115 and 18 review additions. |
| `npm run test:browser` against disposable port 6403 | PASS - **20 checks**, zero JavaScript exceptions. |
| `node tests/dropdowns.browser.cjs` | PASS - **20 checks**, zero JavaScript exceptions. |
| `node tests/phase1.browser.cjs` against disposable port 6403 | PASS - **6 checks**, zero JavaScript exceptions. |
| `node tests/phase1-review.browser.cjs` against disposable port 6403 | PASS - **4 checks**, zero JavaScript exceptions. |
| `npm run check` | PASS - 45 JavaScript files. |
| Explicit `node --check` for all four browser `.cjs` runners | PASS. |
| `npm run build` | PASS. |
| `npm audit --omit=dev` | PASS - zero vulnerabilities reported. |
| `git diff --check` | PASS. Git emits line-ending normalization warnings, with no whitespace errors. |
| Authenticated review PDF render and text/page-bound checks | PASS - one page, sizes/public specifications present, internal secret absent, no text outside page; rendered PNG inspected. |
| Standalone lint | NOT RUN - no linter script/configuration is defined. Syntax checking is recorded separately. |
| Static TypeScript checking | NOT RUN - no TypeScript project or type-check script is defined. |
| Firefox/Safari | NOT RUN. |
| Production load and public HTTPS installation | NOT RUN. |
| Normal persistent database upgrade/deployment | NOT RUN. |

The first full review run had one outdated test expectation: it expected an invalid *inactive* width to return 422. The new hidden-field policy safely discards that width. The test now verifies discarded inactive dimensions do not change the price and that invalid *visible* dimensions still return 422. A browser-runner selector was corrected to use the existing edit-screen label, Save quotation. The final full run passes all 133 tests and all 50 browser checks. All final individual statuses are in [PHASE-1-REVIEW-TEST-RESULTS.md](PHASE-1-REVIEW-TEST-RESULTS.md).

## Migration verification

Migration 005 remains unchanged by this review; no new migration is needed for these JavaScript fixes. It reuses the existing JSON bodies and adds structural checks without new tables, destructive operations or data backfills. `NOT VALID` intentionally avoids scanning historical rows during deployment while checking new/updated rows; application validation remains authoritative for semantic rules.

Executed results:

- PASS: clean database startup applies versions 3, 4 and 5 once, including two simultaneous app connections.
- PASS: populated version-4 upgrade preserves exact product/customer/quotation/item bodies, versions, settings, revision, quantities, amounts and credential hash, including an item without `fieldSnapshot`.
- PASS: SQL reapplication and repeated startup do not duplicate migration versions or constraints.
- PASS: injected failure after migration DDL rolls back both the DDL and version record. Retrying succeeds.
- PASS: a newer schema is refused without downgrade.
- PASS: invalid new size configuration is rejected by the database constraint.
- PASS: existing PostgreSQL persistence, numbering/concurrency, import, custom-format backup, restore and recovery regressions.
- NOT RUN: migration against the normal persistent database or a remote production database.

The normal installation was inspected read-only: schema **4**, **12 products**, **2 quotations**, **3 items**. Copies of its current definitions and complete business state passed current Phase 1 validation, preserving the quotation item snapshots and financial totals exactly. This verifies source compatibility with those records; it does not claim an executed normal-database migration or a deployed new frontend. Private snapshot files were used only as local review inputs and removed during cleanup.

## Regression, performance and maintainability findings

The prior 115 tests remain passing, including original sample financial totals, legacy single/array conditions, legacy T-shirt counts and explicit `sz` conversion, editing/duplication/explicit repricing, immutable snapshots, customer PDF layout/pagination, ownership/permissions, CSRF/authentication, reports, manual WhatsApp handoff and recovery. The application browser suite exercised existing screens, dialogs, all active configurators, large dropdowns, mobile overflow and manual sharing without external sending.

Visibility dependency lookup is centralized in one resolver with a field map and memoization; normalization reuses that context rather than re-evaluating the graph twice. The browser helper centralizes only presentation defaults; the shared engine remains authoritative. Field/rule/option/quantity limits bound input work. A synthetic 50-field, 1,225-condition, 50-iteration calculation sample averaged approximately **2.44 ms** locally with no calculation errors. This is diagnostic evidence, not a production throughput/load certification.

The existing frontend layering still overrides original functions from `app.js` in `srs-ui.js`; that pre-existing pattern remains a Low maintainability concern. Consolidating it is deferred because it is not necessary to fix Phase 1 and would broaden this review into unrelated restructuring.

## Files changed during this review

Production code:

- `shared/domain.js`: actual quantities; shared visibility/dimension dependency handling; protected-name policy; valid None and scalar condition checks.
- `server/access.js`: defensive projections for malformed size definitions while retaining catalog/pricing permission separation.
- `public/srs-ui.js`: shared editor preparation and safe newly visible defaults; valid rule-reference choices.

Tests:

- Modified `tests/phase1-api.test.js` and `tests/phase1-ui.test.js`.
- Added `tests/phase1-review.test.js`, `tests/phase1-migration-review.test.js` and `tests/phase1-review.browser.cjs`.

Documentation:

- Updated `docs/API.md` and linked this review from the initial implementation/results documents.
- Added this report and `docs/PHASE-1-REVIEW-TEST-RESULTS.md`.

Other Phase 1 files were reviewed and retained. Authentication, navigation, existing PDF styling, approved product data and unrelated modules were preserved.

## Acceptance criteria status

| Criterion | Status and boundary |
| --- | --- |
| Multiple ALL/ANY conditions and Equals/Not Equals | PASS - automated truth-table and actual browser checks. |
| Legacy conditions, including arrays, blanks and optional None | PASS - executed engine/validation regressions. |
| Invalid references/operators and direct/implicit circular dependencies rejected | PASS - executed validation and HTTP tests. |
| Hidden values cannot price, persist or enable hidden descendants | PASS - engine/HTTP/UI/browser checks, including dimensions. |
| Reusable size breakdown, custom labels, order and disabled sizes | PASS - domain/API/editor/browser checks. |
| Correct quantities, zero/invalid counts, tiers and approved price adjustments | PASS - calculation and persisted edit tests. |
| Public PDF fields, readable types, empty omission and deduplication | PASS - generated PDF tests, browser download and render. |
| Internal fields/notes excluded despite forged visibility metadata | PASS - new/legacy/HTTP/browser checks. |
| Backend authorization and frontend/backend consistency | PASS - separate pricing/catalog rights, invalid PATCH, save/reopen and retained regressions. |
| Existing products and quotations remain compatible | PASS - fixtures/regressions plus read-only copies of all current normal-installation records. |
| Additive, repeatable, transactional migration | PASS - isolated fresh/populated/concurrent/failure/retry tests. |
| New and existing relevant tests pass | PASS - 133 automated tests and 50 browser checks. |
| New source deployed to normal/production installation | NOT RUN - normal app remains schema 4. |

## Remaining issues and recommendation

| Severity | Remaining issue / verification gap | Effect on recommendation |
| --- | --- | --- |
| Critical / High | None known after executed fixes and checks. | No known Phase 1 source blocker for Phase 2 development. |
| Medium | Actual persistent/remote rollout, HTTPS/public hosting and production-load behavior were not executed. | Production release approval remains pending those environment checks and a backed-up rollout. |
| Low | Firefox/Safari are untested; no standalone lint/static type-check tooling exists. | Coverage/tooling gaps are explicit; no passing claim is made. |
| Low | Existing layered frontend overrides remain. | Future maintenance concern; restructuring deferred. |

**GO for Phase 2 development**, with Phase 1 source acceptance satisfied within the executed boundaries. This review does not approve an unexecuted production rollout. The normal database was not migrated, and Phase 2 was not started. Disposable services and private review inputs are removed after evidence collection.
