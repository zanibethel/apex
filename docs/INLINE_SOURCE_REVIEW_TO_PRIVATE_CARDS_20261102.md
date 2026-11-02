# Apex inline supplier source review → private product cards (2026-11-02)

## Goal
Remove the need to navigate to a second page after a supplier individually
verifies imported source variants. Keep source validation separate from
publication approval and from payment enablement.

## Hosted state at planning time
- 63 imported source variants, 62 unverified.
- 1 source approved for private drafting and already linked to a saved product.
- 1 saved product, public release gate OFF.

## Supplier workflow
1. Open `/supplier/imports/bulk-review`, search/filter, and select up to 20.
2. Inspect name, strength, supplier cost and source evidence per item. For
   approval, each selected item needs an individual confirmation plus an
   overall verification acknowledgment.
3. Save review statuses. Use **Refresh approved entries** to update this
   same page with the newly approved candidates.
4. Scroll to **Step 2 · Create approved private product cards**; select up
   to 10 reviewed, unsaved variants and confirm draft creation.
5. Each successful draft is linked to its original source, assigned a SKU,
   populated with neutral editable metadata and proposed pricing, and given
   exactly zero stock. Open `/supplier/catalog/bulk` to edit images, titles,
   prices, descriptions or inventory.

## Security and release bounds
- The existing server action and RLS-backed atomic database RPC remain the
  only way to create actual products.
- The server re-reads candidate approval state and source identity at creation.
- No source approvals are generated automatically, no public product/status
  updates, no shared-image assumptions, no checkout/payment changes.
- The 2x proposed sell and 2.5x compare-at amounts must NOT be represented as
  verified past prices or real discounts.
- Admin hold and public product release decisions remain independent.
- No schema change, no database data writes by this PR. CI uses synthetic
  fixture records; production product data remains untouched.
