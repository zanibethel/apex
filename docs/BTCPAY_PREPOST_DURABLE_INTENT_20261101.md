# PR #125 — durable pre-POST intent and ambiguous Greenfield recovery
Date: November 1, 2026

**DRAFT / DISPOSABLE REGTEST ONLY. No live checkout, hosted database migration, direct Prism configuration change, mainnet invoice, private wallet, external production API call, or deployment.**

## Why this step matters

PR #124's single-use test invoice *journal INSERT* gate protected database writes **after** invoice creation. A BTCPay Greenfield POST can commit remotely even if Apex crashes or fails to store the result. A transaction lock protecting only the subsequent local database insert does **not** prevent unknown remote invoices or duplicate network submissions.

PR #125 introduces the FIRST phase of a network boundary protocol: a test-only server component may attempt one external, disposable BTCPay Greenfield POST **only after** a durable PostgreSQL intent reservation has committed. The reservation irrevocably consumes an already double-admin-approved one-shot permit in the same transaction. This ensures a crash between reservation and API response never authorizes an automatic retry. Unknown results require independent operator reconciliation.

## Implementation

- `database/sql/apex_btcpay_test_external_prepost_intent_REVIEW_ONLY.sql`: immutable test-only provider POST intent keyed by store and BTCPay store/order ID, exact regtest sats and original audit head; private privileged reserve RPC takes the `storefront:<uuid>` advisory transaction lock, checks dual admin approval + current immutable evidence + one unused permit, INSERTs the intent and consumes permit in the *same transaction*. Privileged append-only observation RPC records either `post_outcome_unknown` or `invoice_seen_by_readback`. No SQL routine issues a provider HTTP call or releases a checkout hold.
- `src/lib/payments/btcpay-regtest-prepost-fence.mjs`: test-only numeric loopback `127.0.0.1` Greenfield adapter requiring exact regtest flag, strictly typed amounts, a trusted committed reservation callback, and a single bounded authenticated POST. It embeds the opaque durable intent in provider metadata, then authenticates with a separate Greenfield GET. A malformed response, GET mismatch, network timeout, HTTP error or inability to persist the observation yields `operator_reconciliation_required` and never resends POST. Success is `observed_regtest_invoice_no_checkout` and does **not** authorize checkout, payout or release. It never displays a customer-facing payment URL.
- `tests/payout-rls/btcpay-external-prepost-intent.sql`: separate approved fixture proves that reservation permanently consumes the permit *before* any network operation, duplicate reservation cannot occur, signed audit/hold remain unchanged, evidence is immutable and browser/supplier access is blocked.
- `tests/btcpay-regtest-prepost-fence.test.mjs`: confirms call order, one POST only, store/order/intent/amount readback matching, denied/forged reservations call no network, unknown outcomes do not retry, fail-closed database writes, rejection of remote URLs and mainnet.
- Existing application, PostgreSQL and upstream BTCPay/Prism CI cover the exact branch head. The upstream regtest test remains a **regression**: this new adapter is exercised by mocked HTTP in unit tests, not by a new live provider POST.

## Candid remaining limits

1. **Not a wired, authoritative service yet.** `reserveDurably` and `recordObservation` are injected capabilities and unit tests use controlled fixtures. No authorized backend worker has been built to bind `intentId` to a real PostgreSQL transaction and persist trusted provider observations. Do not infer that a callback supplied by an untrusted client is a security boundary. A real worker must own the database connection, credentials and provider calls.
2. **Provider inventory still has independent writers.** A durable Apex pre-POST reservation does not fence invoice creation through BTCPay UI, other Greenfield keys, third-party integrations or other supplier stores. Those paths must be exhaustively controlled before a live percentage change.
3. **One reservation is intentionally irreversible.** On timeout, 5xx, network reset, crash, readback mismatch or observation-persistence failure, do NOT automatically retry even if no invoice appears immediately; review full provider invoice inventory, late payments and independent wallet finality before any new authorization. External BTCPay POST cannot be made atomic with a PostgreSQL commit.
4. **No Prism activation.** The reviewed plugin's supported remote settings read/write API is still unverified. Disposable regtest plugin database fixture writes do not establish production API support. No supplier/platform split is activated by this work.
5. **No regulatory or payment authorization.** Merchant acceptance, payment-provider permissions and applicable product-sale requirements must be resolved independently prior to taking customer funds.

## Acceptance

Require exact-head Apex quality, isolated PostgreSQL/RLS and upstream disposable Prism regtest. Keep draft, unmerged and undeployed. This PR moves the boundary *before a hypothetical provider call* but does not provide complete end-to-end protection until trusted server ownership and provider-side writer fencing exist.

Parent #124, dependencies #123–#117.
