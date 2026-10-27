# Phase 3 verification - 26 October 2026

These are the initial implementation results. The subsequent [production-readiness review](PHASE-3-PRODUCTION-READINESS.md) records additional reproduced defects, refinements and the latest complete verification.

PASS means executed successfully or directly verified. FAIL means an executed check failed. NOT RUN means the check was not executed. All write tests use explicitly disposable PostgreSQL installations and synthetic approved fixture rates; these are not business price approvals.

## Requested test cases

| Case | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Dynamic T-shirt sizes load | PASS | Domain, HTTP and actual Admin/configurator browser. |
| 2 | Admin adds custom/kids sizes | PASS | Domain, HTTP, UI and browser save. |
| 3 | Disabled sizes cannot be newly selected | PASS | Domain/HTTP rejection; browser Admin disable. |
| 4 | Size quantities total accurately | PASS | Domain, HTTP and browser; backend rejects explicit mismatched Phase 3 totals. |
| 5 | Invalid size quantities rejected | PASS | Negative, fractional, unknown, disabled, empty and excessive quantities covered by new and Phase 1 tests. |
| 6 | Configured size prices work | PASS | Synthetic approved per-piece surcharge, HTTP/server totals. |
| 7 | Multiple print locations selected | PASS | Domain, HTTP and browser. |
| 8 | Location charges use configured basis | PASS | Fixed plus per-piece fixture charges; shared engine charge-basis regressions. |
| 9 | Legacy location counts remain readable | PASS | Historical HTTP/PDF snapshots and UI legacy-edit test; no inferred physical locations. |
| 10 | T-shirt Design Requirements persist | PASS | HTTP create/edit and browser save/reopen. |
| 11 | PDF prints eligible T-shirt requirements | PASS | PDF/HTTP tests, authenticated browser download and render inspection. |
| 12 | Logo Additional Requirements exists | PASS | Domain, UI and browser. |
| 13 | Logo requirements save | PASS | HTTP/browser. |
| 14 | Logo requirements restore | PASS | HTTP retrieval and browser item edit. |
| 15 | Logo PDF visibility works | PASS | PDF/HTTP visibility tests. |
| 16 | Internal Notes remain hidden | PASS | PDF/HTTP tests, forged visibility and forged snapshots; internal item notes excluded. |
| 17 | Paper Bag fields complete | PASS | Domain/HTTP/browser; existing Size, Material, Printing and Setup retained. |
| 18 | Key Chain fields complete | PASS | Domain/HTTP/browser; Material, Customization and Setup retained. |
| 19 | Mug fields complete | PASS | Existing type key mapped to Product Model, rates retained; HTTP/browser. |
| 20 | Table Calendar fields complete | PASS | Stand key mapped to Product Model, Sheets retained; HTTP/browser. |
| 21 | Shield & Trophy fields complete | PASS | Model/Plate preserved and compatible shared semantics mapped; HTTP/browser. |
| 22 | Existing gift fields operate | PASS | Existing option/rate assertions and current configurations. |
| 23 | Existing prices unchanged | PASS | Five product before/after price equality, HTTP snapshots and browser. |
| 24 | Product-specific options load | PASS | Mapped options, explicit overrides and central propagation; HTTP/browser. |
| 25 | Artwork Requirements persist | PASS | All five HTTP products; browser save/reopen and PDF. |
| 26 | No duplicate gift controls | PASS | Unique resolved field keys and browser mapped-control counts. |
| 27 | No duplicate gift charges | PASS | Preserved before/after totals and single pricing-line assertions. |
| 28 | Shared template assigned | PASS | Explicit setup and explicit future-product assignment domain test. |
| 29 | Inherited fields render | PASS | UI/browser and effective-field API calculations. |
| 30 | Product overrides work | PASS | Domain, HTTP and actual shared-template/product editor browser. |
| 31 | Additional local fields work | PASS | Domain/UI/HTTP local specification preservation. |
| 32 | Disable/restore inherited field works | PASS | Rendering/pricing checks plus retained configured overrides and rates. |
| 33 | Assignment is idempotent | PASS | Repeated domain and versioned HTTP saves without duplicate fields/overrides. |
| 34 | Existing configurations compatible | PASS | Historical configuration, duplicate, edit and explicit repricing coverage. |
| 35 | Circular/conflicting inheritance rejected | PASS | Invalid IDs/maps, ambiguous aliases, nested references, duplicate targets and conditional cycles. |
| 36 | Unauthorized pricing changes rejected | PASS | Catalog/pricing split for product/template, disabled overrides, archived rates and shadowed raw master rates. |
| 37 | Cross-tenant modifications rejected where applicable | NOT RUN | No tenant model exists; this is a single-workspace application. Existing user/quotation ownership and access regressions pass. |
| 38 | Backend rejects invalid options | PASS | Active/approved/known selection, duplicates, min/max, pending custom values and malformed definitions. |
| 39 | Client price tampering rejected | PASS | Backend discards forged totals/specifications/count metadata and independently calculates authoritative values; unauthorized master-rate mutations return 403. |
| 40 | Existing quotation calculations work | PASS | Full existing domain/PostgreSQL suite; original demo totals retained. |
| 41 | Existing quotes reopen | PASS | HTTP snapshots, duplicates and existing/new browser regressions. |
| 42 | Existing PDFs functional | PASS | Full legacy PDF suite, old authenticated HTTP PDFs and browser. |
| 43 | Other product categories functional | PASS | Unrelated catalog equality and existing full browser suite. |
| 44 | Production frontend/Docker builds | PASS | `npm run build`; final full-suite image uses the production Dockerfile build. |
| 45 | No new regression failures | PASS | Final full-suite and browser results below. |

## Additional security/data checks

Retained raw master rates, active product overrides, disabled product overrides, archived location-count definitions and effective fields are all independently authorized. Permission-comparison identifiers occupy namespaces that real field keys cannot use. This prevents a custom local key or archived option from masking a changed price. All local and override field definitions are normalized before projection, including currently inactive definitions. Malformed bodies return 422 rather than a server error. Tests include catalog-only attempts to modify each hidden/retained rate layer.

The pre-existing Phase 1 PDF test used a generic `Notes` field as its example of explicitly public text. Its fixture now uses an explicit public Memo field, retaining that coverage while checking that internal `note`/`notes` identifiers or a Notes label cannot be published with a forged visibility flag. Saved item specification metadata is independently rebuilt on the backend.

## Executed suites

The final full Node/PostgreSQL suite passed **193 tests, 0 FAIL, 0 SKIP**. The initial unmodified baseline was **158 PASS, 0 FAIL, 0 SKIP**. The final source and test hashes match before/after execution (`phase3-source-before.json`, `phase3-source-after.json`). This includes 35 Phase 3 tests: 18 domain, seven HTTP/API, three PDF and seven UI tests. Full log: `test-results/phase3-postgres.log`.

Browser verification is **64 PASS, 0 FAIL**, with **zero JavaScript exceptions**: existing UI 20, dropdowns 20, Phase 1 six, Phase 1 review four, Phase 2 seven and Phase 3 seven. The Phase 3 browser was rerun successfully after the final backend field-normalization and rate-protection changes. Raw summary: `test-results/phase3-browser-summary.json` and the individual logs/JSON.

`npm run check` passed 52 JavaScript files; explicit `node --check` passed all six browser `.cjs` runners. `npm run build`, the production Dockerfile image build, `git diff --check` and `npm audit --omit=dev` passed; the audit reported zero vulnerabilities. Logs: `phase3-check.log`, `phase3-browser-syntax.log`, `phase3-build.log`, `phase3-diff-check.log`, `phase3-audit.log`.

Standard, T-shirt, Logo and gift PDFs each rendered to one page; a long requirements sample rendered to two pages. All six rendered pages were inside page bounds, with readable wrapping, continuation header and complete terms/totals. No PDF layout redesign was made.

Standalone lint/TypeScript tooling, Firefox/Safari, production load, actual business rate approval and normal/production deployment are **NOT RUN**. This JavaScript project has no separate lint or TypeScript script. The normal app on 6400 remains PostgreSQL schema 4; disposable verification runs schema 5. Phase 3 creates no migration, resets no normal data and applies no automatic product setup to the normal installation.
