# Phase 4 catalog audit and template assignment — 2026-10-26

This report accounts for all 28 products supplied in Requirements 21–23 and 26. The implementation and disposable verification are complete; the normal installation remains unchanged on schema 4 with 12 active products and the 28 requested products absent. A prepared copy contains all 40 documented products, retaining those 12 active records and adding 28 inactive records with explicitly unconfigured pricing.

The inventory was refreshed by executing `node test-results/phase4-catalog-source-audit.cjs`. That script runs a read-only PostgreSQL SELECT against the normal database, then prepares catalog state in memory. Its machine-readable result is [phase4-catalog-audit.json](../test-results/phase4-catalog-audit.json). The separate disposable dump/restore and migration evidence is [phase4-implementation-database.json](../test-results/phase4-implementation-database.json). Neither operation populates or migrates the normal installation.

## Scope and current counts

| Catalog state | Required manifest products | Missing | Inactive | Active | Identity conflicts |
|---|---:|---:|---:|---:|---:|
| Normal schema 4 database, read-only inventory | 40 | 28 | 0 | 12 | 0 |
| Normal database prepared in memory / validated disposable copy | 40 | 0 | 28 | 12 | 0 |
| Current source seed, before explicit preparation | 40 | 0 | 28 | 12 | 0 |

The maintainable manifest in [shared/catalog.js](../shared/catalog.js) contains the 28 explicitly supplied products plus the 12 documented products already present in [shared/domain.js](../shared/domain.js). The original complete SRS product-list artifact is unavailable. **Full SRS coverage remains BLOCKED / unverified**; the report does not claim that these 40 records represent every product in the original SRS.

The 12 retained records are Visiting Card, Logo Design, Letterhead, Flyer & Brochure, Flex Printing, Vinyl Printing, T-Shirt Printing, Paper Bag, Key Chain, Mug Printing, Table Calendar, and Shield & Trophy. Their existing IDs, prices, metadata and activation remain unchanged in copy verification. Categories are the actual existing Graphic Designing (`c1`), Printing Services (`c2`) and Promotional Gifts (`c3`). No separate subcategory relationship exists in the current catalog model; none was invented.

## Complete 28-product identity and assignment matrix

Every “Missing / none” value below describes the normal database. The source seed identifiers `p13`–`p40` describe separate source/demo records; they are not claimed to exist in the normal installation. The `catalog_*` IDs are the actual deterministic IDs produced when preparing the missing records from the normal database copy. Repeated preparation preserves those IDs. Preparing source seed records retains `p13`–`p40`.

| Product / stable code | Existing category | Normal product ID / status | Source seed ID | Prepared-copy product ID | Assigned reusable template | Existing pricing method retained |
|---|---|---|---|---|---|---|
| Envelope (`GD-EN`) | Graphic Designing (`c1`) | Missing / none | `p13` | `catalog_gd_en` | Print Product | `unit` |
| ID Card & Lanyard (`GD-ID`) | Graphic Designing (`c1`) | Missing / none | `p14` | `catalog_gd_id` | Print Product | `unit` |
| Bill Book (`GD-BB`) | Graphic Designing (`c1`) | Missing / none | `p15` | `catalog_gd_bb` | Print Product | `unit` |
| Catalogue (`GD-CT`) | Graphic Designing (`c1`) | Missing / none | `p16` | `catalog_gd_ct` | Print Product | `unit` |
| Invitation (`GD-IN`) | Graphic Designing (`c1`) | Missing / none | `p17` | `catalog_gd_in` | Print Product | `unit` |
| Danglers (`GD-DG`) | Graphic Designing (`c1`) | Missing / none | `p18` | `catalog_gd_dg` | Print Product | `unit` |
| Menu Card (`GD-MN`) | Graphic Designing (`c1`) | Missing / none | `p19` | `catalog_gd_mn` | Print Product | `unit` |
| Social Media Poster (`GD-SM`) | Graphic Designing (`c1`) | Missing / none | `p20` | `catalog_gd_sm` | Print Product | `fixed` |
| Custom Graphic Designs (`GD-CG`) | Graphic Designing (`c1`) | Missing / none | `p21` | `catalog_gd_cg` | Print Product | `base` |
| Offset Printing (`PR-OF`) | Printing Services (`c2`) | Missing / none | `p22` | `catalog_pr_of` | Stationery Product | `unit` |
| Digital Printing (`PR-DG`) | Printing Services (`c2`) | Missing / none | `p23` | `catalog_pr_dg` | Stationery Product | `unit` |
| LED Board (`PR-LED`) | Printing Services (`c2`) | Missing / none | `p24` | `catalog_pr_led` | Area Product | `area` |
| Eco Solvent Printing (`PR-ECO`) | Printing Services (`c2`) | Missing / none | `p25` | `catalog_pr_eco` | Area Product | `area` |
| DTF Printing (`PR-DTF`) | Printing Services (`c2`) | Missing / none | `p26` | `catalog_pr_dtf` | Area Product | `area` |
| UV Direct Printing (`PR-UV`) | Printing Services (`c2`) | Missing / none | `p27` | `catalog_pr_uv` | Area Product | `area` |
| Waterproof Vinyl Wall Posters (`PR-WV`) | Printing Services (`c2`) | Missing / none | `p28` | `catalog_pr_wv` | Area Product | `area` |
| Screen & Canvas Printing (`PR-SC`) | Printing Services (`c2`) | Missing / none | `p29` | `catalog_pr_sc` | Area Product | `area` |
| Foil & Emboss Printing (`PR-GF`) | Printing Services (`c2`) | Missing / none | `p30` | `catalog_pr_gf` | Print Product | `unit` |
| Hologram Stickers (`PR-HS`) | Printing Services (`c2`) | Missing / none | `p31` | `catalog_pr_hs` | Print Product | `unit` |
| Sunpack Sheet Printing (`PR-SP`) | Printing Services (`c2`) | Missing / none | `p32` | `catalog_pr_sp` | Area Product | `area` |
| Ink-Transfer Sticker (`PG-IT`) | Promotional Gifts (`c3`) | Missing / none | `p33` | `catalog_pg_it` | Print Product | `unit` |
| Umbrella (`PG-UM`) | Promotional Gifts (`c3`) | Missing / none | `p34` | `catalog_pg_um` | Promotional Gift | `unit` |
| Photo Frame (`PG-PF`) | Promotional Gifts (`c3`) | Missing / none | `p35` | `catalog_pg_pf` | Promotional Gift | `unit` |
| Gazebo / Kiosk (`PG-GK`) | Promotional Gifts (`c3`) | Missing / none | `p36` | `catalog_pg_gk` | Area Product | `unit` |
| Pen (`PG-PN`) | Promotional Gifts (`c3`) | Missing / none | `p37` | `catalog_pg_pn` | Promotional Gift | `unit` |
| Cap (`PG-CP`) | Promotional Gifts (`c3`) | Missing / none | `p38` | `catalog_pg_cp` | Promotional Gift | `unit` |
| Badges (`PG-BD`) | Promotional Gifts (`c3`) | Missing / none | `p39` | `catalog_pg_bd` | Promotional Gift | `unit` |
| Sublimation Gift Printing (`PG-SG`) | Promotional Gifts (`c3`) | Missing / none | `p40` | `catalog_pg_sg` | Promotional Gift | `unit` |

Assignment uses the explicit product manifest, existing categories and pricing methods, and the supplied product requirements. It does not infer production behavior from display names alone. All seven specifically requested print products use Print Product. Digital services use its inheritance contract with physical fields disabled. Gazebo uses Area Product for measurements without changing its existing `unit` pricing method.

## Configuration, pricing, additional fields and activation

The matrix reports backend-computed configuration readiness separately for (1) new records prepared from the normal copy and (2) the existing source seed records after explicit preparation. The first has **12 Incomplete / 16 Complete** assignments; the second has **26 Incomplete / 2 Complete** assignments. This difference follows existing product policies: the source records contain mapped Material/Customization fields whose requiredness is retained, whereas new Area/Gift template fields remain optional until Admin configures applicability.

“Complete” means the current required-field and relationship checks pass. It does not establish that optional option lists, business specifications or pricing have been approved. All optional option lists described below remain explicitly unconfigured. Every one of these 28 products remains **Inactive (Price Pending)** with **pricing Pending** in both prepared states. None becomes eligible for a new customer quotation merely because configuration checks pass.

“Source extras” lists every non-template field visible after preparation, including preserved Delivery and Notes. “New-copy extras” lists every non-template field created for a genuinely missing record. New records do not receive the seed’s Delivery surcharge or any other invented commercial option.

| Stable code | Config: prepared normal copy | Config: prepared source seed | Source extras, all retained | New-copy extras | Pricing / catalog status, both states | Unresolved mapping |
|---|---|---|---|---|---|---|
| `GD-EN` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `GD-ID` | Incomplete | Incomplete | Delivery; Notes; Lanyard Type; Lanyard Customization | Internal Notes; Lanyard Type; Lanyard Customization | Pending / Inactive (Price Pending) | Options and pricing only |
| `GD-BB` | Incomplete | Incomplete | Delivery; Notes; Number of Copies; Carbon Sets | Internal Notes; Number of Copies; Carbon Sets | Pending / Inactive (Price Pending) | Options and pricing only |
| `GD-CT` | Incomplete | Incomplete | Delivery; Notes; Page Count | Internal Notes; Page Count | Pending / Inactive (Price Pending) | Options and pricing only |
| `GD-IN` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `GD-DG` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `GD-MN` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `GD-SM` | Complete | Complete | Delivery; Notes; Design Requirements; Output Specifications | Internal Notes; Design Requirements; Output Specifications | Pending / Inactive (Price Pending) | Business confirmation: GD-SM |
| `GD-CG` | Complete | Complete | Delivery; Notes; Design Requirements; Output Specifications | Internal Notes; Design Requirements; Output Specifications | Pending / Inactive (Price Pending) | Business confirmation: GD-CG |
| `PR-OF` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Business confirmation: PR-OF |
| `PR-DG` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Business confirmation: PR-DG |
| `PR-LED` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PR-ECO` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PR-DTF` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PR-UV` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PR-WV` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PR-SC` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PR-GF` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PR-HS` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PR-SP` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PG-IT` | Incomplete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Business confirmation: PG-IT |
| `PG-UM` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PG-PF` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PG-GK` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Business confirmation: PG-GK |
| `PG-PN` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PG-CP` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PG-BD` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |
| `PG-SG` | Complete | Incomplete | Delivery; Notes | Internal Notes | Pending / Inactive (Price Pending) | Options and pricing only |

For all 28 seeded placeholders, Delivery remains byte-for-byte compatible: existing Standard and Express definitions, including the existing 20% of base Express charge, are preserved. This is retained source data, not a newly approved business rate. Notes remain internal and are excluded from customer PDFs. Compatible additional Admin fields, approved inactive prices/options, field visibility, explicit optional flags, conditions and compatibility references are preserved. Only the six provably unchanged, unapproved generic fields named in the request—Material, Customization, Model, Colour, Packaging and Artwork—are candidates for controlled replacement/archival. Referenced or customized definitions are retained.

## Four reusable templates

| Template / stable ID | Shared fields | Applicable policy and pending setup |
|---|---|---|
| Print Product / `print_product` | Size; Paper; Printing Sides; Finish | Applicable newly inherited fields are required through `assignment.required`, without copying entire field definitions. Product-local optional policies and explicit full overrides take precedence. Every actual size, stock, sides and finish list requires Admin configuration. |
| Area Product / `area_product` | Dimensions; Material; Lamination; Installation | Dimensions uses the existing `dim` field, Width/Height/Unit inputs, `ft`/`in`/`cm`/`m` conversions and existing area rounding. Mapping or overriding Dimensions to a different field type is rejected. Installation and lamination remain optional; actual options and applicability require Admin decisions. |
| Promotional Gift / `promotional_gift` | Product Model; Material; Colour; Customization Type; Printing Method; Packaging; Artwork Requirement | Reuses the Phase 3 `giftTemplate`, projection, option management and full override contract. It adds no parallel gift engine. Existing mapped source Material/Customization requirements remain intact. |
| Stationery Product / `stationery_product` | Paper; Size; Printing Sides; Binding | Paper/Size/Sides are applicable required fields unless an explicit Admin policy says otherwise. Binding remains optional and may be disabled when irrelevant. Actual available stock, sizes, sides and binding choices remain pending. |

The existing engine supplies ordering, required/optional flags, visibility, conditions, compatibility rules, customer PDF policy, backend validation, quotation snapshots and editing. Stable field mappings prevent duplicate rendered fields and charges. Product overrides remain isolated. Requiredness policy no longer freezes inherited labels/options as whole-field overrides; an explicit full field override still retains the Phase 3 behavior. Unknown/circular template references, duplicate keys and invalid dependencies are rejected or surfaced in readiness.

All new selection definitions use disabled, unapproved setup markers with null prices. The marker text (“Configure options”, or the inherited gift marker “Standard”) is not an approved selectable production option. Admin must enter actual business choices rather than accept a guessed catalog.

## Seven product-specific Print configurations

| Product | Delivered configuration | Existing behavior and pending business data |
|---|---|---|
| Envelope | Size; Paper; Printing Sides; Finish | Admin maintains actual envelope sizes. DL/C5 were examples in the request and were not inserted as approved choices. |
| ID Card & Lanyard | Size; Paper/Material; Printing Sides; Finish; optional Lanyard Type and Lanyard Customization | Lanyard fields initially accept descriptive text. No unapproved lanyard models or customization choices were invented. Admin may maintain suitable supported field types/options. |
| Bill Book | Size; Paper; Printing Sides; Finish; required Number of Copies; optional Carbon Sets | Copies and Carbon Sets are Admin-managed choices, initially unavailable pending configuration. Neither changes quotation order quantity or adds an invented printing charge. |
| Catalogue | Size; Paper; Printing Sides; Finish; required Page Count | Page Count must be a positive whole number within the application’s existing supported numeric limit. Missing, zero, negative and fractional page counts are rejected. It does not introduce page-based pricing or binding rates. Existing compatible printing/binding fields, if supplied, remain retained. |
| Invitation | Size; Paper; Printing Sides; Finish | Existing compatible extras are retained; no embellishment or other commercial options were guessed. |
| Danglers | Size; Paper/Material; Printing Sides; Finish | Actual material, stock, size and finishing choices remain product-specific Admin data. |
| Menu Card | Size; Paper; Printing Sides; Finish | Existing compatible finishing extras are retained; actual available finishes require Admin configuration. |

Selections render dynamically through the shared configurator. Backend validation rejects unavailable/invalid choices. Existing quotation snapshots retain their saved definitions and totals; catalog preparation does not mutate or reprice history. Eligible specifications follow saved customer PDF visibility and internal Notes remain private.

## Required option setup from executed readiness checks

All 28 rows also require approved base pricing and tax treatment. This table enumerates the missing **required** option lists actually reported by readiness; optional option lists are listed separately below.

| Stable code | Missing required options: prepared normal copy | Missing required options: prepared source seed |
|---|---|---|
| `GD-EN` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `GD-ID` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `GD-BB` | Size; Paper; Printing Sides; Finish; Number of Copies | Paper; Size; Printing Sides; Finish; Number of Copies |
| `GD-CT` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `GD-IN` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `GD-DG` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `GD-MN` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `PR-OF` | Paper; Size; Printing Sides | Paper; Size; Printing Sides |
| `PR-DG` | Paper; Size; Printing Sides | Paper; Size; Printing Sides |
| `PR-LED` | None required by current assignment policy | Material |
| `PR-ECO` | None required by current assignment policy | Material |
| `PR-DTF` | None required by current assignment policy | Material |
| `PR-UV` | None required by current assignment policy | Material |
| `PR-WV` | None required by current assignment policy | Material |
| `PR-SC` | None required by current assignment policy | Material |
| `PR-GF` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `PR-HS` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `PR-SP` | None required by current assignment policy | Material |
| `PG-IT` | Size; Paper; Printing Sides; Finish | Paper; Size; Printing Sides; Finish |
| `PG-UM` | None required by current assignment policy | Material; Customization Type |
| `PG-PF` | None required by current assignment policy | Material; Customization Type |
| `PG-GK` | None required by current assignment policy | Material |
| `PG-PN` | None required by current assignment policy | Material; Customization Type |
| `PG-CP` | None required by current assignment policy | Material; Customization Type |
| `PG-BD` | None required by current assignment policy | Material; Customization Type |
| `PG-SG` | None required by current assignment policy | Material; Customization Type |

Optional business data still pending includes Area Material/Lamination/Installation lists; Gift Model/Material/Colour/Customization/Printing/Packaging lists; Stationery Binding; Bill Book Carbon Sets; and any optional product-specific selections the business elects to use. The different requiredness policies above do not silently turn these into approved choices.

Genuinely new records use `rate:null`, `tax:null`, `priceConfigured:false` and `on:0`. Existing seeded zero base values and tax values remain existing data with `priceConfigured:false`; zero is never substituted for a missing approved price. No quantity tiers, material rates, printing rates, GST rates, discount limits, setup charges or other price records were invented. Missing mandatory pricing blocks quotation pricing and activation protections remain in force.

## Six mappings requiring business confirmation

1. **Social Media Poster (`GD-SM`)** — treated as digital artwork using the existing `fixed` pricing method. All four physical Print fields are disabled. Design Requirements and Output Specifications are multiline text. Confirm actual deliverables and commercial scope.
2. **Custom Graphic Designs (`GD-CG`)** — treated as a design service using the existing `base` method. All four physical Print fields are disabled. The same two service text fields capture requirements without forcing paper, sides or finishing.
3. **Offset Printing (`PR-OF`)** — Stationery reuses the existing unit-based Paper/Size/Sides configuration; Binding is optional. Confirm actual production choices and whether binding applies.
4. **Digital Printing (`PR-DG`)** — same documented Stationery mapping with optional Binding; confirm actual production choices and applicability.
5. **Ink-Transfer Sticker (`PG-IT`)** — Print supplies the closest existing shared contract. Actual transfer/material choices and any supported product-specific override require confirmation; no transfer specification or price was invented.
6. **Gazebo / Kiosk (`PG-GK`)** — Area supplies Dimensions and optional Installation. Its existing **UNIT** pricing method is preserved. Construction scope, measurement conventions and the commercial pricing basis require confirmation before approval.

These six issues are emitted by catalog preparation rather than silently treated as approved requirements. Informational mapping warnings do not prevent a reviewable prepared draft. A conflicting existing template assignment is separately marked blocked and requires explicit review.

## Identity, duplication and persistence safeguards

Stable product codes and persistent `catalogManifestCode` links identify records. Exact documented aliases are accepted only alongside the expected category and pricing method when no known stable identity applies. Safe aliases include the existing “DTF Printing for Fabric & Leather”, “Gold / Silver Foil & Emboss Printing” and “Pen Printing”; case, punctuation and “&”/“and” normalization do not create extra required rows.

Fuzzy similarity is not used. Ambiguous aliases and conflicting stable code/manifest links are reported without merging records or creating a duplicate. A canonical record with an additional alias record remains one required checklist row, with a duplicate warning. Search includes documented aliases and current actual names. Counts come from the complete backend manifest comparison before pagination and filters.

Preparation is explicit, transactional through the existing API/state persistence, and idempotent. It creates only genuinely missing records, retains existing IDs and categories, and skips previously active records without automatically deactivating or reconfiguring them. Active records with incomplete pricing receive a warning. Inactive records are labeled price-pending only when there is pricing evidence; a configuration error alone does not reclassify an otherwise approved inactive product.

## Evidence and acceptance

| Audit item | Result | Evidence / limitation |
|---|---|---|
| All 28 supplied product identities and template mappings accounted for | PASS | Refreshed 28-row JSON inventory and matrices above. |
| All 40 documented manifest identities counted without alias inflation | PASS | Normal: 12 active / 28 missing; prepared: 12 active / 28 inactive; no identity conflicts. |
| Original complete SRS coverage | BLOCKED | Original complete product manifest unavailable. |
| Safe creation / inactive state / null new price and tax | PASS | Disposable-copy evidence reports 28 created, 28 inactive, null prices/tax, repeated preparation idempotent. |
| Existing products, IDs, prices, activation and historical rows preserved | PASS | Copy evidence records exact restoration, stable originals, no referential violations and repeated migration preservation. |
| Approved historical quotation preservation | PASS with fixture boundary | Normal source has zero approved quotations; two deterministic approved fixtures were preserved on the disposable copy. This does not assert a real approved source record was present. |
| Shared engine and catalog regression | PASS | Executed local domain/catalog run: 116/116; Phase 4-focused domain/catalog: 33/33. |
| Complete Node/PostgreSQL regression | PASS | Final coordinated disposable run: 278/278. Broader browser/build/PDF evidence belongs in the Phase 4 completion report. |
| Actual business options, pricing and six exceptional mapping approvals | BLOCKED | Pending Admin/business input; no commercial values invented. |
| Catalog population, schema migration or activation in the normal installation | NOT RUN | Read-only normal inventory remains schema 4 / 12 products. Prepared state and migration evidence are isolated from it. |
| Phase 5 import/approval workflow | NOT RUN | Outside the authorized Phase 4 implementation. |

The catalog/template implementation supports proceeding to Phase 5 development within the documented coverage. Business activation of these products remains blocked by missing approved pricing/options and unresolved mappings. This audit does not authorize activation or deployment.

