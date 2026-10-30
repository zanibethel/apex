# Approved source variant → private draft workflow

## Why this exists
The shared supplier cost sheet contains 63 variants and 47 distinct product names, but every wholesale cost is unverified; actual retail prices and on-hand quantities were not supplied. This workflow must not treat source data as a retail catalog, verified stock, or live commercial inventory.

## Workflow for Lily and Tierra
1. Sign in through Supplier and open **Supplier Import Review**.
2. Check product identity, strength, supplier documentation, and eligibility independently.
3. Mark the entry **Ready for draft**; doing that alone creates no product.
4. On that approved row, enter a **unique internal SKU**, a separately confirmed **retail price**, a real on-hand quantity (enter **0** when unknown), and optional private description. Confirm the retail price is not copied from the source-cost spreadsheet, and independently confirm any nonzero on-hand stock.
5. Select **Create private draft**. The atomic database function creates one unpublished product, its inventory row, an immutable product/stock audit, and the one-to-one source association. Supplier members will see the same draft in Products and Inventory.
6. A variant that already has a draft is marked accordingly; duplicate promotions are blocked by the database. Any failure rolls back all writes.
7. The draft stays **unpublished**, and neither checkout nor payouts are enabled.

## Release/security design
- New SQL: `database/sql/apex_candidate_draft_promotion.sql` applies a same-store candidate/product link with one-to-one uniqueness, source approval checks, and RLS.
- `public.create_draft_from_supplier_candidate` is a **SECURITY INVOKER** RPC. It requires a current signed-in supplier owner/manager of the relevant **private** store; direct unreviewed, cross-store, non-member and duplicate attempts fail.
- Wholesale costs are never copied into the retail price field; only an explicitly supplied positive USD cents amount is inserted.
- Quantity is never inferred from the source sheet. It is explicitly entered, and the UI requires an acknowledgement for nonzero quantities.
- No service-role key or signing key is used. Existing product/inventory audit triggers execute on successful inserts.
- The underlying draft product editor remains available to authorized members. This PR does not activate public publication, payment, live wallet forwarding, or order fulfillment.

## Verification
- Disposable PostgreSQL CI: `database/tests/supplier_candidate_draft_promotion_integration.sql` extends the existing tenant isolation fixtures and tests approved-only, duplicate rollback, explicit retail price/quantity, internal audit and cross-member denial.
- JS guardrail tests verify RLS-invoker semantics, unique mapping, server-side membership, explicit confirmation and UI conditions.
- Use a controlled verified supplier account to test full page flow in the protected preview. Do **not** use unverified supplier data as a stand-in for real retail/stock validation.
- Proposed SQL should be applied to the Apex **development** Supabase project only after tests pass and the review gate is satisfied. Apply via a guarded migration; do not put secrets or wholesale price rows into the repository.
- After applying staging migration, enable `APEX_DRAFT_CATALOG_WRITES_ENABLED=true` **on this feature preview branch only**; retain production off. Validate direct URL and unauthorized access fail closed.

## Current-state caution
Until Lily/Tierra review variants and supply prices/stock, actual product and inventory counts should remain zero. This is intentional—not a failed data import.
