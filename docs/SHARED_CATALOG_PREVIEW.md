# Shared catalog dashboard — October 30, 2026

## Scope
This is the first next-step feature following the single supplier dashboard and login groundwork.

- `/supplier/catalog` is protected by the current user session, email confirmation, and RLS-visible supplier membership.
- Stores are selected only from authorized supplier IDs. Products, categories and inventory entries are then filtered to those specific store IDs.
- Lily and Tierra (both members of the one `apex-shared-initial` supplier) see the same underlying records.
- Read-only list of the first 100 products: product name, SKU, category, display price, on-hand/reserved stock, record published/draft status.
- Empty catalog is normal (no product records have been imported yet). Missing/error results fail safely.
- No writes, uploads, payments, orders, public store publishing or invitations. The public storefront stays in concept mode until the release gates are met.

## Acceptance
- Confirm CI lint, typecheck, unit tests, build and database-isolation integration.
- Verify supplier accounts can view the route and an unsigned browser redirects to sign-in.
- Verify non-member cannot read the catalog.
- Verify Lily and Tierra see the **same** catalog from their separate logins.
- Verify no product mutations or storefront visibility changes are available.

## Next pass (separate review)
- Add draft product creation/editor with server-side authorization and RLS write controls, validation, and immutable audit events.
- Add inventory adjustment UI with audit ledger, not direct ad-hoc quantity edits.
- Import only approved product catalog source data; do not manufacture sample listings as real products.
- Production release is separate from merging preview code and requires authentication, configuration, security and regulatory gates.
