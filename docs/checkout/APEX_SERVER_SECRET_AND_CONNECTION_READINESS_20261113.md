# Apex checkout connection and secret readiness

Date: November 13, 2026. Continues from merged PR #338.

## This phase

- Adds `apex_retail_checkout_app` as a separate **NOLOGIN** and **NOINHERIT**
  Postgres identity. The role has no direct table access and cannot execute
  private order writers until it expressly assumes
  `apex_retail_checkout_executor` using `SET LOCAL ROLE` *inside*
  the checkout database transaction.
- The existing server-only transaction adapter now assumes that scoped role
  immediately after `BEGIN`. COMMIT/ROLLBACK resets it automatically.
- Adds `validateRetailCheckoutServerConfigV1` to reject wrong projects,
  privileged usernames, unrecognized hosts, unsupported ports, weak keys or
  unverified TLS. It accepts only the real project's direct host on 5432
  or an explicitly provided Supabase shared-pooler host with the documented
  `[ROLE].[PROJECT_REF]` username convention. **Do not guess the pooler
  cluster index from region.** This is a validation layer, not a connection.
- Adds `createRetailCheckoutServerPoolV1(env, Pool)`: an injectable pool
  builder with verified TLS, a maximum of two connections and short timeouts.
  It deliberately does not bundle or instantiate a database driver or
  expose any public checkout endpoint.
- Adds disposable PostgreSQL tests of role memberships, noninheritance,
  explicit `SET LOCAL ROLE`, transaction reset and the default-off order
  gate. Node tests reject wrong DB URLs, poor secrets, spoofed usernames and
  decrypted client payload exposure.

## Production credentials

The following names are reserved for **server-only protected** environment
variables in Vercel (never `NEXT_PUBLIC_*`):

- `APEX_RETAIL_FINGERPRINT_KEY`: 32+ bytes generated cryptographically
  at random, encoded as 64–128 hexadecimal characters.
- `APEX_RETAIL_DELIVERY_KEY_HEX`: exactly 32 cryptographically random
  bytes, encoded as 64 hexadecimal characters.
- `APEX_RETAIL_DELIVERY_KEY_REF`: the versioned reference, e.g.
  `2026_11_v1`.
- `APEX_RETAIL_DB_URL`: **not to be created until the correct pooler host
  has been verified in Supabase's Connect dialog and a dedicated login has
  been separately provisioned**. The example user is
  `apex_retail_checkout_app.[PROJECT_REF]`; never use `postgres`,
  `service_role` or an admin database password.

The migration deliberately leaves `apex_retail_checkout_app` **NOLOGIN**
without a password. The separate credential provisioning step must use
an audited, rotatable, minimum-entropy secret and confirm the pooler
endpoint supports custom roles. Do not put passwords, connection strings,
or encryption key values in Git or issue logs.

## Remaining gates

- A version-pinned Node Postgres driver, and a complete production
  connection smoke test, must be added and validated before the endpoint
  can use the pool. Injecting a mock Pool in Node tests does NOT prove
  Vercel-to-Supabase network connectivity.
- The existing customer Auth helper verifies signed-in users. Verified
  guest checkout, order ownership binding, origin/CSRF checks, abuse limits,
  delivery access and retention, failed-order recovery and coupon usage
  accounting must be completed before public order submission.
- `POST /api/checkout/handoff/v1` continues returning HTTP 503.
  The Supabase `retail_order_engine_gate` stays OFF. BTCpay/Prism,
  paid-order transitions, merchant/provider authorization, supplier
  fulfillment and all live-payment behaviors remain unchanged.
