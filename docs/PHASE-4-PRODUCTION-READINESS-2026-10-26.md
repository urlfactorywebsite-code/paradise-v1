# Phase 4 production-readiness review - 26 October 2026

## Decision and scope

This review inspected the actual uncommitted implementation and refined Phase 4 only. It covers the 28 supplied placeholders, four reusable templates, seven specific Print configurations, catalog verification, authorization, quotation/PDF integration, data preservation and measured catalog performance. The entry baseline passed 278/278 tests; independent adversarial review nevertheless found the defects below.

The refined source passes **296/296 automated PostgreSQL tests**, **105/105 browser checks**, and visual/privacy review of **13 PDFs / 13 pages**. There are zero final test failures, cancellations, skips or browser exceptions. Phase 4 source acceptance passes for the documented scope. This document supersedes the readiness conclusion of the [earlier implementation report](PHASE-4-IMPLEMENTATION.md); that report remains a historical record.

The normal installation was read only and remains healthy on **schema 4**, with **12 active products** and the **28 placeholders missing**. Updated source/disposable installations use schema 5. No normal migration, catalog population, product activation, business-rate approval, deployment or Phase 5 work was performed. This review does not certify a deployed production installation.

## A. Requirements implemented and verified

| Area | Verification and result |
| --- | --- |
| All 28 identities | PASS: stable codes, exact documented aliases plus category/pricing model, missing/conflict handling and repeatable preparation. The [full audit and assignment matrix](PHASE-4-CATALOG-AUDIT-2026-10-26.md) accounts for every supplied name. |
| Existing catalog | PASS: every complete original product body compared equal after restored-copy migration/preparation; no original ID, category, option, field, price or activation changed. |
| Four templates | PASS: Print, Area, existing Phase 3 Promotional Gift and Stationery share the existing projection/override engine. No second configuration or pricing engine was introduced. |
| Seven Print products | PASS: Envelope, ID Card & Lanyard, Bill Book, Catalogue, Invitation, Danglers and Menu Card have the shared specifications and documented extras. Positive integral Page Count and mandatory Bill Book Copies now remain enforced across backend entry points. |
| Admin checklist | PASS: backend statuses, separate configuration/pricing readiness, global versus filtered counts, aliases, filters, paging, missing details, editor links, loading/error/empty/mobile and stale-response handling. |
| Quotation integration | PASS: actual active products remain quotable; inactive/unpriced products and forged selections are rejected; fields save/reopen, and unchanged historical snapshots retain their original amounts. |
| Backend/PDF security | PASS: independent management permissions, pricing-rule protection, CSRF/origin checks, atomic rejection, template references and private fields are tested. Customer PDFs use allowed snapshot specifications. |
| Complete original SRS | BLOCKED: the original complete product-list artifact is unavailable. The maintainable documented manifest contains 40 entries, not a claim of exhaustive original SRS coverage. |

## B-C. Issues discovered and fixed

| Finding | Severity | Direct reproduction | Refinement and verification |
| --- | --- | --- | --- |
| Product-specific required fields could have incompatible semantics | HIGH | An existing Catalogue `pageCount` text/optional field survived preparation, and an arbitrary string passed calculation. Hidden/optional/non-integral Page Count and optional/conditional Bill Book Copies could evade the documented requirement. | One shared `Catalog.additionalFieldErrors` contract now drives preparation/readiness, changed master validation, pricing, new/changed quotation items and new duplicates. Invalid definitions reject; untouched historical lines remain readable/editable with saved snapshots. Domain and actual HTTP regressions pass. |
| Additional fields could be duplicated or overwrite the intended semantic association | MEDIUM | A compatible Admin Page Count with a different stable key caused a second Page Count control; ambiguous matching extras were not reported. | Exactly one compatible documented-label match retains its actual key, rates, visibility and references. Ambiguous/incompatible definitions block preparation of the affected record with actionable details; they are neither merged nor overwritten. |
| Unassigned template pricing policies lacked independent pricing authorization | MEDIUM | A catalog-only account could add an Area field `rateBasis` without `pricing.manage` when the template had no assigned products. | Shared comparison protects derived quantity rules, eyelet policies, replacement rate bases, custom charges and option prices for both products and every template. HTTP 403 and unchanged-record assertions pass. |
| Conditional numeric input updates detached the active input | MEDIUM | In live Chrome, typing `12` into Width or ordinary Quantity produced `10` and lost focus when dependent fields triggered a redraw. | The existing row-preservation approach now retains the focused numeric row while reconciling dependent siblings; unchanged HTML is not replaced. Desktop/mobile multi-digit entry, condition updates and saved field snapshots are tested. |
| Dimensional controls ignored the effective field label | LOW | A configured `Finished Banner Dimensions` override rendered as hard-coded `Custom size` without its required marker. | Dimensions render the effective label/required marker through the same configurator. Unit and browser checks pass. |
| Search debounce allowed an earlier response to appear after new typing | LOW | A held response completed during the 250 ms debounce window before request invalidation. | Search immediately invalidates pending responses, retaining the existing debounce; controlled out-of-order browser and unit tests pass. |
| Product pagination performed N+1 reads | MEDIUM | A 100-product page used 102 SELECTs in a 540-record disposable fixture. | The product page SELECT now includes stored body/version/update columns and avoids per-row hydration. Result shape, sorting, filters, metadata and permissions remain covered. Query count is constant at two. |
| Pricing authorization initially treated metadata reordering as a price change | LOW | During refinement, reversing two unchanged priced fields returned HTTP 403 to a catalog editor with pricing-read access. | Rule/custom-charge comparison now canonicalizes stable field keys; metadata reordering succeeds while actual rate-policy/amount changes still return 403. The final additional HTTP regression passed before the complete 296-test run. |

No unresolved CRITICAL/HIGH code defect was identified in the executed review scope. Severity labels describe impact before the listed fixes, not remaining vulnerabilities.

## D. Files changed during this refinement

The working tree already contained prior phases and other dirty work. An entry hash manifest and patch were captured in `test-results/phase4-review-entry-hashes.json` and `phase4-review-entry.patch`; prior work was preserved without reset, broad staging or commit.

| File | Change |
| --- | --- |
| `shared/catalog.js` | Shared product-specific field contract, compatible existing-field reuse, safe preparation blocking and readiness details. |
| `server/access.js` | Unified pricing-policy authorization for templates/products, stable-key comparisons permitting metadata ordering. |
| `server/validation.js` | Enforce the shared contract on changed eligible/prepared masters and new/changed quote operations; retain historical snapshot compatibility. |
| `server/resources.js` | Apply the same field contract to pricing calculation endpoints. |
| `server/openapi.js` | Document required extras, rejection behavior and derived-pricing permissions. |
| `server/queries.js` | Product-only paginated hydration in two SELECTs. |
| `public/srs-ui.js` | Numeric focus retention/reconciliation, effective dimension labels, debounce invalidation. |
| New `tests/phase4-review-domain.test.js` | Five catalog/field/preservation regressions. |
| New `tests/phase4-review-api.test.js` | Seven adversarial authorization/configuration/quote/PDF/reordering tests. |
| New `tests/phase4-review-ui.test.js` | Five numeric/conditional/label/debounce/re-render regressions. |
| New `tests/phase4-review-performance.test.js` | Constant product-page query budget with real PostgreSQL pagination/filter/metadata validation. |
| New `tests/phase4-review.browser.cjs` | Five real-browser focus/mobile/debounce/rendering checks. |
| `README.md`, `docs/API.md`, this report | Current review links, strengthened contract documentation and evidence-backed handoff. |

No new SQL migration or dependency was added. Existing migration 005 remains the additive schema-4-to-5 migration; its idempotency and body preservation were rerun on a restored database.

## E. Product catalog verification

| State | Required | Missing | Inactive | Active | Conflicts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal database, read only | 40 | 28 | 0 | 12 | 0 |
| Prepared normal-copy state | 40 | 0 | 28 | 12 | 0 |
| Source/demo catalog | 40 | 0 | 28 | 12 | 0 |

The refreshed inventory is `test-results/phase4-review-catalog-audit.json`. All 28 names, existing/source/copy IDs, actual categories, assigned templates, extras and mapping reasons remain detailed in the linked 28-product matrix. No duplicate alias is counted as a second manifest product, and ambiguous identities are surfaced without automatic merging.

The 28 assignments comprise 12 Print, eight Area, six Gift and two Stationery products. The seven specifically requested products use Print. Digital design services disable irrelevant physical fields. Gazebo/Kiosk retains its existing unit pricing method while using Area dimensions; it is not silently converted to area pricing.

Configuration readiness remains separate from pricing: newly created copy records have 12 Incomplete / 16 Complete configurations; prepared existing source placeholders have 26 Incomplete / two Complete because their local required policies are retained. In both states, all 28 remain pricing Pending and inactive. Complete structural configuration does not approve optional commercial choices or rates.

## F. Template verification

| Template | Verified behavior |
| --- | --- |
| Print | Size/Paper/Sides/Finish; required policies without frozen inherited metadata; ID/lanyard extras, managed Bill Book copies/carbon sets and mandatory positive integral Catalogue pages. |
| Area | Existing Width/Height/Unit conversions and paise rounding; compatible Dimensions type, effective labels, multi-digit edits, material and optional lamination/installation. |
| Gift | Existing Phase 3 reference/override engine and seven fields; mapped options/rates, conditions, quantity references, isolated overrides and historical snapshots. |
| Stationery | Paper/Size/Sides and optional/disableable Binding; existing option management and conditional validation. |

Shared definitions, order, explicit product overrides, required/optional flags, conditional visibility, PDF policy, compatibility and persistence passed domain/API/UI regressions. Unknown/circular references, duplicate keys, invalid relationship targets and forged projection metadata reject. Required-field semantics are defined once in the catalog helper rather than duplicated in individual backend endpoints. Pricing-policy comparison is likewise reused across master product and template authorization. Focus preservation reuses one helper for ordinary/dimension/size inputs.

## G. Database integrity

The normal database was dumped read only in native PGDMP format and restored in memory to an isolated PostgreSQL container. No dump containing source records was written to disk. The copied database was migrated twice and prepared twice.

- Exact initial restoration and repeated migration preserved all business/account table hashes.
- All **12 complete original product JSON bodies matched exactly** after preparation, including all Admin fields/options/settings within those records, categories, rates and activation.
- Exactly 28 genuinely missing records were created, all inactive, with `rate:null`, `tax:null`, `priceConfigured:false`; repeating preparation created no additional records or assignments.
- Users, categories, customers, quotations, items, history and numbering rows retained their hashes. Original counts: one user, one workspace, three categories, 12 products, one customer, two quotations, three items, two history records and one sequence.
- The source has zero approved quotations. A separate two-approved-quotation fixture preserved its complete rows/totals through the same migration/preparation path; this is fixture evidence, not a claim of approved records in the source.
- Zero product/category, quote/customer or item/quote orphans were found. JSON field/template references were also exercised through backend rejection tests; removed catalog products intentionally remain referencable in historical quotation snapshots.
- Normal source before/after hashes were unchanged. The temporary copy container was removed in `finally`.

Evidence: `test-results/phase4-review-database.json` and `phase4-review-live-copy.log`. Existing PostgreSQL PK/FK and configuration-shape constraints remain; application validation enforces unique codes/manifest links and semantic references. This report does not claim an SQL unique index on product code that the schema does not have.

## H. Security findings

PASS: independent catalog/pricing permissions, template pricing-policy changes, metadata-only ordering, CSRF and foreign Origin rejection, stale versions/revisions, atomic malformed batches, inactive/null-price barriers, invalid template/field references and quote snapshot tampering. New tests exercise product PUT and whole-state writes, calculation, new quote and duplicate entry points. Failed writes preserve revisions, records and numbering.

Catalog-only users receive no private master rates/approval flags; safe metadata edits restore omitted values without authorizing explicit price changes. Pending new options remain null/unapproved; explicit configured zero is distinct. Saved quotation amounts remain available only under quotation access rules. Existing role/session/account regressions passed in the complete suite.

PDF generation uses customer-visible snapshot specifications and excludes internal field/item-note markers even when forged visibility metadata is supplied. Source inspection confirmed embedded PNG/JPEG logos only; customer PDF rendering does not fetch remote logo URLs. Browser text escapes user-controlled labels. No remote PDF renderer or new HTML execution path was introduced.

Tenant isolation is **NOT RUN / not applicable**: the application has one company workspace and no tenant model. Existing per-user quotation ownership/permission restrictions were tested; they are not misrepresented as tenant isolation.

## I. Performance findings

The only backend optimization was justified by measured product pagination behavior. Measurements used a disposable local Docker/PostgreSQL fixture with 540 catalog records, eight iterations, two discarded warmups. They are local comparison samples, not production latency promises.

| Product page size | SELECTs before | SELECTs after | Local p50 before | Local p50 after |
| --- | ---: | ---: | ---: | ---: |
| 1 | 3 | 2 | 12.462 ms | 12.774 ms |
| 25 | 27 | 2 | 20.262 ms | 12.082 ms |
| 100 | 102 | 2 | 38.500 ms | 13.350 ms |

The same count/filter/sort/version/update response contract is retained. The regression asserts two reads at one, 25 and 100 rows and on the second page, independent of page cardinality. Only the product listing branch was changed.

Checklist/catalog retrieval remains three SELECTs, with templates fetched once per request and no quote/history hydration or per-product SQL. The 540-record filtered-checklist samples were 44.114 ms before and 55.341 ms after the separate semantic-validation refinement; no checklist speedup is claimed. EXPLAIN showed the expected full catalog scan/sort, as complete manifest comparison requires those records. Existing category/active and name indexes were inspected; these observations do not justify an added index or cache.

The final real-browser replay measured rendering 40 checklist rows over 20 iterations at **7.6 ms median / 16.8 ms p95 / 18.2 ms maximum**. Earlier separate measurements are retained rather than substituted for this final result. Identical HTML is no longer replaced, focused numeric controls stay attached, and search debounce remains bounded while stale responses invalidate immediately. No new cache, denormalized readiness table or invalidation mechanism was added.

Evidence: `test-results/phase4-review-performance.json`, before/after logs, performance regression and browser JSON. Public production load/concurrency was **NOT RUN**.

## J. Pricing and activation safety

PASS: existing integer-paise calculations, GST, discounts, quantity tiers, geometry conversion, approved option charges and snapshot totals retain their existing regression results. There is no new commercial price formula. Normal rates/tax and activation were not changed. New missing records are unpriced and inactive, and configuration completion never activates them.

New quotes/pricing/duplicates cannot use inactive products or malformed mandatory specification definitions to bypass validation. Unchanged historical lines preserve their saved configuration and amount even when a legacy master is invalid; explicit changed/repriced selections use current validation. Corrupted-master tests prove that historical edits do not silently repair/reprice the master or saved item.

Synthetic priced/active fixtures were confined to guarded disposable loopback installations. Actual sizes, material stocks, finishes, gift methods, copies/carbon choices, taxes and rates remain business inputs. No Excel import, bulk pricing, new approval workflow or Phase 5 activation checklist was implemented.

## K. Test execution

| Check | Result | Evidence |
| --- | --- | --- |
| Fresh entry baseline | PASS: 278/278 | `test-results/phase4-review-baseline.log`. |
| Final complete Node/PostgreSQL | PASS: **296/296**, zero skipped/cancelled/failing | `test-results/phase4-review-final-full.log`; includes all existing unit/integration/database/auth/catalog/template/quotation/PDF tests and 18 new review tests. |
| Focused engine/preservation | PASS: 124/124 | `phase4-review-engine.log`; five new domain regressions included. |
| Focused backend/security | PASS: 28/28 | `phase4-review-security-final.log`; seven new adversarial HTTP groups included. |
| Focused UI | PASS: 27/27 | `phase4-review-ui-findings.json` and final complete test log; five new regressions included. |
| Measured pagination regression | PASS: 1/1 | `phase4-review-performance-test.log`. |
| Final existing browser suites | PASS: 75/75 | Nine suites: existing 20, dropdown 20, Phase 1 six, Phase 1 review four, Phase 2 seven, Phase 3 seven, Phase 3 review six, quantity two, readiness three; all processes exit 0. `phase4-review-regression-browser-summary.json`. |
| Final Phase 4 and new review browser | PASS: 25/25 + 5/5, zero exceptions | `phase4-review-full-browser.json` and `phase4-review-browser.json`; replayed on fresh final source after the authorization-ordering fix. |
| Final PDF rendering/visual review | PASS: 13/13 documents, 13 pages | PyMuPDF rendering (Poppler unavailable), all full pages visually inspected. Final pages are pixel-identical to those approved images; geometry/privacy/visual PASS in `phase4-review-pdf-review.json` and `phase4-review-pdf-image-comparison.json`. |
| Restored-copy migration/preparation/integrity | PASS | `phase4-review-database.json`; exact original bodies/history, null-priced inactive additions, idempotency and zero orphans. |
| JavaScript syntax | PASS | `npm run check`: 69 JavaScript files; `node --check`: 11 CJS scripts. |
| Production build | PASS | `npm run build`, `phase4-review-build.log`. |
| Production dependency audit | PASS: zero reported vulnerabilities | `npm audit --omit=dev --json`, `phase4-review-audit.json`. |
| Standalone TypeScript/typecheck | NOT RUN | Plain JavaScript repository; no TypeScript configuration/compiler or typecheck script exists. |
| Standalone lint | NOT RUN | No configured lint script/tool. JavaScript syntax checks were run; they are not called lint/type checks. |
| Cross-tenant | NOT RUN / not applicable | No tenant model. |
| Normal deployment, real-price activation, public production load | NOT RUN | Normal installation was read only; no release/activation was executed. |

One first full run was interrupted when an ephemeral helper inherited the test image's Compose project labels and its exit triggered `--abort-on-container-exit`. It was not an application assertion failure and is not counted as a pass. The helper now explicitly identifies a separate project; the interrupted log is retained as `phase4-review-full-interrupted.log`. A complete 295/295 run passed, then the metadata-ordering regression was fixed and the final complete 296/296 run passed. Tests were not skipped or weakened.

The 87-file application/test source hash snapshot remained unchanged through final Node, browser and PDF verification (`phase4-review-tested-source.json`). All five review-owned disposable Compose projects and the restored-copy container were removed; only this review's three private environment/credential files were deleted. Pre-existing containers, data and prior evidence were preserved. Final normal `/api/ready` returns `ok:true`, `database:postgresql`, `schemaVersion:4` (`phase4-review-normal-readiness.json`). Logs, JSON findings, screenshots and PDFs remain under ignored `test-results/`.

## L. Remaining issues and approvals

| Remaining item | Classification | Impact / dependency |
| --- | --- | --- |
| Approved commercial choices, prices and tax treatment absent for placeholders | HIGH business approval dependency / BLOCKED activation | Do not activate or issue real quotations for these pending records. Business owners must maintain and approve actual values using existing permissions. |
| Original full SRS manifest unavailable | MEDIUM coverage blocker | Documented 40 are verified; complete original SRS coverage remains unverified until the authoritative artifact is supplied. |
| Six exceptional mappings need business confirmation | MEDIUM business dependency | Two digital services/deliverables, Offset/Digital Printing production choices, Ink-Transfer process/material and Gazebo construction/measurement/unit basis. These appear as visible mapping warnings. |
| Normal installation still runs older source/schema | Deployment status, not a hidden code PASS | Any rollout/migration and environment validation requires a separately authorized deployment. The normal database was intentionally preserved. |
| No standalone type/lint tooling | LOW tooling limitation / NOT RUN | Current JavaScript syntax/build/test gates ran; no new unrelated tooling migration was added. |

No remaining CRITICAL or HIGH **code defect** is known from the executed scope. That statement does not remove the HIGH business activation dependency or certify untested production environments.

## M. Phase 4 acceptance checklist

| Acceptance | Status |
| --- | --- |
| All 28 placeholders identified and missing records detected | PASS |
| Stable identities, no duplicate alias inflation or repeated assignments | PASS |
| Existing IDs, categories, complete Admin definitions, rates and activation preserved | PASS |
| Four reusable templates and Phase 3 gift compatibility | PASS |
| Required Print/Area/Stationery fields and product-specific extra validation | PASS |
| Isolated overrides, ordering, conditional/PDF visibility and field references | PASS |
| Backend-driven status/readiness/global counts/search/filter/paging | PASS |
| Configurator multi-digit keyboard/mobile interaction and stale-response safety | PASS |
| New invalid/inactive/unpriced quoting and pricing-policy tampering rejected | PASS |
| Active product quotation/save/reopen/edit/PDF and historical snapshots preserved | PASS |
| Migration and preparation idempotency on disposable restored data | PASS |
| Complete automated suite, syntax and build | PASS |
| Final complete browser and visual PDF replay | PASS |
| Original complete SRS coverage and real business pricing approval | BLOCKED |
| Tenant isolation, TypeScript and standalone lint where no implementation/tool exists | NOT RUN / not applicable as detailed above |
| Phase 5 work avoided | PASS |

## N. Phase 5 recommendation

**GO for separately authorized Phase 5 development** within the documented catalog scope after review of this refinement. **NO-GO for activating unpriced placeholders or claiming complete SRS/production readiness** until actual commercial inputs, exceptional mappings, complete manifest coverage and separately authorized deployment validation are resolved.

Phase 5 was not started. No actual business pricing or product activation was changed.
