# Apex supplier purchased-line review and partial-quantity preview
Date: November 6, 2026

## Scope

This is the next verified foundation after PR #299's exact-order identity page. It introduces a protected read of **purchase-time order-line snapshots**, attached to the already authenticated `/supplier/orders/[orderId]?store=...` page. The source is not the current mutable product catalog.

The user may preview a **partial quantity allocation**, for example 1 of 2 units on line A and 0 of 1 on line B, but **this is a local what-if view only**. It does not save a fulfillment request, update a stock reservation, initiate USPS, create a label, decrypt an address or send email.

## Single-order read contract (version 1)

`public.get_supplier_held_order_lines(p_store_id uuid,p_order_id uuid)`:

- Requires a signed-in non-anonymous supplier membership in the requested store and the global release gate to be off.
- Uses the exact immutable `order_detail_snapshots` order ID and `order_line_snapshots` rows scoped to that supplier store.
- Compares the original order reference, purchase date, recorded status, gross amount and currency against the matching historical sale.
- Rejects records where the order, any line or the delivery envelope appears independently authorized or no longer in held state.
- Returns at most 50 lines, ordered by saved `line_number`, and never includes PII, keys, raw ciphertext, source hashes, wallets or payment secrets.
- Returns saved SKU/title/variant, integer quantity, purchase-time unit/subtotal amounts and a hard-coded held/no-shipping state. These values cannot be changed by later catalog edits.
- Returns `null` for a missing original order in an authorized store. Never infers zero lines from a failed RPC.
- Uses strict allowlist parsing in `src/lib/supplier/held-order-line-review.mjs`. The parser requires the line count to equal the independently checked header count and verifies each subtotal and duplicate-free ordered identity.

## Supplier UX

Orders & Fulfillment → **View original record** now displays original purchase-time lines if the protected source exists. It shows an honest error if record integrity or RLS cannot be verified. For each verified saved line it shows:

- Product title, SKU, option and purchased units.
- Price and subtotal **at time of purchase** (never the current catalog amount).
- An optional quantity-to-consider input for future partial fulfillment.

The what-if total comes from the existing `summarizeReviewAllocations` pure helper (no allocation writes), with explicit remaining units. No operational buttons are wired to the inputs; reload clears them.

## Safety and release

The source is intentionally still `held_unverified`: not legal eligibility, payment settlement, authorized fulfillment or customer address access. Nothing here enables live product publishing, charging, refunds, order ingestion or shipping.

This RPC is intentionally a narrow, audited `SECURITY DEFINER` because the private order snapshot tables have no Data API grants. It has a fixed `pg_catalog` search path and explicit authenticated membership checks. `anon` EXECUTE is revoked. Inspect Supabase security advisor flags carefully: the advisor lists API-exposed definer functions by design, so verify the membership checks and no secret fields rather than assuming it is permissionless.

## Verification and follow-up

- Node parser, data integrity, partial allocation and UI wiring tests.
- Disposable PostgreSQL tests: supplier-specific line reads, wrong-store rejection, anonymous denial, original saved prices and quantities, no key/address leaks and no real record persistence.
- Exact PR head lint, TypeScript, guardrails, build, isolated RLS and Vercel preview.
- Only after CI passes, install the reviewed RPC on production, verify anonymous denial and release-gate unchanged, merge and verify main deployment.
- Next track: independently authorized *eligible* order-line reads; protected delivery contract; immutable per-line shipment ledger, stable shipment IDs, versioned partial quantity transitions, duplicate-safe tracking events and CSV synchronization, USPS merchant authorization. These must be designed separately from held orders and may not be unlocked by a supplier checkbox or recorded sale status.
