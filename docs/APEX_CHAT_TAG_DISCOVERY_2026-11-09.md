# Apex Chat — Product Tags & Discovery (November 9, 2026)

## Branch and release state
- PR #326: `feat/apex-chat-discovery-supplier-insights-20261109`
- This branch adds **no live payment, checkout, order or shipping functionality**.
- **Production database migration is NOT applied by this PR.** Apply the reviewed SQL migration before deploying the code that selects `products.tags`.
- No new AI provider calls are required. Customer results come from the bounded public retail showcase feed, not private supplier tables.

## Supplier functionality
- Optional `tags` CSV column after `active` (downloadable file in `public/templates/`).
- Separate multiple tags using `|`: `working out|gym wear|get buff`.
- Maximum 12 unique normalized tags of 1–40 characters; case-insensitive, safe character set.
- Existing **nine-column CSV files remain accepted**; missing tags are saved empty on new products.
- Chat CSV import previews new tags and creates only private drafts; reupload skips identical SKUs and rejects conflicts.
- The full Products CSV importer/exporter and editable product cards retain tags.
- Supplier chat requests (with exact name or SKU):
  - `set tags for QA-TEE-001 to working out|gym wear`
  - `add tag get buff to QA-TEE-001`
  - `remove tag get buff from QA-TEE-001`
  - `clear tags for QA-TEE-001`
- Tag mutations require owner/manager membership, a single authorized private store, same-origin confirmation, current product revision, and existing write flags.
- Supplier chat also provides catalog summaries, inactive/no-tag/sold-out filters.
- Neither CSV nor tag editing publishes a product or charges customers.

## Customer functionality
- Search the **approved** public showcase projection by title, description, category and supplier tags; relevant tag and name matches rank higher.
- Basic common wording such as `workout`, `working out`, `t-shirt`, `shirt`, `tee` is normalized.
- Filters: under $amount, in-stock, cheapest/most expensive.
- UI suggests short queries; still displays only up to four matching public results per message.
- Current Apex chat fetches up to three pages / 72 approved products per request; a future scoped public search RPC is needed for stores with larger catalogs.
- Remote CoOperative fallback is bypassed whenever public tags are present, until the remote public projection contract supports tags. No supplier private data is sent to CoOperative.

## Database migration
`supabase/migrations/20261110024500_apex_public_product_tags_v1.sql`
- Adds default-empty `products.tags text[]` with bounded format constraints.
- Extends only the preexisting gated `get_public_retail_showcase_catalog` function, preserving seller/store, product, admin-hold, review-state, inventory and disabled-checkout restrictions.
- Excludes restricted terms appearing in name, description **or tags**.
- Does not modify the main restricted-commerce release gate, BTCPay, wallets, orders, inventory or shipping.

## Acceptance checklist
1. Review and apply migration in a controlled environment before app deploy; check RLS and public RPC.
2. Verify old nine-column file imports with zero tags and new ten-column file imports with tags.
3. Verify supplier add / remove / clear tags, stale/replayed confirmation denial and cross-store denial.
4. Publish a neutral, permitted test item; check customer chat finds by tag, title, description and synonym, but not unpublished/held items.
5. Check mobile prompts, keyboard, CSV preview and search results.
6. Confirm no checkout, payment or order paths changed; rerun GitHub quality, RLS and Vercel preview checks.

No automatic production deployment or schema activation.
