# Supplier Bulk Workspace — Direct Private Publication Requests

**Scope:** Private supplier UI only. No public publication, product eligibility approval, new storage policies, database migrations, payments or checkout.

## Supplier experience

At `/supplier/catalog/bulk` the supplier can now:

1. Edit one or many product cards and watch their storefront-style offer tiles update.
2. Save selected rows, including CSV-imported products, to create real private drafts and update product details.
3. Use a **Publish** button directly on any *saved, complete, nonheld, not-yet-requested* offer tile. The full individual preview remains accessible.
4. Select several saved eligible products and use **Publish selected**, or submit **Publish all eligible** from the bulk editor footer, without another navigation step. Each batch is capped at 50.
5. Review per-product success/error messages, already-requested states, and missing setup details. No partial group error is misreported as all successful.

The UI uses the server-scoped product, category, inventory and supplier listing-control data to determine which buttons are enabled. Missing listing-control data, incomplete product details, administrative holds, already-requested listings and unsaved edits exclude products from quick publication. **The server action independently revalidates** store membership, auth and product status via the existing `set_supplier_listing_intent` database RPC, so display-only eligibility is never an authorization mechanism.

**IMPORTANT:** The action records **supplier publication intent privately**. It does not change the public release gate, `is_public`, `is_published`, payments or checkout. The admin override remains authoritative.

## Acceptance

1. Save two synthetic, eligible private products. Verify single and selected Publish buttons appear when details and stock pass checks.
2. Change a saved product price without saving and verify all direct publication paths exclude that row.
3. Remove a mandatory image or stock condition and verify the workspace indicates which setup fields remain incomplete.
4. Place an admin hold; refresh, and verify the product is excluded from Publish single/selected/all.
5. Submit a single or batch request; verify each product reports private publication-request status and no public products are created.
6. Reopen the page, verify already-requested items are not submitted again. Verify unrelated nonrequested rows remain unchanged and a batch above 50 requires selection.
7. Test iPhone/mobile views and confirm visual offer tiles and footer actions do not cause horizontal overflow.

## Validation

Node regression tests for safe selection, server-derived setup readiness, database-RPC-only writes, and mobile controls. Existing CI includes TypeScript, lint, Next build and PostgreSQL RLS tests. No changes to hosted schema.
