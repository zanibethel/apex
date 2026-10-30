# Apex private product management and discount codes — preview pass

## Supplier product editor
All supplier operators (Lily = owner, Tierra = manager) work in the **same** private storefront:
- Title (`products.name`), SKU, product description, category.
- Retail price in USD cents and optional **compare-at** reference price in USD cents. Compare-at must be **strictly greater** than the current price; a discounted percentage is displayed for preview. The supplier must substantiate any claimed reference price; wholesale cost is never copied into compare-at.
- **Active/inactive** is a separate internal catalog flag; default is inactive. Neither status publishes the product. Existing publishing controls remain restricted and the storefront is private.
- Private product image: JPEG/PNG/WebP, maximum **3 MiB**, stored in a non-public Supabase Storage bucket with a path `<store_id>/<product_id>/<random_uuid>.<jpg|png|webp>`. Only signed-in owner/manager of the same supplier may request a single-use signed upload token or attach an image. RLS restricts Storage INSERT/SELECT to that product; no client credentials with elevated access. There is no Storage UPDATE or DELETE grant. Signed preview URLs are short lived (120 seconds).
- Audit: existing immutable catalog triggers record product updates including compare-at, status and image path.

## Supplier discount-code management
New `/supplier/discounts` UI, private `supplier_discount_codes` and append-only `supplier_discount_audit`.
- Code: 3–24 upper-case ASCII letters/digits/underscore/dash; unique within storefront.
- **Percentage** discounts from 1–95% or **fixed USD cents**.
- Minimum subtotal, optional start/end dates, optional maximum redemptions, active/inactive (default inactive).
- Supplier may create, edit rule fields, or enable/disable, but cannot change store ID, creator, code after creation or redemption count via client grants.
- No public/cross-supplier discount-code reads; owner/manager scoped RLS.
- All quote math uses **integer cents**, checks active state, date window, minimum subtotal, usage limits, and clamps discounts to subtotal. One code per quote; no stacking.
- `/supplier/discounts` includes a **test subtotal + code preview**, which does **not** create orders, consume usage limits, or change an actual checkout.

## Checkout integration gate (NOT implemented)
The checkout UI, cart, real orders, and Bitcoin settlement are not enabled. For future checkout, build a server-authoritative order quote from catalog items and quantities rather than accepting a client subtotal, verify an active/published/available product, reserve promo redemptions atomically with the order and snapshot item prices, discount rules, and payout split at the time of order. Never trust client-reported discounts or counters. Redemption counts cannot be edited by suppliers.
Do not enable actual code redemption, payments, order placement, Bitcoin payouts or public product listing under this PR.

## Release gates
1. Run CI: lint, TypeScript, unit quote tests, database tenancy tests.
2. Apply database migrations to **development/staging only**, then verify grants, RLS, private bucket and role-specific workflows.
3. Enable `APEX_DRAFT_CATALOG_WRITES_ENABLED=true` and `APEX_DRAFT_PROMOS_ENABLED=true` for this preview branch only. Test image types/sizes and signed upload/attach with a controlled draft product, compare-at constraints, active toggle, and code math.
4. Lily and Tierra test the same draft catalog. Nonmember must be denied. Verify source variants remain unverified without explicit supplier review.
5. Review screenshot/visual quality and protect against malicious uploads (image signatures, resize/transcode and abandoned-object cleanup can be added before public publishing).
6. Keep production branch and live commerce separate until product authorization, payment provider eligibility, MFA, rate limits, wallet-signing controls and audit/reconciliation are verified.

## Development installation status — October 30, 2026
- GitHub Actions combined application/DB CI passed for the implementation after the strict TypeScript correction.
- The product/discount and Storage RLS migrations have been **applied to the dedicated Apex development Supabase project only**. Verified `products`, `supplier_discount_codes`, and `supplier_discount_audit` have RLS; Storage bucket `apex-draft-product-images` is **private**, 3 MiB limited and accepts JPEG/PNG/WebP, with scoped INSERT/SELECT policies and no write/delete policies.
- Post-installation verification: **63 supplier import candidates**, zero actual product records, zero discount-code records, zero discount audit records.
- Server feature flags for product edits, private image uploads, draft codes and preexisting test wallet/split features are enabled **only on the feature branch Vercel preview**.
- A full supplier account-holder browser upload and checkout simulation is still pending. Do not claim live checkout applicability, actual coupon redemption, image propagation or production readiness until explicitly tested.
- Remaining auth warning: enable Supabase leaked-password protection before release.
