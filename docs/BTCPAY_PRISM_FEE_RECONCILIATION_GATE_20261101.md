# PR #118 — Prism fee budget and payout reconciliation gate (2026-11-01)

**TEST ONLY: disposable GitHub-hosted BTCPay/Bitcoin Core regtest. NOT an approved live payout engine.**

## Why this pass is needed

The original real Prism test using a **1,000,000-satoshi** invoice produced two legitimate claims, but only one wallet received coins: supplier **882,000 sats** was marked Completed and platform **98,000 sats** stayed AwaitingPayment. A second run with a **10,000,000-satoshi** invoice and the **same Prism 2% reserve** confirmed both payouts in two separate 90/10 and 85/15 stores (PR #117, successful CI #41311725324). That comparison suggests fee/change/UTXO headroom deserves investigation, but does **not** prove the precise cause. The smaller test must not be marked as successful.

## The implemented test-only policy

`src/lib/payments/prism-payout-reliability.mjs` provides two **pure, non-executing** functions:

1. `assessSyntheticPrismFeeBudget`: requires explicit regtest/test-only mode, a frozen 10,000-basis-point split, strictly positive integer satoshi invoice, a declared Prism fee reserve, an **operator-supplied maximum estimated network fee**, a safety margin and a minimum usable recipient amount. It returns a fail-closed hold if reserve is too small or either expected recipient amount falls below the minimum. This is a **conservative planning gate**, **not** a prediction of Bitcoin mempool fees or assurance that UTXOs exist.
2. `reconcileSyntheticPrismPayout`: requires two unique Prism BTC-CHAIN payout claims, the correct role/amount, **Completed** payout API states and independently confirmed BTC wallet receipts for both recipients. Returns `verified_complete` only when every piece matches. A missing, conflicting, cancelled, overpaid or marked-complete-without-payment claim requires manual review. An ordinary pending claim is **polled**, never re-broadcast, because automatic retries risk a double transfer. An overdue pending claim is flagged for escalation.

The current regtest integration uses **synthetic example policy limits only**: a 15,000-satoshi *declared* maximum fee ceiling, plus a 15,000-satoshi safety margin, and a 50,000-satoshi minimum output per recipient. Those are **not calibrated production values**. The simulated 1M-sat order with a 2% reserve yields only **20,000 sats of reserve** and returns `hold_for_review` under this fixture; the 10M-sat order reserves **200,000 sats** and is test-budget-eligible. Both return `allowsAutomaticPayout:false` and `productionReady:false` regardless of the budget outcome.

No wallet transfer, Greenfield payout creation, refund, or production order is initiated by this module. The prior real Prism regtest test now also verifies **both payout API states are Completed after both wallets receive confirmed payments**; it must fail otherwise. Initial automated tests cover 90/10 and 85/15, a smaller invoice, malformed/forged splits, duplicate claims, partial pending status, late pending status, inconsistent provider states, wrong amounts and missing confirmations.

## Operational alert contract — not implemented in hosted Apex yet

A future *trusted private* reconciliation worker should persist one immutable record per store/invoice/payout revision, including each recipient's expected allocation, Prism claim ID, provider state, network transaction proof, actual confirmations, reserve/fee and discrepancy. It should:

- Poll the **existing payout**, not create an additional payout, until a bounded deadline.
- On `AwaitingPayment` beyond the operator-defined threshold: alert an authenticated platform administrator and mark `manual_review`. Record an escalation and freeze changes to that invoice's split configuration.
- If BTCPay says Completed but the receiving wallet has insufficient confirmations or amount: **do not mark settled**; escalate the mismatch.
- If wallet confirms but BTCPay still says pending, keep the payment on hold and investigate provider state. Never duplicate the transfer.
- Require a *server-reviewed and approved* fee policy using current network fee estimates, payout sizes, change/dust estimates, sufficient wallet UTXOs and a maximum fee budget. The fixture values here are intentionally not reusable.
- Monitor residual balances, payout fees and oldest pending age across all suppliers; review failed and stuck payouts in the admin dashboard. That dashboard alerting/data migration is still **future work**.

## Remaining launch blockers

Real admin split activation still stores **drafts only**. Prism uses the store's current allocation when a payment confirms, which can change older pending-invoice economics. Before live use, implement a proper per-invoice version strategy or a reviewed freeze of pending invoices, admin approval workflow, durable reconciliation, and alerts. Check small-invoice fees with a funded hot wallet and fee estimation before adopting any minimum. This pass does **not** install production software, make an Apex hosted Supabase migration, activate payouts or change a real-money wallet.

Prior evidence:
- [Successful real Prism payout run](https://github.com/zanibethel/apex/actions/runs/41311725324)
- [Prior small-invoice partial payout failure](https://github.com/zanibethel/apex/actions/runs/41311264299)
