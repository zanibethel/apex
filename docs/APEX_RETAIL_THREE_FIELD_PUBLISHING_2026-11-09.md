# Apex — three-field retail publishing (proposed, 2026-11-09)

## Supplier experience

For **ordinary retail display**, a saved active product with a non-empty **name**, positive **price**, and non-empty **description** can be published using the supplier's existing Publish switch or chat confirmation. A SKU is generated during product creation; suppliers need not type one in the Products editor. **Category, product image, and inventory count are optional.** If no valid inventory ledger exists, public availability is **Sold Out**. Supplier sets the product's Active preference; new Products cards default to active.

**Retail category labels and historical category membership no longer create a blocklist** after the third migration. A category is optional; if selected, it must belong to the supplier store. Products with regulated content in their own name/description still remain subject to distinct compliance checks. The platform administrator can add or remove a product from a private retail visibility restriction list using **Admin → Catalog release**; changes are audited and restrict public display independently of supplier Publish preference. Removing that restriction does not release any other hold.

Existing CSV headers remain backwards-compatible. Chat CSV import still requests a unique SKU for duplicate-safe replay; the Products editor can generate it automatically.

## Boundaries deliberately retained

- Only signed-in supplier owners/managers of the correct private store can publish.
- The supplier must explicitly choose Publish. Draft save and CSV upload never auto-publish.
- Administrator holds, republish approvals, pending content review, linked source draft controls, and listing identity holds still block display.
- **Category name blocklists are removed** in the final migration. Valid category ownership is still checked; product name/description regulated-product safeguards remain. Search tags do **not** carry a vocabulary blocklist and do not authorize a listing.
- Product visibility restrictions are admin-managed individually from **Admin → Catalog release**, independent from older administrative holds, with reason and audit events.
- The retail showcase global gate still controls public visibility.
- The retail showcase continues to return `can_checkout=false`; no purchase, payment, invoice, payout, or shipment changes.

## Database changes

1. Apply `20261110024500_apex_public_product_tags_v1.sql` after review.
2. Apply `20261110032000_apex_retail_minimum_listing_fields.sql` after review.
3. Apply `20261110040000_apex_admin_retail_product_visibility_restrictions.sql` after review.

All three migrations must be verified on disposable/staging infrastructure before production. The second migration replaces the existing supplier-intent and public retail-showcase functions, preserving authorization and gating while allowing null category and no inventory ledger. The third migration removes category-label restrictions and introduces an admin-only product-visibility restriction table/RPC with append-only events. It updates supplier publish admission and public feed eligibility atomically. The public projection returns null category fields for uncategorized products and Sold Out when no valid stock record is present.

## Required verification before merge/deploy

- Create ordinary product with name + price + description, no category/image/quantity, and generated SKU
- Confirm supplier publish makes it visible publicly as Sold Out, with checkout unavailable
- Confirm regular categories and existing counted inventory still show correct listing/availability
- Confirm private or unrequested products do not appear
- Confirm category labels alone do not block ordinary products; regulated product name/description safeguards remain active
- Confirm admin Restrict hides a previously public product immediately and Unrestrict respects supplier Publish and other holds
- Confirm unauthorized/non-admin attempts to modify or read the restriction list fail
- Confirm admin-held, linked candidate, and pending-review items cannot become publicly visible
- Confirm chat cannot publish without verified supplier identity and fresh confirmation
- Confirm old and new CSV templates and tag search continue working
- Verify migration ordering and run full CI plus protected preview/mobile checks

**Status:** proposed code on PR #326. Not applied to production automatically. The existing isolated PostgreSQL workflow does not yet exercise the three new retail migrations end-to-end; separate disposable-DB migration verification is still needed before rollout.
