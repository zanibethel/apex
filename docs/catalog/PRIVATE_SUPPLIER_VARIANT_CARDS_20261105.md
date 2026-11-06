# Supplier-only retail option cards — November 5 intake

## Purpose

One card per supplier product; use a small dropdown inside the card only when valid variants exist. Changes to the choice update that card's **retail** price. This read-only preview is not a live sale or a replacement for the original product/stock ledger.

## Current intake

- Original supplier workbook privately received and inspected: 94 source product rows.
- 76 proposed parent names and 168 proposed oil/strength/size options.
- 157 options are position-price-mappable for **review**; 11 options over 5 source rows require supplier clarification.
- The private source workbook prices are **customer retail prices**, not source costs. Do not double them or copy them to `internal_source_cost_cents`.
- The current Apex hosted catalog contains 63 earlier draft product records. No automatic mapping, SKU overwrite, image change or on-hand adjustment is permitted here.
- This branch introduces a separate private `public.apex_supplier_variant_review_items` table with owner/manager-only RLS `SELECT`, and `/supplier/catalog/variant-review` reads one bounded supplier store/batch. The card preview is read-only.

## Operations

1. **Review & merge the tested code/migration** before applying to hosted Supabase. The schema is not assumed installed simply because it is in GitHub.
2. Load the 168 workbook-derived option rows **only into the protected review table** using a trusted operator connection. Do not commit prices/raw workbook data or create unrelated product drafts in GitHub.
3. Visit `/supplier/catalog` → **View supplier product options**. Confirm 76 parent cards, 157 priced options and 11 held options *only after the complete private import is actually verified*.
4. A parent with one valid priced option shows one price and no selector. A parent with multiple valid priced options shows one selector with exact choices; the price updates without producing more cards.
5. The five ambiguous parent rows remain unpriced/held; obtain supplier clarification before any later release or authoritative variant import.
6. Match proposed parents/options privately to original saved product IDs and existing SKUs before any changes to `products`; preserve existing image/description/manual price edits and stock.
7. Separately design the eventual authoritative variant identity and source-of-truth checkout handoff. This staging layer is **not** an inventory or payment source.

## Guardrails

- No `anon` grant, no browser write grant, no supplier import action on this page, no public catalog read of the private staging table.
- Authenticated supplier owner/manager must belong to the exact private store; staff and cross-store reads are denied.
- No public publishing, checkout/payment activation, shipping, label purchases, SKU generation, or stock changes.
- Original supplier workbook and exact prices remain in protected sources; use only synthetic fixture prices in the public repository.

## Verify

- Exact-head GitHub lint, TypeScript, Node, Next production build.
- Disposable PostgreSQL migration plus `tests/payout-rls/private-supplier-variant-review.sql` for RLS and duplicate checks.
- Vercel preview; then confirm hosted migration applied before importing private rows.
- Run a read-only count check for source-batch completeness and unchanged release gate/inventory/products before declaring staging ready.
