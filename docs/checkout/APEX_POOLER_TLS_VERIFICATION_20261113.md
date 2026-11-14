# Apex restricted checkout — verified Supabase shared pooler and CA trust

Checkpoint: November 13, 2026. Continues from merged PR #340.

## Connection details verified from the Apex Supabase Connect screen

- Project: `fhqpkpztercadcxspdkg`
- Transaction pooler: `aws-0-us-east-1.pooler.supabase.com:6543`
- Database: `postgres`
- Shared pooler username for the dedicated application identity:
  `apex_retail_checkout_app.fhqpkpztercadcxspdkg` — **not** `postgres`
- Separate production app role remains NOLOGIN until protected credential
  provisioning and read-only TLS connectivity verification succeed.

## TLS verification outcome

A Vercel `iad1` sandbox reached the public pooler and received PostgreSQL's
SSLRequest acknowledgement. The leaf certificate subject was
`CN=*.pooler.supabase.com` and issuer
`Supabase Intermediate 2021 CA`. Its SHA-256 fingerprint was
`03:70:9C:A4:4D:1B:06:E4:50:4D:A0:A8:3B:6C:A0:65:76:1E:DC:70:4C:D5:63:4B:CC:38:94:FD:5C:7B:32:48`.

The Vercel sandbox's default trust store rejected the TLS handshake with
`self-signed certificate in certificate chain`. Supabase's official
Postgres SSL guidance says that `verify-full` requires its root CA certificate,
downloadable under **Apex Supabase Dashboard → Database Settings →
SSL Configuration → Download Certificate**.

Do **not** set `rejectUnauthorized:false`, disable TLS, or accept
certificates merely because the hostname looks correct.

## Server configuration enforcement

`retail-db-server-config-v1.mjs` pins the exact verified hostname for the
transaction pooler and port 6543, rejects privileged `postgres` and other
wrong-project usernames, and now requires a valid CA certificate from the
server-only `APEX_RETAIL_DB_CA_PEM` environment variable.

The private Node PostgreSQL client sets
`ssl: { ca: <trusted Supabase CA PEM>, rejectUnauthorized: true }`.
It never combines the URI with client-controlled SSL query parameters. A
missing/invalid CA fails before any network connection.

The certificate is not a secret, but its **trusted provenance** matters.
It must be obtained from the actual project dashboard and validated using a
credential-free TLS verification against the exact pooler hostname.

## Remaining production setup

1. Obtain `prod-ca-2021.crt` from the Apex Supabase database SSL settings
   and configure it in protected server-only `APEX_RETAIL_DB_CA_PEM`.
   Test TLS hostname and CA verification, including failure on wrong CA.
2. Generate a separate random password for the dedicated
   `apex_retail_checkout_app` login and provision it through an approved
   secure workflow. No admin password or `postgres` role is permitted.
3. Set `APEX_RETAIL_DB_URL` server-side only, scoped to the verified host,
   custom role and `postgres` database. Do not expose the URL through
   `NEXT_PUBLIC_` variables, logs, or a screenshot.
4. Verify an external **read-only** query from a Vercel function as the
   restricted identity, and verify `SET LOCAL ROLE` on one connection
   without switching on order admission.
5. Implement order ownership, origin/CSRF, rate limits, guest-session policy,
   payment-finality reconciliation and BTCPay readiness before opening public
   checkout.

The private `retail_order_engine_gate` and public checkout endpoint remain
OFF, and no live checkout requests, customer orders, Bitcoin invoices, or
supplier payouts are enabled by this configuration patch.
