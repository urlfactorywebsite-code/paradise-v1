# Phase 3 production-readiness audit and refinement - 26 October 2026

This is the current readiness assessment for requirements 6-15. It supersedes earlier Phase 3 release recommendations. The review inspected the actual uncommitted diff, shared configuration/pricing engine, Admin/configurator, authorization, APIs, PostgreSQL storage/migrations and customer PDF paths. Existing Phase 1-3 work and pre-existing Phase 4 files were preserved. No Phase 4 feature was implemented.

## A. Implementation gaps discovered

The application remains Node.js/PostgreSQL 17 with plain browser JavaScript and jsPDF. The existing reusable size/condition/option engines, integer-paise pricing, template references, stable mappings, independent permissions and immutable quotation snapshots were retained. No replacement architecture, role, pricing service or schema was needed.

| Gap | Severity before correction | Reproduced behavior |
| --- | --- | --- |
| A renamed legacy Print Locations field was not recognized by explicit Phase 3 preparation | HIGH | Keeping its standard label under a custom key retained the old selector and added a new multiselect, allowing two printing charges. |
| Size reads included inherited JavaScript properties | MEDIUM | A permitted `toString` size omitted from a sparse quantity object caused valid backend pricing to fail; the frontend could render a function instead of zero. In-process inherited numeric properties could create phantom totals/specifications. |
| Shared option quantity references did not follow mapped field keys | MEDIUM | A valid inherited charge referring to a mapped numeric shared field failed validation instead of using the retained product identifier. |
| Size-dependent refresh replaced the active number input | MEDIUM | Actual keyboard input moved the caret: inserting digits at the start could reverse their order and change quantity incorrectly. |
| Long valid custom size labels overflowed a mobile dialog | LOW | A 100-character unbroken label produced a dialog scroll width of 929px at a 390px viewport. |

These were defects in Phase 3 configuration/editing paths, not reasons to introduce another engine. No further reproducible Phase 3 authorization bypass, PDF leakage, unnecessary SQL migration or duplicate inherited charge was found in the executed review.

## B. Defects fixed

1. **Legacy printing collision:** preparation now refuses a noncanonical existing Print Locations mapping with a clear review message. It leaves the original fields/rates intact rather than guessing a historical location or adding a second charge.
2. **Explicit size quantities:** shared totals, size charges and customer specifications read own properties only. Browser size inputs and displayed totals follow the same rule. Legitimate prototype-named size keys remain usable when explicitly supplied; omitted entries mean zero.
3. **Mapped quantity pricing:** inherited option metadata remaps shared quantity references to stable product keys. Retained local metadata keeps its existing local references. Template definitions are not mutated, and projection/strip round trips create no accidental override.
4. **Keyboard editing:** quantity-dependent sibling fields refresh while the active size-control subtree remains attached. Focus and numeric caret survive. Real keyboard tests cover replacement typing and insertion at Home, alongside recalculated dependent fields.
5. **Responsive labels:** two rules scoped to `.size-quantities` allow existing field labels to shrink and wrap. Existing design, typography, navigation and unrelated controls are unchanged.

Four new domain regressions and the two new UI regressions were observed failing before their corresponding corrections. HTTP and browser coverage verifies the integrated result. No approved rate was introduced or changed by these corrections.

## C. Files modified during refinement

| File | Change |
| --- | --- |
| `shared/domain.js` | Legacy print-field collision guard, own-property size reads, inherited quantity-reference remapping. |
| `public/srs-ui.js` | Own-property size input/total reads and caret-preserving dependent-field refresh. |
| `public/styles.css` | Scoped long-size-label wrapping; existing CSS retained. |
| `tests/phase3-quantity-ui.test.js` | Two regressions for omitted prototype-named sizes and inherited quantities. |
| `tests/phase3-readiness-domain.test.js` | **New:** four regression tests for printing collisions, sparse/inherited quantities and mapped quantity pricing. |
| `tests/phase3-readiness-api.test.js` | **New:** two HTTP scenarios covering calculation, preview, save/reopen/PDF, mapped pricing and atomic security rejection. |
| `tests/phase3-readiness.browser.cjs` | **New:** three E2E checks for sparse sizes, real keyboard editing, price agreement, save/reopen/PDF and long-label mobile bounds. |
| This report and the existing README/Phase 3 report pointers | Current verification and release assessment. |

No backend route, authorization module, SQL migration, database schema, PDF renderer or infrastructure source changed during this refinement. Source manifests record the entry and final hashes. Dedicated Phase 4 files/tests and unrelated dirty work remain unchanged; the shared resolver correction is required by Phase 3 gifts.

## D. Database verification results

**PASS: read-only normal-database dump restored into an isolated PostgreSQL instance.** The private `PGDMP` dump stayed in memory. Source-table hashes were compared before and after the audit; no normal database mutation was performed.

| Verification | Result |
| --- | --- |
| Exact restore of source business/account tables | PASS |
| Schema 4 copy upgraded to schema 5, followed by repeated startup | PASS; business rows/totals unchanged |
| Explicit Phase 3 setup on the restored copy | PASS; historical quotations/items/history, customers, accounts and sequences unchanged |
| Referential integrity in restored data | PASS; zero orphan product/category, quotation/customer or item/quotation references |
| Approved-quotation preservation | PASS on **two explicitly marked approved fixtures in a second disposable database**, across migration and Phase 3 setup |
| Original database after all copy operations | PASS; source hashes and aggregate totals unchanged |

The actual source contains one account, three categories, 12 products, one customer, two quotations, three items, two quotation-history rows and one number sequence. It currently contains **zero approved quotations**. Approved-fixture results therefore demonstrate the preservation path without claiming that the normal installation had approved documents. The existing fresh/concurrent startup, migration ordering, failed-DDL rollback/retry and newer-schema refusal tests also pass.

Phase 3 adds no migration. Existing Phase 1 migration 005 supplies the additive schema-5 constraints; it does not rewrite historical product/item bodies or prices. Products reference one JSON template assignment, while the validator rejects duplicate/conflicting mappings and effective field keys. Database primary/foreign keys and existing record-ID validation remain authoritative.

Evidence: `test-results/phase3-readiness-database.json`, `phase3-readiness-live-copy-final.log` and the final PostgreSQL regression logs. Copied databases/containers and private fixtures were removed after verification. The normal app remains healthy on PostgreSQL/schema 4; deployment was NOT RUN.

## E. Pricing accuracy results

**PASS:** frontend and backend use the same resolved configuration and integer-paise engine. The backend validates active/approved choices and rebuilds prices rather than trusting client totals or snapshots.

| Deterministic fixture | Verified result |
| --- | --- |
| Shirt: quantity 10, existing base 260000 paise, configured Front charge 1.25 per piece | Subtotal **261250**; omitted custom sizes add zero quantities/charges |
| Same shirt with six explicitly selected custom-size pieces at a 2.03 adjustment | Subtotal **262468**, with each selected adjustment charged once |
| Mapped gift: ten units at base 10, quantity source 3, customization 2.50 per source unit | Base **10000**, customization **7500**, subtotal **17500** paise |
| Combined fixed/unit/percentage/area/quantity print bases | Independent arithmetic agrees; subtotal **276634** paise in the retained fixture |
| Shirt subtotal 271014; 7.5% discount and 18% GST | Discount **20326**, taxable **250688**, GST **45124**, grand total **295812** paise |
| Five gifts across all existing option combinations and tested tier boundaries | **192 combinations** retain quantity, base, subtotal, tax treatment, taxable amount, GST and grand total |

Existing model/material/customization/printing/packaging/setup rates remain in their mapped definitions and charge once. Mug `type` and Calendar `stand` produce one Product Model field. Product-specific changes do not alter another product or the shared definition. Required pending rates are blocked, optional new fields may remain blank, and explicitly approved zero charges retain their existing meaning. All new rates in tests are disposable fixtures, not business approvals.

Unchanged saved items and duplicates retain trusted prices/specifications. Changes to configuration or the explicit repricing workflow invoke current validation. No approved historical quotation was automatically recalculated.

## F. Security audit findings

**PASS within the verified single-workspace architecture.** Fresh domain/HTTP checks cover:

- Separate catalog and pricing permissions, including effective fields, shadowed raw rates, disabled overrides, archived legacy rates and template rates.
- Rejection of supplied projection provenance markers; trusted provenance remains module-private process state.
- Invalid/disabled option IDs, duplicate selections, negative/fractional/string/object quantities, reserved size keys and malformed retained definitions.
- Backend replacement of forged item quantities, subtotals, base amounts and customer-field snapshots; forbidden master-price changes return 403.
- Invalid configuration/template writes returning 422 atomically, without changing record versions or workspace revisions.
- Customer requirements escaped in HTML, long-text validation, snapshot PDF visibility and unconditional exclusion of Internal Notes.
- Existing authentication, CSRF/origin, account/quotation ownership, record-version and workspace-revision regressions.

A supplementary in-process mutation matrix passed 68 assertions across Administrator, catalog-only, pricing-only and Employee actors. New HTTP regressions are included in the final 224-test suite. No new security role, bypass, credentials in logs or customer-PDF data leakage was introduced.

**Cross-tenant tests: NOT RUN** because the application has no tenant model. All users share one company workspace. This assessment does not claim tenant isolation that the architecture does not provide.

## G. Customer PDF verification results

**PASS: nine fresh browser-generated documents, ten rendered pages.** Text extraction, bounds/overlap checks and visual inspection confirm readable specifications, labels, totals, terms, signatures and page numbering. Long customer requirements wrap onto a continuation page with their final marker intact. The new custom-size document includes the explicitly selected size and excludes its private item note.

The reviewed documents cover Phase 1/2 regression quotations, T-shirt sizes and multiple locations, Logo Additional Requirements, gift artwork, long instructions and the new sparse/custom-size case. Existing quotation/WhatsApp PDF downloads also pass their separate browser/API regressions. Empty optional fields are omitted. Internal-field and item-note markers are absent. Existing PDF styling and renderer source are unchanged.

Saved `fieldSnapshot` metadata and `show_on_customer_pdf` govern historical presentation. Later template/product visibility changes do not rewrite saved specifications. Snapshot persistence tests and unchanged copied historical rows corroborate compatibility. Historical byte-identical file regeneration is not claimed; semantic specifications and saved financial snapshots were verified.

Installed PyMuPDF rendered the pages because Poppler was unavailable. Evidence: `phase3-readiness-pdf-qa.json`, its rendered contact sheet/pages and the final sparse-size mobile screenshots under ignored `test-results/`.

## H. Automated test results

| Check | Status | Executed evidence |
| --- | --- | --- |
| Phase 3 and all pre-Phase-4 Node/PostgreSQL tests | **PASS: 224/224**, zero failures/skips | `phase3-readiness-final-scoped.log` |
| New automated regressions | **PASS: eight**, included above | Four domain, two API, two UI |
| JavaScript syntax | **PASS: 64 files** | `phase3-readiness-check-final.log` |
| Browser-runner syntax | **PASS: nine runners** | Explicit `node --check` execution |
| Frontend production build | **PASS** | `phase3-readiness-build-final.log` |
| Production Dockerfile/image build | **PASS** | Final PostgreSQL/browser image build logs |
| Production dependency audit | **PASS: zero reported vulnerabilities** | `phase3-readiness-audit.json` |
| Whitespace | **PASS** | `git diff --check`; line-ending advisories only |
| Separate lint / TypeScript checks | **NOT RUN** | No standalone lint/type-check script or TypeScript project exists |

The scoped suite excludes only the three pre-existing `phase4-*.test.js` files. It includes authentication/accounts, domain/pricing, HTTP/API/integration, database/migrations, backup/restore, frontend and PDF tests. No failing Phase 3 test was excluded or relaxed.

## I. Regression, E2E and performance results

| Browser suite | Status | Checks |
| --- | --- | --- |
| Existing application / dropdowns | PASS | 20 / 20 |
| Phase 1 / Phase 1 review | PASS | 6 / 4 |
| Phase 2 | PASS | 7 |
| Phase 3 / Phase 3 review | PASS | 7 / 6 |
| Prior quantity-dependency regressions | PASS | 2 |
| New readiness edge cases | PASS | 3 |
| **Total** | **PASS; zero JavaScript exceptions** | **75** |

The final nine suites ran serially against a freshly recreated disposable stack at port 6413 with the corrected backend loaded. They exercise Admin setup/options/rates, product selection, dynamic fields, requirements, backend validation/pricing, save/reopen, customer preview/PDF and mobile layouts. Actual keyboard typing, unavailable historical selections, product overrides/reset and long-label bounds are included.

An earlier exploratory edge run reached a stale disposable Node process whose module cache predated the shared-engine correction. It was discarded. Recreating the entire disposable stack and rerunning all nine suites produced the results above. Final results do not count that failed attempt as PASS.

**Complete current checkout suite: FAIL, 245/246 pass.** Entry baseline was **FAIL, 237/238 pass**. Both fail the same pre-existing `tests/phase4-api.test.js:37` case: `Finish` is returned where `Shared finish instructions` is expected. The eight additions all pass; no new regression failure exists. The Phase 4 test/source was not changed to obtain a green result. Evidence: `phase3-readiness-baseline-all.log`, `phase3-readiness-final-all.log`, `phase3-readiness-browser-summary.json`.

Performance review found no need for an architecture refactor. Pricing and template reads use selective, consistent catalog queries rather than loading quotation/history tables; the retained integration test verifies those paths. Frontend keystrokes calculate through the shared engine without adding a pricing API request for each keystroke. Size controls now remain attached while dependent siblings refresh.

An indicative host benchmark of seven Phase 3 fixtures recorded 10,000 shared calculations in **631.47ms** (p95 **0.1215ms**) and 10,000 projection-plus-calculation operations in **1120.63ms** (p95 **0.1735ms**), with deterministic totals asserted. This is not production capacity certification. Evidence: `phase3-readiness-benchmark.json`.

Runtime field/option/range validation supplies the current type-safety boundary. Dense plain-JavaScript modules remain a maintainability limitation, but validation, calculation and specification generation remain shared. No duplicate pricing engine, broad service refactor or new logging path was introduced. React profiling is NOT RUN because React is not used. Firefox/Safari and production-load tests are NOT RUN.

## J. Remaining issues by severity

| Severity | Remaining issue / disposition |
| --- | --- |
| CRITICAL | None reproduced in the audited Phase 3 scope after correction. |
| HIGH | **Live activation gate:** actual new paid-option rates need Admin configuration/approval, and the intended installation needs a backup-first deployment/migration and post-deployment verification. Neither was performed. |
| MEDIUM | The pre-existing Phase 4 regression prevents a fully green integrated-checkout release. Resolve under a separately authorized Phase 4 scope. Other browser engines and production capacity remain unverified. |
| LOW | No configured standalone lint/TypeScript tooling; dense existing JavaScript limits static assurance. Existing runtime and execution checks pass. |

No known unresolved Phase 3 functional/security defect remains from this review. This is a bounded executed assessment, not a claim that untested environments or every possible configuration are certified.

## K. Final acceptance checklist

| Acceptance item | Status |
| --- | --- |
| 6. Reusable T-shirt sizes, custom labels/keys, enabled state and accurate quantities | PASS |
| Size-specific prices and backend-independent quantity validation | PASS |
| 7. Multiple configured print locations; legacy readability and no preparation collision | PASS |
| 8. T-shirt Design Requirements, persistence and visibility | PASS |
| 9. Logo Additional Requirements without package-price changes | PASS |
| 10. Paper Bag shared fields and retained Size/Printing/Setup | PASS |
| 11. Key Chain fields and retained customization/setup | PASS |
| 12. Mug Type to single Product Model mapping | PASS |
| 13. Stand to single Product Model mapping, retained Sheets | PASS |
| 14. Shield & Trophy Model/Plate compatibility | PASS |
| 15. Shared definitions, product options/overrides/additions, disabling/reset | PASS |
| Template/condition/reference conflicts rejected; product isolation | PASS |
| No duplicate inherited field/specification/charge | PASS |
| Deterministic frontend/backend pricing, discount, GST and rounding | PASS |
| Authorized Admin changes, invalid payloads and tampered prices | PASS |
| Save/reopen/edit/preview/PDF workflow and historical snapshots | PASS |
| Internal Notes private; long customer text safe/readable | PASS |
| Keyboard editing and 390px responsive size controls | PASS |
| Copy migration and approved-fixture totals preserved; source data unchanged | PASS |
| No new regression failure; production builds succeed | PASS |
| No Phase 4 implementation or placeholder migration added | PASS |
| Clean complete-checkout regression result | FAIL; preserved Phase 4 failure |
| Normal/production deployment and actual new business-rate approval | NOT RUN |

## L. GO / NO-GO for Phase 4 and production readiness

**GO for Phase 4 development based on Phase 3 acceptance.** Requirements 6-15 and the refinements pass the executed source, PostgreSQL, API, browser and PDF checks. This recommendation does not implement or authorize any Phase 4 mutation by this audit.

**Phase 3 source is ready for a controlled production release within the verified scope. The normal running installation is not yet Phase 3-ready.** Live activation remains **NO-GO** until actual rates are configured/approved and deployment/migration is performed and verified on the intended installation. Releasing the entire current checkout also remains **NO-GO** while its preserved Phase 4 test fails.

Normal data and pre-existing containers were preserved. This audit added no catalog migration, Excel pricing import, catalog checklist feature, Phase 5 enhancement or unrelated infrastructure/UI redesign.
