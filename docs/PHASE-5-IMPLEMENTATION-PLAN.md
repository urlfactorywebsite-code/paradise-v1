# Phase 5 implementation plan - 26 October 2026

The existing application is plain browser JavaScript, Node HTTP and PostgreSQL 17. Phases 1-4 share `shared/domain.js` for paise-based calculation, fields, managed options, template projection, compatibility, geometry, GST and immutable quotation snapshots. The current source baseline is 296 tests; the normal installation is separately preserved on schema 4. No deployment or Phase 6 work is authorized.

## Pricing source and existing rules

Product JSON in `products.body` owns base `rate`, `tiers`, tax/taxMode, minimum charges/quantity, field option tuples and approval metadata, custom charges, size surcharges and additional conditional charges. Shared definitions live in workspace settings; product overrides must isolate imported product rates. Calculation uses existing fixed, package, base-plus-charges, unit, tier and area methods, and existing f/u/p/a/q charge bases. Area rates are per square foot with existing unit conversion. Calculations/snapshots remain in the existing engine; import validation will convert literal decimal input through integer scaled values.

Discounts are quotation-level. The existing employee percentage limit is company-wide (`employeeDiscountLimit`), with a separate fixed cap and unlimited-discount permission. The spreadsheet Discount Limit column will explicitly represent that existing global percentage ceiling: filled rows must agree, blanks preserve it, changes additionally require `settings.manage`. No unsupported per-product discount rule will be invented.

## Files and implementation

| Files | Planned work |
| --- | --- |
| `shared/pricing-readiness.js` | One reusable eligibility result for configuration, applicable rates/tiers, mandatory options and pricing references. Used by central activation validation, pricing/new quoting and checklist UI. |
| `server/pricing-import.js` | ExcelJS workbook generation; bounded ZIP/XML preflight with yauzl; literal row parsing, stable product/option target mapping, decimal validation, preview and atomic confirmation. |
| `server/migrations/006-pricing-imports.sql`, `server/store.js` | Add import audit storage and private preview signing key outside public settings. Preserve positional SQL compatibility and existing data; new migration idempotent. |
| `server/validation.js`, `server/resources.js`, `server.js` | All activation paths enforced centrally; structured errors; authorized template/preview/confirm/history/readiness routes. No price writes in preview. |
| `server/access.js` | Keep private pricing/history and independent pricing/settings authorization protected. |
| `public/srs-ui.js`, scoped styles/index/build | Existing Catalog/Product editor actions, XLSX upload, backend row preview/confirmation/results, backend eligibility checklist and refresh. No redesign. |
| `server/openapi.js`, `docs/API.md`, README and Phase 5 report | Contracts, limits, workbook semantics, actual checks, approval dependencies and acceptance evidence. |
| Phase 5 domain/API/security/UI/browser/migration tests | Test workbook mapping, malformed/bomb/formula inputs, preview immutability, stale/tampered confirmations, rollback/idempotence, all activation paths and quotation/PDF preservation. |

## Workbook and import decisions

- Four sheets: Instructions, Product Pricing, Product Reference and Option Reference. Business columns: Product, Option, Tier Quantity, Unit Price, GST Rate, Discount Limit. Technical columns: Product Code, Option Code, Pricing Type and Unit of Measure.
- Codes identify existing product/field/option/size/charge targets; names are informative. Imports never create products/options or alter a target's charge basis. Existing unit/tier products can upsert appropriate tier boundaries; omitted rates are retained.
- All applicable active/inactive catalog records are referenced. Unconfigured/unapproved values export blank. No commercial example rates or GST are invented. Admin removes rows they do not intend to price and fills intended mandatory prices.
- XLSX uploads remain in memory. Bound compressed bytes, entry count, expanded bytes/XML, row/cell counts and parse size; reject encryption/macros/external relationships, malformed packages and formula cells. No external evaluation.
- Preview performs no database writes. A server-HMAC-verified payload binds normalized rows, actor/session, revision, expiry and import ID; the private shared signing key is initialized at setup/migration, not during preview. This supports multiple app instances without uploaded-file retention.
- Confirmation revalidates identity, permissions, payload, revision and rows inside the existing serialized transaction. Atomic applied-import history plus generic non-price audit metadata is committed with master changes. Reusing a confirmation is idempotent. Reimporting an unchanged workbook creates no duplicate rates.
- Eligibility is separate from activation. Imports may establish approved numeric rates, but never change `on`. Existing active inconsistent products remain active with warnings; unsupported new pricing is blocked. Unchanged historical snapshots remain untouched.

## Verification boundary

Capture this entry's dirty tree and execute the baseline. Work only on source and uniquely named disposable PostgreSQL/browser projects. Rerun complete automated and browser regressions, inspect the generated workbook and PDFs, and verify a restored normal-database copy with unchanged original/history data. Remove only this run's disposable resources/private fixtures, leave the normal installation unchanged, provide the implementation report and stop before Phase 6.
