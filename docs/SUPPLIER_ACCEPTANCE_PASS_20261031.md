# Supplier acceptance pass — October 31, 2026

## Scope and evidence

This pass reviews the merged private supplier bulk workflow at `/supplier/catalog/bulk` against the planned supplier acceptance steps. It does **not** activate public catalog release, public images, orders, regulated product sales, real-money checkout, or Bitcoin acceptance.

- Production Vercel deployment: `READY` for main commit `154ed653fca20096923828fa43888c447fc72b59` (PR #88).
- Exact-main GitHub Actions quality run: https://github.com/zanibethel/apex/actions/runs/41248518072 — success, including app checks and database RLS integration.
- Read-only hosted Apex Supabase inspection: 1 private store, 1 saved product, zero public stores, zero public products and zero public categories. No hosted data was changed during this acceptance review.
- Hosted migration history confirms `20261031194850_supplier_listing_admin_override_controls` and `20261031201137_private_release_readiness_identity_holds`. The separately open history-capture PRs #81 and #83 must be reconciled before merging; **do not** replay SQL or run blanket database reset/push.
- Existing source/tests: `tests/supplier-product-csv.test.mjs`, `tests/supplier-bulk-product-workflow.test.mjs`, `tests/supplier-bulk-direct-publish-intent.test.mjs`, `tests/supplier-bulk-inline-media-stock.test.mjs`, `tests/supplier-bulk-mobile-import-focus.test.mjs` plus disposable Postgres RLS CI.
- Test media/catalog data must be synthetic/private. No real customer transaction and no production test publish.

## Acceptance results

| Flow | Result | Evidence or next check |
| --- | --- | --- |
| Template download, CSV parsing, max 100 rows/256 KB, duplicate SKU/product matching and generated SKU | Automated source/regression tests pass on merged main | Confirm browser file download and import in signed-in supplier session |
| New/updated imported products appear at top of workspace as editable cards | Automated regression tests pass | Visually inspect mobile import and existing-product update |
| Save selected rows in batches of up to 20 with per-product success/error | Existing tests on merged main; in-flight edit race found in review | This PR fixes the race; verify branch CI and simultaneous-edit behavior |
| Private image upload/reuse and audited on-hand stock changes | Existing regression and RLS tests on merged main | Requires authenticated browser/Storage QA; verify image copy and reload |
| Live private offer tile, individual/selected/all preview | Existing regression tests on merged main | Requires mobile UI and accessibility walkthrough |
| Publish single/selected/all privately, with admin hold and resubmission rules | Existing integration and regression tests pass on merged main | Requires authorized supplier/admin session to prove end-to-end behavior |
| Owner/manager editing, staff read-only and cross-store/anonymous denial | Existing auth and RLS tests pass on merged main | Manual role-switch test pending |
| Customer catalog remains unpublished | Verified by read-only hosted DB query | Recheck after any authorized supplier QA writes |
| Real-device horizontal overflow, touch targets, file picker and VoiceOver | Not verified | Test iPhone viewport and accessibility before supplier signoff |

**Limit:** Source assertions, CI integration, deployment readiness and read-only database inspection are not proof of a successful authenticated mobile end-to-end test. This acceptance pass intentionally leaves that status pending.

## Finding: in-flight save overwrote unsaved edit status

Previously `saveSelected` submitted a snapshot of the rows but later marked every successful row `needsSave:false`, even if its editable fields had changed before the server response. This could mislabel newer client edits as persisted and unlock a misleading private publication preview. The database RPC still checked persisted records and enforced holds.

Correction in this PR:
1. Reconcile a successful save with the exact submitted row; retain `needsSave:true` when any local editable field has since changed.
2. Preserve the returned persisted product ID and automatically generated SKU, without overwriting a newer explicit SKU edit.
3. Disable conflicting bulk editing, upload/selection, stock and save controls during an in-flight save or publication request.
4. Add pure regression tests for both unchanged and concurrently edited rows, generated SKUs and UI busy guards.

No schema, RLS, privileges, public data, payment or checkout code changed.

## Manual supplier acceptance script (remaining)

1. Sign in as an authorized supplier owner/manager, open `/supplier/catalog/bulk` on desktop and iPhone. Download `/templates/apex-product-import-template.csv`.
2. Add two synthetic private rows, one without an SKU, and another with an existing SKU used solely to test authorized same-store updates. Upload; confirm generated SKUs, import badges, cards at the top, no unexpected duplicates and no automatic public publication.
3. Select and save the rows. Confirm IDs, SKUs, values and the per-row outcomes persist after a full page reload. During any slow save, try editing and ensure the UI refuses/retains pending edits rather than falsely claiming they are saved.
4. Upload a non-sensitive sample image to product A, reuse it for B, and confirm separate private image paths. Set positive on-hand stock, reload and confirm the audit-backed quantity.
5. Preview single, selected and all saved tiles; change a price without saving and check that Publish is unavailable. Save and recheck.
6. Submit a private publication request for eligible synthetic products. As platform admin, place one on hold, require review and approve re-request. Confirm blocked products cannot be submitted even by an authorized supplier session, and approval never auto-publishes.
7. Sign in as staff/unrelated supplier and then signed out. Confirm protected editing and admin review remain denied. Re-query public product/store/category counts after permitted QA.
8. On iPhone verify preview-before-editor ordering, no horizontal overflow, image picker and sticky footer touch targets, keyboard focus/VoiceOver names and correct status announcements.

Record sanitized screenshots, exact device, URL, role, reproduction steps and whether each case passed. Do not include tokens, personal addresses, wallet information or other sensitive fields.

## Release and next step

Keep this change in a reviewable PR until its exact-head GitHub Actions checks are green. Do not merge or deploy solely on this review; then perform the pending authenticated/manual acceptance and address any confirmed defects in separately scoped PRs. The December 1 target remains a technical review milestone, not a commitment to activate live commerce.
