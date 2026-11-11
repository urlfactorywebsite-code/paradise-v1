import fs from 'node:fs';
export const inv=JSON.parse(fs.readFileSync(new URL('inventory.json',import.meta.url),'utf8'));
export const modules=[],cases=[];
function section(code,name,sources,pre,data,lines){
 const mod={code,name,sources,pre,data};modules.push(mod);
 for(const line of lines.trim().split('\n').filter(Boolean)){
  let [title,steps,expected,testData,role]=line.split('|');
  let priority=title.startsWith('!')?'P0':title.startsWith('~')?'P2':'P1';title=title.replace(/^[!~]/,'');
  const type=/reject|invalid|missing|forg|denied|unauthor|malform|attack|overflow|oversiz|unavailable|fail|tamper|conflict|stale|empty|negative|cross-|without permission|blocked/i.test(title)?'Negative':/boundary|limit|round|precision|zero|maximum|minimum|leap|month-end|year-end/i.test(title)?'Boundary':/concurr|race|atomic|rollback/i.test(title)?'Concurrency':/persist|restart|migrat|restore|backup/i.test(title)?'Recovery':'Functional';
  const n=cases.filter(c=>c.code===code).length+1;
  cases.push({id:`DP-${code}-${String(n).padStart(3,'0')}`,code,module:name,priority,type,title,pre,data:testData||data,steps:steps.split('; ').map((s,i)=>`${i+1}. ${s}`).join('\n'),expected,role:role||'Administrator',status:'NOT RUN',source:sources});
 }
}
section('ENV','Installation and startup','README.md; compose.yaml; Dockerfile; server.js; server/store.js','Fresh disposable QA database and separate QA backup directory. No production connection.','ENV fixture',`
!Fresh installation starts|Run documented setup and start the QA Compose project; Open application and GET /api/ready|App starts after PostgreSQL is ready. Readiness is HTTP 200, database is postgresql, and a first-run setup screen appears.
!Current schema on fresh database|Start final candidate against an empty QA database; Query schema_migrations and /api/ready|All current migrations through 13 apply once. Readiness and database migration maximum agree. No business data is required.
No default administrator credentials|Open a fresh installation; Try a guessed default login before setup|No default account authenticates. First administrator must be explicitly created.
Setup without demonstration records|Complete setup with demo=false; Inspect customers, quotations and dashboard|No demonstration customer or quotation is created. Sample catalog is identified for business review and does not imply approved prices.
Setup with demonstration records|Complete setup with demo=true in another empty QA database; Open dashboard and quotations|Demonstration records are internally consistent, owned/scoped correctly, and seven-day expiry applies. No outbound message is sent.
!Concurrent first setup|Submit two valid first-admin requests concurrently to one empty database|Exactly one setup commits. Other request receives conflict. One initialized workspace and one intended initial administrator remain.
Setup cannot repeat|Finish setup; POST /api/auth/setup again with different identity|HTTP 409. Existing account, workspace, numbering and records remain unchanged.
Missing database configuration|Start isolated app without usable PostgreSQL configuration|Startup fails with actionable configuration error. No SQLite fallback or fabricated successful readiness occurs.
Database unavailable|Stop only the disposable QA database; Request readiness and a saved page; Restore QA database|Readiness fails while unavailable. UI offers a recoverable error and retains entered drafts. Recovery restores real data.
!Persistence across app restart|Create customer and quotation; Restart QA app container; Log in again and inspect records|IDs, versions, prices, snapshots, sequences and data persist. Application restart does not reseed or erase them.
Persistent volumes across recreation|Recreate only QA application service with documented Compose options; Inspect records and backup list|Database and backup volumes retain data. No sample reset or duplicated catalog occurs.
Production assets match candidate|Build candidate assets; Compare served JS/CSS hashes with candidate dist files; Hard reload|Served assets match the reviewed build and required scripts load without browser exceptions.
Health and readiness are read-only|Record data versions and status histories; Request /api/health and /api/ready repeatedly|Successful checks return actual PostgreSQL/schema state without changing business records or consuming quotation numbers.
~Unsupported runtime detected|Attempt documented development startup under an unsupported Node version in an isolated shell|Runtime requirement is clear. QA records unsupported runtime separately and uses Node 24.14+ for release acceptance.
`);
section('AUTH','Authentication and sessions','server.js; server/accounts.js; tests/api.test.js; tests/backend.test.js','QA initialized. A1, E1, E2 and inactive E3 accounts provisioned.','ACCOUNTS fixture',`
!Valid sign-in|Enter E1 username and valid password; Submit; Reload page|E1 signs in once. Authorized landing page and own records load. Reload retains the authenticated session.|E1|Employee E1
Invalid credentials|Try wrong password and unknown username|Both fail with generic HTTP 401 and no session. Error does not reveal whether the account exists.
Inactive account denied|Deactivate E3; Attempt login using its correct password|Login fails and no usable session is issued.
Username normalization|Sign in using permitted uppercase and surrounding whitespace variants of E1 username|Normalized username resolves consistently without creating another identity or broadening access.
Required login fields|Submit empty username, empty password and whitespace-only username separately|Inline/API validation prevents authentication. Existing form remains usable.
Password minimum and maximum|Set test password lengths 11, 12, 128 and 129 through setup/account paths|12 and 128 valid characters are accepted. 11 and 129 are rejected without partial account changes.|Synthetic generated passwords; never use real credentials
!Password storage|Create account with known synthetic password; Inspect permitted QA database/account export and logs|Database stores a salted hash rather than plaintext. API, business export, browser storage and logs do not expose password/hash.
!Cookie protections|Inspect login Set-Cookie locally and in QA HTTPS configuration|Session cookie is HttpOnly, SameSite=Strict and Path=/. Secure is present when COOKIE_SECURE=true. Authentication data is not placed in localStorage.
!Logout revokes copied cookie|Copy QA session cookie securely in the test harness; Log out; Retry authenticated request with that cookie|Logout clears browser cookie and server session. Replayed cookie receives 401.
Session expiry boundary|Create controlled session just before and after 12-hour expiry; Request protected resource|Unexpired session works. Expired session is rejected and protected records are not returned.
Multiple sessions|Log in E1 in two browser contexts; Open own session list|Only E1 sessions appear with usable identification. Other users' sessions are absent.
Revoke another owned session|From E1 context A revoke E1 context B session; Retry protected request in B|B becomes unauthorized. A remains usable and session list reflects revocation.
Cross-user session deletion denied|As E1 submit E2 session ID to session-delete endpoint|Request cannot revoke or enumerate E2 sessions. E2 remains signed in.
Revoke all other sessions|Log E1 in three contexts; Use revoke-other-sessions from A|B and C lose access. Current session A remains authorized.
!Change own password|Enter current password and compliant replacement; Submit; Try old and new passwords and old cookies|Old password and previous sessions fail. New password and replacement session work. Password-change audit is recorded.
Incorrect current password|Attempt password change with incorrect current password|401 with no password/session change. Existing legitimate login still works.
Temporary password rotation|Administrator resets E1 password; Login with temporary value; Attempt business write; Change password|Rotation is required. Business writes are denied until rotation. After valid change, permitted work succeeds.
!Login throttling|Exceed documented configured bad-login threshold in QA; Retry on a second app instance|HTTP 429 applies persistently across instances. Successful authentication after allowed recovery remains possible.
Password field privacy|Type password on login/change-password forms; Inspect visual masking and network payload destination|Password is masked and sent only to intended same-origin auth endpoint. It is absent from URLs and UI error text.
!CSRF missing or wrong|Use valid session to POST/PATCH/DELETE business records without token and with wrong token|403. No business/audit-dependent write or revision change occurs.
!Foreign origin denied|Submit authenticated write with hostile Origin; Try allowed exact configured origin|Foreign origin fails. Allowed origin with valid token follows normal permissions.
Expired session while editing|Open unsaved customer/quote; Expire/revoke session; Attempt save|No unauthorized record commits. Sign-in guidance appears without falsely reporting success or discarding draft silently.
Access change revokes sessions|Change E1 permissions while E1 has open pages; Retry API and refresh|Old sessions are revoked. Re-login receives current effective permissions and UI navigation.
Two-account response race|Delay E1 request; Log out and sign in E2; Release delayed E1 response|E1 response cannot populate E2 page or clear E2 session. E2 data and identity remain authoritative.
Authentication checked before parsing|Send malformed filters to protected endpoints while anonymous|Authentication fails before returning scoped data or privileged parsing details.
`);
section('SEC','Authorization and company isolation','server/access.js; server/resources.js; server/accounts.js; tests/access-whatsapp.test.js','A1, E1, E2, limited accounts and two separate company databases.','ACCOUNTS + COMPANY-B fixtures',`
!Employee default scope|Log in E1; Inspect dashboard, list, detail, reports, state and search|Only own permitted quotations/reports appear. Customers follow shared-company customer permissions.|E1 owns Q1, E2 owns Q2|Employee E1
!Known foreign quotation ID|As E1 request Q2 detail, PDF, preview, history, duplicate, reprice and status|Every path enforces immutable owner scope. No Q2 data or write is exposed.|Q2 owned by E2|Employee E1
!Immutable creator ID|Forge createdBy, by and owner fields when creating or updating a quote|Server assigns creator on create and preserves existing immutable ownership on edit. Display salesperson cannot transfer ownership.
Changing display name preserves scope|Rename E1; Inspect its old quotations and reports|Old ownership follows account ID. Display-name change does not orphan records or expose E2 data.
Unresolved legacy owners|Load legacy quote with ambiguous creator; Compare E1 and A1 access|Legacy unknown ownership stays administrator-restricted rather than being guessed from duplicate names.
Explicit empty permissions|Assign E1 permissions=[]; Re-login; Attempt business APIs|Empty list removes default grants. It does not fall back to Employee defaults.
Reset permission overrides|Assign E1 permissions=null; Re-login|Effective permissions match documented Employee defaults exactly.
Invalid permission identifiers|Submit unknown, duplicate and incorrectly typed permission lists|422. No access changes or session grants are committed.
!Delegated manager escalation denied|Grant limited users.manage account; Attempt to grant missing privileges or edit Administrator|Account cannot elevate beyond its own allowed access or modify more privileged users.
Pricing data redaction|Use product.manage account lacking pricing.view/manage; Inspect state/catalog/products/settings/templates and embedded snapshots|Master rates, tiers, charges, approval flags and private tax/discount defaults are omitted. Authorized saved quote totals remain visible.
Omitted private prices retained|As metadata-only catalog manager rename existing label and save redacted product|Hidden rates/approvals persist exactly. Metadata update succeeds only within product.manage authority.
Explicit hidden price forgery|As metadata-only manager submit a changed rate, tax, rateBasis or approval flag|Pricing permission check rejects the write and rolls back metadata and revision too.
New unpriced option stays pending|As metadata-only manager add a safe option label|Option has null price and approved=false. It cannot become a free approved choice or selectable paid option.
!Cross-company cookies|Replay Company A cookie to Company B app with separate database|Session is not accepted and no Company A/B private data crosses the boundary.
!Cross-company identifiers|Use known A customer/address/category/logo/field/quote IDs in B requests|IDs cannot retrieve or mutate another company's records even when same-looking IDs exist separately.
Client-selected tenant denied|Add tenantId, database, schema or ownership selector to strict API requests|Unsupported selectors are rejected. Server connection and company scope remain authoritative.
Permission revoked in-flight|Pause a write before transaction lock; Revoke grant; Resume write|Commit-time authorization fails. No now-forbidden data mutation or dependent audit commits.
Direct URL access denied|Hide restricted navigation then enter corresponding page hash and API URL manually|Backend denial remains effective. Restricted page cannot reveal cached privileged data.
Read-only role cannot mutate|Give role only view grants; Attempt UI and direct create/edit/delete APIs|Views respect scope and every unsupported write is denied without data changes.
`);
section('NAV','Navigation and shared controls','public/workspace-ui.js; public/dropdowns.js; public/backend-ui.js; public/index.html','A1 and E1 available; browser cache cleared for candidate.','VIEWPORTS fixture',`
!Main navigation|Open every permitted sidebar entry; Return to Dashboard with header logo|Correct page renders, active navigation matches, and no unexpected JavaScript error occurs.
Deep links and refresh|Open saved permitted page hashes directly; Refresh and use Back/Forward|Page and applicable filters restore consistently. Authentication/permissions remain enforced.
Global search|Search known quotation number and customer name; Open result|Authorized matching result opens correct existing record. Customer result requires customer.view.
Literal global search|Search %, _, backslash, apostrophe and no-match text|Characters are literal, no SQL expansion/injection occurs, and empty result is clear.
Global search privacy|As quote-only account search customer contact/private-note markers|Customer lookup is absent without customer.view. Lookup never returns notes, contact data or addresses.
Global search limits|Try empty q, 200/201 characters, and pageSize 10/11|Empty search returns empty arrays. Valid limit works and excessive values fail validation.
Dropdown search and selection|Open searchable customer/product picker; Type, clear and select with keyboard|Matching entries update and selection retains stable entity ID. No unintended form submission occurs.
Dropdown long and empty options|Open picker with long labels, no options and many options|Labels remain readable. Empty state is usable and long list scrolls within viewport.
Modal focus and close|Open shared dialog; Tab/Shift+Tab; Cancel and Escape|Focus stays in dialog and returns to invoking control. Cancel/Escape do not save draft changes.
Rapid navigation during request|Delay page fetch; Navigate elsewhere and release response|Detached page is not updated, no exception occurs, and current page stays usable.
~Browser reload and asset caching|Reload ordinary and hard-refresh candidate in separate browsers|Current assets load consistently and persisted records remain accurate. No stale mixed-script crash occurs.
`);
section('DASH','Dashboard','server/dashboard.js; public/workspace-ui.js; tests/dashboard-api.test.js','Seed controlled Q1-Q8 statuses, two owners, stored totals and due dates.','DASH fixture',`
!Real-data KPIs|Open dashboard without demos; Add a controlled quotation then reload|Empty workspace shows zero. Counts and quoted value change by exact saved records, with no synthetic fallback.
All-status value total|Sum saved grand totals across selected statuses independently; Compare quoted value|Dashboard sums stored paise across all selected statuses and labels value as quoted value rather than collected revenue.
Status cards|Compare total, Draft and pending-review KPIs to controlled rows|Each count matches current scoped database records, including zero states.
Date range endpoints|Filter from/to dates containing boundary records|Both calendar endpoints are included. Outside dates are excluded.
Combined filters|Apply customer, creator employee, status, salesperson, q and amount filters|Filters combine consistently and all KPIs/recent/attention/activity respect applicable scope.
Invalid dashboard filters|Send impossible dates, reversed range, malformed ID and invalid status|422 with no fabricated metrics. UI offers corrective action and does not display stale values as current.
Recent quotation ordering|Create tied dates/numbers in fixture; Inspect recent list|At most six matching records appear in date/number/ID descending deterministic order with saved totals and correct links.
Pending review attention|Create pending quote and repeat review transition; Open attention card|Pending quote appears once, latest review timestamp is used, and no invented overdue threshold is shown.
Independent approval indicator|Compare creator A1 and second authorized approver on A1 pending quote|Can-review action respects independent approval for both roles. Dashboard read changes no status.
Expiry attention boundaries|Set eligible quotes valid today, +7, +8 and already expired; Include Draft and terminal states|Today through +7 appear when eligible. +8, Draft and terminal states do not. Pending review appears once by review reason.
Timezone calendar|Set supported QA TZ then invalid TZ; Test near midnight boundary|Dashboard today uses valid configured timezone or Asia/Kolkata fallback. Calendar filtering remains consistent.
Owner scope versus reports grant|Use view_own plus reports.view_all account; Open dashboard|Reports grant does not broaden dashboard quotation visibility beyond own quotation grants.
Quote-only viewer|Remove reports and customer grants while retaining quotation viewing; Open dashboard|Dashboard remains usable under quotation grants and does not fetch unauthorized customer master/address information.
Dashboard read immutability|Fingerprint quote versions/history before and after repeated reads|No status, pricing, sequence, version or business snapshot changes occur.
Dashboard request failure|Inject 503 then restore; Select Retry|Clear error appears without invented zero-success. Retry loads correct current metrics.
`);
section('CUS','Customers','public/customer-ui.js; server/customer-api.js; server/customer-details.js; server/validation.js','Customer editor permission; categories and approved dummy contact data.','CUSTOMERS fixture',`
!Create minimal customer|Open Add Customer; Enter mandatory details; Save and reopen|One active customer with stable ID/version is created. Status control is absent from Add/Edit UI.
Full customer data roundtrip|Enter name, company, contact, independent phone, mobile, WhatsApp, email, GSTIN, billing and notes; Save/reopen|Each field retains intended value and independent phone numbers are not overwritten by one another.
Status preservation on edit|Open an inactive legacy customer; Edit company without status field|Existing inactive status remains unchanged. Omission does not reactivate it.
Customer category optional|Save uncategorized customer|Save succeeds and does not create a category or fabricate category discount/highlight.
Other category free text|Choose Other; Try blank custom description then valid text|Blank required description is rejected. Valid description is customer-owned text rather than a new managed category.
Changing Other clears text|Save Other customer; Change to managed category and then Uncategorized|Old custom category description is cleared and association follows current selection.
Contact phone normalization|Save 8-digit and 15-digit numbers with permitted +, spaces, parentheses and hyphens|Valid input normalizes consistently. Primary mobile/WhatsApp remain independent.
Invalid phone boundaries|Try 7/16 digits, letters, invalid plus placement and control characters|Validation rejects malformed optional phone values without partial save.
Duplicate contact review|Create same mobile, WhatsApp, email or GSTIN as existing customer|Conflict identifies review requirement. No second record is created until explicit duplicate review.
Explicit duplicate acceptance|Review duplicate warning; Save with explicit allowDuplicate|Exactly one intended second record commits and remains separately identifiable.
Rejected duplicate keeps draft|Trigger duplicate conflict with filled address drafts|Form retains entered data and does not lose addresses or silently overwrite existing customer.
Case and literal search|Search mixed case names, company, supported contact values and SQL metacharacters|Correct literal matches appear within customer permissions and no wildcard/injection expansion occurs.
Customer pagination and sorting|Create more than one page; Sort name and updated time; Change page|Counts, order and pages are correct and stable with no repeated/missing customer IDs.
!Version conflict|Open same customer in A1 and E1; Save A1 then stale E1 draft|Stale save returns 409. Winning change remains and losing draft can be reviewed/reloaded.
Missing version|PATCH/DELETE known customer without version or If-Match|428 and no record change.
Delete unreferenced customer|Create unused dummy customer; Confirm deletion with current version|Customer is removed and unrelated records persist.
Referenced customer deletion blocked|Try deleting customer linked to saved quotation|Dependency is explained. Customer and quotation history remain intact.
Customer quotation history|Open known customer history as permitted E1 and A1|Only quotations visible to actor appear. Saved amounts and links match scoped records.
Unsafe customer text|Save permitted literal HTML/script-like text in name/company/notes; Open list/edit/preview|Text is escaped. No script runs. Internal customer notes never reach customer documents.
Maximum text fields|Use schema maximum and maximum+1 for each customer text field from API schema|At-limit values roundtrip. Excess input receives specific validation without silent truncation.
!Atomic customer save|Inject QA persistence failure after customer write but before related addresses/audit|Customer, addresses, revision and dependent audit all roll back together.
Double-click save|Double-click Save with delayed response|UI submits one intended create and reports one result. Customer is not duplicated.
Late modal response|Save while switching/closing customer modal; Open another customer before response returns|Old response cannot overwrite new modal state or throw detached-DOM errors.
Legacy partial update|PUT legacy-compatible payload omitting category/contact/address metadata|Saved newer metadata, addresses, billing and status survive omission according to compatibility contract.
`);
section('ADR','Delivery addresses','server/customer-details.js; server/customer-api.js; public/customer-ui.js; tests/customer-details-api.test.js','Two customers C1/C2 with independent addresses; permitted editor.','ADDRESSES fixture',`
!Customer and addresses create together|Add new customer with two address drafts and one default; Save|Customer and both owned addresses commit in one transaction with stable generated IDs.
Required address parts|Omit each required structured address component in turn|Invalid address is identified. No partial customer/address commits.
Default address switch|Set second active address as default; Reopen customer|Exactly one active default remains. Previous default is cleared atomically.
Selection defaulting|Save new customer with marked default and omitted selected address|Default becomes selected according to canonical rule and billing stays separate.
Explicit selection clearing|Set deliveryAddressId=null; Save and perform later unrelated edit|Selection remains cleared and does not silently revert to default.
Archive selected/default address|Archive active selected/default address; Reload customer and quotation picker|Archived address is unavailable for new selection. At most one active default remains and history is retained.
Restore address|Restore archived address and explicitly select it|Same address identity is retained and becomes selectable under that customer.
Omitted addresses preserved|Edit customer using payload that omits saved address rows|Omission does not delete addresses. Archival requires explicit action.
Address pagination|Create 26 addresses; List pageSize 25 then includeArchived=true|Pages/counts reflect customer scope and archive filter. Maximum pageSize 100 is enforced.
Address count limit|Create 100 saved addresses including archived; Attempt 101st|100 is supported. 101st is rejected without modifying existing rows.
!Cross-customer address read|Request C2 address through C1 route|404 or documented ownership denial without returning C2 content.
!Cross-customer address mutation|Assign C2 address ID in C1 save, patch, default and quote selection|All attempts fail. Ownership cannot be reassigned and neither customer changes.
Address version conflict|Edit customer/address concurrently using same parent version|One write wins. Stale write gets 409 and cannot overwrite default/selection.
Address permission denied|Use account lacking customer read/edit grants; Request known and unknown address IDs|Uniform permission denial prevents address enumeration and writes.
!Quotation delivery snapshot|Save Q1 selecting C1 warehouse; Edit/archive warehouse master; View/PDF Q1|Q1 retains its original selected address snapshot. Billing and delivery remain separately labelled.
No unselected address leakage|Save Q1 with one selected delivery from several addresses; Preview/PDF|Only selected snapshot appears. Full customer address collection is absent.
Quote-only live address denied|Use quote-create account lacking customer.view; Submit known/default/foreign live address|New live selection is forbidden including preview/default inheritance. Authorized saved delivery snapshots remain readable.
Historical duplicate delivery|Duplicate eligible quote whose saved address is now archived|Trusted saved delivery snapshot is preserved without granting new live address access.
`);
section('CCAT','Customer categories and logos','server/customer-categories.js; server/customer-category-logos.js; shared/customer-categories.js; public/customer-categories-ui.js','Customer category manager and view-only account; private QA raster fixtures.','CATEGORY fixture',`
Category seeds and repeat startup|Initialize then restart QA database; List managed categories|BNI, YES, JCI, JCOM, Rotary, RMB and Icon Circle seed once. Other remains protected and existing settings are not reset.
!Create category|Add unique category with decimal discount and plain multiline highlight; Save/reopen|Stable category is created with exact configured decimal and intended active/highlight state.
Unique category names and slug|Try case/whitespace-equivalent category name and duplicate slug|Conflict prevents ambiguous identity. Existing category is unchanged.
Protected Other category|Try editing/archiving Other through UI and direct API|Other sentinel remains protected and customer free-text behavior remains valid.
Discount percentage precision|Save 0.00, 12.34 and 100.00 then negative, 100.01 and excess decimals|Valid two-decimal percentages roundtrip exactly. Invalid range/precision is rejected.
No invented seed discount|Inspect fresh seeds before business configuration|Seed discounts are zero and highlights disabled. No assumed commercial offer is introduced.
Highlight length boundary|Save configured maximum text then one extra character|At-limit succeeds. Over-limit is rejected and configured limit is displayed in editor.
Reduced highlight limit|Lower QA limit below existing message length; Preserve, disable then restore existing message|Unchanged historical text can be retained under supported compatibility. New over-limit content is rejected.
Highlight rendering and escaping|Save multiline literal <script> and markup-like text; Preview category and quotation|Text displays safely with intended line breaks. No executable HTML or browser script runs.
Archive and restore category|Archive linked category then restore it|Customer associations and historical snapshots persist. Archived category is unavailable for new live assignment.
Inactive category behavior|Deactivate category with existing customers; Create a new eligible quotation|Inactive category does not produce new automatic highlight/discount policy. Existing documents retain snapshots.
Category search and pagination|Search literal %, _, apostrophe and category name; Move between pages|Filters/paging return correct records without SQL wildcards or duplicate seeds.
Category version conflict|Edit same category in two contexts; Save one then the stale other|409 preserves winning discount/message/logo pointer and losing draft.
!Accepted raster logos|Upload valid PNG, JPEG and WebP separately; Retrieve normalized asset|Each accepted image is decoded and re-encoded as static PNG within limits. Original metadata is discarded.
Logo upload size boundary|Upload valid image at 300000 bytes then above limit|At-limit permitted raster succeeds. Oversize upload is rejected without changing current logo.
Logo dimension and decode limits|Upload excessive dimensions, pixel count, corrupt raster and decompression-heavy input|Bounded decoder rejects unsafe/oversized image. No partial category/asset/audit write remains.
Rejected active image formats|Upload SVG, GIF/animated input, fake MIME and executable payload|Unsupported/invalid image is rejected. No executable content is served.
Logo normalized bounds|Upload permitted large static image with metadata/appended bytes; Retrieve result|Stored PNG is at most 512 pixels per side and 2 MiB. Metadata/appended payload is absent.
!Private logo reads|Read known logo anonymously, as unrelated company, and as authorized reference reader|Only authenticated permitted company readers receive PNG. Headers are private/no-store, nosniff and sandboxed.
Immutable logo replacement|Save quote referencing logo V1; Replace with V2 and remove current logo|Current pointer changes, V1 remains available to authorized historical references, and existing quotation snapshot is unchanged.
No-logo fallback|Remove category logo; Open category lists/customer form|Readable initials fallback appears without broken image or invented document logo placement.
!Logo write rollback|Inject failure between asset insert and category/audit commit|Asset, pointer, category version, audit and workspace revision roll back together.
Category message snapshot|Save quote with enabled message; Edit/disable/archive category; Open saved quote and duplicate|Historical saved highlight and trusted duplicate snapshot remain as defined. New quotes use current eligible policy.
Legacy highlight absence|Open legacy quote lacking categorySnapshot; Attempt forged client highlight|Legacy absence remains. Client cannot insert arbitrary trusted category snapshot during ordinary edit.
`);
section('PCAT','Product categories','server/resources.js; server/validation.js; public/app.js','Catalog administrator with products in at least two categories.','CATALOG fixture',`
Create product category|Add unique category with description, display order and active state|Category persists with stable ID/version and appears in catalog according to active scope/order.
Edit category metadata|Change name, description and order using current version|Metadata persists and linked products keep IDs and category references.
Deactivate category|Deactivate category containing active product; Try new calculation/quote/duplicate|Current eligibility blocks new usage through inactive category. Historical quotes remain readable.
Referenced category delete blocked|Delete category with existing products|Dependency prevents deletion and all product references remain valid.
Delete empty category|Delete unused category with valid version|Category is removed and audited without affecting products in other categories.
Category validation|Submit blank/oversized name, invalid order and malformed active flag|Invalid data is rejected without partial save or coercion into unrelated state.
Category sort and filters|List active/all categories with supported sort/direction|Results match active scope and allowlisted stable ordering.
Stale category write|Save same category from two contexts using same version|409 prevents lost update. Winning category remains intact.
Historical category rename|Rename product category after saved quotation|Saved product/category snapshot labels and report identities remain historical as designed.
`);
section('PROD','Products and catalog readiness','server/product-catalog.js; server/resources.js; shared/pricing-readiness.js; public/products-ui.js','Catalog/pricing managers with independent grants; configured and pending products.','CATALOG fixture',`
!Create configured product|Create product with unique code/category, valid method, approved synthetic rates/GST and required fields|Product saves with stable ID/version. Activation follows backend eligibility and product is quotable only when active/eligible.
Pending product creation|Create inactive product with missing rates/tax intentionally left null|Missing remains unconfigured rather than free zero. Product stays unavailable for new quotation.
Code uniqueness|Try duplicate code with case variants and conflicting manifest identity|Ambiguous product identity is rejected rather than merged or duplicated.
Metadata edit|Rename/reorder existing product fields without changing price data|Metadata persists under product.manage. Existing rate data and quote snapshots remain unchanged.
!Activate incomplete product|Attempt inactive-to-active save with missing mandatory field/rate/GST|422 ACTIVATION_BLOCKED contains actionable authoritative checklist. Product stays inactive.
Approved free zero|Configure approved zero base/option/GST where valid; Activate and calculate|Intentional approved zero is valid and differs from missing null pricing.
Tier product irrelevant base|Create valid tier method with approved tiers and null irrelevant base|Eligibility uses applicable tiers and does not require unrelated base amount.
Existing inconsistent active product|Load legacy active product with incomplete pricing; Open catalog and try new quote|Actual active flag is retained with warning. New quote/calculation is blocked until configuration is corrected.
Catalog readiness badges|Compare complete inactive, configuration-incomplete, pricing-pending and active-ready rows|Configuration/pricing badges are independent. Ready to quote additionally requires active state.
Catalog global counts|Apply name/category/active/readiness filters and change page|Visible rows filter with AND. Global total and attention counts remain global and count each product once.
Catalog search boundaries|Search code/name with trimmed mixed case and 200/201 characters|Supported literal search works. Over-limit query is rejected.
Catalog page clamping|Delete last visible row or narrow filter while on last page|Page clamps to valid bounds. Correct empty state appears with no resurrected deleted row.
Read projection privacy|GET /api/products?view=catalog with and without pricing grants|Only documented compact columns serialize. No full definitions/private rates leak; GST/taxMode are hidden when unauthorized.
Inactive catalog visibility|Compare catalog manager and ordinary permitted reader|Managers can inspect inactive records. New quoting selectors restrict eligibility and ordinary catalog scope.
Delete product with history|Delete permitted product where supported; Open existing quotation/PDF/reports|Historical saved items remain readable. New selection cannot reference deleted product.
!Product write atomicity|Inject constraint/audit failure during edit/activation|Product, related configuration, audit and workspace revision roll back together.
Invalid methods and tax types|Submit unsupported method, tax treatment, units and malformed numeric rates|422 with no client-driven new pricing engine or coercion.
Catalog query volume|Measure page query count with 1000+ QA products|Listing uses bounded count/page reads and compact projection. It does not fetch all quote history or issue per-row queries.
`);
section('TMPL','Catalog templates and preparation','shared/catalog.js; shared/domain.js; server/resources.js; docs/PHASE-4-IMPLEMENTATION.md','Catalog manager plus pricing manager; deliberately incomplete synthetic catalog.','TEMPLATES fixture',`
!Preparation preview is nonmutating|POST /api/catalog/prepare with current revision and no apply; Compare database fingerprints|Plan reports missing/configured/linked entries and issues without changing records, versions, rates, activation or revision.
Explicit preparation apply|Review plan; Apply with apply=true and required permissions|Only missing documented entries are created inactive with rate/tax null and priceConfigured=false. Existing IDs/prices/history persist.
Preparation idempotence|Apply reviewed preparation twice with refreshed revisions|No duplicate products/templates/assignments or price activation occurs.
Preparation permission split|Preview as product.manage only; Try apply without pricing.manage|Preview permitted. Apply denied without combined authority and no partial update occurs.
Stale preparation revision|Preview then edit workspace elsewhere; Apply old revision|409. Plan must be refreshed before explicit application.
Manifest counts|Open checklist with no filters then filter/page it|Required coverage is 40 documented products, including 28 placeholders. Global counts remain global; filteredTotal/page counts reflect filters.
Exact aliases versus ambiguity|Create compatible exact alias then ambiguous duplicate name/code fixtures; Preview preparation|Unambiguous compatible identity is linked while retaining ID/code. Ambiguity is reported without fuzzy merge or duplicate creation.
Four templates supported|Read/edit Print, Area, Stationery and Promotional Gift definitions|Each stable template resolves through canonical shared engine with correct semantic fields and retained local mappings.
Template inheritance and override|Change shared label; Add product-specific full override and disable optional field|Inherited products reflect current metadata when newly used. Override affects only that product and disabled optional field follows assignment.
Invalid template references|Submit unknown/multiple assignments, duplicate mapping, missing local key and client projection metadata|422. Existing product definitions and prices remain intact.
Circular dependency rejection|Create cyclic inheritance or field condition references|Configuration is rejected with useful reason and no partial save.
Template metadata-only save|As catalog-only manager reorder/rename fields while preserving omitted prices|Safe changes succeed with hidden pricing retained. No rates/approval flags leak.
Template price authority|Change rateBasis, eyelet policy or option amount on unassigned template without pricing.manage|403 even with no current products. Entire change rolls back.
Digital service exceptions|Prepare Social Media Poster and Custom Graphic Designs|Physical print fields are disabled and service requirements remain. Actual deliverables/rates require business configuration.
Catalogue mandatory page count|Try missing, optional, conditional, zero or fractional Page Count configuration|Readiness/preparation/new quoting require unconditional required positive whole-number page count.
Bill Book required copies|Try text/optional/conditional Number of Copies and invalid Carbon Sets definition|Admin-managed copies choices remain unconditional and required. Incompatible definitions are reported, never overwritten silently.
ID Card lanyard fields|Prepare ID Card & Lanyard; Configure product-specific lanyard fields|Required documented additions are available and retained without losing existing price/options.
Gazebo pricing basis retained|Assign Area template to Gazebo / Kiosk; Compare method before/after|Area dimensions reuse template but existing unit method is retained. Commercial measurement/pricing decision remains explicit.
Checklist filters and validation|Combine category, status, template, search and pagination; Try unsupported values|Results and filtered totals match. Invalid filters return 422. Conflict and pending-price states remain distinct.
Startup does not prepare catalog|Restart existing workspace without applying preparation|Product count/configuration/activation/prices remain unchanged apart from documented idempotent registry migration metadata.
`);
section('DFLD','Dynamic fields and inline customization','server/dynamic-fields.js; server/field-registry.js; shared/dynamic-values.js; public/dynamic-fields-ui.js','A1, limited fields manager, E1; editable descriptive customer/quotation fields.','DYNAMIC fixture',`
!Administrator Edit Mode|Toggle Edit Mode OFF/ON on business page; Open approved inline editor|Controls appear only in supported administrator UI contexts. Ordinary business values and canonical handlers remain intact.
Employee Edit Mode denied|As E1 manipulate UI state and call configuration mutation directly|UI toggle cannot grant authority. Backend fields.manage is independently enforced.
Create descriptive definition|Create named text field at supported page/global scope; Resolve form|Immutable root field ID/key and valid default metadata persist and field appears where adapter supports it.
Seven supported types|Create text, number, dropdown, multi_select, date, checkbox and textarea; Save valid business values|All seven types normalize correctly with values stored under immutable rootFieldId and server-owned snapshots.
Text maximum and control bytes|Save text at configured maximum then maximum+1 and disallowed controls|At-limit text persists. Excess/control-byte input is rejected without silent truncation.
Numeric boundaries|Save -1000000000, 0, 1000000000 then out-of-range/string/NaN-like payload|Finite numeric endpoints are allowed. Wrong types/nonfinite/excess values fail and cannot affect pricing.
Real date validation|Save leap-day valid date then 2026-02-29, 2026-02-30 and wrong format|Only real ISO calendar dates persist.
Required checkbox|Save required checkbox false, omitted and true|False/omitted fail required rule. True persists as boolean.
Dropdown value identity|Rename display option then save its original immutable value key|Label change does not replace stored identity. Valid current option persists.
Multi-select boundaries|Save unique choices up to limit; Submit duplicate, foreign and >100 choices|Only unique valid choices within limit persist. No coerced or foreign values enter record.
!Editor all-option contract|Save combined field/options editor with each existing option ID exactly once|Label, required state and complete option ordering commit atomically with one version/revision and audit.
Missing existing option rejected|Omit an archived or active option ID from combined editor save|Invalid incomplete replacement is rejected. Existing options are not deleted by omission.
Immutable option identity|Attempt to change option ID/value, field key, root owner or policy|Canonical immutable identities and protected metadata cannot change.
Option archive is permanent|Archive option then attempt archived=false, isActive=true and reuse of its value key|Archived key cannot be restored, reactivated or reused. HTTP 409 rejects attempted restoration while trusted saved history retains its immutable option.
!Open-form archived choice|Open customer/quotation draft; Archive selected new choice elsewhere; Save draft|422 rejects newly unavailable selection. Draft entries remain and user chooses a current option before saving.
Retain already saved archived choice|Archive choice selected on saved record; Make unrelated edit|Trusted saved value/snapshot remains and is shown as saved/unavailable for new selection.
Forged historical snapshot|Create new record claiming archived choice with client customFieldSnapshots|Server rejects unavailable choice. Client snapshot cannot grant grandfathering or rewrite labels.
Required field added later|Add required field after old record is saved; Edit old record unchanged; Create new record|Unchanged old record remains compatible. New/changed values satisfy current required definitions.
Inactive or hidden saved values|Hide/deactivate field with persisted values; Perform unrelated record edit|Prior values/snapshots survive without exposing field for new entry.
Scope resolution|Define same field root global, page override and valid product override; Resolve each scope|Whole-field resolution follows product then page then global. No option-array merging or cross-page bleed occurs.
Inactive override semantics|Deactivate or hide applicable override; Resolve inherited field|Override remains selected with inactive/hidden state. It does not fall back to active parent defaults and is not offered for new input. Saved values remain retained.
Cross-product scope denied|Use another product's root/base/options in product override/editor request|Foreign ownership is rejected and no configuration value leaks or mutates.
!Version conflict preserves draft|Save same definition in two admin contexts; Submit stale second draft|409, winning definition remains, Save is disabled for conflict and explicit Reload adopts current version without silently discarding losing draft.
Missing field version|Mutate definition/options without current version|428. No definition, option, audit or revision change.
!Atomic editor failure|Inject option/audit/order persistence failure halfway through editor save|All definition/option/version/order/cache revision/audit changes roll back together.
Configuration history|Make changes as A1 then A2; Inspect paginated before/after history|Correct actor/time/action/before-after and order appear. History is read-only and survives later archival.
ETag cache revalidation|Fetch config then conditional request; Change definition then revisit page|Unchanged authorized request returns 304 without body. Changed revision returns current configuration on revalidation.
Cache authorization before 304|Cache response then revoke permission or use different user/company|Cached validator cannot bypass current access. No unauthorized 304 or configuration disclosure occurs.
Parallel batch coalescing|Open form with many configured controls; Observe requests|Shared pending requests coalesce. Field configuration loads in bounded batches rather than one request per dropdown.
Staff metadata stays private|Save customer/quotation custom fields; Preview/PDF/print/WhatsApp content|Staff-level custom metadata is excluded from customer-facing projections and does not change financial totals.
Finalized custom fields immutable|Submit non-Draft custom-value change including replacement line ID|Backend rejects new finalized custom values. Historical labels/values and prices remain unchanged.
Trusted duplicate snapshots|Duplicate quote with retired descriptive selections through canonical action|Trusted source values/snapshots may be retained under duplicate rules. Current required fields and product eligibility remain enforced.
Reset and Cancel editor|Change label/options/order; Use Reset then Cancel and reopen|Reset restores intended local saved state. Cancel commits no configuration or ordinary business record.
Management search and paging|Filter definitions by supported page/type/scope; Inspect next page/history|Only permitted matching definitions appear with correct totals and bounded pages.
Definition and option limits|Reach 500 generic definitions and 100 options including archived; Try one extra|Current configured engine limits are enforced with useful errors and no partial insert.
`);
section('PFLD','Product fields and display bindings','server/product-field-values.js; shared/product-fields.js; public/product-fields-ui.js','Two eligible products with different native/custom fields and saved item snapshots.','PRODUCT-FIELDS fixture',`
!Open product Edit Fields|Open manager from product actions, product editor and quotation configurator|Same central manager opens for selected stable product. Existing action order and session Edit Mode behavior remain correct.
Initialization is idempotent|Open product manager twice; Compare canonical product/rates and bindings|Bindings initialize/synchronize once without modifying rates, canonical definitions, templates or quotation bodies.
Independent product roots|Create same-labelled custom field on P1 and P2|Distinct product-owned identities/options exist. Editing P1 does not alter P2.
Native label changes preserve pricing|Rename native field/option display label; Calculate same canonical cfg before and after|Price, native strings, charge rules and compatibility remain identical. UI uses new display label for new selections.
Native protected edits denied|Try changing native requiredness, activation, priced values and bindings via generic APIs|403/validation enforces canonical product/pricing editor authority. Labels alone cannot create priced variants.
New priced option synchronization|Add approved variant via canonical pricing workflow; Reopen Edit Fields|New canonical option synchronizes once. Existing customized labels/order survive.
Custom descriptive price neutrality|Add number/text/custom options and change values on Draft line|Values persist in item customFields/snapshots and never enter cfg, charges, discount or GST arithmetic.
Public item custom specifications|Save explicitly public native/custom specification then change its label|New document uses saved labels/choices. Old saved item output retains original snapshots. Internal fields stay excluded.
Product field order|Drag/reorder and use keyboard Move up/down; Save and reopen|All owned IDs appear exactly once in persisted order. Reset restores saved order and keyboard actions work.
Invalid product reorder|Omit ID, duplicate ID, use foreign product ID or stale version|Whole reorder fails with appropriate error and no partial version/order/audit changes.
Product definition limits|Reach 100 owned fields including bindings; Try 101st and excessive global direct roots|Per-product and company limits are enforced. Existing canonical controls remain usable.
Legacy oversized bindings skipped|Open manager for native label >150 chars or >100 choices|Unsupported binding is skipped safely. Original canonical control and calculation remain available.
Compound controls retained|Customize main size/dimension caption; Use real size breakdown and geometry controls|Compound input structure and canonical pricing are unchanged.
Configurator product switch race|Delay P1 config then switch to P2; Release P1 result|P2 fields remain current. No P1 controls/options/values leak into P2 selection.
Configuration loading and retry|Fail product config fetch then retry while draft filled|Failure is visible, draft retained, and successful retry loads correct product fields.
Historical unchanged line|Add new required product field and change rates; Edit saved line without priced changes|Unchanged historical line retains trusted configuration, price and saved labels under compatibility rules.
Changed priced configuration|Change priced specs on Draft line after rate update|Current canonical validation and pricing apply. Old unchanged lines remain historical.
Line batching|Save quote with many lines/products; Measure configuration reads|Definitions/options/bindings resolve in bounded batches, at most three configuration queries, not per-line queries.
`);
section('PRICE','Pricing calculations and product rules','shared/domain.js; server/validation.js; server/resources.js; tests/domain.test.js; tests/srs-domain.test.js','Synthetic approved rates only. Independently calculate expected paise before running.','MONEY fixture',`
!Per-unit calculation|Configure unit rate INR 100, qty 2 and GST 18% exclusive; Calculate/save|Subtotal INR 200.00, GST INR 36.00, grand total INR 236.00 (23600 paise).
Quantity tier boundary|Configure tiers 1=100, 10=90, 100=80; Calculate qty 9,10,11,99,100|Applicable configured breakpoint rate is used consistently. Boundary quantities do not skip or double-apply tiers.
Tier definition validation|Submit unsorted/duplicate/nonpositive breakpoint, negative rate and >100 tiers|Invalid tiers are rejected. Valid tiers must cover minimum quantity.
Area square feet|Configure 2 ft by 3 ft, qty 2, rate INR 10/sq ft, GST 0|Area 6 sq ft per piece, 12 billable sq ft, subtotal/grand INR 120.00.
Equivalent dimension units|Calculate same 1 sq ft area using 1ft,12in,30.48cm,0.3048m sides|Equivalent dimensions yield same canonical area and money within engine rounding at defined boundaries.
Fixed price method|Use fixed method synthetic INR 500 and allowed quantity input variations|Fixed amount follows canonical method once rather than arbitrary per-unit multiplication. Server normalizes package quantity as defined.
Package method|Use package product with defined package amount/options; Calculate and save|Configured package base and only applicable option charges apply. UI/backend/saved breakdown agree.
Base-plus-options method|Configure approved base INR 100 and fixed option INR 50; Calculate with and without option|Base and applicable options add exactly once. Required option validation remains active.
Separate tier method|Create explicit tier method with valid bands and no irrelevant base; Calculate around boundary|Tier pricing follows configured minimum/breakpoints. Null irrelevant base does not block eligible tier product.
Minimum quantity|Set minQty=10; Calculate/save qty 9,10 and 11|9 is rejected. 10 and 11 follow same canonical minimum/tier rules.
Quantity boundary and types|Try 0, -1,1,1000000,1000001,1.5 and string quantity|Only JSON whole-number quantities 1..1000000 within product rules pass.
Dimension boundary and types|Try 0,-1,10000,10000.01, string width and invalid unit|Positive numeric dimensions at most 10000 with canonical units pass. Invalid dimensions/units fail.
Size-breakdown derived quantity|Set S=2,M=3,L=0 on approved size product; Try forged qty=99|Canonical quantity is 5. Forged mismatch is rejected/corrected by canonical normalization before pricing, never priced as 99.
Size boundary validation|Submit unknown size, negative/fractional count, all zero and sum above 1000000|Invalid size quantities are rejected. At least one available whole-number size quantity is required.
Size surcharge|Configure XL surcharge INR 20/unit; Enter S=2,XL=3 with base INR 100|Base INR 500.00 plus size surcharge INR 60.00. Saved quantity is 5.
Single and multiple option charges|Select approved options with fixed, per-unit, percent-base and per-area charges|Each charge uses configured basis exactly once and breakdown reconciles to subtotal.
Conditional charge|Define applicable ALL/ANY charge conditions; Toggle satisfying and non-satisfying values|Charge applies only when condition is true. Hidden stale inputs do not trigger charges.
Conditional fields ALL and ANY|Create Equals/Not Equals grouped conditions; Change parent selection|Required/visible validation matches ALL/ANY semantics in UI, calculation, preview and save.
Condition reference validation|Submit missing field/option, self-reference and cycle in conditions|Definition is rejected with no partial save or unresolvable form.
Numeric conditional field|Use visible required numeric field with min/max/integer constraints|Only visible applicable values are required. Numeric constraints reject out-of-range/fractional inputs accurately.
Compatibility rules|Select prohibited option combination then a supported combination|Unsupported combination is rejected by backend. Supported one calculates and saves.
Custom option approval|Select permitted custom finish with approved explicit charge; Try unapproved/null custom charge|Approved custom value/charge follows schema. Pending custom option is blocked, never silently free.
Disabled or unapproved option|Forge unavailable option in pricing/preview/create/duplicate|Every new configuration path rejects it. Old trusted unchanged line remains historical.
Visiting Card standard/custom geometry|Select configured size then custom width/height; Toggle lamination|Geometry and applicable compatibility/lamination charges follow canonical rules. Stale hidden dimensions are not reused incorrectly.
Flex material and printing rates|Select material/printing choices with approved area rates|Configured material/printing rates add to existing base according to rateBasis, without double multiplication.
Flex included eyelets|Choose finishing option marked includesEyelets=true|No separate eyelet double-charge occurs. Named finishing policy remains authoritative.
Flex separate eyelets policy|Configure approved spacing/corner count policy; Calculate known perimeter at qty 2|Per-piece and total derived eyelet counts match independent configured-policy calculation and canonical units.
Flex pending eyelet policy|Keep separate policy unapproved; Try selecting chargeable eyelets|New quoting is blocked with actionable pricing approval message. No assumed counting rule is used.
Accessory quantity|Configure ropes/stands per-piece quantity 3 with product qty 2|Charge quantity is 6 and valid derived quantity appears. Zero/fractional/excess accessory quantities fail.
T-shirt named print locations|Select approved Front and Back then disabled/unapproved location|Only approved named locations charge once. No inference from old count-only location field occurs.
Logo Design paid extras|Configure approved concepts/revisions/source-file extras; Select combinations|Extras use configured quantity/basis/approval and correct total. Pending extras block selection.
Promotional gift template|Quote Paper Bag, Key Chain, Mug, Calendar and Trophy with shared and local overrides|Each product retains its existing options/rates. Shared definitions resolve without replacing local approved values.
!Forged client money|Submit changed totals, base rate, GST, breakdown and charge fields in quotation payload|Server calculates from authorized masters and rejects/ignores forged amounts. Persisted totals match independent oracle.
Money overflow and nonfinite|Use extreme product/charge/quantity values and nonfinite-like JSON input|Unsupported totals fail safely before save. No negative, NaN, Infinity or unsafe integer money persists.
Price override permission|Attempt override without grant then with pricing.override and required reason|Unauthorized override fails. Authorized reasoned override follows existing contract and is auditable without changing master rates.
Price editor Cancel and dirty state|Change rate/tiers/options then Cancel; Reopen; Save intended changes once|Cancel retains saved rates. Save commits reviewed valid changes and no duplicate update occurs.
`);
section('IMP','Excel price template and import','server/pricing-import.js; shared/pricing-readiness.js; public/pricing-ui.js; tests/phase5-api.test.js','Pricing manager; disposable database; generated template and hostile workbook fixtures.','IMPORT fixture',`
!Download price template|Download current catalog template as authorized pricing reader; Open Excel|Workbook has Instructions, Product Pricing, Product Reference and Option Reference. Pending rate/GST cells are blank rather than zero.
Template permission denied|Request template without pricing.view/manage or required catalog access|403 and no confidential reference rates are returned.
Import limits metadata|GET import limits as manager; Compare configured QA upload/row values|Response gives actual maxUploadBytes, maxRows and previewMinutes; UI uses those limits.
!Valid preview is nonmutating|Upload workbook with one approved base and one option update; Review preview; Compare fingerprints|Resolved rows/old/new amounts and accurate counts appear. No rates, history, import audit or workspace revision changes before confirm.
Confirm reviewed preview|Confirm valid previewToken; Reopen rates and import history|All approved rows commit atomically with receipt, actor and old/new values. Quoted historical prices remain unchanged.
Cancel import preview|Close valid preview without confirming; Reopen product|No rate/tax/discount/history write occurs.
Invalid row blocks all|Upload workbook with one valid row and one invalid price|Preview identifies row/field/code/message. No previewToken or partial rate update is issued.
Exact columns|Upload missing, extra, reordered where contract disallows, and duplicate required columns|Invalid schema is rejected with actionable column errors and no mutations.
Mapping by stable code|Rename displayed product label in template but keep valid code; Try unknown/duplicate code|Valid unambiguous case-insensitive code maps existing product. Unknown/ambiguous code fails; names cannot create new products.
Option reference ownership|Use OPTION/CUSTOM/SIZE/CHARGE reference from another product|Mapping fails within selected product. No cross-product rate mutation occurs.
Import cannot create or activate|Submit new product/option identifiers or activation/method/unit changes|Unsupported actions/columns fail. Import never creates products/options or activates existing ones.
Price literals and precision|Try blank, negative, >2 decimals, formula, approved 0 and literal 100.25 Unit Price|Intentional nonnegative literal with <=2 decimals passes. Missing/invalid/nonliteral prices fail and zero is not treated as blank.
GST percentage forms|Import equivalent 18, '18%' and genuine Excel 18% cells|All resolve to 18 percentage points under supported parsing. Out-of-range/nonliteral percentages fail.
Blank GST retained|Update price while leaving GST blank on configured and pending products|Existing GST remains. Blank does not approve previously pending tax.
Blank discount retained|Import price rows with blank Discount Limit|Existing company employee ceiling remains unchanged.
Discount limit authority|Import agreeing changed limit with/without settings.manage; Try inconsistent limits across rows|Changing limit requires settings.manage and one consistent intended global value. Unauthorized/inconsistent workbook cannot partially import rates.
Tier bounds and coverage|Import valid tier, zero/1000001/fractional breakpoints, >100 final tiers and coverage gap|Valid existing-method tiers apply. Invalid limits or missing minimum coverage block import. Omitted tiers remain.
Upload MIME and filename|POST raw XLSX with documented MIME and encoded X-File-Name; Try JSON, spoofed MIME and bad package|Only documented valid raw workbook format is accepted. Filename is safely handled and never used as filesystem path.
Compressed upload size limit|Upload valid workbook at configured byte bound then one byte over|Configured boundary is enforced. Oversize fails with 413 before parsing/retaining file.
Data-row count limit|Preview 5000 data rows then 5001 under defaults|5000 within other limits is supported. 5001 fails with clear configured row-limit error.
Archive expansion attacks|Upload >256 entries, >16MiB entry, >32MiB expanded total or excessive expansion ratio|Parser rejects bounded ZIP attack without extraction, resource exhaustion or partial import.
Sparse address attack|Use huge/sparse XML row and cell addresses in small workbook|Address validation rejects package before expensive allocation.
Executable/external content rejected|Upload macros, encryption, external relationships, entities and formula cells|Unsupported/active/nonliteral content is rejected and never evaluated or fetched.
!Token tampering and session binding|Alter signed previewToken; Confirm from another user/session|403. No rates/history/revision changes occur.
Expired preview|Confirm token after controlled 15-minute preview expiry|410. User must preview again and no import commits.
Stale workspace preview|Generate valid token; Edit workspace elsewhere; Confirm old token|409 blocks stale import. Fresh preview is required.
!Idempotent confirm retry|Confirm token successfully then resend same token|Existing receipt returns replayed=true. No duplicate rates, audit or import history record is created.
Unchanged import receipt|Reupload same approved prices; Preview/confirm|Rows are truthfully unchanged, no duplicate rates appear, and receipt reflects real unchanged action.
!Atomic confirm failure|Inject database/audit/history failure during multi-row confirm|All rates, approvals, global discount, revision, receipt and import audit roll back together.
Permission revoked after preview|Preview as manager; Revoke permission/session; Confirm|Current authority is rechecked. Confirmation fails and no saved rates change.
Protected import history|Page history and inspect receipt as manager then ordinary viewer|Only pricing.manage users read confidential actor/old-new details. Pagination is correct and history is not editable.
Missing prices never activated|Import only base leaving mandatory GST/choices pending; Try activation through REST, changes and state|Authoritative eligibility blocks all inactive-to-active paths until complete. Import does not enable disabled choices.
Historical quotes after import|Save quote, import current rates and inspect saved quote/PDF; Duplicate eligible source|Original totals/snapshots stay unchanged. New duplicate uses current approved rates and current eligibility.
`);
section('QUOTE','Quotation editor and snapshots','public/quotation-ui.js; server/validation.js; server/resources.js; server/store.js; tests/quotation-editor-api.test.js','C1 active customer; eligible products; E1/A1 and independent approver.','QUOTES fixture',`
!Create single-product Draft|Choose C1, valid date and configured product; Add item; Save|One Draft persists with server number/reference/owner/history, canonical totals and customer/company/item snapshots.
!Blank next quotation after save|Save first quote; Inspect editor; Create and save second unrelated quote|Editor returns to blank New quotation. Customer/items/private notes/discounts from first do not leak into second. Two independent records persist.
Multi-product quotation|Add unit, area and fixed products with valid specs; Save/reopen|All intended items/order/configurations persist and summary reconciles without double counting.
Missing customer or empty items|Try saving without customer then without any item|Validation blocks invalid quote with actionable errors and retains other draft inputs.
Inline customer creation|Create customer from editor; Select returned customer; Add item and save|One customer is created and associated. Category/address/default discount follow current authorized selection.
Automatic quotation number|Enter forged no in API; Save; Compare prefix/year/sequence|Number is server-assigned using configured prefix/year/sequence. Client cannot select or reuse another number.
!Concurrent numbering|Save multiple valid new quotes through separate app instances concurrently|Each committed quote receives unique number/reference. No collision or partial quotation exists.
Failed save consumes no number|Record next sequence; Trigger invalid/rolled-back save; Save valid quote|Failure allocates no committed sequence value. Valid quote follows transactional numbering policy.
Deleted number never reused|Delete quote with explicit permission; Create next quote|Deleted quotation number remains reserved and is not reused.
Automatic customer reference|Save new quote and inspect ref; Edit and duplicate|Reference is unique CR/year/sequence assigned on first commit. Edit preserves ref; duplicate receives a new one.
Manual reference removed|Open editor and customer filter areas; Forge ref on new and old quote payloads|No manual reference input or removed All customers filter is fabricated. Server reference policy stays authoritative.
!Fixed seven-day expiry|Set quote date 2026-11-10; Try changing Valid until; Preview/save via UI and direct API|Valid until is read-only and equals 2026-11-17. Forged dates on new/changed records normalize to date+7.
Month-end expiry|Set date 2026-01-28 then preview/save|Expiry is 2026-02-04 across UI/API/PDF, exactly seven calendar days later.
Year-end expiry|Set date 2026-12-29 then save/duplicate|Expiry is 2027-01-05 for the corresponding date and numbering/year remain coherent.
Leap-year expiry|Set date 2028-02-25; Try invalid 2026-02-29|Valid leap boundary yields 2028-03-03. Impossible date fails validation rather than silently shifting.
Legacy validity preservation|Open saved historical quote with older valid date; Edit unrelated field then edit quote date|Unrelated edit preserves stored historical validity. Date/validity edit invokes fixed seven-day rule.
Legacy validity setting ignored|Set old settings.valid to 15 in QA; Create/preview/duplicate quote|New quotation validity remains fixed at seven days through shared domain rule.
Item edit/duplicate/remove|Add two items; Edit first, duplicate second then remove one; Save/reopen|Intended lines and order persist once. Totals recalculate correctly and line IDs remain coherent.
Item cancel retains original|Open existing item configuration, modify then Cancel|Original line configuration/amount stays unchanged.
Required and conditional specs|Omit visible required field; Complete it; Hide a conditional field via parent choice|Visible applicable requirements are enforced and stale hidden choices cannot affect price incorrectly.
Project/subject/requirements text|Save multiline/long allowed text and reopen preview/PDF|Customer-facing fields persist and escape safely within limits. No extra private fields appear.
Quotation internal notes|Save 4000 characters, omit on later edit, explicitly clear, then try 4001|At-limit persists privately. Omission retains, empty clears, excess rejects. Notes never appear in customer preview/PDF/print/WhatsApp auto content.
Private item/customer notes|Add recognizable private markers at item, customer and quotation level; Generate all outputs|Private markers are absent from customer-facing projections/files even with legacy showNotes=true.
Contact override and customer change|Override quote contact; Switch to C2 and save|Inherited override from C1 clears appropriately. Neither customer master is changed by quote contact editing.
!Authoritative preview|Change draft data then preview; Inspect response and compare independent totals|Preview validates/recalculates without save, revision/sequence/history changes or private/raw metadata leakage.
Preview response race|Delay preview for C1; Select C2 and request preview; Release old result|Old C1 totals/category cannot overwrite C2 state. Confirmed financial values reflect latest successful server projection.
Historical master edits|Save quote; Change customer/company/product/GST/category/address; Reopen quote/PDF|Saved historical snapshots, prices, terms, category policy and delivery remain unchanged unless explicit supported refresh occurs.
!Explicit price refresh|Update approved master rate; Refresh prices on eligible saved Draft|Current eligible product prices refresh through canonical path with version/permissions. Ordinary reads never reprice.
Refresh unavailable product|Deactivate product/option; Try explicit reprice|Current availability validation blocks invalid refresh without rewriting saved historical line.
!Duplicate current rates|Save source, change current rates, duplicate source|New Draft/new number/reference uses current approved rates and valid product configuration. Original remains unchanged.
Duplicate ineligible source|Deactivate source product/category or retire priced option; Duplicate|Request fails atomically without consuming number or creating partial duplicate.
Draft-only employee editing|As E1 edit own Draft then own non-Draft with normal default grants|Draft edit succeeds. Non-Draft edit fails under employee edit rules. Explicit administrator/edit_all behavior is tested separately.
Version conflict and recovery|Edit same quote in two contexts; Save one and attempt stale other|409 preserves winning quote, number/history/snapshots. Losing draft remains reviewable and is not blindly retried.
Save network uncertainty|Interrupt response after save commits; Inspect list/detail before explicit retry|UI does not assert failed write or blindly duplicate it. Tester identifies committed record and safely resumes with current version.
Form validation retains work|Trigger validation using late unavailable option or missing requirement|Entered customer/items/notes remain until user fixes problem. No partial quote commits.
Terms edits and omission|Select/reorder/edit allowed customer terms; Save and reopen|Intended public terms snapshot persists. Internal notes are separate and omission does not erase unrelated snapshots.
`);
section('DISC','Discounts, GST and exact money','shared/domain.js; shared/customer-categories.js; server/validation.js; tests/customer-category-quotation.test.js','Synthetic rates and explicitly configured category policies/caps.','MONEY + CATEGORY fixtures',`
!Canonical discount and GST example|Quote 2 units at INR 100, manual 10% discount, 18% exclusive GST and zero charges|Subtotal 200.00, discount 20.00, taxable 180.00, GST 32.40 and total INR 212.40 (21240 paise) agree UI/preview/save/PDF/export.
Fixed discount|Use subtotal INR 200, fixed INR 20, 18% GST|Same total INR 212.40 as equivalent 10% discount. Discount is applied once.
Inclusive GST|Use item total INR 118 inclusive at 18%, no discount/charges|Taxable INR 100.00, GST INR 18.00 and grand INR 118.00. GST is extracted, not added twice.
Exempt treatment|Configure exempt item with nominal stored rate; Calculate/save|GST is zero for exempt treatment and amount is not mislabeled as taxable GST charge.
Mixed tax treatments|Use exclusive, inclusive and exempt lines in one quote with separate charges|Independent integer oracle reconciles discount allocation, tax groups and saved grand total exactly.
CGST/SGST versus IGST|Render same taxable quote with split and IGST presentation|Total tax/grand total remain equal. Labels/components follow saved taxDisplay with no double taxation.
Delivery and other charges|Set delivery INR 100 and other INR 50 with configured charge GST|Charges apply once with saved charge tax treatment. Item discount does not accidentally discount separate charges.
Zero and full discount|Apply 0% and authorized 100% item discount with separate delivery|Zero preserves item value. 100% removes eligible item value only; separate charges/tax remain per policy.
Invalid discounts and charges|Submit negative/nonfinite discounts/charges, percentage >100 or fixed >eligible subtotal|Invalid values are rejected atomically. Total cannot become negative or unsafe.
Employee ceiling boundary|Set approved employee percent/fixed limits; Try exactly at limit and just above|At-limit permitted discount saves. Above-limit is denied unless corresponding explicit authority applies.
Unlimited discount permission|Repeat above-limit attempt with and without quotation.discount_unlimited|Grant bypasses only applicable employee cap and not structural invalidity such as >100% or negative values.
Automatic category default|Configure BNI 10%, select C1 in BNI and quote subtotal INR 200|Category supplies one INR 20 discount replacing prior automatic/default discount. Source/name/percentage/amount snapshot persist.
Category default respects cap|Use category default above E1 permitted ceiling; Preview/save|Backend cap rejects unsupported employee discount. Category selection does not bypass pricing authority.
Manual replacement not stacking|Apply category default then request permitted manual 5%|Existing single discount becomes manual 5%. Category 10% is not added on top.
Customer change clears old discount|Switch from BNI to YES then uncategorized/Other|Current eligible category default replaces old automatic amount. No inherited category discount remains when none applies.
Category refresh on Draft|Change category rate after save; Read quote then explicitly apply category refresh|Read retains old snapshot. Explicit eligible Draft refresh adopts current category policy under existing version/cap checks.
Finalized category refresh denied|Attempt explicit category refresh or forged discount metadata on non-Draft|Unsupported refresh is rejected. Historical discount/total/policy remain unchanged.
Legacy calculation policy|Open unversioned legacy quote, new version-2 quote and duplicate; Attempt calculationVersion forgery|Existing policy is preserved. New/duplicate exact arithmetic is server-owned. Client cannot force historical rounding policy.
!Half-paise decimal rounding|Run exact decimal fixture at rounding ties for tax, percentage and manual discount|Half-up paise rounding occurs at documented monetary boundaries and matches independent rational/integer oracle, not binary float approximation.
Fixed discount penny allocation|Use line subtotals INR 200 and INR 100, fixed INR 1 discount, GST 0|Allocation is 67/33 paise. Net item values are INR 199.33 and INR 99.67; sum is INR 299.00.
Fractional category mixed-tax oracle|Use 101/118/99-paise exclusive/inclusive/exempt lines, category 12.34%, and defined INR 1 charge fixture|For the exact test fixture, discount 39 paise, net products 89/87/87, charge net 100, GST 50 and grand 413 paise match independent oracle.
Import does not reprice history|Import current product/GST/category-adjacent price settings; Read old quote and reports|Saved calculation, item/company/customer/tax/category snapshots remain authoritative.
`);
section('STATUS','Quotation statuses and approval','server/access.js; server/validation.js; server/resources.js; public/app.js','Owned and other-user quotations in all eight statuses; A1/A2 approvers.','STATUS fixture',`
!New quotation is Draft|Create quote while forging Approved Internally and history|HTTP 422 rejects non-Draft creation. A valid Draft gets server-created initial history and cannot inject an approval event.
Status list is canonical|Open status control and direct API schema|Exactly eight supported statuses are available. Generic field customization cannot insert a ninth workflow state.
Submit internal review|Move owned Draft to Pending Internal Review with current version|Status and one history transition save with real actor/time. No email/message is sent.
!Independent approval required|Enable independent approval; Creator A1 attempts self-approval then A2 approves|Self-approval fails even for administrator. Different authorized approver succeeds and history identifies A2.
Approval permission denied|As default E1 request Approved Internally|403 and quote/history/version remain unchanged.
Independent approval disabled|Explicitly disable policy with settings authority; Authorized creator approves|Approval follows explicit current policy. Lacking approval permission still fails.
Sent to Customer action|Set supported Sent to Customer state using status endpoint|One transition saves. No provider delivery, customer approval or automatic email is asserted.
Customer decision separation|Apply Customer Approved then separate Customer Rejected fixture|Each business status is explicit and history is accurate. PDF download/WhatsApp preparation does not create a decision.
Cancelled and Expired display|Open cancelled and expired quotation list/detail/PDF|Saved totals/history remain readable and status is unambiguous.
Ordinary PATCH status tamper|PATCH normal quote fields with a changed status|Ordinary resource update preserves current status. Explicit status action is required.
Invalid status|Submit unsupported state and malformed remarks|422 without status/history/revision changes.
Repeated same status|Send same status twice using refreshed version|No misleading duplicate transition is added for a no-op according to canonical history behavior.
Status version conflict|Change same quote concurrently from two actors|One current-version change succeeds and stale action returns 409 without lost history.
!Selective expiry|Run explicit expiry asOf date against overdue Draft, pending, internally approved, sent and terminal fixtures|Only overdue Pending Internal Review, Approved Internally and Sent to Customer expire. Draft and approved/rejected/cancelled terminal states stay unchanged.
Expiry boundary and rerun|Set valid equal to asOf and day before; Run expiry twice|Only records meeting strict overdue boundary change. Second run adds no repeated history.
Expiry authority|Run bulk expiry without required administrator authority or with stale revision|Request fails and all quotations remain unchanged.
Status remarks privacy|Enter supported remarks with literal hostile markup; Inspect history and documents|History escapes plain text and customer output follows its allowlist. No script or secret metadata is exposed.
`);
section('LIST','Quotation list, filters and pagination','public/quotation-list-ui.js; server/quotation-list.js; shared/quotation-filters.js; tests/quotation-pagination.test.js','At least 45 scoped quotes with tied positions, multiple statuses and boundary totals/dates.','LIST fixture',`
!Default bounded list|Open All Quotations; Observe API and rows|Default is 10 rows per page with accurate range/current/total pages. Entire workspace is not reloaded for page change.
Supported page sizes|Change rows per page through 10,20,30,40|Correct bounded number of rows returns, page resets to 1, and each change makes one page request.
Previous and Next boundaries|Navigate first to last and back|Previous disables at first and Next at last. Range/counts match actual rows.
Direct page controls|Use selector up to 100 pages and numeric jump for larger fixture|Only valid pages are offered. Valid integral jump navigates and invalid/out-of-range input receives correct bounded handling.
Stable tied ordering|Page through tied-position fixture, collecting IDs|Position plus immutable ID order yields no repeated or missing IDs between pages.
!Combined advanced filters|Apply status, salesperson, customer, category, product, inclusive dates and amount range|List count/rows match same backend predicates with AND. Saved GST-inclusive totals drive amount filtering.
Advanced Cancel/Apply|Change advanced draft then Cancel; Reopen and Apply intended values|Cancel leaves active filters unchanged. Apply atomically updates active chips/count/page.
Reset and individual chips|Use primary status, q and advanced criteria; Clear chip then Reset|Individual criterion clears correctly. Reset clears search/all filters and synchronizes page metadata.
Amount equal bounds|Filter min=max=212.40 for exact 21240-paise quote|Exact saved quote is included. Exclusive bounds are not introduced by float conversion.
Invalid list filters|Submit bad date, precision, reversed range, duplicate/unknown parameters|422. Stale result rows/select-page are disabled/cleared and not presented as current matches.
Literal search fields|Search quote number, permitted current customer/company/mobile and historical product names using %, _, slash and quotes|Literal case-insensitive semantics agree between UI/list/export. Internal notes are not searchable.
Category and historical product filter|Archive/rename category/product then filter by stable referenced IDs|Existing associations/history remain filterable. Repeated product lines do not duplicate quote rows.
Empty and one-page results|Filter no matches then use own-only account with no quotes|Range shows 0-0, empty state is clear and page navigation is disabled without invalid page options.
Deleted final-page row|Delete final visible last-page record with permission|Page clamps to remaining valid page, counts update and deleted record never reappears from stale cache.
Count and rows snapshot|Delete quotation from second connection after count but before page read|Current response remains coherent from one read snapshot. Next request reflects deletion.
Rapid search request race|Issue slow old search followed by new search; Release old response|Only newest query paints rows/counts. Selection cannot use stale results.
Browser Back/Forward|Change filters/page/size; Navigate away then Back and Forward|Filter/page/size context restores and bounded backend request matches current URL/history.
Failed page retry context|Fail request on page 3 at size 20; Retry|Requested page/size remain 3/20. Total pages is unknown while failed; retry returns intended page without selecting stale rows.
Boundary keyboard focus|Use keyboard Next onto last page then Previous onto first|Focus moves to usable enabled page selector rather than disappearing to document body.
Row actions regression|From filtered row View, Edit/Save, Duplicate, Status, Delete, PDF, Print and WhatsApp review|Each invokes correct existing record action/permission. Read/download/review does not mutate source quote.
Selection across pages|Select records on page 1 and 2; Change filters; Return|Selection persists within same session. Select-page touches only visible current rows; Clear removes all.
Selection limits and account change|Select up to 1000 then exceed; Log out and log in different user|Limit prevents unsupported selection. Account switch clears all prior selection IDs.
Mobile pager accessibility|Use 320/375/768/1440 widths and keyboard page controls|No unusable pager overflow. Controls/nav have accessible names, total-page association and live range feedback.
`);
section('EXP','Quotation and customer CSV export','server/quotation-export.js; shared/quotation-filters.js; public/quotation-list-ui.js; tests/quotation-export.test.js','Filtered and selected scoped quotes across several pages; export-capable test accounts.','EXPORT fixture',`
!Quotation Details export|Open export, choose approved quotation columns/order and filtered scope; Preview/download|Correct nine-column group choices, order, matching quotation count and all backend pages export with saved amounts.
Customer Details deduplication|Export several quotes for same customer in default Customer Details mode|One row per relationship customer appears with current customer data. Preview distinguishes quote and output-row counts.
Customer quotation-wise mode|Enable explicit quotation-wise Customer Details and quotation-number column|One row per quote appears with correct number and current relationship customer data.
Custom field selection|Choose approved quotation/customer columns only and reorder with keyboard|Selected column order persists; one row per quotation remains even if only customer columns selected.
Selected scope ignores filters|Select quotes outside current filter; Export selected|Exactly selected authorized IDs export and active toolbar filters do not silently narrow them.
All scope ignores filters|Apply narrow filters; Export all authorized quotations|All scoped authorized quotes export. UI clearly identifies scope.
Filtered scope spans pages|Apply filter with >40 results; Export filtered from page 2|Every matching backend record exports once regardless of visible page.
No columns / wrong group|Deselect all; Attempt download; Submit quotation column in customer-only mode|Validation prevents empty/unsupported mode-specific columns rather than emitting misleading CSV.
Select All / Deselect All|Use both controls in each export mode and permission role|Only permitted approved group columns toggle. Customer grants are not bypassed.
!Customer column permission|Use quote-view role without customer.view; Select customer-detail column/type/category filter|Request is forbidden and no customer contact/address data appears. Quotation-safe columns remain scoped.
!Mixed unauthorized selected IDs|Request selected export with one owned ID and one inaccessible/missing ID|Entire selection fails; no partial CSV or record existence leakage is returned.
Unknown/sensitive columns|Submit internal IDs, notes, password/hash, arbitrary JSON path and duplicate columns/IDs|Validation rejects unsupported/duplicate fields. SQL expressions come from whitelist only.
Strict request containers|Send explicit null,false,0 or empty-string filters/selectedIds and unknown keys|Malformed containers fail 422. Omitted optional settings alone receive defaults.
Historical versus current customer|Save quote; Change current customer/company; Export quotation and customer columns|Quotation labels use saved snapshot when present. Customer Details use current relationship data, as named.
Contact columns independent|Use distinct contact-person phone/mobile/WhatsApp; Export all approved columns|All three map independently, with Other category custom text and GSTIN correctly represented.
Active owned delivery export|Create multiple addresses, one archived and one foreign; Export customer addresses|Only active owned addresses appear in newline-separated quoted cell, default first then stable order. No foreign/archive leakage.
!Exact saved total|Export controlled 21240-paise quote after master rate changes|Total remains INR 212.40 including saved discount/GST/charges. Export never recalculates or reprices source.
Validity and dates|Export legacy body lacking valid but stored valid_until present|Authoritative stored validity is exported. Calendar dates use DD/MM/YYYY without timezone conversion.
CSV byte compatibility|Export Unicode, commas, double quotes and line breaks; Inspect raw bytes and open Excel|UTF-8 BOM, CRLF, quoted cells and escaped quotes preserve data. Content-Length matches bytes.
!Formula injection protection|Export cells beginning =,+,-,@ and leading whitespace/control formula text plus international phones|Spreadsheet-trigger text is neutralized with apostrophe. No formula executes when opened in Excel.
Row limit boundary|Export 50000 then 50001 output rows in isolated large fixture|50000 succeeds within byte limit. 50001 returns actionable validation before attachment headers or partial CSV.
Selection limit boundary|Preview 1000 then 1001 distinct selected IDs|1000 accepted within scope. 1001 rejected atomically.
Byte limit and storage error|Force 100MiB bound exceed and temporary directory failure in QA|JSON error precedes attachment headers. No successful-looking partial file, public file or leaked private staging remains.
!Concurrent export limits|Run three users concurrently and duplicate same-user download|At most two active downloads per worker and one per user. Busy requests get 429 while previews remain usable.
Capacity release after error|Cancel/fail download then immediately start next one; Delay old cleanup|Slot is released correctly. Old cleanup cannot release newer job slot or permanently block user.
!Coherent export snapshot|Change customer, delete pending quote and insert new quote during multi-batch export|One download stays on its repeatable-read snapshot. Next download sees new state.
Audit privacy and no mutation|Download then inspect export audit and business fingerprints|Audit holds scope/type/counts/approved keys only. No contacts, filters, selected IDs or CSV body logged; quote versions/prices/history unchanged.
Late export/session race|Start delayed preview/download; Navigate Back or switch user; Release old callback/401|Detached modal is not touched, no exception occurs, and new user's session/data stay intact.
`);
section('PDF','PDF, preview and print','server/pdf.js; server/resources.js; public/srs-ui.js; tests/srs-pdf.test.js','Saved single/multi-page quotes with public/private marker text and historical snapshots.','DOCUMENTS fixture',`
!Protected PDF download|Download owned saved quote PDF; Inspect MIME/filename/header and open file|Response is authorized PDF attachment beginning %PDF. File opens and identifies correct quote, customer and saved totals.
Unauthorized PDF denied|Request known foreign/anonymous quote PDF and retained share PDF|No document bytes leak. Backend ownership and download/share permissions are enforced.
!Document monetary parity|Render controlled discounted/taxed/mixed-charge quote in preview, print and PDF|Saved subtotal/discount/tax/charges/grand total agree exactly, with correct INR formatting.
Company branding snapshot|Save quote with PNG/JPEG logo, GSTIN/contact/footer/signatory; Change current settings; Regenerate|Original saved company details/branding/terms remain historical where snapshotted. Image is readable and not stretched/corrupted.
No-logo and invalid legacy image|Generate PDF without logo and with tolerated legacy invalid image fixture|Document remains readable and does not crash or render broken image data.
!Private note exclusion|Generate outputs with unique quotation/item/customer/internal spec markers and showNotes=true legacy flag|No private markers appear in rendered/text-extracted output or safe preview response.
Explicit public specifications retained|Mark Design Requirements/public spec allowed by canonical schema; Preview/print/PDF|Explicitly public specs survive backend projection and frontend rendering. Client flags cannot expose private fields.
Billing versus selected delivery|Use different billing/selected delivery and several unselected addresses|Both intended labelled snapshots appear, unselected collection does not, and addresses do not overwrite each other.
Category message placement|Save eligible multiline highlight; Render editor/preview/print/PDF|Saved escaped message appears directly above Terms & Conditions. Disabled/empty message produces no box.
No optional category logo invented|Create category logo and inspect quotation output|Only implemented layout elements appear. Logo reference retention does not imply a new decorative category logo placement.
Long descriptions and names|Use long permitted customer/company/product/specification text|Text wraps within margins without overlap, clipping, unreadable font shrinking or broken totals.
!Multi-page PDF|Generate long item table and long terms/highlight across many pages|Table headers repeat, footer space is reserved, page numbers are correct and totals/signature remain readable.
Boundary page breaks|Vary item count/long text so subtotal, highlight and terms fall near page end|No text falls outside margins or overlaps footer/header. Every line remains present once.
Special characters and Unicode|Render apostrophes, ampersands, currency sign and actual business-language names|Supported characters display correctly. Unsupported font glyphs are recorded as a blocking business acceptance issue, never silently accepted.
PDF read has no status effect|Fingerprint quote then view, download and browser print|No status/history/price/version change or automatic message occurs.
Safe filenames and escaping|Use malicious quote/customer label text with separators/quotes; Download|Attachment filename is safely formed. No header injection/path traversal or executable markup occurs.
Preview does not allocate number|Preview unsaved quote repeatedly then save once|No quotation/number/history exists until save. Saved document receives one server-assigned identity.
Print responsive layout|Open print preview at supported page sizes and compare content|Customer-facing content and totals are complete. Browser/server layouts may differ visually but data/privacy agree.
`);
section('WA','Manual WhatsApp sharing and history','server/whatsapp.js; public/srs-ui.js; tests/access-whatsapp.test.js','Saved eligible quotes, international synthetic recipients and share-capable account. No real message send required.','WHATSAPP fixture',`
!Review handoff without sending|Open Share on WhatsApp for saved quote; Review recipient/message then Cancel|No share attempt, status transition or outbound message is created by review alone.
International recipient validation|Try valid +919000000001, missing code, letters and excessive digits|Only supported international format passes. Validation does not claim WhatsApp account registration.
!Prepare manual handoff|Confirm reviewed authorized recipient/message|One Prepared attempt and protected immutable PDF are saved. No automatic attachment/send/delivery receipt is asserted.
Download prepared PDF|Download retained PDF then edit source quote and download attempt PDF again|Attempt bytes/content remain the original immutable snapshot and access stays protected.
Open WhatsApp URL|Use handoff link in controlled browser; Inspect recipient and encoded message|Correct international recipient and safely URL-encoded reviewed message open. PDF still requires manual attachment/send.
Manual confirmation|Mark Prepared attempt Manually Confirmed after simulated QA handoff|State records explicit user's confirmation with correct actor/time. It is not provider Delivered/Read.
Failed handoff note|Record Failed with useful supported note; Reopen history|Failure/note persists safely and quotation status/totals remain independent.
Retry failed attempt|Retry failed attempt after review|New attempt links to original failure, retains truthful state and own immutable PDF. Original history is not rewritten.
Invalid retry and status|Try retrying unsupported attempt/state and forged provider status|Unsupported operation fails with no fabricated delivery history or duplicate attempt.
History filters and paging|Filter Prepared, Manually Confirmed and Failed; Move pages; Export where offered|Rows/counts match actor's quote scope and canonical sharing states.
Owner scope and permission|As E1 request E2 attempt detail/PDF/status/retry; Remove share grant|All paths enforce access and required grant. Foreign attempts/bytes are not exposed.
Save recipient atomicity|Override and save recipient while preparing using current customer version|Customer update and preparation commit together only with customer.edit and matching version.
Recipient override denied|Use sharing-only account without customer.edit; Change recipient/save toggle|Only saved authorized contact can be used. Unauthorized override cannot update customer or prepare inconsistent attempt.
Stale customer recipient|Change customer phone concurrently; Prepare using stale version|Conflict prevents partial customer/preparation. Draft message/recipient remains reviewable.
Message template server rendering|Configure supported variables then prepare; Forge client resolved template/settings|Server resolves allowlisted fields from authorized saved quote. Private notes/secrets are not inserted.
Provider configuration rejected|Attempt unsupported automated provider or secrets through public settings|Unconfigured provider is rejected. Credentials are not stored in public/browser settings or output.
!Separation from quotation workflow|Prepare, fail, retry and manually confirm sharing; Compare source quote|No automatic Customer Approved, Sent to Customer, price or version mutation occurs outside explicit supported business action.
Preparation failure rollback|Inject PDF/storage/audit failure during preparation|No orphan usable attempt/customer update or misleading Prepared state commits. Failure is actionable.
Duplicate click prevention|Double-click Prepare under delayed response; Review history|UI prevents duplicate in-flight intent. Uncertain outcomes require history review before explicit retry.
Automatic content privacy|Put private customer/item/quotation/custom metadata marker text into source; Review prepared message/PDF|Automatic content excludes staff-only data and protected document projections remain effective.
`);
section('REP','Reports and charts','server/queries.js; public/reports-dashboard.js; public/reports-charts.js; tests/reports-hardening.test.js','Known saved dataset with all statuses, owners, months and separate share attempts.','REPORTS fixture',`
!Empty to real-data reporting|Open Reports without demos; Save one controlled quote then delete with permission and refresh|KPIs show zero, exact new saved values, then zero again. No client/demo aggregate fallback appears.
Six KPIs reconcile|Independently calculate count, saved grand total, customer-approved count/rate, distinct customers and top product|All KPI values match scoped saved records with correct zero-denominator behavior and quoted-value labels.
Global date filters|Apply presets, custom endpoints, year/month and valid intersections|Summary, product analytics and quotation CSV share applicable global period/customer/employee/status scope.
Invalid report filters|Use empty/duplicate/unknown parameters, malformed IDs/dates, reversed range and unsupported enum|Strict API validation fails closed. UI shows error and does not export stale summary.
Own/all/report-only permissions|Compare reports.view_own, view_all, quotation-only and no-report accounts|Reports scope follows report grants. Own metadata/data stays scoped and missing grant is denied independently of dashboard access.
Monthly quotation trend|Compare each month count and value including empty months|Backend cells match independent records. Separate labelled axes do not confuse count with INR value.
Status distribution|Compare donut/data table and status detail to all saved statuses|Every state/count is correct and zero/no-data state is clear.
Top quoted product frequency|Repeat same product on two lines in one quote and another quote|Frequency counts unique quotation/product occurrences, line count remains separate and quantity sums saved line quantities.
Employee count/value toggle|Switch employee performance count to value|Labels/values match immutable creators and both metrics are accurately identified.
Customer performance|Use multiple quotes per customer and renamed current customer|Counts/value and historical label policy match authorized reporting source. Distinct customers are not summed per quote.
Approval/rejection chart|Save quote in one month then approve in another; Inspect chart|Chart groups decisions according to implemented quotation-month definition and is labelled accurately.
WhatsApp analytics|Prepare/fail/manual-confirm attempts across quotes and dates|Attempt counts/states match separate share history. No Delivered/Read statistic is fabricated.
Detailed reports preserved|Expand sharing/status/date/employee/product/customer/approval/expired sections; Change filters|Original detailed views remain available and expanded state is retained with current scoped data.
Grouped/stacked/line/area modes|Switch product chart modes and metric|Same backend cells feed each mode with stable colors/IDs and correct legends/tooltips/data table.
Chart-only controls request scope|Change product comparison/category/mode only; Inspect network|Only applicable product requests update; summary global data does not unexpectedly refetch or narrow.
Accessible legend and tooltip|Use keyboard to toggle legend and focus data point|Controls have names, values are text-accessible and toggling affects intended series only.
Fullscreen focus|Open/close product chart fullscreen with keyboard and fallback modal|Chart/data remain readable and focus returns to invoking control. Escape closes supported modal correctly.
Reduced motion|Enable prefers-reduced-motion; Refresh KPIs/charts|Motion is reduced without losing final values or functional controls.
!Failure and retry isolation|Fail summary then product endpoint separately; Retry one|Each panel has truthful loading/error/empty state. Failed summary disables its export; product retry does not corrupt successful summary.
Stale request/user guard|Change filters rapidly, navigate away and switch users while requests delayed|Late responses cannot replace newer filters, another page or different user's report.
Report quotation CSV|Export filtered report quotes; Compare saved totals, rows and escaping|Exact authorized saved values and filter cohort export. Limit/CSV protections apply without mutating records.
No reporting writes|Fingerprint quote versions/history/prices before repeated report reads/exports|Reporting is read-only for business records. No reprice, status or snapshot changes occur.
`);
section('ANL','Global product analytics','server/product-analytics.js; server/product-analytics-projection.js; shared/domain.js; tests/product-analytics.test.js','Controlled persisted line items with canonical analytics projections and independent oracle.','ANALYTICS fixture',`
!GST-inclusive product value|Save 2 units at INR 100 less 10% plus 18% exclusive GST; Fetch product analytics|Product quotedValue is INR 212.40 including saved GST after discount, excluding separate delivery/other charges.
Product versus grand total|Add taxable delivery and other charges to controlled quote|Product value excludes separate quotation charges and their tax. Overall report quotation value uses full saved grand total.
Distinct quote/product count|Repeat product on two lines and include two products per quote|QuotationCount deduplicates quotes, productQuotationCount counts quote/product pairs, lineItemCount counts lines separately.
Quantity metric and mixed units|Combine area, unit and package items; Compare quantity cells|Saved line quantities are summed as defined; mixed units are explicitly not converted into a common physical measure.
Zero-filled months|Select valid period with no rows in middle months|Every requested supported month exists in series and empty cells are zero, without invented quotations.
Stable historical identities|Rename/recategorize/archive/delete current product after quote save|Saved product/category identities/labels and values remain historical as defined. Current masters do not rewrite projection amounts.
Discount before product filter|Use INR 200/100 lines and INR 1 fixed discount at GST 0; Filter first product|First product net remains INR 199.33, not INR 199.00. Whole-quote allocation occurs before filtering.
Inclusive/exempt mixed tax|Reconcile inclusive/exclusive/exempt items and shared tax penny allocations|Each gross line value and sum match canonical saved tax grouping without duplicate GST or discount.
Metric options|Request quotationCount, quantity and quotedValue then unsupported metric/grouping|Supported metrics return correct cells/units. Unsupported values fail 422.
Combined analytics filters|Apply product/category/customer/employee/status/date/year/month intersections|Data, totals, metadata and CSV share applicable authorized predicate and exact intersections.
Product series limit|Select exactly 50 products then 51; Request 60-month then excessive range|Limits are enforced with clear narrowing guidance. No silently truncated chart is presented as complete.
Own-only metadata|As E1 list products/categories/customers/employees/years metadata|Only E1 authorized quoted history supplies choices. Other owners' labels are absent even if IDs are guessed.
Forbidden other employee filter|As own-only account request another creator employee ID|Access is denied/empty under documented own-scope contract without disclosing foreign labels.
Analytics CSV|Export chosen metric and product/month combinations|CSV matches visible backend monthly cells, includes stable identities and zero months, and neutralizes formula text.
Projection create/edit/delete lifecycle|Save/modify/reprice/delete eligible quote and compare projected item rows|Projection stays transactionally consistent with persisted quote/item records and cascade removes deleted rows.
!Projection write rollback|Inject projection failure while saving quote|Quote, items, totals, numbering, projection, audit and revision roll back together.
Legacy projection backfill|Upgrade populated pre-analytics QA backup and inspect provenance/labels|Backfill retains original quote bodies/versions and records honest legacy category basis without silently inventing history.
Read snapshot coherence|Mutate quotes concurrently during aggregate read|Report totals/cells are coherent from a read-only repeatable-read snapshot and do not hold workspace writer lock unnecessarily.
Filter metadata bounded queries|Measure analytics metadata/read on large fixture|Queries are set-based/bounded, use deterministic latest permitted labels and avoid per-item/record hydration.
`);
section('SET','Company settings and data exports','server/resources.js; server/validation.js; public/srs-ui.js; server/backup.js','settings.manage Administrator; separate synthetic branding and pricing policy.','SETTINGS fixture',`
!Company identity settings|Save name, address, phone, email, GSTIN, logo, signature and footer; Reload|Current settings persist under version checks. New quotation snapshots use intended public company data.
Old company snapshots|Change settings after quote is saved; Compare old and new quote PDFs|Old quote retains saved company/tax/terms. New quote uses current configuration.
Prefix and sequence start|Set approved QA prefix/start, create quotes, then change start below used values|New numbers follow safe current policy and never collide or reuse existing/deleted sequence numbers.
Seven-day validity remains fixed|Edit legacy validity setting if exposed; Create new quote|Fixed shared seven-day rule prevails. Legacy setting cannot change new validity.
Default terms and public notes|Save ordered terms/customer-facing notes then create quote|New quote receives intended public snapshot. Staff notes remain separate and private.
Logo validation|Upload valid PNG/JPEG company logo and invalid/oversized input|Supported logo persists and renders; invalid input is rejected safely without breaking existing branding.
Tax defaults and presentation|Set applicable tax mode/rate and split/IGST presentation|New saved calculations/documents follow configured policy. Historical snapshots remain unchanged.
Employee discount controls|Set valid percent/fixed ceiling then test invalid/over-range setting|Valid policy persists and new writes enforce it. Invalid policy cannot bypass caps or negative totals.
Independent approval control|Toggle independent approval with current version; Test authorized quote approval|Setting is enforced by backend including administrator creator self-approval behavior.
Manual WhatsApp template|Save supported plain text variables and unsupported secret/provider fields|Supported template resolves on server. Unconfigured provider/secret settings are rejected and never exposed.
Settings version conflict|Save same settings from two admins using same version|409 preserves winner. Stale change cannot overwrite tax/branding/permissions policy.
Settings permission denied|As default E1 call settings mutation and privileged backup controls|403 with no configuration/data change.
Business JSON export privacy|Download /api/data/export as authorized admin; Inspect all sections|Business records are included according to contract, without password hashes, credentials, active session tokens or private signing keys.
Data export access|Request business export anonymously and as non-admin default employee|Export is denied and no database/configuration contents leak.
~Intentional blank settings|Clear optional company note/footer/signature fields then save/reopen|Intentional blanks remain blank and are not replaced by legacy sample labels unexpectedly.
`);
section('TEAM','User management and audit','server/accounts.js; server/access.js; server/store.js; public/backend-ui.js','A1/A2, two Employees and limited delegated manager.','ACCOUNTS fixture',`
!Create employee|Create unique Employee with valid synthetic credentials; Login as employee|Account persists once, uses intended default permissions and cannot see administrator-only pages.
Username uniqueness|Create/update case-equivalent existing username|Conflict prevents duplicate identity and no existing account is overwritten.
Edit user details|Change name/username using current version; Login and open old quotes|Current identity updates while immutable ownership remains tied to user ID.
!Deactivate account|Deactivate E1 with live sessions; Retry API and login|Sessions are revoked and correct-password login fails while inactive. Existing business history remains.
Reactivate account|Reactivate E1; Login again|New session receives current intended role/permissions. Revoked old cookies stay unusable.
Role and permission update|Change allowed account role/explicit grants; Re-login|Current grants apply after session revocation. Invalid grant list or unauthorized escalation fails.
!Last administrator protection|Try disabling, demoting and deleting last active Administrator|Every path rejects operation, including direct API. Workspace retains at least one active administrator.
Concurrent last-admin edits|With two admins, concurrently attempt disabling/demoting each other|Serialized checks preserve at least one active administrator and cannot leave locked workspace.
Temporary password reset|Reset E1 password with current version; Use old cookie/password then temporary login|Old sessions/password fail. Temporary login requires rotation before business writes.
Self password reset path|Try own admin reset endpoint; Use normal change-password path|Application enforces documented self-change flow with current-password verification rather than bypass.
Account version conflict|Update same user in two sessions with same version|409 prevents lost role/active/permission changes.
Delete permitted user|Delete eligible non-last-admin account with current version; Open historical quotes/audit|Deletion follows dependencies and retains immutable business history/actor attribution. No quote ownership transfers to another account.
!Audit authenticity|Create/edit/status/delete controlled record; Compare audit actor/time/action/before-after|Audit comes from server-authorized mutation. Client cannot write/replace log entries.
Audit pagination and filters|Filter by entityType/entityId/actorId across >recent-window records|Durable history remains queryable beyond recent dashboard activity, with stable pages and correct scope.
Audit permission denied|As default employee request /api/audit and forge history in batch/state|Unauthorized audit access/mutation fails. No fabricated administrator event commits.
Audit sensitive-data exclusion|Perform auth, customer/address and export operations with marker secrets/contact data|Credentials/tokens are absent. Customer mutation/export audit follows documented metadata-only privacy rules.
`);
section('API','API contracts and transactional changes','server.js; server/openapi.js; server/resources.js; server/store.js; server/database.js','Direct HTTP test client with separate QA cookies/CSRF and current versions/revision.','API fixture',`
Authenticated API documentation|Open /api.html and /api/openapi.json signed in and anonymous|Documentation is available to authenticated users and blocked anonymously. Declared routes and schemas correspond to candidate.
Resource CRUD contract|Create/read/PATCH/PUT/delete each disposable supported resource with valid version|Documented response status/envelope/data/version/updatedAt/revision are accurate. ID remains stable through updates.
If-Match support|Update/delete via valid If-Match instead of body version; Try stale header|Current header version works and stale one returns 409 with no lost update.
Missing resource version|Mutate each versioned resource without version/header|428 and no data/revision-dependent change.
Malformed JSON and wrong MIME|Send invalid JSON, array in object slot and wrong content type to JSON write endpoints|Request fails with bounded error and requestId. No partial state or stack/database internals leak.
HTTP method boundaries|Try unsupported method, HEAD and method-override deletion header|Only documented supported operations act. Header cannot turn safe GET into deletion.
!Atomic valid batch|POST /api/changes with two valid upserts and current revision/action='upsert'|Both records and audit commit together with one canonical workspace revision update.
!Atomic invalid batch|Send valid change then invalid reference/permission/negative money in same batch|Entire batch rolls back, including first write, audit and numbering. No partial success is reported.
Missing/stale workspace revision|POST changes or PUT state without revision then old revision|428/409 respectively. Winning workspace data stays unchanged.
Batch size and action validation|Submit 200 valid changes then 201, unknown action/collection and settings delete|Supported maximum passes within limits. Excess/unsupported operations fail atomically.
State compatibility and authorization|GET scoped state; PUT valid compatible state with own permissions; Try foreign/privileged mutations|Same canonical validation/access/pricing/ownership rules apply. Full-state route is not a bypass.
!Concurrent unrelated edits|PATCH two different records with their own current versions|Both valid unrelated updates persist. Global revision does not cause silent overwrite of either.
!Concurrent same-record edits|Send two competing edits with same record version across app instances|Exactly one wins. Other receives conflict and final record matches winning complete update.
Transaction lock and rollback|Inject constraint failure in multi-resource mutation|Database transaction leaves no partial records/items/revision/history or consumed number.
SQL injection and allowlisted order|Send SQL-like q, sort, direction, IDs and filter values|Values are parameterized/literal and order/columns allowlisted. No SQL execution, leaked rows or schema changes occur.
Path traversal and private files|Request .env, database/backup paths, encoded traversal and unknown routes|Private files never serve publicly. Unknown/private paths fail safely with no secrets.
Request size limits|Send normal maximum and oversized JSON/body to configured limit|Within-limit valid request works. Excess receives 413 before unbounded work or partial mutation.
Consistent errors and request IDs|Trigger 401,403,404,409,413,422,428,429 and injected 500/503|Errors use expected status and safe error/requestId envelope. No stack trace, connection string or secret leaks.
Strict canonical ID types|Submit null, object, boolean and malformed numeric/string references|Strict endpoints reject wrong types rather than stringify them into valid foreign IDs.
Authentication/revocation in transaction|Revoke active user while queued mutation waits on lock|Mutation rechecks current session/permissions and cannot commit under revoked authority.
`);
section('OPS','Database migrations, backup and recovery','server/store.js; server/schema.sql; server/migrations; server/backup.js; scripts/backup.js; scripts/restore.js; scripts/recover-admin.js; server/import-sqlite.js','Disposable databases only, private QA dumps and explicit operator control. Never use production credentials/data.','RECOVERY fixture',`
!Consistent PostgreSQL backup|Create backup while controlled writes occur; Validate dump catalog using PostgreSQL 17 tools|Private custom-format dump is valid and represents consistent database state. No public backup URL is created.
Backup list/download authority|List/download valid backup as admin, ordinary employee and anonymous user|Only authorized administrator obtains intended file bytes. Filename/path traversal is denied.
!Restore to unused database|Restore QA dump into new unique database; Start matching candidate against it|Customers, addresses, categories/logos, field definitions/options/bindings/audit, quotes/items/snapshots/totals and sequence integrity match backup.
Restore sessions revoked|Restore database containing prior sessions; Replay old cookies|Restored sessions are revoked. Valid account login works using retained password hash.
!Restore overwrite refused|Attempt restore to an existing database; Compare existing target fingerprints|Tool refuses overwrite and existing target is unchanged. No destructive fallback occurs.
Corrupt/incompatible backup|Restore truncated dump and unsupported newer-schema dump into disposable unused target|Restore fails safely with clear diagnosis, no false successful target or live-data changes.
!Populated migration chain|Restore representative schema 6/7/8/10/11/12 fixtures into separate databases; Start candidate|Additive migrations reach schema 13 while preserving legacy business IDs/bodies/versions/snapshots except documented derived projections/metadata.
Migration failure rollback|Inject failure after migration DDL before version marker; Inspect then retry|DDL/data/version changes roll back together. Retry succeeds without duplicate seeds or partial schema.
Repeated startup migration safety|Start current schema database twice; Compare business/config fingerprints|No repeated migration/backfill, reseeding overwrite or business rewrite occurs.
Customer/address migration integrity|Upgrade populated legacy customer fixtures; Inspect metadata and selected addresses|Legacy billing/status/IDs/versions persist; new nullable fields/relations and default-address constraints are valid.
Category logo migration integrity|Upgrade category fixture then backup/restore private assets|Exact decimal settings, associations and immutable historical logo references remain valid and protected.
Analytics migration integrity|Upgrade legacy quotes then reconcile projections against independent oracle|Original quote bodies/totals/versions are unchanged. Derived rows/provenance are correct and retry-safe.
Field migration integrity|Upgrade schemas 10,11,12 with configured values/audit/bindings|Definitions/options/immutable identities/history and business snapshots survive expansions through schema 13.
Foreign keys and defaults|Attempt orphan product/category/address/logo/binding references and two active default addresses|Database constraints reject invalid state without corrupting references or default uniqueness.
!Offline administrator recovery|Run documented recovery on QA with hidden prompted password; Inspect backup/audit/sessions|Recovery creates backup, reactivates intended existing administrator, revokes sessions and audits action. Password is absent from command arguments/logs.
Recovery missing/ambiguous target|Attempt offline recovery for invalid account/unsupported state|Tool refuses unsafe guess and leaves unrelated users/data intact.
SQLite import target safety|Import legacy sanitized SQLite fixture into empty QA PostgreSQL workspace then attempt populated target|Valid supported import preserves intended business data. Populated target is refused without overwrite or runtime SQLite fallback.
!Rollback rehearsal|Restore pre-upgrade QA backup to new database and use matching old candidate; Verify smoke and data cutoff|Rollback procedure is reviewable without deleting newer data. Post-backup changes require reconciliation and incompatible schema/code combinations are not accepted.
Backup filesystem permissions|Inspect QA backup volume and export staging access/storage paths|Backups/private staging are outside public assets and inaccessible to unrelated web clients. Dumps contain no new plaintext credentials.
Database URL precedence|Run test helper with harmless explicit DATABASE_URL versus PG variables|Documented DATABASE_URL precedence is observed and runner cannot accidentally target persistent application database.
`);
section('NFR','Responsive, accessibility, resilience and operations','public/*.css; public/dropdowns.js; public/reports-charts.js; docs/VERIFICATION.md; docs/DPQ-DOMAIN-SETUP.md','Final QA candidate, supported browser versions and agreed capacity/SLA recorded by QA lead.','VIEWPORTS + LOAD fixtures',`
!Desktop/tablet/mobile workflows|Run customer, quotation, product, list, reports and Settings at 320,390,768,1024,1440 widths|Key controls/data remain readable and reachable. Content/table scrolling stays contained and no accidental page-wide overflow blocks work.
Keyboard-only core workflow|Sign in, select customer/product/options, add item, preview/save and open PDF using keyboard|Every required control is reachable with visible focus and intended Enter/Space/arrow behavior. No keyboard trap occurs.
Accessible field names/errors|Inspect dialogs, inputs, validation alerts, pagination and dynamic controls|Controls have meaningful names/labels, errors associate with inputs, and focus/live feedback identifies failed action.
Zoom and long content|Use 200% zoom with long labels/customer names on narrow viewport|No critical content/control is clipped or overlapped and user can scroll/read required text.
~Screen-reader acceptance|Run agreed screen-reader/browser manual audit of login, forms, tables, charts and dialogs|Record actual issues against agreed accessibility target. Do not infer certification solely from automated browser checks.
Cross-browser matrix|Run release smoke in current supported Chrome, Edge, Firefox and Safari where agreed/available|Record exact browser/OS versions and observed result. Unsupported/unavailable engine is BLOCKED or N/A with reason, not PASS.
Network loss during edit|Disconnect QA network while form filled; Reconnect and reload current version before retry|Clear failure/uncertain-save message appears. Draft is recoverable and no blind duplicate or stale overwrite occurs.
Slow endpoint and cancellation|Throttle network; Navigate/close dialog while fetch/download in progress|Loading remains usable, stale callbacks do not mutate detached UI and cancellation cleans up capacity.
!No browser runtime errors|Exercise all business pages/admin modes with console/network capture|No unexpected uncaught exception, failed required asset or silent successful write error occurs. Deliberate negative-response evidence is distinguished.
Bounded pagination load|Load 10001+ quotation fixture and 1000+ products; Measure page requests and plans|Only bounded requested rows hydrate, deterministic order holds and no per-row query explosion occurs. Record timings against agreed SLA.
Report load envelope|Run controlled 50001-quotation fixture and 50-product/60-month chart|Aggregates reconcile, oversized CSV blocks before partial file, and chart remains usable with data table. Record actual timing/memory; no invented SLA.
Dynamic-field load envelope|Use 500 generic fields/100 choices and representative 40-dropdown form|Configuration requests stay batched/coalesced and limits enforced. Capture payload size/timing/memory against agreed QA envelope.
Concurrent writers|Run realistic concurrent customer/quote/status writes across two app instances|No duplicate numbers, lost updates or partial transactions. Conflicts are explicit and audit attribution is correct.
Database failure recovery|Interrupt QA database during read/write then restore|No false success/partial mutation persists. Readiness and UI recover and uncertain writes can be reconciled safely.
!HTTPS origin/cookie deployment|On authorized staging configure exact APP_ORIGIN, TLS and COOKIE_SECURE=true; Login and write|HTTPS works without mixed content, secure cookie is present and origin/CSRF checks remain enforced behind proxy.
Reverse proxy upstream|On staging verify Nginx Proxy Manager network and upstream app:6400 health|Proxy reaches actual app over configured Docker network. Public health/login reflect same intended candidate, no loopback-container mismatch.
Private database exposure|Inspect effective QA/staging Compose networking and exposed ports|PostgreSQL stays private to intended network. Web access does not expose dump/credentials or database port unnecessarily.
Non-root production candidate|Inspect final Docker user/process and required filesystem permissions|App runs as non-root node user with working intended backup/temp paths and no unnecessary public write access.
Dependency and syntax checks|Run npm run check, candidate build and production dependency advisory check in controlled environment|Syntax/build pass. Actual advisory findings and accepted risk are recorded; historical zero findings are not copied as current PASS.
Storage capacity and cleanup|Run export/backup workloads near agreed QA storage budget; Simulate full temp/backup volume|Action fails safely with useful error and releases capacity without deleting unrelated files or reporting partial export as success.
No real messaging without business run|Inspect integration configuration and run manual handoff fixture only|Manual behavior is accurately labelled. Real external delivery/business-provider acceptance remains explicitly pending unless separately executed.
`);
section('E2E','End-to-end business acceptance','docs/USER-GUIDE.md; tests/customer-category-quotation.test.js; tests/quotation-editor-api.test.js; tests/access-whatsapp.test.js','Full configured synthetic company; independent approver; QA evidence storage.','ALL fixtures',`
!Complete quotation lifecycle|Admin configures approved product/category; E1 creates customer/address and quote; A2 independently approves; E1 downloads PDF and explicitly updates sent/customer decision|Same record identity, ownership, saved amounts and audit/history reconcile across all pages. No automatic message or decision is invented.
!Category quotation acceptance|Configure approved BNI 10%/message; Create BNI customer with delivery; Quote 2x100 at 18%; Preview/save/print/PDF/export/report|Single discount INR 20, GST 32.40 and grand 212.40 persist. Saved highlight is before terms, selected delivery is present, and private markers are absent.
Import to activation to quotation|Prepare missing placeholder; Download/import approved synthetic prices; Complete required choices/GST; Review eligibility; Explicitly activate; Quote|No step silently activates product. Final eligible item uses imported approved rates; receipt/audit and quote calculations reconcile.
!Historical preservation acceptance|Save quote; Rename masters/change prices/GST/category/address/logo/field labels; Read old quote, report and retained sharing PDF; Duplicate eligible quote|Original and retained PDF stay historical. New eligible duplicate has new identity/current approved pricing plus trusted preserved snapshots according to per-field contract.
!Two-user concurrency acceptance|E1/A1 edit same customer and quote while two app instances create new quotes|No lost update or duplicate numbering. Stale user receives reviewable conflict and audit shows real winning actors.
Restricted employee acceptance|Use E1 with default grants; Create/edit own Draft, use reports/PDF/WA; Attempt foreign quote and admin APIs|All permitted work succeeds and every restricted route is denied without side effects or private data leakage.
!Backup restore acceptance|Create customer/category/private logo/dynamic values/product quote/share history; Backup and restore to unused QA database; Re-run login/PDF/report smoke|Restored business counts, exact money, snapshots, immutable assets/config audit match cutoff. Old sessions fail and valid new login succeeds.
Mobile quotation acceptance|On 390px keyboard/touch create customer/address and multi-item quote; Preview/save then share review|Workflow is reachable and accurate with no overflow/trap or stale retained data on next blank quote.
Release smoke on candidate|Use final packaged image without source mounts; Check health/auth/customer/quote/PDF/report/import read/backup list|Actual candidate code/assets and current schema behave consistently. Record build hash/environment and evidence rather than reusing older logs.
~Business approval of real configuration|Use business-approved prices, tax treatment, company identity, languages, terms and expected documents in staging|Business owner accepts actual configuration and document content. Missing approval/input is BLOCKED with reason, never silently replaced by samples.
`);

const methodExpected={unit:'approved applicable per-unit/tier rate multiplied by saved quantity',area:'canonical square-foot area multiplied by quantity and applicable approved area rates',fixed:'approved fixed base plus applicable configured extras',package:'approved package base plus applicable configured extras',base:'approved base plus selected applicable option charges',tier:'approved quantity breakpoint rate and canonical tier quantity'};
for(const p of inv.products){
 const template=p.templateId||'retained existing product configuration';
 section('SKU','Documented product matrix','shared/catalog.js; shared/domain.js; server/validation.js','Create isolated '+p.code+' fixture. Configure approved synthetic rates, GST and every mandatory choice first. Retain original master IDs.','Product '+p.code+'; method '+p.method+'; template '+template+(p.additionalFields.length?'; extra fields '+p.additionalFields.join(', '):''),`
!Quote ${p.name}|Open Create Quotation; Select ${p.code}; Fill valid product-specific specifications including ${p.additionalFields.join(', ')||'all applicable current fields'}; Calculate, preview, save and download PDF|Only ${p.name} configuration applies. Subtotal uses ${methodExpected[p.method]||'canonical '+p.method+' method'} plus allowed charges. UI, backend, saved item and PDF match independent fixture oracle. Snapshot includes correct stable product ID and public specifications.
Pending or unavailable ${p.name}|In separate fixture leave mandatory rate/GST/choice approval pending or deactivate ${p.code}; Attempt calculate, preview, new quote and duplicate|Every new-use path blocks the incomplete/inactive ${p.name} without implicit free price or automatic activation. Existing saved ${p.code} quotation/PDF retains historical values. No failed duplicate consumes a number.
`);
}
const permissionActions={
 'quotation.create':['create valid own Draft through POST /api/quotations','quotation creation succeeds with server owner/number and Draft status','remove quotation.create; retain customer/catalog prerequisites'],
 'quotation.view_own':['read own quotation through list, detail and scoped state','own quote is visible and another owner is excluded','remove all quotation-view grants'],
 'quotation.view_all':['read another employee quotation through list/detail/state','other owner is visible under view_all without changing its owner','remove view_all; keep view_own'],
 'quotation.edit_own':['edit own Draft project with current version','own Draft edit commits without repricing unchanged items','remove edit_own and edit_all'],
 'quotation.edit_all':['edit another employee quotation with current version','authorized edit commits while immutable original ownership remains','remove edit_all; retain only edit_own'],
 'quotation.approve':['internally approve quote created by another user','internal approval commits once with actor/time history','remove quotation.approve; keep general status/view prerequisites'],
 'quotation.delete':['delete intended test quotation with current version','intended quotation is removed and number stays reserved','remove quotation.delete'],
 'quotation.download_pdf':['download owned saved quote through protected PDF route','authorized valid PDF bytes return with no status change','remove quotation.download_pdf'],
 'quotation.share_whatsapp':['prepare reviewed owned saved quotation manual handoff','Prepared history/protected PDF commits with truthful manual semantics','remove quotation.share_whatsapp'],
 'quotation.status':['change owned quote to supported non-internal-approval status','requested supported transition commits with accurate history','remove quotation.status and quotation.approve; keep own edit/view'],
 'quotation.additional_charges':['increase delivery/other charge on eligible own Draft','authorized nonnegative charges use canonical saved tax and totals','remove quotation.additional_charges'],
 'quotation.discount_unlimited':['apply structurally valid discount just above configured employee cap','discount above employee cap saves while percentage and subtotal bounds remain enforced','remove unlimited grant; retain normal quote edit and low fixed/percent cap'],
 'customer.view':['read customers and owned address references','authorized current customer/address data returns in documented safe shape','remove customer.view; retain quote creation only for contrast'],
 'customer.create':['create valid unique dummy customer','one active customer commits under server default with current version','remove customer.create; retain view/edit only'],
 'customer.edit':['edit existing customer and valid owned address','intended changes commit atomically under parent version','remove customer.edit; retain customer.view/create'],
 'customer.delete':['delete unreferenced disposable customer','only selected unused customer is deleted and audited','remove customer.delete; retain customer.view/edit'],
 'customer_categories.view':['GET category management data including inactive/archive entries','category management read succeeds without write authority','remove category view/manage and unrelated customer reference grants'],
 'customer_categories.manage':['create/update intended managed category with valid version','valid category management write commits and Other remains protected','remove customer_categories.manage; retain category view'],
 'fields.view':['GET configurable-field registry/list/history','configuration management read succeeds without mutation authority','remove fields.view and fields.manage'],
 'fields.manage':['change editable descriptive label through central field API with current version','permitted metadata/options change commits with revision/audit','remove fields.manage; retain fields.view'],
 'product.view':['GET permitted catalog and product details','permitted catalog records return with pricing independently redacted as applicable','remove product.view, product.manage and pricing.manage'],
 'product.manage':['rename existing product metadata without rate changes','safe product metadata saves while current prices remain','remove product.manage; retain pricing view only'],
 'pricing.view':['read master rates/template through permitted catalog read','master pricing returns for authorized viewer without write grant','remove pricing.view and pricing.manage; keep product metadata access'],
 'pricing.manage':['change existing approved synthetic master rate','authorized rate edit commits without repricing old quotations','remove pricing.manage; retain pricing.view/product.manage'],
 'pricing.override':['save valid item price override with required nonblank reason','reasoned override is permitted/audited and master product rate is unchanged','remove pricing.override; retain quotation edit/view'],
 'reports.view_own':['GET summary/product analytics/CSV for own records','own report cohort returns and foreign ownership is excluded','remove reports.view_own/view_all; keep quotation view for dashboard distinction'],
 'reports.view_all':['GET reports including other creators','all permitted company report records return','remove reports.view_all; retain reports.view_own'],
 'users.manage':['create eligible Employee no more privileged than delegated actor','authorized bounded account action succeeds without escalation','remove users.manage'],
 'settings.manage':['save valid current-version public company setting','setting commits with version/audit and old quote snapshots remain','remove settings.manage'],
 'audit.view':['GET durable audit history with valid filters','authorized audit rows and stable pagination return','remove audit.view'],
};
for(const perm of inv.permissions){
 const [action,expected,denySetup]=permissionActions[perm];
 const deniedExpected=['quotation.view_all','reports.view_all'].includes(perm)?'Only owned permitted records remain. Other creators are excluded from list/aggregates and direct foreign-record access. No scope escalation occurs.':'Backend rejects the operation without the required capability. No unauthorized private data, business mutation, dependent audit or revision change occurs.';
 section('RBAC','Permission matrix','server/access.js; server/accounts.js; tests/access-whatsapp.test.js','Use two synthetic non-Administrator accounts identical except target grant. Keep required related access and valid input/current versions. '+denySetup+'.','Permission '+perm+'; Employee default='+inv.defaults.includes(perm),`
!Granted ${perm}|Assign explicit required prerequisites plus ${perm}; Re-login; ${action}|${expected}. Grant does not bypass ownership, eligibility, version, independent approval or validation rules.|${perm}|Configured delegated Employee
Denied ${perm}|Use counterpart with target capability and alternative granting permissions removed; Re-login; Attempt to ${action}|${deniedExpected}|${denySetup}|Configured restricted Employee
`);
}
const pages={dashboard:'Dashboard',quotations:'Create Quotation',quotation_list:'All Quotations',customers:'Customers',reports:'Reports',products:'Products & Services',product_categories:'Product Categories',pricing:'Pricing Configuration',catalog:'Catalog Verification',users:'User Management',settings:'Settings',whatsapp:'WhatsApp Sharing History',customer_categories:'Customer Category Management'};
for(const [page,label] of Object.entries(pages)){
 section('PAGE','Page and role matrix','shared/field-controls.js; public/field-pages-ui.js; tests/dynamic-pages.browser.cjs','Candidate loaded. Use fixture role with relevant business-page permission.','Page '+page+'; widths 320,390,768,1440',`
${label} Admin Edit Mode OFF|Open ${label} as Administrator with Edit Mode OFF; Exercise primary page action/filter and refresh|Normal workflow stays usable, expected scoped records load and customization controls are absent until requested. No console exception or unintended write occurs.
${label} Admin Edit Mode ON|Open ${label} as Administrator; Turn Edit Mode ON; Inspect approved field/caption controls then turn OFF|Only explicitly registered customizable controls are editable. Existing control values/options/handlers and page business behavior survive both toggles.
${label} delegated business role|Open ${label} as non-admin explicitly granted this business capability but no fields.manage; Attempt inline editing UI/state toggle|Authorized ordinary workflow works. Administrator Edit Mode/customization controls stay unavailable and direct metadata mutation is denied. No extra role grant is inferred from page access.|Explicit page grant, no fields.manage|Delegated non-Administrator
`);
}
for(const c of inv.controls){
 const caption=c.policy==='label_only';
 section(caption?'CAP':'GUARD',caption?'Registered caption matrix':'Protected control matrix','shared/field-controls.js; server/field-registry.js; tests/dynamic-pages.browser.cjs','Administrator Edit Mode ON; current definition version; page permission. Preserve canonical control values before test.','Control '+c.id+'; '+c.classification+(c.dataType?'; type '+c.dataType:''),caption?`
Customize ${c.label} caption on ${pages[c.pageKey]}|Open ${pages[c.pageKey]}; Rename only ${c.label} caption to QA ${c.label}; Save; Navigate away/back; Exercise original control|Saved caption appears after revalidation and in second authorized session after refresh. Original node/value/options/selected stable ID and event behavior remain intact. No business enum/entity/rate change occurs. Restore caption after evidence.
`:`
Reject generic editing of ${c.label} on ${pages[c.pageKey]}|Open ${pages[c.pageKey]} in Edit Mode; Attempt generic option/key/requiredness edit for ${c.label} using direct configuration API|Control remains canonical and protected. Generic mutation is rejected and real ${c.source} choices, IDs and business validation are unchanged. Dedicated authorized business APIs retain their existing behavior.
`);
}
section('EDGE','Cross-feature regression boundaries','tests/quotation-editor-api.test.js; tests/dynamic-fields.test.js; server/store.js; shared/domain.js','Disposable QA fixtures supporting historical collisions and protected registry identities.','EDGE fixture',`
Historical reference collision|Load legacy saved reference CR/2026/next-sequence; Create next new quote using same base reference|Old reference is retained. New reference receives deterministic collision suffix such as -2 and stays unique without renumbering historical quote.
Archived option key cannot recur|Archive generic option; Attempt new option using same field/value key|409 prevents reuse even if label differs. Existing snapshots remain readable.
Required dropdown cannot become empty|Archive/deactivate last active choice on active visible required configurable dropdown|Conflict prevents unusable required definition. Whole editor change rolls back.
Required hidden field rejected|Save configurable field isRequired=true and isVisible=false|Invalid hidden-required combination is rejected and existing usable definition remains intact.
Product with binding hard-delete blocked|Initialize product display bindings; Attempt hard product deletion|409 reference protection retains product/bindings/history. Deactivation remains supported.
Reserved payment/workflow fields|Attempt to create/override payment_status or workflow registry identities as generic descriptive choice|Protected reserved identities cannot be changed and no payment/accounting workflow is invented.
Disabled choice import stays disabled|Import approved rate for currently disabled canonical choice; Refresh quoting selector|Approval does not silently enable the choice. Explicit availability management is still required.
Date input still validated before normalization|Submit impossible valid-until date to new quote despite fixed-seven-day policy|422 for invalid calendar date. Normalization does not let malformed input bypass date validation.
Minimum monetary charge|Set unit base below approved INR 500 minimum; Quote quantities below/at/above threshold|Minimum adjustment raises base to INR 500 only when needed. Subsequent percentage charges use canonical base once and breakdown reconciles.
Multi-select minimum and maximum|Set minSelections=1 and maxSelections=2 on canonical multi field; Submit 0,1,2,3 and duplicate choices|One/two distinct approved choices pass. Too few/many/duplicate selections fail backend validation.
Numeric field defaults|Configure permitted numeric default within min/max; Open new configurator then clear or exceed range|Valid default populates once, explicit valid user change persists and invalid/required-empty value is not silently replaced during save.
Conditional reconciliation|Choose valid shape/size then switch parent to incompatible shape|UI retains still-valid selections and clears incompatible dependent values. Backend rejects forged invalid pair.
Custom finish public details|Choose permitted Custom finish; Omit then fill required customer-facing description|Description is required and saved in public specs. Selecting Custom alone creates no invented price.
Phase 2 explicit preparation|Open Visiting Card/Flex product draft; Prepare Phase 2 then Cancel; Prepare/save and repeat|Cancel does not mutate masters. Explicit saved preparation is idempotent, retains old rates/manual compatible rules/history and leaves new commercial policies pending.
Phase 3 explicit preparation|Prepare T-Shirt/Logo/five gifts with custom existing settings; Save twice|Existing sizes/options/rates and snapshots survive. New named paid extras remain pending until explicit approval. No unrelated placeholder activates.
Ambiguous inherited semantic fields|Create duplicate plausible semantic fields then prepare shared assignment|Preparation blocks ambiguous mapping with actionable issue rather than guessing/renaming Admin keys or replacing rates.
Size custom/kids availability|Add approved custom/kids size, reorder and disable old size through canonical editor|Shared size engine uses stable keys and configured surcharge/availability. New invalid selections fail while saved historical sizes remain readable.
Latent hidden price authority|Change prices in disabled overrides/raw legacy fields without pricing.manage|Pricing authorization still detects latent rate change. Hidden/disabled location does not bypass permission and entire write rolls back.
Saved zero charge tax retained|Save chargeTax=0 then change current company tax to 18; Read unchanged quote|Saved zero is retained rather than treated as missing. Charge GST does not retroactively become 18%.
Largest remainder allocation|Use fractional fixed discount over many tiny unequal item amounts|Allocated paise sum exactly to quotation discount, no discounted line becomes negative and total tax/grand reconcile to independent integer oracle.
Native field no-op roundtrip|Open inherited product, save with no semantic changes and compare raw assignment|Shared references remain references and are not copied into new local overrides. No accidental rate/config drift occurs.
`);
