# Apex retail — verified production Vercel database connection check

**Checkpoint:** November 13, 2026, after PR #342 and checkout credential provisioning.

## Current prerequisites

- The Apex Supabase transaction pooler is `aws-0-us-east-1.pooler.supabase.com:6543`.
- The verified Supabase Root 2021 CA is configured in Vercel Production
  as server-only `APEX_RETAIL_DB_CA_PEM`.
- The custom `apex_retail_checkout_app` login has been enabled with a separate
  password and checked from iSH with `sslmode=verify-full`. It is not
  `postgres`, a superuser, or a `BYPASSRLS` role.
- `APEX_RETAIL_DB_PASSWORD` is a Vercel Production **sensitive** secret.
  The HMAC and AES keys are separate server-only variables.
- Supabase `apex_internal.retail_order_engine_gate` remains OFF;
  `POST /api/checkout/handoff/v1` still returns 503.

## Admin-only verification

The admin dashboard adds **Database connection check** at
`/admin/checkout-db-connection`; the checkout integration page links
to the same path. The page is a dynamic Node.js server component.

Before accessing any database credentials, it requires a valid server-side
Supabase Auth `getUser()` response and `isVerifiedPlatformAdmin` based on
trusted `app_metadata.apex_role`, not a user-submitted ID or
`user_metadata`. Unauthorized visitors are redirected to
`/admin/sign-in`.

When an authorized admin opens the page, the *deployed Vercel server*
instantiates the existing pinned `pg` Pool from its Production
environment. It validates the connection URL, project identity and
verified TLS CA, then calls `verifyRestrictedRetailConnectionV1`:

1. The login identity must be `apex_retail_checkout_app` and
   the selected database `postgres`.
2. The login must be NOINHERIT, not superuser, not bypass-RLS,
   and able to assume only its intended private executor.
3. It must not read private order records or directly modify inventory.
4. Inside `BEGIN READ ONLY`, it runs
   `SET LOCAL ROLE apex_retail_checkout_executor` and checks that only
   its narrowly granted order RPC is executable.
5. It always **ROLLBACK**s and releases its DB connection.
6. If the pool cannot connect, roles are misconfigured or TLS rejects
   the certificate, it reports a generic **Connection not verified**
   without showing SQL errors, credentials, customer data or keys.

The view is not a public or cron endpoint. Its verification result
belongs only to the authenticated administrator. It contains no
payment-enabling actions, approval toggle, seller controls, order writer,
webhook, or login credentials.

## Verification and next steps

CI includes auth-before-query assertions and regressions for the
existing strict read-only SQL. In deployment, the admin must visit the
page and inspect the displayed state to prove real Vercel-to-Supabase
authenticated connectivity. An iPhone/iSH success does not independently
prove Vercel's deployed production secrets work; nor does a passing
connection check establish an approved live checkout.

After verified production connectivity, next delivery is server-side
checkout admission: authenticated order ownership, guest-session
policy, origin/CSRF and abuse protection, customer PII handling and
merchant/provider eligibility checks. Payment, order finality and
supplier fulfillment still require independently verified workflows
before the live order engine gate can be enabled.
