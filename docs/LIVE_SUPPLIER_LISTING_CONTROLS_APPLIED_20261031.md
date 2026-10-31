# Apex — Live supplier publication intent and administrator override controls

**Date:** October 31, 2026. **Existing Supabase project:** `fhqpkpztercadcxspdkg` (no new database).

- Merged source: [PR #80](https://github.com/zanibethel/apex/pull/80), `main` commit `2b16b6fa0fd2f56746024ec2af7c2d8c6d983823`.
- Hosted migration: **`20261031194850`**, **`supplier_listing_admin_override_controls`**. Applied exactly once and verified.
- Repository capture: `supabase/migrations/20261031194850_supplier_listing_admin_override_controls.sql`; preserves reviewed SQL (advisory header only).
- Previous hosted migration history has known payout filename/version drift. **Do not reapply this migration, run broad `supabase db push`, or reset the database.**

## Verified live database security immediately after migration

- Both `public.supplier_listing_controls` and `public.supplier_listing_events` exist, have **RLS enabled**, and start with zero rows. No test product or admin override was created.
- Anonymous SELECT and RPC EXECUTE denied; authenticated SELECT is additionally restricted by RLS to supplier owner/manager of the same store or verified platform admin.
- Authenticated users have no direct INSERT/UPDATE on controls or direct INSERT on events; two authenticated-callable, role-enforcing SECURITY DEFINER RPCs implement allowed changes.
- Material-content review trigger retained (name/SKU/description/category/image). Inventory-change trigger removed; routine inventory, price, compare-at and activation updates no longer automatically revoke *internal content approval*.
- One existing product remains `approved_internal`; **zero publicly published products and zero publicly enabled storefronts**. The private-image Storage bucket and customer commerce flows were untouched.

## Live manual QA

1. Supplier owner/manager signs in to `/supplier/catalog`, chooses **Request publication** on an 8/8 complete private draft. The saved preference must still display **not live**.
2. Verified admin opens `/admin/listing-controls`, chooses **Place on hold** with a reason. The supplier's request is cleared. Supplier cannot request publication while held.
3. Admin **Approves republishing**. The hold clears without auto-publishing. Supplier explicitly requests again.
4. Admin chooses **Require review** with a reason. Verify it blocks subsequent supplier requests until admin release.
5. Price and stock updates should preserve internal content approval, while material description/label edits should invalidate the prior content approval. These were verified in isolated CI tests; don't mutate the user's approved product without intent.
6. Verify staff/unrelated suppliers cannot bypass holds; confirm zero public product/store flags, public images, checkout, payments or fulfillment remain disabled.

## Limits and future gates

These are internal publishing **preferences**, not actual public publication. Publication must remain separately gated on approved product legality and supplier authorization, public image delivery, emergency takedown enforcement, and release controls. Also needed before any actual release: supplier-wide holds, blocked-duplicate detection, stock/eligibility checked at view and transaction time, and effective administration when a listing is already public. Admin hold takes precedence for the current product record in these private controls, but does not yet provide global duplicate detection. Review source: `docs/SUPPLIER_PUBLISH_ADMIN_OVERRIDES_DESIGN_20261031.md`.
