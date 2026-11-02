# Apex card-first publishing controls — 2026-11-01
Branch: feat/card-toggle-publish-edit-bulk-20261101

## Supplier UX
Saved product cards default to a compact offer preview. Each card has:
- A selection checkbox for multi-product actions.
- A pencil icon that opens the existing complete editor (name, SKU, source cost, sell price, compare-at proposal, category, description, activation) and saved image/inventory picker.
- An accessible Publish switch that saves supplier publication intent by the existing authenticated/audited RPC.
- A supplier-side Unpublish switch and bulk Publish selected / Unpublish selected actions (up to 50 per request). Individual failures are returned and no optimistic success is claimed before server confirmation.
- Locked cards show their admin reason and provide a direct edit/resubmit path.

The platform admin retains its independent listing-control dashboard. A newly proposed audited owner Unpublish action clears supplier publication intent **without** locking future supplier publication. Existing owner Lock and Require corrections options require a descriptive reason; after correction the owner can Unlock and the supplier can publish again. This design does **not** require owner approval for every routine product publication; only explicit locks need an owner release.

## Zero-stock changes
The supplier draft setup checklist is updated to count an existing inventory row with quantity_on_hand = 0, quantity_reserved = 0 as **complete** for listing. The product appears Sold Out when independently authorized.

`database/sql/apex_simple_listing_controls_REVIEW_ONLY.sql` is the reviewed SQL source now installed in hosted Apex as migration \`apex_simple_zero_stock_listing_and_owner_unpublish\` on 2026-11-02 UTC that updates only:
- the existing private product-review snapshot to accept nonnegative on-hand inventory, with reserved units within on-hand;
- the existing audited admin listing override RPC to allow a separate `unpublish` action while preserving trusted platform-admin app_metadata checks, admin lock reason validations and all existing public-release restrictions;
- the immutable listing event action constraint to include `admin_unpublish`.

The SQL preserves global `apex_internal.private_release_gate.enabled=false`, grants no new privileges, does not change `products.is_published`, `stores.is_public`, seller/product eligibility, image hosting or checkout authorization. The vetted SQL passed disposable PostgreSQL CI and was applied with a hosted preflight. Subsequent readback verified zero-stock support, admin unpublish action, non-executable admin RPC for anon and the unchanged public release gate OFF. Existing Supabase security-advisor warnings for intentionally privileged role-gated RPCs remain and were not expanded.

## Safety and future public release
A supplier Publish switch is an **intent** control, not proof of legal or product-specific eligibility. With the present global public release gate OFF and zero public stores/products, switching it on CANNOT show imported medical products to customers.
Independent seller/product eligibility for potentially regulated products, accurate public imagery, content compliance and separately authorized storefront release remain mandatory before real public display. Real inventory or BTC changes never override them.

No attempt to make the 62 unverified source variants approved was made. Supplier bulk source review + approved-only private draft creation remain available and separate from catalog card actions.

## Verification
Full GitHub CI lint, TS, tests, build, isolated PostgreSQL RLS, preview READY; hosted SQL is a separate gated rollout to be verified after tests. Publish/unpublish tests prove both actions use the existing RPC, owner controls are role-gated, and zero stock is not misclassified as a missing inventory row.
