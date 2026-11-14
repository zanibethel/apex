# Apex checkout: staged admin-only production connection diagnostic

Updated November 13, 2026 (after PR #343).

The first production-only checkout database check displayed a generic
"Connection not verified" on the authorized admin page. That message did
not establish whether the failure came from Vercel environment validation,
Postgres TLS/network/authentication, or the app->executor role checks.

Independent evidence:
- From an iPhone, the operator successfully ran a read-only
  `SELECT current_user, current_database()` with Supabase CA
  `sslmode=verify-full` as `apex_retail_checkout_app`.
- The account still has NOINHERIT, no superuser/BYPASSRLS, and no
  direct private order read or inventory UPDATE grants.
- Vercel lists the checkout password, CA and encryption environment
  variables scoped to Production; values were not read or revealed.
- Supabase order engine gate remains OFF; zero held orders or reserved stock.

## Narrower private diagnostic

`/admin/checkout-db-connection` continues to require verified
platform-admin Supabase Auth **before** touching any secret or opening
a PostgreSQL connection.

The server reports one opaque status stage, with no SQL error messages,
password material, host secrets, order data, provider data or unmasked
driver details:

| Stage | Meaning |
| --- | --- |
| `configuration` | Required server-only password, certificate, key/version, or host configuration failed local validation |
| `postgres_connection` | The deployed server could not complete a real read-only SELECT 1; check TCP/TLS and credential alignment |
| `permission_checks` | The database connection succeeded but scoped login/role authorization did not verify |
| `pool_cleanup` | The verification ran but the database pool could not close cleanly; never treat as success |
| `connection_verified` | TLS/auth, read-only ping, strict role/permission and clean pool closure passed |

No stage is sent to unauthenticated users; the server page redirects
them to `/admin/sign-in` before invoking the probe.
No handler has been added to the public `/api` routes.

## How to complete verification

The owner signs in at `https://apexanabolics.co/admin` and opens
`https://apexanabolics.co/admin/checkout-db-connection`. If it reports
"Connection not verified", inspect which stage is failing before changing
any passwords. In particular:
- Configuration failure: check hex password length and formatting
  (64–128 hex characters), server-only CA PEM and AES/HMAC variables;
  don't paste secrets into support chats.
- Connection failure: the password that worked in iSH must exactly
  match Vercel's protected Production value; changes require redeploy.
  Check TLS and pooler networking before assuming permissions are wrong.
- Permission failure: don't reset credentials; inspect the
  app-to-executor role membership/ability to SET LOCAL ROLE.

## Production invariants

The database checker performs only `SELECT 1` followed by
the existing audited read-only permission checks and `ROLLBACK`.
It has no order, inventory, shipping, customer delivery or payment writer.
The public checkout endpoint still returns HTTP 503 and the private
order-engine gate stays OFF. A green database diagnostic alone does
not enable checkout or create any Bitcoin invoice.
