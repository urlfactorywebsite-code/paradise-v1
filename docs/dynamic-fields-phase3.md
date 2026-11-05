# Product-specific fields — Phase 3

Phase 3 extends the existing database-backed Dynamic Field Engine. It does not introduce another pricing engine, a separate catalog, a frontend framework, new dependencies, or localStorage configuration.

## Completed behavior

- Administrators can open **Edit Fields** from each Products & Services action menu, an existing product editor, or a quotation product configurator. Existing menu actions retain their keyboard order. Opening the manager deliberately enables the session's existing Edit Mode; employees do not receive management controls.
- Each product owns independent custom definitions and options. Supported custom types are text, number, dropdown, multi-select, date, checkbox and textarea. Labels, required settings, activation, field order and option order use the central engine. Field order has explicit Save/Reset actions, drag handles and keyboard Move up/down controls. The shared option editor provides Save/Cancel/Reset, archival and version-conflict handling.
- Real existing catalog fields are imported into **display bindings** when an administrator opens the manager. Initialization is idempotent and transactional. It does not change product definitions, rates, catalog templates or existing quotation bodies. Reopening synchronizes newly approved canonical options without discarding customized captions or order.
- Quotation configurators retrieve one product configuration batch, render product-specific custom controls, reject missing/invalid values, handle retry/loading and discard late responses after switching products. Configuration saves revalidate the open configurator. Ordinary product/customer catalog reads are not duplicated.
- Line selections persist in quotation item JSON as `customFields`, keyed by immutable `rootFieldId`. The backend creates `customFieldSnapshots`; incoming snapshots are never trusted. Editing restores saved values, including previously selected retired choices.
- Public product specifications use saved native/custom label and selected-option snapshots in existing preview, print and PDF projections. Existing private/internal specifications remain excluded. Customer/quotation-level Phase 2 staff metadata retains its original visibility policy.

## Pricing and history contract

Native catalog field keys and option strings remain canonical. Each binding maps an immutable central option key to its original native string; changing its display label never changes that string, a rate, compatibility rule or the quotation `cfg` contract. Native required state, visibility, activation and introduction of priced variants remain controlled by the established product/pricing editors. Every generic configuration mutation independently enforces that protection; disabling a button is not the security boundary.

Custom fields are descriptive. They never enter `cfg`, charge rules, discounts or tax arithmetic. Server pricing still resolves the original product/template and uses `shared/domain.js` integer-paise calculations before applying display metadata. Archiving a choice removes it from new selection; a previously saved selection can be retained. Adding new priced variants requires the existing canonical product/pricing workflow, followed by reopening Edit Fields to synchronize its display binding.

Unchanged saved lines retain their original prices and snapshots, even after configuration/rate changes. An unchanged older line is grandfathered if a new required field is introduced. Editing custom values on a Draft retains the saved price; changing priced specifications or explicitly refreshing prices invokes current canonical rates. Explicit duplication uses current rates and trusted original selections/snapshots. Non-Draft custom selections cannot be changed, including by replacing the line ID. Finalized custom controls show saved labels and are disabled.

Configuration retrieval follows product override → page override → global default. Product-owned roots have product-qualified identities and cannot become another product's base. Inherited shared fields are visible in the manager but remain governed at their original scope. This phase does not silently manufacture overrides for inherited roots.

## API and authorization

Existing configuration CRUD/editor/audit APIs remain authoritative. New routes:

| Route | Purpose |
| --- | --- |
| `GET /api/products/{id}/field-configuration` | Effective fields, active/retained options and safe native key mappings; no rates |
| `POST /api/products/{id}/field-configuration` with `{}` | Administrator/authorized `fields.manage` initialization and synchronization |
| `POST /api/products/{id}/field-order` with `{fields:[{id,version}]}` | Atomic order of every product-owned field |

Direct product roots use `pageKey: "products"`, `scopeType: "product"`, an existing `scopeId`, and no `baseFieldId`. Management requires authentication, CSRF and backend `fields.manage`, rechecked within the existing write lock. Reads require appropriate product or quotation permissions. Stale versions return 409; every ordered ID must belong to this product and appear exactly once. Order, versions, audit rows and configuration revision commit or roll back together.

Tenancy follows the existing **one company per database** architecture. Callers cannot select a tenant through payload/query parameters. Foreign-database IDs do not resolve. Neither this module nor its tests convert the application into shared-database multitenancy.

Server line normalization resolves all affected product configurations in one batch, with at most three configuration queries (definitions, options, bindings), rather than one query per line/dropdown. Native binding lookup uses a Map. Configuration reads are bounded; successful writes advance the existing revision. An already open form in another session sees configuration changes on its next revalidation; there is no push service.

## Migration and operational limits

`013-product-dynamic-fields.sql` expands the scope CHECK to allow product-owned roots, replaces root uniqueness with distinct generic/product indexes, and adds normalized `product_field_bindings` with restrictive field/product foreign keys and unique product/native-key identity. Startup migration/version recording remains transaction protected. Existing business/configuration rows are not rewritten. Schema-12 upgrade failure/rollback/retry and repeat startup are tested.

Limits are 100 product-owned fields per product, 10,000 direct product roots per company, 100 options including archived options per definition, plus the existing 500 generic definitions. Native bindings consume the same per-product allowance. Importing legacy labels longer than 150 characters or native lists exceeding 100 options is intentionally skipped; their original canonical controls remain available. Compound size/dimension fields retain their real controls and pricing structures; their main caption can be customized. Deactivate products with configurations rather than deleting their referenced identities.

No new environment variables, object storage, background tasks or external services are required. Operational configuration remains the existing PostgreSQL, session/CSRF, origin and backup setup.

## Authorized deployment checklist

These are instructions only. No persistent local stack or production database was migrated by this task.

1. Review and commit the bounded Phase 3 change set while preserving unrelated pending work. Record the previous image and approved new immutable image digest.
2. Quiesce writes and create the existing full PostgreSQL backup (`docker compose exec -T app npm run backup`). Protect the archive, verify its checksum and test restoration into a separate staging database. JSON export is not a full database backup.
3. Run the candidate against that restored staging database. Verify schema 13, retained product/customer/quotation IDs and totals, existing configuration/audit rows, historical PDFs and the complete product-to-quotation flow.
4. Validate actual production-language text and large product forms on staging; confirm HTTPS, secure cookies, exact origin, least-privilege database credentials and backup storage.
5. Obtain explicit deployment authorization. Stop old writers before starting the schema-13 candidate. Check health, migrations, role restrictions, product editing, quotation saves and pricing/WhatsApp regression smoke tests before reopening writes.

## Rollback checklist

- Prefer a forward fix or a compatible schema-13 application artifact.
- A pre-Phase-3 server expects schema ≤12 and must not be pointed at schema 13. Never lower migration-version rows or drop bindings/options to bypass that gate.
- To return to the earlier release, stop writers, preserve a fresh full backup of schema 13 and any post-release transactions, and restore the verified pre-release backup into a separate database. Start the recorded prior image against that database, validate it, then perform an authorized connection cutover.
- Reconcile post-backup writes before reopening service. Retain both databases/backups until recovery is accepted. Restoring an older backup without reconciliation loses later writes.
- Restore/rollback execution and production cutover require separate authorization.

See [verification and acceptance report](dynamic-fields-phase3-report.md) for executed checks and remaining risks.
