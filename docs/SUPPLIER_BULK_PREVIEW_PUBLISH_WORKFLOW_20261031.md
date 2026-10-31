# Apex — Supplier Product Workflow: Bulk Edit → Save → Preview → Publish Request

**Date:** October 31, 2026. This feature is **private supplier management only** and does not release products to the public. Existing Apex `zanibethel/apex`, Supabase `fhqpkpztercadcxspdkg`; no migrations or new projects.

## Supplier workflow

1. Open **Products → Bulk add / edit / preview** or **Supplier workspace → Bulk product manager**.
2. Add one or five blank product rows, or edit existing private products in place. Select the rows to save. Edits include name, SKU, customer price, truthful compare-at price, category, description and internal active toggle.
3. Click **Save selected**. Saves run through the *existing* authenticated draft creation/update server actions, in bounded batches of **up to 20** rows. Every row gets its own saved/error result. Partial failure is reported; one rejected row does not silently erase successful rows. New draft products receive their actual generated SKU and database ID; the UI can then preview them without another save.
4. Select any saved rows and choose **Preview selected**, or choose **Preview all saved** (first **50** records per gallery), or click **Preview single** on a saved row.
5. Review the storefront-style offer tile with saved private image preview, category, title, SKU, description, price, compare-at discount and stock availability. On individual previews choose **Publish**. On the group preview choose **Publish selected** or **Publish all** (max 50 per batch).
6. Publishing **only saves private supplier publication intent** by invoking `set_supplier_listing_intent` for each requested product. It does not set public flags or make a public image, checkout or payment available. Existing admin holds, completeness and duplicate-hold rules are enforced in the database. Each result is reported independently.

The long eight-step private setup checklist and optional internal content-review controls remain accessible in a collapsed **Optional setup checks and internal review** section; they are not added back as a mandatory supplier approval screen. The actual customer tile preview is now the prominent next action.

## Security

- Each supplier page requires a verified, nonanonymous Supabase user, owner/manager membership, a single assigned **private** store and normal per-tenant RLS.
- Bulk writes call existing checked draft creation/update actions, which verify membership/store/product again, constrain the fields and prohibit editing public products.
- Product previews use short-lived authenticated **private** image signed URLs. Do not expose them in public catalog APIs or permanent pages.
- Bulk publishing independently checks membership, product-store ownership, private status, product completeness, and admin holds via the existing RLS-protected PostgreSQL RPC; server action does not have privileged client-side service-role keys.
- **The public-release gate remains structurally disabled.** Neither batch or single requests publish publicly, bypass authorization, or create orders/payouts.
- This UI does not change any database schema or bypass existing product/category and source-import relationships. Private source cost and images are not overwritten by bulk edits. New draft products start with zero stock; complete inventory and upload images before requesting publication.

## CSV import acceptance

1. Download the template and populate two harmless sample products (leave `product_id` and `sku` blank). On upload, verify that **two editable draft cards appear immediately**, each with a distinct SKU, and both remain **not saved** until Save selected.
2. Export existing private products, change a nonlinked product's direct source cost and price in the CSV, upload, and confirm the matching SKU becomes an **update** rather than a duplicate. Verify a linked source cost can only change in Source review.
3. Upload a CSV with malformed numeric values, unknown category, duplicate SKU, or a product_id outside this store; verify line-level issues and no write.
4. Choose the automatically created valid cards and save; verify that their generated SKU and returned database product ID are preserved for later edits. Import 21+ rows and confirm the client submits in audited chunks of 20 with per-row statuses.
5. Preview selected/all products. Neither uploading nor saving should set `is_published`, bypass an admin hold, or enable the customer checkout.
6. Verify source costs never appear in public/customer offer tiles; CSV export requires a verified supplier owner/manager page.

## Manual acceptance

- Create 2–5 new rows with names/prices, select and Save. Confirm per-row saved identifiers, use the existing product editor to add images/stock, and preview single and group tiles.
- Edit two existing private products, save only one, and verify the unselected product remains unchanged. Confirm category remains category (e.g. GetSwole), never supplier.
- Preview all saved vs selected IDs, check published information excludes wholesale/source costs; guest/other supplier access is denied.
- Test missing/duplicate SKU and invalid prices; a partial batch should report per-row failures while preserving successful saves.
- Test **Publish selected** and **Publish all** using *eligible synthetic private products* and confirm each request is recorded without public visibility. Admin hold should cause a per-product failure, not override or a leaked public listing.
- Verify every product remains private and the original approved product is unaffected until explicitly edited.

## Limitations / later passes

- **CSV template, upload and private export are included.** Template route: `/templates/apex-product-import-template.csv` (also available from the bulk product page). Columns: `product_id,sku,title,description,source_cost,price,compare_at_price,category,active`. Product ID is optional for exact existing-product updates; otherwise a matching same-store SKU edits the existing draft; a new SKU or blank SKU creates a new private draft. `category` is an existing **category name**, not a supplier. Source cost is private and never shown in customer-facing tiles.
- CSV files are parsed locally in the supplier browser (RFC4180 quotes, multiline text, BOM and CRLF supported); maximum **100 data rows / 256 KB**, with explicit rejected-row messages for missing mandatory data, formulas, invalid prices, unknown categories, mismatched IDs/SKUs and duplicate products. Uploading immediately creates editable draft cards in the browser for valid CSV rows and generates missing SKUs using the same format as server-created drafts. Invalid rows remain flagged and are excluded. Cards are **not yet saved to Supabase**. Existing edited cards show **Unsaved edits** until saved; preview of stale unsaved changes is disabled. Suppliers check the cards they wish to save and click **Save selected**; a browser-side sequence submits bounded **20-row** batches using the existing authenticated server actions, which report per-row success/failure. Up to 250 staged editor rows can be loaded. Each server batch remains separately authorized; multi-batch saves are not one atomic transaction.
- An **Export editor CSV** button downloads staged existing saved-product rows with private source costs for editing offline; this may include edits not yet saved to the database. Spreadsheet-formula-like text is escaped on export and rejected on import.
- Optional fields: `product_id`, `sku` for new drafts, `description`, `source_cost`, `compare_at_price`, `category`, `active`. Required: `title` and positive `price`. `active` can be true/false, yes/no or 1/0; blank retains the existing value on updates. Blank `source_cost`, description, and compare-at price on updates preserve their existing values; to clear values, use the manual product editor. Supplier-linked import source costs remain protected by the existing separate Source review action. Images and inventory remain on their dedicated editors; no image URL or public media import is enabled.
- Other later enhancements: mass image association, optional inventory import via its own audited workflow, pagination over 100 existing products, and atomic all-or-nothing bulk transactions.
- The bulk gallery previews the first 50 saved products; publish batches max 50.
- Public publication, payment acceptance, customer checkout and fulfillment remain separately gated on supplier/product eligibility, lawful sale, public media delivery, and independently reviewed release safeguards.

Keep this PR reviewable and test against the existing infrastructure. No hosted database change is needed.
