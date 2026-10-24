# SRS verification - 23 October 2026

Result: **PASS for the local source checks below.** This is separate from production deployment and business acceptance with approved prices and a live WhatsApp provider.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` | PASS, 38 JavaScript files |
| `npm run build` | PASS |
| `npm audit --omit=dev` | PASS, zero reported vulnerabilities |
| `git diff --check` | PASS |
| Docker image build | PASS |
| Full Node test suite in disposable PostgreSQL 17 | PASS, 75 tests, zero failures/skips |

The full suite covers API authentication/CSRF/origins, permissions and immutable quotation ownership, independent approval, account lifecycle and delegated-user privilege boundaries, CRUD and transactional rollback, pricing and rounding, historical snapshots, PDF generation, reports/CSV, concurrency/numbering, SQLite imports, backup/restore/recovery, additive schema 3-to-4 migration, manual WhatsApp history/retained PDFs/retries, and UI regressions. Transaction record reads were serialized to eliminate the PostgreSQL driver concurrent-client-query deprecation warning; the final suite emitted no such warning.

The test Compose project uses its own tmpfs database. Tests create independent disposable databases and do not connect to the existing application's persistent database volume.

## Browser workflow

A fresh Chromium context ran against an isolated application at `http://127.0.0.1:6401`, with a newly created disposable database and synthetic accounts/customers. Eleven checks passed:

1. Administrator setup and all eleven navigation screens.
2. Visiting-card pricing edits and a new product with a numeric specification through the administrator form.
3. Employee creation in User Management and permission-dependent navigation after login.
4. Customer creation with separate mobile and normalized international WhatsApp numbers.
5. Visiting-card/flex configuration, multiple quotation items, private notes, discount and Draft saving.
6. Quotation preview and PDF download, with private item notes excluded.
7. Reviewed WhatsApp recipient/message, protected PDF preparation/download, and unchanged quotation status.
8. Failed sharing history, linked retry and synthetic manual confirmation.
9. Employee submission for internal review and independent administrator approval with remarks.
10. Reports filtered using immutable employee identity, with sharing totals.
11. All eleven screens at 390 x 844 without document-width overflow, desktop dashboard at 1440 x 1000, and no uncaught browser errors.

The final run exercised the workspace's custom dropdown controls through their visible options. No WhatsApp chat was opened and no external message was sent. Manual confirmation was synthetic test data; it is not evidence of actual delivery to a customer.

The first browser diagnostic attempts exposed test-selector/timing assumptions; these were corrected. A genuine horizontal overflow in the new User Management view was fixed by making its table scroll within its container. The complete workflow then passed again.

## PDF layout

Six PDF regression tests passed as part of the full suite. Representative two-page and fourteen-page quotations were rendered and visually inspected, with extracted text checked for margins, footer/signatory information and confidential-note exclusion. Legacy tax-presentation preservation is also covered when global settings change.

## Evidence and deployment boundary

Ignored local evidence is retained under `test-results/`:

- `srs-full-tests.log`, `srs-image-build.log`.
- `srs-browser.cjs`, `srs-browser-results.json`, `srs-desktop.png`, `srs-mobile.png`.
- `srs-browser-quotation.pdf`, `srs-browser-shared.pdf`.
- PDF rendering fixtures/previews and `srs-pdf-results.json`.

The disposable browser application and test database services were removed after verification. The existing application and persistent database were not rebuilt or changed by these tests. No public/VPS deployment, live provider integration, outbound customer messaging, full load test or exhaustive accessibility certification was performed.

See [SRS coverage](SRS-COVERAGE.md), the [user guide](USER-GUIDE.md), and the [API contract](API.md) for implementation details and remaining external inputs.
