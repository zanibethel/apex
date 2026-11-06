# Track 2 — Immutable order + payment evidence reconciliation (v1)

**Status:** pure diagnostic contract, no trusted provider or regulatory verification source attached. This is deliberately not an operational eligible order queue, payment authorization, or production integration.

## Input interfaces

The pure reconcileOrderEvidenceV1 helper in src/lib/payments/order-evidence-reconciliation-v1.mjs evaluates bounded, normalized **synthetic or trusted-server-sourced** records. No browser or supplier can use this helper to grant shipment. It must never be imported into a route as a standalone entitlement decision.

| Record | Required source and identity |
| --- | --- |
| order | Immutable store/order IDs, original purchase timestamp, gross USD cents, source reference, exact line count, held_unverified status |
| lines | Original per-line order/store/product IDs, positions, quantities and unit/subtotal integer cents |
| payment | Independently authenticated provider invoice readback, matching store/order/metadata, invoice amount/currency/status and observed time |
| events | Provider-event IDs and raw digests; repeated identical events dedupe; conflicting replays, refunds, reversals and revoked evidence fail closed |
| lineReviews | One independently sourced, current merchandise and transport review per purchased line; supplier checkbox is not independent authorization |
| destination | A separately validated **reference only** to a protected delivery record; no address contents or decryption keys |

The helper returns stable reason codes, quantity and subtotal diagnostics and a reconciled_unverified status only for an internally consistent sample. This status means **the sample's shapes and relationships matched**, not that signatures, provider settlement, supplier licensing, product legality, carrier eligibility, or delivery authorization were verified. Every return value hardcodes payment, checkout, shipping label, tracking, and protected-address permissions to false. There is no database writer, new RPC, network request, webhook receiver, checkout route, shipment execution or status transition in this slice.

## Future source adapter and release prerequisites

1. Track 2 must implement a narrowly privileged server adapter that validates authentic signed BTCPay webhooks and independent Greenfield readbacks, verifies the correct provider storefront/invoice/network/order metadata, exact amounts and currency, and handles finality, expiry and split accounting. Do not trust provider-like JSON submitted by a browser or supplier.
2. Bind the source to one immutable canonical order and complete purchased-line snapshot using strong non-replay identities. Payment event histories must retain refunds, reversals, stale observations and reconciliation failures.
3. Separate legal and carrier restrictions from payment and from supplier's own publish settings. Obtain independent proof for supplier, product, and transport eligibility; support explicit revocation and per-line revisions.
4. Provide authorized, audited delivery-reference handling without PII in reporting/notifications. Protect access to decrypted data behind distinct purpose checks, retention and key-rotation rules.
5. After a dedicated review of the source/permission model, create a new versioned **read-only** eligible-order projection for Track 3 with complete negative authorization and data-isolation tests. Do not relax PR #303's get_supplier_eligible_order_readiness_v1 sentinel.
6. Live invoice creation, settlement ingestion, shipments, labels, customer PII access and public product publication require separate legal, payment, merchant and operational authorizations; passing synthetic tests alone is not sufficient.

## Tests

Run node --test tests/track2-evidence-reconciliation-v1.test.mjs to exercise:
- exact immutable store/order/line binding and quantity/amount checks;
- missing/unsettled/stale/mismatched payment provider observations;
- normalized refund, reversal, invalidation and authorization revocation;
- exact replay versus same-ID conflicting payloads;
- per-line decisions (including missing, expired and revoked evidence);
- protected destination references with no address leakage;
- permanent zero operational permissions even for fully consistent mock input.

Run the repository's full npm run check and hosted GitHub verification at the exact PR head before merge. No new production migration is necessary for this pure utility; no real payment evidence or lawful fulfillment is attested.

Related: docs/supplier/ELIGIBLE_ORDER_READ_CONTRACT_V1.md, Issue #214, Issue #215, and docs/APEX_EXECUTION_CHECKPOINT_2026-11-06.md.
