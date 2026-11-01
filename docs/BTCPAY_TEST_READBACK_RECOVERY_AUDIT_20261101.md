# PR #122 — real regtest provider readback and immutable recovery review
November 1, 2026

**DRAFT / DISPOSABLE TEST ONLY. No hosted migration, real wallet, production checkout, BTC mainnet, Prism configuration API, automatic unhold, or merchant payout activation.**

## Dependency and motivation

PR #121 introduced a loopback-only Greenfield invoice/payout inventory adapter, tested by mock requests; PR #120 introduced an immutable test invoice-write lock and store sync hold; PR #119 introduced non-authorizing admin split approval. This pass closes a verification gap by calling the read-only adapter from the *real upstream BTCPay Server + Prism 1.3.3 regtest workflow* and persisting a synthetic, append-only recovery timeline under the same store lock.

## Actual disposable Greenfield readback

The existing `scripts/btcpay-ephemeral-prism-forwarding.mjs` CI scenario already creates two separate disposable stores, mines worthless regtest Bitcoin, and independently confirms 90/10 and 85/15 forwarding in each receiving wallet and both corresponding Prism claims in `Completed` state. After this independent verification, it now:

1. Creates a **new, narrow, store-scoped read-only API key** per disposable store, requiring *exactly* `btcpay.store.canviewinvoices:<storeId>` and `btcpay.store.canviewpayouts:<storeId>`. The key is held only in ephemeral runner memory, never logged or persisted.
2. Calls `readRegtestGreenfieldInventory` from PR #121 against `http://127.0.0.1:14142/`, with GET-only, no redirects and bounded pagination.
3. Requires exactly the known regtest invoice in `Settled/None` state, matching its original order reference, plus exactly two `Completed` BTC-CHAIN payouts on the same BTCPay store. Unknown/new provider records fail the smoke test rather than being ignored.
4. Emits only `read-only-greenfield-inventory-confirmed <ruleVersion>` sanitized progress text; no API keys, invoice IDs, wallet destination strings or payout identifiers are printed.

**Limit:** This only proves the implemented inventory adapter reads the already independently reconciled test scenario. It does not prove a globally atomic provider snapshot or guarantee that all independent/third-party invoice writers are held. Greenfield does not establish a Prism configuration writer: the upstream Prism test uses a **throwaway PostgreSQL** settings fixture that is explicitly forbidden as a production technique.

## Recovery audit

The disposable-only `database/sql/apex_btcpay_test_sync_recovery_audit_REVIEW_ONLY.sql` adds:

- `btcpay_test_sync_recovery_events`: append-only event sequence per held store/rule, synthetic evidence SHA256 fingerprint (never raw tokens), immutable historical rows, and an idempotent `(scope_id,request_id)` unique key.
- `apex_test_internal.record_btcpay_test_recovery_event`: privileged SQL-only fixture writer sharing the same `storefront:<uuid>` advisory transaction lock as PRs #119/#120. A byte-for-byte matching retry returns the original event; a conflicting retry is rejected. Browser/admin/supplier roles cannot execute this fixture function.
- `apex_test_internal.assess_btcpay_test_release_readiness`: privileged, **read-only, non-authorizing** review requiring an ordered synthetic sequence of reported external change, provider readback, independent receiving-wallet reconciliation, and operator review. Missing evidence, unknown/failed changes and later incidents block review. Even its most permissive result is literally `review_only_candidate_checkout_stays_held`. No `unhold`, payout settings change, production activation or sale is authorized.
- Isolated PostgreSQL tests verify that the audit persists across SQL transactions, blocks conflicting retries, enforces immutable evidence, rejects missing/out-of-order confirmation, revokes readiness after an incident and denies supplier access or browser mutations.

No production evidence writer, store authorization gate, trusted operator identity attestation, or cryptographic external provider proof is added. Synthetic SHA256 values in tests are placeholders, **not valid attestation**.

## Next production-safety gates (separately reviewed)

1. All Apex and BTCPay invoice creation paths must be mediated by the same persistent checkout fencing protocol before POST calls. A database journal trigger cannot fence independently created provider invoices.
2. Verified Prism **supported** setting read/write API or operator-supervised manual configuration, with durable audit and independent readback. No cookie scraping, raw plugin database writes in production or untrusted user-supplied proof.
3. Trusted evidence collector with scoped credentials, pagination-consistency strategy, full invoice/claim coverage, independent Bitcoin chain confirmation, and crash recovery.
4. Signed operator identity, strict separation of duties, a versioned compare-and-swap rule, and a separately reviewed unlock transition. A status label alone must never release a checkout hold.
5. Calibrate wallet UTXOs, network fees, minimum amounts, exception handling and merchant/legal/payment-provider approvals before a live launch.

## CI acceptance

Keep draft/unmerged until the **exact commit head** passes Apex quality, isolated PostgreSQL/RLS and the real upstream BTCPay/Prism end-to-end regtest. No infrastructure purchase or hosted deployment.

Parents: #121, #120, #119, #118, #117.
