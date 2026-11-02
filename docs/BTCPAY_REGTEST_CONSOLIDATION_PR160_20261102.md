# PR #160 — BTCPay regtest verification consolidation (2026-11-02)

## What PR #160 actually brings to main

This is the **first small, independent landing** of the large BTCPay+Prism
stacked DRAFT test branches. Source modules and their original tests are
copied, unchanged except for an identified fail-closed fix, from the earlier
tested branch `test/btcpay-real-trusted-worker-regtest-20261101` (PR #127).

* `src/lib/payments/btcpay-regtest-prepost-fence.mjs` (PR #125):
  a durable reservation **callback contract** before a single local regtest
  invoice POST, exact Greenfield GET identity check, and operator reconciliation
  instead of automatic re-POST on ambiguous outcomes.
* `src/lib/payments/prism-payout-reliability.mjs` (PR #118):
  administrator-supplied split basis points (90/10, 85/15), explicit fee
  headroom, satoshi arithmetic, wallet-vs-claim reconciliation with
  no automated retries or fulfillment.
* `src/lib/payments/btcpay-provider-drain.mjs` (PR #121):
  strictly loopback-regtest **GET-only** invoice/payout inventory and
  cross-check against a separately supplied, independently verified ledger.

A new synthetic acceptance test composes these three into a contiguous
**in-memory test scenario**: committed-reservation callback → one Greenfield
POST → independently read-back invoice → synthetic HMAC-signed settlement
callback with replay rejection → allocation from approved fixture percentages
→ two independently confirmed wallet receipts → all provider invoice/payout
rows accounted for. It checks **both 90/10 and 85/15** and failures such as
ambiguous POST, forged callback, double delivery, missing payout proof and
an unknown third outgoing claim. This latter case revealed a real bug in the
draft helper: when two expected payouts were valid, a third unrecognized
payout could still result in `verified_complete`. The patch now forces
`manual_review` for ANY claim-count mismatch.

## Important distinctions

**This PR does not prove a real server-to-server BTCPay run.** The integrated
test uses stubbed Greenfield responses, an in-memory event deduplication set,
and synthetic wallet snapshot data. The isolated **real BTCPay + Bitcoin Core
regtest** scripts, ephemeral PostgreSQL journal, actual signed provider
webhooks, actual Prism forwarding and provider-backed claims remain in
stacked draft PRs #109–#127. Those need a separate, independently verified
review and CI integration on top of the newly merged main branch.

**This PR does not persist invoices to the hosted Supabase database.** The
`reserveDurably` and `recordObservation` functions are test-injected
contracts; the trusted PostgreSQL implementation remains in draft #126/#127,
not in production. Do not mistake a simulated callback for a deployed
transactionally durable webhook handler.

**No mainnet or testnet, production VPS, wallet seed/secret, customer transaction,
payment enablement, checkout route, webhook route, actual BTCPay store,
hosted DB migration or live order mutation is implemented.**
The imported helpers are not referenced by the Next.js runtime and explicitly
return `checkoutReleaseAllowed:false` /
`automaticPayoutAllowed:false` /
`productionReady:false`.
Admin-managed percentages are fixture inputs here, **not** a live admin split
control or approved Prism configuration.

## Required acceptance before merging

- GitHub `verify`: lint, typecheck, full Node tests, production build.
- GitHub `rls-integration`: existing disposable PostgreSQL security suite.
- Vercel preview READY for the exact PR head.
- Explicit test coverage for extra/duplicate/unexpected payout claims.
- No integration with live storefront or supplier routes.

## Next PR after #160

Rebase or independently reproduce real regtest runner work from #109–#127
on the current `main`, beginning with the trusted disposable PostgreSQL
journal and a **real signed webhook** acceptance. Preserve the existing
two-admin split-change review and invoice-writer lock from drafts #119–#127.
Do not enable live payments or imply that a passing read-only reconciliation
authorizes a payout.

## Operator warning

The repository README and October 29 status document are historical and not
a reliable representation of November 2 deployed features. Refer to recent
merged PRs #155–#159 for supplier-product changes.
