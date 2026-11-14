# Apex — atomic encrypted delivery and private held-order receipt

**Checkpoint:** November 13, 2026. Follows PR #335. This is a private
pre-activation development phase, **not live checkout**.

## What was implemented

1. `apex_internal.retail_order_delivery_envelopes` is a new, private table
   referencing the exact `(order_id, store_id)` of the active held-order ledger.
   Only the encryption format, key version reference, AES-256-GCM nonce,
   ciphertext, auth tag, and verification-disabled flags are persisted.
   No plaintext name, address, phone, email, key bytes or wallet data enter SQL.
2. A **DEFERRABLE INITIALLY DEFERRED** constraint trigger refuses to commit a
   new hold unless its delivery envelope also exists. If encryption, insertion,
   validation or the customer session fails, the entire transaction rolls back,
   including reserved inventory. The prior order-hold SQL contract and one-time
   cancellation/expiry are reused without widening access.
3. A private security-invoker `attach_retail_delivery_envelope` verifies
   active hold, store ownership, key-reference format and byte lengths,
   rejects overwrite or cross-store replay, and never confers payment or
   shipping rights. A second internal receipt function returns only
   order/total/expiry/state and `delivery_sealed`, with no PII.
4. `preparePrivateRetailHoldWithDeliveryV1` is a **server-only coordinator**
   that:
   - Requires an independently verified authenticated/guest session identifier
     and a secret HMAC signing key.
   - Parses the existing Track 1 → Track 2 handoff (max 8 lines).
   - Gets the current cart quote from the trusted DB **inside the same
     transaction**; no amount is accepted from the browser.
   - Independently locks and revalidates prices/stock/holds with the existing
     `reserve_retail_order_hold` function before returning a generated order ID.
   - Seals delivery with the existing AES-256-GCM primitive, binding
     store/order/key-reference as authenticated data.
   - Calls private attach/readback operations on the same transaction.
   - Rejects unsealed, mismatched or otherwise suspicious receipts, returns
     only nonpayable metadata, and never exposes the delivery payload.
   - On a matched replay, requires the already sealed envelope rather than
     replacing it with a newly randomized nonce.

## Integration boundary deliberately not yet enabled

The server coordinator is an injectable, rigorously tested transaction
contract; the **actual PostgreSQL driver/connection adapter is not
implemented** in this phase. A future driver must supply `withTransaction`,
and its callback must expose `quoteSource`, `reserve`, `attachDelivery`,
and `receipt` on **one connection** with BEGIN/COMMIT/ROLLBACK. Merely making
separate Supabase REST requests is **not** an acceptable transaction adapter.

The public `POST /api/checkout/handoff/v1` still returns HTTP 503
**before reading a request body**. Customer delivery inputs remain in the
browser; do not attach a submit button or pass PII to an endpoint until the
transaction driver, verified session/guest-token authorization, abuse/rate
limits, request origin validation, secrets management, key rotation, and
eligible merchant/payment checks are reviewed.

A held-order **receipt is not a paid-order confirmation**. It does not enable
BTCPay/Prism, notify a supplier, create labels, charge a card, or authorize
shipment.

## Expiry and recovery

The existing private `expire_due_retail_order_holds` and cancellation
routines still reclaim inventory exactly once, even when encrypted delivery
is saved. No public expiry worker or cron job is configured in this phase.
Scheduling requires an authenticated, least-privileged private database
worker/connection and a recovery playbook. Unsealed reservations cannot commit.

## Verification

The disposable PostgreSQL suite first runs the previous published-retail,
reservation and two-session concurrency assertions. After cleaning up the
synthetic holds, it adds the delivery migration and proves:

- Missing/invalid encrypted envelope => entire order and reserved inventory
  roll back at the deferred constraint boundary.
- Opaque envelope linked to the canonical store/order => one held order,
  immutable evidence, correct readback and shipping/payment flags false.
- Exact replay is idempotent; changed bytes, cross-store binding and attempted
  ciphertext UPDATE are rejected; cancellation restores reserved stock.
- The order engine gate stays OFF outside disposable tests, and API roles
  cannot directly read/write the private delivery table or call privileged RPCs.

Node tests validate actual AES-256-GCM sealing/opening with a synthetic key,
verified session-bound HMAC, source-derived quote/repricing, transaction step
ordering, replay and failure rollback, and complete absence of delivery PII in
public-safe returned metadata.

**No customer orders or payment records are created by the production rollout.**
