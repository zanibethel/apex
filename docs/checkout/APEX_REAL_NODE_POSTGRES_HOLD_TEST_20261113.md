# Apex checkout: real PostgreSQL client and synthetic encrypted hold drill

Checkpoint: November 13, 2026. Continues from PR #339.

## Implemented
- Node's PostgreSQL client `pg@8.23.0` is an **exact** runtime dependency
  with its complete registry-integrity-pinned lockfile tree. No unlocked
  Node client or per-request HTTP `rpc` transaction substitution.
- `createRetailPostgresRuntimeV1(env)` wires a real `pg.Pool` through
  the strict server-only project/role/TLS/secret validation helper, the
  existing one-connection PostgreSQL transaction adapter, genuine
  AES-256-GCM protected delivery, and Supabase Auth `getUser()`.
- The runtime remains an **internal server-only module**: no public
  route imports it, so neither a signed-in user nor a supplier can
  create a customer order on the live website.
- The runtime pool must use the dedicated Apex project custom login,
  not `postgres`, `anon`, `service_role` or an unverified pooler host.

## True network test against isolated PostgreSQL 17
GitHub Actions runs the full prior suite and additionally:
1. `npm ci` verifies the pinned `pg` runtime dependency and integrity.
2. Only in disposable `retail_test`, converts the scoped app identity to
   LOGIN with the fixture's existing test password and enables the order
   gate temporarily.
3. Launches a **real Node process** connecting over TCP with
   `pg.Pool` as the restricted identity. The transaction adapter enters
   `SET LOCAL ROLE apex_retail_checkout_executor` after `BEGIN`.
4. Runs real price/stock recheck, owner-executed order reservation,
   AES-256-GCM encryption of synthetic delivery, immutable order-line
   insert, private encrypted-envelope insert and safe receipt, then
   COMMIT. Amounts are from the database, not a browser.
5. Replays the same request and verifies the original order ID is
   returned with no duplicate stock reservation.
6. Inspects one encrypted order and one line in PostgreSQL, expires the
   held order and verifies that reserved inventory is restored.
7. Resets the fixture role to NOLOGIN and disables the test order gate
   even when a test fails.

## Production posture
- **NOLOGIN** private application role still cannot log in to production.
- No `APEX_RETAIL_DB_URL` is configured. Supabase's connection pooler
  cluster index cannot be inferred from its region or project reference;
  the correct host must be sourced from the actual Supabase **Connect**
  details. IPv4 availability of the direct db host is not assumed.
- HMAC and AES delivery keys were saved as protected server-only
  Vercel Production environment variables, not Git.
- Both the live order-engine gate and `/api/checkout/handoff/v1`
  remain OFF / HTTP 503, respectively.
- The synthetic CI exercise is a true Node-to-Postgres transaction,
  **not** a live Vercel-to-Supabase purchase or a BTCpay invoice.
  Guest-session support, CSRF/rate limits, public order admission,
  independent provider/merchant eligibility, payment-finality-aware
  expiry and supplier paid-order fulfillment remain additional
  acceptance gates.
