# Apex supplier Preview all saved — paginated acceptance (October 31, 2026)

## Finding
The supplier bulk editor now supports reloading up to 250 private saved products, but its **Preview all saved** link displayed only the first 50 products. A supplier could not visually review all their offers and the adjacent Publish all button could misleadingly look like an entire-catalog operation.

## Change
- **Preview all saved** uses stable, authenticated store-scoped, unpublished-product ordering by name then ID, with 50 offers per page.
- Query the exact count to render **Showing X–Y of N saved offers** and **Page P of Q**. Previous 50 / Next 50 links navigate to every page, including products 201–250.
- Invalid, out-of-range, or unavailable-count pages fail closed; the helper bounds page numbers to 1–1000 (50,000 products).
- Existing **Preview selected** remains limited to 50 explicit IDs and does not inherit page navigation or allow arbitrary selections.
- The server generates private signed image URLs and release decisions only for the current page; source costs are never displayed in customer-style offer tiles.
- The preview page's **Publish all on this page** submits private intents only for currently eligible offers displayed on the current page, up to the existing 50-product maximum. No cross-page bulk request or public publication is introduced.
- Category lookup limit aligns with the bulk editor's 250-card capacity.

## Verification
- Node regression tests cover exact page boundaries, 250 products across five distinct pages, empty/out-of-range pages, malformed query values, stable ordering, role checks, privacy, and the 50-request ceiling.
- GitHub CI must pass lint, TypeScript, Node tests, Next.js build, and disposable PostgreSQL RLS integration.
- Vercel preview must show READY on the exact PR commit. No hosted catalog changes or payments.

## Remaining authenticated iPhone acceptance
1. As a supplier owner or manager with synthetic private drafts, open Preview all saved and verify Page 1 of N, then Next 50 and Previous 50.
2. With 101–250 drafts, check an offer beyond the original first 50, its category, price/compare-at price, image, description and inventory.
3. Verify selected preview links still show only explicitly selected saved offers (up to 50).
4. Verify **Publish all on this page** affects no other pages, and that admin holds/required reviews prevent private requests. No public products should become visible.
5. On iPhone Safari, check layout, tap areas, loading cost and return-to-bulk navigation.

CI does not replace live authenticated browser QA. No real customer data, wallets or checkouts are used.