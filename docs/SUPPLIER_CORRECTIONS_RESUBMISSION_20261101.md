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
- The reviewed source `database/sql/apex_supplier_corrections_resubmit_REVIEW_ONLY.sql`
  was applied to hosted Apex Supabase as migration
  `supplier_private_corrections_resubmission` (2026-11-02 UTC), after
  disposable PostgreSQL/RLS CI passed. It adds an immutable correction event
  and a store membership-checked RPC. No public product, store, payment,
  release gate or product authorization was modified.
- Hosted readback verified function presence, authenticated-only EXECUTE,
  no anon EXECUTE, membership validation, the new audit action, zero public
  products/stores, and the independent global public release gate OFF.
- UI is enabled only with
  `APEX_SUPPLIER_CORRECTIONS_RESUBMIT_ENABLED=true`; absent/false still
  shows existing manual review guidance.
- Supabase security advisor flags the new intentionally privileged,
  authenticated-executable SECURITY DEFINER function; its body checks
  `auth.uid()` and active supplier owner/manager membership on a private store
  before mutating anything. The advisor warning is expected and merits review
  alongside the existing privileged RPCs.
- No fabricated public inventory or public-facing product tiles.

## 2026-11-02: administrator visibility and complete synthetic roundtrip
- The admin's authenticated private listing card now displays the most recent
  supplier correction note and timestamp directly when a hold/review remains,
  rather than hiding the explanation exclusively in the event accordion.
- The audit timeline names the `supplier_corrections_resubmitted` action.
  A later admin hold/review/unlock/unpublish decision closes the pending
  correction indication; the supplier's note does not authorize release.
- Disposable PostgreSQL integration now exercises supplier note RLS isolation,
  admin review/unlock, independent supplier publication intent after unlock,
  required audit events, and the still-disabled global public release gate.
- No production product data or administrative holds are created for testing.
