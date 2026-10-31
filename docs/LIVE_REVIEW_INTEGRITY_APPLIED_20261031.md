# Apex — live review-integrity migration record (2026-10-31)

**Project:** existing Supabase `fhqpkpztercadcxspdkg`, repository `zanibethel/apex`. No new hosted database.

- **GitHub:** PR #77 merged to `main` as `475a0f4e2af3c4bcf3248ef393843d1d0451c257`.
- **Applied live Supabase migration:** version `20261031184537`, name `review_integrity_admin_private_images`.
- **Source captured in repo:** `supabase/migrations/20261031184537_review_integrity_admin_private_images.sql` contains the exact guarded SQL transaction applied from `database/sql/apex_review_integrity_admin_images_REVIEW_ONLY.sql`, with only an advisory comment header.
- **Replay warning:** this version is *already recorded* in live Supabase. Do **not** reapply or broadly `supabase db push` / `db reset`. Older payout migration versions diverge from checked-in filenames.

## Post-application verification

- One existing internally approved review remains approved. No audit invalidation events were created by installation.
- Exactly one product-change trigger, one inventory-change trigger, and one admin-only submitted-image Storage SELECT policy installed.
- Supabase Storage bucket `apex-draft-product-images` remains `public=false`, RLS enabled, anonymous role sees **zero** private objects when queried as `anon`.
- Authenticated publication privileges on `products.is_published` and `stores.is_public` remain false. Zero public products, zero public stores.
- Security advisor flags existing authenticated-callable SECURITY DEFINER review and payout RPCs and disabled leaked-password protection (pre-existing observations; review separately). Trigger functions have no direct authenticated execution grants.

## Browser acceptance

1. As verified admin, open `/admin/product-reviews`; the reviewed product's snapshot image should render using a 90-second signed Storage URL. Submitted and decided timestamps should be Central, not the UTC server time.
2. In the supplier catalog, edit the existing approved private product's description or stock. After saving, expect **Changes requested**, with an automated invalidation note. The previously approved review remains in append-only history.
3. Resubmit via the supplier workflow, approve internally as platform admin, then change inventory. Expect an additional invalidation; no-op updates should not invalidate.
4. Check unrelated suppliers and anonymous sessions cannot view admin-only images, and the product/store remain unpublished.

**No test mutation has been executed against the live reviewed product**; these steps require authenticated user/browser QA after deployment.
