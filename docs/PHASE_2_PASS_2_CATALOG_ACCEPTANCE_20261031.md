# Apex Phase 2 — Pass 2: supplier catalog acceptance and image-policy blocker
Date: 2026-10-31. Review branch only; NOT deployed or merged.

## Verified against connected production infrastructure (read-only)
- The private image bucket exists, is not public, permits JPEG/PNG/WebP, and caps files at 3 MiB.
- Both hosted `storage.objects` policies for draft images contain `storage.foldername(p.name)` in their stored expressions. In the nested `public.products p` query, the unqualified `name` in the original source bound to the **product title**, not the outer storage object's path. That is a confirmed SQL name-binding mistake; the actual signed-upload flow is **not yet browser-tested**.
- Confirmed `products`, `categories` and `inventory_items` have per-supplier owner/manager RLS writes; `products` uses unpublished-only UPDATE checks, and inventory constraints reject reserved > on-hand. Column-specific authenticated INSERT/UPDATE grants exist for the draft fields used by the current server actions. No customer-facing publishing permission was added.
- The catalog page incorrectly enabled draft edit forms for `staff` when the feature flag and private store conditions held; the server already rejected those writes. This pass aligns UI with server-side role checks.
- Existing `createDraftProduct` is a **two-step** product then zero-inventory insert. It explicitly reports partial success if inventory initialization fails. Treat atomicity/recovery as a separate design review; do not assume a stock row exists merely because a product was created.
- Hosted migration history has four entries: `20261029233701`, `20261031011913`, `20261031011915`, `20261031011917`. GitHub `supabase/migrations` has the initial `20261029233701` plus differently timestamped files `20261030222500`, `20261030233000`, `20261030234500`. The hosted product/image policies also include changes maintained in `database/sql`. **Do not blindly replay migrations or deploy this proposed policy repair**; reconcile source and hosted migration records first.

## Proposed code and database changes
1. Supplier catalog controls honor `owner` or `manager` membership for the sole target private store; `staff` remains read-only.
2. Correct the **review-only setup SQL** so nested image policies explicitly call `storage.foldername(storage.objects.name)`, avoiding accidental `products.name` binding.
3. Provide `database/sql/apex_private_product_images_policy_repair_REVIEW_ONLY.sql`: preflight-guarded drop/recreate of ONLY the two image policies, retaining their bucket/role/path restrictions. **Not applied**; approval and migration reconciliation required first.
4. Add source-level regression tests. CI success is not proof of authenticated upload or row-level isolation.

## Manual acceptance gate (blocked until authorized test environment/approval)
- Owner and manager: create a harmless private **test** draft, change title/description/price/category, reload and verify persistence. No publishing.
- Owner and manager: upload a small JPEG/PNG/WebP, reload, confirm private signed image preview, reject invalid MIME and >3 MiB files.
- Owner and manager: create a zero-stock row, change confirmed stock, verify audit and stale-value protection after concurrent updates. Test failure recovery for missing inventory row.
- Staff: read assigned supplier products/stock but see no edit forms and cannot change records by invoking server actions directly.
- Unassigned supplier, another store and anonymous visitor: cannot read private supplier drafts or images and cannot modify supplier rows.
- Confirm `APEX_DRAFT_CATALOG_WRITES_ENABLED` for the exact **test environment**; do not enable production flags in this pass.
- No customer checkout, publishing, fulfillment, payments or live-wallet changes.
