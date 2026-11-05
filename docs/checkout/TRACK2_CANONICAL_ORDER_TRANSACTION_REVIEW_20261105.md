# Track 2 — Canonical order transaction compatibility review (November 5, 2026)

**State:** Architecture checkpoint only. This document is not an authorization to activate checkout, accept payment, write customer orders, reserve real inventory, or ship a product. Hosted release gate stays disabled.

## Verified current boundaries

| Component | Existing behavior | Consequence for future integration |
| --- | --- | --- |
| Track 1 browser transport, PR #255 | `POST /api/checkout/handoff/v1` is intentionally 503; the server-only adapter validates and maps to Track 2 without granting order or payment authority | Do not enable the route until independent authorization, atomic admission, rate limiting, and privacy controls are reviewed |
| Track 2 server handoff, PR #251 | Holds validated selections, canonical request and cart fingerprints, but has no database writer | These hashes are request identity, not saved prices, stock, or sale evidence |
| `apex_internal.checkout_order_intents`, PR #188 | Immutable `held_no_payment` private journal with no customer-order API and no stock reservation | Cannot be treated as a completed order or the sole source of item lines |
| `apex_internal.order_detail_snapshots` and `order_line_snapshots`, issue #214 | Historic-sale snapshots are constrained to an independently recorded `supplier_sales_history` row | A new checkout cannot insert these records without a separate trusted sale source and lifecycle design |
| `apex_internal.order_delivery_envelopes`, PR #259 | Encrypted bytes, key reference, 12-byte nonce and 16-byte tag are bound to a specific store and canonical order ID | The order ID must be chosen inside a trusted, unit-of-work boundary *before* its delivery envelope is sealed; an unauthenticated client-supplied ID is not acceptable |
| Reservation fixture, PR #191 | Disposable PostgreSQL transaction tests demonstrate row locking, retry handling and rollback, but include a historical tax quote | It is not a production checkout writer and does not match the current shipping-only policy |
| Supplier held-order headers, PR #245 | Supplier-scoped, read-only held identity and timestamps | Track 3 must not infer payment, decryption, shipping or new-order rights from these rows |

## Recommended next implementation boundary (requires separate approval)

1. **Resolve order provenance:** define a distinct canonical customer-order ledger and immutable line records. Do not overload the historical sale snapshot model or insert fabricated `supplier_sales_history` rows.
2. **Bind identity and encryption:** generate the canonical ID inside one trusted transaction/session, seal normalized delivery with approved application-managed keys for that exact store/order identity, and commit the encrypted envelope with the line snapshot. No plaintext delivery fields in logs, invoices, URL parameters or public tables.
3. **Keep pricing authoritative:** reread supplier-scoped product eligibility, administrative holds, exact current stock and saved prices under deterministic row locks. Recalculate promotions and optional shipping on the server, with strictly-over-threshold free shipping where configured and **no checkout tax**. Never trust browser quote amounts.
4. **Prevent duplicates and oversell:** serialize retries by store and server-generated request identity; reject changed fingerprints on repeated IDs; atomically reserve quantities and save immutable purchase-time lines. Transaction failures must roll back all writes.
5. **Do not fuse checkout with settlement:** a held order alone may never call BTCPay, mark itself paid or authorize shipping. Provider invoice creation, signed webhook validation, independent provider readback, payout allocation, refunds, and supplier fulfillment remain separate reviewed workflows.
6. **Enforce privacy and role access:** private tables must remain inaccessible to `anon` and `authenticated` direct writes; supplier views must be scoped and avoid exposing encrypted envelopes or decrypted destinations until purpose-specific authorization and audit are implemented.
7. **Test before any deployment:** disposable database integration tests should include multiple-line carts, price/stock races, administrative holds, coupon limits, free shipping, rollback on errors, idempotent retries, cross-store denial and encrypted envelope integrity.

## Known incompatibilities to resolve

- Track 1 allows up to **20** distinct products in a review cart; Track 2's existing validator and reservation fixture cap checkout at **8**. Reject rather than truncate unsupported carts until capacity is deliberately aligned.
- Track 2's held readback verifies identity formatting; it does not verify that a database has performed an authenticated atomic transaction.
- The historical `order_detail_snapshots` sale-FK validation is not a source of authority for a new browser checkout.
- Existing synthetic tax-quote reservation assertions are historical tests only. The current policy has **no sales-tax calculation in checkout**.

## Release posture

No new hosted migration, checkout writer, BTCPay invoice POST, payment release, stock mutation, supplier shipping detail projection, email delivery action, or carrier purchase is introduced here. Production `apex_internal.private_release_gate.enabled` remains `false`. Technical review must not be confused with authorization to sell or ship regulated products.
