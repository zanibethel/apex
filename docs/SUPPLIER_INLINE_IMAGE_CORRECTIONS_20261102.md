# Supplier inline image corrections — 2026-11-02

## Supplier experience
- Supplier owner/manager opens `/supplier/catalog/bulk`.
- The product card keeps its compact first row: checkbox, **title, pencil, Publish toggle**.
- A small image-status chip appears below that row. When the admin requests
  corrections, the card shows **Image corrections needed**.
- Open existing **Status details** to read exactly what must change. The
  **Edit image and product details** button opens the existing pencil editor
  on the same card. No separate dashboard navigation or new review wizard.
- Images missing, changed after a submitted review, or not yet checked show
  helpful non-public statuses. Old feedback never masquerades as a current
  submission's verdict.

## Data boundaries
- Administrator's private `private_media_evidence_events` remains exclusively
  admin readable; identity/rights evidence references are NOT given to suppliers.
- A new append-only `supplier_media_feedback_events` projection carries only
  store/product/submission/image IDs, an outcome and (for **needs_correction**
  only) the admin's explicitly supplier-visible correction note.
- A SECURITY INVOKER database trigger writes this projection atomically when a
  trusted admin records a media evidence event. The supplier can SELECT
  only its own private store records through membership and RLS, never
  INSERT/UPDATE/DELETE them. An unrelated supplier/guest sees zero records.
- Existing private review snapshots are checked against the *current product*
  image path and submission ID; stale notes show as requiring new review.
- RLS query pagination and errors fail closed as **Image status unavailable**.
  No unverified image is described as "approved for public release".

## Rollout
- Migration: `database/sql/apex_supplier_media_correction_feedback_REVIEW_ONLY.sql`.
- Synthetic Postgres: `database/tests/supplier_media_correction_feedback_integration.sql`.
- UI helper: `src/lib/catalog/supplier-image-correction-status.mjs`.
- Exact-head CI, Vercel preview, reviewed hosted migration and RLS permission
  readback before merging to production. No synthetic product or evidence
  records are written in hosted Supabase.
- No public images, release activation, checkout or crypto payments.
