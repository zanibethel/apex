# Apex — Live Private Offer Tiles in Supplier Bulk Editor

**Scope:** Private supplier product editing. Reuses the exact same `OfferTile` presentational component as the single-product and group preview pages. No schema or storage policy changes.

## Supplier UX

At `/supplier/catalog/bulk`, every existing or CSV-imported product editor now has a side-by-side **Offer tile preview**. Changes to title, SKU, description, category, purchase price, and compare-at price update the visual tile immediately, **before Save selected**. The existing image is shown using the short-lived, authenticated private signed URL already supplied by the server. Available stock is calculated only when the on-hand and reserved counts are known; otherwise the card explicitly says **Stock not entered**. Blank or invalid prices display **Price unavailable** rather than $0 or an invented discount.

The tile is marked `UNSAVED · DRAFT` or `SAVED · PRIVATE`, depending on whether the row has a persisted ID and outstanding changes. It is not a public listing. Only saved, unchanged rows link to the verified individual review and publication-request page. The editor retains the existing **Preview selected**, **Preview all saved**, and bulk-publication flow; controls never directly publish or accept payments.

On wider screens the editor and tile are side by side. On mobile they stack, and suppliers can toggle **Hide live offer tiles / Show live offer tiles** for a more compact batch editing view.

The source/wholesale cost remains visible in the editor but **never** in the customer-style offer tile. Existing supplier tenancy, temporary private image authorization, inventory compare-and-set, admin holds and structural public-release shutdown are unchanged.

## Verification

- Node regression tests cover monetary parsing, compare-at rules, safe empty-price behavior, row-driven live data, unsaved publication gating, private image use and responsive CSS.
- Existing CI continues to check application lint, typechecking, Next.js build, and tenant/RLS integration.
- No migration and no newly permitted public image bucket, product publication or checkout API.

## Manual acceptance

1. In the private bulk manager, import a CSV with two harmless products, including one blank SKU and compare-at price. Confirm the cards and live previews appear instantly.
2. Change the name, description, price or category in an editor. Confirm only its local offer tile changes and the status remains `UNSAVED · DRAFT`.
3. Save selected, refresh, and verify that the row shows `SAVED · PRIVATE` and its image/stock and individual-preview controls are available.
4. Upload an image or reuse an existing same-store private image, and change stock. Confirm the inline tile reflects the saved data after refresh. Ensure source cost is never displayed in the offer tile.
5. Test at mobile width, use the hide/show toggle and confirm there is no horizontal page overflow.
6. Verify signed-out and another supplier's account cannot access the private bulk page; verify no public products, checkout or payments.
