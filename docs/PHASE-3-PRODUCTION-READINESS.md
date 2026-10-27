# Phase 3 production-readiness review - 26 October 2026

**Current assessment:** the [latest production-readiness audit](PHASE-3-READINESS-AUDIT-2026-10-26.md) supersedes the release recommendation below. It records five further corrections, 224 automated tests and 75 browser checks. The current checkout contains pre-existing Phase 4 work and a failing Phase 4 test. Phase 3 scoped checks pass; a clean full-checkout release and live activation remain NO-GO.

This review covers the actual uncommitted implementation of requirements 6-15. It supersedes the initial Phase 3 readiness assessment. Phase 1/2/3 work present at entry was preserved; Phase 4 was not implemented.

## A. Implementation gaps discovered

The application remains the existing Node.js/PostgreSQL application with plain JavaScript, shared integer-paise pricing and immutable quotation snapshots. No React, ORM or TypeScript project is present. The review inspected the Git diff and existing field, pricing, permission, persistence, API, configurator, preview and PDF paths. A fresh baseline executed **193 tests, all passing** before refinement.

| Finding | Severity | Result |
| --- | --- | --- |
| Enumerable client `__giftRaw` / `__giftBase` properties could impersonate projection provenance, bypass pricing permission and replace persisted product identity/rates. | CRITICAL | Fixed with module-private `WeakMap` provenance and explicit rejection of supplied markers. CRUD, PATCH, whole-state and batch regressions verify atomic 422 rejection. |
| Invalid approved-null custom charges and malformed masked/disabled option definitions could be saved and only fail at quotation time. | HIGH | Existing validators now check effective and retained inactive definitions at save time; pending unapproved rates remain supported. |
| Frontend shared pricing derived a mismatched T-shirt total while the backend rejected it. | MEDIUM | One shared size-total validator now governs both paths. Phase 1 legacy derivation is retained. |
| Setup accepted incompatible existing requirements dropdowns or a single-select named location control and claimed completion. | MEDIUM | Setup rejects incompatible collisions without modifying Admin definitions/rates; compatible text fields gain multiline input. |
| Disabling inherited fields left stale saved values that prevented current item editing. | MEDIUM | Explicitly disabled inherited values are removed from current editable configuration; unchanged historical items retain snapshots. |
| Switching text to dropdown retained incompatible metadata and introduced an implicit approved zero option. | MEDIUM | Type changes clear incompatible metadata; newly introduced options remain pending and unapproved. |
| Requirements textarea imposed 2,000 characters although the existing backend supports a configured limit up to 4,000. | MEDIUM | Textarea honors the field limit/default; long instructions save, reopen and print. |
| Saved disabled multiselect locations disappeared from the editor without a clear recovery action. | MEDIUM | Saved choices remain visible and unavailable, with an explicit action to clear them before revision. |
| Product overrides could not be reset to shared inheritance in Admin UI. | MEDIUM | Added a draft-only reset action using the existing editor; mapped master rates and other products remain intact. |
| Product field removal/addition could generate duplicate local keys. | LOW | New keys are chosen from the unused identifiers. |
| Conditional field disable errors escaped as browser exceptions. | LOW | The invalid draft change is rejected with a clear error and restored controls. |
| Price/template reads loaded all quotations, items, histories and audit rows to obtain catalog configuration; UI visibility repeatedly cloned/resolved the same product. | MEDIUM | Selective single-statement readers avoid historical data; configurator filtering reuses the resolved product. |

## B. Defects fixed and architecture retained

Shared gift definitions remain a single reference in workspace settings. Products retain stable local keys, mappings, explicit overrides and disabled semantics; inherited fields are projected rather than copied across five catalog definitions. Mug `type` and calendar `stand` still map to Product Model. Paper Bag printing, Key Chain customization and Shield/Trophy plate charges retain compatible mappings. Additional Size, Setup and Sheets fields remain operational.

Existing fixed, unit, quantity, area and percentage charge bases, quantity tiers, discount allocation, GST and integer-paise rounding are reused. No business rate, approved master rate or historical location mapping was invented. New paid options remain pending until explicitly configured/approved. No Phase 4 product migration or pricing import was added.

## C. Files modified during refinement

Source changes: `shared/domain.js`, `server/validation.js`, `server/resources.js`, `server/store.js`, `public/srs-ui.js`. One stale size-total fixture was corrected in `tests/phase3-domain.test.js` to use a backend-valid matching quantity. Documentation links and API behavior notes were updated in `docs/API.md`, `docs/PHASE-3-IMPLEMENTATION.md` and `docs/PHASE-3-TEST-RESULTS.md`.

New verification files: `tests/phase3-review-domain.test.js`, `tests/phase3-review-api.test.js`, `tests/phase3-review-performance.test.js`, `tests/phase3-review-ui.test.js`, `tests/phase3-review.browser.cjs`, and this report. No schema, infrastructure, navigation, CSS or PDF layout change is required by this refinement. Other dirty files predate the review.

## D. Database verification

A read-only custom-format PostgreSQL dump of the normal installation was restored to a separate tmpfs PostgreSQL 17 container. Restore fingerprints matched exactly. Running schema-5 startup twice preserved exact business/user rows, versions, settings, quotation amounts and item bodies. Explicit Phase 3 setup was then exercised only on that copy; historical rows and totals remained unchanged. Referential checks found **zero violations**.

The normal database contained one user, three categories, 12 products, one customer, two quotations and three quotation items. It had no approved quotations. A separate disposable fixture marked the two copied quotations approved before migration; their rows and totals were preserved exactly across repeated migration. This fixture does not represent actual business approval. Source before/after fingerprints matched, and the normal app stayed on schema 4. Read-only duplicate/reference inventory found zero duplicate product codes, zero duplicate field keys and zero historical references missing a current product. Historical product references intentionally have no product foreign key, preserving quotations after catalog removal.

Phase 3 and this refinement introduce **no migration**. Existing migration 005 is additive/idempotent and does not rewrite historical JSON documents. Existing structural constraints, version/revision guards, foreign keys and historical product-ID retention remain intact. Evidence: `test-results/phase3-review-database.json` and `phase3-review-live-copy.log`.

## E. Pricing accuracy

Deterministic synthetic fixtures verify size quantities/surcharges; multiple fixed/per-piece/percentage locations; gift model, material, customization, printing and packaging charges; preserved setup charges; quantity tiers; discounts; inclusive/exclusive GST; and paise rounding/final totals. Frontend shared calculations, backend calculation, quotation preview and saved item values agree. Quote reopening and explicit repricing remain separate from unchanged snapshot saves.

Independent raw, overridden, disabled and archived rate authorization remains in place. Duplicate fields/charges, invalid selections and pending custom rates are rejected. Product overrides do not modify shared definitions or other products. The selective-reader API regression prevents full-history loading while checking correct totals and inactive-category rejection.

## F. Security findings

The critical projection-marker bypass is closed with non-serializable private provenance; it is not solved by trusting a different client property name. Invalid markers are rejected even when sent by an Administrator. Unauthorized actual rate mutations return 403; malformed metadata returns 422; stale revisions remain 409; rejected mutations preserve data and versions.

All effective and retained field definitions are validated before storage. Customer requirements remain plain text, escaped in UI/preview and printed as text in PDFs. Internal item notes and protected internal fields remain excluded regardless of forged visibility metadata. Existing authentication, CSRF/origin checks, permissions, session revocation and immutable quotation ownership regressions are included in the full suite. The system has one workspace, so a cross-tenant test is not applicable; no new roles were introduced.

## G. Customer PDF verification

The existing PDF renderer and styling are retained. Automated and authenticated browser PDFs cover dynamic sizes, named locations, Design Requirements, Logo Additional Requirements and gift Artwork Requirements. Empty optional fields are omitted; internal notes are absent. Saved field snapshots preserve historical labels/visibility/rates rather than acquiring current template changes.

Long instructions were saved/reopened and rendered across two readable pages, with a continuation header, complete end marker, terms/totals and no text outside page bounds. Rendered pages and mobile configurator screenshots were visually inspected. Evidence: `phase3-review-pdf-checks.json`, `phase3-review-long.pdf` and page PNGs under ignored `test-results/`.

## H-I. Executed automated and regression tests

| Verification | Result | Evidence |
| --- | --- | --- |
| Fresh entry Node/PostgreSQL baseline | **PASS: 193/193**, no failures/skips | `phase3-review-baseline.log` |
| Final complete Node/PostgreSQL suite | **PASS: 211/211**, no failures/skips | `phase3-review-postgres.log` |
| Final actual Chrome browser suites | **PASS: 70/70**, no failures or JavaScript exceptions | `phase3-review-browser-summary.json` |
| Existing browser regressions | **PASS: 64** - existing UI 20, dropdowns 20, Phase 1 six, review four, Phase 2 seven, Phase 3 seven | Respective `phase3-review-*-regression.log` / JSON artifacts. |
| New review browser workflows | **PASS: six** | `phase3-review-browser.log` / JSON |
| Rendered customer PDFs | **PASS: five documents, six pages**, complete long-text end marker, no internal note and no out-of-page spans | `phase3-review-pdf-checks.json`; rendered pages visually inspected. |
| Source/test freeze during final suite | **PASS: identical hashes before/after** | `phase3-review-source-before.json`, `phase3-review-source-after.json` |
| Focused HTTP security/validation/performance | **PASS: 15/15** | `phase3-review-api.log` |
| New review tests included in final suite | **PASS: 18** - eight domain, three API, six UI, one selective-reader integration | New `phase3-review-*.test.js` files. |
| JavaScript syntax | **PASS: 56 files** | `phase3-review-check.log` |
| Browser runner syntax | **PASS: seven files** | `phase3-review-browser-syntax.log` |
| Frontend production build | **PASS** | `phase3-review-build.log` and final browser rebuild. |
| Production Dockerfile build | **PASS** | Final PostgreSQL suite builds the production image. |
| Production dependency audit | **PASS: zero reported vulnerabilities** | `phase3-review-audit.log` |
| Live-copy restore/migration/preservation | **PASS** | `phase3-review-database.json` |
| Deterministic price/tax/discount/rounding | **PASS** | Review-domain hand-calculated assertions, all existing pricing/API tests, browser comparison. |
| Pricing calculation microbenchmark | **PASS: 10,000 representative host calculations recorded in 577ms** | `phase3-review-pricing-performance.json`; indicative fixture timing, not a production-load certification. |
| Standalone lint / TypeScript | **NOT RUN** | No such tool/project is configured. Existing syntax/build checks executed. |
| Cross-tenant testing / React performance | **NOT RUN** | No tenant or React model exists; ownership/access and plain-JavaScript workflows were tested. |
| Firefox/Safari / production load | **NOT RUN** | Installed Chrome and disposable installations were used. |
| Normal/production deployment | **NOT RUN** | Normal app remains unchanged on schema 4. |

Raw evidence is under ignored `test-results/`. New browser coverage includes customer text longer than 2,000 characters, harmless rendering of HTML-like input, mapped override reset, unavailable print locations, dependency-disable feedback, disabled inherited selections and historical snapshot preservation.

Disposable audit/browser containers and networks were removed after verification. Private credential/env fixtures and the temporary live-copy dump were deleted. Only the normal app/database remain running and healthy; final `/api/ready` returns PostgreSQL/schema 4 (`phase3-review-normal-final-readiness.json`).

## J. Remaining issues and operational gates

- **CRITICAL:** none known after the executed regression checks.
- **HIGH:** new business prices still need actual Admin configuration/approval before enabling paid options. The normal installation has not been rebuilt/deployed to schema 5/Phase 3. These are live activation gates, not authorization to deploy during this review.
- **MEDIUM:** production-load certification and Firefox/Safari execution are not performed; this review uses disposable PostgreSQL and installed Chrome. Existing full-workspace write architecture is retained; this is not a capacity certification.
- **LOW:** this JavaScript project has no standalone lint/TypeScript check. Visible size breakdowns retain the existing positive quantity-driver semantics; conditional hiding enables ordinary quantity entry.

## K. Final acceptance checklist

| Acceptance item | Result |
| --- | --- |
| 6. Dynamic reusable T-shirt sizes, custom sizes, quantities and approved adjustments | PASS |
| 7. Multiple named print locations, configured charge bases and legacy readability | PASS |
| 8. T-shirt Design Requirements, optional/required behavior and PDF visibility | PASS |
| 9. Logo Additional Requirements with unchanged package pricing | PASS |
| 10. Paper Bag fields with existing pricing/setup preserved | PASS |
| 11. Key Chain fields with existing customization/setup preserved | PASS |
| 12. Mug Product Model mapping, packaging/setup and historical data | PASS |
| 13. Calendar Product Model mapping, Sheets and historical data | PASS |
| 14. Shield & Trophy fields, Model/Plate options and prices | PASS |
| 15. Shared template references, product isolation, overrides/reset, disabling and additional fields | PASS |
| Backend authority, malformed options/quantities and independent permissions | PASS |
| Frontend/backend pricing, discount, GST and rounding consistency | PASS |
| Quotation save, reopen, edit, preview and customer PDF workflow | PASS |
| Historical data, approved fixture totals and internal-note privacy | PASS |
| Responsive UI and safe customer text rendering | PASS |
| Complete existing regressions and production build | PASS |
| Phase 3 scope retained; Phase 4 not implemented | PASS |

## L. GO / NO-GO

**GO for Phase 4 development.** Requirements 6-15 and the audited release checks pass after refinement. Phase 4 was not started.

**Phase 3 source is production-ready for the verified scope and ready for a controlled release. The normal running installation is not yet ready to use Phase 3.** Live activation is **NO-GO** until actual business rates are configured/approved and the existing backup-first deployment/migration procedure is executed and verified on the intended installation. Those actions were not performed by this audit. Pending options cannot be selected or silently billed at zero.

The release assessment is limited to the executed environments: PostgreSQL 17, the production Dockerfile build and installed Chrome with desktop/390px layouts. It does not certify production capacity, other browser engines or external provider behavior.
