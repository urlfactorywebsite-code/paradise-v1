# Customer Phases 1-3: Phase 4 QA and security report

Date: 2026-11-04. Scope: customer, category, address and quotation integration only.

## Acceptance decision

**Local QA acceptance: PASS. Production release approval: PENDING.** The final automated critical checks pass in the existing company-per-application/database model. This is not an unconditional production-ready or deployment claim: the actual release backup, production-like staging restore, TLS/session configuration and approved release snapshot still require the operator checks in [the release runbook](customer-release-runbook.md).

No production data or normal application/database container was modified. Tests used a separately named PostgreSQL 17 instance, generated databases and synthetic records. The two normal containers remained healthy and unchanged. Earlier uncommitted work was preserved; nothing was committed, reset or deployed.

## Defects fixed and hardening completed

1. Customer/quotation search and report filter parameters containing PostgreSQL-invalid control characters returned 500. They now fail validation with 422 before querying. Bound filter lengths are capped at the existing maximum text-field size; SQL remains parameterized and sort/direction remain allowlisted.
2. A customer save completing after its modal was closed could close a newer customer form, discard its entries and attach the previous customer to a different quotation draft. Success and failure handling now belong to the originating form, user and quotation. A stale conflict reload also cannot replace a newer form. Save-button restoration targets the original button. Existing repeat-submit guards and persistence remain intact.
3. Customer/category editors had keyboard containment but lacked named dialog semantics. Their modal containers now expose `role="dialog"`, `aria-modal="true"` and a linked heading. Labels, errors, focus containment, Escape and existing dropdown behavior were retained.
4. Syntax validation previously omitted CommonJS browser runners. `npm run check` now checks JS, CJS and MJS files. A guarded, repeatable browser release runner starts only fresh test workspaces and writes a consolidated report without saving credentials.

The invalid-search API test and overlapping-customer-save browser test failed against the original code before their fixes. Intermediate failures in new tests were fixture issues: address order must be selected by label rather than random IDs; a populated schema-6 fixture needs its existing import-signing key; an injected logging stub must delegate other queries. All were corrected before the final runs.

## Final execution results

| Check | Final result |
| --- | --- |
| Complete unit/integration suite | **PASS - 405/405**, zero failures/skips |
| New release unit/API and migration cases | **PASS - 9**, included above |
| Browser release aggregate | **PASS - 192 checks across 12 suites**, no reported JavaScript exceptions |
| New complete-workflow browser suite | **PASS - 10**, included above |
| Built release-image customer/category/quotation integration | **PASS - 57/57**; application source was not mounted |
| Built-image HTTP smoke | **PASS**: schema 8 readiness, bundled assets, native raster decoding, protected logo, customer/address, discount, saved quotation, PDF and malformed-filter rejection |
| Monetary oracle/regressions | **PASS**: 600 independent mixed-tax vectors, basis-point boundaries, fixed/manual replacement, allocation, 0/100%, inclusive/exclusive/exempt and split/IGST |
| Migration/rollback/restore validation | **PASS**: populated schema 6 to 8, forced migration rollback, repeat/concurrent startup, legacy row fingerprints and backup/restore; private logo/Phase 3 snapshots covered by existing integration cases |
| PDF/print | **PASS**: actual server PDFs and Chromium print-to-PDF extracted/rendered; totals, safe multiline messages, address/billing separation, historical output and existing multipage pagination regressions |
| Syntax checks | **PASS - 120 JS/CJS files** |
| Frontend and Docker builds | **PASS** |
| `git diff --check` | **PASS** |
| Dedicated lint/type checks | **NOT CONFIGURED**; this plain JavaScript repository has neither task/configuration. Syntax checks are not represented as either. |
| Dependency security audit | **8 moderate; 0 high; 0 critical**, existing ExcelJS/archive-chain advisories. No dependency was added or upgraded. |
| Source/current QA-log secret scan | **PASS for scanned patterns**: no private-key, cloud-token or non-placeholder credential-URL findings. Redaction behavior also tested on errors/audit/logging. This is not an exhaustive forensic scan. |

Browser suites: customer/address 15; category management 13; category quotation integration 18; release workflow 10; quotation editor 19; quotation audit 12; general UI 20; dropdowns 20; dashboard 17; products 19; pricing editor 18; pricing refinement 11.

Evidence is in ignored `test-results/customer-phase4-*`: full/targeted/migration/image test logs, `browser-summary.json` and per-suite logs, dependency audit, source/log scan, HTTP smoke, PDF checks, extracted text and rendered PNGs. Deliberate injected 500s may print `Request failed: Error`; those are rollback tests, not final failures.

## Required acceptance matrix

| # | Requirement | Result and evidence |
| --- | --- | --- |
| 1 | Existing customer CRUD | PASS: create/read/edit/delete, legacy PUT omission preservation, inactive status, duplicate review, referenced-customer delete refusal and owner-only address cascade |
| 2 | Existing quotation CRUD | PASS: create/read/edit/duplicate/delete, backend numbering/reference, saved prices, statuses, ownership, conflict handling and legacy workflows |
| 3 | Managed categories | PASS: existing and newly created category selection uses relational IDs |
| 4 | Other custom category | PASS: custom text round-trips and clears when switching to a managed category; never creates a global category |
| 5 | Contact-person phone | PASS: independent validation/persistence and quotation snapshot; master mobile stays separate |
| 6 | Multiple saved addresses | PASS: atomic creation, defaults, selection, edits, archive/restore and omission preservation |
| 7 | Customer address isolation | PASS: foreign IDs cannot be enumerated, reassigned, edited or selected; denied paths do not reveal records |
| 8 | Logo upload/rendering | PASS: PNG/JPEG/WebP normalization, visible management image, replacement/removal, fallback and protected historical references. Optional quotation-logo placement remains omitted. |
| 9 | Discount configuration/application | PASS: numeric 0-100%, two decimals, current defaults on new quotations and explicit Draft refresh |
| 10 | Existing discount conflicts | PASS: one discount field, manual/category replacement, employee caps and forged metadata rejection |
| 11 | GST/tax regression | PASS: established calculation order, exact version-2 arithmetic, mixed treatments/rates, charge exclusion and legacy policy preservation |
| 12 | Promotions in outputs | PASS for tested text: escaped multiline preview, editor, protected PDF/WhatsApp PDF and browser Print, directly above unchanged terms |
| 13 | Historical snapshots | PASS: customer/company/item/address/category name/percentage/message/logo changes do not rewrite finalized records or outputs |
| 14 | Category archive/associations | PASS: archive hides new selection but retains customer FKs, historical documents and old logo versions |
| 15 | RBAC/tenant isolation | PASS at the existing separate-app/database boundary: roles, read-only management, transaction-time revocation, quote ownership, foreign session/object rejection. Shared-database tenancy is unsupported. |
| 16 | API/injection/XSS/upload | PASS: strict types/bounds/IDs, literal bound searches, allowlisted ordering, CSRF/origin/auth checks, escaped hostile text, raster signature/decoding limits and private MIME/sandbox headers |
| 17 | Responsive/keyboard UI | PASS for tested widths/flows: 1440/1024/768/390/320, labels/errors, dialog semantics, focus containment and keyboard dropdown navigation. No full WCAG certification is claimed. |
| 18 | Existing-data migration safety | PASS on synthetic populated legacy data and restore: no legacy row changes across ten business/account tables, including saved PDF handoff bytes, versions and totals |
| 19 | Concurrency/duplicates | PASS: one winner/one 409 for stale updates, repeated Save writes once, stable IDs prevent repeated creation, no stale modal completion/data loss and atomic multi-resource rollback |
| 20 | PDF pagination/print | PASS: rendered monetary/message/address parity plus existing dense, long-specification, long-highlight and multipage tests |

A representative complete workflow creates a category with a normalized logo and 12.34% discount; creates an Other customer with an independent phone and two addresses; edits it to the managed category; selects Branch; creates a quotation; replaces a manual discount with the category default; saves, previews, prints and downloads it; finalizes it; then archives the category and edits/archives its address without changing the issued document.

Its amounts are **INR 300.00 - 37.02 discount = 262.98 net; GST 47.34; grand total 310.32**. The built-image HTTP smoke independently uses 10.25%: **300.00 - 30.75 + 48.47 = 317.72**. The existing half-paise boundary test retains **15.35** for a new quotation at 2.3% tax; unversioned historical records retain their original arithmetic.

## Security and data review

- Writes remain authenticated, CSRF/origin checked, transactionally serialized and version checked. Permission changes are rechecked at commit. Customer/address creation and a customer/address/quotation batch roll back together on injected SQL failures, including audit/revision changes.
- SQL values remain bound. Customer/category search metacharacters and injection strings remain literal. Invalid sort/pagination/ID/type input is rejected. Control characters no longer reach PostgreSQL through the reviewed filters.
- Category/customer/address text and promotional messages are escaped in HTML. No arbitrary message HTML is executed. Print/PDF show hostile markup as literal text; internal quotation/item notes remain excluded from customer documents.
- Logo input is bounded to 300,000 bytes and 4096 pixels per side/16,777,216 pixels. Signature/MIME agreement and raster decoding are required. SVG/GIF/animated/corrupt/oversized payloads are rejected. PNG normalization strips EXIF/appended executable data and caps output at 512 pixels per side/2 MiB. Immutable assets remain in a separate private database table, not customer records or a public upload folder.
- Asset URLs are authenticated application routes with private/no-store, nosniff and sandbox headers. Foreign database sessions/assets cannot cross the tested application boundary. Category ownership uses the composite logo FK. Old logo versions remain intentionally retained for historical references.
- Existing logging conventions were retained: request IDs and generic errors to callers; error code/name in server logs, without SQL, request bodies, credentials or exception stack content. New tests inject a sensitive-looking error message and verify it does not enter logs/responses/audit details. No new logging or monitoring subsystem was introduced.
- Full database backups contain sensitive account/business data. They remain private artifacts and must not be committed or copied into QA logs. The Docker build context excludes environment files, backups, test results, tests and docs.

## Migration and configuration

No Phase 4 DDL or new runtime configuration was introduced. Existing migrations **007** (nullable customer metadata/category FK/address table) and **008** (category configuration/private logo table/constraints) remain unchanged. Schema stays **8**. They are additive, transaction protected, idempotent through migration history/seeding, and tested against fresh and populated databases. The release test additionally verifies that failure in migration 008 rolls both 007/008 back when starting from schema 6, then permits retry.

Phase 3's `calculationVersion`, discount source/amount and category snapshots are quotation JSON. New quotations and duplicates use exact version 2; existing records keep their policy even on category refresh. Incoming metadata cannot switch an existing calculation version. Older binaries are not automatically safe against these JSON records merely because the schema number matches.

Runtime requirements remain PostgreSQL 17/client backup tools, locked Node dependencies including native sharp, and one isolated company app/database connection. `CUSTOMER_CATEGORY_HIGHLIGHT_MAX_LENGTH` defaults to 1000 and accepts 1-4000; Compose passes it through. Logo bytes are included in normal PostgreSQL backups. The existing 100-address cap includes archived addresses. See the runbook for TLS/cookies, storage and release requirements.

QA-only requirements: Node compatible with package engines, development dependencies/Chromium, a separate PostgreSQL instance on loopback 55429, `TEST_DISPOSABLE=1`, and `DATABASE_URL` pointing only to that instance. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed browser. No QA credentials are written by the new runner. PyMuPDF is needed by the existing PDF-audit browser suites, not by the deployed application.

## Files modified in Phase 4

| File | Change |
| --- | --- |
| `server/queries.js` | Validate search/filter controls and bound filter lengths |
| `public/customer-ui.js` | Scope async save/reload results and add named dialog semantics |
| `public/customer-categories-ui.js` | Add named category dialog semantics |
| `scripts/check.js` | Include CJS/MJS syntax checks |
| `scripts/test-customer-release.js` | New guarded 12-suite browser release runner and consolidated evidence |
| `package.json` | Add `test:customer-release:browser`; no dependency change |
| `tests/customer-release-readiness.test.js` | New workflow, CRUD, concurrency, validation/injection, authorization, atomicity and secret-redaction tests |
| `tests/customer-release-migration.test.js` | Populated legacy upgrade/rollback/restore fingerprints |
| `tests/customer-release.browser.cjs` | New complete UI workflow, async races, dialog/keyboard and output checks |
| `docs/customer-phase4-readiness.md` | This report and acceptance matrix |
| `docs/customer-release-runbook.md` | Configuration/storage, deployment gates, backup procedure and rollback guide |

Earlier Phase 1-3 changes remain uncommitted and are described in their respective implementation/review documents. No unrelated functionality was intentionally changed by Phase 4; the wider product/pricing/dashboard/quotation regressions pass.

## Known issues and recommendations

1. Complete the real release backup/isolated staging restore and environment checks before production approval. This validation used representative synthetic data, not a production clone, production load test or hosted tenant-provisioning system.
2. Eight existing moderate ExcelJS/archive dependency advisories remain. Handle them through a separately tested dependency remediation; no high/critical advisory was reported in this audit.
3. Existing jsPDF font/Unicode limits remain; arbitrary multilingual glyph/shaping fidelity is not certified. Validate actual production-language messages in staging before enabling them. Browser Print and server PDF have different established layouts/currency labels; content/amounts agree for tested text. Physical printers and non-Chromium engines were not tested.
4. Historical unversioned rounding is retained deliberately. Use an authorized new quotation/duplicate for corrected arithmetic; do not bulk recalculate issued quotations.
5. Keep one company per isolated app/database boundary. Shared-database multitenancy/RLS is not implemented. Enforce separate provisioning, credentials and database access operationally.
6. Retained logo versions need storage monitoring and a future reference-aware retention policy. Do not remove assets referenced by historical quotations. Dedicated lint/type checking and a full accessibility audit remain tooling/assurance gaps.
7. Release from a reviewed committed snapshot with an immutable image identifier. The current workspace contains prior uncommitted work; this task did not stage, commit or publish it.

All critical automated/local acceptance items pass. The production-specific gates above remain open; production readiness must not be represented as unconditional until they are satisfied.
