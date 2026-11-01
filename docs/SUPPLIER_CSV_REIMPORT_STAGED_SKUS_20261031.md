# Supplier CSV repeat upload and staged SKU matching — October 31, 2026

## Acceptance bug
After importing a CSV into the private supplier editor, its newly staged products have SKUs and local card keys but no persisted database IDs until Save selected. Previously the CSV re-import lookup only indexed rows that already had saved product IDs. Re-uploading a corrected version of the same CSV before saving could create a second unsaved card with the same SKU, inflate the 250-row capacity and produce duplicate-SKU errors during persistence.

## Correction
- Build an editor-local SKU lookup across **saved and unsaved** product cards, preserving each card's stable key. A repeated import with the same SKU now updates the existing staged card in place instead of creating a duplicate.
- If the workspace itself has more than one card with the same normalized SKU, the import blocks that SKU row with an explicit duplicate warning; it never silently chooses one of those cards.
- If an import has both a product ID and a SKU, the lookup must identify the same card. Existing cross-store ID protections remain in place.
- Clear the CSV file input value after capturing its File, so re-selecting the same `.csv` file on iPhone Safari still fires the upload handler.
- The 100-row CSV input, 250-card editor, 20-row server save batches, supplier tenant authorization, admin holds and private-only publication remain unchanged. No CSV import triggers automatic database writes.

## Automated checks
- Pure tests for matching unsaved and persisted SKUs, repeated import with stable key and constant card count.
- Duplicate saved/unsaved SKU conflicts fail closed regardless of row order.
- Source tests ensure product ID/SKU mismatches and unknown product IDs are still blocked.
- File input permits reselecting the same filename and no auto-save or publish is introduced.
- Require lint, TypeScript, Node tests, Next.js build and disposable PostgreSQL security integration on the exact PR commit.

## Authenticated iPhone walkthrough still needed
1. Open the private supplier bulk editor as an owner/manager and import a synthetic CSV with one new SKU.
2. Change the CSV's price/description, then re-upload the same filename **without clicking Save**.
3. Confirm the existing staged product card updates in place rather than creating a duplicate; save once and confirm the SKU/ID and edited values after reload.
4. Select the same file a second time without changing its name; confirm Safari fires the import handler.
5. Create two staged cards with identical SKUs; confirm the CSV row is marked blocked rather than silently overwriting either card.
6. Confirm product-ID conflicts remain blocked, no public offer appears, and signed-in supplier roles cannot access another private store.

No hosted Supabase records were changed; automated CI cannot substitute for signed-in Safari QA.