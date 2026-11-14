# Apex: customer nonpayable submission route and confirmation UI

Checkpoint: November 14, 2026

## Scope and release status

This slice connects the verified customer Supabase Auth client, the strict
request parser, the durable per-subject PostgreSQL limiter, canonical supplier
resolver, and the atomic encrypted nonpayable order-hold coordinator.

The existing legacy checkout endpoint
`POST /api/checkout/handoff/v1` is **unchanged** and unconditionally returns
HTTP 503. There are no Bitcoin invoices, payment intents, supplier shipment
authorizations, payouts or customer receipts signaling a paid purchase.

A **separate** server-only POST handler is implemented at
`/api/checkout/nonpayable/v1`. The new handler is **default OFF**. It
short-circuits to HTTP 503 before reading the buyer body or opening a PG
connection unless **both** production environment variables match exactly:
- `APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED=true`
- `APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL=nonpayable-only-v1`

Neither variable is automatically provisioned by this PR. The independent
private database `apex_internal.retail_order_engine_gate.enabled` stays
**false**. A real customer hold requires a separate explicit review and
authorization before any such gate is changed.

## Server admission path

When the release is subsequently approved, the Node.js handler:
1. Refuses requests from the wrong Origin, cross-site Fetch Metadata,
   incorrect content type, query string or route *before* rate-limit
   evaluation, Supabase auth or contact-data parsing.
2. Uses cookie-scoped Supabase `getUser()`, verifying a non-anonymous,
   email-confirmed session. No customer ID, role or store is read from
   `user_metadata` or the browser.
3. Creates only the `apex_retail_checkout_app` TLS-verified PostgreSQL
   pool from server-only Vercel Production secrets, capped to two connections
   per function instance (role limit remains three).
4. Executes the existing durable PostgreSQL per-subject admission budget
   and approved single-store resolver under transaction-local executor
   permissions, rejecting invalid products, mixed-supplier carts or limits.
5. Runs the existing same-transaction server repricing, immutable hold,
   concurrency-safe stock reservation and AES-GCM delivery sealing.
6. Returns *only* a nonpayable reference, expiry and amount. No contact
   details, HMAC keys, ciphertext, invoice address or payment URL can
   be reflected to the client. Unrecognized failures are generic and never
   include SQL or protected user details.
7. Releases the PostgreSQL pool on all paths; no orders or payment authority
   are created if the database order-engine gate remains OFF.

## Customer review UI

The existing `/cart` page adds an isolated consent-and-confirmation
panel. While disabled, the panel describes the preview and has no action
capable of sending delivery details. Once separately enabled:
- A *verified signed-in customer* is required; otherwise show
  `/account/sign-in`.
- The shopper must refresh and check current inventory and amounts,
  validate delivery details locally, and explicitly agree to submit.
- No more than eight distinct items can be submitted. Browser totals,
  product owner IDs, tax calculations and payment instructions cannot be
  submitted as authority.
- On successful HTTP 201, the confirmation shows a UUID, total,
  expiry and an explicit **not a purchase/no payment/no shipment** warning.
- A retry of an unchanged pending submission reuses the same
  `crypto.randomUUID()` request identity. Changing cart/promotion/delivery
  invalidates prior receipt and consent locally.
- Contact/address details and the request UUID remain in React memory;
  the browser never persists delivery details to localStorage, cookies,
  URLs or analytics. The client does not transmit PII until the explicit
  consented POST action.

## Verification, safety, next gates

- Run `npm run check` and disposable PostgreSQL/RLS suite. Existing
  checkout/payment protection tests must continue passing.
- Assert both new operator release variables are absent in Production.
- Verify unauthenticated/public `POST /api/checkout/nonpayable/v1`
  responds 503 without accepting body while disabled.
- Verify `/api/checkout/handoff/v1` remains 503, `GET` 405.
- Verify private database engine gate OFF, zero held orders and reserved
  inventory after deploying.
- Do not activate customer-facing submissions until: WAF/IP throttles
  reviewed, email confirmation and customer signup policy resolved,
  PII retention/deletion policy approved, automatic expiry confirmed,
  customer communication tested, supplier boundaries validated, and
  explicit approval for production inventory holds and DB gate switch.
- Actual Bitcoin settlement, Prism payouts, USPS labels, supplier
  fulfillment, and customer receipt emails remain independent future
  readiness gates.

This PR does not introduce new product category, keyword, or tag
publishing restrictions.
