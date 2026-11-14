# Apex Phase 2 — controlled in-stock cart and inventory QA
**Date:** November 14, 2026  
**Production:** https://apexanabolics.co  
**Admin-only test:** https://apexanabolics.co/admin/cart-qa  

## Purpose and safety boundaries
Apex already has a public read-only cart quote endpoint backed by `public.get_public_retail_cart_quote_source`, automatic USPS package selection, discount evaluation, and browser price/stock refreshes. The five supplier-published demo records intentionally have **zero available stock**. This PR does NOT modify their inventory or publish a new catalog product.

Instead, it adds a **dedicated admin-only browser journey** using a clearly labeled **synthetic** in-stock item. The isolated server endpoint runs the exact existing shared `buildCartReview` and `previewCheckoutCharges` calculation path. The test product/price/stock/shipping cannot be supplied or altered by the browser, and have no database row. Requests are checked with the standard verified platform-admin server session and same-origin checks; no prices, inventory or customer PII are written to Supabase.

Production checkout, paid order handoff, customer submissions, BTCPay/Prism and supplier shipping continue to be independently disabled.

## Interactive browser procedure
Sign in as Apex platform admin, then select **Cart & inventory QA** in the admin control room.

1. Select **Add to Cart (test)**. One unit has a server-assigned $59.99 price, $15 padded-envelope shipping, and a $74.99 estimated total. No order is created.
2. Increase to **2 units**: quantity edits refresh automatically and padded-envelope packaging remains. Expected $134.98.
3. Increase to **3 units**: automatically select the USPS **Medium box** ($25.80 shipping), totaling $205.77 before discounts.
4. Increase to **4 units**: threshold of $200.01 is exceeded and shipping becomes **Free**; total $239.96.
5. Apply **TEST10** at 3 units: 10% off merchandise and Medium shipping, total **$187.77**; at four units the discount is $24 and shipping still free, total **$215.96**.
6. Apply **SHIPFREE** at one unit: $59.99 merchandise with free shipping.
7. Apply **BADCODE**: fail with an unavailable-code message rather than awarding a discount.
8. Increase to **5 units**: server reports **insufficient stock**; button for checkout remains disabled. The QA fixture has only four available units.
9. Use **Recheck price & inventory** repeatedly and verify no order reference, payment link or stock hold appears. Use Remove to empty the test cart. Reloading the page clears the synthetic test selections.

This is an interactive UI test, **not a real production inventory fixture**. Four units are an immutable synthetic server constant; no product row is introduced or modified in Supabase, and no customer order can be submitted from this page.

## Real database acceptance
The isolated `retail_test` PostgreSQL 17 CI job installs Apex's real retail catalog/quote functions and then executes `tests/retail-visibility-migrations/controlled-instock-cart-qa.sql`.

The test starts a transaction, reprices an existing **disposable fixture** to 5999 cents and sets 4 available units, 0 reserved; verifies anonymous RLS-scoped quote source for quantities 1–5, server-derived prices, in-stock and insufficient-stock transitions, saved TEST10 and SHIPFREE promotions, invalid code response, no order/invoice/payment permissions and **zero reserved stock after quotes**; then `ROLLBACK` ensures no persistent test stock change. The regular Node tests independently validate the exact matching discount/shipping totals with the same `buildCartReview` implementation used by the site.

CI must pass both the regular Apex quality suite and the dedicated disposable retail PostgreSQL migration suite before merging.

## Production checkpoint after merge
- Vercel production deployment must be READY at the merged commit.
- Verify `/admin/cart-qa` redirects unauthenticated/non-admin users and that a verified platform admin can run the test.
- Recheck exactly **five** original `DEMO-%` listings, all still zero stock.
- Recheck `apex_internal.retail_order_engine_gate.enabled=false`, zero real order holds/delivery envelopes.
- No BTCPay credentials, payment subscriptions, supplier fulfillment or registration settings should change.

## Beyond this step
When an independently approved real in-stock item and launch test plan are available, run a separate controlled test using the actual public catalog and production quote route. Do not treat a synthetic in-stock QA result as verification of a production live purchase.
