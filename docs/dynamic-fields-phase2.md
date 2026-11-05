# Dynamic Field Engine — Phase 2: Admin Edit Mode

Date: 2026-11-05. Scope: session-local admin Edit Mode, reusable field editors, and validated custom values in the existing customer and quotation editors. No production deployment, production database migration, or persistent application restart was performed.

## Completed behavior

- An **Edit Mode OFF/ON** header button is visible only to administrators with `fields.manage`. It starts OFF, stays enabled across page navigation in the same tab/session, and resets on refresh, logout, account/session changes, or lost authorization. It uses memory only; neither mode nor configuration is stored in localStorage.
- Supported fields show edit controls only while mode is ON. Customer name/type support caption changes only. Customer/quotation additional fields support definition creation, label changes, required settings, and inline option management. Canonical customer/product relationships, category management, pricing, tax, status, workflow and role fields remain governed by their existing APIs and registry policies.
- The compact editor provides all existing options, stable readonly saved keys, Add New Option, rename, archive/undo before saving, drag handles, keyboard Move up/down, explicit Save, Cancel, and Reset unsaved edits. Archived saved options cannot be deleted, restored or reused. Loading, validation, success, retry, and stale-version errors are visible. A conflict retains the draft and requires explicit reload before another save.
- Add field supports **Text, Number, Dropdown, Multi-select, Date, Checkbox, Textarea** in the customer and quotation additional-fields sections. Other protected forms do not receive arbitrary fields without corresponding persistence/validation adapters.
- Configuration saves use the central engine and never submit ordinary customer/quotation drafts. Ordinary record Save persists custom values through the existing record transaction, authorization and version checks. Turning Edit Mode OFF leaves ordinary field interactions available.
- Native dialogs provide named modal semantics, focus containment, Escape cancellation and focus return. Options expose list semantics and a live reorder announcement. Responsive layouts and reduced-motion rules follow existing teal styling. Label decoration preserves the original input's keyboard focus.

## Architecture and API

`public/dynamic-fields-ui.js` is the plain JavaScript equivalent of a provider: one `GlobalEditMode` session controller and reusable mounts, dialog/editor, typed controls and cache. It follows this application's existing architecture rather than introducing a framework. The header is shared across pages; adapters are explicitly limited to supported sections.

The UI uses batched page resolution, coalesces simultaneous requests, revalidates private ETags and discards stale responses after configuration saves/session changes. There is no per-dropdown request. The server's existing revision invalidates other clients on their next revalidation; an already open editor uses optimistic concurrency and receives 409 if its version is stale.

New endpoint:

```text
PUT /api/configurable-fields/{id}/editor
{ version, data: { label, isRequired, options: [{id?, value, label, isActive, archived}] } }
```

The API also accepts existing permitted visibility/activation/order/configuration settings. Options are optional when saving only settings. When supplied, the array must retain **every existing option ID exactly once**, including archived options. Array order is the saved order. IDs/value keys cannot change. New options omit `id`. Missing versions return 428, stale versions/duplicate identities 409, invalid values 422, foreign options 404 and protected fields 403.

One existing workspace transaction commits the entire editor change, field version, configuration revision and before/after audit. A failed option write rolls everything back. Authentication, CSRF and `fields.manage` are checked independently on the backend, including after obtaining the write lock. Existing explicitly delegated API management permissions remain intact; the global UI toggle is administrator-only. Tenancy remains one company per database; no tenant can be chosen in request input.

## Custom values and historical data

Values are stored in existing customer/quotation JSON as `customFields`, keyed by immutable **rootFieldId**, with server-generated `customFieldSnapshots`. This extends the established document storage without another business-record store. The shared `dynamic-values.js` validator is reused in browser and server; the server remains authoritative.

- Text limits follow configuration (up to 4,000 characters); labels and options are plain escaped text.
- Numbers must be finite and between -1,000,000,000 and 1,000,000,000. They are metadata and never participate in pricing arithmetic.
- Dates require a real ISO calendar date. Checkbox values are booleans; a required checkbox must be checked. Choice values are stable keys; multi-select arrays are unique and limited to 100 entries.
- New records enforce current required settings. Unchanged existing records/values are grandfathered when configuration changes, preserving existing data and workflows. Edited values must satisfy current definitions. Hidden/inactive prior values are retained.
- Archived/inactive choices may only be retained where already selected. Snapshot labels preserve their historical display. Unchanged values retain their existing snapshots; client-supplied snapshots cannot replace server snapshots.
- If a later page override no longer contains a saved choice, the form displays it as a disabled **(saved)** choice using its snapshot. An ordinary record edit preserves it, while new selections remain limited to the current configuration. These per-record choices are not inserted into the shared configuration/cache.
- The canonical quotation Duplicate action retains the server's trusted source values/snapshots, including archived selections. A normal new-quotation payload cannot claim this exception or forge its own historical snapshots. Current missing required fields still need valid values.
- Saved non-Draft quotation custom values are immutable. Their editor uses saved labels and selected-option labels, hides configuration controls and shows retired saved fields separately.
- These custom fields are **staff metadata**. Customer-facing preview/PDF/print projections intentionally retain their existing allowlists. Custom metadata is not copied into a new quotation's customer-facing customer snapshot, and does not alter totals, discounts, tax or document formatting.

Configuration resolution retains Phase 1 whole-field inheritance: product override → page override → global root. These are customer-level/quotation-level adapters, not product line-item adapters; they resolve page/global configuration without a product scope. Product specification/pricing editors remain unchanged.

## Database migration

`012-inline-field-editor.sql` replaces the existing field-type CHECK constraint with one accepting the seven supported types plus protected `system`. It preserves all rows, identities, associations, options, audits and business JSON. Startup migration and version recording run inside the existing transaction/lock; a failed expansion restores the schema-11 constraint/version, and retry is idempotent. The current server/backup restore ceiling is schema **12**.

No new packages, environment variables, external storage, background service, or production configuration are required.

## Verification

| Check | Result |
| --- | --- |
| Complete Node/PostgreSQL suite in the final production image | PASS: **469 tests**, zero failures, cancellations or skips |
| New Phase 2 API/integration cases | PASS: **9 tests**, including source/built shared assets, atomic failure rollback, schema-11 upgrade failure/retry, typed values, permissions, foreign IDs, finalized snapshots and archived selections in duplicated quotations |
| Browser/E2E matrix plus targeted reruns after the source-asset fix | PASS: **319 checks across 25 suites**, zero remaining failed checks or page exceptions |
| Packaged server smoke | PASS: **4 checks** for non-root/schema-12 startup, exact final assets, atomic editor/typed customer values, unchanged quotation snapshots and persistence/authentication across a real container restart |
| JavaScript syntax | PASS: **138 files** (`npm run check`) |
| Frontend assets and production Docker build | PASS (`npm run build`, `docker build`) |
| Whitespace | PASS (`git diff --check`; existing CRLF conversion notices are not errors) |
| Dedicated lint / static typing | NOT CONFIGURED |
| Production deployment / production data mutation | NOT RUN |

Candidate: `paradise-dynamic-fields-phase2:20261105`, image ID `sha256:f9b723f200e7147c624e09c5ee33978221f0062d6cea62ccc81f1c59abd87d35`. Full tests used this image's packaged runtime/server/shared/public/scripts, mounting only tests and evidence. Browser tests used generated loopback applications with installed Chrome and newly built assets. All databases were generated on a disposable PostgreSQL 17 tmpfs container. No persistent installation data was used.

The final browser matrix exposed two source-assets failures from the missing shared validator route. After fixing the route, the affected customer and category/quotation suites were rerun successfully: **15 and 18 checks** respectively. The final summary retains the original failures and identifies these targeted reruns; the 319 count is the latest result for each check, not a claim that the initially failing invocation passed. The earlier full 318-check run and the added scope-retention case are also preserved in the evidence.

Commands: `node --test --test-concurrency=2 tests/*.test.js` inside the candidate, `node scripts/test-customer-release.js --all`, `npm run check`, `npm run build`, and `git diff --check`. Local browser verification requires `TEST_DISPOSABLE=1` and an explicitly disposable PostgreSQL URL on loopback port 55429. The runner refuses arbitrary target servers.

Evidence in `test-results/`: `dynamic-fields-phase2-full-tests.log`, `dynamic-inline-api.log`, `dynamic-fields-phase2-browser-matrix.log`, `dynamic-fields-phase2-browser-summary.json`, `dynamic-inline-browser.json`, `dynamic-inline-mobile.png`, `dynamic-inline-desktop.png`, `dynamic-fields-phase2-image-build.log`, `dynamic-fields-phase2-image-smoke.json`, `dynamic-fields-phase2-syntax.log`, `dynamic-fields-phase2-build.log`, `dynamic-fields-phase2-whitespace.log`, and `dynamic-fields-phase2-changes.json`. Initial failing browser results are retained separately in `dynamic-fields-phase2-browser-initial-summary.json`, `dynamic-fields-phase2-browser-initial.log`, and `dynamic-fields-phase2-browser-before-source-fix-summary.json`. Successful source-mode reruns are in `dynamic-fields-phase2-customer-final.log` and `dynamic-fields-phase2-source-quotation-final.log`. Deliberately injected backend failures emit expected error logs; their assertions pass.

Defects found during implementation were corrected: generated field keys now always start with a valid letter; label decoration retains focus; asynchronous configuration loading cooperates with the existing save lock when a newer customer form opens; loading failures remain visible and cannot submit records without configuration validation; quotation duplication retains trusted historical custom selections instead of incorrectly rejecting archived options; later scope overrides cannot turn saved choices into blank selections; the new shared validator is served in source-assets mode as well as built mode. Existing regression cases cover the customer focus/save races; new browser cases cover generated keys, retry and scope retention. Reproductions are retained in `test-results/dynamic-inline-duplicate-reproduced.log` and `dynamic-inline-scope-reproduced.log`.

## Files changed in this phase

The SHA-256 baseline distinguishes these changes from pre-existing dirty work. Evidence: `test-results/dynamic-fields-phase2-changes.json`.

- New frontend: `public/dynamic-fields-ui.js`, `public/dynamic-fields.css`.
- Existing frontend integration: `public/app.js`, `public/index.html`, `public/workspace-ui.js`, `public/customer-ui.js`, `public/quotation-ui.js`.
- Central backend/value integration: `server/dynamic-fields.js`, `server/field-values.js`, `server/store.js`, `server/validation.js`, `server/resources.js`, `server/openapi.js`, `shared/dynamic-values.js`.
- Static shared-asset routing: `server.js` adds the validator alongside the existing approved shared files, including when serving directly from `public/`.
- Migration/restore support: `server/migrations/012-inline-field-editor.sql`, `scripts/restore.js`.
- Tests/runner: `tests/dynamic-inline.test.js`, `tests/dynamic-inline.browser.cjs`, `scripts/test-customer-release.js`.
- Existing schema-ceiling/rewind assertions: `tests/access-whatsapp.test.js`, `tests/customer-release-migration.test.js`, `tests/dynamic-fields.test.js`, `tests/phase1-api.test.js`, `tests/phase1-migration-review.test.js`, `tests/phase2-api.test.js`, `tests/phase3-api.test.js`, `tests/phase5-api.test.js`, `tests/product-analytics.test.js`.
- Documentation: this file.

No changes to canonical pricing calculations, WhatsApp sharing, reports, category/logo management or product configuration were introduced by this phase.

## Deployment checklist — not executed

1. Obtain deployment authorization and review this bounded diff with the pre-existing pending work. Retain the previous image/configuration.
2. Use the existing `npm run backup` procedure and verify `npm run restore -- <backup.dump> <unused_staging_database>` into a separate database. Never restore over the live database for rehearsal.
3. Run the candidate on that restored staging copy. Verify schema 12, original row/version fingerprints, existing quotation/customer workflows, admin/non-admin visibility, protected fields, custom values and rollback. Measure target migration duration and configuration size.
4. During an authorized maintenance window, stop old writers, take the final verified backup and start the candidate using the established deployment procedure. Startup applies migration 12 atomically.
5. Verify `/api/ready`, login/CSRF, admin mode OFF by default, mode/navigation/reset behavior, configuration conflict handling, normal customer/quotation saves and existing PDF/WhatsApp outputs. Retain existing monitoring/logging conventions.

## Rollback checklist — not executed

1. Stop writers/traffic and retain a backup of the upgraded database, including post-release writes and new metadata.
2. Schema-11 servers refuse schema 12. **Do not lower migration versions, force old code onto the new schema, or delete new field definitions/values.**
3. Restore the verified pre-release backup into a separately named database, point the retained matching old image/configuration at it, and verify readiness/business workflows before switching traffic.
4. Reconcile any post-backup writes before reopening writes. Preserve the upgraded database for investigation/export. A forward fix or explicitly verified schema-12-compatible artifact can avoid reverting data; no automatic destructive downgrade is supplied.

## Remaining limitations

- Target production/staging restoration, target-volume migration timing and deployment are not performed here. Local/disposable verification is not a production certification.
- Automated UI tests use installed Chromium; other browser engines and physical touch/screen-reader devices require target acceptance. Keyboard reorder controls are available where native drag-and-drop is unavailable.
- Configuration changes in another session become visible on next page/form resolution or explicit reload; there is no push channel. Stale saves remain protected by versions.
- No dedicated lint or static type-check toolchain exists in this plain JavaScript repository. Syntax, build, API/integration and browser regression checks are used and reported separately.

## Final acceptance

- [x] Administrator-only OFF-by-default toggle; navigation, logout, refresh and account switching verified.
- [x] Inline label/option editing, stable keys, add/archive, drag/keyboard order, Save/Cancel/Reset and conflict handling verified.
- [x] All seven field types persist through supported customer/quotation sections and central validation.
- [x] Backend authentication, CSRF, permissions, company isolation and protected-field rules retained.
- [x] Atomic configuration writes, audit/revision integrity and failure rollback verified.
- [x] Archived choices, changed scopes, duplicate quotations and finalized label snapshots preserve existing values.
- [x] Responsive dialog, keyboard focus and reduced-motion checks pass.
- [x] Schema-11 upgrade/retry, record preservation, backup/restore and existing business regressions pass.
- [x] Final image, full backend suite, browser matrix/reruns, syntax and asset builds pass.
- [ ] Target restored-data staging rehearsal and authorized production deployment remain unperformed.

**Phase 2 local acceptance: PASS.** No unresolved critical defect remains in the tested scope. Disposable verification resources were removed; the persistent application/database were not restarted or migrated. Deployment remains subject to explicit authorization and target-environment acceptance.

The subsequent [independent Edit Mode review](dynamic-fields-phase2-review.md) records additional scope-retention, draft-validation, responsive layout and nested-keyboard fixes with fresh acceptance evidence.
