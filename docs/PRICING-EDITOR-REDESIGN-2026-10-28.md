# Pricing Configuration redesign

28 October 2026. Checkout: `F:\Projects\Paradise\Paradise-v1`.

The actual `#price` page now uses the redesigned workspace shell and one selected-product editor. The same renderer covers all catalog products, with no product-name-specific layouts. Implementation and isolated functional verification are complete. Exact visual comparison remains **NOT RUN** because the supplied attachment contains the brief but no reference image. The normal running installation was not rebuilt.

## Implementation decisions

The existing frontend is vanilla JavaScript with shared CSS, modal helpers and accessible searchable dropdowns. Product prices live in the existing product JSON: base/unit/area/package rates, minimum charge/quantity, GST treatment, threshold tiers, option tuples, approval/availability metadata, size surcharges, custom rates and conditional service charges. Quotation pricing remains in `shared/domain.js`; inherited product fields continue to resolve/strip through its template projection functions.

The implementation uses a reusable page/product-list/header/base-card/tier-editor/group/charge-row/save-status pattern in `public/pricing-editor.js`. It deliberately retains explicit saving rather than introducing autosave. No backend/API, SQL schema, pricing formula, identifier, import mapping or dependency changes were needed.

## Changes delivered

- Existing dark teal navigation, global header/search/profile and `Catalog / Pricing Configuration` breadcrumb. Updated page heading, subtitle, snapshot notice and real save state.
- Searchable product panel with selected state, real code/active/pending metadata, scroll containment and 25-row pagination. Search filters already-loaded catalog records; switching products makes one version/detail request per cached session, without additional catalog-list downloads.
- One editor at a time, showing the real name/code/category/method/unit. Unsaved drafts remain separate per product when switching or navigating within the tab. Keyboard selection retains focus on the selected row.
- Base rate, minimum order charge/quantity, GST rate/treatment, existing pricing review and explicit approval flags. Unconfigured nullable base/GST values are retained. Product activation is separate and never automatic.
- Quantity tier chips with edit/delete/add dialogs, unique whole-number thresholds, ordering and validation. Labels show the **actual per-unit rates** and inclusive threshold intervals. They do not invent pack prices or convert rates to the reference's example denominations. Non-tier products gracefully omit the section or show an empty unit-tier state.
- Dynamic grouped option rows with charge-type/amount columns. Every dropdown/multiselect choice, custom-value rate, configured size surcharge and service charge uses the same visual pattern. Text/numeric/dimension fields explain their quotation-time role without exposing private defaults. Existing conditions, derived quantity policies, disabled options, availability, metadata and unrelated rules are retained.
- Supported charge modes are the engine's `f`, `u`, `p`, `a`, `q`. Labels explain fixed-per-line, per-unit, percentage-of-base, square-foot and quantity charging. Material area-rate and eyelet-unit constraints restrict their selectors appropriately. Input units adapt to the selected basis. Row/count states derive from actual amounts, approvals and enabled flags, including custom, size and service rows.
- Existing Download Price Template, Import Prices, preview validation/confirmation and Price Import History are reused. Dirty drafts must be saved/discarded before importing or entering the existing advanced specifications/rules modal. Successful imports refresh the editor from real workspace data.
- Inline numeric/tax/tier/option validation, one in-flight save, retained drafts after failed saves and explicit conflict recovery. Saves use the existing product `PATCH` with a record version. Success is acknowledged by the backend before the baseline/save status clears. If workspace refresh fails after a successful write, a recovery banner identifies the saved result and blocks further pricing saves until refresh.
- Unload protection, including after session expiry; same-owner expired-session draft retention; explicit sign-out/discard confirmation; and cache clearing before a different account renders.

HSN/SAC is not part of the current persisted product model or validation/API contract. It is intentionally omitted rather than displaying an input whose value would be discarded. Metadata/schema changes still use the existing specifications/rules modal and retain its independent catalog permissions.

## Components and services reused

`workspaceShell`, workspace icons/breadcrumb, `ParadiseSelect` enhancement, `fld`/`modal` helpers, `prodForm`, `pricingActions`, template download/import/history, `api`, `adopt`, `lock`, `failure`, `DP.resolveProduct`, `DP.stripProduct`, `DP.pricingError`, `DP.optionMeta`, size metadata, and the existing shared calculation engine.

No parallel API, pricing service or tax calculation was added. Historical quotation items retain their saved snapshots; an explicit reconfiguration or price refresh continues to use existing business rules. The banner describes this behavior without claiming all catalog values are demo values or approved production prices.

## Actual verification

All browser fixtures used independent app instances and random databases on a separate disposable PostgreSQL server at loopback port 55429. Real APIs/database records powered the screen. Intentional network-failure injection was limited to recovery tests. Fixture rates do not establish production pricing.

| Check | Result |
| --- | --- |
| `npm run check` | **PASS**, 81 JavaScript files |
| Explicit CJS syntax checks | **PASS** |
| `git diff --check` | **PASS**; ordinary LF/CRLF notices only |
| `npm run build` | **PASS** |
| `npm run test:docker` | **PASS**, 338 unit/integration/security/import/PDF tests, 0 failures, 0 skipped |
| `tests/pricing-editor.browser.cjs` | **PASS**, 18 integrated pricing groups |
| `tests/quotation-editor.browser.cjs` | **PASS**, 19 groups |
| `tests/quotation-audit.browser.cjs` | **PASS**, 12 groups, including nine frontend/backend/saved/SQL/PDF reconciliation cases |
| Existing workspace `tests/browser-ui.cjs` | **PASS**, 20 groups |
| Existing `tests/dashboard.browser.cjs` | **PASS**, 17 groups |
| Browser exceptions | **PASS**, none in completed suites |
| Dedicated lint/static typecheck | **NOT RUN**, neither is configured in this JavaScript repository; syntax checks are not static type checking |
| Pixel comparison to the new reference | **NOT RUN**, reference image absent |
| Firefox/Safari/physical devices | **NOT RUN**, Chromium/installed Chrome used |

The pricing runner checked **40 products and 301 rate rows**, plus a separate future-product fixture covering custom values, multiselects, size surcharges and conditional services. It verified search/no-results/pagination, keyboard selection, per-product draft retention and exact revert, tiers, base/minimum/tax fields, percentage precision, repeated-save protection, inline errors, failed-save retry, stale versions, pending null/approval roundtrips, template override isolation, private default exclusion, escaping, import/export/history, permissions and account boundaries.

A pricing-only account successfully edited base/minimum and option rates without catalog authority. Catalog-only and ordinary users could not enter pricing management or forge backend price updates. Template edits changed only product overrides: shared templates and another inheriting product remained unchanged. Inactive/pending products stayed inactive and missing base/GST rates stayed nullable.

New rates were consumed by the actual quotation editor's live summary in the **same app instance**, and matched backend calculation/preview and saved quotation totals. The existing saved quotation remained unchanged. The additional quotation audit reconfirmed nine rounding/tax cases with **zero paise differences** across live, backend, saved, SQL and PDF values. Its existing cases include fractional dimensions, multiple items, fixed/percentage discounts, zero values, inclusive/exclusive/exempt tax and IGST.

Template download preserved all four XLSX sheets and the parser's existing headers. An invalid workbook showed row errors and disabled confirmation; a valid preview made no rate change until confirmation. Confirmed rates appeared in the editor and import history, while historical quotation data remained unchanged. Existing full-suite tests cover import authorization, atomicity, expiry, malformed workbooks and approval/activation boundaries. No real WhatsApp message was sent.

Workspace regressions covered Dashboard, All Quotations, Customers, Product Catalog, Pricing Configuration, Reports, User Management, quotation create/edit/PDF and WhatsApp Sharing History.

## Responsive and visual evidence

Measured widths **1440, 1280, 1024, 768, 390 and 320**. Each had document scroll width equal to the viewport, with no horizontal page overflow. Desktop uses the product panel/editor columns; tablet/mobile stack the panel and editor. Narrow option rows place the option name above the charge-type/amount controls. Product-list scrolling and pagination remain contained, and sticky controls do not cover editor content.

Desktop and mobile captures were inspected for alignment, spacing, field readability, section grouping, selection, status and overflow. Evidence under ignored `test-results/`:

- `pricing-editor-desktop.png`, `pricing-editor-mobile.png`, `pricing-editor-mobile-viewport.png`.
- `pricing-editor-browser.json` and the four existing regression-suite JSON outputs.
- `pricing-editor-template.xlsx`, verified against the current parser headers and four sheets.
- `pricing-editor-docker.log`; quotation reconciliation PDFs/JSON from the rerun quotation audit.

Screenshots contain isolated QA fixtures and edited fixture rates, not production data. No claim of pixel-level reference matching is made without the missing image.

## Files created/modified in this task

| File | Change |
| --- | --- |
| `public/pricing-editor.js` | New reusable, template-aware pricing workspace and explicit save/recovery/session handling |
| `public/pricing-editor.css` | New scoped responsive layout and grouped pricing controls |
| `public/index.html` | Load the new stylesheet/script after the existing workspace/editor modules |
| `tests/pricing-editor.browser.cjs` | New isolated 18-group real API/UI/XLSX/quotation/security suite |
| This report | Implementation, tests and acceptance limits |

Earlier dirty dashboard, quotation, backend and test changes were preserved. There was no commit, reset, shared database migration or deployment.

The focused runner requires `TEST_DISPOSABLE=1`, a loopback `DATABASE_URL` on port 55429, and installed Chromium/Chrome. It creates/destroys its own random database and validates its temporary backup-directory path before cleanup. All task-created test containers were removed after verification.

## Running-installation boundary and remaining limits

Read-only `http://127.0.0.1:6400/api/ready` returned **200**, PostgreSQL schema **6**. The served HTML **did not include `pricing-editor.js`**. The persistent app/database were left unchanged: these results certify the source/disposable build, not installation of this redesign into the running app.

Remaining acceptance limits: the actual reference screenshot is needed to verify close visual matching; HSN/SAC has no supported storage contract; additional browser/device coverage and a running-install rebuild were not performed. No production pricing approval, load certification or external message delivery is implied by the fixture tests.
