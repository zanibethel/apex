# Apex live internal product review — deployment record (2026-10-31)

**Existing Supabase project:** `fhqpkpztercadcxspdkg` (no additional project/hosted branch).

**Applied hosted migration:** `20261031182638` — `enable_private_product_internal_reviews`.

**GitHub release:** PR #75 merged to main, commit `68322eb49c7a25cccfedbbea1ac2f0998c21dd94`. Vercel production release status should be checked separately; a GitHub merge alone does not establish an active production deployment.

**Versioned migration capture:** `supabase/migrations/20261031182638_enable_private_product_internal_reviews.sql` preserves the exact reviewed SQL file used by the migration tool, with a caution header. The matching original source remains `database/sql/apex_private_product_review_REVIEW_ONLY.sql` (historical source name only). **Do not reapply this migration to the current hosted database.**

## Post-application readback

- Review-state rows: 0. Review-history rows: 0. The current product remains intact and privately stored.
- RLS enabled for both private tables; exactly two SELECT policies.
- `anon` SELECT, RPC EXECUTE: denied.
- `authenticated` SELECT: enabled but restricted by owner/manager or platform-admin RLS.
- `authenticated` direct INSERT/UPDATE into state and direct INSERT into review history: denied.
- Both RPCs callable by `authenticated`, with separate server-side owner/manager or trusted platform-admin JWT checks.
- Published products: **0**; public storefronts: **0**; products: **1**.
- Supabase advisor includes two expected warnings for the intentionally authenticated-callable SECURITY DEFINER review RPCs. Their role/tenant and submission constraints are explicitly enforced inside the functions and covered by the disposable PostgreSQL integration tests. The advisor also continues to flag an older payout RPC and leaked-password protection disabled.

## Browser acceptance

1. Owner/manager logs into live supplier catalog and submits a complete eight-of-eight private draft.
2. Verified platform admin logs in at `/admin/product-reviews` and requests changes with a note.
3. Supplier sees the note, corrects the private product and resubmits.
4. Admin approves internally; both roles see the internal status and history remains append-only.
5. Confirm `is_published=false`, `stores.is_public=false`, and no checkout/payment/payout workflow activated.

**Migration-history drift:** Earlier hosted payout migration versions differ from checked-in filenames. Do not run a broad `supabase db push` or `db reset`. Coordinate version reconciliation as a separate reviewable change.
