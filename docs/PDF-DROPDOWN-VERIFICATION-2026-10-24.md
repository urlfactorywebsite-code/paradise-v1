# PDF and dropdown verification - 24 October 2026

The requested changes are implemented and verified in source and an isolated local test installation. The existing application on port 6400 was not rebuilt or changed.

## PDF layout and design

- All five standard sample quotations now occupy one A4 page; each previously occupied two pages. A five-item fixture also fits on one page with its charges, discount, customer notes, terms and signatures.
- The company header and quotation metadata share a row. Customer and project details align in two panels. Specifications wrap in a wider column, financial amounts align right, and the grand total has a clear visual emphasis.
- Terms and totals share the lower part of ordinary quotations. A bounded compact layout is used only when it achieves a single page. Extensive notes and terms use the full page width, with continuation headers and page numbers.
- Nonzero charges, saved financial totals, customer/company/product snapshots, terms, logos and signatures remain supported. Internal notes stay excluded. Long footer text wraps without discarding its final words.
- Twelve pages across standard, dense, logo, many-item and long-narrative fixtures passed text-boundary and overlap checks and were rendered for visual inspection. The authenticated browser-downloaded PDF was separately inspected and occupies one page.

## Dropdowns

The shared single-select controls retain native values and events. Fixes cover form resets, canceled resets, changing option lists, native option labels, hidden options, disabled options/groups/fieldsets, required-field focus, keyboard search, dismissal/focus behavior, hidden or collapsed parents, and mobile viewport positioning. Reduced-motion styling is supported.

The application browser pass opened **346 screen dropdowns** across all **11 administrator views**, plus **33 dropdowns** across **7 dialog types**. It applied **59 alternative selections** across all **12 active product configurators**, and exercised the native compatibility-rule multi-select. Desktop and 390-pixel mobile screenshots were inspected. The 10,000-option fixture retains bounded rendering and searchable selections.

## Sample wording

Sample customer addresses, contact people, projects and quotation subjects now contain relevant Salem business examples. Legacy bracketed labels in company details and saved standard terms render as contextual examples in settings, branding, previews and PDFs. Customized content and saved source records remain unchanged by presentation cleanup. HTML input example attributes remain supported.

## Results

| Check | Result |
| --- | --- |
| JavaScript syntax | PASS - 39 JavaScript files; both browser runner files also checked |
| Frontend build | PASS |
| Full PostgreSQL suite | PASS - 85 tests, zero failures or skips |
| Isolated dropdown browser suite | PASS - 20 checks |
| Application browser suite | PASS - 20 checks, zero JavaScript exceptions |
| PDF visual/layout review | PASS - 12 fixture pages plus the authenticated download |
| Whitespace/error checks | PASS |

The Compose test command now discovers `tests/*.test.js`, including newly added regression files. Test data used a separate `paradise-layout-check` Compose project with PostgreSQL on tmpfs and a separate app on port 6402. Its containers, network and private fixture credentials were removed after verification. The normal app and database were not used for test mutations; normal health/readiness still return HTTP 200. The WhatsApp handoff was intercepted; no external message was sent.

Run the focused browser component checks with `node tests/dropdowns.browser.cjs`. The complete browser runner remains `npm run test:browser`; its disposable fixture setup and environment requirements are documented in [the existing verification guide](WHATSAPP-DROPDOWNS-2026-10-23.md#reproduce-the-browser-regression-checks). The regular PostgreSQL test suite runs through `npm run test:docker`.

Local evidence is retained under the ignored `test-results/` directory: `layout-postgres-suite.log`, `dropdown-regressions.json`, `ui-regressions.json`, desktop/mobile screenshots, the authenticated PDF download, and `pdf-layout/` renders and layout-check results. Browser interaction results cover Chromium; Firefox, Safari and public hosting were not verified. Applying these changes to the normal running installation requires a separate rebuild.
