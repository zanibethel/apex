# Apex — three-field retail publishing (proposed, 2026-11-09)

## Supplier experience

For **ordinary retail display**, a saved active product with a non-empty **name**, positive **price**, and non-empty **description** can be published using the supplier's existing Publish switch or chat confirmation. A SKU is generated during product creation; suppliers need not type one in the Products editor. **Category, product image, and inventory count are optional.** If no valid inventory ledger exists, public availability is **Sold Out**. Supplier sets the product's Active preference; new Products cards default to active.

Existing CSV headers remain backwards-compatible. Chat CSV import still requests a unique SKU for duplicate-safe replay; the Products editor can generate it automatically.

## Boundaries deliberately retained

- Only signed-in supplier owners/managers of the correct private store can publish.
- The supplier must explicitly choose Publish. Draft save and CSV upload never auto-publish.
- Administrator holds, republish approvals, pending content review, linked source draft controls, and listing identity holds still block display.
- Explicit restricted category screening and product title/description regulated-product checks remain. Search tags do **not** carry a vocabulary blocklist and do not authorize a listing.
- The retail showcase global gate still controls public visibility.
- The retail showcase continues to return `can_checkout=false`; no purchase, payment, invoice, payout, or shipment changes.

## Database changes

1. Apply `20261110024500_apex_public_product_tags_v1.sql` after review.
2. Apply `20261110032000_apex_retail_minimum_listing_fields.sql` after review.

Both migrations must be verified on disposable/staging infrastructure before production. The second migration replaces the existing supplier-intent and public retail-showcase functions, preserving authorization and gating while allowing null category and no inventory ledger. The public projection returns null category fields for uncategorized products and Sold Out when no valid stock record is present.

## Required verification before merge/deploy

- Create ordinary product with name + price + description, no category/image/quantity, and generated SKU
- Confirm supplier publish makes it visible publicly as Sold Out, with checkout unavailable
- Confirm regular categories and existing counted inventory still show correct listing/availability
- Confirm private or unrequested products do not appear
- Confirm restricted category/product, admin-held, linked candidate, and pending-review items cannot become publicly visible
- Confirm chat cannot publish without verified supplier identity and fresh confirmation
- Confirm old and new CSV templates and tag search continue working
- Verify migration ordering and run full CI plus protected preview/mobile checks

**Status:** proposed code on PR #326. Not applied to production automatically.
