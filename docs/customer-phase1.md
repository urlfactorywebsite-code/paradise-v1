# Customer form and delivery addresses — Phase 1

## Repository analysis and scope

The existing frontend is plain JavaScript, HTML and CSS. `public/app.js` owns workspace state and the versioned `/api/changes` save flow; `srs-ui.js` extends the legacy screens, and `quotation-ui.js` supplies the current quotation editor. Shared accessible dropdowns come from `dropdowns.js`.

The backend is Node.js with the `pg` PostgreSQL driver and handwritten SQL, without an ORM. `server/store.js` serializes workspace mutations using a PostgreSQL transaction and advisory lock. `server/validation.js` validates canonical records; `server/access.js` enforces the existing permissions. Tests use `node:test` and Playwright.

This installation has one company workspace per database, rather than a tenant ID on each customer. Customer permissions apply throughout that workspace. Address routes require customer read/edit permission and verify the address's actual owning customer; a caller cannot move or access an address through another customer's URL or payload.

Phase 1 adds customer metadata and delivery addresses. It does not implement category management, rebuild the application, deploy changes, or migrate the normal running installation. Earlier quotation filter/reference changes in the working tree are retained.

## Files

| Files | Change |
| --- | --- |
| `public/customer-ui.js`, `public/customer.css`, `public/index.html` | Customer modal, validation, responsive layout, address drafts and keyboard handling |
| `public/srs-ui.js` | Remove the superseded customer form implementation; display selected delivery snapshot in quotation preview |
| `public/app.js` | Retain read-only category metadata in client state; pass explicit duplicate review through the existing save flow |
| `public/quotation-ui.js` | Customer-specific delivery selection and preview integration |
| `server/customer-details.js` | Canonical metadata/address validation and relational hydration/persistence |
| `server/customer-api.js`, `server/resources.js` | Category reads, scoped address APIs, duplicate checks and safe preview projection |
| `server/store.js`, `server/validation.js`, `server/access.js` | Migration, transaction integration, existing status preservation and permissions |
| `server/pdf.js`, `server/openapi.js` | Selected delivery snapshot in PDFs and API contracts |
| `server/migrations/007-customer-details.sql`, `scripts/restore.js` | Additive schema 7 and compatible backup restoration |
| `tests/customer-details-api.test.js`, `tests/customer-details.browser.cjs` | New API, migration, backup/restore and UI coverage |
| Existing migration/API tests and `tests/quotation-editor.browser.cjs` | Schema 7 expectations and source-directory browser regression support |

## Database migration

Migration 007 adds:

- `customer_categories`: stable IDs, names, `is_other`, active flag and display order. It seeds BNI, YES, JCI, JCOM, Rotary, RMB, Icon Circle and Other once. Read-only in Phase 1.
- Nullable `customers.category_id`, `custom_category_name`, and `contact_person_phone`. Category IDs have a foreign key and index.
- `customer_delivery_addresses`: a foreign key to the customer, structured address columns, archive/default flags, timestamps and a customer/address index. A partial unique index permits at most one active default per customer.

Existing customer bodies, statuses, billing addresses, record versions and quotation relationships are not rewritten by migration. The migration and its version marker commit together; a failed migration rolls back its DDL. Subsequent startup skips an already applied migration.

Addresses are stored in the relational table and hydrated into the existing customer API representation. They are not a second independent JSON source of truth. Customer metadata columns are also authoritative. Existing clients may omit the new fields without erasing them. Address omission never deletes a saved address; use archiving.

## Customer UI and API

Status is absent from Add/Edit Customer. New customers default to active on the server, and an omitted existing status retains its prior value. The status API field remains compatible for existing integrations.

Customer category is optional. Selecting Other reveals a required custom description; that description is stored on the customer and does not create a managed category. Selecting a managed category or Uncategorized clears the custom description.

Contact person number is optional and independent of primary mobile. Validation accepts 8–15 digits, optionally prefixed with `+` and a country code, and permits spaces, parentheses and hyphens for entry. Stored numbers are normalized. No telephone registration or reachability claim is made.

Delivery addresses can be added before saving a new customer, edited, archived, restored, selected and marked as default. All changes in the modal commit with the customer in one transaction. The selector contains only that customer's active addresses. At most 100 saved addresses, including archived rows, are accepted per customer. Billing address is separate.

The existing customer CRUD endpoints accept these additional fields:

```json
{
  "categoryId": "cc_other",
  "customCategoryName": "Local association",
  "contactPersonPhone": "+442079460958",
  "deliveryAddressId": null,
  "deliveryAddresses": [
    {
      "label": "Warehouse",
      "line1": "12 Example street",
      "line2": "Unit 4",
      "city": "Salem",
      "state": "Tamil Nadu",
      "postalCode": "636001",
      "country": "India",
      "isDefault": true
    }
  ]
}
```

Address IDs are generated when omitted. Supplied address IDs/customer IDs are ownership checked. An omitted selected address on a new customer defaults to the marked default, when present. An explicit `deliveryAddressId: null` clears the selection.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/customer-categories` | Initial active categories; requires a customer read/create/edit permission |
| `GET /api/customers/{id}/delivery-addresses` | Customer-scoped list, `page`, `pageSize` (default 25, maximum 100), `includeArchived=true` optional |
| `GET /api/customers/{id}/delivery-addresses/{addressId}` | Only an address belonging to this customer |
| `POST /api/customers/{id}/delivery-addresses` | Add address; requires `customer.edit` and current customer `version` |
| `PATCH /api/customers/{id}/delivery-addresses/{addressId}` | Edit, archive/restore, or set default; requires `customer.edit` and current customer `version` |

Address mutations use `{ "version": 1, "data": { ... } }`. Responses return the new customer version. Stale writes return 409. Invalid input returns 422, missing/foreign addresses return 404, and insufficient permissions return 403. Authentication, CSRF and same-origin protections remain in place. Creation/update duplicate checks cover primary mobile, WhatsApp number, email and GSTIN; an explicitly reviewed duplicate can be saved using the existing `allowDuplicate` behavior. `/api/changes` accepts `allowDuplicate: true` on the reviewed customer change.

Saved addresses are also available when choosing a customer in later quotations. The quotation stores an independently validated selected address snapshot. Editing or archiving an address does not rewrite a saved quotation's delivery snapshot. Old quotations without delivery selection keep their existing presentation. New delivery selections appear in customer-facing previews and PDFs; unselected addresses are excluded.

Customer change audit messages do not include names, phone numbers, category descriptions or address contents. Internal notes and the full address collection are excluded from quotation previews.

## Verification

Completed against isolated disposable PostgreSQL 17 databases:

| Check | Result |
| --- | --- |
| Full unit/integration suite, current source mounted read-only in the existing app image | PASS — 362/362 |
| Customer form/address browser suite using `public/` source | PASS — 15/15, zero JavaScript exceptions |
| Quotation editor browser regression using `public/` source | PASS — 19/19, zero JavaScript exceptions |
| JavaScript syntax and `git diff --check` | PASS |
| Normal application rebuild/deployment or migration of its database | NOT RUN |

The subsequent [Phase 1 review and refinement](customer-phase1-review.md) records defect fixes, additional authorization/database isolation/atomicity coverage, unavailable lint/type tooling, and the final acceptance boundaries.

The dedicated tests cover status defaults, managed/Other/uncategorized categories, category edits, optional phone validation, transactional customer/address creation, multiple addresses, pagination, cross-customer access, default changes, archival, legacy payloads, permissions, concurrent submissions, duplicate review, snapshot preservation, migration repeat/failure behavior and backup/restore of schema 7 data.

Browser coverage includes inline errors, retained form entries after a failed save, single submission, address persistence, quotation reuse, keyboard focus/Escape, and widths 1440, 1024, 768, 390 and 320. `tests/quotation-editor.browser.cjs` accepts `TEST_STATIC_DIR=public` to test source directly without a frontend rebuild.

Run database tests only against an explicitly disposable PostgreSQL instance. The browser fixture additionally requires `TEST_DISPOSABLE=1` and a loopback database URL on port 55429. Native backup/restore tests need PostgreSQL client tools. When using PG environment variables, do not leave an unrelated `DATABASE_URL` set: that variable takes precedence, including in child recovery processes.

```powershell
# DATABASE_URL must already point to a separate disposable PostgreSQL instance.
node --test tests/*.test.js
$env:TEST_DISPOSABLE = '1'
node tests/customer-details.browser.cjs
$env:TEST_STATIC_DIR = 'public'
node tests/quotation-editor.browser.cjs
npm run check
git diff --check
```

The full unit/integration suite can also run in an existing application image with the source folders mounted read-only and only the disposable test database configured. This uses the image's PostgreSQL client tools and does not rebuild an image or update the running app.

## Migration and rollback procedure — prepared, not run on the normal installation

1. Arrange a maintenance window and stop normal writes before changing the normal installation. Configure the new source/runtime with the intended database connection. Preserve the old source revision and its environment separately.
2. Take and validate a PostgreSQL backup **before starting the new backend**, since startup applies pending migrations. In an already configured app environment, use `npm run backup`; in the existing Compose app, `docker compose exec app node scripts/backup.js`. Verify the resulting dump using `pg_restore --list <backup.dump>`, and rehearse restoration into a new database.
3. Apply the new source through the installation's normal release process when authorized. To run its startup migration without opening an HTTP listener, in the correctly configured source environment use:

   ```powershell
   node --env-file-if-exists=.env -e "require('./server').createApp().then(async app => { try { console.log(await app.db.prepare('SELECT max(version) AS schema_version FROM schema_migrations').get()); } finally { await app.close(); } }).catch(error => { console.error(error.message); process.exitCode=1; });"
   ```

   This should report schema version 7. No build or release command was executed as part of this implementation.
4. Start the updated runtime and verify `/api/ready`, customer/category reads, an authorized customer/address save, and quotation readback. Confirm legacy record counts and existing billing/status values against the backup. Do not point the previous backend at schema 7: older versions reject newer schemas.
5. For rollback, stop writes and take a second backup of the schema 7 database. Keep that database intact. Restore the **pre-migration** dump into a different database using the existing guarded restore command:

   ```powershell
   npm run restore -- 'C:\path\to\pre-migration.dump' paradise_before_customer_phase1
   ```

   Validate the restored records, then deliberately configure the preserved older runtime to use the restored database. The restore command refuses an existing database name and revokes restored sessions. Writes made after the pre-migration backup must be reconciled before cutover; restoring that backup does not include them. There is intentionally no destructive down-migration that drops newly entered customer/address data.

## Preserved behavior

Existing customer IDs, primary mobile numbers, billing addresses, status values, customer-to-quotation relationships, authentication, permissions, prices, calculations, quotation numbering, historical contact/company snapshots, and manual WhatsApp delivery behavior remain on their existing code paths. Category management is reserved for Phase 2. Normal-installation migration, application rebuild and deployment were not performed.
