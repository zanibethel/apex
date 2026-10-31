# Apex: editable automatic SKUs / visibility and release distinction

## Product identifiers (prelaunch, private only)

- New manual draft products: Leave SKU blank; server generates APX-<NAME>-<RANDOM-8-HEX> from sanitized product name plus cryptographically random UUID. Supplier can override it before creating the draft.
- Approved import candidates: Same default, computed by the server from the *database-sourced* product name and strength after authorization, not a client-trusted product title; original reviewed-to-draft RPC remains atomic.
- Existing private drafts: supplier owner/manager can edit SKU on the same product card, with uppercase normalization and allowed A-Z, 0-9, periods, hyphens, underscores, maximum 60 characters.
- Per-store unique (store_id, sku) remains authoritative in the database; duplicates are rejected. The product's immutable UUID remains the link for image, inventory, and related records, so SKU changes do not change its product identity or image path.
- SQL: database/sql/apex_draft_sku_edit_REVIEW_ONLY.sql requires existing draft-only RLS, store-scoped SKU uniqueness, no publication/store-ID column updates, and grants ONLY UPDATE(sku). This must be reviewed and separately applied to the existing Apex prelaunch database to enable live SKU edits. Do not execute a blind schema push.
- No new Supabase project or hosted branch required. Existing GitHub isolated PostgreSQL CI runner tests role and uniqueness boundaries.
- Never auto-publish or make products purchasable by adding a SKU.

## How visibility works today

Current public route /catalog reads only products with is_published=true, then RLS additionally requires stores.is_public=true and, for categorized listings, categories.is_published=true. The site is still a technical public catalog preview. Its UI does not implement product approval, public publishing, verified retail catalog photo presentation, real inventory or checkout. Supplier form is_active is only an internal merchandising state, **not** is_published. There is deliberately no supplier publication action.

An authorized prelaunch review/publishing workflow should require separately verified product/service eligibility, admin approval, and explicit publication authorization; do not grant suppliers a generic right to set is_published or is_public. Public browsing and purchase/fulfillment for regulated products must remain disabled absent appropriate authorization and approved processing. This pass does not make any listing public.

## Validation

- Node tests: format, normalization, override, bad characters, imported source behavior, privacy flags, editor wiring and SQL grant checks.
- Disposable PostgreSQL CI tests: a manager can edit draft SKU, duplicated SKU is rejected by database uniqueness, unaffiliated/cross-supplier edits denied, published records denied and publication columns remain protected.
- Browser QA after reviewed merge + separately approved SKU SQL grant: create blank-SKU private draft, edit SKU, refresh/sign out-in, confirm image/stock linked and duplicates rejected.
