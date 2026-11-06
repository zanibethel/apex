# Private supplier quantity tracking preference — November 6, 2026

This is a **private catalog editing convenience**, not a public inventory or purchasing override.

## Supplier workflow

Within **Supplier → Products**, open the product's pencil editor. Under the image controls, check or uncheck **Track inventory quantities**.

- **On** (default): the saved product shows editable on-hand stock with the existing audited, compare-and-swap stock changes. Reserved quantities are still visible.
- **Off**: the supplier does not have to enter or update on-hand quantities in the private editor. Existing stock and reservations are **not** modified, deleted, or replaced. The saved-product status says **Quantity not tracked** rather than Sold Out, but **only within the private dashboard**.
- The selected setting persists independently for each saved product (not each imported proposal). It requires the current store's signed-in, confirmed owner or manager with existing draft-write authorization.
- Import staging and its 76 proposed parent cards remain read-only, pending authoritative product identification; no new product/variant records are created.

## Boundaries

The `supplier_private_stock_preferences` table stores a simple Boolean, scoped to private draft products. It has forced RLS, no anonymous access, owner/manager-only read/write, and no public checkout or release-gate access. The browser cannot modify product identities or roles via this setting.

**Turning quantity tracking off does not turn the product's stock into unlimited availability.** The existing `inventory_items` records, stock reservation checks, public Sold Out eligibility checks, supplier/legal authorization, admin holds, and release gate remain authoritative. Products without verified public release are not for sale. It is intentionally *not* a means to sell without verifying stock or the legal authority to offer a regulated medicine.

## Testing

- The server action validates owner/manager membership, a still-private saved product, exact previous preference (compare-and-swap on update), and configured private draft-write permission before applying a change.
- The disposable SQL integration tests enforce staff/cross-tenant/anonymous/published-item denial and confirm inventory and public-product flags are unchanged.
- Node tests ensure the UI and private server action remain separate from public checkout and independent release logic.
- Verify `npm test`, lint, typecheck, build, isolated PostgreSQL/RLS tests, and Vercel preview before merging. Apply the exact reviewed table migration before deploying the UI.
- After release verify `63` saved products, `63` inventory items, `168` staged options, no auto-published products and global public gate unchanged. No per-product preference should be pre-filled as disabled by the migration.

## Open question for later legally eligible products

Once legal authorization and operational controls have been independently confirmed, design a separate authoritative inventory-policy contract for any products that may legally be sold without numeric stock counts. It must still ensure order capacity, nonnegative reservations, supplier fulfillment and no overselling. This private toggle does not attempt that contract.
