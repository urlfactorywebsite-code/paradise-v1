# Dynamic Field Engine — Phase 5 production validation

Review date: 2026-11-05. Scope: Phases 1–4, including the application-wide integration audit fixes. Tests use fresh disposable company databases on loopback PostgreSQL 17. The running application and persistent database have not been migrated, restarted or modified.

## Release decision

**PASS: local critical acceptance for the existing database-per-company implementation. The release candidate is ready for an authorized target-environment rollout and its operational smoke checks; no deployment has been performed.** No new application defect has been identified in this phase. Existing optimistic concurrency, archival guards, tenant boundaries, snapshots and transactional audit behavior are retained rather than reimplemented. Phase 5 adds release tests, a bounded performance harness, and a verification-runner memory safeguard; it adds no feature dependency or database migration.

## Security and data-integrity review

| Required criterion | Implementation and evidence | Result |
| --- | --- | --- |
| 1. Authentication/admin RBAC | Cookie-session authentication and CSRF for writes; `fields.manage` independently checked at the API boundary and again after acquiring the write lock. Normal employees have no Edit Mode. Explicit delegated field permissions retain existing backend semantics. Session/permission revocation tests cover queued writes. | PASS |
| 2. Tenant/organization isolation | One company per database. Connection/database/schema scope is server-owned; client tenant parameters cannot select a company. Separate company fixtures reject foreign field/option/value IDs; cache validators include company, actor, permissions and scope. | PASS |
| 3. Configuration APIs | Whitelisted routes, properties, query parameters, pagination and enum values; authentication/CSRF, ownership checks, parameterized SQL and immutable identities. | PASS |
| 4. Protected business fields | Status/payment/workflow, roles, permissions, tax, pricing methods/bases, units and entity references retain canonical APIs. Protected generic writes fail; label-only controls accept only labels. | PASS |
| 5. Label renaming | Visible captions/display bindings only. Stable field/root IDs, option values, native product keys, handlers, entered values and historical labels are preserved. All 31 caption definitions have browser coverage. | PASS |
| 6. Option archival | Soft archive prevents new selection, key reuse and reactivation. Saved references/snapshots remain readable. Required active dropdowns retain at least one available choice. New open-form and concurrent archive/save tests exercise the authoritative backend policy below. | PASS |
| 7. Drag-and-drop persistence | Shared option editor and product field order endpoints; keyboard reorder alternatives, explicit Save/Reset/Cancel, atomic versions/audit/revision, failed-save rollback and reload tests. | PASS |
| 8. Product scope | Real product ownership, independent same-named custom fields, immutable native pricing keys, switching/late-response isolation and saved line metadata/snapshots. | PASS |
| 9. Global/page scope | Explicit whole-field product > page > global resolution; namespace protection, inactive override semantics, cross-page global UI and immutable root identity tests. | PASS |
| 10. Historical quotations | Server-owned snapshots, finalized-field mutation rejection, trusted duplication/retained choices, unchanged saved amounts and PDF/print projection regressions. Complete schema-13 backup/restore includes finalized quotations. | PASS |
| 11. Pricing compatibility | Custom fields remain descriptive. Display bindings map to canonical native values; backend integer-paise pricing remains authoritative. Native option label/order/archive tests compare exact saved and generated amounts. | PASS |
| 12. Concurrent editing | Existing field versions required (428 when missing; 409 when stale), transaction lock across processes, scope uniqueness constraints. New two-admin/two-app race verifies one winner, one version increment and correct audit actor. | PASS |
| 13. Input validation | Typed values, bounded labels/text/options, finite numbers/dates, duplicate IDs/keys, unknown metadata, coercible page identities and hostile query strings covered. | PASS |
| 14. XSS prevention | Labels, values and audit JSON are rendered with escaping/text APIs; no executable HTML field type. Browser probes verify malicious labels remain text. | PASS |
| 15. Transaction safety | Configuration/options/order/version/cache revision and required audits commit or roll back together. Failure injection covers migration, audit and partial reorder writes. Concurrent customer/archive operations serialize safely. | PASS |
| 16. Audit history | Before/after values, actor, timestamp and action; paginated management history; actor attribution verified across administrators, and history preserved through backup/restore. | PASS |
| 17. Cache invalidation | Revision/ETag changes after mutation; authorization checked before 304 responses; page/product cache scope isolation, shared pending-request coalescing and navigation revalidation of external caption updates. | PASS |
| 18. Page/API performance | Maximum-field API fixture, genuine database plans, constant query counts, conditional 304 reads and 40-dropdown UI fixture measured below. The maximum response-size risk remains documented. | PASS within tested envelope |
| 19. Keyboard/mobile access | Shared modal focus/Cancel/Escape, keyboard option reorder/select, existing touch/mobile layouts and 320/390/768/1440px form checks; explicit permissions keep normal form behavior. | PASS for automated checks |
| 20. Existing regressions | Complete unit/integration and browser matrix covers customer/product/quotation CRUD, report filters/exports, pricing, PDF/print projections, catalog templates, permissions and WhatsApp. | PASS |

These results describe the tested database-per-company architecture. They are not certification of shared-table multi-tenancy, every assistive technology or an external penetration test.

## Optimistic concurrency contract

Every field mutation supplies the current parent field `version`. Product field reorder supplies every owned field ID/version exactly once. The server checks versions inside the company transaction lock before changing any rows. A successful update increments the version and configuration revision and writes an audit entry. Stale requests cannot silently overwrite the winner.

The shared editor preserves a losing draft, disables Save after a conflict and offers an explicit reload. Reload adopts current server configuration; Cancel discards local configuration edits without saving ordinary business records. No parallel concurrency layer, timestamp-only replacement or last-write-wins behavior was introduced.

## Option archived while a form is open

1. An already-open form may still display an option from its earlier configuration response. The backend revalidates the submission against current configuration inside the same transaction as the record write.
2. A newly selected archived choice is rejected with 422. No customer, quotation, option or audit-dependent partial business record is committed. A client-supplied snapshot cannot grant an exception.
3. The form retains entered values and reports the unavailable option. The user can choose a current available option, or reopen/refresh configuration; the system does not silently substitute another value. The new browser test corrects the selection and successfully saves the same retained draft.
4. An archived choice already stored on that record can remain during unrelated edits. Its trusted original snapshot remains unchanged and the UI shows it as unavailable for new selection. New forms omit the archived choice.
5. If creation races with archival, serialization produces either a valid saved selection committed before the archive, or a rejected selection after the archive. Both outcomes are tested; no globally stale choice bypass is permitted.
6. Unchanged older records/lines retain existing compatibility rules when new required fields are introduced. New records and changed selections must satisfy current applicable definitions. Finalized quotations cannot acquire retroactive custom-value changes.

## Performance evaluation

The isolated benchmark creates 500 total definitions, including 433 choice fields with 100 options each (43,300 options), plus 20,000 audit rows containing before/after snapshots of a 100-option field. Fixture generation alone temporarily raises its transaction-local statement timeout; measured API queries retain normal application limits. It does not load or mutate production records. No index was added without a demonstrated query need.

| Measurement | Local result |
| --- | --- |
| Five non-conditional batch resolver responses | Median 476.48 ms; maximum 580.80 ms |
| Resolver configuration queries | One fields query + one options query, independent of field count; no business-record hydration |
| Conditional ETag response | 304 in 16.71 ms; no fields/options queries and no response body |
| Maximum resolver response | 9,360,703 bytes (about 9.36 MB) |
| Management list, 25 fields/page | 64.22 ms |
| History, 20 records/page from 20,000 full-snapshot rows | 53.83 ms |
| Database option lookup plan | Index-assisted lookup; about 1.003 ms execution |
| Database audit history plan | `field_configuration_audit_field` index; about 0.118 ms execution |
| Scope lookup on 500 definitions | Small sequential scan/sort; about 0.644 ms execution; no additional index justified |
| Browser form, 40 dropdowns / 781 available choices | One configuration batch; 64.93 ms to field-ready in the final suite; timing recorded in `dynamic-production-browser.json` |

These are loopback measurements on the shared development machine, not production latency guarantees or statistically established p95 values. The 500-definition response is intentionally a worst-case payload; it is large enough to warrant capacity review for slow networks and very dense forms. Maximum-size API behavior and a representative 40-field UI are tested; this report does not claim a maximum-size 43,300-option mobile rendering benchmark. ETag validation avoids transferring that payload on unchanged revisits. Field visibility/inheritance and genuinely needed options should be reviewed before adopting unusually large configurations. Audit retention/storage growth should be monitored; no automatic deletion policy is added.

Evidence: `test-results/dynamic-phase5-performance.json` contains individual timings and unforced `EXPLAIN (ANALYZE, BUFFERS)` plans. `node scripts/benchmark-dynamic-fields.js` refuses execution without `TEST_DISPOSABLE=1` and a loopback test URL on port 55429, creates its own random database and destroys it afterwards.

## Automated execution report

| Check | Result |
| --- | --- |
| Complete unit/integration suite | PASS: 491 tests; zero failed, skipped or cancelled in the final rerun |
| Complete browser coverage | PASS: 406 checks across 29 suites in the latest verified artifacts |
| New Phase 5 tests | PASS: 4 API/integration tests and 3 browser scenarios |
| Syntax validation | PASS: 152 JavaScript files |
| Frontend production build | PASS |
| Final Docker candidate build | PASS: `paradise-dynamic-phase5:20261105` |
| Production dependency audit | PASS: zero known advisories reported by npm |
| Performance/plan validation | PASS within the measured envelope; maximum-payload capacity caveat below |
| Whitespace validation | PASS with repository CRLF conventions |
| Dedicated lint/type checker | NOT CONFIGURED |
| Production deployment/production data writes | NOT RUN; not authorized |

Final image: `sha256:721a78e4f8acdc4525f7a295a60e8dd74b1bbdcf7074d80f4fb88a95c5964a88`.

The initial complete browser matrix passed 28 suites and encountered a host OpenBLAS allocation failure in quotation-audit PDF text extraction. The runner safeguard was added and that suite reran with all 12 checks passing, including nine controlled pricing/PDF calculations. The 406-check total consolidates the final artifacts; it is not described as one uninterrupted clean invocation. The complete 491-test unit/integration suite was rerun after correcting the new backup test's comparison assumptions and passed. No application runtime change was needed.

Evidence: `test-results/dynamic-phase5-unit-final.log`, `test-results/dynamic-phase5-browser.log`, `test-results/dynamic-phase5-browser-initial-summary.json`, `test-results/dynamic-phase5-pdf-rerun.log`, `test-results/dynamic-phase5-browser-summary.json`, `test-results/dynamic-phase5-build-final.log` and `test-results/dynamic-phase5-dependency-audit.json`.

| Browser suite | Passed checks | Result |
| --- | --- | --- |
| `dynamic-production.browser.cjs` | 3 | PASS |
| `dynamic-pages.browser.cjs` | 59 | PASS |
| `product-fields-review.browser.cjs` | 10 | PASS |
| `product-fields.browser.cjs` | 11 | PASS |
| `dynamic-inline.browser.cjs` | 21 | PASS |
| `product-analytics.browser.cjs` | 9 | PASS |
| `customer-details.browser.cjs` | 15 | PASS |
| `customer-categories.browser.cjs` | 13 | PASS |
| `customer-category-quotation.browser.cjs` | 18 | PASS |
| `customer-release.browser.cjs` | 11 | PASS |
| `quotation-editor.browser.cjs` | 19 | PASS |
| `quotation-audit.browser.cjs` | 12 | PASS |
| `browser-ui.cjs` | 20 | PASS |
| `dropdowns.browser.cjs` | 20 | PASS |
| `dashboard.browser.cjs` | 17 | PASS |
| `products.browser.cjs` | 19 | PASS |
| `pricing-editor.browser.cjs` | 18 | PASS |
| `pricing-refinement.browser.cjs` | 11 | PASS |
| `phase1.browser.cjs` | 6 | PASS |
| `phase1-review.browser.cjs` | 4 | PASS |
| `phase2.browser.cjs` | 7 | PASS |
| `phase3.browser.cjs` | 7 | PASS |
| `phase3-review.browser.cjs` | 6 | PASS |
| `phase3-quantity.browser.cjs` | 2 | PASS |
| `phase3-readiness.browser.cjs` | 3 | PASS |
| `phase4.browser.cjs` | 25 | PASS |
| `phase4-review.browser.cjs` | 5 | PASS |
| `phase5.browser.cjs` | 9 | PASS |
| `reports-dashboard.browser.cjs` | 26 | PASS |

`npm audit --omit=dev --json` reported zero known production dependency vulnerabilities at the time of this review. This is a registry advisory check, not proof that application code or dependencies are free of vulnerabilities. No dependency version changed.

Verification-harness findings: a new backup comparison initially assumed non-unique SQL row ordering and an internal restore error string. The test now compares stable composite order and the restore API's documented refusal, including unchanged data after refusing an existing target. A Windows PDF text-extraction subprocess encountered OpenBLAS allocation failure. The browser runner now defaults its child processes to one BLAS/OMP/MKL worker, preserving explicitly configured values. This affects verification subprocesses only, not application PDF generation.

## Migration instructions

No Phase 5 DDL migration or schema-version increment is required. The existing engine migrations are:

- `011-dynamic-fields.sql`: definitions, options, scope uniqueness/indexes, audit/revision and immutable identity triggers; schema 10 → 11.
- `012-inline-field-editor.sql`: expands supported descriptive field types; schema 11 → 12.
- `013-product-dynamic-fields.sql`: product-owned roots, scoped uniqueness and native display bindings; schema 12 → 13.
- Phase 4 adds idempotently seeded registry metadata on startup. It does not rewrite customer/product/quotation records. Schema remains 13.

Existing migration tests run populated schema 10/11/12 fixtures, inject failure after migration SQL executes, verify transaction rollback and unchanged business fingerprints, then retry and repeat startup. The Phase 5 restore test preserves full schema-13 metadata, audit, archived choices, product bindings, customer/product/quotation rows and finalized snapshots, revokes sessions on restore and refuses overwrite of an existing database.

The following are deployment instructions, not operations performed by this review:

1. Obtain explicit authorization for the target environment, migration window and release. Inventory the current schema and retain the previous approved image/configuration.
2. Stop or pause writes for a consistent release/rollback cutoff. Use the existing backup mechanism in the correct configured environment:

   ```powershell
   docker compose exec -T app npm run backup
   docker compose exec -T app pg_restore --list /app/data/backups/<approved-backup>.dump
   ```

3. Copy the verified backup to approved private backup storage. The established `app_backups` volume is mounted at `/app/data/backups`. Verify the artifact and rehearse restore to a fresh, unused database before production migration. Backups contain sensitive application data; retain existing access controls.
4. Build the approved release from reviewed source. No new environment variables, service, storage provider or dependency is required by Phase 5. Browser/benchmark helpers are development verification tools.
5. Validate startup on a restored production-like database first. Startup applies existing migrations in the established transaction/lock; confirm schema 13, repeated-startup safety, business counts/fingerprints and reference integrity. Do not manually drop constraints, indexes, tables or registry metadata as a deployment shortcut.
6. Deploy/migrate the authorized target, then verify health/login, ordinary-user and admin modes, field save/cache refresh, stale-version rejection, archive behavior, quotation/customer submission, pricing, reports and generated output.
7. Review existing request/error logs and configuration audit history. Resume normal writes only when release smoke checks and backup/rollback availability are accepted.

## Rollback procedure

1. Obtain authorization, pause writes, preserve the failed candidate's database/backup and retain the original pre-release backup. Record post-backup business changes for reconciliation.
2. If the previous approved binary supports schema 13, roll back its image/assets/configuration through the normal deployment process. Retain additive field metadata, options and audit rows; do not delete referenced values to hide UI controls.
3. If rolling back to a binary that does not support the current schema, restore the matching pre-upgrade backup into a **new database**, never over the live one:

   ```powershell
   docker compose exec -T app npm run restore -- /app/data/backups/<approved-pre-upgrade-backup>.dump <unused_database_name>
   ```

4. Validate restored schema/business data with the matching application version. Restore revokes sessions. Reconcile legitimate writes after the backup cutoff before changing the approved application connection to the restored database. Database switching/reconciliation requires explicit authorization.
5. Restart the matching approved image and verify authentication, saved field values, finalized quotations, exact prices/taxes, PDFs, reports and customer/address references before resuming writes.
6. Keep the former database and both backups until the rollback is accepted under the established retention policy. No destructive down migration is supplied or required by this review.

## Changed files

- `tests/dynamic-production.test.js` — two-admin concurrency/audit attribution, stale/forged archived values, archive/create races and full schema-13 backup/restore.
- `tests/dynamic-production.browser.cjs` — open-form archival, saved-value history, normal-mode keyboard/mobile and 40-dropdown batching/timing.
- `scripts/benchmark-dynamic-fields.js` — explicitly disposable capacity fixture, bounded query assertions, timings and query plans.
- `scripts/test-customer-release.js` — adds the production-validation browser suite, keeps legacy selection offsets correct and bounds BLAS threads in verification children.
- `docs/dynamic-fields-phase5-production-validation.md` — this report, acceptance matrix and migration/rollback runbook.

No application runtime source, business calculation, dependency or schema migration changed during Phase 5. Pre-existing workspace changes are preserved. Generated build/test evidence is separate from this file list.

## Remaining risks and final acceptance checklist

Remaining limits: unusually large uncached configuration responses; production-specific latency/storage/load still requiring target observation; no real-time cross-tab push (navigation/refresh revalidates configuration); database-per-company isolation rather than a shared-table tenant implementation; Chrome automation rather than exhaustive browser/screen-reader certification; no dedicated lint or static type-check toolchain in this plain-JavaScript project.

- [x] Authentication, RBAC, CSRF, revocation and company isolation tested.
- [x] Protected fields, immutable IDs and backend pricing rules preserved.
- [x] Global/page/product scopes, saved values and historical snapshots tested.
- [x] Version conflicts, concurrent writes, archive/open-form behavior and atomic audits tested.
- [x] Migration failure rollback/retry and representative backup/restore tested.
- [x] Indexed query behavior, maximum API fixture and representative UI performance measured.
- [x] Known production dependency advisory check completed with zero findings.
- [x] Final complete unit/browser/build checks confirmed above.
- [ ] Target-environment backup/restore rehearsal, deployment authorization and post-deployment smoke checks completed.

The last item is an operational production gate and was not performed. Local critical-test acceptance must not be represented as a completed production deployment.
