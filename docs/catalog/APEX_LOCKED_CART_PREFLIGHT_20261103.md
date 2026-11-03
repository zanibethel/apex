# Apex PR #190 — locked order-admission preflight (admin only)

This increment strengthens the production-style checkout review without creating a customer order, reserving inventory, enabling merchandise publication, submitting an invoice, or making any purchase possible.

## Behavior

The existing **Validate saved price and stock** control now submits three values from the selected private product: product UUID, bounded quantity, and the subtotal currently shown in the review UI. The submitted subtotal is **not trusted** as a price. The database:

1. Verifies a signed-in platform administrator from immutable Supabase app metadata.
2. Reuses the strict existing `get_admin_private_cart_validation` for store, item shape, quantity, saved price and release state.
3. Obtains `FOR SHARE NOWAIT` locks on the private global release gate, store, product and inventory rows in deterministic product-UUID order. If a concurrent product/inventory writer holds a conflicting lock, the request fails closed.
4. Recomputes the saved cart subtotal **after** obtaining the locks and compares it with the displayed subtotal.
5. Returns a sanitized, structured, blocked-only observation that explicitly states the locks end with this request.

A mismatch tells the administrator that the saved catalog price changed and the review should be refreshed. Zero stock, seller/product authorization, administrative holds, tax, shipping and provider readiness are not silently bypassed.

**Important:** PostgreSQL releases these locks when the RPC request finishes. This is only a bounded moment-in-time recheck, **not** a stock reservation, persisted order, customer quote or successful checkout authorization. The private order journal remains empty. Actual ordering requires its own separately reviewed, atomic inventory reservation with merchant/product eligibility, validated delivery/tax totals, durable idempotency, provider reservation and signed webhook reconciliation.

## Verification

- Node parser guards reject malformed or forged lock/release/payment flags and inconsistent displayed subtotals.
- Isolated Postgres exercises anonymous and supplier denial, browser-total mismatch, changed stored price, no order writes, no checkout enablement.
- Two-session test holds an inventory `UPDATE` lock, then verifies `NOWAIT` fails without returning a potentially stale decision.
- Existing payout/supplier/database tests, lint, TypeScript and Next.js build still run.
- Production schema migration only after verified checks; application merge only after exact-head green CI and preview. No live merchandise, payment credentials or customer billing changes.

Reference: PostgreSQL row-level locking https://www.postgresql.org/docs/current/explicit-locking.html
