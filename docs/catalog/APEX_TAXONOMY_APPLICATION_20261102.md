# PR #182 — Reviewed taxonomy applied through existing authenticated workflows

**Scope:** a user-confirmed, staged category-assignment workflow for Apex's existing 63 saved product variants. This pass does not automatically change production categories or products.

## What is implemented

1. **Admin → Category controls** now shows the previously merged 63-product taxonomy for the original Apex store, including eight proposed additional categories. The admin may explicitly click **Create missing categories**. The server action verifies the authenticated platform-admin app-metadata role, checks the current private category overview and invokes the existing audited `create_admin_catalog_category` function once per absent category. Each new category starts **unpublished**; duplicates are not silently overwritten; any partial failure is reported.
2. **Supplier → Bulk add / edit / preview** receives the exact 63-product proposal only after verified supplier owner/manager membership and the original private store are established server-side. The client can expand all proposals and the 13 held items. It displays current category availability and does not allow staging until all needed categories are created.
3. **Stage matching categories** validates all 63 *saved* product IDs, SKUs and names against the reviewed plan, checks category names against the current store, refuses stale or conflicting assignments, preserves the existing GetSwole record, and holds the 13 review-required records. When ready, it stages **49 missing category assignments** in local React state and selects those 49 cards. The supplier reviews and chooses the existing authenticated **Save selected** action, which saves in batches of 20 with existing retry reporting.
4. The mapping is imported into server-only route logic and sent only to the authenticated supplier's browser. There is no new public category endpoint, no privileged bulk SQL writer, and no new database migration.

## Safety boundaries

Category staging **never** changes product active/inactive state, source cost, retail price, compare-at price, description, SKU, name, images, inventory, supplier publication intent, admin holds, eligibility records, or checkout. When saving a staged card, any other *existing unsaved edits on that same card* will be included by the existing editor, and the UI explicitly warns of this. The 13 unresolved product identities/compositions/strengths remain untouched, not assigned to a disguised `Needs review` public category.

These category group names are research/catalog taxonomy suggestions, not evidence of clinical effects, permitted sale, or product-specific approvals. The independent supplier/product release records and global public Sold Out gate remain unchanged. No product is activated or publicly released, and Bitcoin checkout and payouts remain disabled.

## Exact matching and verification

The source-of-truth inventory plan is `docs/catalog/APEX_TAXONOMY_MAPPING_20261102.csv`, merged in PR #181; `src/lib/catalog/apex-reviewed-taxonomy-20261102.mjs` is its matching server-side snapshot. Unit tests compare each of 63 IDs, SKUs, names and statuses to the CSV, enforce the 50 proposed categories (1 existing + 49 new) and 13 independent review holds, and reject stale row identity, duplicate IDs, foreign store IDs, conflicting preexisting categories, missing category names and post-review modifications.

After merging, a verified admin can create the eight unpublished category labels through the new dashboard button; an authorized supplier can stage and save the assignments. **No authorized user action is impersonated or performed by the CI runner or a privileged database tool.**
