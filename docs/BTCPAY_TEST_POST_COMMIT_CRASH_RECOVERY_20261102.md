# PR #171 — real disposable Greenfield post-commit crash recovery

**Date:** November 2, 2026

**TEST-ONLY.** The scenario runs only inside the existing GitHub-hosted, local Bitcoin `regtest` + BTCPay/Prism runner. No production migrations, public checkout, customer invoice URL, real wallet, mainnet payment, external provider access, or payout activation.

## Purpose

PR #170 proved a normal successful POST/readback. This follow-up exercises a dangerous failure window: **BTCPay accepted a Greenfield invoice creation request, but the worker process terminated before saving any provider observation in PostgreSQL.** The locally committed intent and consumed permit must survive that worker death.

## Real provider scenario

1. Use a **second separate** synthetic Apex storefront and BTCPay regtest store; the original #170 happy-path store and all existing Prism 90/10 and 85/15 wallet tests still run unchanged.
2. Create a store-scoped Greenfield key limited to **invoice create + invoice view**; the token is only delivered to the isolated worker through its ephemeral process environment and is never printed.
3. Prepare synthetic dual-admin signatures, a pinned recovery-audit head, immutable 90/10 *draft*, held checkout, single-use permit and Apex-to-provider store binding in the **disposable** `apex_test` database.
4. Spawn a **separate Node process** that owns a real SQL-backed trusted worker. It commits the intent, verifies it independently, sends one actual Greenfield POST, reads a successful provider response, and deliberately exits with code 79 **before authenticated GET or observation write**.
5. The surviving controller reads the persisted intent. It must be exactly one, with the permit consumed and **zero** provider observations. The replacement worker attempts the same operation and must be rejected by PostgreSQL **without any HTTP request**.
6. A narrowly scoped **read-only provider invoice inventory + invoice GET** must show exactly one invoice; the invoice's store, order, opaque intent UUID, currency and exact integer-satoshi amount must match the pre-crash committed record.
7. Only after independent readback, the private operator appends the verified provider invoice to the immutable audit journal. The final SQL assertion confirms one observation, a consumed permit, a held storefront, a still-draft split, and **no customer checkout invoice**. A subsequent restarted worker call must still be rejected, and provider inventory must still contain exactly one invoice.

## Files

- `scripts/btcpay-ephemeral-regtest-crash-recovery.mjs`: controller and hard process-exit fault injection (`--crash-child`), isolated to GitHub Actions + 127.0.0.1, with no auto-post retry
- `tests/payout-rls/btcpay-real-provider-crash-setup.sql`: separate synthetic storefront, dual-admin signatures and provider binding
- `tests/payout-rls/btcpay-real-provider-crash-intent.sql`: verify committed intent survives termination and has no observation yet
- `tests/payout-rls/btcpay-real-provider-crash-final.sql`: independently verified operator reconciliation and permanent no-retry/hold assertions
- `scripts/btcpay-ephemeral-trusted-live-greenfield.mjs`: executes the crash scenario after normal provider verification
- `scripts/btcpay-ephemeral-greenfield.mjs`: exposes `postCommitCrashRecoveryVerified: true` only when this actual live-regtest scenario completes
- `tests/btcpay-regtest-crash-contract.test.mjs`: guardrail that keeps the crash harness test-only and disconnected from production app routes

## What this does *not* establish

- We do not prove provider-wide exactly-once delivery or all possible mid-flight network failure outcomes. PostgreSQL cannot atomically commit with a remote Greenfield POST. A real network timeout, power loss, provider inventory outage or stale/ambiguous invoice metadata still requires manual investigation.
- A **negative provider inventory check alone is not permission to re-POST**: eventual consistency, delayed payments and third-party writers must be reviewed independently before any new authorization.
- The two-admin and recovery prerequisites in these disposable fixtures contain **synthetic test evidence**, not production wallet finality. They do not authorize customer funds, shipping, supplier payments or Prism split activation.
- External BTCPay UI users and other API keys are not fenced by this worker. Hosted Supabase roles, production secrets, supported Prism settings management and operator workflows remain separate future tasks.

## Merge gate

Require the latest exact PR-head Apex quality/Node tests, isolated PostgreSQL/RLS checks, actual BTCPay/Prism on-chain regtest **plus the new real post-commit crash scenario**, and Vercel preview all green. No production deployment.
