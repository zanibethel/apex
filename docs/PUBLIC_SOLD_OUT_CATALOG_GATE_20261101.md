# Apex public Sold Out storefront — gated design pass
2026-11-01 | Source: PR #142

## Objective
Prepare mobile-friendly customer-facing sold-out product cards for merchandise that has **independent** authorization to appear in the public catalog. This is not an authorization to sell any unapproved prescription medicines, experimental compounds, or supplier imports.

## Verified hosted state before the pass
- No products marked `is_published`, no public stores.
- No verified supplier release authorizations, no verified product release authorizations.
- The private release gate is `enabled=false` and structurally constrained to remain false until a later separately approved migration.
- 63 supplier source imports, 62 pending verification, and one saved private zero-stock draft; none currently passes customer display release.
- Private images exist in a locked storage bucket. They are **not suitable for direct use** in public cards, and the public function intentionally does not expose private object paths.

## Shipped application code
- `/catalog` uses an independent `ApprovedSoldOutShelf` component. The responsive cards present the independently released product name, description and listed USD price, clear **SOLD OUT** badges, and permanently disabled purchase buttons.
- No strikethrough or percentage discount is shown from the proposed compare-at pricing formula; this is not proof of a genuine prior market price.
- No public image yet; a placeholder is used rather than leaking the private signed supplier object URL or passing a shared illustration off as a verified product photo.
- The old RLS published-items read is preserved solely for catalog connectivity status; its rows are no longer rendered as products without separate release approval.
- The public sold-out feed is guarded by **server-only** `APEX_PUBLIC_SOLD_OUT_CATALOG=off` by default. It does not send a query unless the flag is explicitly enabled after future security, merchant and content approval.
- The fictional cart and nonpayable Bitcoin preview remain separate from the released-products section. Nothing adds real product IDs to the demo cart.

## Review-only SQL, not a hosted migration
- `database/sql/apex_public_sold_out_catalog_REVIEW_ONLY.sql` proposes `public.get_public_sold_out_catalog()`.
- Privileged internal approvals remain private; the output contains **only** product ID, name, description, USD price as text, `availability:sold_out`, and `can_checkout:false`.
- A row requires store/category/product publication flags, supplier publication intent, no admin hold, republish review approval, no same-supplier identity hold, clear content review, unexpired **verified** supplier and product authorizations, a complete description and media reference, and **actual quantity_on_hand=0 and quantity_reserved=0**.
- Most importantly, `apex_internal.private_release_gate.enabled=true` is required. The current DB has an explicit `enabled=false` CHECK constraint, so every result is an empty array until a **separate reviewed gate migration**. This PR does not remove or change that constraint.
- The SQL is NOT applied to hosted Apex. Testing is on disposable PostgreSQL with synthetic products and isolated authorization records. Positive-case tests temporarily bypass the structural gate **only in that disposable fixture**, then prove holds, missing/expired authorizations, stock and supplier intent fail closed.

## Acceptance and next steps
1. Exact-head GitHub lint, Node/TypeScript guardrails, production build and isolated Postgres security tests must pass; Vercel preview READY before merge.
2. Merge the application and review-only SQL source with the production `APEX_PUBLIC_SOLD_OUT_CATALOG` flag left OFF. This leaves a visible customer-facing *no approved products* state and safe disabled demo checkout.
3. Finish source-specific approvals for the 62 unverified variants, actual draft creation and media verification, seller and product legal authorization, separate compliant image hosting, and review of the public gallery SQL with a security specialist.
4. Only through a **separate, explicitly approved change** may the hard-disabled release gate be replaced and the public feed activated. Stock updates alone must never grant public display permission or switch on payment.
5. A future positive-stock display can indicate **in stock but not purchasable**, once public listing authorization is in place. Actual add-to-cart needs its own independent product/legal/payment-provider gates and server-side stock reservation/price re-verification.

See [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database functions security](https://supabase.com/docs/guides/database/functions).
