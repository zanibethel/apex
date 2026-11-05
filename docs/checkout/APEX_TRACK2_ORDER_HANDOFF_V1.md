# Apex Development Track 2 — Checkout handoff v1 (held-only)

**Owner:** Track 2 order/payment integration. **State:** executable input validator and strict held-order readback contract, not a merchant checkout or payment endpoint.

## Track 1 to Track 2 interface

Import `prepareCheckoutOrderHandoffV1` from `src/lib/payments/checkout-order-handoff-v1.mjs` **on a trusted server only**. The eventual protected order endpoint must accept a JSON body with exactly:

```json
{
  "schema_version": 1,
  "store_id": "bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3",
  "request_id": "00000000-0000-4000-8000-000000000001",
  "items": [{"product_id":"00000000-0000-4000-8000-000000000010","quantity":1}],
  "box_size": "auto",
  "promotion_code": "",
  "delivery": {
    "firstName":"Ada","lastName":"Sample","email":"ada@example.com",
    "phone":"","address1":"123 Test Street","address2":"",
    "city":"Testville","state":"TX","postalCode":"79401"
  }
}
```

The examples above are synthetic and must not be submitted as an actual order. `request_id` must be a fresh random UUID per intended purchase, reused only for network retry of that **same unchanged** request. The product count limit is **8 unique SKUs**, 10 units each, 50 units total, matching PR #191's currently verified test reservation bounds. Track 1's cart UI can hold more, but the server must reject rather than truncate unsupported carts.

Call `prepareCheckoutOrderHandoffV1(payload,{trustedStoreId,fingerprintKey})` where `trustedStoreId` comes from the authenticated server-side supplier/store binding, never merely the browser claim. `fingerprintKey` is a server-only high-entropy HMAC secret; the resulting request, cart and idempotency fingerprints must not be logged, placed in analytics or returned to the browser. No price, stock, discount amount, wallet or payment state is accepted from the customer.

The validated `serverOnlyDelivery` must be immediately encrypted using a reviewed off-database AEAD key owner; never send it to BTCPay, Prism, client responses or public GitHub. This validator checks format only, **not** postal deliverability or product shipment authorization.

## Track 2 authoritative order boundary

`prepareCheckoutOrderHandoffV1` returns `status: "validated_not_admitted"` with all order/payment flags false. The next trusted **single database transaction**, not this validator, must:
1. Re-read saved prices, discounts, shipping rules, supplier/product approvals, live release gate and stock under appropriate locks.
2. Atomically reserve stock and persist the immutable order identity, original purchase timestamp, line snapshots, HMAC request fingerprint and sealed delivery envelope.
3. Deny same-key replay when any cart, promo, shipping or delivery field changes; return the originally created held identity on an identical retry.
4. Create a separate durable pre-POST permit before a single Greenfield invoice POST, with no automatic second POST on timeout. Independently verify provider invoice and settlement; never treat a browser redirect as payment evidence.

`verifyHeldOrderReadbackV1` checks a narrowly scoped **future trusted DB response** with version, store, canonical order identity, UTC timestamp, fingerprints, counts and explicit false payment/shipping flags. It does not certify a live transaction or independently attest DB identity.

## Track 3 read-only source

Track 3 may currently use the existing authenticated `get_supplier_held_order_headers(store_id,limit,offset)` RPC with `parseSupplierHeldOrderHeaders` from `src/lib/supplier/held-order-header-projection.mjs`. It exposes **original held identity/time and status only**, no line detail, delivery plaintext, payment finality or permission to ship. The private `apex_internal.order_detail_snapshots` and `order_line_snapshots` remain inaccessible to browser roles. A canonical protected line-detail read projection must be added and independently verified before fulfillment wiring.

## Release control

This commit adds **no endpoint, hosted migration, sale, invoice, payment, payout, refund or shipping operation**. Production `apex_internal.private_release_gate.enabled=false` must remain unchanged. Existing disposable regtest and hosted read-only order foundation are reused, not bulk-merged or reapplied. Supplier/product eligibility, BTCPay invoice-writing credentials, wallet identity, approved payout terms, regulatory reviews and an authorized shipping program remain separate external release gates.

## Verification checklist

- Run `npm run check` on the exact PR head.
- Verify cross-store mismatch, canonical cart, same-key changed-request denial, hostile extra fields, missing PII, and untrusted held readback.
- Run existing isolated PostgreSQL/RLS and BTCPay regtest CI, and verify the Vercel preview at the exact commit.
- Merge only when required checks pass; do not enable live commerce.
