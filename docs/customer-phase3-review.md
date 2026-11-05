# Phase 3 production review - 2026-11-04

## Acceptance

**PASS for the reviewed source, isolated PostgreSQL tests, browser checks and built-image integration. Production deployment is NOT PERFORMED.** No unresolved Phase 3 defect was found in the final runs. Historical rounding and the existing limitations below are explicit release considerations.

All database work used generated databases in a separate disposable PostgreSQL 17 container on loopback port 55429. The normal application and database containers were left running unchanged. Existing unrelated uncommitted work was preserved.

## Defects fixed

1. **Unvalidated Preview/Print:** the editor could open its document before the debounced backend check completed. That allowed stale/forged client prices or an employee's rejected discount into a printable preview. Preview now requests the existing authorized backend projection and renders that response. Request, draft, user and content guards suppress stale responses. Backend errors prevent document creation. Background confirmation cannot overwrite an in-progress document request.
2. **Decimal monetary rounding:** binary floating point produced 34 paise instead of 35 paise for `1500 * 2.3 / 100`, and converted INR 1.005 to 100 instead of 101 paise. New quotations use server-owned `calculationVersion: 2`: decimal-to-paise conversion, manual percentage discounts, item supplements, area monetary multiplication, inclusive tax extraction and exclusive tax use BigInt rational arithmetic with half-up rounding at the established monetary boundaries. Category percentages continue using exact basis points. No discount or tax ordering policy was changed.
3. **Wrong customer's quotation contact:** inherited contact overrides could carry a previous customer's billing/contact details into the newly selected customer. The editor clears them on selection changes and restores a saved quotation's own contact on returning to its original customer. Backend normalization also drops unchanged inherited overrides when the customer changes. Neither customer record is modified by this operation.

## Calculation policy and historical integrity

The backend selects the calculation version; incoming values cannot downgrade a new quotation or upgrade an existing one. New quotations and new duplicates use version 2. Existing records retain their original policy, including absent version metadata, on edits, status changes and explicit category refresh. Existing item snapshots remain intact unless their configuration or authorized override changes, or the established price refresh is requested.

This deliberately retains legacy boundary results on historical records. For example, an unversioned quotation with INR 15 at 2.3% tax remains INR 15.34; its new duplicate uses INR 15.35. Reconciliation or correction of an issued historical document requires a separate business-approved revision, rather than an automatic backfill. No existing quotation JSON was migrated or rewritten at startup.

The calculation order remains product base/options/item charges, one quotation discount, largest-remainder allocation to items, undiscounted quotation delivery/other charges, grouping by rate and tax treatment, grouped GST, and grand total. Inclusive prices stay inclusive; exempt items have zero tax; split GST conserves total paise and IGST uses the same total. Manual overrides retain existing permissions and employee caps. Category discounts replace the existing discount rather than stacking with it.

Customer, company, category percentage/name/message/logo reference, delivery and item snapshots remain authoritative for saved quotations. Configuration edits, customer category/address edits, logo replacement/removal and category archive do not modify finalized records or outputs. The existing Administrator ability to deliberately edit quotations remains unchanged; this review does not introduce a new approval or immutable revision workflow.

## Independently calculated examples

All figures below are INR; totals are persisted as integer paise.

| Example | Product subtotal | Discount | Net taxable/exempt amount | GST | Grand total |
| --- | ---: | ---: | ---: | ---: | ---: |
| BNI, 12.34%, exclusive 18% | 300.00 | 37.02 | 262.98 | 47.34 | **310.32** |
| No discount, exclusive 2.3% rounding boundary | 15.00 | 0.00 | 15.00 | 0.35 | **15.35** |
| Mixed exclusive/inclusive/exempt items, 12.34%, plus 1.00 delivery at 18% | 3.18 | 0.39 | 3.63 | 0.50 | **4.13** |
| 100% category discount on products, 15.00 quotation charges at 18% | 300.00 | 300.00 | 15.00 | 2.70 | **17.70** |

For BNI, `30000 * 1234 / 10000 = 3702` paise, leaving 26298. Exclusive GST rounds `26298 * 18 / 100 = 4733.64` to 4734; CGST and SGST are 2367 each. For the boundary case, 34.5 paise rounds to 35, split 17/18 under the existing allocation rule.

The mixed example uses item amounts 101, 118 and 99 paise with exclusive 18%, inclusive 18% and exempt tax respectively. The 39-paise discount allocates 12/15/12; discounted amounts are 89/103/87. The inclusive item nets 87 plus 16 tax. Exclusive items and delivery group to 189 plus 34 tax. Total net is 363 and GST 50.

## Final checks

| Check | Result |
| --- | --- |
| Complete automated suite | **PASS - 396/396**, zero failures/skips |
| Phase 3 unit/API suite, included above | **PASS - 16/16** |
| Independent full calculation oracle | **PASS - 600 vectors** spanning mixed treatment, decimal rates, allocation and 0-100% discounts |
| Phase 3 browser checks | **PASS - 18/18**, zero JavaScript exceptions |
| Category management browser regression | **PASS - 13/13** |
| Customer/address browser regression | **PASS - 15/15** |
| Existing quotation editor browser regression | **PASS - 19/19** |
| General application browser regression | **PASS - 20/20** |
| Total browser checks | **PASS - 85** across five suites |
| Bundled release-image Phase 3 tests | **PASS - 16/16**, application source not mounted |
| Frontend, backend preview, saved amount and DB total | **PASS** for category defaults, manual replacement and rounding boundaries |
| Server PDF and actual Chromium print-to-PDF | **PASS** - seven PDFs extracted/rendered; matching examples, tax reconciliation and finalized snapshots |
| Highlight placement and layout | **PASS** - multiline safe text immediately above Terms & Conditions; disabled/missing content, long names and pagination regressions |
| Financial/record authorization | **PASS** - employee caps, forged source/snapshots/version, price overrides, ownership, CSRF and existing permission regressions |
| Logo storage and archive | **PASS** - immutable private assets, protected reads, foreign database/session rejection and historical references |
| Delivery ownership and isolation | **PASS** - customer-owned active selection, unauthorized/foreign-address rejection and archived address snapshots |
| Fresh/existing migration and backup/restore regressions | **PASS**, included in full suite |
| Syntax validation | **PASS - 95 JavaScript files**, plus explicit Phase 3 browser CJS syntax check |
| Frontend build and Docker build | **PASS** |
| Whitespace validation | **PASS - git diff --check** |
| Dedicated lint and type checking | **NOT CONFIGURED** in this plain JavaScript repository; syntax checks are not a substitute |
| Dependency security audit | **8 moderate, 0 high, 0 critical**; existing ExcelJS/archive-chain findings, no new dependency |

The two new arithmetic regressions failed against the original code before the fix (34 vs 35 paise, 100 vs 101 paise). Intermediate browser runs encountered a test fixture category-version error and a missing bundled Playwright browser. The fixture was corrected and the general suite ran against installed Chrome and a fresh disposable app. Final results above supersede those attempts.

Evidence is under ignored `test-results/`: `customer-phase3-review-full.log`, `customer-phase3-review-targeted.log`, `customer-phase3-review-image.log`, `customer-phase3-review-*-browser.log`, `customer-phase3-browser.json`, `customer-phase3-review-pdf-checks.json`, PDF/PNG/text captures, build log and dependency audit JSON. Visual inspection checked print/server layouts and the boundary and finalized examples. Physical printer hardware was not tested.

## Files changed by this review

Earlier phase changes remain in the working tree. This review modified only:

| Files | Purpose |
| --- | --- |
| `shared/domain.js` | Versioned exact decimal monetary calculations with historical fallback |
| `server/validation.js` | Server-owned calculation version, canonical pricing/caps and customer contact transition |
| `server/resources.js` | Include calculation policy in the safe preview projection |
| `server/pdf.js` | Render quote charges using the saved calculation policy |
| `server/openapi.js` | Document the read-only calculation version |
| `public/app.js` | New draft policy and matching configurator calculations |
| `public/quotation-ui.js` | Authorized asynchronous document preview and exact charge presentation |
| `public/category-quotation-ui.js` | Preview cancellation/policy synchronization and customer contact reset |
| `public/srs-ui.js` | Match authorized price override preview to saved monetary arithmetic |
| `tests/customer-category-quotation.test.js` | Decimal/oracle, persistence, historical, contact and logo regressions |
| `tests/customer-category-quotation.browser.cjs` | Immediate/rejected/stale preview, printed PDF, boundary and finalized output comparisons |
| `docs/customer-phase3.md` | Link to this follow-up and current calculation policy |
| `docs/customer-phase3-review.md` | This report |

No dependency, DDL, authorization model, navigation, category setting, production record or unrelated feature was added or changed by this review. Schema version remains **8**; the calculation policy is additive quotation JSON. Logo display in the quotation remains optional and omitted, as in Phase 3; its private reference is preserved and missing logos cannot block output.

## Remaining risks and release steps

- Historical unversioned boundary rounding is deliberately retained. Create a new quotation or duplicate to use the corrected policy. Do not bulk recalculate finalized records.
- Resolve the existing moderate dependency findings through a separate tested dependency update. Existing jsPDF font/Unicode limits and the separate app/database tenant boundary remain. Shared-database multi-tenancy is not provided by this application.
- Browser print and server PDF use different established layouts and currency labels; financial content and promotional text agree. Physical printers and non-Chromium print engines were not tested.
- Before a release, take a complete backup, restore it into isolated staging, verify migration level 8 and representative legacy/new quotation totals, then deploy the tested image only with explicit authorization. Reload browser clients to load the matching shared engine and editor scripts. No additional DDL is required for this review.
- Prefer a forward fix for rollback. Older application code may discard new JSON fields or recalculate version-2 records with legacy arithmetic. Stop writes, retain a current dump, restore the pre-release backup into a separate empty database with the prior image, verify it, and reconcile post-release records before reopening writes. Do not blindly downgrade against the current database.

## Acceptance checklist

- [x] One category/manual quotation discount; no duplicate discount.
- [x] Existing tax order, inclusive/exclusive/exempt treatment and split/IGST conservation.
- [x] Exact monetary arithmetic for new quotations and duplicates; frozen historical policy.
- [x] Backend-owned amounts, calculation version and category snapshots; employee caps enforced.
- [x] Safe multiline highlight immediately above Terms & Conditions in preview, print and PDF.
- [x] Private immutable logo references; replacement/archive preserves historical output.
- [x] Customer-specific delivery selection and historical address snapshots; billing kept separate.
- [x] Customer transitions do not inherit another customer's contact override.
- [x] Finalized records and outputs survive category/customer configuration changes unchanged.
- [x] Complete automated, scoped browser and built-image regressions pass.
- [x] Production deployment/data mutation not performed.
- [ ] Production staging/backup validation and explicit deployment authorization.
