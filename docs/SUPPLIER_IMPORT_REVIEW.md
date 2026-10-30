# Private supplier catalog intake — 2026-10-30

## Source and data handling
An earlier supplied `source-costs.csv` has **63 strength variants / 47 distinct product labels** with **unverified wholesale costs**. The imported data is NOT published in GitHub, Next.js bundles, public API listings, customer catalog, or GitHub CI fixtures.

- The original source is retained separately in the user's Library.
- The 63 rows were loaded directly into the RLS-protected Apex development Supabase `supplier_import_candidates` table, scoped to the ONE existing shared Apex storefront.
- Exactly 63 candidates (source indices 0–62) and 47 unique names were verified after import.
- `public.products` and `public.inventory_items` still have zero rows. Source costs are not retail prices; the sheet contains no verified available stock or real SKUs.
- `review_status` defaults to `unverified`. Lily or Tierra can mark `under_review`, `approved_for_draft`, or `hold` from the supplier-only `/supplier/imports` page. A review status does not change product listing or inventory.

## Access control
- SQL: `database/sql/apex_private_supplier_import_review.sql`.
- RLS self/member read and private store owner/manager status-only update.
- Only the `review_status` field is updateable by authenticated suppliers. Wholesale costs, supplier IDs, product names/strengths and source indices are protected.
- All review-status changes are audited in a separate append-only table by a non-exposed trigger function.
- No supplier can insert invented verified costs or erase audit entries.
- No product, stock, order, payout, wallet or publishing writes are triggered by a review status change.

## Review gates
1. Confirm Lily and Tierra see the same private 63 variants; non-members cannot.
2. Check actual names/strengths, supplier invoices/availability, eligibility and source cost accuracy.
3. Collect independently approved retail prices and actual stock counts, then use the draft product editor or an explicitly reviewed approval-and-promotion workflow.
4. Product photos, documents, supplier origin and batch/testing evidence remain missing, not falsely represented as complete.
5. Review all staged PRs and do not activate live commerce without the separate launch gate.
