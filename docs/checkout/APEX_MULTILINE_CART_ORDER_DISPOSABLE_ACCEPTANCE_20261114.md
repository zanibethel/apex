# Apex — disposable two-product customer cart-to-order acceptance

**Date:** November 14, 2026  
**Repository:** `zanibethel/apex`  
**Environment:** GitHub Actions isolated PostgreSQL 17 `retail_test` fixture, **never production**.

## Purpose
Promote the existing real Node.js-to-PostgreSQL synthetic purchase drill from **one product** to a **two-line** single-supplier, nonpayable cart with a saved discount and independently checked server prices. This builds directly on the existing private order engine, hardened server-side customer/session verification, durable subject admission budget, store resolver, and AES-GCM delivery envelope. It does **not** authorize publication, order submissions, invoices, payouts or shipping on `apexanabolics.co`.

## Scenario
The only catalog items in this drill are synthetic CI fixture records:
- `SHIRT-001`: cotton workout shirt, quantity 1, saved unit price **3,200 cents**.
- `SERUM-001`: topical hair-care serum, quantity 1, saved unit price **3,999 cents**.
- Discount `TEST10`: 10% merchandise reduction (rounded to **720 cents**).
- Merchandise **7,199 cents**, shipping **1,500 cents**, estimated nonpayable total **7,979 cents**.

The fixture must demonstrate the following through the real `pg` driver, actual Supabase-compatible restricted PostgreSQL roles, the production-origin body parser (using the **separate** `/api/checkout/nonpayable/v1` path), and the same private transaction functions that would be used when separately authorized:

1. **Authorized scope:** both product IDs resolve to the *same* existing reviewed supplier store. A mixed-supplier cart still fails.
2. **Transactional capture:** one immutable held order with exactly two purchased-line snapshots, each preserving SKU, unit price, quantity, and original amount. A separate envelope stores encrypted delivery with both `delivery_verified` and `shipping_authorized` false.
3. **Inventory:** the two distinct `inventory_items` rows each reserve exactly one unit. No line is silently dropped, combined, or fulfilled.
4. **Idempotency:** replay with the original session, request ID and cart returns the original order ID and doesn't reserve twice. Reuse of the same request ID with altered quantities must fail without changing the original hold.
5. **Expiration:** after the test-only harness advances the synthetic expiry, the same private expiration function transitions the hold to `expired_no_payment`, records exactly one expiration event, and restores **both** reserved quantities to zero. A repeated cleanup returns zero changes.
6. **Security:** no real payment evidence, BTCPay invoices, payouts, active carrier labels or PII in the receipt. The synthetic database role and gate are relocked in the workflow's `if: always()` cleanup.

## Test runner and triggers
- `scripts/test-retail-postgres-connection.mjs` is guarded against any host/database other than `localhost/retail_test`, requires `CI=true`, and uses only the disposable checkout application identity.
- `.github/workflows/retail-visibility-migrations.yml` now runs on changes to the real checkout coordinator, body parser, transaction adapter, session verifier, and nonpayable route in addition to prior migration triggers.
- `tests/retail-real-multiline-checkout-contract.test.mjs` keeps the unsafe live boundaries and acceptance assertions under the regular `npm test` suite.
- CI must show the **disposable-postgres** workflow passed, not merely lint/typecheck or Vercel preview build, before marking the multi-line proof complete.

## Independent production observations (read-only at start)
- Private `apex_internal.retail_order_engine_gate.enabled`: **false**.
- Orders and encrypted delivery envelopes: **0**.
- Storefront has **five** intentionally retained products, **none publicly published**.
- Vercel WAF's `POST /api/checkout/nonpayable/v1` per-IP rule is present, but this new test does not send production requests or verify 429 behavior.
- The legacy payable endpoint remains unconditional HTTP 503; private nonpayable submissions require independent release settings and the separate database gate.

## Remaining before a real test order or payment
Select a genuinely approved, compliant product with actual publish and in-stock evidence. Finish role/RPC/WAF/CAPTCHA and receipt/privacy review. Obtain separate release authorization to activate even a **nonpayable production hold**. BTCPay invoice creation, signed settlement, Prism allocation, and independently eligible supplier fulfillment remain further launch gates.

This checkpoint is **test evidence only**, not a real sale, user payment, provider invoice or supplier shipment.
