# Apex public retail product images — automatic on supplier Publish

November 14, 2026

## Operator behavior
- A supplier owner/manager uploads or selects an image in the existing private product editor. **No separate administrator approval of the image is required.**
- When the same product is supplier-published and passes current public **retail showcase** visibility checks, its saved image is displayed automatically on the catalog tile and product detail page.
- Zero stock still produces **Sold Out** and the checkout engine remains OFF; images do not allow purchases or create orders.
- Unpublish, admin hold, pending corrections, product deactivation, archived product, category not eligible, a revoked showcase gate, or a removed image makes the public image unavailable on the next fetch. A replacement image path is used on the next request.
- The original private supplier Storage bucket is **never** made public. Only an authorized backend retrieves the bytes, checks product-scoped UUID paths, MIME/magic bytes and 3 MiB size, and sends an image with `Cache-Control: private, no-store`. The public browser only knows a product UUID under `/api/catalog/retail-media/v1/[productId]`.
- Original separate reviewed/immutable-media route `/api/catalog/media/v1/[productId]` remains unchanged.

## Implementation
- Database: `public.apex_retail_showcase_image_source_v1(uuid)` is SECURITY DEFINER with strict product/store/supplier-publication/admin-state checks. **EXECUTE only for `service_role`**; anonymous/authenticated users cannot obtain a private Storage path.
- Supabase Edge: existing `apex-media-v1` function gains a separate `GET /retail/{productId}` read. It downloads only the path from the privileged DB resolver, verifies the actual file bytes and length, and rechecks release after download. No raw path or signed Storage URL is returned.
- Next.js: the retail image proxy forwards only allowlisted MIME/size content. Default-closed on invalid IDs, upstream error, unexpected MIME or oversized response.
- React gallery: retail cards and detail pages use the new route automatically; failed images continue to show the decorative placeholder.

## Deployment order and verification
1. Merge after both Apex quality checks and disposable PostgreSQL tests pass.
2. Apply the checked-in migration to Apex Supabase project `fhqpkpztercadcxspdkg`. Verify `anon` and `authenticated` lack EXECUTE, `service_role` has EXECUTE.
3. Deploy the **entire existing** `apex-media-v1` Edge function from the merged `index.ts` with `verify_jwt=false` (it explicitly authenticates protected POST routes itself). This supplements, not replaces, reviewed image delivery.
4. Verify the live catalog displays the five preexisting zero-stock demo images; verify denied images still return 404. Check the exact public binary response for at least one item, MIME and cache headers.
5. Reconfirm `apex_internal.retail_order_engine_gate.enabled=false`, zero order holds, inventory still zero, and all five demos return `can_checkout:false`.

## No additional approval
This retail image feature intentionally does not depend on private product review submission, image rights evidence, immutable approved media versions, supplier authorization proofs, public-category publication or the separate `private_media_delivery_gate_v1`. Existing supplier-controlled product publishing, admin holds and visibility restrictions still apply. Suppliers remain responsible for having permission to use their uploaded images.

No admin review actions, inventory writes, schema storage-public grants, checkout approvals, Bitcoin invoices or payouts are part of this feature.
