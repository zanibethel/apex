# Apex — mobile supplier product cards (October 30, 2026)

## UX decision
Replace horizontally scrolling product and source-variant tables at `/supplier/catalog` with responsive cards. At phone widths every card takes one column; larger screens wrap cards automatically. No `min-width` tables or horizontal scrolling are needed to manage products.

Each imported-source card contains:
- Product title and strength, source number, and editable **source acquisition cost**, in USD.
- Supplier review status, editable by authorized members.
- Once reviewed for draft creation, a form for a unique SKU, **customer purchase price**, optional **compare-at price** (must exceed purchase price), and independently confirmed stock.
- Once created, the SAME card contains a product image preview/upload button, title, description, category, active/inactive toggle, customer purchase price, compare-at price, and stock display.

Products created manually (without a source candidate) have the same draft editor and image upload, plus their own private source-cost input.

## Pricing separation
- The `supplier_import_candidates.wholesale_cost_cents` field is private and only editable by members of its supplier. Each change has old/new values, actor ID and timestamp in `supplier_source_cost_audit`, with no direct supplier INSERT/DELETE grant.
- Standalone products use `products.internal_source_cost_cents` (nullable, private), logged by existing catalog audit triggers. When a product is linked to an import candidate, its source cost remains on the candidate only to avoid inconsistent duplicate sources.
- Customer purchase price stays in `products.price_cents`. Compare-at price stays in `products.compare_at_price_cents`, must be strictly greater than the purchase price, and must reflect a genuine reference price rather than an invented discount.
- Approved-source draft creation uses a SECURITY INVOKER function that calls the existing one-to-one atomic promotion and sets optional compare-at within the **same** transaction. Bad comparison or duplicate source causes rollback, including the draft and inventory row.
- Source variant costs are never automatically used as retail prices, and no stock counts are assumed from the source sheet.

## Release/test
- SQL migration: `database/sql/apex_supplier_cost_edit_audit.sql`.
- Disposable PostgreSQL isolation test: `database/tests/mobile_supplier_product_cards_integration.sql`; static layout/authorization tests: `tests/mobile-supplier-product-cards.test.mjs`.
- Run GitHub tests and protected Vercel preview, verify mobile viewport in an authenticated session and price/image saves with owner and manager accounts.
- Apply migration to the dedicated Apex Supabase project only after full tests, verify RLS and audit, then merge to `main` for authenticated production dashboard access.
- The storefront stays private: no customer checkout, product publishing, payment processing, or live Bitcoin transfers are enabled by this change.
