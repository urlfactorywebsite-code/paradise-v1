# WhatsApp and dropdown verification - 23 October 2026

The requested integration uses manual WhatsApp click-to-chat, as selected by the user. The existing access-control, quotation, pricing and PDF changes in this checkout were retained.

## WhatsApp

- Quotation sharing reads a fresh saved quotation before the recipient/message review. Preparation uses that reviewed version and rejects concurrent changes with HTTP 409.
- Saving a reviewed WhatsApp number now runs in the same backend transaction as preparation, with `customer.edit` permission. The previous busy-lock failure is removed. Invalid input, stale versions or denied permissions cannot partially update the customer or create a sharing attempt.
- Sharing users can read the configured message template; changing configuration remains restricted.
- A prepared attempt retains its exact authenticated PDF, recipient, reviewed message and SHA-256 checksum. The number is normalized into the international, digits-only `wa.me` URL.
- Opening the chat leaves the attempt as Prepared and does not change quotation status. A staff confirmation remains explicitly labelled Manually Confirmed.

WhatsApp's [documented click-to-chat format](https://faq.whatsapp.com/5913398998672934) opens a prepared message. Staff review and send in WhatsApp, and attach the downloaded PDF manually. Tests intercepted the external handoff; no WhatsApp message was sent and delivery/read status was not verified.

## Performance

- Customer/product/category lookups now use indexes. Saved quotation totals are reused and invalidated when server state is adopted.
- All Quotations renders 100 rows per page, retains filters, and searches the entire permitted collection. Input updates are combined into the next animation frame.
- Dashboard and Reports filters update results without replacing their dropdowns or the sidebar. Dashboard date controls remain mounted.
- Sharing history requests are deduplicated and briefly cached. Saves and state adoption invalidate that cache.

Local Chromium measurements used a synthetic in-memory fixture of **1,500 quotations and 1,500 customers**. Six filter changes were measured for each view:

| Filter | Before mean | After mean | Active control retained after change |
| --- | ---: | ---: | --- |
| All Quotations | 112.1 ms | 9.9 ms | Yes |
| Dashboard | 12.5 ms | 1.6 ms | Yes; previously replaced |
| Reports | 8.4 ms | 0.4 ms | Yes; previously replaced |

The quotation after measurement includes its queued table update. Dashboard/Reports timings measure local event processing and DOM work; server/network completion is separate. These are local fixture measurements, not production load or universal device guarantees.

## Dropdowns

All application single-select dropdowns use the same progressive control, while retaining their underlying select values, form behavior, disabled state and change handlers.

Features: consistent styling, searchable options, selected-state indicators, focus styling, accessible names, keyboard navigation, Home/End, Page Up/Down, Escape and outside-click dismissal. Menus use the browser top layer where supported, with a positioned fallback. Only visible option rows are mounted, including for the tested **10,000-option** fixture. Options use text content rather than interpreted HTML.

Desktop and 390-pixel mobile screenshots were inspected. All eleven administrator views and dynamically inserted configurator dropdowns were checked. Mobile menus remain inside the viewport.

## Validation

| Check | Result |
| --- | --- |
| Syntax checks | PASS - 38 JavaScript files |
| Frontend build | PASS |
| Full PostgreSQL test suite | PASS - 76 tests, zero failures/skips |
| Browser regression runner | PASS - 17 checks, zero JavaScript exceptions |
| Dependency audit, including browser-test tooling | PASS - zero reported vulnerabilities |
| Whitespace/error checks | PASS |

The focused WhatsApp browser pass additionally checked manual confirmation, unchanged quotation status, employee template access, denied configuration writes, the encoded handoff URL, matching PDF checksum and stale-version rejection before the dropdown work began.

Evidence is retained in the ignored `test-results/` directory: `ui-full-tests.log`, `ui-regressions.json`, `whatsapp-verification.json`, `dropdown-performance-before.json`, `dropdown-performance-after.json`, `dropdown-desktop.png`, `dropdown-mobile.png`, `ui-dependency-audit.json` and generated test PDFs.

## Reproduce the browser regression checks

Use a disposable fixture, separate from the normal database. The runner refuses the normal port 6400. Install development dependencies and Chromium once:

```powershell
npm ci
npx playwright install chromium
```

Start a fresh test installation:

```powershell
docker compose -p paradise-ui-check -f compose.test.yaml up -d --wait db
docker compose -p paradise-ui-check -f compose.test.yaml build test
docker compose -p paradise-ui-check -f compose.test.yaml run -d --no-deps --name paradise-ui-check-browser -p 127.0.0.1:6402:6400 test node server.js
$env:TEST_DISPOSABLE='1'
$env:TEST_BASE_URL='http://127.0.0.1:6402'
npm run test:browser
```

The runner creates a random-password test administrator and sample records in a fresh fixture. For an existing disposable fixture, supply `TEST_USERNAME` and `TEST_PASSWORD` through the environment. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` optionally selects an already installed compatible Chromium binary. Never use actual customer/account data for these tests.

Clean up only that test installation:

```powershell
docker rm -f paradise-ui-check-browser
docker compose -p paradise-ui-check -f compose.test.yaml down
```

The test database uses tmpfs. Recreate it before another fresh-fixture run. Public/VPS hosting, authenticated WhatsApp delivery and Firefox/Safari were not verified.

## Local installation update

The tested application was rebuilt on `http://127.0.0.1:6400` after creating a PostgreSQL custom-format backup, retained in the app backup volume and copied to `backups/before-whatsapp-dropdowns-2026-10-23.dump`. Its `PGDMP` signature was checked.

The existing additive schema migration advanced the local database from version 3 to 4. Before/after checks confirmed identical account/credential, company-settings and business-record checksums: 1 account, 3 categories, 12 products, 0 customers and 0 quotations. Test accounts and quotations remained in the disposable fixture.

Both application and database containers are healthy. Readiness returns HTTP 200 with PostgreSQL/schema 4. Served application, SRS, dropdown JavaScript and dropdown CSS match their source files. A fresh browser showed the existing-account sign-in screen with zero JavaScript exceptions. The disposable `paradise-ui-check` containers/network and temporary test credentials were removed after verification.
