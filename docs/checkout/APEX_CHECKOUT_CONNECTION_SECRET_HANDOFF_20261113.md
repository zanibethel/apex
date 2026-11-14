# Apex — restricted checkout credential handoff and read-only verification

Updated November 13, 2026. Scope: production checkout connection **only**.
No live checkout, order creation, BTCPay, Prism, or customer delivery submission
is enabled by this change.

## What is already in place

- Transaction pooler host verified: `aws-0-us-east-1.pooler.supabase.com:6543`.
- Project ID: `fhqpkpztercadcxspdkg`; database: `postgres`.
- Non-login application role: `apex_retail_checkout_app` with no table access
  and an explicit `SET LOCAL ROLE apex_retail_checkout_executor` capability.
- `APEX_RETAIL_DB_CA_PEM` installed in Vercel Production; real Vercel sandbox
  verified the Supabase 2021 root CA and server hostname using TLS 1.3.
- Production `APEX_RETAIL_FINGERPRINT_KEY`,
  `APEX_RETAIL_DELIVERY_KEY_HEX` and
  `APEX_RETAIL_DELIVERY_KEY_REF` already exist, server-only.
- Production `APEX_RETAIL_DB_URL` and
  `APEX_RETAIL_DB_PASSWORD` do **not** yet exist.
- Order engine gate OFF; checkout handoff endpoint returns HTTP 503.

## Safely provision the remaining credential

No connector currently offers a secure *cross-service* password transfer from
Supabase to Vercel. A previous automated password handoff was blocked; **do
not retry through tool output, GitHub source, logs or a browser chat**.

For an operator with trusted administrative PostgreSQL access:
1. Use a local password manager to generate a unique password comprising
   **64–128 hexadecimal characters**. Do not paste it into ChatGPT, GitHub,
   task comments, or a saved SQL editor query.
2. Connect with `psql` as an administrator to this Supabase project over
   verified TLS, using the downloaded 2021 Supabase root CA and the known
   transaction/session pooler hostname. Use psql's interactive
   `\\password apex_retail_checkout_app` command: it prompts securely
   without placing the password in query text or shell command arguments.
   **Do not change the built-in `postgres` password.**
3. In Vercel → Apex → Settings → Environment Variables, create the
   **Production-only** sensitive secret `APEX_RETAIL_DB_PASSWORD` with
   exactly the *same* password from the password manager. Never prefix it
   `NEXT_PUBLIC_`. Do not also set `APEX_RETAIL_DB_URL`; the application
   now constructs the connection from the fixed project, verified host,
   custom identity and database name.
4. Notify the operator that both independent settings are ready, but
   **do not share the password**. Then change only the custom application
   role's `NOLOGIN` attribute to `LOGIN` through a reviewed, nonsecret
   database operation.
5. Run `node scripts/verify-apex-checkout-db-connection.mjs` in an
   authorized server environment whose process has the protected Vercel
   environment values available. This script uses the pinned TLS CA,
   checks the login's identity, verifies it has no direct order/stock
   permissions, switches to its private executor role only inside
   `BEGIN READ ONLY`, and rolls back. It prints only safe status flags.
6. If the probe fails, disable the login and review network, CA, credential,
   role membership and certificate configuration. No checkout gate or
   customer-order path needs to be enabled for this test.

## Security and testing contract

- Password-only configuration is now preferred:
  `APEX_RETAIL_DB_PASSWORD` (64–128 hex characters).
- Existing legacy `APEX_RETAIL_DB_URL` configuration remains accepted
  only when the password-only variable is absent. **Both together fail.**
- Username pinned to
  `apex_retail_checkout_app.fhqpkpztercadcxspdkg`.
- Host pinned to `aws-0-us-east-1.pooler.supabase.com` and port `6543`;
  `ssl.rejectUnauthorized=true` and `APEX_RETAIL_DB_CA_PEM` required.
- The private read-only probe refuses admin logins, unexpected databases,
  inherited privileges, missing executor membership, or direct inventory
  and private-order access.
- The probe performs no invoice creation, stock reservation, delivery read,
  payment settlement, or public-facing HTTP request.
- Existing `src/app/api/checkout/handoff/v1/route.ts` remains HTTP 503.
  Separate security review is still needed for request authorization,
  browser CSRF/origin controls, rate limiting, guest sessions, payment
  eligibility and end-to-end payment/fulfillment testing.

## Readiness state

The restricted login must remain NOLOGIN until its password is provisioned
through an approved secure process. The software and tests cannot themselves
establish that a Vercel deployment can authenticate to the production
database. A clean read-only operator probe is the next measurable acceptance
gate.
