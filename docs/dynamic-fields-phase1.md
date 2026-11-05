# Global Dynamic Field & Dropdown Engine — Phase 1

Date: 2026-11-05. Phase 1 implements the database, registry, configuration APIs, resolution, authorization, caching contract and tests. It does not add an administration screen or rebind existing forms. Existing customer, quotation, product/pricing, reporting and WhatsApp workflows remain on their established engines. No production deployment or production database changes were performed.

## Repository audit and architecture

The application is plain browser JavaScript with a Node HTTP server, `pg` and PostgreSQL; there is no frontend framework or ORM. `server.js` authenticates cookie sessions, enforces CSRF for writes and dispatches to `server/resources.js`. Backend permissions live in `server/access.js`; updates serialize through the existing workspace advisory transaction lock. Each company has its own database/schema deployment. There is no client-selectable tenant ID or cross-company shared configuration table.

`public/dropdowns.js` enhances native `<select>` elements and observes option changes; it is a presentation/accessibility control, not configuration storage. Existing business dropdowns come from several authoritative sources:

| Existing source | Treatment in this phase |
| --- | --- |
| Quotation statuses, approvals and calculation/discount rules in `shared/domain.js`, validation and access APIs | Protected canonical workflows; no option editing through the new engine |
| Product `f` definitions, priced options, dimensions, compatibility and catalog/gift templates | Existing shared product/pricing engine remains authoritative; protected registry families |
| Customers, delivery addresses, managed customer categories, products, categories and employees | Protected database relationships; retain their dedicated CRUD, authorization and archival rules |
| Tax modes, roles, permissions, reporting metrics and chart modes | Protected canonical values; no arbitrary option injection |
| Customer name/type field captions | Label-only configuration metadata; backend requiredness and validation remain canonical |
| New `custom_` dropdown/text definitions | Configurable fields, independent of the existing business JSON and pricing engine |

The registry lists protected and label-only definitions and declares the configurable custom-field policy. Payment/workflow families include reserved protected identities; this does not introduce a payment workflow. There are no guessed business choices or prices. The new database seed contains only registry metadata, with no custom dropdown values or customer/product/quotation rewrites.

## Schema and integrity

Migration `server/migrations/011-dynamic-fields.sql` advances the supported schema from 10 to 11, inside the existing startup migration transaction and lock. It adds:

- `configurable_fields`: stable ID/key, explicit root linkage, page/scope, label/type/policy, required/active/visible flags, order, JSON presentation settings, optimistic version and timestamps.
- `configurable_field_options`: immutable value key and ID, separate editable label, order, activation/archive metadata and timestamps.
- `field_configuration_audit_logs`: actor, field, action, full before/after metadata and timestamp. A successful mutation also uses the existing general audit convention.
- `field_configuration_state`: monotonic database revision for cache invalidation.

Unique constraints protect root `(page_key,field_key)`, root/target overrides and `(field_id,value)`. Database triggers prevent changing field identity/type/policy/scope or option identity/value. Foreign keys preserve root/option/audit references. Product-scoped definitions have a generated product FK; referenced products can be deactivated, but hard deletion returns 409. Products without such configurations retain their existing deletion behavior.

No hard field/option deletion endpoint exists. Archive is permanent for an option key: its row remains available for historical display, and the key cannot be reused or reactivated. An option's label can change without altering the stored value. New client integrations must persist stable field/root identities and immutable option values, and snapshot labels when historical presentation matters. Existing quotation snapshots are neither interpreted as these custom fields nor rewritten.

## Scope resolution

Supported pages: `customers`, `quotations`, `products`, `pricing`, `reports`, `settings`, `users`.

1. A global root uses `pageKey: "global"` and explicitly lists applicable pages in `configuration.pages`. Nothing inherits globally by accidental name matching.
2. A page root belongs to its page. An override references a configurable **root** with `baseFieldId`; arbitrary override chains are rejected.
3. A global root can have a page override. Either root can have a product override for a meaningful page (`quotations`, `products`, `pricing`) and existing product ID.
4. Resolution chooses **product override → page override → root/global default**. An override replaces the complete field, including its option set; its initial settings/options are copied from the root unless supplied explicitly. Later root edits do not overwrite an explicit override.
5. Inactive/hidden overrides remain selected; they do not fall back to an active default. Consumers must honor `isActive`/`isVisible`; hidden required fields are rejected.
6. Responses expose `rootFieldId` and a qualified key such as `global.custom_finish` or `customers.custom_finish`. Equally named fields on different pages are independent. Consumers must not merge by bare label or `fieldKey`.

Resolved `options` contain active, unarchived choices. `retainedOptions` contain inactive/archived choices for displaying already stored values without another request; they are not selectable for new values. Administrative field details/listing include every option. Protected and label-only policies must be honored by adapters: their metadata never relaxes the canonical backend's validation, relationships or required fields.

## API and RBAC

All endpoints require a session. Mutations additionally require CSRF and `fields.manage`. Administrators receive this permission through existing administrator semantics; employees receive neither new management permission by default. Explicitly granted `fields.view` permits administrative metadata/audit reads, while `fields.manage` permits configuration management. Neither permission grants customer records, quotation records or private pricing access.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/field-configurations/registry` | Explicit policies, page keys, custom-field rules and limits |
| `GET /api/configurable-fields` | Paginated field definitions/options; filters `pageKey`, `scopeType`, `scopeId`, `q`, `page`, `pageSize` |
| `GET /api/configurable-fields/{id}` | Definition, all options, version and configuration revision |
| `POST /api/configurable-fields` | Create custom root or explicit override; initial options are atomic |
| `PATCH /api/configurable-fields/{id}` | Rename/configure permitted settings with current field version |
| `POST /api/configurable-fields/{id}/options` | Add immutable value and separate label |
| `PATCH /api/configurable-fields/{id}/options/{optionId}` | Rename, order or activate/deactivate an unarchived choice |
| `DELETE /api/configurable-fields/{id}/options/{optionId}` | Archive without deleting the row/key |
| `POST /api/configurable-fields/{id}/options/reorder` | Reorder every option ID exactly once, including archived options |
| `GET /api/configurable-fields/{id}/audit` | Paginated configuration audit history |
| `GET /api/field-configurations/resolve?pageKeys=customers,quotations&productId=...` | One batch for permitted pages and optional product |

Resolve uses existing access permissions for **every** requested page, or explicit field-management permission. A metadata viewer without page access cannot use resolve to bypass it. Management writes recheck active user/session and current permissions after obtaining the write lock, then atomically commit definition/options, field version, both audits and configuration revision. Missing versions return 428; stale versions, duplicate identities and protected references return 409. Protected field edits return 403. Unknown inputs, unsupported scopes, invalid flags and tenant selectors fail closed. Option IDs are checked within their owning field.

Create example:

```json
{
  "data": {
    "pageKey": "quotations",
    "fieldKey": "custom_finish",
    "fieldType": "dropdown",
    "label": "Finish",
    "options": [
      {"value": "matte", "label": "Matte", "displayOrder": 0},
      {"value": "gloss", "label": "Gloss", "displayOrder": 1}
    ]
  }
}
```

Responses expose `{data, version, revision}`. Updating the label sends `{"version":1,"data":{"label":"Surface finish"}}`. Option changes use the **parent field's** current version. Reorder sends `{"version":3,"optionIds":["option-id-b","option-id-a"]}`. An override uses `{"data":{"baseFieldId":"root-id","pageKey":"quotations","scopeType":"product","scopeId":"product-id","label":"Product finish"}}`.

Full request metadata is documented in authenticated `/api/openapi.json`. `configuration` is an allowlist of plain-text `placeholder` (150 characters), `helpText` (500), `maxLength` (1–4000), and explicit `pages` for global roots. It is replaced as a complete object on update. Labels are plain text up to 150 characters. No HTML, script, pricing formula, URL or executable configuration property is accepted. Render label/help strings with `textContent` or the existing escaping helpers; JSON text must never be interpolated as raw HTML.

## Performance and caching contract

Workspace limit: **500 definitions including registry fields/overrides**; **100 options per field including archived choices**. Administrative pages contain at most 100 definitions; audit pagination is also bounded to 100. Resolve accepts at most the seven distinct supported pages in one request. Field/options reads use two bounded statements for the entire batch rather than one request/query per dropdown; product validation and revision/authentication add constant work. No quotation/customer JSON is hydrated for configuration writes or reads.

Scope, option-order and per-field audit indexes match these lookup patterns. Read batches use read-only repeatable-read snapshots. Writes serialize through the existing company workspace lock, preventing concurrent cap/reorder/version races.

Resolve returns a private ETag, `Cache-Control: private, no-cache` and `Vary: Cookie`. Its validator includes database host/name/schema identity, revision, user permissions and requested page/product scope; credentials are not included. Send `If-None-Match` for revalidation; 304 is returned only after current authentication, page authorization and product existence checks. Every saved change increments the shared database revision, invalidating validators across application instances. In-memory payload reuse is optional on the consuming frontend; always revalidate and discard older responses after a successful save. No localStorage configuration is authoritative, and there is no process-local stale configuration cache.

## Verification and changed files

Final executed results are recorded in `test-results/dynamic-fields-full-tests.log`, `dynamic-fields-focused.log`, `dynamic-fields-all-browser-summary.json`, `dynamic-fields-image-build.log`, `dynamic-fields-syntax.log`, `dynamic-fields-build.log`, and `dynamic-fields-changes.json`.

| Executed check | Result |
| --- | --- |
| Complete Node/PostgreSQL suite in final production image | PASS: 452 tests, zero failures/cancellations/skips |
| Focused engine integration suite in the same image | PASS: 14 tests |
| Complete existing browser/E2E regression matrix | PASS: 302 checks across all 24 suites, zero failed checks/page exceptions |
| Packaged server smoke checks | PASS: six checks covering schema-11 startup, registry/root creation, product resolution, archive/audit/cache invalidation, unchanged quotation/customer/pricing amounts and persistence/authentication after restart |
| Syntax checks | PASS: 133 JavaScript files |
| Frontend asset build | PASS |
| Production Docker build | PASS; non-root `node` user |
| Whitespace checks | PASS |
| Dedicated lint/static type checking | NOT CONFIGURED in this plain JavaScript repository |
| Production deployment / restored target-data rehearsal | NOT RUN |

Verified local image: `paradise-dynamic-fields-phase1:20261105`, ID `sha256:e0ebe6204e999bd65af5593f203baad020c1ddc6138431b2701271a482a9d516`. Full/focused tests used the image's packaged server/shared/public/scripts, mounting only tests and output. Browser suites used fresh local assets and generated databases. The runtime smoke output is retained in `test-results/dynamic-fields-image-smoke.json` and `.log`. Its initial restart attempt exposed a harness assumption about Docker's dynamically assigned host port; the harness now refreshes that port after restart and all six checks pass. No application defect was indicated by that transport failure.

The new integration cases cover registry protection, label-only edits, custom CRUD/options/archive/order/audits, immutable keys, whole-field inheritance, duplicate namespaced keys, required dropdown constraints, invalid inputs, concurrent stale updates, CSRF/RBAC/company and cross-field isolation, conditional batches/cross-instance invalidation, constant query count, configuration limits/index access, mandatory-audit rollback, migration rollback/concurrent startup/idempotence, business-data fingerprints and product reference retention.

Implementation files: `server/dynamic-fields.js`, `server/field-registry.js`, `server/migrations/011-dynamic-fields.sql`; integration changes: `server/access.js`, `server/resources.js`, `server/store.js`, `server/openapi.js`, `scripts/restore.js`; new tests: `tests/dynamic-fields.test.js`. Existing schema assertions were advanced to 11 in `tests/access-whatsapp.test.js`, `tests/customer-release-migration.test.js`, `tests/phase1-api.test.js`, `tests/phase1-migration-review.test.js`, `tests/phase2-api.test.js`, `tests/phase3-api.test.js`, `tests/phase5-api.test.js`, and `tests/product-analytics.test.js`. Migration rewind tests also remove the new metadata in their **disposable** databases before testing earlier upgrades; the future-schema refusal fixture now uses 12.

No dependencies, frontend page implementations, business options/prices, quotation calculations or WhatsApp implementation were changed. Prior unrelated dirty work was preserved using a start/end source hash manifest.

## Deployment / rollback — not executed

- Obtain explicit deployment authorization; review the bounded diff and retain a matching old image/configuration.
- Back up using the existing `npm run backup` procedure. Verify `npm run restore -- <backup.dump> <unused_staging_database>` into a separately named database; do not restore over the live database.
- Test the candidate on that restored copy, verifying original customer/product/quotation rows, pricing and sharing history, migration timing, schema-11 readiness, protected fields and authorized roles. No new environment variables, dependencies or external storage are required.
- Apply through the existing authorized deployment procedure with old writers stopped for migration, a final backup and existing logging/health monitoring. Validate `/api/ready` at schema 11 and representative batch/CRUD requests.
- For rollback, keep writes stopped and retain the upgraded database. Schema-10 servers refuse schema 11; do not manually lower migration versions or drop metadata tables. Restore the verified pre-upgrade backup into a **separate** database for the retained old artifact, and preserve/reconcile any later writes before traffic switches. Alternatively use an explicitly validated schema-11-compatible artifact with the new entry points disabled.

This phase is a configuration foundation. A future phase must explicitly implement safe form adapters, business custom-value persistence/validation, historical label snapshots and management UI, while retaining each canonical business engine. Do not treat API-level required/visible settings as already enforced on unrelated existing forms. Production/staging deployment and target-data migration rehearsal remain unperformed.

Phase 1 acceptance: PASS for the configuration architecture, additive migration, explicit registry, scoped resolution, CRUD/validation, RBAC/company isolation, transaction/audit integrity, bounded retrieval/cache contract, automated tests and documentation. No unresolved critical Phase 1 defect was reproduced. The persistent application/database were not restarted or migrated; disposable verification containers are removed after completion. Target data/scale and future form adapters still need their own acceptance checks.

The follow-up [Phase 1 review](dynamic-fields-phase1-review.md) records validation fixes, stricter mutation envelopes, additional security/concurrency/reference tests and the latest verification results.
