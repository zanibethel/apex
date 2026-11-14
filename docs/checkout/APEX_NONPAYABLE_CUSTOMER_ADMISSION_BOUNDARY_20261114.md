# Apex customer orders — authenticated nonpayable admission boundary

Date: November 14, 2026
Branch: `feat/apex-nonpayable-order-admission-boundary`

## Starting point

The Vercel production server now connects to Supabase using a restricted
`apex_retail_checkout_app` identity, a verified Supabase Root CA, and an
audited, transaction-scoped executor role. The administrator confirmed
"Connection verified" in the deployed admin diagnostic.

A private durable order-hold engine, immutable line snapshots, HMAC-bound
idempotent retries, authoritative price/stock/promotion recomputation, an
encrypted delivery envelope, and expiry/stock-restoration tests already
exist. The public checkout endpoint is still unconditional HTTP 503.

## New integration slice

`src/lib/checkout/retail-nonpayable-request-boundary-v1.mjs`
is a read-only request parser that:
- Accepts **POST** to the exact
  `https://apexanabolics.co/api/checkout/handoff/v1` path only.
- Requires matching `Origin`, compatible `Sec-Fetch-Site`, JSON content
  type, and a body size bounded to 8,192 bytes even for streamed input.
- Rejects malformed UTF-8, invalid cart/delivery schema, alternate
  methods, extra properties, buyer prices/taxes, and arbitrary seller IDs.
- Never logs personal data or reflects the successful normalized
  delivery information in a response.

`src/lib/checkout/retail-nonpayable-admission-controller-v1.mjs`
is a **private server-side coordinator**, not a route:
1. Requires a request-scoped verified, non-anonymous Supabase Auth
   `getUser()` identity before reading request body or connecting to PG.
2. Requires a **durable per-subject admission-budget consumer**.
   Missing, denied, failing, or non-durable limiter fails closed.
3. Uses the bounded same-origin request parser.
4. Requires an **independent server-derived single-store resolver**
   for the normalized product IDs. It never reads a store ID from the
   browser and fails when the resolver is missing or unverifiable.
5. Calls existing `createRetailPostgresTransactionV1` and
   `preparePrivateRetailHoldWithDeliveryV1`; the database derives
   prices, shipping, promotion and verified stock, makes immutable
   order/line snapshots and reserves available inventory.
6. Seals delivery using AES-256-GCM inside the *same* transaction and
   returns only a sanitized nonpayable receipt. Identical request retries
   return the original order ID; malformed changes are rejected.
7. Never creates a Bitcoin invoice, payment, shipment, supplier
   fulfillment authorization, or email.

The controller makes no grants and has no public API route. This is
intentional: today the production project has **no durable admission-rate
limiter or trusted product-to-store resolver** wired for customers. Both
are mandatory before connecting the controller to a public endpoint.

## Verification

- New Node tests exercise signed-in identity, cross-origin and fetch-metadata
  failures, content size limits, extra fields, store scope, missing/non-durable
  throttle, no PII in receipt, one-transaction order capture, idempotent
  retry, sealed delivery, rollback and disabled checkout.
- The disposable PostgreSQL integration script now additionally passes a
  realistic synthetic HTTPS request through the protected HTTP-body parser,
  verified-session resolver and private controller. It replays a prior
  synthetic hold, proving that the API-shaped payload traverses the actual
  node-postgres transaction and receives the exact same canonical order ID.
- The disposable test database only is allowed to enable its temporary
  `retail_order_engine_gate`, then restores the login and gate to
  their locked defaults.
- No real buyer PII or real money is used in tests.

## Next dependencies before exposing customer order submission

1. Implement and test a **durable**, cross-Vercel-instance rate limit for
   authenticated customer subjects; no process-memory-only limit.
   Consider IP/WAF controls in addition to session limits.
2. Implement and test a read-only, trusted **product-to-store** resolver
   using current supplier/publication and admin hold rules. Reject
   mixed-store carts and all unsupported sellers. Do not trust a
   browser-provided store ID.
3. Add protected customer access with a sign-in UX (no guest admission yet)
   and an explicit nonpayable order submission consent step, including
   robust retry ID management and checkout messaging.
4. Only then wire the private controller into the reserved POST route,
   with a separately reviewed server-only admission switch.
5. Keep production `apex_internal.retail_order_engine_gate.enabled=false`
   until full abuse/ownership/PII/expiration/eligibility verification and
   explicit release approval. Do not treat a held order as a purchase.
6. BTCPay invoice creation, independently verified payment settlement,
   split payouts, supplier-ready order detail and carrier labels are
   independent future stages, not enabled by this slice.

## Explicitly unchanged

- `POST /api/checkout/handoff/v1` returns HTTP **503** before reading PII.
- No production order, private inventory reservation, checkout release
  gate or BTCPay transaction.
- No new product names, category or keyword publishing restrictions.
- No extra privileges for the API `anon` or `authenticated` roles;
  no new migrations or password rotations.
