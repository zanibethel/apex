# Issue #214 Phase 5 — actual BTCPay settlement evidence and review-only key lifecycle

**Status:** review-only, stacked on PR #230, which depends on #229 → #228 → #227. No API/webhook endpoint, payment-state mutation, trusted order source, store credential, production migration, data export, checkout, shipping action, or customer record is added.

## Verified protocol distinction

**BTCPay has an actual webhook authentication protocol**: `BTCPay-Sig: sha256=<lowercase hex HMAC-SHA256(raw request body, per-webhook secret)>`. The repository's existing regtest-tested verifier (`src/lib/payments/btcpay-sandbox.mjs`) implements constant-time verification. Its [official Greenfield reference](https://docs.btcpayserver.org/API/Greenfield/v1/) and [examples](https://docs.btcpayserver.org/Developers/api/examples/) describe this signature. It is **different** from the proposed `v1=` timestamp-bound HMAC in `verified-order-ingest.mjs`; the latter must not be presented as a native BTCPay signature.

The new `src/lib/supplier/btcpay-settlement-evidence.mjs` uses the existing real-format verifier and strictly requires an *independently authorized* store/webhook/invoice/order binding, matching invoice currency and exact fixed-decimal amount, and an independently authenticated Greenfield invoice readback. It accepts only the `InvoiceSettled` type when the readback reports `status=Settled` and `additionalStatus=None`. Neither signed webhooks nor the browser/CSV payload can supply the trusted binding. It never follows callback-supplied URLs or sends network requests; the `readInvoice` function is injected by a future authorized caller, not implemented by this PR.

It returns **minimal evidence only**: bound IDs, signed payload SHA-256, original/redelivery ID, confirmed provider observation and explicit `can_mint_order_permit=false`, `can_create_order=false`, `can_collect_payment=false`, `can_ship=false`. It does not create or update any database records, invoice status, payment ledger, permitted sale, purchase lines, buyer address or fulfillment state. Signature authentication is **not** evidence of supplier product eligibility or lawful shipping. It does **not** provide the order-line or delivery snapshots absent from `supplier_sales_history`.

The pure replay classifier distinguishes exact delivery retries and authenticated redeliveries with matching original delivery ID. Durable uniqueness/duplicate checks remain a separate future database concern. A webhook without a signed timestamp cannot be treated as freshly timed; require a durable delivery-ID journal, current authenticated invoice readback and scoped credential binding before any future integration.

## Review-only key lifecycle

`src/lib/supplier/review-only-delivery-keyring.mjs` demonstrates in-memory, test-only key-ID handling for the private AES-256-GCM envelope introduced in #227/#228. It requires exactly one **active** 32-byte key per store, and supports `decrypt_only` old keys and `retired` keys. Active-only key selection is internal to the preparer; a caller cannot choose a historical key or inject their own key material. Its integrity method validates the original order/store-specific AAD and GCM tag, returning only a boolean, **never plaintext**. It does not expose key bytes, a decryption endpoint or any persistent secret storage.

This is **not production key management**. Neither the review module nor the existing schema owns a KMS, HSM, envelope-wrapping root, rotation service, compromise response or decrypt-on-need access control. A proper production design must use an independently managed secret vault/KMS, distinct privileges for encryption and approved decryption, tightly scoped access to store and order, short audit windows, real key-rotation operations and retention/deletion governance. No real keys belong in git, emails, browser JS, Supabase exposed tables, provider webhook logs or user-visible CSV.

## Failure recovery / retention acceptance plan

Before a live connector can be considered, make the following independent decisions and then test them:

1. Identify a **genuine** order-source system that durably records all purchased items, actual customer delivery details, immutable purchase timestamp and purchaser consent. A settled BTCPay invoice is payment evidence, not the missing order-source record.
2. Implement a separate authenticated source-to-permit attestor with a real producer signature protocol, scoped secrets, exact request-body hashing, nonreusable delivery/source IDs, and permitted source/supplier IDs. Never mint from unsigned dashboard uploads, edited CSVs or client-supplied order JSON.
3. Persist minimal source envelope and readback receipts under database-enforced unique keys. Recover unknown outcomes by **readback first**; never blindly repeat invoice creation, settlement, label purchase or data ingestion. Retried identical requests must not duplicate accounting or shipments; conflicting source bytes remain held for confidential manual review.
4. For failed writes, emit a **separate durable failure event** and reconcile incomplete/uncertain events through an outbox/dead-letter queue with bounded backoff and alerts. The existing Phase 4 test-only denial journal does not survive every process crash and does not itself implement an outbox.
5. Set and approve retention and deletion windows for recipient addresses, order records, failed events, cryptographic keys, and backup copies, balancing applicable legal/accounting retention with privacy and customer rights. **Do not automatically delete immutable snapshots** before designing tombstone/redaction/crypto-erasure and recovery proof.
6. Separately review allowed products and suppliers, fulfillment authorization, carrier requirements, refund and cancellation continuity, source-to-sale-to-invoice reconciliation, operational ownership and security signoff. Keep `private_release_gate` and live checkout/shipping disabled until documented approval.

## Reproducible automated tests

`tests/btcpay-settlement-evidence-issue214.test.mjs` covers valid original signature+readback, tampering and early failure, foreign stores/webhooks/invoices, status mismatches, amount/currency/metadata mismatches, duplicate/redelivery identity, USD/BTC fixed-point arithmetic and no side-effect authority.

`tests/review-only-delivery-keyring-issue214.test.mjs` covers active-key selection, rotated decrypt-only old keys, refused retired keys, AAD and auth-tag corruption, store/identity isolation, caller key overrides, invalid/multiple active key registration, and absence of production KMS or network/storage behavior.

All fixtures contain disposable synthetic values and no real customer addresses, keys, stores or financial transactions.
