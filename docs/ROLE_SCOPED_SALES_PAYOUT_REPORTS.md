# Apex role-scoped sales and payout reporting

**Status: planned, not deployed.** Reporting must be available in admin, supplier, partner/recipient and customer dashboards with server-enforced row-level authorization.

## Views
- Admin: storefront-wide sales, gross/discount/refund/net, allocations by recipient/rule/supplier/product, settlement status, fee accounting, reconciliation and audit events.
- Supplier: only products/orders attributable to that supplier, with sales performance and their own payout allocations, destination status and settlement history. Never expose other suppliers' data.
- Partner/recipient (e.g., Lily or Tierra): only sales lines that contributed to their allocations, their own rate and amounts, pending/confirmed/failed payouts and transaction references. Do not reveal unrelated recipients' amounts or wallet addresses by default.
- Customer: their own order receipts, statuses, payments and refunds, without internal allocations.
- Users with multiple roles: one authenticated account can switch among authorized dashboard sections; access is derived from verified memberships, not email hardcoding or client-side hiding.

## Report details
- Time filters, order/product/supplier/status filters (subject to scope), per-order drilldowns, CSV exports with the same authorization.
- Distinguish gross sales, discounts, refunds, net sales, allocated earnings, pending payouts, completed payouts, and blockchain fees. Define currencies and conversion timestamps explicitly.
- Preserve rule/version snapshot per transaction so historical reporting does not change when admins edit payout rules.
- Pending vs completed means ledger entitlement vs confirmed transfer; never infer paid from allocation alone.
- For multi-product baskets, attribute each line to the appropriate supplier/product rule before aggregating reports.
- Reconcile order totals to immutable allocation snapshots and transfer entries; record corrections as adjustments, not destructive edits.

## Authorization and integrity
- Supabase RLS plus server-side permission checks on every query, detail view and export. No unrestricted service-role data exposed to browser.
- Recipient access is via membership mapping and payout_recipient ID; supplier access via supplier membership. Admin privileges granted explicitly.
- Do not expose raw Bitcoin destination addresses across roles. Limit wallet detail access to owner and authorized admins.
- Paginate large reports, use indexed date/scope filters and consistent UTC storage with user-local display.
- Tests: cross-supplier denial, cross-recipient denial, customer cannot access allocations, unauthorized CSV export denial, admin sees full reconciliation, role changes revoke access.

## Implementation order
1. Migration and allocation engine tests.
2. Role-scoped read models and RLS tests.
3. Admin sales/splits reporting.
4. Supplier and partner dashboards, then customer history.
5. Export, reconciliation and end-to-end tests before live release.
