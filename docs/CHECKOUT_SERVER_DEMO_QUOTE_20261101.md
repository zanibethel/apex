# PR #136 — server-verified, nonpayable sample-cart quote
November 1, 2026

## Goal

Move the **existing fictional checkout demonstration** from browser-calculated-only totals toward a server-owned calculation and a fail-closed transition to the simulated payment screen. This is the first backend quote pass, **NOT real supplier product admission or a real payment provider integration**.

The previously merged `/admin/checkout-readiness` prechecks remain private and always block real commercial transactions. Supplier publish intent, admin holds and product authorization cannot be inferred from a public read-only catalog: it currently exposes only names/descriptions and has no trusted sellable price or stock API.

## Built

- `src/lib/checkout/server-demo-quote.mjs`: strict validation of request shape, two allowlisted fictional SKUs and positive quantities (1–5), exact shipping values and `DEMO10`/empty coupon. Rejects client-supplied amounts, wallets, guest details, unauthorized product IDs, duplicates, unknown keys, extra entries and malformed quantities. Calculates integer-cents unit lines, subtotal, 10% sample discount, mock shipping and fictional BTC sats from server-owned constants.
- `POST /api/checkout/quote-preview`: only runs when **server-only** `APEX_CHECKOUT_MODE=demo`. Rejects cross-origin calls, oversized body, wrong content type and invalid payload; `Cache-Control: no-store`. Does no RLS reads, writes, invoices, inventory reservations or payments. It responds with explicit `payable:false`, `canCreateOrder:false`, `canCreatePayment:false`, `taxStatus:not_calculated`, `finalAmountDueCents:null`, and a five-minute **illustrative-only** expiration.
- `src/lib/checkout/demo-quote-client.mjs`: sends only selected fictional SKU IDs/quantities, shipping option and coupon. **No guest email, name, address, phone or prices leave the browser**. Verifies the result never claims any payable or orderable status.
- `/checkout/preview`: the "Continue to Bitcoin preview" button now requires a successful server quote. Request failure holds the user on details with an explanation; a cart/shipping/coupon change invalidates the verified quote. The Bitcoin screen displays the *server returned* fictional total and sats, rather than treating the client price as authority. Invoice QR remains unscannable and there is still no payment destination.
- New unit/security tests for canonical arithmetic, quote expiration, rejected spoofed client pricing and provider wallet fields, forged server responses, and no PII transmission.

## Risk and follow-up

- **NOT a real sellable-item quote:** the request cannot contain real Supabase product IDs. No seller review or eligibility is bypassed, and commercial checkout cannot be activated by changing environment variables.
- No final tax calculation, actual shipping service, inventory reservations, order table or Stripe/BTCPay/Prism integration. The displayed amount is explicitly NOT a payable quote; mock BTC conversion is fictional.
- Next verified pass: build a separate, independently authorized *server-only* sellable-product and price snapshot with a product-specific eligibility release gate, inventory/stock locking and rule versioning. Have the server re-read each real cart line before even generating a **nonpayable** commercial preview; do not reuse the demo SKU protocol for real items.
- Once merchant/product/provider legal eligibility is established, order creation, payments, splits, wallet reconciliation and refunds require independent implementation/review. No auto-enable switch.

## Release tests

Require exact-head GitHub lint, typecheck, unit tests, app build and isolated PostgreSQL/RLS, plus Vercel preview READY. Merge only the test-mode demo quote changes; no migration and no production payment activation.
