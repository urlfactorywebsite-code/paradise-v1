# Final customer/category/quotation release review

Date: 2026-11-04. Scope: Customer Enhancement Phases 1-4, reviewed independently against the final source and isolated runtime.

## Release decision

**Local acceptance: PASS. Production release approval: PENDING. No production deployment was authorized or performed.** This report supersedes earlier test counts. All critical automated/local criteria pass; actual production-data/environment gates remain open. Existing normal application/database containers were left untouched. All writes, migration tests and restore drills used generated synthetic databases in the separately named PostgreSQL 17 instance at loopback port 55429. Nothing was staged, committed, published or deployed.

## Features completed

- Customer form: hidden Status with server default/preservation, managed category selection, Other free text, independent contact-person number, multiple owned delivery addresses, default/selection/archive and atomic customer/address saves.
- Customer Category Management: permission-aware sidebar/page, create/read/edit/archive, active/inactive state, search/pagination, seven managed seeds, future categories without code changes, exact two-decimal 0-100% settings, safe multiline promotional messages/editor preview.
- Private category logos: signature-checked static PNG/JPEG/WebP, bounded decoding, normalized PNG, replacement/removal/fallback, immutable asset versions and authenticated reads. Category logo references are snapshotted; optional decorative category logos in quotation layouts are not added.
- Quotations: automatic unique CR/year references, removed All customers filter/manual reference input, selected customer-owned delivery snapshot, category discount replacing the existing discount, authorized manual replacement/caps, saved category policy, escaped message directly above Terms & Conditions in preview/print/PDF.
- Exact version-2 decimal money/tax calculation for new quotations and duplicates, existing historical policy retained, authorized backend projection for Preview/Print, customer/company/item/category/address snapshots preserved through master/configuration/archive changes.
- Phase 4: controlled filter validation, async customer-modal guards, named accessible dialogs, complete workflow/security/concurrency/migration/restore tests and release/rollback documentation.

## Defects fixed during this independent review

1. **Live address permission bypass through quotations.** A quote-only role could select a known address or inherit a live default through quotation create/preview without customer-view permission. Canonical validation now requires `customer.view` for every new live selection, including guessed IDs and customer changes. Quote-only creators retain the existing permitted customer document snapshot behavior; they do not inherit a live delivery default. Previously saved, authorized delivery snapshots remain editable/duplicable without reading live address data. API and browser regressions cover valid/unknown/foreign IDs, uniform rejection, preview/save/edit and snapshot retention. The API contract and runbook describe the rule.
2. **Preview/Print dropped explicitly public specifications.** The authorized backend projection had already applied field-level public/internal rules. The frontend then applied the older unflagged-specification filter, hiding explicitly enabled Design Requirements. Only authorized preview response objects are now marked in an in-memory WeakSet and retain their already-filtered specifications during rendering. Serialized/client flags cannot enable this path; ordinary saved/legacy documents still use their established filter. The existing legacy browser test reproduced the failure and checks public fields plus internal-note exclusion in preview and protected PDF.
3. **Available regression harness drift.** The ten older browser workflows used superseded editor button labels, hidden profile-menu actions, former product-table columns, ambiguous notes labels and assumptions about a previously prepared shared demo. They now exercise the current controls with the same business assertions. Each gets a fresh normalized synthetic fixture; the pricing-import fixture explicitly prepares its dependent catalog. No product/catalog/pricing application code was changed. The guarded runner supports `--all` and removes prior per-suite JSON evidence before execution so a failed process cannot report stale checks.

An initially broader customer-view restriction failed the existing quote-only dashboard regression and was narrowed before acceptance. Existing authorization policy permitting customer details in an authorized quotation is retained. Intermediate browser failures caused by outdated selectors/fixture baselines were corrected; final outcomes are recorded below.

## Architecture, security and integrity findings

| Area | Result and practical boundary |
| --- | --- |
| Canonical architecture | Existing Node/PostgreSQL store, versioned mutation/REST conventions, shared domain engine, access module, sidebar and style system retained. Relational customer metadata/address hydration is authoritative; no parallel money engine or public logo directory. |
| Database integrity | Additive FKs, case-insensitive category name uniqueness, unique slug, one Other sentinel, one active default address/customer, bounded NUMERIC percentages and composite category/logo ownership FK. Category archive never physically deletes referenced records. |
| Atomicity/concurrency | Existing advisory-lock transactions, optimistic versions and commit-time authorization retained. Injected customer/address/quotation persistence failures roll back data, revision and audit. Duplicate saves and competing edits are covered. |
| Authorization | Backend category permissions, customer/address permissions, quotation ownership, existing price/discount caps, session/CSRF/origin controls and in-flight permission revocation pass. Address permission fix also covers quotation projections and writes. |
| Tenant isolation | PASS for the **existing separate application/database per company model**: foreign sessions, identical category IDs and logo/address IDs cannot cross tested databases. This application does not provide shared-database tenancy, tenant columns or RLS. Separate provisioning/credentials/network access remain mandatory. |
| Input/security | Strict types/lengths/IDs/pagination, allowlisted ordering, bound literal searches, control-character rejection, escaped category/customer/message text and literal hostile markup in documents. No arbitrary executable message HTML. |
| Uploads/storage | <=300,000 input bytes; signature and raster decoding; <=4096 pixels/side and 16 MP; animated/SVG/GIF/corrupt payloads rejected. Re-encoding strips metadata/appended payloads, <=512 pixels/side and 2 MiB output. Private separate DB table, authenticated no-store/nosniff/sandbox responses, immutable historical keys. |
| Snapshots | Master/category/message/address/logo configuration changes and archival do not rewrite finalized records or outputs. Explicit existing Administrator quotation-edit capability remains; this is not a new immutable revision workflow. |
| PDF/Print | Actual protected PDFs and Chromium print output examined for totals, message placement/escaping, billing/delivery separation, long specifications/highlights and pagination. Existing server/print layouts differ intentionally. Internal notes remain excluded. |
| Logging/backups | Existing generic caller errors, request IDs, code/name logs, audit and health/readiness retained; secret-redaction tests pass. Private PostgreSQL dumps include logo/snapshot data. |
| Unrelated functionality | Final source hashes are compared with the 186-file start-of-review baseline. Only the listed review files differ; unrelated source files and both normal containers are preserved. Broad dashboard/product/pricing/template/quotation regressions are included. This is evidence-based regression verification, not a proof of every possible behavior. |

## Database migrations

| Migration | Behavior |
| --- | --- |
| `007-customer-details.sql` | Adds category reference/seeds; nullable customer category/custom-category/contact phone; owned delivery-address table/FK/default constraint/indexes. Existing customer bodies/status/IDs/versions and quotation relationships are not backfilled or rewritten. |
| `008-customer-category-management.sql` | Adds slug, NUMERIC(5,2) discount, safe message flags/limits, archive/version/timestamps, private normalized logo rows and composite ownership FK. Stable seeds do not overwrite administrator configuration. |

Schema remains **8**. No Phase 3/4 or final-review migration was added. Quotation policy/snapshots remain JSON. Startup migrations/version markers are protected by the existing transaction/advisory lock. Automated checks cover fresh/populated schema 6 to 8, rollback after injected migration-008 failure, retry/repeated/concurrent startup, ten legacy table fingerprints and dump/restore including stored PDF bytes. Actual production-backup restore has not been performed.

## Test execution results

Local image: `paradise-customer-final-review:20261104`, immutable local image identifier `sha256:b64a10654a42dfd6f715051d87136739759bae6b42876e0814097c1855e55e76`. It was not pushed or deployed.

| Check | Final result |
| --- | --- |
| Complete unit/integration suite | **PASS - 406/406**, 0 failures/skips; PostgreSQL client tools in isolated Linux image, final source mounted read-only |
| All available browser/E2E suites | **PASS - 267 checks across 22 suites**, 0 final failures or JavaScript exceptions |
| Bundled release-image customer/category/quotation/migration tests | **PASS - 58/58**, application source not mounted; tests only |
| Built-image HTTP smoke | **PASS**: schema 8 readiness, bundled assets, native raster normalization, protected logo, customer/address/discount/save/PDF, invalid filter rejection |
| Migration/restore | **PASS**, included above: populated schema 6 to 8, forced DDL rollback/retry, repeated/concurrent startup, legacy fingerprints, private-logo/quotation/PDF retention, backup/restore |
| Money/tax oracle | **PASS**, including 600 independent vectors, exact boundaries, 0/100%, allocation, category/manual replacement, caps and mixed tax treatments |
| PDF/Print | **PASS**: actual output extraction/rendering, public-field parity, escaped multiline highlight above terms, correct address and totals, historical/long/multipage regressions |
| JavaScript syntax | **PASS - 120 JS/CJS files**, `npm run check` |
| Frontend build | **PASS**, `npm run build` |
| Docker/Compose | **PASS**, final Docker build and isolated `.env.example` Compose configuration validation; normal Compose project never restarted |
| Whitespace | **PASS**, `git diff --check` exit 0; only existing line-ending notices |
| Dedicated lint | **NOT CONFIGURED**: no lint task/configuration; syntax checking is not linting |
| Type checking | **NOT CONFIGURED**: plain JavaScript, no type-check task/tsconfig; not represented as a pass |
| Dependency audits | **8 moderate, 0 high/critical** in both production-only and full dependency audits; expected nonzero audit exit because advisories remain |
| Source/final-log pattern scan | **PASS for scanned patterns**: 0 secret findings; commented USER:PASSWORD example reviewed. UTF-8/UTF-16 logs decoded; not a forensic guarantee |
| Unrelated-file preservation | **PASS**: 168 of 186 baseline files unchanged; all 18 changed baseline files are explicitly scoped review fixes/tests/docs, plus this new report |

The complete `--all` browser run was followed by a final rerun of the older catalog Phase 4 suite after replacing ambiguous `nav` selectors with named main navigation. All 22 final outcomes are retained in the consolidated evidence; the intermediate failing log remains available. Earlier failures are described above rather than counted as current passes.

Representative independently checked amounts (INR):

| Case | Subtotal | Discount | Net | GST | Grand total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Managed category 12.34%, exclusive 18% | 300.00 | 37.02 | 262.98 | 47.34 | **310.32** |
| Built-image HTTP smoke, 10.25%, exclusive 18% | 300.00 | 30.75 | 269.25 | 48.47 | **317.72** |
| Version-2 half-paise tax boundary, 2.3% | 15.00 | 0 | 15.00 | 0.35 | **15.35** |
| 100% product discount, 15.00 undiscounted charges | 300.00 | 300.00 | 15.00 | 2.70 | **17.70** |

Category discounts use exact basis points and replace the single manual/category discount. Largest-remainder allocation, grouped inclusive/exclusive/exempt tax and split/IGST conservation pass, including 600 independent oracle vectors. The 310.32 example agrees across frontend, authorized backend preview, persisted DB total, actual PDF, print and finalized historical output after category/address edits. Unversioned historical 15.34 boundary totals remain unchanged deliberately.

Evidence: ignored `test-results/customer-final-*` logs, dependency audit, PDF text/renders, image smoke, hash comparison and scan. Consolidated browser JSON is copied to `customer-final-browser-summary.json`; per-suite evidence/logs retain the existing filenames. Deliberate injected 500 log messages belong to rollback tests. No fixture credentials or dumps are part of the release report.

## Files changed

This final review changes application code only in `server/validation.js`, `server/openapi.js`, `public/srs-ui.js` and `public/quotation-ui.js`. Review/test/documentation changes: `scripts/test-customer-release.js`, `tests/customer-release-readiness.test.js`, `tests/customer-release.browser.cjs`, ten `tests/phase*.browser.cjs` compatibility updates, this report and the release runbook. Prior phase work remains intact and uncommitted.

The complete current phase/review working-tree inventory relative to HEAD follows. Existing initial dirty changes are included for release review; this task did not introduce every line in these files. Phase implementation documents describe their original changes.

```text
.env.example
compose.yaml
docs/customer-category-readiness-review.md
docs/customer-final-release-report.md
docs/customer-phase1-review.md
docs/customer-phase1.md
docs/customer-phase2.md
docs/customer-phase3-review.md
docs/customer-phase3.md
docs/customer-phase4-readiness.md
docs/customer-release-runbook.md
package-lock.json
package.json
public/app.js
public/category-quotation-ui.js
public/customer-categories-ui.js
public/customer-categories.css
public/customer-ui.js
public/customer.css
public/index.html
public/quotation-ui.js
public/quotation.css
public/srs-ui.js
public/workspace-ui.js
scripts/check.js
scripts/restore.js
scripts/test-customer-release.js
server.js
server/access.js
server/customer-api.js
server/customer-categories.js
server/customer-category-logos.js
server/customer-details.js
server/migrations/007-customer-details.sql
server/migrations/008-customer-category-management.sql
server/openapi.js
server/pdf.js
server/queries.js
server/resources.js
server/store.js
server/validation.js
shared/customer-categories.js
shared/domain.js
tests/access-whatsapp.test.js
tests/customer-categories-api.test.js
tests/customer-categories.browser.cjs
tests/customer-category-quotation.browser.cjs
tests/customer-category-quotation.test.js
tests/customer-details-api.test.js
tests/customer-details.browser.cjs
tests/customer-release-migration.test.js
tests/customer-release-readiness.test.js
tests/customer-release.browser.cjs
tests/phase1-api.test.js
tests/phase1-migration-review.test.js
tests/phase1-review.browser.cjs
tests/phase1.browser.cjs
tests/phase2-api.test.js
tests/phase2.browser.cjs
tests/phase3-api.test.js
tests/phase3-quantity.browser.cjs
tests/phase3-readiness.browser.cjs
tests/phase3-review.browser.cjs
tests/phase3.browser.cjs
tests/phase4-review.browser.cjs
tests/phase4.browser.cjs
tests/phase5-api.test.js
tests/phase5.browser.cjs
tests/quotation-editor-api.test.js
tests/quotation-editor.browser.cjs
tests/srs-pdf.test.js
```

## Remaining risks and release gates

1. **Production approval pending:** restore the actual approved release backup into an isolated staging target; compare business counts/IDs/versions/snapshots/totals, protected handoff bytes and logos. Verify TLS, exact origin, secure cookies, proxy routing and operational capacity. Local synthetic results do not certify production data or load.
2. **Eight existing moderate dependency advisories**, zero high/critical in the recorded audit, in the ExcelJS/archive dependency chain. No dependency change was made by this review. Remediate in a separate compatibility-tested dependency task.
3. **Lint/type checking not configured.** Plain JavaScript syntax checks pass but do not replace a static analysis/type system. Full accessibility certification, physical printers, non-Chromium browsers and arbitrary multilingual glyph/shaping fidelity are not certified. Existing jsPDF font limitations require actual-language staging samples.
4. **Operational tenancy and storage:** provision separate app/database credentials per company. Retained historical logo assets require capacity monitoring and reference-aware retention; never prune them blindly. Customer address cap includes archived rows (100 total).
5. **Historical arithmetic/downgrade:** old calculation policy is intentionally retained. An older binary with schema 8 may still mishandle newer quotation JSON; schema-number equality does not guarantee downgrade safety. Release a reviewed committed snapshot and pin its immutable image; the workspace is currently dirty.

## Deployment steps - operator actions, NOT executed

1. Select/review the intended release commit and pin the tested immutable image. Record the prior app image and database target; keep the normal installation unchanged until explicitly authorized.
2. Quiesce writes. Use the existing approved backup command `docker compose exec -T app npm run backup`; preserve the exact private dump, SHA-256, size and recovery point. Verify archive listing and restore it to a **separate unused staging database**, never production.
3. Follow [the release runbook](customer-release-runbook.md) for staging schema-8 startup, fingerprint/count/version/total/logo/PDF checks, role checks, TLS/origin/cookie settings, native raster support and persistence/backup capacity.
4. Obtain explicit deployment authorization, then use the established Compose/proxy process with the approved immutable image. Keep old writers stopped. Startup applies only pending additive migrations 007/008.
5. Verify health/readiness/logs, approved smoke cases and a historical quotation through the real proxy, reload clients, reopen writes and monitor under the existing conventions. Do not create arbitrary production fixtures.

## Rollback steps - operator actions, NOT executed

1. Quiesce writes; retain a full post-release dump, current image and upgraded database. Inventory post-backup writes needing reconciliation.
2. Restore the verified **pre-release** dump to a separate unused database using the existing restore tool. Never overwrite/drop the upgraded production database or use destructive live down migrations.
3. Start the matching prior image against that isolated restore; verify schema compatibility, historical totals, customers, addresses/categories/logos and PDFs. Restored sessions are revoked.
4. Reconcile post-backup writes under an approved plan before reopening writes. Preserve both databases/dumps until signed off.
5. Switch traffic/connection only with explicit authorization, recheck health/readiness and smoke behavior, reopen writes and monitor. See the runbook for backup/restore syntax and compatibility cautions.

## Final acceptance checklist

- [x] Customer data/status compatibility, Other text, independent phone and existing customer/quotation CRUD verified.
- [x] Category CRUD/sidebar/authorization, duplicate/search/pagination, archive associations and configuration verified.
- [x] Private bounded raster upload, replacement/removal/fallback and historical asset references verified.
- [x] Customer/address ownership, quote-path permissions, separate-database isolation and atomic persistence verified.
- [x] One discount, exact new money/tax policy, authorized overrides, saved totals and legacy calculation preservation verified.
- [x] Customer/company/item/category/address snapshots and finalized output consistency verified.
- [x] Public specification parity, internal-note exclusion, safe highlights above terms, actual PDF/Print and pagination verified.
- [x] Concurrency, stale/duplicate saves, API bounds, SQL/XSS defenses, responsive/keyboard/dialog behavior covered.
- [x] All available automated/browser tests, syntax/frontend/Docker/Compose builds and migration/restore checks pass.
- [x] Unrelated files/normal running installation preserved; no production mutation/deployment or Git staging/commit performed.
- [x] Deployment, backup/storage/configuration and rollback guidance documented.
- [ ] Dedicated lint/type tooling: not configured; assurance gap recorded.
- [ ] Existing moderate dependency advisories accepted or remediated under the release policy.
- [ ] Actual production-backup isolated restore, production-language PDF samples and proxy/TLS/session/capacity checks signed off.
- [ ] Reviewed release commit, immutable published image, operational rollback/reconciliation plan and explicit deployment authorization obtained.

**Acceptance status: local implementation and regression acceptance PASS; production readiness/approval remains conditional on the unchecked release gates.**
