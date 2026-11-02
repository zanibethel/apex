# Apex supplier image readiness queue — November 1, 2026
Reviewable rollout: PR #143

## Verified source state
Apex's connected hosted Supabase currently has **1 saved private product**, **1 linked private draft image object**, **0 published products**, and **62 unverified source variants**. The single uploaded image must not be represented as verified proof of identity or composition for 62 unrelated product variants.

The existing private bucket `apex-draft-product-images` is **not public**. Existing supplier image upload/reuse is stored under separate `<store_id>/<product_id>/<uuid>.<jpg|png|webp>` paths, and the admin content review system already takes a product snapshot and independently signs images to review within the authenticated admin workspace.

## Delivered
- `/supplier/catalog/media-readiness` — authenticated supplier **owner/manager only**, exactly one private assigned store. This page shows a bounded, complete list of up to 100 unpublished saved products. Errors or truncated results fail closed.
- Each private product is classified by a strictly parsed store/product image path, exact object existence (scoped `Storage.list`), and short-lived (120-second) **authenticated** signed preview URL. No public URL is generated, no storage bucket is made public, and no image files are copied.
- Review status is read from `private_product_review_states`. A matching `approved_internal` snapshot image is reported as *internal content review for unchanged submitted image*, **not image identity verification, market authorization or public image approval**.
- Empty/malformed paths, missing files, expiring signed previews, and changed image snapshots never claim image approval.
- Per-product links take the owner to the existing image uploader, private offer preview, and product editor/internal review workflow. The supplier dashboard, bulk product editor and approved draft-creation screen link to this new image readiness page.
- **No database schema, RLS privileges, buckets, writes, approved public images, release flags, payment URLs, carts, orders or Bitcoin actions are changed by this pass.**

## Rules for public image delivery (future separately reviewed pass)
1. A supplier must first attach a **product-specific accurate** image and confirm the source/product identity, ingredient or blend label, usage rights, and batch documentation. Reusing the illustrative photo from another product is not in itself verification.
2. Existing `approved_internal` approval is a content review only. Public release additionally requires unexpired verified supplier/product authorizations, appropriate product eligibility, clear administrative holds and category/store release permissions.
3. Once independently signed off, create a **versioned media approval record** tied to the exact product ID and immutable content digest, plus approved URL/path in a **separately owned public delivery location**. Require explicit admin approval and prevent supplier edits from silently reusing approval for a changed image or caption.
4. The public sold-out projection must join that record and restrict output to approved media mappings. Do not reuse signed URLs or draft bucket paths in public output. Public asset URLs should be restricted to an approved origin and file extension, with immutable versioning and fast revocation.
5. Never switch `apex_internal.private_release_gate.enabled` to true or turn on `APEX_PUBLIC_SOLD_OUT_CATALOG` merely because a picture or stock was uploaded. Real purchasing is a separate authorization and payment-provider launch.

## Verification
CI must pass lint, TypeScript, Node source/security checks, Next.js build and isolated PostgreSQL/RLS. Preview Vercel must be READY before merge; production `apexanabolics.co` must alias exactly the merged commit before claiming live status.

See Supabase Storage docs: https://supabase.com/docs/guides/storage
