# Apex customer-order engine: restricted SQL executor and isolated purchase drill

**Checkpoint:** November 13, 2026. Following merged PR #337.

## What this adds
- A dedicated PostgreSQL capability role, `apex_retail_checkout_executor`.
- Role is `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`, `NOSUPERUSER`,
  `NOCREATEROLE`, `NOCREATEDB`. It has **no database password**, no direct
  access to inventory, products, saved orders, shipping, promotions or delivery.
- The only private write capability is a narrow, owner-executed,
  static-SQL `checkout_worker_reserve_retail_hold` wrapper. Separate
  private wrappers attach the previously encrypted envelope and read a
  nonpayable receipt. All use `SECURITY DEFINER` in the **unexposed**
  `apex_internal` schema, with fixed `search_path=pg_catalog`.
  Access is granted only to the dedicated worker role, and revoked from
  `PUBLIC`, `anon`, `authenticated` and `service_role`.
- The existing cart quote uses a sanitized, read-only function.
- The server-only SQL transaction adapter now calls these scoped wrappers
  instead of requiring privileged table access.

## Controlled end-to-end order lifecycle (disposable database only)
The existing PostgreSQL 17 CI fixture creates a synthetic, purchasable
workout shirt and (only within the test) enables the private order engine.

The test uses **one live PostgreSQL session** as the new worker role:
1. It checks the public catalog source and price.
2. Begins a SQL transaction and reserves the single product at its saved
   $32 price plus $15 shipping, preserving UUID, name/price and expiry.
3. Attaches a dummy, encryption-shaped delivery envelope under the original
   store/order identity, and reads the private $47 nonpayable receipt.
4. Commits the entire hold, stock reservation and delivery in one step.
5. Replays the original request and verifies no extra order or stock held.
6. Simulates expiry, invokes the existing private expiry cleanup and checks
   stock is released **once**, then disables the test-only engine gate.

This SQL integration test intentionally uses **dummy binary ciphertext**, not
real customer information. Existing Node tests separately exercise authentic
AES-256-GCM encryption, verified session binding and failure rollback.

## Important remaining runtime connection and launch blockers
The PostgreSQL execution role is **NOLOGIN by design** until a secure,
reviewed connection has been established.

- Configure a separate, restricted LOGIN credential or short-lived
  identity that can assume the dedicated role, using a tested TLS pooler
  endpoint and secrets managed in Vercel. **Do not** use Supabase
  `postgres` administrator or `service_role` for this.
- The Vercel project has **no named production secret variables** yet for
  the checkout SQL connection, HMAC fingerprint or AES-256-GCM key version.
  This PR does not create or reveal these credentials.
- Bind the request-scoped customer identity to the order and create a
  protected authenticated admission endpoint; verified guest identity,
  anti-abuse, CSRF/origin validation and payment-provider admissibility are
  additional requirements before accepting actual orders.
- `POST /api/checkout/handoff/v1` still responds HTTP 503 without reading
  customer PII. No sale, Bitcoin payment, shipping label or email is created.
- The **production** `retail_order_engine_gate` remains OFF, and the cron
  expiry worker continues to operate independently.
- Tax remains outside the order quote and checkout calculation in the
  existing agreed shipping-only pricing contract.

**The isolated end-to-end SQL drill is not proof of a production customer
purchase, encryption-key configuration, wallet readiness, or BTC settlement.**
