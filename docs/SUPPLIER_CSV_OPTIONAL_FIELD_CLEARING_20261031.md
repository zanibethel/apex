# Supplier CSV optional-field clearing — October 31, 2026

## Finding
Editing an existing private product via CSV incorrectly restored existing description and compare-at values when their cells were blank. This prevented suppliers from clearing an outdated description or removing a discount using the bulk CSV workflow. A blank category also retained the previous category.

## Corrected contract
- A CSV column that is **present with a blank value** clears that field for `description`, `compare_at_price`, and `category`.
- A column **not included in the imported CSV** preserves the existing value on updates.
- A blank `source_cost` continues to **preserve** the current private source cost, per the existing supplier workflow; linked source variants still require Source review for cost changes.
- A blank `sku` for an existing product continues to retain the saved SKU, while a new product receives a generated SKU.
- Import remains local editable-card staging. The supplier must still explicitly click Save selected. No publication is automatically requested.

## Testing and guardrails
- Pure helper tests distinguish omitted optional columns from included-but-empty columns.
- Parse the actual CSV text with optional cells empty, then confirm expected clear-vs-preserve semantics.
- Round-trip a saved product with cleared optional fields using the existing CSV exporter and parser.
- Existing ownership, per-store product lookup, 100-row CSV import limit, 20-row save batches, admin holds, RLS and public release gates remain unchanged.

## iPhone manual acceptance pending
1. Export a synthetic saved product with a description, compare-at price, and category.
2. Clear those three cells in the exported CSV, re-upload, and verify the private preview cards show the cleared values before Save selected.
3. Save selected, reload the supplier workspace, and verify the three cleared values persist.
4. Import an alternative CSV containing only `product_id,title,price` and confirm omitted optional fields retain their saved values.
5. Confirm a blank source cost is preserved and that linked source costs cannot be changed from the CSV editor.
6. Confirm customer-facing public offers, admin holds and payment flows remain unchanged.

No authenticated real-device walkthrough or live supplier catalog mutation was performed by this code pass.