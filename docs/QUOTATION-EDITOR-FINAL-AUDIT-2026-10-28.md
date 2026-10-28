# Create Quotation final refinement and regression audit

Date: 28 October 2026. Checkout: `F:\Projects\Paradise\Paradise-v1`.

The source/build functional, pricing and tested security gates **PASS**. Exact reference-image matching is **NOT RUN**: the supplied attachments contain briefs but no reference screenshot. The normal running installation was checked read-only and was not updated. These limitations prevent declaring the entire reference/deployment acceptance gate complete.

## Refinements and defects corrected in this pass

1. **Incorrect expanded override breakdown.** Reproduced a subtotal of INR 100.00 with lines still totaling INR 300.00. Applying an override now retains the original base/lines and shows one authorized adjustment. Repeating an override replaces that adjustment rather than compounding it. Server validation still assigns the authoritative identity, timestamp and amounts; the shared pricing engine was not changed.
2. **Private data in preview API responses.** The rendered document was safe, but the authenticated preview API still returned private item notes and nested staff data. It now allowlists customer-facing quotation, customer/company snapshot and item fields, and uses the existing public specification formatter. Private quotation/item/customer notes, raw configurations, field definitions, override reasons/audit and internal company settings are omitted. Authorized staff detail/state remain editable and retain private data.
3. **Unnecessary price-summary rebuilds while typing metadata.** Inspection showed the summary was recalculated/replaced on every project/date/requirements/private-note keystroke. Those changes now update dirty state, feedback and validation without rebuilding the price summary. Instrumented project/private-note typing produced zero summary calls and retained the existing summary DOM node. Price-affecting controls and item changes continue to update immediately.
4. **Retained editor reference after sign-out.** Clearing `Q` did not clear the editor session's reference to the old quotation. Successful explicit sign-out now clears that session, validation state and expanded-item IDs. Expired-session draft recovery retains its existing behavior.

No new features, schema migrations, rates or tax policies were introduced. Existing dirty dashboard/editor work was preserved.

## Visual and responsive verification

Inspected current desktop create/edit captures and the mobile viewport. Verified the two-column desktop layout, heading/breadcrumb, four teal numbered sections, searchable customer control, selected-customer panel, input grids, item controls and expansion, separate charges/discount inputs, terms/private-note panels, INR summary and duplicate header/summary Save Draft/Preview actions.

At widths **1440, 1280, 1024, 768, 390 and 320**, the editor had no horizontal page overflow, including long product names. The summary is sticky on desktop and becomes part of the document flow at 1024 and below. An additional scroll check verified the desktop summary stays 20 pixels from the viewport top. Mobile drawer/dropdown behavior and all-screen overflow checks passed the workspace browser suite. Indian digit grouping was verified with `INR 12,34,567.89`.

Rendered and inspected actual one-page PDFs for the ordinary editor fixture, fractional-area case and mixed-tax case. Headers, tables, complete terms, totals, signatures and footers were readable without overlap or clipping. All nine controlled PDF cases had one page. Larger/multipage cases passed the existing PDF tests.

Reference screenshot comparison and a pixel-diff result remain **NOT RUN** because the image is absent. Chromium/installed Chrome was tested; Firefox, Safari and physical mobile devices were not tested.

## Functional and integration coverage

The 19-group editor browser suite and 12-group final audit exercised real isolated API/database records, rather than static mock responses, except for intentional save-failure injection. Coverage includes:

- Customer search/selection, Add Customer retaining form data, actual contact/GST/address display, quotation-only contact overrides and unchanged customer master.
- Dates/expiry, project/reference/requirements, salesperson/subject, terms, private notes and server length/amount validation.
- Catalog/configurator selection, quantity and option changes, independent expansion, edit/duplicate/delete, private item notes, repeated authorized overrides and live totals.
- Delivery/other charges, fixed/percentage discounts, tax treatments and tax presentation.
- Save Draft, repeated clicks producing one write, actual saved numbering/timestamp, dirty/revert behavior, preserved input after a failed save, retry and editing saved drafts.
- Preview, actual PDF download, manual WhatsApp preparation, protected attachment and unchanged quotation status.
- Cancel dismissal, navigation cancellation/direct hash restoration, explicit sign-out cleanup, explicit price-refresh cancellation/confirmation, and quotation duplication with a distinct ID/number.

No catalog/customer API requests or full-page navigations occurred during the measured editor input/product-update sequence. The existing shared dropdown suite verified bounded rendering and searching of 10,000 options. No framework or pricing-system rewrite was made; no unmeasured latency improvement is claimed.

## Calculation accuracy

Every case compared **live shared-engine totals and displayed grand total -> backend validated preview -> saved quotation data -> SQL stored total -> extracted PDF amount rows**. Difference: **0 paise** in all cases. PDF checks included base subtotal, applicable item/delivery/other charges, discount, net taxable amount, each GST bracket/split and grand total. Existing integer-paise discount allocation and odd-paise CGST/SGST rules were retained.

| Controlled case | Grand total, INR |
| --- | ---: |
| Authorized zero-value item | 0.00 |
| Fractional area above the minimum charge, multiple pieces and item-level express charge | 1,430.11 |
| Multiple products, 7.125% discount and separate charges | 5,636.58 |
| Fixed discount with sub-paise input rounding and small charges | 342.25 |
| Full 100% product discount | 0.00 |
| Inclusive product tax and discount | 290.07 |
| Exempt product with a separately taxable five-paise charge | 300.06 |
| IGST with percentage discount and delivery | 377.25 |
| Mixed rates and inclusive/exclusive treatments | 2,423.19 |

Fractional dimensions are supported and tested above the minimum charge, so the case exercises actual area-price rounding. Fractional piece quantities are not supported by the established model; rejection was tested. The exempt case correctly retains one paise of GST on the separately taxable charge. Repeated previews consumed no quotation numbers, and nine saves received consecutive numbers. Fixtures use only the disposable catalog's configured rates and do not establish production prices.

## Security and data integrity

**PASS for the tested controls:** quotation ownership/view/edit scopes; restricted charge/override/PDF actions; server-side validation; missing CSRF rejection; stale-version rejection without overwrite; anonymous search/detail/PDF denial; bounded search records containing only permitted identifiers/labels; duplicate-submit prevention; failed-save retention; private-note persistence and omission/clear behavior; historical snapshots; independent approval/discount authorization; numbering and transaction rollback.

Private sentinel values were absent from the customer preview projection, rendered customer preview, PDFs and generated WhatsApp handoff, while public customer-term sentinels remained present. Quotation-only contact changes did not modify the customer master. Authorized staff record endpoints intentionally still return staff notes under existing quotation permissions. Customer visibility follows existing workspace permissions; no new tenant/ownership model was inferred.

This is application regression/security verification, not an external penetration test. WhatsApp preparation is manual; no real external message, delivery, attachment transmission or read receipt was verified. Staff can still intentionally type arbitrary text into a manually reviewed message.

## Final checks and regression results

| Check | Actual result |
| --- | --- |
| `npm run check` | **PASS**, 80 JavaScript files; syntax validation, not static type checking |
| Explicit `node --check` on four browser CJS runners | **PASS** |
| `git diff --check` | **PASS**; Git emitted normal LF/CRLF notices |
| `npm run build` | **PASS** |
| `npm run test:docker` | **PASS**, 338 tests, 0 failures, 0 skipped; unit/integration/security/PDF/backup/recovery coverage |
| `tests/quotation-editor.browser.cjs` | **PASS**, 19 groups |
| `tests/quotation-audit.browser.cjs` | **PASS**, 12 groups, including nine pricing cases |
| `tests/browser-ui.cjs` on an isolated server | **PASS**, 20 groups |
| `tests/dashboard.browser.cjs` on another isolated server | **PASS**, 17 groups |
| Browser exceptions | **PASS**, none in the completed suites |
| Dedicated TypeScript/typecheck and lint commands | **NOT RUN**, not configured in this JavaScript repository |
| Initial direct host `npm test` | **FAIL**, 336/338: backup creation and offline recovery. Host PostgreSQL CLI tools are absent; the recovery subprocess also inherits the base `DATABASE_URL` rather than the fixture database. The same two tests passed in the supported Docker environment. No unrelated backup code was modified. |

Workspace regression coverage includes Dashboard, All Quotations, Customers, Product Catalog, Pricing Configuration, Reports, User Management, create/edit/configuration, PDF and WhatsApp Sharing History. It includes view/control integration and the existing backend tests, rather than a claim that every possible input combination or browser was exhaustively tested.

Focused browser runners require the explicitly disposable loopback PostgreSQL target on port 55429 and `TEST_DISPOSABLE=1`. The new PDF reconciliation runner additionally requires Python with PyMuPDF and available Chromium/Chrome. Its random database and temporary backup directory are removed in `finally`. Test containers were removed after execution; the normal application/database were not mutated.

## Files changed by this audit pass

| File | Purpose |
| --- | --- |
| `public/quotation-ui.js` | Avoid metadata-triggered price rebuilds; clear editor references after sign-out |
| `public/srs-ui.js` | Keep repeated override breakdowns consistent with the subtotal |
| `server/resources.js` | Customer-safe preview response projection |
| `tests/quotation-editor-api.test.js` | Extend private nested-data exclusion coverage |
| `tests/quotation-audit.browser.cjs` | New isolated UI/API/SQL/PDF, performance and security audit |
| `docs/API.md` | Document the safe preview response contract |
| This report | Results, evidence and limits |

Earlier redesign/dashboard changes remain in the dirty working tree and are described in their existing reports; they were not reset or committed by this audit.

Evidence is under ignored `test-results/`: `quotation-audit-browser.json`, nine `quotation-audit-*.pdf` fixtures, PDF render PNGs, `quotation-editor-browser.json`, `ui-regressions.json`, `dashboard-browser.json`, desktop/mobile editor screenshots, `quotation-audit-docker.log` and the initial `quotation-audit-unit.log`.

## Running installation and remaining acceptance limits

Read-only verification of `http://127.0.0.1:6400/api/ready` returned **200**, PostgreSQL schema **6**. Served HTML included `workspace-ui.js` but **did not include `quotation-ui.js`**. Consequently none of the isolated source results claim that the normal running installation now contains this redesign. No rebuild/deployment or persistent-data changes were performed.

Outstanding: supply the actual reference image for close visual comparison, address host-only test tooling/environment if direct host certification is required, test additional browsers/devices if required, and explicitly install/rebuild the reviewed source before claiming running-install acceptance. External WhatsApp delivery remains outside the manual sharing integration's verifiable capabilities.
