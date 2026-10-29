# Data model draft (not yet migrated)

This is a starting design for review, not existing Supabase tables.

## Primary tables
- `suppliers`: supplier identifier, status, non-sensitive display metadata.
- `stores`: supplier_id, brand/domain linkage, active flag; founding domain unique to its store.
- `memberships`: auth user, supplier/store, role; operator role handled separately.
- `products`: supplier/store ID, SKU, price snapshot rules, inventory status, publication/eligibility state.
- `inventory_movements`: SKU, delta, reason, actor, order ref, timestamp.
- `orders` and `order_items`: immutable monetary snapshots, lifecycle, order event history.
- `payment_invoices`: external BTCPay ID, BTC quote in sats, expiration, currency snapshot, status.
- `payment_events`: provider event id, block/tx ref, raw event integrity hash, verified timestamp; unique source-event key.
- `commission_entitlements`: order/payment association, eligible USD cents and target satoshis, versioned formula.
- `payouts`: invoice, destination role, amount sats, wallet target reference (protected), tx id, state, confirmations.
- `refunds` and `adjustments`: approvals, funded source, amount, cause, linkage, reconciliation.
- `audit_events`: immutable actor, action, subject and timestamp.
- `daily_sales_rollups`: derived views/materialized aggregates, not primary financial truth.

## Invariants
- All money integers (cents/satoshis); no rounding in floating-point UI logic.
- Every financial event has a deterministic idempotency key and source reference.
- Order and payment statuses are independent; user browser callbacks cannot mark settled.
- Ledger additions are append-only; reversals are separate entries.
- Financial aggregates derive from reconciled event rows, not manually entered totals.
- RLS restricts suppliers to their own records; sensitive payment signing material **never** enters Supabase rows.
- Explicit permission, audit and ownership on all administrative modifications.
