# PR #126 — trusted disposable PostgreSQL invoice worker
November 1, 2026

**TEST-ONLY: NOT A HOSTED SUPABASE MIGRATION, CUSTOMER CHECKOUT, LIVE BTCPAY INVOICE, OR PRISM CONFIGURATION WRITER.**

## Goal

PR #125 demonstrated a durable pre-POST reservation, but its network helper accepted caller-supplied `reserveDurably` and `recordObservation` functions. Those injection points are fine for unit tests but **do not create a trustworthy service**. PR #126 adds a separate private, GitHub-Actions-only worker that owns fixed SQL scripts and the Greenfield network adapter end-to-end.

## Design

1. **Runtime fence.** `scripts/btcpay-ephemeral-trusted-pg-worker.mjs` refuses execution unless running as a GitHub Actions CI test with `APEX_BTCPAY_EPHEMERAL=true`, `regtest`, and the known disposable local `postgres:17` database at `localhost:5432/apex_test`. Credentials remain in the runner environment, never API/client parameters or logs. This is a test-only guard, **not** an impersonation-proof identity check for future cloud workers.
2. **Pinned store binding.** `database/sql/apex_btcpay_test_trusted_pg_worker_REVIEW_ONLY.sql` creates an immutable, private test Apex-scope-to-Greenfield-store mapping. Every durable provider POST intent must match the mapping; attempts to switch stores are rejected **inside the same transaction** without consuming the permit.
3. **Private, fixed SQL scripts.** The worker does not accept arbitrary SQL or a caller-provided authorization callback. It executes only the repository-pinned `btcpay-worker-reserve.sql`, `btcpay-worker-verify.sql` and `btcpay-worker-observe.sql` using `psql -X -v ON_ERROR_STOP=1`, validated parameters and a short child-process deadline. The reservation commits separately before any HTTP work. A separate database query validates the persisted exact intent UUID, storefront, BTCPay store, order reference, amount, consumed permit, canonical rule snapshot and unchanged audit head.
4. **At most one POST.** After durable readback, the original PR #125 loopback-only adapter can send **one** Greenfield POST, then perform an authenticated GET to verify the invoice's identity, exact BTC amount and intent. A timeout, HTTP response ambiguity, readback mismatch or observation-persistence failure **never** triggers an automatic retry; the original intent/permit is already durably consumed. The worker can return either `observed_regtest_invoice_no_checkout` or `operator_reconciliation_required`; neither permits fulfillment, checkout, split activation or payouts.
5. **Real DB integration + mocked provider.** `scripts/btcpay-ephemeral-trusted-pg-worker-check.mjs` runs against the **actual disposable GitHub PostgreSQL service**, not an in-memory fake; it uses deliberately simulated Greenfield responses for one success and one timeout. The final SQL assertions verify precisely two immutable intentions and observations, both permits permanently consumed, original holds intact and payout rules still draft. A second worker call per store must fail *before* any HTTP. No external BTCPay request occurs in this test.

## Tests

- `tests/btcpay-trusted-pg-worker.test.mjs`: rejects non-CI, remote/hosted database, wrong network, invalid input, forged SQL readback and SQL failures before HTTP; verifies correct private SQL -> POST -> GET -> observation call order with a mocked database.
- `tests/payout-rls/btcpay-trusted-worker-setup.sql`: two synthetic stores, two independently approved versions, pinned readback events and distinct administrator signatures, one permit each; verifies cross-store binding attacks fail and cannot consume a valid permit.
- `scripts/btcpay-ephemeral-trusted-pg-worker-check.mjs`: actual disposable PostgreSQL bridge with simulated Greenfield responses and one-shot test.
- `tests/payout-rls/btcpay-trusted-worker-results.sql`: confirms authoritative durable state, no repeat POST, no active checkout, intact hold and draft rule.

## Safety and outstanding engineering gaps

- **Not production-ready:** there is no Vercel/Next.js route, hosted Supabase schema, live store credential, real BTCPay or mainnet call, external invoice admission service, or operator-facing dashboard release. All SQL is explicitly disposable and not a hosted migration.
- This workflow's HTTP replies are **mocked**. Upstream BTCPay/Prism CI continues independently with actual worthless Bitcoin regtest transfers, but it does not call this new trusted worker. Future work can connect the worker to a real disposable BTCPay instance only after fully scoping its database fixture and permitted API identity.
- The service's private `psql` connection is a trusted CI **superuser fixture**, not a least-privilege production credential. Before production, implement separate service role, tenant/store credential binding, authorization, MFA/signing, secret rotation, audit retention, resilient outbox/worker orchestration and independent operator recovery.
- PostgreSQL cannot make a remote Greenfield POST atomic. After a committed intent with unknown outcome, **no automatic retries**, even if the provider appears empty initially. Audit the complete provider invoice inventory and wallet finality, including delayed transactions, before manually authorizing a new operation. Provider third-party writers remain outside the fence.
- Prism's public configuration writer is not verified and is not implemented here; no plugin setting or allocation is activated. Existing live customer/supplier-facing behavior remains unchanged.

## CI acceptance

Require all three exact-head checks (Apex quality, isolated PostgreSQL/RLS and real upstream BTCPay/Prism regtest). Keep the stacked PR draft/unmerged/undeployed, with no real payment or infrastructure cost.

Parent #125; upstream dependency chain #124–#117.
