# Supplier repeat CSV with blank SKUs — October 31, 2026

## Finding
PR #103 prevents duplicate unsaved cards when a corrected CSV explicitly contains an existing SKU. If the supplier uploads a CSV with a blank SKU, Apex generates a random SKU locally; uploading the same filename again still lacked a matching SKU and could add another card instead of updating the first.

## Scoped correction
- On an intentional re-upload of the **same filename during the same supplier editor session**, a row with no SKU and no product ID is matched against its earlier staged CSV line and exact product title, then resolved by its existing private editor card key.
- The current card's generated SKU, saved product ID (if saved since the prior upload) and other persisted identity fields are reused. Updated CSV price, description and other explicitly provided values still replace the displayed editable fields.
- Two products sharing a title but occupying different CSV lines remain distinct. A different filename, moved line, renamed title, removed card, errored previous row or ambiguous matching history does not silently choose a target.
- Existing explicit product ID/SKU matching takes precedence and remains subject to the same-store checks and duplicate-SKU warnings.
- No matching data is saved outside the current editor session. A fresh browser session with a blank-SKU CSV is treated as an import of new products; for repeatable catalog updates across sessions, suppliers should export and re-import files with product IDs and SKUs.
- The supplier still explicitly clicks **Save selected** to persist any edited cards. No external database, RLS, public listings, wallets or checkout changes.

## Automated coverage
- Two synthetic blank-SKU rows with identical titles but different source lines retain unique generated SKUs and editor keys after a corrected re-upload.
- Same-file reimport after one product becomes saved reuses the confirmed product ID instead of creating a new product.
- Different filenames, lines, titles, absent or removed products, ambiguous previous staging, and blocked imports never trigger implicit matching.
- The importer still detects explicit product ID/SKU conflicts, stores the original blank-SKU marker, and never performs automatic server writes.

## Manual authenticated iPhone acceptance pending
1. Upload a synthetic CSV with blank SKUs. Verify auto-generated SKUs and two private cards.
2. Change prices in the same file, select that filename again, and confirm the existing two cards update without duplication.
3. Save the cards, re-upload the same file, and confirm the saved product IDs and SKUs remain unchanged.
4. Upload a different filename with blank SKUs and confirm no automatic matching to previously staged products.
5. Reload the browser and use Export editor CSV (which includes product IDs/SKUs) for subsequent repeat edits.
6. Verify no unauthorized publication, and collect sanitized screenshots of issues.

**Status:** This is an automated, reviewable code improvement. An authenticated real-device test has not been completed.