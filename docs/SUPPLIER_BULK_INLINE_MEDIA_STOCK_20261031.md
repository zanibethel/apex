# Supplier Bulk Cards — Inline Private Images and Stock

## Purpose

Add the same secure **Upload new image / Choose existing image** workflow and audited inventory editor to saved product cards at `/supplier/catalog/bulk`. This is a private catalog convenience pass only. No public publishing, storefront media policy, payment, checkout or DB schema change.

## Behavior

- New CSV imports appear as editable, unsaved product cards with generated SKUs. Supplier clicks **Save selected** to persist the product record and unlock its image/inventory controls. Image upload paths require a persisted product UUID.
- Each saved, unchanged private card shows the product's current image thumbnail (if any), **Upload image / Choose existing**, and editable **On-hand stock**. The picker is lazy-mounted only when opened, so a 100-product page does not render thousands of image choices.
- **Upload new** uses the existing `requestProductImageUpload` → authenticated signed upload → `attachProductImage` server path. PNG/JPEG/WebP, max 3 MB, same-store membership checks, private bucket and signed non-overwrite object path.
- **Choose existing** uses the existing same-store draft-product selection, verified through `requestProductImageReuse`, to create a **separate private image copy** under the destination product path. The source image is not reassigned or made public. Existing product images are provided as short-lived authenticated signed thumbnails from the server; only saved private products in the same supplier store are candidates.
- **On-hand stock** uses the existing `adjustInventory` action with a `expectedOnHand` compare-and-set predicate, preserved reserved quantity and audit triggers. A stale update fails rather than overwriting a colleague's changes; successful updates refresh the server-rendered quantity. Missing inventory rows cannot be edited from the card; suppliers may correct them through existing Inventory support.
- Source-cost editing for linked candidate products remains in Source review. Price/metadata changes must be saved before a card enables photo or stock tools, preventing stale-offer previews.

## Permissions and verification

Private owner/manager membership and verified login are checked on the server by the bulk page and independently by the existing upload/reuse/stock actions. Image signed URLs are temporary, and no service-role token or public-storage read permission is exposed.

Regression suite: `tests/supplier-bulk-inline-media-stock.test.mjs` plus existing CI, Supabase RLS integration, TypeScript, lint, Next build, and image-security tests. Conduct a logged-in manual acceptance before relying on UI details.

### Manual acceptance

1. Upload a CSV with two new harmless products with blank SKUs; verify draft cards appear. Save one and confirm that only its image/stock controls unlock.
2. Upload a new image (PNG/JPEG/WebP under 3 MB) to saved private product A. Confirm a private thumbnail appears on refresh.
3. On saved product B, choose **existing image** from product A; verify B receives an independent copy, A's image remains unchanged, and other suppliers cannot access the image.
4. Set B stock from 0 to 5. Check Inventory and its audit history; attempt a stale change from a second session and confirm it is rejected.
5. Confirm an unsaved edit temporarily locks image and stock actions; after saving it unlocks again. Verify no public stores/products, releases, image URLs, checkout or payments are enabled.

No database migrations or new infrastructure required.
