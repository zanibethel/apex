# Track 1 -> Track 2: customer checkout handoff v1

**Status:** Versioned request parser and a reserved, **disabled** API boundary. This is not a checkout admission implementation. Release remains disabled; no order, payment, inventory reservation, delivery-data persistence or carrier operation is authorized by this contract.

## Compatibility with merged Track 2 PR #251

Track 2's canonical server-only contract, `docs/checkout/APEX_TRACK2_ORDER_HANDOFF_V1.md`, expects snake_case `schema_version`, `request_id`, `store_id`, `items`, `box_size`, `promotion_code`, `delivery`. Track 1's `schemaVersion`/nested `cart` is the **browser transport** shape, not Track 2's direct input.

**Use `prepareTrack1CheckoutHandoffForTrack2V1(raw,{trustedStoreId,fingerprintKey})` on the trusted server** to parse, validate, map and call `prepareCheckoutOrderHandoffV1` with a server-resolved store ID and private HMAC key. The adapter is `src/lib/checkout/track1-to-track2-adapter-v1.mjs`; tests: `tests/track1-track2-compatibility.test.mjs`. Never transmit the server-only delivery or HMAC values back to the client.

Track 1's saved cart allows **up to 20 distinct items** for review; Track 2's current order-admission validator allows **at most 8 distinct products**. The adapter rejects all 9–20 line handoffs without truncation. Track 2 must decide whether to expand its atomic admission capacity or present a clear cart reduction step when checkout becomes independently authorized. Product quantity limit remains 10 each; total units 50. Track 1's transport requires a UUIDv4 requestId, stricter than Track 2's general UUID syntax.

## Endpoint and ownership

`POST /api/checkout/handoff/v1` is reserved for Track 2. While Track 2 has not implemented the authenticated admission worker, it returns HTTP 503 with `{schemaVersion:1,accepted:false,code:"CHECKOUT_UNAVAILABLE",canReserveStock:false,canCreateOrder:false,canCreatePayment:false}` **before reading the body**. The handler must not log or persist customer details. Track 1 owns the browser form, cart and request schema; Track 2 owns any privileged server admission and canonical order write.

## Request v1 (JSON, HTTPS POST, same-origin)

```json
{
  "schemaVersion": 1,
  "requestId": "a471a688-9a9d-470d-8d9c-3ee8cbb87642",
  "cart": {
    "items": [{"product_id": "f0000000-0000-0000-0000-000000000001", "quantity": 2}],
    "code": "",
    "boxSize": "auto"
  },
  "delivery": {
    "firstName": "Sample", "lastName": "Customer",
    "email": "example@example.com", "phone": "",
    "address1": "100 Market Street", "address2": "",
    "city": "Lubbock", "state": "TX", "postalCode": "79401"
  }
}
```

This is a **synthetic fixture only**. Do not add real recipient, supplier, payment or wallet information to the public repo.

`parseCustomerCheckoutHandoffV1` rejects unknown fields at every level, malformed v4 request IDs, duplicate product IDs, non-UUID products, quantities outside 1–10, carts over 20 lines/50 units, invalid coupon formats and malformed U.S. delivery details. Phone and second address line are optional; the other delivery fields are required. Only `auto` or `medium` packaging preference may be requested. Never accept client unit prices, inventory status, shipping amount, tax, supplier identification, payment state or wallet information.

## Required Track 2 acceptance before changing the 503 endpoint

1. Enforce HTTPS, same-origin request/CSRF controls, bounded request bodies, rate limits and authenticated authorized admission service. No raw delivery PII in URLs, logs, client storage, provider metadata or unencrypted database columns.
2. Recheck each product's current eligibility, release status, supplier/admin hold, saved price, verified stock and quantity under an **atomic** DB transaction. Honor multiple lines and reject cross-supplier carts until a split-order protocol is explicitly defined. This request never grants eligibility.
3. Recalculate active discount codes and usage limits, configurable optional shipping, box choice and configured **strictly-over-$200** free shipping using trusted store settings. No sales-tax calculation.
4. Deduplicate by (`requestId`, authenticated principal/store) and bind to a hash of the normalized request. Same ID + different payload must fail; expiry/stock races require a new quote. Never treat the browser's displayed total as authoritative.
5. Validate delivery through protected channels and explicitly approved data handling (encryption, supplier-only access, audit, retention). No email/postage outside the separately approved fulfillment track.
6. Define the canonical response as a **non-payment** admission result first; Track 2 must own order identity and any checkout intent. Payment settlement and shipping actions belong elsewhere. Production launch still requires separate authorization.

## Integration evidence and current limits

Track 1 parser: `src/lib/checkout/customer-handoff-v1.mjs`.
Reserved boundary: `src/app/api/checkout/handoff/v1/route.ts`.
Regression: `tests/track1-checkout-handoff-v1.test.mjs`.

Existing `/api/cart/quote` remains a read-only, nonpayable price/availability preview, **not** a valid admission token. The public catalog currently exposes no verified category field or public product image URL; neither can be invented from private supplier records. Supplier CSV/edit/publish and admin controls remain server-owned in existing modules and are not reimplemented here.
