# Apex unified supplier operations — review pass

## User experience
Lily and Tierra authenticate separately and share the same `supplier_id` and **one storefront**, so both see the same operational records.

The supplier dashboard now presents distinct counts and links for:
- **Imported source variants**: 63 rows from the previously provided sheet, unverified wholesale costs, *not* sellable product listings.
- **Draft/internal products**: 0 initially. Supplier members can create a private draft with their own SKU, description, category and confirmed retail price.
- **Inventory**: 0 initially; only generated/adjusted for actual draft products. Imported source rows do not imply stock.
- **Categories**: supplier-managed draft categories.
- **Sales history entries**: 0 until trusted payment/order reconciliation imports legitimate records.
- **Test Bitcoin wallet requests**: 0 until an operator submits a signet destination request.

On `/supplier/catalog`, the first 12 imported candidates are shown next to the draft-product editor. Each has a review-status control; a link opens `/supplier/imports` for all 63. The source costs are labeled **unverified wholesale costs** and never copied automatically into retail prices.

On `/supplier/inventory`, an empty state explains that source variants are not inventory and directs staff to review and enter actual on-hand quantities after creating drafts.

## Platform admin
The platform admin screen, `/admin/splits`, remains separate, with a proposed supplier percent (default 90) and implied platform share (100 - supplier percent). Draft changes are recorded but have **no effect** on BTCPay Server, Prism, or Bitcoin transfers.

## Security/release
All data is scoped by verified Supabase Auth identity, membership, RLS and `store_id` filters. No extra storefront, supplier roles, live products or transactions are created by this UI improvement. The staging branch depends on drafts #24 → #23 → #13. Keep the release gate until two-account browser verification and product/stock data review are complete.

The separate environment variables that allow draft editing, signet wallet requests and admin split proposals remain restricted to preview feature branches. Production checkout, payout execution and storefront publishing stay disabled.
