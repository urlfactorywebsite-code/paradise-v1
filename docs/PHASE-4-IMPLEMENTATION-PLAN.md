# Phase 4 implementation plan - 26 October 2026

## Findings before refinement

The checkout already contains partial Phase 4 work. The application is the existing plain-JavaScript/Node.js/PostgreSQL application; Phase 1 fields/conditions/PDF visibility, Phase 2 managed options/backend pricing and Phase 3 gift references/overrides/snapshots are present and will be reused. There is one company workspace, existing permission overrides and flat categories; no tenant or subcategory model is present.

Existing Phase 4 code provides three additional template definitions through the same projection engine, a 40-entry documented manifest (28 requested plus 12 existing seed products), explicit catalog preparation and a backend checklist/UI. The known entry regression is shared-template metadata propagation after backend normalization. The original complete SRS product-list artifact is unavailable; coverage beyond these documented records must remain unverified.

The normal installation is separate from the source/disposable verification. It remains schema 4. Tests and catalog preparation will use isolated PostgreSQL databases and a disposable browser; no deployment, reset, actual business-rate approval or activation of normal products is part of this work.

## File-level plan

| Files | Work |
| --- | --- |
| `shared/catalog.js` | Audit all 28 identities/categories/current models; conservative alias handling, idempotent missing-record preparation, truthful configuration/pricing readiness, explicit unresolved mappings and preservation of Admin definitions. |
| `shared/domain.js` | Reuse the Phase 3 projection/override/condition/pricing mechanism for Print, Area, Gift and Stationery; correct compatible template defects only. |
| `server/validation.js`, `server/access.js` | Prevent accidental inherited overrides, enforce active/pending configuration invariants, preserve independent permissions and protect private master pricing. |
| `server/resources.js`, `server/store.js` | Versioned template/catalog prepare/checklist APIs, consistent filtering/counts/pagination and bounded catalog reads without quotation-history/N+1 loading. |
| `server/openapi.js`, `docs/API.md` | Document the final existing-pattern contracts, readiness and authorization behavior. |
| `public/srs-ui.js`, scoped existing styles | Extend current template/configuration editor and Catalog Verification using existing components, review/apply workflow, truthful warnings, loading/error/empty states, filters and responsive behavior. |
| `tests/phase4-*.test.js`, `tests/phase4.browser.cjs` | Deterministic catalog/template/product/checklist/security/API and complete quotation/PDF regression coverage. |
| Phase 4 catalog matrix and completion report | Actual catalog inventory, 28-product assignment reasons/business gaps, executed results, acceptance checklist and Phase 5 recommendation. |

## Data and integration decisions

- Retain product IDs/codes, actual active state, approved prices and saved quotations. Only genuinely missing records are created by explicit preparation, with inactive state and unconfigured prices/tax.
- Use product-template references, mappings, existing full explicit field overrides and JSON document persistence. No new SQL migration is expected; add one only if the existing structures prove insufficient.
- Keep configuration readiness separate from pricing readiness. Available specifications without approved rates may be configured yet price-pending; pending mandatory choices cannot become free.
- Use Print for the seven explicitly requested products, with neutral configurable extra fields for ID Card/Lanyard, Bill Book and Catalogue. No commercial option lists or constraints are invented.
- Digital design services receive requirements/deliverables fields and disable irrelevant inherited physical fields. Ambiguous production-method assumptions are reported for business review rather than guessed.
- Reuse the existing area conversion, pricing bases, GST, discounts, rounding and item snapshots. Template assignment must not duplicate fields or charges.
- Preserve existing activation protection; introduce no Phase 5 import/approval/activation-checklist workflow.

## Verification order

1. Capture the dirty-tree/source manifest and execute the complete baseline.
2. Reproduce and correct Phase 4 engine, normalization, catalog/readiness, permission and UI gaps.
3. Run focused tests, then the complete Node/PostgreSQL regression suite and production builds.
4. Audit a read-only normal database copy; verify explicit preparation/migration/idempotence and unchanged historical rows/prices.
5. Run serial existing and Phase 4 browser workflows on a fresh disposable app, including save/reopen and PDF generation for all template families and the seven print products.
6. Render/inspect affected PDFs and desktop/mobile UI, finalize the 28-product matrix and evidence-backed report, remove only this run's disposable resources and stop before Phase 5.
