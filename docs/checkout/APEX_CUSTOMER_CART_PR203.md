# PR #203 — Customer cart with real catalog IDs (read-only checkout)

## What is usable now
- Header cart icon, mobile-friendly cart page, quantity controls, remove/clear.
- Only UUIDs and quantities are saved to this browser (no guessed price, supplier cost, address or wallet data).
- Catalog cards sourced from the approved public feed can be saved for review, including sold-out items; they cannot be purchased.
- The cart submits a bounded read-only quote request containing product IDs, quantities, USPS package selection and an optional promotion code.
- The server reads prices, stock eligibility, store shipping rates, and the exact promotion from a narrowly scoped PostgreSQL readback. It never accepts a client-supplied price or inventory amount.
- The default package is the USPS Padded Flat Rate Envelope ($15.00 configured); larger packages can be set to Medium Flat Rate Box ($25.80 configured). Free shipping applies above $200 after product discounts (threshold 20001 cents), or with a valid free-shipping code.
- Invalid prices, missing products, stale authorizations, or unknown codes fail closed. Coupon preview does not redeem a coupon.
- No checkout, order, inventory reservation, BTCPay invoice, label purchase or refund is enabled.

## Current release state / limitations
At the time of this pass, the live Supabase private release gate is **false**, there are 63 saved products, zero product rows with positive unreserved inventory, and no active public discount codes. Therefore the public cart quote endpoint correctly reports unavailable; it does not show any unapproved/private products. The cart UI and verification flow are ready for future independently approved public catalog release. The current public catalog feed also marks every visible item `sold_out`.

Do **not** switch the public gate or mark products purchasable as part of this PR. The current database quote RPC accepts *only truly zero-stock, verified-released* products; extending it for in-stock commerce requires separate supplier/product authorization and an order-admission design with atomic stock reservation.

## Security and testing
- Versioned localStorage contract; strict bounds: at most 20 distinct products, 10 units each, 50 total units.
- No server-trusted data from localStorage. All customer-facing totals derive from exact server saved-price records.
- Public RPC has fixed store scope, release gate, seller/item authorization joins, zero-stock enforcement and no private cost/media/customer fields.
- Public endpoint never uses a service-role key or privileged customer cookie.
- Isolated DB tests cover anonymous role, denied direct table access, invalid input, closed release gate and no order journals.
- Node tests cover cart persistence, edits, shipping methods and threshold, promo validation, and rejection of inflated/malformed source data.
- User-facing navigation uses real catalog IDs; the retired fictional sample cart and retired API remain untouched.

Release requires verified migration application prior to Vercel using the new endpoint; do not treat a deployment build as commercial activation.
