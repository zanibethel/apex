# PR #179 — Finish saved product setup in the supplier bulk editor

## Live catalog diagnosis

A read-only query against the connected Apex Supabase project on November 2, 2026 found **63 saved products**: 63 have descriptions, 63 have saved image references, 63 have positive prices, but only **one is active and only one has a category assigned**. No public products were released. The existing seller workflow already has batch saves (20 per server request), explicit supplier Publish/Unpublish and protected admin holds.

The immediate UX improvement is therefore **bulk category assignment and active-state setup**, not generating replacement descriptions or making up new items.

## Supplier workflow

1. Open **Supplier → Bulk add / edit / preview**.
2. Use the existing search/filter/checkboxes, or **Select visible**.
3. Under **Finish selected product setup**, choose a category and click **Fill missing category**. This only fills blank category IDs for the *checked, visible* products. Existing category assignments are preserved.
4. Optionally click **Mark selected active**. It only turns on the local active setting for checked products.
5. Review the modified cards, then click **Save selected changes** beside the setup controls. The existing authenticated server action validates the supplier membership and private store, persists changes in batches of 20, and reports any failures for selective retry.

**No edit is automatically persisted.** These controls never overwrite prices, private source costs, compare-at prices, names, descriptions, SKUs, images, or inventory. They never create release-approval records, toggle the protected global public-release gate, bypass administrator holds, call BTCPay, or make products purchasable. A stale or invalid category ID is rejected by the local staging helper; the established server-side store/category protections still apply at save time.

For safety, when changing a filtered selection the editor returns to All products with only the modified cards selected. That prevents previously hidden, checked cards from being swept into an unrelated save.

## Admin visibility

**Admin → Catalog release** now highlights the counts of uncategorized and inactive products in its currently loaded bounded sample, with a direct link to the supplier bulk editor. The page continues to show protected database visibility verdicts and per-item missing setup details rather than treating Active, Category or Publish as authorization for public listing.

## Verification and rollout

This PR contains only Next.js/JavaScript code, a pure transformation helper and Node tests; **no hosted Supabase migrations, category flips, product updates or production payment changes**. Test that staged operations preserve unrelated fields, never overwrite existing category assignments, affect only the checked selection, fail closed on stale IDs, preserve unsaved edits, and route saving through the existing authenticated private-store bulk save.

Require exact-head lint/typecheck/Node/build, isolated PostgreSQL security regression, and Vercel preview before merging. The next actual content action is an authorized supplier choosing the appropriate category and reviewing the changes. Supplier/product eligibility evidence and global Sold Out release activation remain separate tasks.
