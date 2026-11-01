# PR #127 — real Greenfield provider call through trusted disposable SQL worker
Date: November 1, 2026

**DISPOSABLE CI ONLY. This is NOT a live BTCPay checkout, hosted Supabase migration, live wallet, Bitcoin mainnet payment, Prism settings update, or production deployment.** No customer payment destination or usable checkout link is emitted.

## New integration milestone

PR #126 proved the worker using real PostgreSQL but *simulated* Greenfield HTTP. PR #127 adds a separate test stage in the already-existing GitHub Actions BTCPay upstream **regtest** workflow, after Bitcoin Core has independently confirmed the chain is regtest and the existing BTCPay/Prism transaction regression has run.

1. `scripts/btcpay-ephemeral-trusted-live-db.sh` creates a **second disposable Postgres database** `apex_test` alongside the existing `apex_journal_ci`. It applies only the repo's isolated payout/receipt/dual-admin/hold/one-shot/intent/binding SQL fixture files. None are live migrations.
2. `scripts/btcpay-ephemeral-trusted-live-greenfield.mjs` creates a completely new BTCPay administrator and separate synthetic store on `http://127.0.0.1:14142`. It configures a disposable, no-private-key-saved regtest BTC-CHAIN wallet and a short-lived *store-scoped* key with exactly `btcpay.store.cancreateinvoice` and `btcpay.store.canviewinvoices`. Key, wallet derivation, passwords and payment URLs stay in memory and are never printed.
3. With the actual provider store ID, `btcpay-real-provider-worker-setup.sql` creates an isolated storefront, a draft 90/10 allocation, immutable store hold, **synthetic** prerequisite recovery audit entries, two distinct test-admin signatures, one one-shot permit, and a permanent exact Apex-to-BTCPay store binding. Neither the draft split nor Prism settings are activated.
4. The PR #126 trusted PostgreSQL-backed worker first commits its reservation and irrevocably consumes the permit, re-reads the committed intent and approval snapshot, then issues **one actual Greenfield invoice POST** to that local regtest store. The PR #125 adapter performs authenticated GET readback and checks the opaque intent metadata, store, order and exact BTC sats.
5. The new test independently lists all invoices for that store and requires exactly one, rejects a repeated worker invocation before HTTP, checks durable database observation tied to the actual provider invoice ID, verifies the original hold and draft rule stay unchanged, and prevents any user-facing checkout journal registration.
6. Exact BTC amount readback now supports provider JSON decimal strings and decimal numbers while proving equality through integer satoshi arithmetic (never floating-point multiplication). The new unit test rejects mismatched amounts, exponent strings, malformed tokens and null values.

## CI and reviewer criteria

All three exact-head checks must pass:
- `Apex quality checks`: lint, typecheck, unit tests including real-response BTC amount parsing, build and app RLS.
- `Payout RLS isolated Postgres verification`: all prior security, immutability and concurrency tests.
- `BTCPay ephemeral upstream regtest readiness`: previous actual BTC/Prism forwarding plus the **new actual Greenfield POST through the DB-backed trusted worker** and exact provider+database reconciliation.

Greenfield is connected to a genuine **local provider test server**, not mock HTTP. No real Bitcoin or customer checkout is involved. Bitcoin Core, NBXplorer and PostgreSQL all run inside an ephemeral GitHub Actions worker and disposable volumes are destroyed at job end. Tests run on GitHub-hosted CI only. No new permanent server, external app subscription or duplicate ongoing infrastructure is created.

## Still NOT proven

- Neither existing Prism settings nor future production payout splits are synchronized by this worker. The regtest 90/10 fixture is **not** actual Prism activation or supported production settings readback.
- Recovery audit evidence in this test is synthetic. The real worker authorizes one invoice *after* fake audit prerequisites; it does not certify actual merchant wallet settlement or supplier payment eligibility.
- Third-party callers can still issue Greenfield invoices if they have their own keys or admin UI access. Provider-side writer inventory/credential coverage remains unresolved.
- Durable intent + remote POST remains non-atomic across PostgreSQL and Greenfield. A runner crash or uncertain response requires separate manual reconciliation and must not automatically resend. This PR tests successful real provider readback and duplicate denial; ambiguous timeout behavior remains tested with simulated HTTP in PR #126.
- The SQL worker still uses an isolated PostgreSQL superuser fixture. A production implementation requires minimum-privilege server identity, tenancy and store provisioning, secrets management, independent audit/permission checks, end-to-end failure injection, deployment review and merchant/legal/payment eligibility approval.

Parent: PR #126; stacked dependencies PRs #125 through #117. Keep **DRAFT, unmerged, undeployed**. No customer-facing changes.
