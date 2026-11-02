# PR #137 — private price and inventory snapshot foundation
2026-11-01

## Intent and security boundary

This pass prepares **admin-side product eligibility review**, not public sales. Apex's existing catalog currently exposes only name/description; it does not expose trustworthy public sellable prices, inventory, tax, authorization, or payment status. The existing `get_private_release_readiness` RPC explicitly returns `effective_public:false` and `public_release_enabled:false`. Neither a supplier publish request nor a private stock number is permission to sell.

This feature **does not make any product orderable**.

## New review-only database function

`database/sql/apex_private_checkout_product_snapshot_REVIEW_ONLY.sql` defines `public.get_private_checkout_product_snapshot(store_uuid,product_uuid)`:

- Runs only with a non-null authenticated user plus trusted JWT `app_metadata.apex_role=platform_admin`; it is not exposed to anonymous or ordinary authenticated accounts. `EXECUTE` is explicitly revoked from `PUBLIC` and `anon`, then granted to `authenticated` with a further administrator assertion inside the function.
- A single store-scoped query joins `products`, `stores`, `categories` and private `inventory_items`. It returns the **existing private USD price as a decimal string** (preserving bigint precision), existing product/store/category publication flags and private on-hand/reserved/available counts, plus observation timestamps. No inserted, updated, reserved or published rows.
- Missing product returns only `state:unavailable` and no price. Cross-store identifiers do not match. It ALWAYS returns `can_quote:false`, `can_order:false`, `can_pay:false`.
- The observation is **not an immutable price revision, transaction lock, accepted quote, stock reservation, permission to sell or legal authorization**. Pricing can change immediately after reading.

**Deployment:** The SQL is intentionally REVIEW ONLY, not a Supabase migration and **not applied to any hosted database** in this PR. It is executed only on a disposable PostgreSQL service by `.github/workflows/payout-rls.yml`.

## Admin application behavior

The existing platform-admin-only `/admin/checkout-readiness` view adds optional private price and stock summaries. The app authenticates through `getUser()` and `isVerifiedPlatformAdmin`, then invokes the new RPC only if **server-only** `APEX_PRIVATE_STOCK_READBACK=enabled`.

Default `APEX_PRIVATE_STOCK_READBACK=off`. Until separately approved, provisioned and enabled, the UI displays **Awaiting approved snapshot rollout** and makes NO snapshot calls. If the RPC is missing, permission is denied, IDs are mismatched, price is malformed/unsafe, stock count inconsistent, or a snapshot response suggests payable/orderable status, the pure parser fails closed. Private prices and counts never enter public catalog or customer quote responses.

## Test requirements and acceptance

- [ ] GitHub quality: lint, TypeScript, Node unit/security tests and Next.js production build, on exact branch commit.
- [ ] Disposable PostgreSQL test: admin read succeeds; regular authenticated and anonymous users cannot execute; missing product reveals no price; cents remain precise as strings; reserved stock is subtracted safely; no permissions grant checkout.
- [ ] Vercel preview READY for exact branch commit.
- [ ] Review database privilege and RLS threat model before **separate** hosted installation. No toggle may enable customer payments.
- [ ] If merged, the admin summary still shows rollout pending; leave flag **off** until a future tested database rollout.
- [ ] No change to customer cart, demo checkout, BTCPay/Prism or supplier publishing workflow.

## Next technical pass

A real product quote will require independently approved merchant/product eligibility, a **versioned/immutable price record**, a store-scoped inventory reservation transaction, category/store visibility and signed/reviewed payment-processing permissions. Implement in a separate protected server/API/SQL pass with tests and explicit approval. Never accept price, stock, authorization or release flags from the browser.
