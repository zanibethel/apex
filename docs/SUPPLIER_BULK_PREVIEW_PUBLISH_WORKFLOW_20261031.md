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

## Manual acceptance

- Create 2–5 new rows with names/prices, select and Save. Confirm per-row saved identifiers, use the existing product editor to add images/stock, and preview single and group tiles.
- Edit two existing private products, save only one, and verify the unselected product remains unchanged. Confirm category remains category (e.g. GetSwole), never supplier.
- Preview all saved vs selected IDs, check published information excludes wholesale/source costs; guest/other supplier access is denied.
- Test missing/duplicate SKU and invalid prices; a partial batch should report per-row failures while preserving successful saves.
- Test **Publish selected** and **Publish all** using *eligible synthetic private products* and confirm each request is recorded without public visibility. Admin hold should cause a per-product failure, not override or a leaked public listing.
- Verify every product remains private and the original approved product is unaffected until explicitly edited.

## Limitations / later passes

- This release includes interactive bulk rows, **not CSV/XLSX import**. Bulk CSV upload, mass image association, more advanced inline inventory edit, pagination over 100 products, and atomic single-transaction bulk saves can be added separately after this UX is tested.
- The bulk gallery previews the first 50 saved products; publish batches max 50.
- Public publication, payment acceptance, customer checkout and fulfillment remain separately gated on supplier/product eligibility, lawful sale, public media delivery, and independently reviewed release safeguards.

Keep this PR reviewable and test against the existing infrastructure. No hosted database change is needed.
