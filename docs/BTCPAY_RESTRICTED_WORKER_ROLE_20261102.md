# PR #172 — restricted PostgreSQL invoice worker (disposable regtest only)

**November 2, 2026.** This is a GitHub Actions `postgres:17` test fixture only. It is **not** a Supabase migration, does not modify hosted databases, and cannot enable live checkout or BTC payouts.

## Change

The previous test worker used `PGUSER=postgres` for its three SQL operations. The new `apex_test_invoice_worker` role is a separate login with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `NOBYPASSRLS` and `NOINHERIT`.

The ephemeral CI job generates a unique random password each run, masks it in action logs and never commits it. The worker connects as that role through `psql`; controller/setup scripts still use the disposable PostgreSQL superuser to create fixtures and independently inspect audit records.

The login has **no direct SELECT, INSERT, UPDATE or DELETE** on payment intents, observations, approvals, one-shot permits, payout rules, bindings or checkout journal tables. It cannot call the original privileged operator functions. It receives `USAGE` on one new unexposed `apex_test_worker` schema containing exactly three role-granted, `SECURITY DEFINER`, empty-search-path functions:

- `worker_reserve_btcpay_test_provider_post`: invoke existing atomic one-shot reservation under the current audited two-admin approval and store lock
- `worker_verify_btcpay_test_provider_post`: return only the specifically pinned committed intent/readback snapshot
- `worker_observe_btcpay_test_provider_post`: append a permitted observation to the existing immutable journal

The underlying validations, provider binding, consumed permit, immutable storefront hold and append-only tables remain unchanged. Browser roles `anon` and `authenticated` cannot execute these worker functions.

## Coverage

- Isolated PostgreSQL CI checks role attributes, schema grants, all three permitted function grants, inability to invoke original operator RPCs, denial of direct table reads/writes and denial of browser RPC calls. It then connects over PostgreSQL as the real worker login and runs the full SQL-backed success/timeout test.
- The upstream Bitcoin regtest runner creates the same role in its separate disposable `apex_test` database before invoking the real Greenfield worker. The successful provider invoice, duplicate prevention, Prism forwarding and post-commit crash reconciliation remain part of the exact-head upstream verification.
- The unit test checks fail-closed rejection of other `PGUSER` values. No new dependencies, permanent hosting or live credentials.

## Limits and next gates

A `SECURITY DEFINER` gateway is an intentional privilege boundary and needs code review. These fixed functions operate only in CI and cannot verify provider attestation themselves; network GET/reconciliation remains the worker's responsibility. A runner's privileged setup/controller scripts still retain `postgres` credentials in the **same CI environment**, so this is not a claim of operating-system credential isolation. A future production worker must have its own service/process identity, no setup credentials, vault-provided per-store secrets, restricted tenant authorizations, independent recovery approval and rotation procedures.

This scope does not fence BTCPay admin UI or other Greenfield API keys, change Prism settings, create a production service role, or activate customer checkout. **Do not copy this fixture into Supabase migrations.** Merge only after latest PR-head application, isolated PostgreSQL/RLS, actual BTCPay/Prism regtest and Vercel preview are all green.
