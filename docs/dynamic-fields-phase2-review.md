# Global Admin Edit Mode — Independent Acceptance Review

Date: 2026-11-05. Scope: the existing Phase 2 Edit Mode implementation and its integration with the central Dynamic Field Engine. This review preserves the existing permission model, canonical dropdowns, customer/quotation workflows, pricing, reports and WhatsApp sharing. Tests use generated databases in a disposable PostgreSQL 17 container; no production data or persistent installation was migrated or restarted.

## Findings and fixes

| Finding | Reproduced behavior | Correction and regression evidence |
| --- | --- | --- |
| Saved multi-select choices omitted by a later scope override could not be retained during a partial edit | A customer saved `['first']`; a page override introduced only `current`. Updating to `['first','current']` returned 422 despite `first` already belonging to this record. | The server supplements validation with choices from its own saved snapshot, restricted to values still stored on that record. The updated snapshot retains their labels. Forged incoming history, new-record selection of the retired key, and reintroducing a key after removing it still fail. New API regression covers all four paths. |
| Unsaved choices were mistakenly treated as historical by browser validation | A customer had saved `red`, selected `blue` without saving, then archived `blue` in the configuration editor. Browser validation returned true; the backend correctly rejected the ordinary save. | Choice validation now derives previous selections from saved snapshots, rather than mutable form drafts. The browser reports the unavailable option before a customer request is submitted. Backend authorization/validation was never bypassed. |
| Long labels and internal keys overflowed narrow forms/dialogs | A supported 150-character label produced 1,018px of scroll width inside a 298px customer modal. A 63-character internal key also required wrapping. | Scoped wrapping/minimum-width rules retain edit buttons and wrap internal keys/saved values. Option actions wrap as needed. Automated checks cover customer forms and option editors at 320, 390, 768 and 1,440px, including maximum-length metadata. |
| Escape in a nested field editor discarded the customer form underneath | The application-wide Escape shortcut closed the customer modal while the native field dialog was closing. The customer's unsaved company input disappeared. | The field dialog contains its Escape/Tab events so underlying shortcuts do not run. Native dialog cancellation/focus handling is retained. The regression asserts that Escape closes the field editor, leaves the customer form open, and preserves its unsaved company value. |

Reproduction logs are retained under `test-results/`: `edit-mode-review-multi-reproduced.log`, `edit-mode-review-browser-reproduced.log`, `edit-mode-review-mobile-reproduced.log`. The nested Escape regression was discovered while expanding the responsive test; the final test explicitly asserts preservation of the parent form, and the original closed-parent screenshot is retained as `edit-mode-review-nested-escape-reproduced.png`.

## Acceptance matrix

| Requirement | Result | Verified behavior |
| --- | --- | --- |
| Authorized Edit Mode visibility | PASS | Administrator-only UI, OFF by default, session/tab memory only. Normal staff never receive a toggle, even after invoking the controller directly. |
| Independent backend permissions | PASS | Anonymous bulk-editor requests return 401; missing CSRF and normal-staff writes return 403. Backend checks `fields.manage` inside the existing write transaction and rechecks active session/current permissions after acquiring the lock. Revoking an active administrator session prevents save, clears the editor/mode and leaves configuration unchanged. |
| Existing delegated permissions | PASS | The Phase 1 API still honors an explicitly granted `fields.manage` permission. This does not grant business-record or private pricing access. The global UI toggle remains administrator-only; no role/grant semantics were broadened by this review. |
| Company isolation and protected fields | PASS | Existing tenancy uses a separate company database. Foreign field/option identities and cache validators cannot cross that boundary. Workflow statuses, roles, pricing, tax and database relationships cannot become ordinary editable options. Label-only policies cannot relax required settings. |
| Field label renaming | PASS | Visible labels change while field keys, root IDs, option keys, existing values and API properties stay stable. Unsaved ordinary form input survives configuration saves. |
| Option creation/editing | PASS | Nonempty labels and unique immutable keys are validated server-side. Saved keys are readonly in the editor; invalid/foreign/duplicate identities fail without a partial write. Plain text is escaped when rendered. |
| Archive behavior | PASS | Archive preserves rows/keys and old selections; archived choices cannot become new selections. Unsaved archive can be undone before Save. Persisted archived keys cannot be restored/reused. Scope changes and partial multi-select edits retain trusted prior choices. |
| Drag/drop and keyboard ordering | PASS | Real browser drag-and-drop and Move up/down work. The submitted array contains every saved option ID exactly once; order persists through the atomic editor API. A live region announces keyboard reorder positions. |
| Save, Cancel and Reset | PASS | Save is explicit and separate from customer/quotation Save. Cancel/Reset remain local. Simulated 503 saves retain editor drafts, re-enable controls and leave field/customer records unchanged. No optimistic business-record write occurs. |
| Concurrent updates | PASS | Current parent version is mandatory. A stale writer receives 409, keeps its draft and cannot save until explicit reload. Existing concurrent engine tests verify one winner and coherent revisions/audits. |
| Error rollback | PASS | Injected failure during a multi-option database update rolls back label/options, version, audit and cache revision. Failed loading provides Retry and blocks business submission until configuration can be validated. Retry preserves ordinary input. |
| Navigation and unsaved changes | PASS | Enabled state survives page navigation; refresh, logout, session changes and account switching reset it. Ordinary quotation dirty tracking includes custom values and retains its existing navigation guard. Nested dialog cancellation preserves the unsaved parent customer form. |
| Configuration/value persistence | PASS | Definitions/options use the central database engine; values/snapshots use the existing authorized customer/quotation transaction. Real container restart verifies persistence and authenticated retrieval. Finalized quotation snapshots remain immutable. |
| Responsive layout | PASS | Customer and option editor geometry checked from 320px to desktop, including maximum label/key lengths. No horizontal overflow in the tested cases. Screenshot: `test-results/edit-mode-review-mobile-options.png`. |
| Keyboard/screen-reader semantics | PASS for automated checks | Named native modal, focus containment/return, Escape behavior, associated labels, validation alerts, list/live-region semantics and keyboard reorder controls verified. Reduced-motion emulation passes. Physical assistive technology testing is not claimed. |
| Ordinary forms with mode OFF | PASS | Editing icons/add controls and outlines are absent. A normal employee edits and saves an ordinary customer company field while retaining the saved archived custom choice. Existing ordinary fields, backend validation and protected controls remain available through their established workflows. Persisted custom fields/captions remain ordinary form configuration when mode is OFF; OFF does not revert administrator configuration. |
| Existing business functionality | PASS | Complete customer, quotation, category, product, pricing, reports, PDF/print and sharing suites pass. The source hash baseline confirms this review changes only the files listed below. |

## Executed verification

| Check | Result |
| --- | --- |
| Focused Dynamic Field Engine/Edit Mode API tests | PASS: 32 tests, including the new partial multi-select retention case |
| Focused Edit Mode browser checks | PASS: 21 checks, including failed saves, unsaved archive rejection, narrow layouts/nested Escape, ordinary staff forms, CSRF/anonymous requests and active-session revocation |
| Complete Node/PostgreSQL suite in candidate image | PASS: **470 tests**, zero failures, cancellations or skips |
| Complete available browser/E2E matrix | PASS: **323 checks across 25 suites**, zero failed checks or page exceptions; final full invocation exited 0 |
| JavaScript syntax | PASS: 138 files (`npm run check`) |
| Frontend asset build | PASS (`npm run build`) |
| Production Docker build | PASS; runtime user `node` |
| Packaged server smoke | PASS: 4 checks covering schema-12 startup/final assets, atomic editor and typed values, quotation snapshots, authentication and persistence across a real container restart |
| Whitespace | PASS (`git diff --check`) |
| Dedicated lint / static type checking | NOT CONFIGURED in this plain JavaScript repository |
| Production deployment / production data mutation | NOT RUN |

Candidate image: `paradise-edit-mode-review:20261105`, ID `sha256:8a66b51589a1f76f8a4a154771f0b35e28fc16a3f507f9264f89b2ba26af3de0`. Full Node tests use the image's packaged runtime/server/shared/public/scripts, mounting only tests and evidence. Browser tests use generated local applications and newly built assets in installed Chrome.

Commands: `node --test --test-concurrency=2 tests/*.test.js` inside the candidate; `node scripts/test-customer-release.js --all`; `npm run check`; `npm run build`; `git diff --check`. Browser verification requires `TEST_DISPOSABLE=1` and an explicitly disposable PostgreSQL URL on loopback port 55429. The persistent application/database are not test targets.

Evidence is under `test-results/`: `edit-mode-review-focused-api.log`, `edit-mode-review-focused-browser.log`, `edit-mode-review-full-tests.log`, `edit-mode-review-all-browser.log`, `edit-mode-review-all-browser-summary.json`, `edit-mode-review-image-build.log`, `edit-mode-review-image-smoke.json`, `edit-mode-review-syntax.log`, `edit-mode-review-build.log`, `edit-mode-review-whitespace.log`, and `edit-mode-review-changes.json`. Deliberate injected database failures generate expected error log lines; they are verified rollback tests rather than unresolved failures.

## Files modified by this review

- `server/field-values.js`: retain trusted selected choices during partial edits after whole-field scope changes; retain labels while rejecting forged or removed history.
- `public/dynamic-fields-ui.js`: use saved choice snapshots for previous-value validation; contain field-dialog Escape/Tab events.
- `public/dynamic-fields.css`: scoped wrapping and action layout for long metadata/narrow viewports.
- `tests/dynamic-inline.test.js`: partial multi-select retention and rejected forged/reintroduced history.
- `tests/dynamic-inline.browser.cjs`: failed save/cancel, unsaved archive validation, maximum-length responsive cases, parent-form preservation, actual normal-staff save, direct anonymous/CSRF checks and administrator-session revocation.
- `docs/dynamic-fields-phase2.md`: link this independent review.
- `docs/dynamic-fields-phase2-review.md`: this acceptance report.

The start/end SHA-256 inventory distinguishes this review from extensive pre-existing pending work. No schema migration, package, environment variable, authorization policy, canonical calculation, report or WhatsApp implementation changed. Schema remains **12**.

## Remaining limits and release guidance

- Restored target production data, target load, other browser engines and physical touch/screen-reader devices have not been tested in this review. Keyboard alternatives remain available for native drag-and-drop.
- There is no dedicated lint/static typing toolchain to execute. Syntax and build results are reported separately rather than treated as equivalent checks.
- Cross-session configuration changes appear on the next configuration revalidation/reload; there is no push channel. Stale mutations remain protected by version checks.
- Only existing supported customer/quotation adapters are customizable. Protected status/role/tax/pricing and relationship forms remain governed by their established APIs. Customer-facing custom-field PDF expansion remains outside this phase; existing document projections are unchanged.
- No new database migration is required for these fixes. The existing backup-first schema-12 deployment/rollback procedure in `dynamic-fields-phase2.md` applies. Do not run a schema-11 server against schema 12 or manually lower migration versions.
- Reverting these review-only code changes can use the retained schema-12-compatible Phase 2 artifact without a schema downgrade, but would reintroduce the defects described above. Prefer a forward fix; retain backups before any authorized release and preserve later writes.

## Final acceptance

**PASS for the tested local Phase 2 scope.** Four reproduced defects were fixed; all requested behavior, permission and regression checks pass. The focused 32 API and 21 browser checks are subsets of the full results, not additional totals. No unresolved critical defect remains in this review's tested scope.

The seven-file hash inventory preserves unrelated pending work. The temporary PostgreSQL container and smoke application/network were removed after validation. The persistent application/database remained healthy and were not restarted, migrated or used as test targets. Production deployment and target-environment acceptance remain **NOT RUN**, subject to explicit authorization and the limitations above.
