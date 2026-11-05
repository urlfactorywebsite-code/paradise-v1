# Dynamic Field Engine: Phase 1 review

Date: 2026-11-05. Scope: the existing Phase 1 configuration backend. Validation used generated PostgreSQL 17 databases in a disposable tmpfs container. Production data and the persistent application/database were not changed, restarted or migrated.

## Findings and fixes

1. **Coercible page identities could create unreachable configuration.** `pageKey: ["quotations"]` passed a JavaScript property lookup, and PostgreSQL stored the array as a text page key. Nested arrays in global target pages were accepted too. This was reproduced as an unexpected 201 response. Page identity now requires an actual supported string; invalid requests return 422 before any metadata, audit or revision change.
2. **Mutation envelopes silently accepted irrelevant properties.** A create request could include ignored `optionIds`/`version`; other mutations could include ignored reorder properties. Empty option patches also generated an audit/version/cache change without a requested edit. Each operation now validates its own envelope, empty option patches return 422, and unsupported operations return 405 before body/version processing. OpenAPI matches the stricter contract.
3. **Unnecessary scope reads removed.** Resolution previously loaded product overrides/options for every product on the requested pages and checked the selected product twice. The query now loads only the selected product's overrides (or none for an unscoped request), and validates the product once within the read transaction. Existing whole-field precedence and response identities are preserved.

The two validation defects were first captured in `test-results/dynamic-fields-review-reproduced.log`. Both reproduction cases and all added regression cases pass after the fixes. No schema migration was needed; supported schema remains **11**.

## Acceptance matrix

| Requirement | Result | Evidence / interpretation |
| --- | --- | --- |
| Normalized schema and migration safety | PASS | Unique root/override/value identities, field/option immutable-identity triggers, root/product/option/audit FKs, archive checks and bounded orders inspected. Migration rollback, concurrent startup, idempotence, backup/restore and legacy-record preservation pass. |
| Scope resolution | PASS | Explicit root linkage and qualified names; product > page > global. Whole-field overrides are copied from the root on creation; this is not property-by-property merging. Inactive overrides do not fall back. Wrong pages, override chains, missing products and duplicate scopes are rejected. |
| Stable option identities | PASS | IDs and value keys survive rename, ordering and archival. Archived keys cannot be reused/reactivated. Test-only saved consumer rows with real foreign keys retain their IDs, values and label snapshots after all three operations and after override creation. |
| Configuration APIs and validation | PASS | Strict types, operation envelopes, settings/option allowlists, limits, pagination, required dropdown constraints, duplicate identities and injection-shaped inputs tested. Empty edits and invalid methods fail without metadata changes. |
| Authentication and CSRF | PASS | Anonymous access and invalid CSRF rejected. A real partially streamed request authenticates, then loses permission/session through the existing user API; completing its body returns 401 with no configuration mutation. |
| RBAC | PASS | Default staff cannot manage; metadata viewer cannot write; explicitly authorized employee manager can manage but gains no customer/product record access. Page reads require access to every requested page or explicit management permission. |
| Company isolation | PASS | Existing tenancy is a separate company database, not shared-row tenancy/RLS. Foreign field/option IDs return 404; another company cannot use cached validators to retrieve foreign configuration; tenant-selector inputs are rejected. |
| Protected business fields | PASS | Canonical status/role/tax/pricing/relationship families cannot be edited as ordinary options. Create/update/archive/reorder/field-disable and override attempts are rejected; canonical workspace data remains unchanged. Label-only fields accept labels only. |
| Transaction and audit integrity | PASS | Complete before/after metadata and actor IDs retained. Mandatory audit failure and failure on the second reorder write roll back all positions, field versions, audit records and revision. |
| Concurrent updates and scope conflicts | PASS | Concurrent edits using the same field version yield one winner and one 409. Concurrent creation of the same product override yields one definition/audit/revision increment, with no orphan options or duplicate scope. |
| Cache invalidation | PASS | Database revision invalidates conditional reads across instances. Validators include company database/schema identity, user permissions and requested scope. Revoked/no-page access cannot get 304; product-scoped and unscoped validators differ. Every request authenticates before cache use. |
| Backwards compatibility | PASS | Legacy customer/product/quotation/pricing/history fingerprints preserved. Existing quotation/customer/pricing/WhatsApp regression suites pass. No frontend page, dependency, canonical business option or calculation was changed. |

Stable referenced-option testing uses a clearly marked **test-only consumer table**, because Phase 1 does not yet add custom-value storage to real business records. The separate legacy-record fingerprints verify the actual existing application data. Historical custom-value label snapshots and form adapters remain responsibilities of the next integration phase; the review does not claim those features already exist.

## Executed checks

| Check | Result |
| --- | --- |
| Complete Node/PostgreSQL suite in fresh production image | PASS: 460 tests, zero failures/cancellations/skips |
| Focused dynamic-field suite | PASS: 22 tests, including eight new review cases |
| All available browser/E2E suites | PASS: 302 checks across 24 suites, zero failed checks or page exceptions |
| Packaged server smoke checks | PASS: six checks, including schema-11 startup, root/override creation, conditional batch retrieval, archive/audit invalidation, unchanged quotation/pricing amounts and restart persistence |
| JavaScript syntax | PASS: 133 files |
| Frontend asset build | PASS |
| Production Docker build | PASS; runtime user `node` |
| Whitespace | PASS |
| Dedicated lint/static typing | NOT CONFIGURED; no lint/typecheck scripts or corresponding toolchain in this plain JavaScript repository |
| Production deployment / target-data rehearsal | NOT RUN |

Candidate image: `paradise-dynamic-fields-review:20261105`, ID `sha256:73ed9a421f4efa58c7243aea6c3596b9aaf1231b71e36d3bc62015fe6d0f7632`. Full tests ran with `node --test --test-concurrency=2 tests/*.test.js` using its packaged runtime; only tests/output were mounted. Browser tests use `node scripts/test-customer-release.js --all` against generated local applications and fresh assets. The syntax/build commands are `npm run check` and `npm run build`.

Evidence under `test-results/`: `dynamic-fields-review-reproduced.log`, `dynamic-fields-review-focused.log`, `dynamic-fields-review-full-tests.log`, `dynamic-fields-review-all-browser.log`, `dynamic-fields-review-all-browser-summary.json`, `dynamic-fields-review-image-build.log`, `dynamic-fields-review-image-smoke.json`, `dynamic-fields-review-syntax.log`, `dynamic-fields-review-build.log`, `dynamic-fields-review-whitespace.log`, and `dynamic-fields-review-changes.json`. The two deliberate injected failures produce expected server error log entries; final automated assertions have no failures.

## Modified files

- `server/dynamic-fields.js`: strict page types, operation-specific envelopes, empty-patch rejection, method validation and narrower scope reads.
- `server/openapi.js`: exact create/archive envelopes and nonempty patch schemas.
- `tests/dynamic-fields.test.js`: eight review cases plus test-only access to session headers/base URL for the streaming-auth scenario.
- `docs/dynamic-fields-phase1.md`: point to this follow-up review.
- `docs/dynamic-fields-phase1-review.md`: this report.

A start/end SHA-256 inventory separates this review from existing dirty work. No registry, database schema, business workflow, dependency or frontend implementation change was introduced here.

## Remaining risks and rollout guidance

- Production/staging data restoration, migration duration and target capacity remain untested. The existing backup-first schema-11 deployment/rollback procedure in `dynamic-fields-phase1.md` still applies; no production operation was performed here.
- Create now accepts only `{data}`. Update/add accepts `{version,data}`, archive `{version}`, and reorder `{version,optionIds}`. Clients sending previously ignored properties or empty option patches must remove them; valid documented examples and existing business APIs are unchanged.
- Existing malformed configuration written through an earlier build is not silently rewritten. If that build was used against a target database, inspect page identities/global page arrays on its staging copy before release. The reproduced invalid rows existed only in generated test databases.
- Management UI, business custom-value persistence/validation and historical label snapshots remain outside Phase 1. Future consumers must honor policy, qualified root identity and whole-field override semantics, and safely render plain-text labels/help text.

Phase 1 review acceptance: **PASS** for the configuration backend and all available regression checks. No unresolved critical Phase 1 defect was reproduced after the fixes. Disposable test containers/network were removed after validation; the persistent application and database remained healthy. Production rollout remains subject to authorization and target staging validation.
