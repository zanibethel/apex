# Apex reviewed-source batch draft preparation — 2026-11-01

## Source state and purpose
The hosted Apex source queue has **63 imported variants**, of which **62 were still unverified** and one was already approved and linked to a saved private product at last read. It would be incorrect to pretend that all 63 source records are validated, approved or publicly purchasable. This pass does not edit their review states, public flags or customer checkout.

## New supplier workflow
- `/supplier/imports/bulk-drafts` requires a verified signed-in supplier **owner or manager** with exactly one private assigned store.
- Reads the complete per-store source candidate queue and existing one-to-one draft links. Displays truthful counts for previously saved, awaiting review, ready for draft, and malformed source rows. Rows remain private with robots noindex.
- For individually reviewed `approved_for_draft` **unsaved** entries, the supplier can explicitly select a batch of up to 10 entries and confirm. No unverified, held, under-review, duplicate or invalid item can be added through this bulk action.
- The server re-reads each selected candidate and recalculates from the **database cost**, never the submitted client price: proposed sell 2×, proposed compare-at 2.5×, rounded to the nearest cent upward. The app supplies a neutral, source-specific **editable** default description, generated SKU and exactly **zero initial stock**.
- Each draft uses the existing `create_draft_from_candidate_with_compare` RPC, which invokes the database's authenticated RLS-scoped atomic `create_draft_from_supplier_candidate` function for product+zero-inventory+one-to-one source association. Existing RPC separately rechecks `approved_for_draft`, store membership, unique SKU and draft-only status.
- After successful draft creation, the action attempts to populate the private `internal_source_cost_cents` column and clearly warns if it could not be confirmed. Since the atomic source-to-draft link remains, source provenance is preserved even if this supplemental edit fails.
- Batch results show exact created/failed counts and links to private product cards. The saved product editor continues to allow editing descriptions, pricing and inventory.

## Images
One currently stored uploaded image is product-specific. A photo attached to that item should **not automatically be misrepresented as another product**. The existing private 63-card gallery continues to show it as a shared illustration. Newly saved product rows may reuse images through the existing explicit, authorized `Choose existing image` feature (separate private copy), or upload an accurate image in product management. This pass creates no public storage objects or new public image links.

## Authorization and publication
- Every created product remains unpublished, store is private, stock=0. The import's source review state is unchanged. The bulk button does not approve unverified variants.
- A supplier changing inventory does **not** auto-publish or create purchase authority; legal/product authorization, independent admin release and a separate verified checkout/payment flow remain required.
- Suggested compare-at prices are **not substantiated former selling prices** and must not become promotional percentage claims without an actual validated reference price.
- No real product is added to the demo cart; BTC checkout and orders remain disabled.

## Acceptance
- Exact-head lint, typecheck, Node tests, Next.js build, isolated DB/RLS suite and Vercel preview must pass before merging.
- No need to pay for a separate Supabase project. No database migration, new role, bypass or live payment code.
- After release, supplier still needs to individually verify and review the remaining 62 before they become eligible for bulk draft creation; no accidental "one click approve all" action.
