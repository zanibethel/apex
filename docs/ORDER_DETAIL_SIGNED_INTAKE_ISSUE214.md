# Issue #214, Phase 2 — Signed order-intake validation contract

**Status: review-only, held-only; dependent on unmerged PR #227.** This PR provides a pure Node server module and synthetic tests. It does **not** add a database writer, HTTP endpoint, Supabase function, customer-facing form, key material, label purchase or real supplier integration. It does not activate commerce. A valid event is **not** by itself evidence of a legally eligible item or permission to ship.

## What the module actually does

`src/lib/supplier/verified-order-ingest.mjs` exports `prepareHeldOrderIntake` and `classifyOrderReplay`. Its caller must independently retrieve the historical `supplier_sales_history` record, store-scoped product identifiers and the **authorized** store identity from trusted server data. It **must not accept** those authority inputs from the request body. There is currently no application caller.

It requires an authenticated UTF-8 JSON event with the exact v1 field set. Signature is `v1=<lowercase-hex-HMAC-SHA256>`, over UTF-8 bytes `apex.order-detail.v1\\n<unix-seconds>\\n<raw-json>`, with a 32-byte-minimum trusted signing secret. Signed time is within five minutes of receipt, and the raw payload is capped at 64 KiB. The HMAC key **must** be held only by an independently authorized source connector; this test contract is **not** evidence that BTCPay, a supplier or any other actual external system supports it. Never sign arbitrary browser/CSV input with the server secret and call it a verified purchase.

The module denies mismatched store/sale/reference/UTC purchase timestamp/payment status/currency/gross, missing or foreign product IDs, duplicate source-line references, unknown fields, improper quantities/prices, incomplete item lists that don't reconcile and inconsistent shipping or discount arithmetic. For v1, the entire gross must be exactly `(sum of quantity × unit price) + shipping - discount`; tax is not collected. Zero-dollar items are permitted; amounts are nonnegative safe integers in cents. The signed source is **not** permitted to override the trusted historical purchase record.

Delivery fields are minimized to recipient name, USPS-format US destination and optional second address line. Validation is **format only**, not deliverability/identity verification. Before any proposed record leaves the function, the destination is sealed application-side with AES-256-GCM, a random 96-bit nonce, 128-bit tag, an opaque key reference, and associated authenticated data binding the store, sale, reference and original purchase timestamp. No plaintext address, key or source signing credential is present in the result. Key management, rotation, protected decryption, authorization, consent and retention remain **unimplemented**.

The result is a shape compatible with the held header/line/delivery snapshot columns from PR #227, with base64 ciphertext components for an eventual privileged conversion to PostgreSQL `bytea`. It returns `payment_authorized=false`, `fulfillment_authorized=false`, `shipping_authorized=false`, `delivery_verified=false`, `product_eligibility=not_verified`, `persistence_enabled=false`. There is no write path.

`classifyOrderReplay` compares the stable store/sale/reference triple and SHA-256 of the **exact signed JSON bytes**: absent previous record → new; identical bytes → identical replay; different bytes under the same identity → hard conflict. Equivalent JSON with a different serialization is intentionally considered a conflict. This helper is **not** sufficient for concurrent ingestion; only a later database transaction with enforced unique store/sale/reference keys can make the decision atomic.

## Verification

`node --test tests/verified-order-ingest-issue214.test.mjs` covers synthetic two-line accounting, HMAC tampering and age, wrong source sale/product/store, discount/shipping mismatches, missing and duplicated lines, strict field validation, sealed destination content and nonce uniqueness, authenticated-data tampering denial, duplicate/conflict classification and absence of any database or route side effects. The repository quality workflow also runs this via `npm run test`.

All names, items, addresses, event keys and signing/encryption keys in tests are **synthetic**, and no real destination or credentials belong in a public repository.

## Before implementing a privileged writer (separate PR)

1. Identify and independently authorize a real source of truth and its actual authentication protocol, rotate a scope-limited secret, confirm store and product bindings from the database, and reject untrusted manual uploads as purchase events.
2. Run header, complete line and encrypted delivery inserts in **one serializable/locked, rollback-on-failure transaction** under a restricted non-client writer role. Handle unique-key collision as idempotent replay only when the entire persisted snapshot matches, including line completeness and amounts; otherwise record a confidential conflict.
3. Record append-only ingestion and refund/cancellation events with safe metadata. Never store plaintext addresses, credentials or complete payloads in logs, public tables, ordinary emails or analytics.
4. Introduce an authorized decrypt-only role and an external key-management/rotation protocol. Review address validation, retention schedule, customer data access/deletion and supplier access boundaries independently.
5. Re-run database RLS, failure-injection, concurrency, source-auth and multi-store tests. Keep the `private_release_gate` disabled until separate written eligibility and payment/shipping approval.

**Remaining on Issue #214:** actual source integration, durable atomic ingestion, confidential audit, field eligibility, retention, key rotation, privileged decryption and final partner acceptance. Follow-up #215 remains the fulfillment/tracking ledger; #216–#217 are cumulative deduplicated reports and protected fulfillment attachments.
