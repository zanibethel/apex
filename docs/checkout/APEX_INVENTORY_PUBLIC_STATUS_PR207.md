# Apex PR #207 — Inventory-aware release/status sync

## Delivered
- Supplier **Publish/Unpublish** controls remain a simple existing switch on each product card, with existing batch actions. A request saves *publication intent* (audited), not forced public visibility.
- Admin **Unpublish**, **Hold with reason**, **Require corrections**, and **Unlock after review** remain the independent override workflow. A hold wins over supplier intent.
- Supplier product cards and the admin Listing Controls / Catalog Release pages now show a verified private inventory status: **N available**, **Sold Out**, or **Inventory unavailable**. Unknown, negative or oversubscribed counters fail closed.
- Inventory edits, supplier publish/unpublish, batch publication and admin overrides revalidate the cart, public catalog, and relevant admin screens. Public catalog and cart fetches remain non-cached.
- New narrow public SQL `get_public_inventory_catalog(offset,limit)` reads only independently authorized listing metadata and derives **in_stock** vs **sold_out** from live saved inventory (on hand minus reserved). It exposes **no exact stock count, supplier cost, media paths, supplier data, private authorization, payment info, or customer data**. Includes current supplier listing request, admin hold/review, category, source-review, identity-hold, merchant/product evidence and global release gate checks.
- Original `get_public_sold_out_catalog` now uses an actual zero-stock predicate, preventing a legacy consumer from mislabeling in-stock items as Sold Out.
- Read-only cart recheck reports **in_stock**, **insufficient_stock** (some stock but fewer units than requested), or **sold_out**. The cart never accepts a browser-provided price, order right, or stock count. **All checkout rights remain false**.
- Public card displays Sold Out with disabled purchase control, or displays Add to cart (local save) for independently released in-stock items. Neither path creates an order nor enables payment.

## Safeguards and rollout
- The release gate is **off** in the current Apex production database, products are private drafts, and supplier/product public authorizations have not been verified. PR #207 does **not** alter that gate, publish tables, grant commercial approval or activate checkout.
- No app-secret access or service-role credentials, new RLS table grants, BTCPay invoice, order, inventory reservation or payment mutation.
- Migration `20261104103000_apex_inventory_aware_catalog.sql` must pass isolated database tests and be applied before a production deployment that uses the new public catalog RPC.
- No product images become publicly accessible in this pass; approved metadata uses the existing no-private-media placeholder.
- Future release requires independent supplier/product evidence and confirmation of public media; real Add to Cart purchase rights require separate transactional order admission, inventory reservation and BTCPay reconciliation.

## Test acceptance
- Private stock counters: 6 on-hand / 2 reserved means 4 available; oversubscribed or unknown counts become unavailable.
- Public catalog: new bounded RPC; release disabled returns []; verified product/supplier and admin-clear filters; quantity changes affect **in_stock** vs **sold_out** without inventing inventory.
- Cart: 2 requested / 2+ available can be marked in_stock; 2 requested / 1 available is insufficient_stock; 0 available is sold_out. All remain nonpayable.
- Admin hold/publish and inventory operations invalidate cached public and private status.
- Isolated PostgreSQL tests validate anonymous permissions, bounded pagination, public gate, and zero checkout/invoice intents.
