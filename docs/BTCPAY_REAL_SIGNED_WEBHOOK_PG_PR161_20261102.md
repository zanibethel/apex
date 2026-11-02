# PR #161 — real signed BTCPay regtest webhook with durable PostgreSQL

**As of November 2, 2026.** Scope: disposable GitHub runner only. No production commerce.

## Why
PR #160 imported pure regtest-only payment admission and reconciliation
helpers into current main, but their provider and signed-webhook scenarios
used synthetic HTTP, in-memory delivery deduplication, and synthetic wallet
evidence. Existing unmerged [PR #114](https://github.com/zanibethel/apex/pull/114)
had previously passed an upstream **real** BTCPay test on its stacked base.
PR #161 ports that narrowly scoped working set onto current main and
requires its own clean independent CI result.

## Real acceptance path
1. GitHub Ubuntu test runner starts disposable PostgreSQL 17, fetches
   verified/pinned official BTCPay upstream source and independently verifies
   Docker Compose and Bitcoin Core **regtest**, with no public port listening.
2. Run official BTCPay Server locally, bootstrap an ephemeral test store,
   create its nonpersistent watch-only test wallet and a least-privilege
   Greenfield invoice API key (not logged, stored, or published).
3. Register an actual local `InvoiceSettled` webhook, with a random secret
   and loopback-only HTTP receiver. Create a BTCPay invoice for synthetic
   order `APEX-REGTEST-001` at 10,000 worthless test satoshis.
4. Mine 101 blocks with disposable Bitcoin Core wallet to obtain funds,
   send a local regtest payment to the BTCPay-provided `bcrt1` destination,
   mine six more blocks, and independently re-read the invoice as
   `Settled` / `None` from Greenfield.
5. Receive actual provider-generated `BTCPay-Sig` HMAC callback. Validate
   raw signature, scoped store, invoice, order metadata, exact satoshi amount,
   provider state, and reject replay collisions, tampering, and cross-store
   signatures. The receiver only sends an HTTP 200 **after** the worker writes
   the checked event through a PostgreSQL `SECURITY INVOKER` function.
6. PostgreSQL verifies snapshot identity, serializes the event with a row lock,
   inserts one immutable receipt, provider observation, order status and
   append-only history. Identical retries return `duplicate` without
   incrementing the revision. Query database records to prove one settled
   observation, one history row, and one revision, not just in-memory
   counters. On any failed durable write, respond non-2xx; never claim an
   accepted payment.
7. Tear down containers and volumes, delete temporary test data. All
   external addresses (except the pinned public source checkout) stay
   restricted to the test runner's loopback.

## Imported from reviewed draft
- `scripts/btcpay-local-doctor.mjs`
- `scripts/btcpay-ephemeral-{greenfield,regtest-payment,webhook,pg-journal}.mjs`
- Two `database/sql/*_REVIEW_ONLY.sql` journal/order schemas
- Three `tests/payout-rls/btcpay-live-journal-*.sql` fixture statements
- Their original Node tests and an additional PR #161 CI gate test
- `.github/workflows/btcpay-upstream-regtest.yml`

## Not proven or released
- No real BTC, Bitcoin mainnet, production VPS, persistent webhook endpoint,
  Supabase-hosted migration, production order changes or checkout activation.
- This tests **invoice settlement and durable receipt**, NOT Prism forwarding
  or two actual recipient wallets. Real admin-configurable split settings and
  Prism-generated two-wallet regtest payouts remain in draft PRs #115–#127,
  to be independently verified before later integration.
- `settled_reported` is a test-only order **display state**, never
  fulfillment authorization or an automatic payout.
- Operational merchant eligibility and commercial approvals are separate.

## Merge gate
PR verification must show, on the exact head commit:
- `Apex quality checks / verify` (lint, TypeScript, Node regressions, build).
- `Apex quality checks / rls-integration` (disposable PostgreSQL isolation).
- `BTCPay ephemeral upstream regtest readiness / upstream-local-regtest`
  complete **success** with actual upstream server + Bitcoin Core regtest,
  authentic signed webhook, and durable Postgres readback.
- Vercel preview success.
If any are pending/failed, leave the PR unmerged, report blocker and exact
workflow run. A green preview alone is not enough.

## Next
After #161, selectively port the two-wallet Prism regtest and the
admin-approved immutable split activation race tests from #117–#127,
and require independently confirmed test wallet receipts. Keep live checkout
disconnected until separately authorized.
