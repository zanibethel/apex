# Apex — durable customer admission budget and canonical seller resolution

Checkpoint: November 14, 2026.

The operator verified the Vercel Production-to-Supabase restricted connection
in the authenticated administrator dashboard. PR #346 created an authenticated
private nonpayable admission controller, with *injected* dependencies that had
not yet been backed by database functions.

## This slice

New migration
`20261114074500_apex_private_retail_admission_guards.sql` adds exactly two
privileged functions in the **unexposed** `apex_internal` schema and one
private ledger table. No API role obtains direct table access or permission
to execute the functions; only `apex_retail_checkout_executor` does.

### 1. Durable per-customer admission rate limit

- Postgres table `apex_internal.retail_admission_budgets_v1`
  stores only a verified Supabase Auth subject UUID, fixed operation,
  10-minute window start, number of attempts, and update timestamp.
  No IP addresses, customer contact/delivery details or raw request body.
- Every named customer subject has a single durable row: new 10-minute
  window resets the attempts, limiting storage growth over time.
- Maximum **10 attempts per 10-minute window per verified customer**.
  Attempt 11 is refused. PostgreSQL `INSERT ... ON CONFLICT DO UPDATE ...
  WHERE attempts<10 RETURNING` provides atomic row-lock enforcement,
  including simultaneous requests across independent Vercel instances.
- Unknown operations, invalid UUIDs and errors fail closed. No
  process-memory-only counters, no automatic payment authorization.
- The limiter covers authenticated admission attempts only. WAF/IP
  throttles, anonymous/unauthenticated traffic protections, bot detection
  and expiry/cleanup policy are separate production considerations.

### 2. Trusted single-store resolver

- No user/browser/store identifier is accepted. The worker receives
  only normalized cart `product_id` and `quantity`, maximum eight lines.
- The function calls the already-approved
  `public.get_public_retail_cart_quote_source(jsonb,text)` to apply
  **existing** supplier publish state, administrator holds, review state,
  category visibility and current stock checks; it does not add any
  hardcoded product keywords, categories, or tag restrictions.
- A second SQL query resolves a **single canonical store ID** from
  `public.products`; mixed-supplier carts, unknown products, duplicate
  IDs, sold-out items and nonpublic listings fail.
- Actual stock/reservation and prices are independently rechecked in
  the existing single SQL transaction; this read-only resolver is not
  authorization for payment or shipping.

### 3. Node.js transaction adapters

`src/lib/checkout/retail-postgres-admission-dependencies-v1.mjs` exposes
`createRetailPostgresAdmissionDependenciesV1({pool})` with the two exact
callback signatures expected by `admitPrivateNonpayableRetailOrderV1`.
Both use `BEGIN`, `SET LOCAL ROLE apex_retail_checkout_executor`,
fixed-purpose parameterized queries, short statement/lock timeouts,
`COMMIT` or `ROLLBACK`, and release their connection.

A failed dependency never opens the order transaction. No SQL errors,
secrets, delivery PII or customer identifiers are logged.

## Tests

- CI applies the migration only to disposable PostgreSQL 17 after
  the existing role and checkout migrations.
- SQL tests exercise API-role grant denial, durable 10-attempt cap,
  operation denials, resetting an expired interval, same-store
  resolution, mixed-supplier carts, and unknown/duplicate products.
- Node unit tests exercise both callback contracts, deny paths,
  read-only resolver transaction, rollback and sanitized failures.
- Real PG integration concurrently calls the rate limiter 20 times
  with 2 pooled connections to assert **exactly ten accepted and ten
  denied** requests; it uses the actual resolver in a synthetic
  nonpayable order replay, never mocks the two dependencies.
- CI fixture cleans up and relocks its own disposable login/gate.

## Production safety and next tasks

The migration is additive and nonpayable; it does not toggle the
private order engine gate and does not create production orders.
`POST /api/checkout/handoff/v1` still immediately returns **503**,
without accepting delivery PII.

Before enabling customer submission, implement the protected
server-only authenticated route, an explicit customer consent UX,
verify account/email-confirmation policy, IP/WAF plus per-subject abuse
limits, repeat/expiry operations and PII retention, independently
test owner access and supplier workflows, and obtain explicit permission
to enable the order engine. Bitcoin/BTCPay remains independently gated.
