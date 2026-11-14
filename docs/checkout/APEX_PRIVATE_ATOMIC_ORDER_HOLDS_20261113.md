# Apex — private atomic retail order engine (November 13, 2026)

## Scope and current launch posture
The customer-facing retail quote is connected in PR #334. This slice introduces
durable **private held order intentions** to prepare for real customer orders.
It does not accept a customer purchase or charge Bitcoin. No public or
authenticated caller can execute the internal reservation, cancellation or expiry
functions. `retail_order_engine_gate.enabled` defaults to **false** in production.
The customer checkout API still returns HTTP 503.

## Durable identity and evidence
- Each hold uses a server-side UUID and an immutable original creation timestamp.
- `(store_id,request_id)` is unique, and a transaction-scoped advisory lock
  serializes identical simultaneous request keys.
- The order records the salted/HMAC request fingerprint supplied by a future
  trusted server adapter, a computed canonical cart/options digest, exact
  merchandise subtotal, discount, shipping and total, and hold expiry.
- Each immutable line captures original product ID, SKU, name, quantity, unit
  price and line price, independently from mutable supplier catalog records.
  The line table rejects UPDATE/DELETE by trigger.
- The order schema deliberately has no customer email, shipping address,
  plaintext delivery details, wallet information or payment token.

## Authorization and pricing
- Internal PostgreSQL function **only**; no public RPC, service-role grant,
  customer order endpoint or scheduled expiry job is added.
- The separate engine gate must be explicitly enabled *only in disposable CI*
  for functional tests. The existing retail display gate is insufficient.
- With the engine gate ON, the worker rechecks currently active, supplier-
  requested listings, admin holds and restrictions, pending review/imports,
  category ownership, saved USD unit prices, and available stock. These checks
  are content-neutral: no blanket prohibited-word list.
- Products and inventory are locked in product-ID order to avoid oversell and
  deadlock; all line snapshots and reserved-quantity increments commit atomically.
- Promotions and supplier-configured shipping are recomputed against saved
  settings, not browser totals. Currency stays USD and checkout tax calculation
  stays out of this implementation as previously agreed.
- Up to eight distinct lines / fifty total units are supported. The existing
  cart supports 20 selections for review; 9–20 must be rejected, not truncated,
  when the future admission endpoint is built.
- Real payment settlement will still require independent price/stock/merchant
  admission. Coupon redemption quotas and protected delivery attachment will
  need their own transactional integration before enabling commerce.

## Expiry, cancellation and replay
- Holds expire after 15 minutes. A private expiry function scans due records
  using `FOR UPDATE SKIP LOCKED`; it is **not scheduled** in production.
- Cancellation and expiry decrement reserved inventory once, advance a
  terminal-only state and append a unique event. Replaying a terminated request
  returns its existing terminal ID and never recreates a stock reservation.
- A reused request ID with changed cart/options or request fingerprint fails.
  No payment or shipping authorization is returned under any state.

## Tests
The existing disposable retail Postgres CI suite now tests:
1. Production-gate defaults and lack of role privileges.
2. A topical copper-peptide retail product with an ordinary shirt, including
   saved prices, a percentage discount, shipping and immutable line records.
3. Multi-line stock reservations and rollback when later lines are unavailable.
4. Same-key replays, mismatched replay denial, held expiry and cancellation
   restoring inventory exactly once.
5. Explicit administrator product hold, cross-store rejection, stale-price
   rejection, capacity-driven medium packaging and protected snapshots.

## Next integrations
- Wire a trusted application server to this private engine, with authenticated
  customer/session binding, rate limiting, CSRF protections and customer identity.
- Add encrypted delivery envelopes bound to the generated order ID in the same
  transaction; no plaintext PII in invoices or logs.
- Implement quote expiration/reconfirmation, promotion usage accounting,
  reservation-expiry scheduling and failure recovery.
- Only after verification, integrate BTCPay invoice creation, signed settlement
  evidence, supplier fulfillment read contracts and receipt delivery.
- Explicit, separately reviewed production authorization is still required
  before customer order admission.

Do not treat these private `held_no_payment` records as paid purchases,
fulfillable orders, or inventory sales.
