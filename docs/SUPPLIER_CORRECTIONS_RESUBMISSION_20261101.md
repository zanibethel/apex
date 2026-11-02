# Apex supplier corrections resubmission — proposed pass (2026-11-01)

## Problem
The bulk card said "Edit and resubmit for review", but the link only opened
another edit page. No actual resubmission or administrator notification was
persisted. This pass adds an explicit, audited **private correction request**
without treating an update as automatic publication or overriding a hold.

## Proposed supplier workflow
1. On a held card, open **Administrator feedback**, read the reason, and use
   the existing pencil editor (including image and inventory editing).
2. **Save selected** edits. A card with unsaved changes cannot submit a review
   request. Fill in the short **What changed?** note.
3. Click **Resubmit corrections for review**. The server verifies the logged-in
   supplier owner/manager, private store/product, and active hold/review.
4. An immutable event records the note and makes the existing admin queue show
   **Corrections awaiting review**. The supplier sees that it was submitted.
5. The administrator decides whether to **Unlock after review**, require
   further corrections, or retain the hold. Unlock does not publish anything.

## Database / rollout
- `database/sql/apex_supplier_corrections_resubmit_REVIEW_ONLY.sql` is a
  **proposal, not an applied migration**. It adds an allowed immutable audit
  event and a permission-limited, membership-checked RPC. It modifies no
  public product, store, payment, release gate or authorization.
- The UI is hidden unless `APEX_SUPPLIER_CORRECTIONS_RESUBMIT_ENABLED=true`
  **AND** the reviewed hosted RPC has been separately installed and read back.
- Run disposable Postgres RLS tests, confirm anon cannot execute, then apply
  only with explicit deployment review. Keep public release gate OFF.
- No fabricated public inventory or public-facing product tiles.
