# Phase 1 review and refinement — 4 November 2026

## Acceptance

**PASS for source and disposable verification within the existing single-company-per-database architecture.** The running installation was not rebuilt or migrated. Shared-database multitenancy is not implemented or certified.

This review covers the customer form, customer CRUD and address APIs, category reference, migration 007, and their quotation integration. Existing unrelated working-tree changes were preserved. No logo, pricing engine, category administration, production data or deployment changes were introduced by this refinement.

## Issues fixed

1. An older client omitting `deliveryAddressId` during a full customer update could reinstate the default after the user explicitly cleared the selection. The saved null selection is now retained, and later quotation selection uses the same rule.
2. Boolean/numeric category or delivery-address IDs could be treated as an empty selection. These fields now accept only strings or null; unknown or foreign IDs continue to fail validation. Quotation delivery IDs receive the same type check.
3. Malformed URL encoding in an address ID could produce a server error. Authentication/permission checks now precede decoding, and authorized malformed requests return 422.
4. Duplicating a quotation failed after its delivery address had been archived. Duplication now retains the original, server-owned delivery snapshot, matching the existing customer/company snapshot behavior. Arbitrary new selection of an archived address remains rejected.
5. A stale customer form had no usable reload action inside the modal. It now retains entries, shows the conflict, and offers an explicitly labelled reload that discards those local form changes. A customer deleted in another session is not recreated by that reload.
6. Address actions could replace an in-progress address editor. Edit/default/archive controls are disabled while an address draft is open.

## Changed files in this refinement

| File | Purpose |
| --- | --- |
| `server/customer-details.js` | Strict reference types and preservation of a cleared delivery selection |
| `server/customer-api.js` | Permission-first URL handling and consistent malformed-ID errors |
| `server/validation.js` | Strict quotation delivery IDs and safe historical snapshot duplication |
| `public/customer-ui.js` | Consistent delivery selection, conflict recovery and address draft controls |
| `tests/customer-details-api.test.js` | Six additional regression/security/atomicity cases |
| `tests/customer-details.browser.cjs` | Cleared-selection and concurrent-edit browser coverage |
| `docs/customer-phase1.md` | Updated verification totals and review link |
| `docs/customer-phase1-review.md` | This report |

The earlier Phase 1 files and previous quotation changes remain in the working tree. They were not reset or staged. There is no additional database migration: the additive schema-7 migration remains `server/migrations/007-customer-details.sql`.

## Acceptance checklist

| Requirement | Result and evidence |
| --- | --- |
| Existing customer data retained | PASS. Migration tests compare legacy body/version/timestamp values, verify nullable new columns, repeat migration, and inject a migration failure to prove rollback. Legacy PUT tests retain the new metadata, addresses, billing address and inactive status when omitted. |
| Status hidden without breaking validation | PASS. Add/Edit has no Status control. Server creation defaults to active; omission on an existing customer retains the saved flag. The compatible API status field is retained. |
| Other category text persists | PASS. Other descriptions roundtrip without creating a global category. Category changes clear obsolete custom descriptions. Forged client category metadata cannot create an accepted reference. |
| Independent contact person number | PASS. Stored separately from `mob`, normalized and validated; optional null/clear and international-format updates are covered. |
| Correct customer/company ownership | PASS within the existing architecture. Address IDs cannot be moved, read or selected through another customer. Separate company databases are tested; a frontend tenant query cannot select another database. |
| Enumeration/modification blocked | PASS. Anonymous requests require authentication. A user with no customer permissions receives 403 for both known and missing address paths, cannot read category metadata, and cannot bypass edit permissions through `/api/changes`. Read-only users cannot write addresses. |
| Atomic customer/address creation | PASS. Invalid nested addresses leave no customer. An injected SQL error after customer insertion rolls back the parent, addresses, audit additions and workspace revision. |
| Editing and quotation creation | PASS. Legacy edits, duplicate review, optimistic concurrency, customer creation from a quotation, price calculations and historical quotation snapshots pass regressions. Duplicating an archived delivery snapshot is covered separately. |
| Responsive and keyboard-accessible UI | PASS for tested behavior. Existing styles and shared dropdowns are retained; inline errors, focus containment, Escape, single submission and modal widths 1440/1024/768/390/320 pass. No automated WCAG certification is claimed. |
| Success/failure/authorization/isolation coverage | PASS. Customer-specific API tests, both browser suites, migration/backup/restore tests and the full unit/integration suite pass. |

## Execution results

All database operations used a separate disposable PostgreSQL 17 container and generated test databases. The full suite ran in the existing app image with current source folders mounted read-only so PostgreSQL backup/restore tools were available. This did not rebuild an image or update the normal app.

| Check | Result |
| --- | --- |
| Complete `node --test tests/*.test.js` suite | PASS — 362/362, no failures or skips |
| Customer API suite included above | PASS — 16 cases, including six new refinement cases |
| Customer browser suite against current `public/` source | PASS — 15/15, zero JavaScript exceptions |
| Quotation editor browser regression against current `public/` source | PASS — 19/19, zero JavaScript exceptions |
| Migration validation | PASS — additive migration, repeat startup, concurrent startup, injected DDL rollback, foreign keys and schema-7 backup/restore |
| `npm run check` | PASS — syntax checks for 88 JavaScript files |
| `node --check tests/customer-details.browser.cjs` | PASS |
| `git diff --check` | PASS |
| Lint | NOT CONFIGURED — no lint script or linter configuration exists |
| Type checking | NOT CONFIGURED — plain JavaScript project, no type-check task or TypeScript configuration exists |
| Normal installation rebuild, migration or deployment | NOT RUN |

Evidence: `test-results/phase1-refinement-tests.txt`, `test-results/customer-phase1-browser.json`, `test-results/quotation-editor-browser.json`, and current customer desktop/mobile captures. Test evidence is generated locally and ignored by Git.

## Data and security boundaries

Category IDs use the relational category table and FK; custom Other text never changes that table. Phone metadata columns are authoritative. Address rows have an owning-customer FK, an owner/archive lookup index and a partial unique index for one active default. Customer/address writes use the existing transaction, advisory lock and optimistic revision/version checks.

The database has no tenant/org column or membership model. `customer.view` permits customer reads throughout the connected company workspace, and `customer.edit` permits edits there. Address ownership is enforced against that database's customer records. Deploying multiple companies in one database would require a separate tenancy design; it is outside Phase 1 and must not be inferred from these results.

Saved quotation delivery snapshots are independent of later customer/address edits. Duplication may retain an archived historical snapshot obtained from its authorized source quotation; clients cannot supply or select an arbitrary archived address for a fresh quotation. Unselected customer addresses are excluded from quotation preview projections and the customer delivery snapshot.

## Remaining risks and handoff

- The normal installation has not been migrated or exercised with the new source. Test success is not live-installation acceptance.
- Lint and type-check tooling are absent. Syntax checking is not presented as a substitute for either.
- Shared-database multitenancy is unsupported. Keep one company workspace per database.
- The existing 100-address-per-customer cap includes archived rows; this documented Phase 1 limit is unchanged.
- UI accessibility results cover the tested labels, error handling, keyboard flow and responsive behavior, rather than a full WCAG audit.

Use the backup-first migration and guarded restore instructions in `docs/customer-phase1.md` for a separately authorized release. No destructive down-migration is needed or provided; preserve the schema-7 database and restore the pre-migration backup into a new database if rollback is required. Reconcile writes made since that backup before changing the runtime's connection.
