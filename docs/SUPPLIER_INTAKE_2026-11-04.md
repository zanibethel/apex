# Apex supplier handoff — November 4, 2026
**Purpose:** prepare for possible expanded supplier availability; **nothing in this checklist confirms stock, approval, purchasability or shipping eligibility**.

## First contact: what to request
Obtain the following via **supplier-approved private channels** (not public GitHub issues, public PRs, or public CSV files).

| Information | Why we need it | Until verified |
|---|---|---|
| Supplier / inventory owner and authorized contact | Prevent mixing another supplier's entries into the shared storefront | Keep supplier changes in review |
| Existing supplier item code and exact variant / package identifier | Match to existing product or create a new **draft** only after review; protect against duplicates | No guessed SKU or overwrite |
| Product display name, description and attributes | Identify changed vs new information | Do not overwrite saved edits |
| Supplier-reported availability and date | Distinguish what *may be available* from actual received stock | On-hand inventory stays unchanged |
| Unit/package cost, proposed retail price and compare-at price where appropriate | Review economics and source values, not automatic pricing | No made-up or default markup |
| Media with permission to reuse | Avoid copying restricted or third-party images without rights | Keep placeholders private |
| Category / product restrictions / approval evidence | Determine what can legally be listed or shipped | Keep held or unlisted pending evidence |
| Lot/source/expiry or safety documentation where applicable | Traceability and eligibility review | Do not convert to fulfillable inventory |
| Shipping and return constraints | Determine carrier and operational feasibility | No label purchase or customer order |

**Do not request or store login passwords, private API keys, wallet seeds, sensitive customer records, or supplier personal financial details in a shared product CSV.**

## Tomorrow's operating checklist

- [ ] Mark supply status **POTENTIAL** until received and independently reviewed.
- [ ] Gather source data and evidence privately; document who may approve products and inventory changes.
- [ ] Open [supplier bulk catalog](https://apexanabolics.co/supplier/catalog/bulk) and use **Source import / CSV** only for authorized *private staging*.
- [ ] Compare to today's checkpoint: 63 saved products / 63 import candidates / 13 uncategorized / 0 on-hand stock / no published offers.
- [ ] Produce a diff grouped by **existing unchanged**, **existing with proposed edits**, **new variant/product**, **duplicate candidate**, **missing information**, and **blocked/eligibility review**.
- [ ] Confirm exact supplier ownership. `GetSwole` is a *category*, not a supplier.
- [ ] Review identity collisions: same SKU in two source rows, same product differently spelled, same item with another package size, missing SKU, and repeated files.
- [ ] Require supplier approval on changes to prices, descriptions, categories, variants and images before saving.
- [ ] Leave public release, real checkout, Bitcoin payment, carrier label purchasing and inventory quantities **unchanged** until their separate reviews pass.
- [ ] Record outcome in [Issue #213](https://github.com/zanibethel/apex/issues/213): file received? unique/duplicate/needs-review counts? decision owner? next blocker?

## Existing CSV compatibility (do not invent a second schema)
Apex's already-deployed product CSV template uses these columns:

`product_id,sku,title,description,source_cost,price,compare_at_price,category,active`

Download the current template or export directly from the supplier bulk editor. The saved product export is split into parts of at most 100 entries to respect the importer size limit. **Do not** put private customer details, wholesale credentials or legal review documents into these fields.

If supplier-provided data has different columns or more than 100 entries, keep the raw source in an approved private location and first build a **review-only normalized diff**; don't force it into the existing importer by guessing fields.

## Clear "ready for implementation" decision

The supply intake checkpoint is **accepted** when:
1. Supplier identity, source ownership and private source file are verified.
2. Every proposed row maps to one of **existing**, **new draft**, **duplicate/conflict**, or **held for eligibility/evidence**.
3. Updated cost/price, category/media and stock fields are *reviewed*, not automatically inferred.
4. Repeat file import cannot create duplicate product records.
5. The number of products, active state and on-hand stock after intake are either **unchanged** or supported by an approved, tested change record.
6. A separate launch/transport authorization is recorded before anything becomes publicly available or ship-ready.

## If the larger supply doesn't materialize
Keep the catalog stable; focus next on 13 uncategorized cards, supplier mobile QA, email deliverability checks, and the canonical order data-model issue [#214](https://github.com/zanibethel/apex/issues/214). **No invented stock, no placeholder orders.**
