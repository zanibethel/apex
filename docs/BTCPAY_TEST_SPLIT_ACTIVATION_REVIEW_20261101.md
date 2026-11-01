# Apex split activation approval gate — PR #119 (2026-11-01)

**STATUS: disposable PostgreSQL-only, REVIEW ONLY. No hosted migration, active rule, Prism configuration, live payout, production checkout, or approved merchant wallet.**

## Objective

Apex admins already save draft allocations. Real Prism forwarding succeeded in PRs #117/#118 but Prism 1.3.3 chooses the **current store settings at invoice confirmation**, not the percentages snapshotted when an older Apex order is created. Automatically applying admin edits while invoices remain unsettled could alter prior agreements.

PR #119 implements **only** the approval and readiness barrier in a disposable test database. It does **not** change `payout_rules.status` away from `draft`, write Prism settings, or permit customer/supplier payout activity.

## New review-only schema

`database/sql/apex_btcpay_test_split_activation_REVIEW_ONLY.sql` includes:

- `btcpay_test_split_activation_reviews`: one immutable source rule ID/version and canonical allocation JSON per evaluated storefront draft, approval status of either `blocked` or `approved_pending_manual_sync`, counts for open invoices/unreconciled payouts/conflicts, reviewer user ID and timestamp. There is a partial unique index allowing at most one eligible candidate per storefront at once.
- `btcpay_test_invoice_finality_proofs`: synthetic privileged-writer-only evidence that both claims and both wallets confirmed for a given regtest invoice. Existing signed invoice statuses alone **do not** satisfy finality. Browser users cannot write this proof. This does *not* implement or authorize a production evidence writer.
- `review_btcpay_test_split_activation(rule_id)`: checks both **trusted platform_admin app_metadata** and database membership, reads the existing draft with an advisory transaction lock, verifies at least two active/unique recipients totaling exactly 10,000 basis points, checks all earlier invoices for settled status **and** trusted finality evidence, checks each prior payout allocation has a `confirmed` transfer record, and rejects conflicting active/scheduled or already approved candidates. Returns only `blocked` or `approved_pending_manual_sync` and writes a *point-in-time* review record.
- Approved candidate guards on the source rule and its allocation rows prevent in-place edits. A change to 90/10 → 85/15 must use a new rule version. An authenticated client cannot change an approved rule, access someone else's review, or edit the trusted finality proof.
- Re-reviewing a candidate **can revoke its prior eligibility** if a new invoice appears. Approval does not automatically synchronize anything or activate any payout.

## Mandatory transaction/locking caveat

**This is not yet a safe production activation algorithm.** A race can still occur between the point-in-time review and a newly created invoice, because the existing invoice-creation and Prism-delivery workers have **not** been modified to acquire the same advisory store lock. Before any real synchronization, introduce a coordinated per-store lock/drain mechanism across **all** invoice creators, workers and the future Prism settings writer, and re-fetch the provider's outstanding invoice/payout inventory under that lock. If any unknown, delayed, partially paid, disputed, or unmatched invoice exists, fail closed. Global store settings are unsuitable for product-specific or mixed-supplier allocation without a separate, reviewed per-invoice design.

This PR is **only review-readiness scaffolding**; its `approved_pending_manual_sync` value is an explicit non-authorizing status, not a production activation. There is deliberately no admin-facing **Activate** button and no hosted API mutation.

## Disposable CI coverage

The new `tests/payout-rls/btcpay-split-activation-gate.sql` uses existing admin/supplier identities and synthetic 90/10 then 85/15 drafts to verify:

- Outstanding payout transfers block review.
- Once synthetic transfers are confirmed, a clean scope can receive a **review-only** approval, but the source rule remains draft and cannot be edited in place.
- A newly created invoice revokes prior review eligibility.
- Even a BTCPay `settled_reported` invoice remains a blocker until trusted *two-recipient claim and wallet-finality* evidence exists.
- After proofs are present, re-review is possible, but a conflicting second candidate remains blocked.
- Verified admin membership **and** trusted JWT role are both required. Nonadmin and forged role requests fail; browser roles cannot write finality proofs or reviews.
- None of these operations touches live Prism, any wallet, real users, or hosted Supabase.

## Next passes

1. Require all trusted invoice/order writers to participate in the store-level lock, use provider reconciliation under the lock, and maintain a durable authoritative payment/payout finality ledger. Verify races in disposable PostgreSQL.
2. Build an authenticated admin **review-and-approve workflow** against a separately approved production migration, with full audit and explicit disabled-by-default activation flag. Before any real rule switch, use a supported, audited Prism integration method (not raw database writes or cookie scraping), or preserve per-invoice versions with a separately reviewed forwarding implementation.
3. Add durable payout alerts, fee-aware payout estimates and small-invoice policies before any live Bitcoin transfer.

Parent PR #118: https://github.com/zanibethel/apex/pull/118 — fee and reconciliation gate passed on disposable regtest. This PR must remain draft until the review-only schema and test CI pass; neither PR is a production go-live approval.
