# Issue #214 — Private order-detail foundation (first PR)

**Status:** review-only implementation; private database migration plus a supplier aggregate readiness view. No live order ingestion, checkout, shipping labels, payment processing or customer address decryption.

## Starting point

Apex already stores verified `public.supplier_sales_history` records and an immutable, *held-only* `apex_internal.checkout_order_intents` journal. Sales history provides a store, original purchase timestamp, reference, payment state, and gross amount, but **not** order line items, recipient delivery information, or shipment status. A zero-sales environment must remain zero. This PR **does not** automatically convert past sales into orders.

## Private data model

`apex_internal.order_detail_snapshots`: immutable, one-to-one with a source sale ID per supplier. A trigger enforces exact store, reference, purchase timestamp, payment status, currency and gross-amount agreement with the recorded sale at the point of capture. Unique per-store sale/reference keys deny replays and ambiguous identities. Each header has a separate UUID, unique `(id,store_id)`, source hash for deduplication (not a signature or proof of legal authenticity), and permanently held status.

`apex_internal.order_line_snapshots`: immutable line items under the same store/order pair. Original SKU, title, optional variant, quantity and unit price survive later product edits. Composite product foreign key prevents cross-store product assignment; unique source line reference and unique line number prevent duplicate rows. A generated line subtotal is for accounting only; it does **not** independently verify that all expected items or discounts were ingested.

`apex_internal.order_delivery_envelopes`: optional single opaque encrypted destination per order. Designed for **application-side AES-256-GCM**, with key reference, 96-bit nonce, ciphertext and 128-bit tag; no plaintext address, recipient name, phone, or encryption key is stored or exposed. **This migration does not implement encryption or decryption**. Key management, validation, retention, consent and access to real destinations must be reviewed before a trusted ingestion connector may write records. Mere byte-length checks are not cryptographic proof; CI inserts **dummy bytes only**.

All tables live in the unexposed `apex_internal` schema, have forced RLS and no direct `anon` / `authenticated` table grants. Update/delete triggers protect immutable historical snapshots. No policy allows public inserts or customer reads.

## Supplier readback (deliberately limited)

`public.get_supplier_order_detail_foundation(store_id)` returns only supplier-isolated counts for canonical headers, snapshotted lines, and sealed destination *records*, plus explicit flags:

- `order_ingest_enabled=false`
- `delivery_decryption_enabled=false`
- `payment_enabled=false`
- `shipping_enabled=false`
- `detail_status=held_unverified`

It checks current supplier membership and denies anonymous users. It does **not** return order identifiers, SKU, prices, source hashes, names, addresses or ciphertext.

The supplier can view this private aggregate status at `/supplier/reports/order-foundation`, linked from `/supplier/reports`. The screen has no order-creation or shipping controls.

## End-to-end immutability, deduplication, authorization tests

Run `tests/payout-rls/private-order-detail-foundation.sql` in disposable `apex_test` PostgreSQL, **after** the verified sales source fixture and existing required migrations. It proves:

- A synthetic verified sale produces one immutable header, two line snapshots and one opaque destination.
- Inserting the same sale ID a second time is refused, even if a different payload hash is presented.
- Altered original purchase date, source payment state and gross are rejected.
- Duplicate line references, out-of-range quantities, cross-store order/product pairs are rejected.
- Header timestamp/line quantity/destination records cannot be silently updated or deleted.
- A valid supplier reads only own counts; unrelated/anonymous roles cannot access them.
- Test transaction rolls back all invented data; checkout/provider intent tables and global release remain unchanged.

Additional Node tests validate shape/schema and that readiness is fail-closed.

## Deliberate exclusions and what comes next

**Not implemented:** trusted verified-source ingestion endpoint, encryption key management and decrypt/read flow, delivery address validation, status transitions, refunds, partial shipments, tracking, label purchase, fulfillment email attachment, inventory deductions, BTCPay payments, or legal shipment eligibility approvals.

**Next gated PR:** trusted ingestion controller that atomically associates a source sale with its correct line items, cryptographically authenticates the source, handles retries/conflicts, validates totals/discounts and sensitive destination fields, and implements data retention. Then Issue #215 adds append-only fulfillment/shipment state, with lawful delivery eligibility independently checked. Issue #216 builds cumulative CSV reconciliation on those authoritative IDs; Issue #217 prepares secure daily fulfillment reports.

### Release discipline

This first PR should pass application lint/typecheck/build/tests and isolated PostgreSQL role/invariant checks. **Do not apply the migration to production, merge, open live checkout, or send customer delivery data until review.** The feature branch is safe to inspect and its code does not expose a writer.
