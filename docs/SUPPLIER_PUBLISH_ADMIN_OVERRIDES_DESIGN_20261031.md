# Apex Phase 2 — supplier publication preference / admin override

Date: 2026-10-31. New feature branch against `zanibethel/apex`. Intended target is the **existing** Apex Supabase project `fhqpkpztercadcxspdkg`; no new hosted database/branch.

## Proposed operator model

Supplier owners/managers can set **Request publication** or **Remove request** for a fully populated, internally active private draft. A checked, server-side RPC requires valid supplier membership and all eight existing product setup fields; there is **no mandatory initial manual content-review approval** for creating a publishing preference. Ordinary inventory and price adjustments no longer invalidate historic internal-content approval.

Platform administrators have a **Listing controls** page to **Place on hold**, **Require review**, and **Approve republishing**, each recorded with a reason/action. A hold or required review wins over any supplier preference, forcibly clears the requested state, and cannot be undone by a supplier, including by submitting the RPC directly. Administrator approval of republishing clears the restriction **but does not automatically restore** the supplier's prior publish preference: a supplier must request again. Source history is retained.

The interface always labels supplier publishing preference as **not live**. It is a private release-intent and admin-override management system, **not public catalog deployment**. Existing `products.is_published`, `categories.is_published`, `stores.is_public`, private Storage bucket, customer checkout, orders and payments remain unchanged and disabled. A public release feature must later require independently established lawful product eligibility, seller authorization, public product image delivery and additional marketplace operations checks. **Do not treat saved preference or admin reapproval alone as authorization for a public listing.**

## Database changes (not yet applied)

`database/sql/apex_supplier_publish_admin_override_REVIEW_ONLY.sql` introduces two RLS-protected tables:
- `supplier_listing_controls`: per-product desired supplier visibility, administrator gate, release approval, reason, and snapshot of name/SKU for admin listing cards;
- `supplier_listing_events`: append-only per-product supplier/admin actions and reasons.

Authenticated users have SELECT only, further limited by RLS to owner/manager of the same supplier or the server-controlled `app_metadata.apex_role=platform_admin` JWT. No direct Data API INSERT/UPDATE/DELETE privileges. Authenticated-callable `SECURITY DEFINER` RPCs verify actor role, product store, private record, permitted state transitions, and lock product/control rows before mutations. Anonymous EXECUTE denied. `search_path=pg_catalog` pins database function resolution. No service-role secret is exposed.

This migration also replaces the old broad internal review invalidation trigger so *material product content* (name, SKU, description, category and image path) still requires content re-review, but ordinary price/inventory and internal activation edits do not invalidate the existing content approval. The old stock invalidation trigger is removed. Future public sellability checks **must evaluate current stock and eligibility dynamically** regardless of review status. The automated PostgreSQL suite covers both behaviors.

The existing private product remains unpublished. **Do not** run this SQL on hosted Supabase until code review and CI success. Do not run any broad `supabase db push` or `db reset`: historical hosted payout migration versions still differ from checked-in files. After an approved migration, capture the exact hosted migration version in its own traceability PR.

## Acceptance/QA

1. Login as owner/manager, choose **Request publication** on an eight-of-eight private draft. It displays supplier intent saved but not live.
2. Login as platform admin, open **Listing controls**, choose **Place on hold** with a reason. Supplier preference is cleared, reason visible and supplier request blocked.
3. Admin chooses **Approve republishing**. Supplier can choose Request publication anew. It remains private.
4. Admin chooses **Require review**. Supplier cannot republish until a separate admin release.
5. Staff, anonymous and unrelated suppliers cannot access another supplier's listing controls. Audit history is read-only.
6. Price and stock updates preserve internal approval; material description changes still invalidate it.
7. Confirm zero publicly published product/category/store flags remain and no checkout/payment/fulfillment actions were enabled.

Not covered: true public storefront publishing, global supplier-wide holds, duplicate-listing detection, lawful eligibility verification, public storage migration, compliance documentation, order processing or automatic public visibility. Those are separately gated requirements.
