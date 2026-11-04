# PR #206 — Automatic USPS envelope item capacity

## Shared supplier/admin configuration

Both **Admin → Shipping rules** (`/admin/checkout-rules`) and **Supplier → Shipping rules** (`/supplier/shipping`) use the same store-scoped form and the same authenticated, audited database mutation. The Supplier workspace also links directly to this screen.

New numeric field: **Maximum items in padded envelope** (`envelope_max_items`, default **4**, permitted **1–50**). Suppliers assigned as a store owner/manager and platform admins may edit it. Old write RPCs are revoked so the item limit cannot be silently overwritten. Settings changes create the same immutable shipping audit entry used for fee updates.

Examples with default 4:
- 1–4 total units → USPS Padded Flat Rate Envelope, configured **$15.00**.
- 5+ total units → USPS Medium Flat Rate Box, configured **$25.80**.
- A manually selected Medium Box is allowed for a bulky/fragile order **under** the limit; manually choosing the padded envelope **over** the limit cannot downgrade shipping.
- Merchandise subtotal **strictly over $200** **after discounts** → free shipping regardless of box; valid free-shipping promo also waives the appropriate box fee.

The **customer cart automatically selects packaging** using validated cart quantities and the saved limit returned by the existing server readback; it no longer asks the customer to choose a package. The admin multi-item review defaults to auto and permits manually upgrading to Medium. Shipping totals always use server-read saved prices, discount rules, quantity, and the configured capacity. No new live USPS API or dimensional packing calculation is added.

## Fulfillment caveat

The quantity threshold is an operational packing estimate, **not** a USPS-published item-count rule and **not** proof that a padded envelope fits. Supplier/admin should verify the real packed size/fragility before shipment. This PR does not classify bulky products, calculate multi-package costs, or validate shipping labels. Later we can add per-product packaging requirements or verified dimensions to improve automatic selection.

## Security and nonpurchase scope

- Migration: `20261104093000_apex_auto_envelope_max_items.sql`. It adds a constrained integer column with default 4, a new authenticated role-scoped and audited save RPC, and expands existing **read-only** catalog/admin quote readbacks with the saved limit.
- No product publishing or authorization bypass; no order/stock reservation, BTCPay invoice, seller payout, tax calculation, or customer payment.
- Release gate remains disabled.
- Isolated PostgreSQL suite covers authorized owner/admin saves, unassigned supplier/anonymous denial, legacy RPC denial, audit, and no checkout activation.
- Node tests cover 4/5 boundary, edited limits, auto vs Medium override, free-shipping thresholds, source integrity and UI wiring.

A database rollout is required before deploying UI that selects the new column. Keep the gated checkout blocked.
