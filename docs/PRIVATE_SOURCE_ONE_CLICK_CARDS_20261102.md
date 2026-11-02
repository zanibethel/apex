# Apex: existing source rows → private product cards (2026-11-02)

## Goal
The supplier opens `/supplier/catalog/bulk`, sees their existing import queue,
selects some or all source rows, and presses **Create private cards**. No visit
to import-review or owner approval is needed to create editable records.

## Mechanics and limits
- The server reads the current authenticated supplier's exactly-one private
  storefront, complete source set, and candidate-to-product mappings.
- Missing or incomplete source reads fail closed.
- The UI can process all 63 existing sources in 10-row sequential RPC batches.
- A new invoker-only atomic database RPC checks source row, supplier membership,
  expected current internal source cost, duplicate linkage and SKU uniqueness.
- Each saved card contains a server-generated SKU, neutral editable metadata,
  source link, a *proposed* 2× retail price and 2.5× compare-at value, an
  unverified internal source cost, no image, inactive status, and real zero stock.
- The original source's `review_status` stays unverified until actual evidence
  is checked. A private draft is not a verified sourcing or product claim.
- Existing supplier cards still use the pencil, selection, preview and
  publication-preference toggle. Admin holds and correction paths stay intact.
- The public storefront and BTCPay checkout remain independently disabled.
- Proposed compare-at is NOT evidence of an actual discount; do not render
  strikethrough savings claims publicly without verification.

## Rollout
- `database/sql/apex_private_source_one_click_drafts_REVIEW_ONLY.sql`
  contains a review-only RLS policy update and invoker RPC.
- The UI and server action require both
  `APEX_DRAFT_CATALOG_WRITES_ENABLED=true` and
  `APEX_PRIVATE_SOURCE_DRAFTS_ENABLED=true`.
- Test disposable PostgreSQL tenant isolation, duplicates, source-cost stale
  inputs, private stock and public gate, plus application lint/tests/build.
- Review and apply hosted migration separately, verify permissions and public
  release OFF, then enable the server flag and redeploy.
- Never bulk-create production source cards just because deployment succeeded;
  the supplier must choose the private Create cards action.
- NEXT PASS: implement public eligibility-checked Publish with correct listing
  status, media delivery, approval evidence and regulatory verification. This
  pass intentionally does NOT turn Publish preference into public visibility.
