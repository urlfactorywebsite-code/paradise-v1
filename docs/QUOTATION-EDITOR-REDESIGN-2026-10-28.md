# Create / Edit Quotation redesign — 28 October 2026

Implemented in the existing application. The earlier dashboard work and all unrelated dirty changes were preserved. No dependency, database migration, relationship, authentication, status-transition or pricing-engine change was introduced.

## Delivered

- New quotation header and `Workspace / Quotations / New quotation` breadcrumb; existing records use Edit quotation and their actual number/status. Unsaved numbers remain backend-assigned on save.
- Four numbered cards: customer/quotation details, products/customization, charges/discounts/taxes, and review/save. The desktop form/summary ratio is approximately 74/26; the summary is sticky on desktop and follows the form on narrower screens.
- Existing shared searchable dropdown for real customers, with customer/company labels. The existing Add customer dialog validates, persists and selects a new customer without clearing the rest of the quotation. Selected contact, email, billing address and GSTIN use actual data; optional fields have honest empty labels.
- Date, expiry, project, customer reference and requirements remain visible. Salesperson, subject and the actual number are retained in Additional details. Quotation-specific contact editing remains available through its existing workflow.
- Expandable product cards with independent keyboard-accessible expansion, quantity, real specifications, monetary lines, edit/duplicate/remove, item notes and authorized price override. Edits reuse the existing catalog configurator, including product-specific field definitions and validation. Duplicate items receive distinct IDs. Area-product quantities are labeled as pieces rather than confusing quantity with the area rate unit.
- Delivery and other charges remain separate persisted values. Percentage and fixed discounts remain supported. The live summary reads the existing `DP.totals` result, including actual integer-paise CGST, SGST or IGST amounts. Inclusive-price tax is explained as a deduction from included prices before the taxable subtotal.
- Customer-facing terms and private quotation notes are separate fields. The private panel is visually differentiated. Item notes remain available independently.
- Header and summary Save Draft actions share one saving lock. Failed saves preserve inputs; repeated clicks create one record. Saved drafts can be edited normally. Non-Draft records retain their status and use Save changes where existing permissions allow editing.
- Dirty state compares editable form data with the last saved record, and clears on successful save or an exact revert. Save feedback uses actual successful responses or matching record `updatedAt` metadata. No autosave is implied or introduced.
- Unsaved navigation and Cancel require an explicit discard/leave decision in the product UI. Leaving can retain the draft in the tab. Ordinary field, modal, item and sidebar interactions preserve draft state.
- Preview, Generate PDF, WhatsApp sharing, Cancel, quotation duplication and explicit price refresh remain connected to the existing functions. Unsaved PDF/sharing operations keep the existing validated save prerequisites. Preview of a changed customer uses the newly selected customer without altering a saved historical snapshot.
- Scoped styling and responsive layouts, inline validation, keyboard focus, loading/save feedback and error recovery.

## Reused components and backend boundaries

The editor uses the same `Q` form state, shared dropdown enhancer, `custForm`/`custSave`, `openCat`, `openCfg`/`configurationFields`, `mkItem`, item actions, `DP.totals`, `saveQ`/`persist`, `prevQ`/`docHTML`, `pdfCur`, and manual WhatsApp sharing service. No parallel price formula or duplicate quotation service was added.

The customer selector searches the already authenticated customer choices used by the existing workspace; it does not introduce an extra unbounded customer download. One bounded quotation-detail read supplies an existing draft's actual save timestamp when it is opened.

No new API endpoint was added. The necessary compatible extension is optional `internalNotes`, up to 4,000 characters, in the existing quotation JSON body. It uses existing quotation ownership and create/edit/view authorization. Omission preserves previous notes; an empty string clears them. Old quotations without the field retain their existing shape.

`POST /api/quotations/preview` omits the new private field from its quotation projection. Existing customer document renderers and automatic WhatsApp templates never use it. Authenticated detail/state still return notes to authorized staff. There is no new customer-facing or anonymous quotation API.

## Files for this task

| File | Change |
| --- | --- |
| `public/quotation-ui.js` — new | Create/edit form, item presentation, summary, validation, dirty/save state and workflow integration. |
| `public/quotation.css` — new | Styles scoped to the quotation editor and its responsive layout. |
| `public/index.html` | Load the two editor assets after the established workspace modules. |
| `public/workspace-ui.js` | Quotation breadcrumb only when the existing `#new` view is active. |
| `server/validation.js` | Validate/preserve the optional private JSON field. |
| `server/resources.js` | Omit private quotation notes from the customer preview projection. |
| `server/openapi.js`, `docs/API.md` | Describe the private field and its access/privacy boundary. |
| `tests/quotation-editor-api.test.js` — new | Three isolated persistence, privacy and RBAC groups. |
| `tests/quotation-editor.browser.cjs` — new | Nineteen integrated editor groups, including long real fixture product names, all six widths, pricing/tax parity and generated outputs. |
| `tests/browser-ui.cjs`, `tests/dashboard.browser.cjs` | Scope navigation selectors to the sidebar and adapt the existing workflow regression to the redesigned controls and Additional details. |
| This report | Results and limitations. |

## Pricing and privacy verification

The focused browser runner compares the displayed total and `DP.totals(Q)` against `POST /api/quotations/preview`. Cases include area/quantity changes, separate delivery/other amounts, percentage/fixed discounts, inclusive prices, exclusive tax, IGST and exempt products. It also verifies that an exempt product does not exempt a separately taxable quotation charge. The broader existing suite covers the remaining pricing models and historical snapshots.

The summary takes `cgst`, `sgst` and `igst` directly from the shared calculation result. It does not divide tax equally itself or infer tax from a customer's state. Options and item charges use the existing non-base amount bucket and real per-item calculation lines, without inventing a separate pricing category.

Private quotation and item sentinel values were absent from the actual rendered customer preview, generated PDF and prepared WhatsApp handoff. A positive customer-term sentinel was present in the preview/PDF, proving the check inspected real output. Ownership and anonymous-access tests prevented unauthorized quotation/notes access. Sharing left Draft status unchanged and did not send a real external message.

## Results

| Validation | Result |
| --- | --- |
| `npm run check` | **PASS** — 80 JavaScript files. |
| Explicit syntax checks on changed CJS runners | **PASS**. |
| `npm run build` | **PASS**. |
| `npm run test:docker` | **PASS** — 338/338, zero failures, including three new API groups. |
| Focused editor browser | **PASS** — 19/19, zero JavaScript exceptions. |
| Existing browser regression | **PASS** — 20/20, zero JavaScript exceptions. |
| Dashboard browser regression | **PASS** — 17/17, zero JavaScript exceptions/framework warnings. |
| Layout | **PASS** — no horizontal page overflow at 1440, 1280, 1024, 768, 390 and 320px; sticky summary on desktop and stacked summary at 1024px and below. Long configured product names were included. |
| Save integrity | **PASS** — one write on repeated clicks, backend numbering, same-ID edit/retry, persisted metadata/charges/terms/notes, no automatic creation when opening. |
| `git diff --check` | **PASS**. |
| Separate lint / TypeScript | **NOT RUN** — no lint or TypeScript toolchain is configured. |
| Firefox/Safari and actual WhatsApp delivery | **NOT RUN**. |
| Deployment to the normal installation | **NOT RUN**. |

Evidence is under ignored `test-results/`: `quotation-editor-full-suite.log`, `quotation-editor-browser.json`, `ui-regressions.json`, `dashboard-browser.json`, `quotation-editor-new-desktop.png`, `quotation-editor-desktop.png`, `quotation-editor-mobile.png`, `quotation-editor-mobile-viewport.png`, and `quotation-editor.pdf`. Screenshots use intentional isolated API fixtures and were visually inspected. The New quotation screenshot is an unsaved form and does not represent an automatically created record.

Owned test applications, random test databases and test containers were closed/removed after verification. Evidence files remain available. No credential files were created.

## Unsupported reference features and installation status

- The attachment contained the written brief only. Neither reference screenshot was attached, so exact pixel comparison is unavailable.
- There is no existing Place of Supply field, state list, or state-driven GST decision model. No selector, default state, inferred interstate/intrastate logic or new tax rule was invented. Supporting it would require an approved model/API extension and business tax rules. Existing saved CGST/SGST or IGST presentation remains intact.
- Quotation-level private notes required the optional JSON-field extension described above; no migration was needed.
- No autosave, new public sharing API or automated WhatsApp delivery was introduced.
- All writes and screenshots used random disposable databases on a separate tmpfs PostgreSQL service on port 55429. Normal application data, secrets and configuration were not changed. The existing normal installation at port 6400 was not rebuilt or migrated; source/build/disposable verification is separate from deployment.
- Final read-only normal-installation checks returned healthy PostgreSQL schema 6. Its HTML includes the earlier workspace asset but not `quotation-ui.js`; the new editor has not been deployed there. This task did not perform that normal installation's earlier schema update.
