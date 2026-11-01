# Apex bulk product reload capacity — October 31, 2026

## Acceptance finding
The client and CSV importer permit up to 250 product cards, but the authenticated bulk editor page read only the first 100 private products. After saving 101–250 products, a fresh reload could silently omit records. Product-ID/SKU CSV matching also relies on the loaded cards and might misclassify previously saved products that were omitted.

## Correction
- The server now queries up to 251 private products in the authenticated assigned store. A complete list of 0–250 loads normally. A 251st row triggers a clear fail-closed message with a link to the standard product manager instead of presenting an incomplete editing view.
- The product categories query is also expanded to 250, consistent with the bounded workspace.
- The existing client editing, CSV import, save/retry, per-product preview, admin hold and private publication controls are not modified.
- Does not silently overwrite products beyond the first 100 on CSV import. Storefronts exceeding 250 private products need a subsequent paginated or server-side matching workflow; this pass deliberately does not claim to support larger catalogs.

## Automated tests
- Pure boundary tests for zero, 25, 100, 101, 250 and 251 products and unavailable responses.
- Source regression confirms the private query uses the 251 sentinel and validates its result before signing private images or rendering editable cards.
- Check that client and CSV editor keep the 250-card limit; authenticated supplier owner/manager and private-store scope remain unchanged.
- Exact PR head must pass lint, TypeScript, unit/source tests, Next build and disposable PostgreSQL RLS.

## Manual real-device acceptance pending
1. In an isolated test storefront with appropriate test data, add >100 synthetic product drafts and fully reload `/supplier/catalog/bulk` on iPhone.
2. Verify all saved drafts appear by name or SKU, with the latest price, compare-at price, cost, description and category.
3. Export the editor CSV and confirm the previously hidden >100th product is included; test imported SKU matching without duplicate creation.
4. At exactly 250 synthetic products, confirm the editor loads all existing cards but Add product is disabled.
5. At 251 private products, verify the bulk editor refuses an incomplete view and provides a safe path back to product management.
6. Check scroll performance, private image URLs and any inventory/status missing records. Production customer/order data must remain untouched.

**Limit:** This is a source and automated CI pass, not a completed authenticated iPhone browser test.