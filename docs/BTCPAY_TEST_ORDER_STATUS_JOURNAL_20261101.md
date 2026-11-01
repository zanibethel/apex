# BTCPay regtest order-status journal — 2026-11-01

**DRAFT, TEST-ONLY, REVIEW-ONLY. NOT AN APPLIED SUPABASE MIGRATION.**

This PR is stacked on the existing BTCPay receipt journal PR #107 and uses only a disposable GitHub Actions PostgreSQL database. Signed webhook delivery on a real BTCPay regtest server was independently proven in PR #112. These are still separate isolated components: **this pass does not deploy or connect a webhook route to the hosted database**.

## Durable transaction contract

The private privileged database function `apex_test_internal.record_verified_btcpay_event` is intended to be called **only after** a separately trusted worker has:

1. Verified raw `BTCPay-Sig` using the unique store's webhook secret and accepted the delivery type.
2. Matched store ID and invoice ID to a frozen, server-created order.
3. Re-fetched the invoice through authenticated Greenfield and checked the original order metadata, BTC currency and exact integer satoshi amount.
4. Independently verified the ephemeral Bitcoin Core chain is `regtest` (not a production chain).
5. Established idempotent trusted worker identity with permission to call the private database function.

The SQL itself **cannot verify** a signature or Bitcoin RPC state. Its parameters are assertions supplied by that protected worker. The function runs `SECURITY INVOKER`, has **no PUBLIC/anon/authenticated EXECUTE grants**, and has no public API endpoint or wallet privileges. It must never be exposed through PostgREST to an untrusted caller.

## What the new schema records

- `btcpay_test_order_status`: immutable store/invoice/order/expected-satoshi snapshot plus protected status and revision. It references the already staged receipt-journal invoice.
- `btcpay_test_order_status_history`: append-only revision history referencing the exact delivery and invoice, including provider assessment and projected display status.
- Existing PR #107 `btcpay_test_webhook_receipts` and `btcpay_test_invoice_observations` stay authoritative for signed delivery identity and authenticated provider observations. No duplicate tables or parallel second ledger introduced.

Every new event is handled **inside one PostgreSQL transaction**:
1. Lock the matching order row with `FOR UPDATE`.
2. Confirm trusted order metadata, same store/invoice, expected sats, and regtest network.
3. Insert `(store_id, delivery_id, payload_sha256)` with `ON CONFLICT DO NOTHING`, then compare the existing hash/event/invoice if there is a conflict.
4. Return `duplicate` for an identical delivery. **Raise and roll back** for a conflicting replay.
5. Insert an immutable provider-status observation.
6. Project a conservative status and append the revision/history atomically.

No event can credit money or release fulfillment: statuses are **`awaiting`, `processing`, `settled_reported`, `manual_review`**. In particular, `settled_reported` is a read-only provider observation, **not merchant fulfillment authorization**. Stale `Processing` events never regress `settled_reported`; manual review is sticky, including for paid-late, paid-over, manually marked, invalid or expired invoices. Retries do not increment revision.

## Disposable PostgreSQL CI coverage

- True duplicate delivery is idempotent and does not double-write receipt, observation or history.
- Same store/delivery with different digest or event type is rejected and cannot silently skip a conflicting payload.
- Mismatched store, invoice, order, satoshi amount and chain are rejected.
- New `Processing` → `Settled` → stale `Processing` remains `settled_reported`.
- Manually marked `Settled`, paid-late/expired, and subsequent clean events stay `manual_review`.
- Snapshot revisions cannot be deleted or have amounts rewritten, history cannot be updated/deleted.
- `anon` and non-admin supplier users cannot read these records; browser roles cannot write or invoke the private function.
- Two concurrent PostgreSQL clients processing the same delivery produce **one accepted and one duplicate**, not two entries or state transitions.

## Known remaining design gates

**Important model alignment:** PR #107's initial synthetic invoice snapshot is USD-cent oriented, while the actual BTCPay regtest invoice in #111/#112 is denominated in BTC. This pass records *explicit independent immutable satoshi snapshots* for the test-only status writer, rather than reinterpreting the USD field. The eventual production-grade schema must clearly separate buyer-facing fiat quote, BTC invoice quote, invoice expiry, exchange-rate lock, network, and settlement policy to avoid inconsistent amounts.

Before any hosted migration or customer payment activation:
- Review/rebase the stacked PRs (#104, #106, #107, #109–#112); do **not** merge parallel draft branches without resolving dependency order.
- Implement a trusted server worker that uses the real signed callback verification from #112, performs authenticated Greenfield re-fetch, persists the verified synthetic invoice snapshot, and calls the private writer **transactionally** with correct production-safe access and rate limits.
- Test genuine end-to-end webhook → **durable PostgreSQL** persistence in ephemeral infrastructure with crash/retry/out-of-order/backfill cases. This PR's SQL tests only trusted synthetic assertions.
- Implement minimal-scope customer status access with signed/short-lived order token, anti-enumeration protection, server-authoritative display, and no supplier-private data in public responses.
- Verify Prism forwarding to two regtest wallets and reconcile fees, retries and actual network receipts separately. No transfers/payout rules are activated here.
- Complete commerce, payment-provider, safety and merchant compliance gates before considering real funds.

References: PR #107 test journal; PR #112 signed webhook; `docs/BTCPAY_EPHEMERAL_SIGNED_WEBHOOK_20261101.md`; `docs/BTCPAY_SEAMLESS_CHECKOUT_UX_PLAN_20261031.md`.
