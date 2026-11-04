# PR #205 — Multi-item order admission review

## Implemented
Admin-only `/admin/order-admission` now allows an authorized platform administrator to select **1–8 distinct saved products**, choose quantities 1–10 (up to 50 units total), and inspect one multi-line order against existing private database checks.

The server:
1. Validates bounded UUID product selections. It never accepts a browser-supplied price, inventory quantity, payout recipient, or stored quote.
2. Verifies the current Supabase admin session with `getUser` and the existing verified role check.
3. Calls `get_admin_private_cart_validation` for the **server-observed** starting subtotal and product eligibility.
4. Immediately calls `get_admin_locked_cart_preflight` for the same cart and expected subtotal. This existing RPC checks catalog, stock, release checks and stale prices under NOWAIT row locks. Locks **expire with the RPC transaction**, and no stock is reserved.
5. Strictly parses all returned lines: same store/product IDs, quantity, saved unit prices and exact line totals, available units, release check flags, and nonpayable rights.
6. Reads stored USPS Padded Envelope and Medium Box prices, and an optional stored promotion code using admin RLS; computes post-discount shipping on the server.
7. Shows the admin each line's current private stock and release requirements and the informational grand total, only when all prices verify.

## Safety
- **No database migration**, order write, inventory reservation, public release, payment intent, or BTCPay invoice action.
- No customer address or personally identifying information is sent or stored by the new admin review.
- Client input carries IDs and quantities only; no client-total trust.
- All customer checkout and public product-release gates remain disabled.
- Stale observations, missing private permissions, invalid promo codes, malformed entries, insufficient stock and product authorization failures all remain blocked.
- The review is not a valid hold, quote token or payable order. A future actual order must separately recheck and reserve stock inside its own transaction.

## Acceptance checks
- Up to 8 unique products; 50 units total; 10 units per SKU.
- Verify one multi-line, read-only locked snapshot, per-item inventory and independent seller/product gates.
- USPS Padded Envelope or Medium Box; free shipping begins at **$200.01** of merchandise after discount; eligible free-shipping code still works.
- Invalid/expired code fails closed.
- All money from saved database records; no sales tax.
- DB and app CI must pass. No deployment without verification.

## Next major milestone
After product and merchant authorizations, public catalog eligibility, inventory stock, destination/fulfillment policy and payment approvals have been established, build a **separately authorized** transactional order controller that atomically reserves stock, creates immutable order line snapshots, binds customer identity and shipping, and then coordinates BTCPay invoice creation using already tested reconciliation/fencing foundations. This PR does not claim those controls are live.
