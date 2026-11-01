# PR #120 — Shared test invoice lock and split-sync hold (November 1, 2026)

**DISPOSABLE POSTGRES ONLY. No production deployment, checkout, hosted migration, BTCPay Greenfield invoice creation, Prism configuration write, wallet signing, or payout transfer.**

## Why

PR #119 verified that a review of a new storefront split can be blocked if invoices or payouts remain unresolved. But a successful point-in-time review is not enough: a new invoice can be created after review and before a future Prism store-level setting change. Prism 1.3.3 uses the current store-level split at invoice confirmation. The previous review lock was not shared with the test invoice writer.

## What this pass adds

- `database/sql/apex_btcpay_test_invoice_sync_hold_REVIEW_ONLY.sql` adds a private, immutable, test-only per-store `btcpay_test_split_sync_holds` row that is **not** a payout rule and has no activation authority. It has no self-service release path.
- Every INSERT into the disposable `btcpay_test_invoices` journal takes the same `storefront:<uuid>` transaction advisory lock used by the PR #119 review function, including privileged test writes. An existing hold fails the INSERT closed.
- Privileged `apex_test_internal.hold_btcpay_test_split_sync(rule_id)` is unavailable to browser roles. It acquires the shared store lock, verifies the original approval and canonical allocation snapshot, rechecks recipient status, newly arrived invoices, independently recorded claim/wallet finality, prior transfer confirmations, competing rules, and existing holds, then records `held_no_provider_sync`. It **never** calls Prism or marks a rule active.
- `tests/payout-rls/btcpay-invoice-sync-hold.sql` confirms a held 90/10 rule remains draft, new test invoices are rejected, another store can still register an invoice, a stale approval cannot acquire a hold, and browser roles cannot create or modify holds.
- `tests/payout-rls/btcpay-invoice-sync-hold-concurrency.sh` starts two real database sessions: the hold locks the store and remains in an open transaction, and a competing invoice writer is seen waiting on the PostgreSQL lock. After the hold commits the invoice is rejected, not inserted.
- CI runs after the existing PR #119 PostgreSQL authorization, history, concurrency and real regtest checks; all dependencies stay stacked on PR #119.

## Explicit limitations before any real split synchronization

1. A PostgreSQL trigger protects **only invoices registered in this specific test database**, not external BTCPay invoices created directly through Greenfield. In a real system every invoice creation path must coordinate **before** the provider API call and retry/refuse checkout when a store is held. Bypassing the journal or operating separate databases can defeat this fixture.
2. A DB-only finality check cannot see unknown BTCPay invoices, double-spend risks, reversals, unsettled Prism claims, or balance/fee risk. A trusted independent worker must re-read the provider invoice inventory, payout inventory, wallet receipts, signing/network state, and any unresolved exceptions. There is **no** provider attestation or wallet evidence writer here.
3. External Prism settings cannot be changed transactionally together with PostgreSQL state. A future separately reviewed **durable transition protocol** must reconcile the provider, leave checkout paused safely during synchronization, verify the applied rule against Prism's supported interface, provide an explicit recovery path for ambiguous outcomes and then release the checkout hold.
4. Existing production order endpoints are not routed through this test table. No existing live checkout or payment features change. No universal safe invoice minimum has been established; BTC fees and wallet UTXOs still require calibration.
5. The hold is intentionally sticky and has **no release function** in this pass. It is an isolated proof of the entry barrier only, not a usable production control.

## Acceptance requirements

- Exact-head isolated PostgreSQL/RLS CI green, including both-session lock contention, denial tests and zero active rule writes.
- Apex quality and upstream BTCPay/Prism regtest CI green at the same exact head, or explicit review of why a workflow did not run.
- Draft PR only, unmerged, undeployed; never treat passing tests as permission to enable live payout operations.

Parent: [PR #119](https://github.com/zanibethel/apex/pull/119); before that [PR #118](https://github.com/zanibethel/apex/pull/118). 
