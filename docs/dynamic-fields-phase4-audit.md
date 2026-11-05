# Application-wide dropdown audit

Review date: 2026-11-05. Scope: existing Dynamic Field Engine and application-wide integrations. Validation uses generated company databases in a dedicated loopback PostgreSQL container. The running application and its database are not audit targets and have not been modified.

## Findings and fixes

1. **Fixed: stale captions on revisiting a page.** The caption adapter retained its page cache for the entire session. A configuration change from another administrator session remained invisible after navigating away and back. A new browser test failed against the original implementation. The shared page-render hook now revalidates configuration through the existing resolver, ETags and request coalescing. It does not add a request per select or alter existing control values. The reproduction now passes.
2. **Corrected inventory classifications and component attribution.** Shared Reports builders now explicitly expand into their runtime fields, including database-backed customer, employee and category selectors. Product conditions, compatibility and charge editors are attributed to Products rather than an ambiguous shared page. Canonical measurement-unit selects are classified as protected. Opening-tag extraction respects quoted handlers containing `>` and source snippets are escaped in the Markdown table.
3. **Strengthened browser coverage.** The integration suite now renames all 31 registered caption definitions across their actual page/modal contexts, opens each shared editor and confirms label-only policy. It verifies control identity, selected values and option values/disabled states survive a configuration refresh. It also exercises global dropdowns in Customers and Create Quotation, a page override with the same immutable root ID, and external-session caption revalidation.

No pricing formulas, API contracts, permissions, schema migrations, native business options or business-record writes were changed by these fixes. Broader pre-existing workspace changes remain intact.

## Classification audit

The refreshed [inventory](dynamic-fields-phase4-inventory.md) contains 79 literal select callsites across 21 frontend JS/HTML files. Template expansion produces 87 documented field rows; the [JSON inventory](dynamic-fields-phase4-inventory.json) retains each source callsite and its runtime mapping. It includes the required type, dependency, validation, storage and business-rule attributes, plus five non-select picker/menu integrations.

| Classification | Allowed customization |
| --- | --- |
| Fully configurable | Descriptive customer, quotation and product custom fields using stable field/option IDs, central typed validation, archival, ordering and historical snapshots |
| Label-only | Approved captions and guarded native product display bindings; original values, event handlers and canonical pricing keys remain intact |
| Protected system field | No generic option/field editing. Changes, where permitted, remain in the existing authoritative business editor |
| Database-backed entity selector | Actual scoped customer/product/employee/category/address references; only separately approved captions are editable |

The runtime manifest contains 46 controls: 31 caption definitions and 15 controls explicitly protected against generic modification. Classification and mutation policy are separate: a database-backed selector can permit caption editing without permitting option creation. Existing Phase 2/3 custom-field and native-product adapters remain in use.

## Page-by-page test matrix

All 13 business pages are checked as an administrator with Edit Mode OFF, with Edit Mode ON, and as a non-admin employee granted the relevant business-page permissions but no field-management permission. Ordinary employee restrictions are not relaxed in application code. These page checks complement the record submission and output suites listed below; they do not imply exhaustive permutation testing of every form.

| Page | Editable integration | Intentionally non-configurable through this engine | Normal / admin Edit Mode / employee | Additional evidence |
| --- | --- | --- | --- | --- |
| Dashboard | Date, employee, customer, status captions | Filter enums and actual customer/employee IDs | PASS / PASS / PASS | All four captions renamed; selected filter preserved; one resolver batch; external update visible on return |
| Create Quotation | Catalog-category caption; shared quotation/product custom fields | Customer/product/address IDs, discount type, status/payment/workflow values, canonical measurement units | PASS / PASS / PASS | Catalog caption editor; global/page field resolution; product switching, required selections, save/reopen and output suites |
| All Quotations | Status and salesperson captions | Valid quotation statuses and real salesperson references | PASS / PASS / PASS | Both caption editors; existing list/filter/action tests |
| Customers | Delivery-address caption; existing customer name/type captions and custom fields | Managed category IDs, Other business behavior, customer-owned address references | PASS / PASS / PASS | Caption and draft-value preservation; custom field creation/order; customer create/edit/address regressions |
| Reports | Ten date/month/customer/employee/status/category/product/metric/mode captions | Supported metrics/chart modes/status values and scoped entity IDs | PASS / PASS / PASS | Every caption editor including expanded product-comparison section; report filters, charts and exports suite |
| Products & Services | Four catalog filter captions; existing product field/option editor | Category references, pricing method, tax, catalog template IDs, structural/priced field keys | PASS / PASS / PASS | Every filter caption; product custom-field isolation, native pricing-key protection, archives and saved snapshots |
| Product Categories | Category-name input caption | Actual category records through their existing CRUD API | PASS / PASS / PASS | No select is fabricated on this page; category input editor tested |
| Pricing Configuration | Guarded product display customization through the existing adapter | Tax modes, charge bases, condition operators/modes, compatibility keys, quantity/geometry rules and product references | PASS / PASS / PASS | Existing pricing editor/refinement and product-price regression suites |
| Catalog Verification | Category/status/page-size/assigned-template filter captions | Real categories, canonical readiness states/template IDs, bounded pagination | PASS / PASS / PASS | All four caption editors; template assignment, readiness and catalog regression suites |
| User Management | Name caption | Administrator/Employee role values and permission rules | PASS / PASS / PASS | Name editor; role selectors retain authoritative API validation |
| Settings | Signatory caption; management-page link | Tax display/treatment and existing settings constraints | PASS / PASS / PASS | Caption editor; management navigation; mobile layout |
| WhatsApp Sharing History | Sharing-status filter caption | Prepared/Manually Confirmed/Failed values and sharing workflow | PASS / PASS / PASS | Caption editor; WhatsApp preparation/history regressions |
| Customer Category Management | Status-filter caption | Active/inactive/archive business state and actual category references | PASS / PASS / PASS | Filter editor tested after closing the category dialog; category CRUD/association regressions |
| Field Customization Management | Shared definitions, options, order and audit history | Page/type/policy enums and real product-scope selector | Authorized access PASS; unauthorized route denied PASS | Navigation, server-side filters, pagination, editor reuse and history checks |

Additional shared controls are intentionally protected: custom-field type selectors accept only supported types; canonical product template mappings and accessory quantity keys remain under product/pricing validation. Search suggestions, product-card pickers, pricing product navigation and product action menus continue querying actual records or existing authorized actions. The native select enhancer remains a projection of the original control, with no independent option store.

## Cross-cutting verification

- **Global/page/product scopes:** existing API tests verify product > page > global resolution, inactive override behavior, independent namespaces and rejection of meaningless scopes. Browser tests exercise global fields on both persisted-form adapters, a page override using the immutable root ID, independent product fields and switching products.
- **Central updates and existing values:** shared save events refresh mounted configurations; navigation now revalidates external captions. Caption-only changes preserve native nodes, values, options and all `/api/state` business data. Existing suites cover renamed/archived options, retained saved references, required-field changes, custom value submissions and frozen finalized snapshots.
- **Dependencies and filters:** customer-address ownership, product visibility/compatibility, quantity and pricing dependencies remain canonical. Reports and dashboard filters retain their existing IDs, enum values, endpoint parameters and calculated results.
- **Authorization:** no ordinary-user edit toggle or editor actions. Backend mutations independently require authentication, CSRF and `fields.manage`, including stale/foreign option rejection and in-flight permission revocation checks. Isolation tests use separate company databases; the application uses database-per-company isolation rather than shared-table row tenancy.
- **Navigation/forms/outputs:** role-appropriate navigation, normal form submission, customer and quotation CRUD, product management, reports, pricing, PDF/print projections and WhatsApp regressions run against disposable data.
- **Accessibility:** shared editor focus/cancel behavior, native control identity, accessible names, ordinary keyboard interactions and existing responsive checks are retained. Automated checks do not constitute exhaustive assistive-technology certification.

## Execution results

| Check | Result |
| --- | --- |
| Complete unit/integration suite inside application image | PASS: 487/487; zero failures, skips or cancellations |
| Complete browser regression run | PASS: 403 checks across 28 suites in one final run; zero failed checks or recorded page exceptions |
| Expanded application-wide dropdown suite | PASS: 59 checks, including all 31 caption definitions and the 13-page role/mode matrix |
| JavaScript syntax validation | PASS: 149 files; inventory generator checked again after documentation corrections |
| Frontend production build | PASS |
| Application Docker image build | PASS: `paradise-dropdown-audit:20261105` |
| Inventory required attributes and page attribution | PASS: no unattributed page rows; all required inventory attributes present |
| Whitespace validation | PASS with repository CRLF conventions |
| Dedicated lint/static type checking | NOT CONFIGURED |
| Production deployment/persistent database validation | NOT RUN; outside authorized audit scope |

Image ID: `sha256:8c203cd27d24652239f4ec4bbc75c21c5a82ac9fdde24fa7d4619ac4553e3e35`.

Evidence: `test-results/dropdowns-audit-container-tests.log`, `test-results/dropdowns-audit-browser.log`, `test-results/dropdowns-audit-browser-summary.json`, `test-results/dynamic-pages-browser.json`, and `test-results/dropdowns-audit-build.log`. The final browser run passed every suite after the cache fix and additional coverage. Inventory documentation was regenerated separately; it does not change the tested application runtime.

| Browser suite | Checks | Result |
| --- | --- | --- |
| `reports-dashboard.browser.cjs` | 26 | PASS |
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

The first Windows-host unit run completed 482/487 tests successfully. Five backup/recovery tests failed: backup cases reported missing PostgreSQL client tools, and the child-process recovery case used an unsuitable host environment. The complete suite then passed inside the built application image, which provides PostgreSQL 17 clients and explicit PG connection variables. No application backup/recovery code is changed to mask host-environment failures.

## Files modified by this audit

- `public/field-pages-ui.js` — shared page-render configuration revalidation.
- `scripts/inventory-dropdowns.js` — accurate runtime expansion, page attribution, protected-unit classification, quoted tag handling and escaped documentation.
- `tests/dynamic-pages.browser.cjs` — external update regression, all-caption interaction checks and global/page UI coverage.
- `docs/dynamic-fields-phase4-inventory.json` and `docs/dynamic-fields-phase4-inventory.md` — regenerated inventory.
- `docs/dynamic-fields-phase4-audit.md` — this report.

## Acceptance and limits

**Local automated acceptance: PASS.** No unresolved integration regressions remain in the executed suites. Production deployment and persistent database modification are not part of this audit. No DDL migration or new dependency is introduced. Configuration edited in another session is revalidated on navigation or explicit refresh; this is not a real-time cross-tab push system. Future dynamically generated widgets still require explicit registry review. Dedicated linting and static type checking are not configured in this plain-JavaScript repository.

For deployment and rollback procedures, retain the backup-first [Phase 4 checklist](dynamic-fields-phase4.md#deployment-checklist). Use a newly built audited image if deployment is later authorized; the earlier Phase 4 image predates the navigation-cache fix. A code rollback can retain additive registry metadata and audit history; do not delete business data or referenced options.
