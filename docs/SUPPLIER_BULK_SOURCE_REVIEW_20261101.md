# Apex bulk source-review dashboard — 2026-11-01

## Delivered
A private, authenticated supplier owner/manager review screen at `/supplier/imports/bulk-review`. It reads the complete source import queue for exactly one authorized private supplier store (up to 100 entries), existing candidate-to-product links, and a signed preview image from the same private store. It does not query unscoped or customer-facing records.

- Search by name, strength or source number; filter by review state and saved-draft status.
- Compact mobile cards with stored source cost (private), suggested 2× selling price, proposed 2.5× compare-at reference and collapsible default description.
- Select a maximum of 20 independent source entries per operation, with clear current-status counts.
- Batch actions: **Under review**, **Hold**, **Approve for private draft**.
- Approve for draft requires an **individual checkbox attesting verification of source identity, strength, cost and supplier records on each selected entry**, plus a separate overall confirmation. It does not grant sale, public publication, content authorization or merchant eligibility.
- The server validates complete submission shape, per-row status/cost and distinct IDs, confirms exact store owner/manager membership and private store flag, re-reads all original source rows and existing draft link associations, and rejects stale/unavailable/linked/incomplete candidates before any update. Each update is optimistic on the exact expected `review_status` and `wholesale_cost_cents`, executed through existing authenticated Supabase RLS.
- Existing `supplier_candidate_review_audit` trigger automatically records status transitions; no new elevated privileges or migrations.
- Each successful action returns per-row confirmation and clear advice to follow up at `/supplier/imports/bulk-drafts` where approved-but-unsaved items can be created with zero inventory in separate, intentional batches of 10.

## Important boundaries
- Imported source descriptions and label identity are suggestions, not independently verified manufacturer batch evidence. In particular, ambiguous `FOX-04`, `SLU-PP-322`, `GLOW`, `KLOW`, `T2`, `T3` require supplier confirmation. A checkbox cannot substitute for real source documentation.
- A source being approved for **drafting** does not mean the product is eligible for sale, FDA authorized, or publicly released. No product is published, stock updated, customer catalog modified, or BTC invoice created by this PR.
- Existing private supplier image is clearly labeled **illustrative**, not certified product imagery.
- The current compare-at formula is only a proposed higher reference price. It must not be advertised as a former selling price or promotion without substantiation.
- Batch updates may partially succeed if a row changes between the initial read and the write; the UI reports actual successes and failed rows, requires refresh for fresh data, and does not claim all-or-nothing database atomicity.
- **Do not auto-approve** the 62 previously unverified source entries by running a SQL status update; their review requires accountable supplier action. No automatic public sold-out launch until each item is independently authorized for listing.

## Acceptance
- Exact-head GitHub lint, strict TypeScript, Node security/UX regression tests and production build all pass.
- Isolated PostgreSQL/RLS integration remains green with no changes to database schema or privileges.
- Preview Vercel deployment READY, then merge this private-only dashboard.
- Hosted Supabase source records remain unchanged until an authorized supplier explicitly uses the review screen.

## Next
After supplier review, create reviewed private zero-stock drafts in batches of 10, then verify each specific product image and editable description/price. Separately build a public read-only **Sold Out** projection for items whose independent release/authorization gate is satisfied. Inventory edits must never act as an implicit publication approval or bypass legally required purchase checks.
