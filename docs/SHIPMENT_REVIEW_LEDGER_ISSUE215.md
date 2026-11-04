# Apex Issue #215 — Phase 1: review-only shipment plans and tracking draft ledger

**Stack:** Issue #215 PR follows Issue #214 PR #234 → #233 → #232 → #231 → #230 → #229 → #228 → #227. All remain open/unmerged and no production checkout, payment, carrier, label, shipping, delivery decrypt, or inventory mutation is introduced.

## What this slice does

`database/sql/apex_review_shipment_ledger_REVIEW_ONLY.sql` creates a small PostgreSQL **test-only** planning ledger, installation/invocation constrained to the disposable `apex_test` database and a disabled global release gate. It is intentionally **outside** the production `supabase/migrations` directory and grants no function or table privileges to `anon`, `authenticated`, `service_role`, or ordinary supplier identities.

- `apex_internal.review_shipment_plans`: immutable stable shipment identity, store and original held order ID, supplier-scoped external reference, optimistic revision; status is permanently `review_only`, fulfillment authorization and label purchase authorization are always false.
- `apex_internal.review_shipment_allocations`: immutable item-level quantity allocations for one planned shipment, linked to the original held order and line ID. The private function verifies each original line belongs to the matching store and order; row-level foreign keys prevent missing lines or plans.
- `apex_internal.review_shipment_events`: append-only events for initial plan and subsequent **tracking draft** proposals. Unique event keys suppress identical retries; changed contents of a repeated key fail. Unique `(shipment,revision)` and unique `(store,carrier,tracking reference)` prevent silent duplicate claims. Events record the fixed synthetic CI actor, timestamp, carrier and draft tracking identifier; no recipient name/address, decryption material or actual carrier-confirmed shipment state.

All tables use forced RLS, no normal client privileges, immutable allocation/events and guarded plan identity/revision writes. The only privileged helper functions are `SECURITY INVOKER` inside the unexposed internal schema, callable solely by the disposable CI database administrator.

## Two review-only functions

`create_review_shipment_plan(store,held_order,client_reference,allocations,event_key)` requires the original complete immutable order and accounting commitment, sealed destination presence and matching success audit, no fulfillment/payment authorization, and the disabled release gate. It locks the canonical order row to serialize competing plans, accepts sorted unique original order-line IDs with positive quantities and refuses the sum of **planned** quantities exceeding any immutable purchased quantity. Two separate plans may split a line, but the second cannot over-allocate it. Existing event IDs return the original stable shipment ID only when all identity and allocations agree; conflicting replay or duplicate reference returns a database conflict.

`record_review_tracking_draft(store,shipment,event_key,expected_revision,carrier,tracking)` adds an immutable metadata-only tracking **proposal**. It requires an authorized store/shipment, one of USPS/UPS/FEDEX/DHL, a bounded alphanumeric identifier and an exact current revision. A stale revision fails (`40001`) rather than overwriting newer information; a repeated matching event is a no-op, a changed replay is a conflict, a tracking ID already proposed on another shipment in the same store is rejected. The plan revision increments in the same transaction as the append-only draft event. No carrier calls, label purchases, delivery-state changes, tracking lookups or shipping notifications.

## Fulfillment status vocabulary

`src/lib/supplier/review-only-fulfillment-state.mjs` models the intended vocabulary: queued, under_review, packing, label_ready, shipped, delivered, exception and cancelled. It describes proposed human review transitions and exposes stale-version/invalid-status decisions, but **all transitions remain blocked**, even if callers assert approval. The quantity summary distinguishes unplanned, previously planned and newly proposed units. **Planned does not mean picked, packed, shipped, or delivered.**

## Verification

`tests/payout-rls/review-shipment-ledger-issue215.sql` uses an actual synthetic immutable two-line held order from the earlier test-only source worker. In a rollback transaction it creates two stable shipment plans, allocates 2 units across them plus the second purchased line, proves over-allocation rejected, cross-supplier and duplicate line rejected, same event replay no-op, changed event replay denied, stale revision refused, duplicate carrier/tracking reference refused, malformed carrier/tracking refused, append-only history preserved and shipment/purchase/payment state never activated. It verifies normal authenticated roles cannot call internal writers or read private audit, and checks the fixture rolled back.

`tests/review-only-fulfillment-state-issue215.test.mjs` checks all status transitions remain non-executable, stale revisions, partial versus fully planned totals, line ceiling and duplicate lines, and no external network/provider/database actions.

Both run in GitHub Actions on the stacked PR. **Passing CI, including Postgres isolation, is required before review.** No new customer-usable UI or production migration is added in this slice.

## Remaining before real fulfillment

- The actual original purchase-source connector and durable authority remain unimplemented (Issue #214), and synthetic order snapshots are not evidence of a real sale.
- Shipment/packing/label-ready/shipped/delivered state changes require independent product, supplier, carrier, legal and destination eligibility review; this PR cannot transition beyond `review_only`.
- Any actual tracking-number entry from a supplier dashboard needs strict member-role authorization, validated carrier ID, version-conflict feedback, request-idempotency, audit identity and no cross-store access. The current draft identifier is NOT validated with a carrier.
- A shipment email/CSV attachment with recipient details requires KMS-backed restricted decryption, access-limited transport, retention rules, secure replay/reconciliation and reviewed consent.
- A future demo-only supplier fulfillment queue can consume the planning ledger after a separately reviewed, membership-scoped read projection; production carrier connections, postage purchasing, or live notifications must remain disabled until approval.

**Operational invariant:** repeated daily reports or tracking files update existing canonical shipment identities only; never use imported rows as proof of new purchases or shipped merchandise.