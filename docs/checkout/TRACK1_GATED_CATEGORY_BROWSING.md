# Track 1 — gated category browsing (November 5)

- Adds `category_id` and `category_name` to the existing read-only public inventory catalog JSON, **only** after the same independently verified supplier/product release checks, published-category join, admin-clear listing control, verified inventory and global release flag.
- Does not expose the private categories table, all supplier categories, signed private media, source costs, stock quantities or payment rights. Categories appear **only alongside eligible products**, never as a separate public list.
- The TypeScript parser accepts exactly the older seven-key or newer nine-key response during a staged deployment. Both reject unexpected fields or payable flags; category IDs must be UUIDs and labels bounded to 80 visible characters.
- Search and category/availability filters operate on the current approved 24-product page only, including mobile layouts and detail-page labels. Cross-page facets are intentionally not claimed.
- All real categories are currently unpublished; the public gate is off and catalog RPC returns no products. Neither this migration nor UI turns any category or item public.
- Isolated PostgreSQL asserts anonymous read shows the correct released category only when the gate is explicitly enabled **inside a rolled-back synthetic test transaction**, that unpublished categories disappear, that the disabled gate returns an empty list, and that private fields remain unavailable.
- No sales tax, order admission, BTC transactions, fulfillment or USPS writes.

**Rollout:** merge only after full GitHub quality/Payout RLS CI and Vercel preview. Apply the reviewed migration only after checking the hosted gate remains disabled and the current function body matches the repository source. Recheck hosted grants, category release counts and zero checkout/invoice writes after application. Real supplier category publishing requires separate approval.
