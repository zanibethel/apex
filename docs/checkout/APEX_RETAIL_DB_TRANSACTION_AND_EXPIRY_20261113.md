# Apex retail checkout — PostgreSQL transaction adapter and hold expiry

Checkpoint: November 13, 2026. Follows merged PR #336 (secure delivery).

## Implemented

### One connection, one atomic transaction

`src/lib/checkout/retail-postgres-transaction-v1.mjs` is a concrete SQL
transaction runner that accepts a server-owned PostgreSQL connection pool
with `connect()`, `query()`, `release()` (compatible with node-postgres).

It:
1. Reserves **one** connection for the entire operation.
2. Starts `BEGIN ISOLATION LEVEL READ COMMITTED`, with bounded lock,
   statement and idle-in-transaction timeouts.
3. Calls the live retail cart quote function, private stock reservation, private
   encrypted delivery attachment and private receipt function using
   parameterized SQL **on that same connection**.
4. Calls `COMMIT` only when all four steps and the coordinator's validation
   succeed; otherwise issues `ROLLBACK` and releases the connection.
5. Never logs raw inputs, encryption keys, delivery data, SQL parameters or
   private DB errors. All returned confirmation metadata remains nonpayable.
6. Reuses the existing deferred DB constraint rejecting any committed order
   that lacks its required encrypted delivery envelope.

The injectable `pool` interface is real SQL, not a fake HTTP RPC or
individual Supabase REST requests. **It is not yet wired to a live PostgreSQL
pool**: no database connection secret, scoped DB execution role, or encrypted
delivery key/version was found among Apex's configured Vercel environment
variable *names*. This PR intentionally does not create or request those
secrets or broaden function grants to public API identities.

### Verified signed-in customer session

`verified-customer-session-v1.mjs` accepts a request-scoped Supabase Auth
client and calls `auth.getUser()`. It requires a legitimate non-anonymous
authenticated user and returns only the canonical user UUID. Browser user IDs,
user-editable `user_metadata`, unverified `getSession()` tokens, roles and
contact details are never accepted as authorities. Guest checkout needs a
separate verified guest identity design; this helper does not support it yet.

Neither helper is reachable from `/api/checkout/handoff/v1`, which continues
to return 503 without reading private delivery details.

### Automated reservation expiry

Supabase already has the `pg_cron` extension installed. The migration
`20261114041000_apex_retail_order_hold_expiry_schedule.sql` adds exactly one
named job, `apex-retail-unpaid-holds-expire-v1`, on `* * * * *` (every
minute), calling the existing private transactional expiry function
`apex_internal.expire_due_retail_order_holds(100)`.

The expiry function checks due times, locks rows with `FOR UPDATE SKIP
LOCKED`, and releases reserved stock only once for the terminal
`expired_no_payment` state. The schedule has no HTTP endpoint or externally
held token. It rejects duplicate job names and requires the order-engine
gate to be OFF and no active holds during installation. It never activates
checkout or changes supplier publication preferences.

**Payment integration hazard:** Before enabling BTCPay, update the hold expiry
contract for pending invoices and payment-finality races, then verify late
settlement cannot be fulfilled against a released reservation. Current holds
cannot have invoices and are always nonpayable.

## Tests

- Disposable PostgreSQL includes a synthetic `cron.schedule` table/function
  to validate job name, cadence, exact command and zero API grants. Production
  uses Supabase's actual pg_cron instead of the test mock.
- Node test suite uses a PostgreSQL Pool-compatible connection stub to check
  identical client identity across four real parameterized SQL statements,
  exact transaction order, every failure => rollback, no PII in metadata,
  encrypted buffers passed as bytea, and release once.
- Supabase user verification tests reject anonymous, invalid, errored or
  browser-claimed user identities.
- Existing encrypted delivery, two-session oversell and payout RLS suites are
  unchanged and must remain green.

## Requirements before order admission

- Define a dedicated DB execution role with least-privilege grants, a
  securely provisioned SSL database connection/pooler endpoint, and a
  production-grade database client driver. Do not use a superuser connection
  or publish any DB password in application code.
- Configure a server-only random HMAC key and versioned 32-byte AES key via a
  secret manager, plus rotation, retention and protected fulfillment access.
- Decide how non-account shoppers obtain independently verified, abuse-resistant
  guest sessions; add request origin validation, CSRF/rate limiting and a
  customer-to-order ownership check.
- Implement coupon redemption usage accounting and durable recovery/reconciliation
  for failed, stale, cancelled or expired orders.
- Only then connect server-controlled customer checkout to the tested
  coordinator, verify an end-to-end order in a sandbox, and keep all payment
  and supplier-fulfillment decisions independent.

**This is an internal nonpayable checkout foundation, not an enabled purchase
flow.** BTCPay/Prism payouts, invoice creation, supplier notifications, real
shipping labels and regulated-product payment authorization remain unchanged.
