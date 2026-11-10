# Apex — three-field retail publishing (production schema applied 2026-11-09 CT)

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

## Database changes — applied to production

All three migrations were applied successfully to production Supabase project `fhqpkpztercadcxspdkg` on November 9, 2026 (Central time), in this order:

1. `20261110024500_apex_public_product_tags_v1.sql` — Supabase history name `apex_public_product_tags_v1`
2. `20261110032000_apex_retail_minimum_listing_fields.sql` — history name `apex_retail_minimum_listing_fields`
3. `20261110040000_apex_admin_retail_product_visibility_restrictions.sql` — history name `apex_admin_retail_product_visibility_restrictions`

All three migrations passed disposable PostgreSQL verification in PR #326 before production application. The second migration replaces the existing supplier-intent and public retail-showcase functions, preserving authorization and gating while allowing null category and no inventory ledger. The third migration removes category-label restrictions and introduces an admin-only product-visibility restriction table/RPC with append-only events. It updates supplier publish admission and public feed eligibility atomically. The public projection returns null category fields for uncategorized products and Sold Out when no valid stock record is present.

## Verification after production migration

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

**Production database verification completed:**
- Tags column and valid-length/lowercase check constraint installed and validated; all five existing products initially have empty tags.
- Supplier intent and public showcase RPCs retain role gates, review/identity holds and regulated-content checks.
- Category and inventory joins are optional in the public RPC; products without valid inventory display Sold Out.
- Admin restrictions and audit event tables are private, RLS-enabled, with no anonymous/signed-in direct table privileges.
- Admin restriction RPC is signed-in only; anonymous invocation not granted.
- Category-name screening is no longer present; selected categories must belong to the product's store.
- Public catalog currently returns `[]` because **zero suppliers have selected Publish**. No listing was automatically exposed.
- Checkout remains `can_checkout=false`, and no live payment flags or credentials were changed.

**Still requiring interactive acceptance testing:** Use authorized supplier and platform-admin sessions to create a neutral ordinary product (three fields), publish it, confirm Sold Out on the public catalog, add/remove tags, restrict/unrestrict display from Admin → Catalog release, test chat update confirmations and check audit events. Do not create synthetic commerce test orders or regulated product listings in the live storefront. Regulated-product content checks remain separate. No browser-based authenticated write test was performed as part of the schema deployment.
