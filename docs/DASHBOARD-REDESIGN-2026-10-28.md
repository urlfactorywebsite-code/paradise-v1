# Dashboard redesign — 28 October 2026

Implemented in the existing vanilla JavaScript / Node.js / PostgreSQL application. No framework, dependency, schema, migration, authentication, quotation calculation, or status-transition changes were introduced. The normal installation was not rebuilt or migrated.

## Delivered behavior

- Fixed 220px dark teal sidebar, orange DP mark, authorized navigation grouped into Workspace, Catalog and Administration, persisted icon-only collapse, and a keyboard-accessible mobile drawer with backdrop and focus handling.
- White application header with current breadcrumb, debounced global search, honest notification availability, and the authenticated user's name, initials, role, settings/account actions and sign out.
- Time-based greeting using the backend's workspace calendar: valid process `TZ`, otherwise Asia/Kolkata. Month-to-date is the default. Today, yesterday, last 7/30 days, this/last month, custom and all-time ranges are supported.
- Existing employee, customer and quotation-status filters retained in Advanced filters. Invalid custom ranges show an actionable error. Current selections update all primary dashboard panels together; old responses cannot overwrite newer selections.
- Four primary KPIs: total quotations, drafts, pending internal review, and stored quoted value in integer paise formatted as INR. Cancelled and other existing statuses remain included according to existing list behavior. Status-filtered quoted value is labeled accordingly. Quoted value is explicitly distinguished from revenue.
- Six recent quotations with stable date/number/ID ordering, original quotation identifiers, stored totals, customer/company, creator and real statuses. Record buttons open the existing detail workflow.
- Real pending-review and approaching-expiry attention items, bounded to six and deduplicated by quotation. Review opens the existing status workflow without changing anything. Its availability also respects independent approval. Expiry uses actual valid-until dates and existing expirable statuses, with an explicitly described seven-day display window.
- Existing status summaries, top quoted products, recent customers, activity and WhatsApp sharing remain accessible in More workspace insights and their existing management/report pages.
- Skeletons, empty/error/retry states, session expiry handling, keyboard focus, responsive table overflow, and narrow-screen layouts. No sample records or invented statistics are used as error fallbacks.
- The shared dropdown now retains popup focus during an option's mousedown, preventing the focusable main area from closing it before selection. Startup waits for all presentation scripts before its first render.

## API and data sources

| Endpoint/source | Change and data |
| --- | --- |
| `GET /api/dashboard` | Existing endpoint extended with `kpis`, six `recent` records, `attention`, `attentionTotal`, `today`, `timezone` and display-policy metadata. Existing report breakdown fields remain. Uses quotation ownership/view permissions; report grants cannot widen record visibility. |
| `GET /api/search?q=...&pageSize=...&page=...` | New read-only, bounded lookup. Quotation numbers and saved customer name/company snapshots use existing quotation permissions. Customer names/company require `customer.view`. Each category returns at most 10 records, with minimal display fields. The header requests six per category. |
| PostgreSQL `quotations.total` | Authoritative stored-paise KPI sums and displayed recent/attention amounts. SQL filters are shared with the existing quotation listing. |
| Quotation history, customer snapshots, users | Real pending timestamps, customer/company and creator fields. Recent items/history are bulk loaded; no per-quotation `store.get` or full workspace read is needed for the dashboard endpoint. |
| Quotation items, audit events | Existing product frequencies and scoped recent activity, with selected-period boundaries. |
| Authenticated workspace state | Existing reusable filter choices and recently added customers. No additional browser database download was introduced for search. |
| Existing WhatsApp service | Sharing activity is loaded only when secondary insights are opened. Existing history and manual-sharing workflows remain intact. |

All API filtering is server-side and authenticated. Date parameters are inclusive business dates, timestamps use the workspace timezone for calendar boundaries, and invalid dates/statuses/IDs/search/pagination are rejected. These read endpoints do not write business records, approvals or audit events.

## Files

| Files | Purpose |
| --- | --- |
| `public/workspace-ui.js` (new), `public/workspace.css` (new) | Workspace shell, dashboard, scoped API integration, search, accessibility and responsive presentation. |
| `public/app.js`, `public/index.html`, `public/srs-ui.js` | Connect the new presentation to existing rendering, script loading and secondary insights. |
| `public/dropdowns.js` | Preserve shared dropdown focus until option selection. |
| `server/dashboard.js` (new) | Aggregate dashboard and minimal search queries, existing permissions and validation. |
| `server/resources.js`, `server/queries.js` | Route integration and reuse of existing SQL filters; other report endpoints remain intact. |
| `server/openapi.js`, `docs/API.md` | API contracts and data/permission semantics. |
| `tests/dashboard-api.test.js` (new) | Five isolated API test groups. |
| `tests/dashboard.browser.cjs` (new) | Seventeen integrated browser groups with real, authenticated disposable fixtures. |
| `tests/browser-ui.cjs` | Existing regression suite adapted to Advanced filters, API totals and mobile drawer navigation. |
| This report | Implementation, evidence and limits. |

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | **PASS** — 78 JavaScript syntax checks. |
| Explicit `node --check` on both changed browser CJS runners | **PASS**. |
| `npm run build` | **PASS** — generated local `dist/` assets. |
| Final `npm run test:docker` | **PASS** — 335/335, zero failures or skips, including all five new API groups and PostgreSQL backup/restore. |
| Dashboard browser runner | **PASS** — 17/17; zero JavaScript exceptions or framework warnings. |
| Existing browser runner | **PASS** — 20/20; zero JavaScript exceptions. All 11 existing mobile views passed page-overflow checks. |
| Quotation regression | **PASS** — creation, saved editing, duplication as Draft, details, review permission checks, protected PDF generation and manual WhatsApp preparation/handoff. |
| Dashboard resilience | **PASS** — real empty data, invalid custom dates, delayed/error responses and recovery, stale dashboard/search responses, expired sessions. |
| Authorization | **PASS** — own-only employee totals/search, hidden quotations returning 404, no customer result exposure without permission, no unauthorized Review controls, report grants cannot widen scope. |
| Responsive/navigation | **PASS** — desktop 220px sidebar/content bounds, persisted collapse, mobile drawer dismissal/focus, open-notification overflow checks at 320/390px. |
| `git diff --check` | **PASS**. |
| Separate lint/TypeScript checks | **NOT RUN** — this JavaScript repository defines neither toolchain. |
| Firefox/Safari, external hosting and real WhatsApp delivery | **NOT RUN**. WhatsApp remains a manual handoff; no delivery/read claims. |

Tests used a separate tmpfs PostgreSQL container and disposable applications on ports 6428/6430, never the normal application's database. Test fixtures and screenshot values are intentional isolated records, not production fallbacks. A host-only exploratory backup test lacked `pg_dump`; the final Docker suite includes those tools and passed backup/restore.

The owned test applications, disposable databases and test containers were stopped/removed after verification. The temporary process holding disposable sign-in variables was closed; no new credential files were created. Evidence artifacts remain in `test-results/`.

Evidence in ignored `test-results/`:

- `dashboard-final-suite.log` — final complete Docker test log.
- `dashboard-browser.json` — 17 dashboard groups and measured layout bounds.
- `ui-regressions.json` — 20 existing browser groups.
- `dashboard-desktop.png`, `dashboard-desktop-viewport.png` — final fresh-page desktop captures.
- `dashboard-mobile.png`, `dashboard-mobile-viewport.png` — final mobile captures.
- `dashboard-quotation.pdf`, `whatsapp-regression.pdf` — generated test PDFs.

Final screenshots were visually inspected on fresh authenticated pages with capture animations disabled. An earlier full-page capture after viewport/collapse changes produced an installed-Chrome compositor artifact despite correct DOM bounds; those earlier debug captures are not the final visual evidence.

## Limits and installation status

- The attachment contained the written brief only. No reference screenshot was supplied, so exact visual parity cannot be certified.
- There is no existing backend notification feed or configured review deadline. The header states that the feed is unavailable and shows no fabricated unread count. Pending reviews show actual status and elapsed time, with no invented overdue classification.
- The expiry horizon is a display window, not a new expiry or approval business rule. Existing status transitions, independent approval, pricing and historical quotation snapshots are preserved.
- Read-only verification of `http://127.0.0.1:6400/api/ready` returned `ok:true`, PostgreSQL, schema 4. That normal installation remains unchanged. The redesign is implemented and verified in source/build and disposable installations; it has not been deployed to the normal installation or production.
