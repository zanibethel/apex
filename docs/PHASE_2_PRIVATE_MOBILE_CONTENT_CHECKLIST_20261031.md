# Apex Phase 2 — Mobile supplier cards and private content checklist

Date: 2026-10-31. Review-only UI pass, branched from deployed main. No live database DDL or data changes.

## Mobile product experience

Supplier cards now show the product name, SKU, image, purchase/compare price, internal stock count and a **content checklist**, without expanding a long edit form by default. The underlying image and inventory remain linked by the product UUID, not by its editable SKU.

- **Manage product image:** expandable area for owner/manager private drafts only.
- **Edit details, SKU and price:** expandable area; staff can open disabled read-only product fields, and no mutation controls are enabled.
- **Imported variants:** the review status remains visible; source cost and source-review forms are under a single native expandable area, reducing scrolling across 63 source entries.
- **Creation:** new private draft and category forms are collapsed until explicitly opened.
- Keyboard access uses native HTML details/summary; focus outline and mobile spacing are provided in CSS.

## Internal content checklist

Pure read-only helper checks six *metadata* fields: name, SKU, description, category, saved image path and positive purchase price. It displays what is missing on a private draft. **It is NOT legal/medical review, product validation, supplier verification, retail approval or publication readiness.** A full checklist makes no listing public.

The internal Active toggle remains unrelated to publication. There are no new publication routes, publish permissions, checkout, order or payment changes.

## Authorization and QA

The supplier catalog UI now shows write controls only when the draft-write feature flag is enabled, the workspace has one private store and the signed-in user holds owner/manager membership for that exact store. Server actions/RLS remain the authority and unchanged. Some outstanding draft PRs have overlapping role-guard edits; reconcile before merging related PRs, rather than overwriting this guard.

Tests cover checklist inputs, read-only behavior, expandable forms and role guard. Existing GitHub CI runs lint, typecheck, source tests, build and disposable PostgreSQL RLS checks. No new Supabase branch or test database was provisioned.

After an approved merge, manually verify on iPhone: compact cards across multiple imported variants, keyboard/VoiceOver expand/collapse, editable owner/manager workflow, read-only staff workflow, image refresh and original SKU/stock persistence. Preview deployments may have draft-write feature flags disabled, so do not confuse that with a permission failure.

## Supplier-visible go-live explanation

Each private draft card now has **Finish this product** with an eight-step setup tracker: name, SKU, description, category, stored image, purchase price, internal active setting and a positive on-hand inventory quantity. The first six are the content checklist; the last two are operational. These are owner-entered values, not independently verified claims. Optional private supplier source cost and truthful compare-at price do not block internal data entry.

The tracker lists only missing items first, with direct destinations to **Edit details**, **Manage image**, **Select or add category**, or **Manage inventory**. Native expandable sections remain keyboard accessible. After completing a category, the supplier must select that category in the product edit form and save.

Below the setup tracker, a separate **Storefront: Not published** sequence states: (1) complete draft data, (2) separate administrator/product eligibility review, (3) separately approved public release. Steps (2) and (3) are **not implemented** by this PR and cannot be satisfied just by toggling Active. The current Supabase draft image bucket is private and may not be used as a public asset without an approved publication/storage workflow.

Even if the setup counter reaches eight of eight, this means only internal draft setup is complete. No eligibility, compliance, licensing, admin review, public exposure, catalog publication, customer checkout, payment, or fulfillment is authorized or activated. Do not use this checklist to bypass a publication review.
