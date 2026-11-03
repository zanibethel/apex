# Apex PR #189 — Admin-only live cart validation

**November 3, 2026.** Adds read-only server-side validation to the real saved-catalog checkout review. It is neither a public quote engine nor a payment service.

## What admins can test
At `/admin/checkout-review` select a saved product and a quantity (1–3), then choose **Validate saved price and stock**. A verified platform-admin server action calls `public.get_admin_private_cart_validation`, which reads the current **Supabase product price and inventory**, independently recalculates an observed USD subtotal, and calls Apex's existing authenticated `get_private_release_readiness` function for seller/product/admin checks. It returns private observations: saved unit price, subtotal, available quantity, read-only release checks and a status reason. Customer contact/shipping form fields are not transmitted with this action.

The backend ignores all browser-supplied prices, savings, subtotal, stock and release flags. The only submitted fields are product UUID and bounded quantity. It uses one predetermined Apex store ID; database access is scoped to that store. Input is also bounded at the RPC itself to an array of 1–8 unique items, up to 10 units per line and a fixed maximum subtotal.

## Hard launch boundaries
The RPC returns `can_quote=false`, `can_reserve_stock=false`, `can_create_order=false`, `can_create_invoice=false`, and `can_pay=false` **unconditionally**. It cannot make any product purchasable or authorize shipping/tax, BTC currency conversion, merchant service, payment or fulfillment. It performs no SQL writes, no stock reservation and no external HTTP requests. The independent global catalog release gate must remain off for this admin inspection. A future genuine order writer must revalidate every product and lock inventory in its own transaction; observational snapshots are not sufficient for sales.

## Verification
Disposable PostgreSQL tests impersonate anonymous, suppliers and verified admins, reject malicious extra fields, duplicate products, foreign-store products, invalid quantities, and demonstrate a second read reflecting a newly changed stored price/stock without any order or invoice rows being created. Node tests assert the returned structure and that neither server action nor React UI exposes payment operations.

**Deployment sequence:** exact-head CI, isolated PostgreSQL and preview first; then install this one security-checked RPC in hosted Supabase (without changing products, stock, orders or wallets), verify anon denial and gate still off, then merge/deploy the UI.

## Next
A future independently approved authenticated order controller with product eligibility and inventory locking; then durable one-shot invoice intent reservation and provider webhook reconciliation. This PR has no customer checkout endpoint.
