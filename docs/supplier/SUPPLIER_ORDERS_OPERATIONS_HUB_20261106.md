# Supplier Orders & Fulfillment hub — 2026-11-06

## Purpose
Give Apex suppliers a single, simple operational entry point for orders, existing reports and USPS readiness without creating another order ledger or approximating unverified history. **Current commerce remains held.**

Route: `/supplier/orders`.

## Existing data reused

- `getSupplierWorkspace()` and its RLS-scoped stores, verified identity and current permissions.
- `get_supplier_held_order_headers(store_id, limit 25, offset 0)`: immutable original order references, purchase times, recorded sale observation, stored line count and existence of a sealed destination record; *no customer addresses or unverified product details*.
- `get_supplier_order_detail_foundation(store_id)`: original snapshot totals and held status.
- `get_supplier_usps_readiness(store_id)`: supplier's own carrier authorization status; this is not a grant to buy labels.
- Each RPC goes through its existing strict allowlist parser. Failures are shown as **Unavailable**, not as zero.
- The already existing daily reports, cumulative CSV export/browser-only overlap comparison, sales reconciliation, shipment review and USPS setup are surfaced as links rather than reinvented.

## Supplier experience

1. Supplier dashboard → **Orders & Fulfillment**.
2. Scan actual held-order references and recorded sale observations with honest **Held · not shippable** status.
3. Open **Daily reports**, **Download / compare CSV**, **USPS setup**, or **Sales reconciliation**.
4. Review the complete paginated held history through the existing **Review all held records** link.

No shipment can be submitted, no addresses decrypted, no label purchased, no payment confirmed or requested and no order state modified by this page.

## Regulatory and operational boundary

Apex handles supplier-managed catalog, reporting and future authorized payment/fulfillment integration. This page does not infer legal product authorization from supplier choice, incomplete inventory data, a recorded sale status, USPS connection readiness or the supplier's own publish preference. The public release gate, payment provider credentials, line-item reconciliation and shipping workflows remain independently gated.

## Verification

- Node regression tests for exact source parsers' integration, held-only summarization, missing-data handling, mobile layout and authenticated navigation.
- Existing repo `verify`, `rls-integration`, Vercel preview.
- Production check: `/supplier/orders` should show a clear empty or held list for the signed-in supplier. It must not render other suppliers' records or describe orders as eligible to ship.
- Do not claim end-to-end fulfillment works until verified independent payment settlement, a protected order-detail read contract, shipping eligibility and a tested shipment/tracking ledger exist.

## Stale PR housekeeping

Older, conflicting PR #292 contains an alternate Products workspace from an older commit and failed verification. It is superseded by merged PRs #293–#296. Do not merge it or overwrite the simplified Products page.

## Next integration

A versioned, server-verified order-detail contract for eligible purchased lines, authorized shipping details, and safely idempotent per-line fulfillment is still needed. Supplier choices (partial/full fulfillment, method, tracking, daily report) must operate on real eligible orders and reconcile to original IDs. Develop under a separate tested branch without activating public sales or controlled medication shipment.
