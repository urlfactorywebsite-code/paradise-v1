# Application-wide field customization — Phase 4

Implemented and locally verified on 2026-11-05. This phase extends the existing field registry, configuration APIs, session Edit Mode, shared field editor and product adapters. It does not introduce another configuration store or pricing engine.

## Coverage and safety

The [generated inventory](dynamic-fields-phase4-inventory.md) identifies 79 literal select callsites across 21 frontend JS/HTML files, including retained legacy implementations. Its [JSON companion](dynamic-fields-phase4-inventory.json) records page, component, field key, option source, type, dependencies, backend validation, storage, business dependencies and safety classification. Shared builders represent multiple runtime instances. Non-native entity pickers, suggestion lists, select enhancement and product action/navigation controls are also recorded.

The explicit shared manifest registers 46 controls on 13 business pages. Caption permissions and option permissions are separate: an entity selector may have an editable caption while its customer, product, employee or category IDs remain authoritative. Unknown controls default to protected. Existing configurable custom fields retain the shared option editor; native product display bindings retain Phase 3 pricing guards. No arbitrary option editor is attached to roles, workflow states, tax classification, pricing methods, catalog templates or database relationships.

## Page-by-page migration and test matrix

PASS below means the automated page checks exercised administrator normal mode, administrator Edit Mode and a non-admin employee with the relevant business-page permissions. The latter has no field-management permission. Default employee page restrictions remain enforced. Broader workflows are covered by the existing regression suites; the page matrix is not a claim that every possible field permutation was exercised.

| Page | Shared integration and retained protection | Admin normal / Edit Mode / employee |
| --- | --- | --- |
| Dashboard | Date, customer, employee and status captions; existing report filters preserved | PASS / PASS / PASS |
| Create Quotation | Catalog-category caption; existing product/custom field adapters reused; customer/address IDs, discount kinds and status workflow protected | PASS / PASS / PASS |
| All Quotations | Status and salesperson filter captions; canonical filter values preserved | PASS / PASS / PASS |
| Customers | Saved-address caption and existing custom field editor; managed categories and address ownership remain canonical | PASS / PASS / PASS |
| Reports | Period, month, product comparison, category, customer, employee, status, metric and chart-mode captions; actual filters unchanged | PASS / PASS / PASS |
| Products & Services | Category, status, readiness and page-size captions; existing product field editor; pricing method, tax and template IDs protected | PASS / PASS / PASS |
| Product Categories | Safe category-name input caption; no dropdown invented on this page | PASS / PASS / PASS |
| Pricing Configuration | Existing product display adapters retained; charge bases and tax values protected | PASS / PASS / PASS |
| Catalog Verification | Category, status, pagination and assigned-template filter captions; template/entity values unchanged | PASS / PASS / PASS |
| User Management | Safe name captions; role/security selectors protected | PASS / PASS / PASS |
| Settings | Signatory caption and Field Customization Management link; tax settings protected | PASS / PASS / PASS |
| WhatsApp Sharing History | Status-filter caption; sharing workflow unchanged | PASS / PASS / PASS |
| Customer Category Management | Status-filter caption; active/archive business state protected | PASS / PASS / PASS |
| Field Customization Management | Settings/sidebar navigation, search, page/type/policy filters, pagination, shared editor, supported custom-field creation and audit history | Authorized management PASS; unauthorized route denied PASS |

## Shared implementation

- Caption adapters edit only existing text nodes and accessible names. Native controls, current values, options, DOM identity, event handlers and submission contracts remain intact. Original captions are preserved exactly until customized, and restored when reset.
- Per-page requests reuse the central resolver, ETags, pending-request coalescing and cache. A tested dashboard scan performs one configuration batch, not one request per dropdown. Configuration saves invalidate and revalidate mounted adapters without rerendering ordinary forms.
- Failed caption retrieval leaves canonical controls usable. Administrators in Edit Mode receive a retry action. Existing required custom-value load failures retain their save protection.
- The management route uses the same definitions, editor, option manager, version checks and audit endpoint as inline editing. Server-side type/policy filters are validated and parameterized. Search/list pages are bounded. Audit history is paginated.
- Custom fields can be created only in sections that already persist and validate them: customers, quotations and a selected real product. Other pages receive registry-approved captions only.
- Custom-field display order uses the existing central API. The shared modal now explicitly wraps keyboard Tab focus; this fixed a regression exposed by the additional display-order input. The history dialog shares this behavior.
- Management UI is administrator-only. Backend mutations continue to require `fields.manage`, authentication and CSRF independently. Existing explicitly delegated `fields.view` readers may inspect the management page. Company isolation remains the application's database-per-company model; this phase does not claim shared-database row tenancy.

## Database and compatibility

No new DDL migration or schema-version increment: schema remains 13. Startup transactionally inserts missing manifest definitions through the existing idempotent registry seed. Existing definitions, customized captions, immutable keys, options and business records are not overwritten. Configuration revision changes only when definitions are inserted. Failure rollback, repeated startup and unchanged business state are tested. No production or persistent workspace database was seeded during this work.

Customer/quotation/product custom values and historical snapshots continue to use prior-phase persistence. Caption customization does not alter stored statuses, references, prices, taxes or report parameters.

## Verification

| Check | Result |
| --- | --- |
| Complete Node unit/integration suite, final candidate image | PASS: 487 tests; 0 failed, skipped or cancelled |
| Browser regression matrix | PASS: 389 checks across 28 suites in consolidated latest artifacts; 0 failures or recorded exceptions |
| New Phase 4 browser coverage | PASS: 45 checks, including 13-page role/mode matrix, caption propagation, form preservation, batching, error fallback, XSS escaping, management history and mobile layouts |
| New Phase 4 API coverage | PASS: 5 tests covering registry policies, canonical state preservation, transactional/idempotent seed, list filters, permissions and company-database isolation |
| Syntax validation (`npm run check`) | PASS: 149 JavaScript files |
| Frontend production build | PASS |
| Docker candidate build | PASS: `paradise-dynamic-pages-phase4:20261105` |
| Whitespace validation | PASS with repository CRLF handling |
| Dedicated lint / static type checker | NOT CONFIGURED: no corresponding scripts or TypeScript toolchain |
| Production deployment / production database validation | NOT RUN; not authorized |

The full browser matrix initially exposed a focus-wrap failure in the shared editor. It was fixed, then the affected inline editor suite (21 checks), Reports (26), Products (19), and new Phase 4 suite (45) passed on corrected source. The final evidence consolidates these latest artifacts; it is not presented as one uninterrupted clean browser invocation. The complete 487-test suite was rerun against the final built image.

Evidence: `test-results/dropdowns-phase4-full-tests.log`, `test-results/dropdowns-phase4-final-browser-summary.json`, `test-results/dropdowns-phase4-final-targeted.log`, `test-results/dynamic-pages-browser.json`, and `test-results/dropdowns-phase4-mobile.png`. Tests use generated disposable company databases on loopback PostgreSQL, never the running installation. Responsive checks include 320px management, Reports, Products and Settings layouts. Existing suites cover quotation editing/PDF, customers, pricing, reports and WhatsApp behavior.

Candidate image ID: `sha256:41997b06c2aff042413c3d0a61635ec81355aed78f83f684482ac487be9a8597`.

Repeated-request recheck on 2026-11-05: all 13 application/runner files compared against that image matched byte-for-byte. Fresh syntax validation (149 files), frontend build, inventory generation, five Phase 4 API tests and 45 Phase 4 browser checks passed. No additional application changes were needed. The complete 487-test and 389-browser-check results above remain the earlier full verification; those entire suites were not rerun during this focused recheck. The recheck used a separate disposable PostgreSQL container and did not touch the running installation.

## Files changed in Phase 4

New files:

- `shared/field-controls.js`
- `public/field-pages-ui.js`
- `scripts/inventory-dropdowns.js`
- `tests/dynamic-pages.test.js`
- `tests/dynamic-pages.browser.cjs`
- `docs/dynamic-fields-phase4-inventory.json`
- `docs/dynamic-fields-phase4-inventory.md`
- `docs/dynamic-fields-phase4.md`

Updated files:

- `server/field-registry.js`
- `server/dynamic-fields.js`
- `server/store.js`
- `server/openapi.js`
- `server.js`
- `public/dynamic-fields-ui.js`
- `public/dynamic-fields.css`
- `public/index.html`
- `public/workspace-ui.js`
- `scripts/test-customer-release.js`

This list is compared with task-start file hashes rather than the repository's larger pre-existing dirty diff. Generated build/test artifacts are separate. No dependencies, business pricing formulas or business-record schema were changed.

## Deployment checklist

- [ ] Obtain explicit deployment authorization and review the bounded Phase 4 change set alongside existing workspace changes.
- [ ] Take an established database backup (`npm run backup` with the intended environment), verify the backup, and retain the prior application image and configuration. Rehearse restore on a disposable database.
- [ ] Build the approved release from reviewed source. No new configuration variables or storage service are required.
- [ ] Start the approved candidate against the authorized environment; existing startup transaction seeds missing registry metadata. No destructive DDL is required by Phase 4.
- [ ] Verify health, login, both role modes, Settings navigation, caption save/cache refresh, quotation/customer submission, Reports filters, pricing and PDF smoke checks.
- [ ] Review logs and configuration audit history before declaring the running release accepted.

## Rollback checklist

- [ ] Restore the previous approved application image/assets and configuration using the normal deployment process.
- [ ] Retain additive registry definitions and audit history: the previous Phase 3 schema-13 application can ignore the new caption aliases. Do not delete fields/options or business records to roll back the UI.
- [ ] If backup restoration is necessary, authorize it explicitly, stop writes and reconcile post-backup business changes first; do not overwrite a live database blindly.
- [ ] Verify health, login, canonical forms, pricing, report filters and historical quotation rendering after rollback.

## Acceptance and remaining limits

Local Phase 4 acceptance: PASS for the automated criteria above. Production acceptance remains pending deployment authorization and post-deployment smoke checks. Inventory scanning is static and includes legacy builders; future runtime-generated widgets need explicit registry review. Caption selectors follow existing markup/handlers and should be updated together if those components change. Automated responsive/keyboard coverage is not a substitute for an exhaustive assistive-technology audit. Dedicated lint/type analysis is unavailable in this JavaScript project. No production data, running deployment or persistent workspace database was modified.
