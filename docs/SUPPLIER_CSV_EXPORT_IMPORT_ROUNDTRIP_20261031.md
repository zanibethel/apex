# Supplier CSV export/re-import compatibility — October 31, 2026

## Finding
The supplier private editor can show up to 250 saved product cards. Previously its single Export editor CSV action could download all 250 rows, while the CSV importer allows only 100 rows per file. A valid export of 101–250 products was therefore rejected on re-import.

## Corrected behavior
- The editor now prepares one downloadable CSV part per 100 saved-product cards; a catalog with 250 saved cards offers three clearly labeled buttons for products 1–100, 101–200 and 201–250.
- Each part is downloaded separately on explicit click to work reliably on mobile Safari, without multiple automatic download prompts. Files have stable range-based names and the original CSV column format.
- Fewer than 101 saved cards retain the familiar one-file **Export editor CSV** button and filename.
- ID-less unsaved new cards are never exported, since they cannot be safely matched to existing saved products on re-import.
- Saved cards with unsaved local changes are exported using their current editor values, not necessarily their persisted database values. The UI makes this explicit and recommends saving first if the supplier wants a snapshot matching the stored catalog.
- The existing CSV importer remains bounded at 100 rows / 256 KB per file. There is no change to existing product-ID and SKU matching rules, supplier authentication, server-side validation, RLS, release gates, or payments.

## Regression coverage
- Programmatically round-trip 250 synthetic private product rows through three separate generated CSV files and the real parser.
- Verify original IDs, SKUs, names, multiline descriptions, source costs, prices, compare-at prices and the GetSwole category remain correct.
- Confirm exactly 100 or fewer rows per file, below the 256 KB import size ceiling.
- Cover 0, 1, 100, 101 and 250-product boundaries, existing filename and ID-less unsaved exclusion.
- CI must pass lint, TypeScript, tests, Next.js build and disposable PostgreSQL security integration on the exact PR head.

## Pending authenticated iPhone checks
1. Sign in as an authorized supplier on iPhone Safari and open `/supplier/catalog/bulk`.
2. With 101–250 synthetic saved products, verify part buttons and individually download each CSV using normal iOS Files/share prompts.
3. Re-upload one part at a time, confirm existing SKU/product ID matches update existing private cards rather than making duplicates.
4. Edit a description/price in the editor without saving, export and confirm the unsaved-value warning is accurate; then save and repeat.
5. Check button wrapping and visible labels on narrow screens. No public product release or payment changes are part of this acceptance.

**Boundary:** This is a code and CI pass. An authenticated real-device browser walkthrough has not been completed.