# Apex — customer order engine, first integration slice

Date: November 13, 2026. Branch: `feat/apex-retail-cart-quote-bridge`.

## Problem
The new supplier-published retail showcase and the buyer's cart use different
eligibility systems. The retail showcase reads `retail_showcase_gate`, while the
old `get_public_cart_quote_source` still checks `private_release_gate` (OFF),
requires legacy category publication, and rejects uncategorized products.
So a visible, supplier-published retail listing could not be priced in the cart.

## Changes
- New, separate `public.get_public_retail_cart_quote_source(jsonb,text)` accepts
  bounded product IDs, quantities and optional discount code only.
- Verifies supplier Publish, administrator holds and visibility restrictions,
  pending review, linked imports, archived/active state, valid product fields,
  category *ownership* (not category name), global retail display gate,
  consistent store identity, private inventory readback and saved pricing.
- Returns original safe cart-source schema, saved discount and shipping
  configurations, descriptive stock availability and **all payment and order
  permissions false**.
- Missing stock is **Sold Out**, not unlimited availability.
- Buyer cart `/api/cart/quote` calls the new RPC, matching the storefront. No
  delivery/contact fields are collected by this route.
- The legacy RPC is unchanged for old read-only administrative workflows.

## Tests
Disposable PostgreSQL applies all retail migrations first, then this new RPC;
tests published cosmetics, unavailable and held products, repricing, available
and insufficient stock, shipping, discount, cross-store rejection, gate OFF,
malformed inputs and anonymous privilege restrictions. Node tests validate
the HTTP boundary and that neither quote nor handoff grants purchase rights.

## Next customer-order-engine slices (not included here)
1. Design and verify an atomic server transaction for immutable customer order
   and line records, trusted price/promotion/shipping recheck, multi-line stock
   reservation, idempotency, rollback and order expiry. Align 8-line Track 2
   admission against 20-line cart review.
2. Bind protected customer delivery details to a server-generated order ID
   with purpose-scoped encryption. Do not log, query-string, or publicly store PII.
3. Connect paid/settled-order evidence to the supplier fulfillment system.
4. Separately integrate BTCPay/Prism payment methods and turn on live checkout
   only after secure testing and production authorization.

This change **does not** create, reserve, submit, settle, fulfill, email, or
charge any customer order. Existing checkout route remains HTTP 503.
