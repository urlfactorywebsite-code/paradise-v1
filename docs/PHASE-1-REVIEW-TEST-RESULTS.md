# Phase 1 production review - individual results

Review date: 26 October 2026. PASS means executed successfully; FAIL means executed unsuccessfully; NOT RUN means not executed. These are source/disposable-installation results unless explicitly marked read-only normal-installation inspection.

## Automated Node/PostgreSQL tests

133 PASS, 0 FAIL, 0 SKIP.

| Test | Result |
| --- | --- |
| immutable quote ownership scopes state, search, reports, history, PDF, preview and all write paths | PASS |
| configurable permissions are enforced and changes revoke sessions; managers cannot elevate administrator access | PASS |
| catalog and pricing managers can read their catalogs and update only their permitted product fields | PASS |
| independent approval, draft-only editing and deletion permission are enforced by the backend | PASS |
| WhatsApp manual sharing stores a protected immutable PDF and truthful separate history, failure and retry | PASS |
| saving a WhatsApp recipient is atomic with preparation and enforces version and edit permission | PASS |
| WhatsApp settings reject unconfigured providers and secrets and templates are resolved only on server | PASS |
| a sharing-only employee uses saved contact data and needs customer edit permission to override the recipient | PASS |
| additive schema upgrade resolves only unambiguous legacy owners and preserves unknown historical ownership | PASS |
| initial setup is single-use, uses secure session attributes, and protects private data | PASS |
| bad credentials fail and logout invalidates a copied session cookie | PASS |
| authenticated writes require CSRF and reject a foreign Origin without changing state | PASS |
| simultaneous writes reject stale revisions and cannot overwrite the winning change | PASS |
| new quotes receive server prices, identity, numbering, and status history | PASS |
| saved item snapshots resist tampering and catalog changes until explicit refresh | PASS |
| invalid state is rejected atomically for negative, non-finite, invalid IDs and missing references | PASS |
| employee role can save customers but cannot administer users, catalog, settings or approvals | PASS |
| password changes verify the current password and reject the old password | PASS |
| PostgreSQL preserves saved quotations, revisions and credentials across application restart | PASS |
| dedicated customer CRUD supports duplicate review, versions, search, paging, and dependencies | PASS |
| catalog/category APIs validate pricing, dependencies, inactive choices, and admin access | PASS |
| quotation CRUD, preview, status, copy, repricing and historical document snapshots are authoritative | PASS |
| record versions permit unrelated concurrent edits and reject lost updates on the same record | PASS |
| atomic change API rolls back all operations and keeps a durable audit trail | PASS |
| reports use persisted prices, apply date/customer filters, and produce escaped CSV | PASS |
| employee restrictions cover resources, approval, audits, backups, settings and exports | PASS |
| team lifecycle protects the last administrator, revokes sessions and requires temporary-password replacement | PASS |
| users can inspect and revoke only their own sessions | PASS |
| PostgreSQL backups restore to a new database, preserve records, revoke sessions, and refuse overwrite | PASS |
| OpenAPI enumerates working resources and rejects unauthenticated documentation requests | PASS |
| expiry action is selective and does not add repeated status history | PASS |
| login throttling persists across a separately started server connection | PASS |
| audit history outlives the recent-activity window and rejects forged client events | PASS |
| request limits, private files, unknown routes and header-based deletion fail safely | PASS |
| sample records use contextual customer addresses and quotation descriptions | PASS |
| legacy company labels render as contextual examples without modifying saved settings | PASS |
| legacy markers are removed while customized company content and intentional blanks survive | PASS |
| currency formatting uses the rupee sign and Indian digit grouping | PASS |
| demo catalog retains the original five quotation totals and no authentication state | PASS |
| the same module loads without Node or a DOM as the browser DP global | PASS |
| quantity tiers, base-only percentage supplements, and minimum orders are preserved | PASS |
| area units accept decimal dimensions and apply the minimum charge before percentages | PASS |
| invalid whole quantities, dimensions, size counts, and selected options are rejected | PASS |
| invalid catalog pricing and integer overflow cannot produce billable items | PASS |
| size quantity drives pricing while item config remains an independent snapshot | PASS |
| largest remainder discounts never create a negative taxable final row | PASS |
| discount clamps and mixed tax brackets retain integer-paise accounting | PASS |
| additional charges use the saved quotation tax including zero, then current settings | PASS |
| conflict reload preserves employee edits and cannot silently revert a newer internal approval | PASS |
| signing in again as the same employee rebases approval metadata while keeping the draft | PASS |
| duplicate username errors do not put unrelated workspace saves into revision-conflict mode | PASS |
| area configurator exposes usable dimensions even when the catalog lacks a dimension field | PASS |
| a quotation deleted during conflict recovery is not silently recreated by Save | PASS |
| SQLite import preserves credentials, business snapshots, numbering and revisions without changing source | PASS |
| invalid SQLite import rolls back and leaves original source unchanged | PASS |
| SQLite v2 imports preserve record versions and durable audit events | PASS |
| review: malformed catalog updates return 422 and size prices retain separate authorization | PASS |
| review: HTTP PDF creation and unchanged saves cannot forge camel-case internal field visibility | PASS |
| Phase 1 HTTP catalog, pricing, preview, create, edit, snapshot, duplicate, PDF and reprice integration | PASS |
| Phase 1 HTTP rejects invalid definitions and sizes through all shared validation entry points | PASS |
| migration 005 preserves v4 bodies, credentials, revisions and quantities and can be reapplied | PASS |
| Phase 1 legacy single conditions preserve Equals and array comparisons | PASS |
| Phase 1 multiple ALL conditions require every Equals and Not Equals comparison | PASS |
| Phase 1 ANY conditions match either branch and do not match absent references | PASS |
| Phase 1 backend rejects invalid references, operators, empty groups and unavailable options | PASS |
| Phase 1 backend rejects self cycles, multi-field cycles and calculated quantity cycles | PASS |
| Phase 1 hidden fields cannot price, persist, or enable dependent fields | PASS |
| Phase 1 condition changes preserve independent pricing and hidden invalid values are discarded | PASS |
| Phase 1 reusable sizes sum quantities including custom labels, zero entries and approved surcharges | PASS |
| Phase 1 reusable size validation rejects negatives, fractions, strings, overflow and unavailable sizes | PASS |
| Phase 1 size definitions reject duplicates, all disabled, wrong pricing method and multiple drivers | PASS |
| Phase 1 size breakdown works with tier pricing and quantity-driven conditions | PASS |
| Phase 1 existing T-Shirts retain legacy sizes and editable explicit sz conversion | PASS |
| Phase 1 quotation editing persists size quantities and leaves untouched legacy snapshots operational | PASS |
| Phase 1 product-specific maps and multi selections cannot bypass server validation | PASS |
| Phase 1 size prices require pricing permission while visibility remains catalog-only | PASS |
| review: concurrent fresh startups apply Phase 1 migrations once | PASS |
| review: failed Phase 1 migration rolls back DDL and version and permits safe retry | PASS |
| Phase 1 PDFs include flagged text, dropdown and multiselect values with readable labels | PASS |
| Phase 1 PDFs omit hidden, unflagged narrative, empty and conditionally hidden fields | PASS |
| Phase 1 PDFs always exclude internal fields despite forged visibility flags | PASS |
| Phase 1 PDFs format reusable size labels, omit zero entries and preserve their total price | PASS |
| Phase 1 PDF field metadata remains a quotation snapshot and cannot change pricing | PASS |
| Phase 1 PDFs preserve legacy specifications while sanitizing internal narrative labels | PASS |
| review: fixed and package quantity conditions use the actual item quantity | PASS |
| review: malformed size definitions reach validation without authorization TypeErrors | PASS |
| review: scalar condition values must match text and built-in numeric reference types | PASS |
| review: hidden dimension values cannot activate conditions or charges | PASS |
| review: configuration sanitization rejects malformed visible sizes and preserves hidden discard | PASS |
| review: implicit dimension dependencies cannot create direct or transitive cycles | PASS |
| review: zero size totals cannot activate a quantity condition using a stale submitted total | PASS |
| review: legacy optional dropdown None conditions remain valid | PASS |
| review: camel-case internal labels are excluded from new and legacy customer PDFs | PASS |
| review: ALL and ANY truth tables cover Equals and Not Equals with blank and missing references | PASS |
| admin converts existing single conditions to ALL/ANY rules and edits Equals/Not Equals | PASS |
| admin customizes legacy T-shirt sizes, adds kids labels, reorders, disables and sets price adjustments | PASS |
| conditional configurator clears hidden descendants while preserving visible required and multiselect values | PASS |
| reusable size quantities calculate prices, omit disabled sizes and restore saved quotation edits | PASS |
| PDF toggles cannot enable internal fields and customer preview uses safe snapshot specifications | PASS |
| conditional size breakdown switches to ordinary quantity while hidden and restores the size editor when shown | PASS |
| review: conditional dropdowns restore their displayed defaults without restoring hidden selections | PASS |
| review: initial hidden values are cleared and size edits initialize quantity-dependent dropdowns | PASS |
| review: charge condition choices exclude size maps while retaining scalar fields | PASS |
| review: zero-count disabled sizes can be cleared when editing historical quotations | PASS |
| separate PostgreSQL app instances serialize revisions and quotation numbers; failed batches roll back | PASS |
| PostgreSQL offline recovery backs up, revokes sessions and preserves business records | PASS |
| all SRS catalog groups are present and unapproved additions cannot be quoted | PASS |
| all six pricing methods and all additional charge types use the shared engine | PASS |
| required, optional, default, numeric, conditional and compatible fields work together | PASS |
| inclusive and exempt tax treatments survive discounts and mixed-rate aggregation | PASS |
| employee discount limits, additional-charge restrictions and manual override auditing are enforced | PASS |
| customer contacts, immutable creators, company settings, numbering and price snapshots persist | PASS |
| independent approval blocks a creator and permits another authorized reviewer | PASS |
| validating a legacy unassigned quotation never claims it for the editing user | PASS |
| legacy quotation tax treatment and presentation stay fixed when global tax settings change | PASS |
| catalog metadata and master pricing have independent permissions across authorization and validation | PASS |
| customer PDFs include public quotation details and never internal notes | PASS |
| saved quotation company, customer and product snapshots survive catalog changes | PASS |
| IGST and split GST use the same saved financial totals | PASS |
| long specifications and many items produce numbered multipage quotation PDFs | PASS |
| missing optional terms and invalid legacy logos cannot prevent PDF downloads | PASS |
| company logo is embedded as an image in the quotation PDF | PASS |
| all standard sample quotations fit on one page with their complete terms and signatures | PASS |
| dense quotations fit five fully specified items without dropping nonzero charges or notes | PASS |
| legacy company and saved term labels are replaced in PDFs without changing the saved quotation | PASS |
| lengthy notes and terms can continue beside totals without losing their final text | PASS |
| all SRS screens render and explicit permissions govern navigation | PASS |
| customer preview excludes private item notes even for legacy showNotes setting | PASS |
| configurator renders numeric and conditional fields and uses shared calculation validation | PASS |
| manual WhatsApp preparation reviews recipient and message without changing quotation status | PASS |
| report CSV and dashboard filters include the selected customer employee and status | PASS |
| legacy company labels are replaced in settings branding and customer document previews | PASS |
| saved legacy quotation terms use clean presentation while preserving the original record | PASS |

## Existing application browser workflows

20 PASS; zero JavaScript exceptions.

| Check | Result |
| --- | --- |
| Connect to disposable workspace | PASS |
| All dashboard selects use the shared accessible control | PASS |
| Keyboard selection reveals custom date controls without replacing filters | PASS |
| A 10000-option list renders a bounded window and supports search | PASS |
| Keyboard skips disabled options and selects the last option | PASS |
| Search with no matches and Escape restore trigger focus | PASS |
| Disabled state and native programmatic changes remain synchronized | PASS |
| Option labels render as text and outside clicks dismiss the menu | PASS |
| Large quotation lists paginate and preserve search controls | PASS |
| Dashboard filtering preserves its active dropdown and matches totals | PASS |
| Reports dropdown updates results without replacing its controls | PASS |
| Configurator dropdowns work inside dialogs and Escape dismisses only the menu | PASS |
| Every application view upgrades its single-select controls | PASS |
| Every screen dropdown opens, displays its selection and closes consistently | PASS |
| Dynamic customer, product, rule, category, status and team dialog dropdowns work | PASS |
| Every product configurator applies dropdown selections to its specification model | PASS |
| WhatsApp review saves the recipient and creates a protected PDF | PASS |
| WhatsApp link opens the reviewed handoff without sending or changing status | PASS |
| Mobile dropdown stays within viewport and every screen avoids horizontal overflow | PASS |
| Desktop dropdown screenshot and no JavaScript exceptions | PASS |

## Existing shared dropdown browser checks

20 PASS; zero JavaScript exceptions.

| Check | Result |
| --- | --- |
| Native labels, values, events and unchanged selections are preserved | PASS |
| Native form reset restores visible selection without synthetic change events | PASS |
| Canceling native form reset preserves the current selection and visible caption | PASS |
| Live option replacement and labels refresh an already open menu | PASS |
| Hidden options stay excluded and native option label attributes are respected | PASS |
| Keyboard navigation skips disabled choices and disabled option groups | PASS |
| Typing after keyboard opening searches the list immediately | PASS |
| Escape, Tab and Shift+Tab return predictable focus | PASS |
| Moving focus outside dismisses the menu and leaves other keyboard input alone | PASS |
| Native hidden and disabled states propagate to the visible control | PASS |
| Disabled fieldsets preserve native first-legend exception | PASS |
| Required forms focus the visible dropdown when native validation fails | PASS |
| Plain and externally referenced labels and native tab order remain available | PASS |
| Large lists stay virtualized while scrolling, searching and choosing the last result | PASS |
| No-result search and markup-like option labels render safely | PASS |
| Long labels remain aligned and menus fit narrow and landscape viewports | PASS |
| Positioned fallback works when browser popovers are unavailable | PASS |
| Menus fit the visible viewport when a mobile keyboard reduces available space | PASS |
| Removing dynamic controls dismisses menus and multiple selects stay native | PASS |
| Hiding or collapsing a parent section dismisses its open dropdown | PASS |

## Phase 1 feature browser workflows

6 PASS; zero JavaScript exceptions.

| Check | Result |
| --- | --- |
| Phase 1 disposable workspace sign-in and fixture setup | PASS |
| Admin condition controls preserve legacy Equals and save multiple ALL/ANY operators | PASS |
| Admin adds reusable sizes, custom kids labels, price adjustments, ordering and disabled sizes | PASS |
| Quotation ALL/ANY conditions update immediately and clear hidden values | PASS |
| Reusable size quantities calculate total and prices, validate and survive quotation save/edit | PASS |
| Customer preview and protected PDF include flagged values and exclude internal notes | PASS |

## Review defect browser reproductions

4 PASS; zero JavaScript exceptions.

| Check | Result |
| --- | --- |
| Review browser: quantity-dependent and reappearing dropdown values match visible selections | PASS |
| Review browser: corrected configuration survives save and edit on a narrow viewport | PASS |
| Review browser: camel-case internal data is excluded from preview and authenticated PDF | PASS |
| Review browser: unavailable zero-count historical sizes have a usable clear action | PASS |

## Additional checks and boundaries

| Check | Result |
| --- | --- |
| JavaScript syntax (45 .js files and four separately checked browser .cjs runners) | PASS |
| Frontend build | PASS |
| Docker application build | PASS |
| Production dependency audit (zero vulnerabilities) | PASS |
| git diff --check | PASS |
| Fresh and populated migration, repeated SQL/startup, concurrent startup, rollback/retry, newer-schema refusal | PASS |
| Rendered authenticated review PDF, private-data exclusion and page bounds | PASS |
| Current normal catalog definitions inspected read-only (12 products) | PASS |
| Read-only current normal business-state copy (2 quotations, 3 items); snapshots and totals preserved | PASS |
| Synthetic 50-field/1225-condition calculation diagnostic (no throughput claim) | PASS |
| Static lint (no tooling defined) | NOT RUN |
| TypeScript type check (no project/tooling defined) | NOT RUN |
| Firefox and Safari | NOT RUN |
| Production load and public HTTPS rollout | NOT RUN |
| Migration/deployment against normal persistent or remote production database | NOT RUN |

See [PHASE-1-PRODUCTION-READINESS.md](PHASE-1-PRODUCTION-READINESS.md) for issue severity, fixes, migration results, files, acceptance and recommendation.
