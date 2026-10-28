# Pricing Configuration refinement and regression audit

28 October 2026. Checkout: `F:\Projects\Paradise\Paradise-v1`.

The tested source/build functional, pricing, security and responsive gates **PASS** after the refinements below. Full reference acceptance remains open: the supplied attachment contains a text brief but no target screenshot. HSN/SAC also has no supported product storage contract. The normal running installation was checked read-only and was not rebuilt.

## Visual refinements and functional defects fixed

| Finding | Refinement and verification |
| --- | --- |
| Low-contrast compact text | Darkened secondary labels/help, product codes, column headings, states and units; improved pending/active badges, placeholders and focus rings. Raised narrow-screen row labels to 10px. The same 133 sampled visible text elements improved from a minimum **2.50:1** contrast to **4.62:1**, with all sampled elements above 4.5:1. This is targeted contrast verification, not whole-application WCAG certification. |
| Stale save error after an exact revert | After a failed save, reverting to the persisted value displayed “All changes saved” while the old failure banner remained. Editing now clears the stale banner along with the error state; an exact revert sends no request. Banner contents are cleared only when visible. |
| Invalid negative option rate labelled “Configured” | Invalid rates now have an explicit invalid row state and count, separate from configured/free/pending/disabled states. Existing validation still prevents saving them. No rate computation changed. |
| Successful write followed by failed workspace refresh | The top status now explicitly shows **Refresh required** and distinguishes a saved price from remaining drafts. The persisted result is retained, further writes stay blocked until refresh, and recovery does not repeat the successful PATCH. |
| Stale base-rate explanation after tier changes | Adding the first unit-price tier or deleting the last tier now updates the base-card explanation immediately. Inputs are retained; the entire form is not rebuilt. Threshold/rate semantics are unchanged. |
| Pricing cache retained after same-user read access revocation | The server correctly revoked the session and scoped out private prices, but the old pricing draft remained in browser memory after that user signed in with no pricing-read permission. The pricing cache now clears before the reauthenticated account renders. Same-owner session-expiry recovery remains supported while authorized. |
| Unnamed pricing sections | Added programmatically named Base pricing & tax, Quantity tiers, Option charges and dynamic option-group sections for screen-reader navigation. Existing input names, implicit labels and shared dropdown behavior were preserved. |

The layout review covered sidebar/header/breadcrumb alignment, heading and banner, product-panel/search/selected-row presentation, selected product metadata, save state, base grid, tier chips, option-category headers, dropdowns, amount alignment, borders, row density and mobile stacking. The established two-column desktop structure and scoped style remain consistent with the dashboard/quotation shell. No screenshot was available for a pixel comparison, so exact reference matching is **NOT RUN**.

## Functional and data accuracy findings

The existing 18-group pricing suite passed again against real isolated APIs/database records: **40 products and 301 rate rows**, plus a future-product fixture containing custom, multiselect, size and conditional service pricing. Product search, bounded pagination, selection, correct grouping, draft switching/revert, base/minimum/GST edits, tier add/edit/delete, all supported charge modes, approvals, nullable/pending rates, exact decimal values and explicit saving remained working.

The new 11-group audit additionally verified full-page refresh reloads the saved product values/tiers; failed-save feedback and retry/revert; partial-save recovery without duplicate writes; first/last tier transitions; invalid states; DOM/API behavior; contrast; same-account permission revocation; representative quotation/PDF flows; responsive labels/sections; and browser exceptions.

Template edits retained their product-specific overrides without changing the shared template or another inheriting product. Missing rates were not converted to zero. Inactive products were not activated. Product IDs, unrelated fields and option metadata remained intact. Numeric preflight and the existing server validations remain in force.

**HSN/SAC:** no HSN/SAC field exists in the current product model, validation or API persistence contract. Editing/storage is **UNSUPPORTED**, not reported as working. Adding that feature or a migration would exceed this refinement pass.

## Pricing and quotation compatibility

Three representative products were edited through Pricing Configuration and then used through the actual catalog/configurator and Create Quotation UI. Required size quantities were entered for the clothing case. Live totals matched backend preview, saved quotation values, SQL totals and amounts extracted from the actual generated PDFs:

| Representative product | Reconciled grand total, INR |
| --- | ---: |
| Visiting Card — unit thresholds, GST | 654.90 |
| Flex Printing — area rate, GST | 477.79 |
| T-Shirt Printing — size quantity/unit rate, GST | 2,210.78 |

Each new quotation was edited and saved again without changing its financial total. Subsequent catalog GST changes left those saved item snapshots and totals intact. The original seeded historical quotations were also compared unchanged.

The separate quotation audit was rerun: its nine cases retained **zero paise difference** across live totals, validated backend preview, saved data, SQL and PDF rows. It covers zero values, fractional area above minimum charges, multiple products, item charges, separate delivery/other amounts, fixed/percentage discounts, inclusive/exclusive/exempt treatments, mixed tax rates and IGST. Existing currency rounding, tier selection, charge aggregation and discount allocation were not rewritten.

## Permissions, privacy and imports

**PASS for tested controls:** only pricing managers enter the editor; pricing-only accounts can change prices without catalog authority; catalog-only/ordinary users cannot forge price edits; product versions reject stale writes; validation rejects invalid prices/GST/tiers; duplicate save clicks produce one update; private defaults are not rendered; same-user removal of pricing-read access clears cached drafts after reauthentication; and private rate fields are omitted from the restricted state response.

The model uses existing `pricing.manage`, `pricing.view` and catalog permissions. No unsupported per-option administrator-only rule was invented. Authorized pricing staff still receive the configuration metadata needed to edit prices; customer-facing previews/PDFs retain their existing privacy checks.

XLSX template download preserved all four sheets and existing headers/mappings. Invalid rows blocked confirmation; valid previews made no price changes before confirmation; confirmation updated the correct editor fields and history; saved quotation snapshots were unchanged. Existing Docker tests also passed the import actor/session/revision, atomicity, approval/activation, malformed workbook and archive/XML safety checks. Import and history services were not changed.

These are scoped application security checks, not an external penetration test or production pricing approval. Actual WhatsApp delivery was not tested; the existing manual sharing regressions passed.

## Performance and accessibility

The measured input/cached-product-switch sequence made **0 API calls**, **0 full-page renders**, and retained the option editor DOM while typing. Product search filtered already-loaded records without requests; cached product switches avoided detail reloads; the product list remains bounded to 25 rendered rows. Existing shared dropdown tests exercised a 10,000-option list with bounded rendering. Repeated save clicks and save/refresh failure recovery did not flood writes.

No performance bottleneck requiring a broader rewrite, autosave or debounce change was demonstrated. There is no claim of a production load benchmark or large-table latency certification.

At **1440, 1280, 1024, 768, 390 and 320px**, document width stayed within the viewport. Desktop panel/editor columns, mobile stacking, contained list scrolling, option-row labels/amounts and shared menus remained usable. Desktop, mobile and mobile-option-row screenshots were visually inspected. Keyboard selection retained focus, input/select controls had accessible names or associated labels, and the three principal cards were available as named regions. Contrast findings and fixes are quantified above; physical screen-reader/device testing was not performed.

## Executed final gates

| Check | Actual result |
| --- | --- |
| `npm run check` | **PASS**, 81 JavaScript files; syntax validation |
| Explicit `node --check` on six browser CJS runners | **PASS** |
| `git diff --check` | **PASS**; ordinary LF/CRLF notices only |
| `npm run build` | **PASS** |
| `npm run test:docker` | **PASS**, 338 unit/integration/security/import/PDF tests, 0 failures, 0 skipped |
| Pricing editor browser suite | **PASS**, 18 groups |
| New pricing refinement browser audit | **PASS**, 11 groups |
| Quotation editor browser suite | **PASS**, 19 groups |
| Quotation amount/security browser audit | **PASS**, 12 groups |
| Existing workspace browser suite | **PASS**, 20 groups |
| Dashboard browser suite | **PASS**, 17 groups |
| Browser JavaScript exceptions | **PASS**, none in the completed suites |
| Dedicated lint/static typecheck | **NOT RUN**, neither is configured in this JavaScript repository; syntax checks are not a substitute for static typing |

Total: **338 Docker tests and 97 browser groups passed**. Workspace coverage includes Create/Edit Quotation, line pricing/taxes, PDFs, pricing persistence/import history, catalog use, Dashboard links, sidebar/header, customers, reports, user management and WhatsApp Sharing History.

## Files changed by this audit

| File | Purpose |
| --- | --- |
| `public/pricing-editor.js` | Save/error/invalid/tier states, cache cleanup after read-permission revocation, named regions/groups |
| `public/pricing-editor.css` | Scoped contrast, focus, badges and mobile-label refinements |
| `tests/pricing-refinement.browser.cjs` | New isolated 11-group regression/audit runner, real quotation/PDF comparison and screenshots |
| This report | Findings, actual evidence and remaining limits |

Existing dirty dashboard, quotation, API and other pricing work was preserved. No backend/API, schema, shared pricing-engine, dependency or unrelated-module changes were made. No commit or deployment was performed.

## Evidence, isolation and outstanding acceptance limits

Evidence under ignored `test-results/` includes `pricing-refinement-browser.json`, before/after contrast JSON, baseline failure evidence, `pricing-refinement-docker.log`, the five existing browser-suite JSON files, three `pricing-refinement-p*.pdf` fixtures, and desktop/mobile/mobile-option screenshots. Screenshots contain controlled QA fixtures and test prices, not approved production data. Transient toasts were allowed to expire before final screenshots.

The new runner requires `TEST_DISPOSABLE=1`, an explicitly disposable loopback PostgreSQL URL on port 55429, available Chromium/Chrome, and Python with PyMuPDF for PDF text extraction. It creates a random database, closes its app/browser, destroys only that database, and validates its owned temporary backup path before cleanup. Task-created test containers were removed after verification.

Read-only `/api/ready` at `http://127.0.0.1:6400` returned **200**, PostgreSQL schema **6**. Served HTML still **did not include `pricing-editor.js`**. The normal running app/database were not rebuilt or mutated; these results validate the source/disposable build.

Remaining limits: missing target screenshot prevents close-reference certification; HSN/SAC persistence is unsupported; Firefox/Safari, physical devices/screen readers and production load testing are **NOT RUN**; and installation of the reviewed source into the normal running app is **NOT RUN**. Full visual/running-install acceptance must not be inferred from the passing isolated tests.
