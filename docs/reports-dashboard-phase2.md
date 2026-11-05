# Phase 2: Reports & Analytics dashboard

Completed: 2026-11-05. Scope: the existing Reports route (`#rep`) and the small, additive report fields needed by its visualizations. No unrelated page was redesigned. No production deployment, normal-installation restart, or production database modification was performed.

## Completed

- **Reports & Analytics** header, existing branding/sidebar, a responsive global filter toolbar, date presets, explicit date bounds, year/month, customer, creating employee, status, reset and report export.
- Six KPI cards: total quotations, total quoted value, customer-approved quotations, approval rate, distinct quoted customers and most quoted product. Initial values appear only after a successful API response. Updates animate from the previous real values; loading uses skeletons.
- **Global Product Performance** remains the primary visualization and uses the Phase 1 server aggregation. Grouped/stacked bars, lines, area, product comparison, category/metric controls, interactive legend, stable ID-based colors, pointer/focus tooltips, fullscreen, product CSV and an accessible monthly data table are included.
- Seven supporting visualizations: overall quotation trend, status donut, top quoted products, employee performance, customer performance, approval/rejection by quotation month and WhatsApp sharing analytics. Employee performance can switch between count and value; its labels retain both measures. Trend count/value use separate, labelled axes.
- Every original detailed report remains available in collapsible sections: sharing history, status, date, employee, product frequency, customer history, approvals/rejections and expired quotations. Expanded sections survive filter updates.
- Mobile filters collapse; cards stack; charts and tables scroll within their containers. Keyboard controls, text-only tooltips, readable legends, explicit empty/error/retry states and reduced-motion support are included.
- Request/user/root identity guards prevent stale responses from replacing newer filters, another page or another user's report. Summary failures disable its export; product failures remain independently recoverable. Global controls retain their DOM identity during refresh.

The app is plain JavaScript. The implementation extends the existing SVG approach with reusable `ReportCharts` components and shared INR/month formatters. No React conversion, chart dependency, CDN, chart service, or production demo dataset was introduced.

## Definitions and filtering

| Measure | Definition |
| --- | --- |
| Total quotations | The existing summary endpoint's distinct matching documents. Includes the selected workflow statuses, including Draft/Cancelled when no status filter is set. |
| Total quoted value | Saved document grand totals, **including GST and separate quotation charges**. This is not revenue or payments received. |
| Approved quotations | Current `Customer Approved` status; internal approvals remain a separate workflow status. |
| Approval rate | Customer-approved quotations / all matching quotations. No quotations displays an unavailable rate, rather than inventing a conversion percentage. |
| Total customers | Distinct customers with matching quotations, rather than all registered customers in the workspace. |
| Most/top quoted products | Distinct quotations containing a stable product ID; repeated lines do not inflate frequency. Line-item frequency and quantity are retained separately. |
| Product chart value | The Phase 1 projected integer-paise amount after the canonical discount, **before GST**, excluding separate quotation charges. No frontend price or discount recalculation occurs. |
| Approval/rejection timeline | Current customer decision grouped by saved quotation month. It is not a status-change event timeline. |
| WhatsApp timeline | Current recorded attempt statuses grouped by sharing-event month in the workspace timezone, for the selected quotation cohort and permitted document scope. An attempt can occur outside its quotation's date range. |

Global filters refresh KPIs, charts and detailed reports together. Product/category/metric comparison controls are local to the product visualization. Year/month intersect quotation dates consistently in the summary, product endpoint and quotation CSV. Choosing a year supplies that year's date bounds; manually changing dates clears the year restriction. Dashboard windows retain the product endpoint's **60-month** limit. The product series/option limits remain unchanged.

Quotation CSV uses the last successfully applied global query. Product CSV includes all selected product/month cells, including zeros, with stable IDs, quotation count, line count, quantity, pre-GST value and applied filters. Legend visibility is a visual preference; the product table and CSV retain every selected product. Both CSV paths retain formula-injection protection.

Historical labels and aliases still come from quoted snapshots. Tooltips retain the names actually quoted in each month. Archiving, renaming or repricing a product does not change the saved product amounts.

## Additive backend work and security

Existing routes and response fields remain compatible:

- `GET /api/reports/summary` and `/api/reports/quotations.csv` now accept validated `year` and `month`, using bound SQL predicates. Invalid, duplicate and injection-shaped calendar parameters are rejected. Quotation-list filtering is unchanged.
- Product rows retain `timesQuoted` (line count) and add `quotationCount` (distinct documents).
- `byMonthStatus` supplies current-status counts by saved quotation month without exposing raw quotation bodies.
- `sharingQuotationIds` contains only matching identifiers already allowed by the existing sharing and canonical quotation-view checks. A report-only role gets no document identifiers. Mixed report-all/document-own roles get only their own document identifiers.
- Summary responses continue to **omit raw quotations**. The UI does not download or aggregate raw quotation line items for the product chart.
- Reports retain `reports.view_own` / `reports.view_all`. Sharing history retains its additional quotation/sharing scope. The application's separate app/database company-isolation model is unchanged.
- Untrusted names, messages and chart labels are escaped; custom tooltips use `textContent`. No executable HTML or SVG upload capability was added.

No schema migration, index, storage change, environment variable or dependency is required by Phase 2. The existing Phase 1 schema-9 projection is still required for product analytics; a normal installation on an older schema must follow the existing authorized migration/backup procedure before using the matching source release.

## Verification

| Check | Final result |
| --- | --- |
| Complete automated unit/integration suite | **PASS: 426/426**, no failures, skips or cancellations |
| Focused analytics/dashboard tests | **PASS: 20/20**, included in the complete suite |
| Complete browser release/regression run | **PASS: 288 checks across 24 suites**, all processes exit 0; no reported JavaScript exceptions |
| New dashboard browser suite | **PASS: 12 checks**, included above and rerun after final UI refinements |
| Existing analytics browser suite | **PASS: 9 checks**, retained and updated for the redesigned global controls/collapsible table |
| Syntax | **PASS: 129 JavaScript/CJS files**, `npm run check` |
| Build | **PASS: `npm run build`** |
| Whitespace | **PASS: `git diff --check`** |
| Dedicated lint/type checks | **NOT CONFIGURED** in this plain-JavaScript repository |
| New release-image build / production load test / deployment | **NOT RUN** |

New coverage checks KPI definitions, zero months, distinct product frequency, mixed filter intersections, year/month CSV consistency, malformed/injection parameters, report-only and mixed permissions, read-only quotation fingerprints, event-month timezone boundaries, truthful sharing states, XSS escaping, INR formatting and stable colors. The earlier analytics calculation, discount, archive, migration and isolation tests remain in the complete suite.

Browser coverage checks skeletons without fake values, global filter synchronization, both exports, all chart modes, legend keyboard interaction, tiny-value tooltip targets, focus tooltips, fullscreen exit, table retention/open-state, loading/error/retry behavior, stale responses, report-only/own/no-report roles and reduced motion. Widths **1600, 1280, 1024, 768, 390 and 320** pass without document-level horizontal overflow.

Visual verification uses real API responses from a **synthetic disposable fixture**, not hardcoded production UI data: 18 quotations, 3 customers, 3 employees and 6 quoted products. Expected KPIs include 18 quotations, INR 4,06,985.30 document value, 3 customer-approved quotations and 16.7% approval rate. Product value is INR 3,44,902.80 before GST. Local synthetic sharing fixtures prepare records only; no external messages were sent.

Screenshots reviewed:

- `test-results/reports-phase2-desktop-viewport.png`
- `test-results/reports-phase2-desktop.png`
- `test-results/reports-phase2-mobile.png`

Other ignored evidence includes `reports-phase2-full-suite.log`, `reports-phase2-targeted.log`, `reports-phase2-browser.log`, `reports-phase2-analytics-browser.log`, `reports-phase2-browser-summary.json`, `reports-phase2-syntax.log`, `reports-phase2-build.log` and the review-start/change SHA-256 manifests under `test-results/`.

Transient development issues were corrected before acceptance: missing summary aggregates, stale dropdown captions after resets, subpixel bar tooltip targets and historical aliases omitted from the initial reusable-tooltip adapter. There are **no outstanding test failures**.

## Files changed

```text
public/index.html
public/product-analytics.css
public/product-analytics.js
public/reports-charts.js
public/reports-dashboard.css
public/reports-dashboard.js
server/queries.js
server/openapi.js
scripts/test-customer-release.js
tests/product-analytics.browser.cjs
tests/reports-dashboard.browser.cjs
tests/reports-dashboard.test.js
docs/reports-dashboard-phase2.md
```

A phase-start hash manifest verifies unrelated source remained unchanged. Earlier dirty customer/category/quotation work is preserved. No reset, staging, commit or publication was performed.

## Remaining limits and release notes

- The legacy summary/history paths still hydrate full permitted report history server-side and use the existing sharing cache. Very large datasets need staging/load measurements and potentially a separately scoped report-query optimization; this phase does not claim a production throughput SLA.
- Sharing supports Prepared, Manually Confirmed and Failed. Provider delivery/read success is unavailable and is never inferred from Prepared or staff confirmation. Summary and history permissions can differ, and the history section explicitly describes its narrower scope.
- Product limits, mixed saved quantity units and legacy category provenance remain as documented in Phase 1. The frontend has no new shared-database tenancy model.
- All validation ran against generated disposable PostgreSQL databases. The normal app/database containers remained healthy and were not restarted or migrated. The newly built `dist/` assets are local build output, not evidence that the running normal installation serves this release.
- An authorized release should use a verified backup and an isolated restored staging rehearsal, then deploy matching frontend/backend assets. If Phase 1 is already installed, Phase 2 requires no further migration. Phase-2-only rollback restores the prior matching source/assets; if the release also introduces schema 9, use the Phase 1 documented backup/rollback strategy and preserve subsequent writes.

**Phase 2 acceptance: PASS for source implementation, isolated automated/browser verification and visual review. Deployment remains unperformed.**
