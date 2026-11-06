# Apex supplier order review drill-down — November 6, 2026

## What this adds

From **Supplier → Orders & Fulfillment**, open **View original record** on a saved held order. Paginated held-order records offer the same link. The page reads one existing immutable order ID, not a generated copy or new order.

Route: `/supplier/orders/[orderId]?store=[storeId]`.

All user-supplied identifiers are validated. The server checks the current Supabase Auth session, confirmed email, assigned supplier storefront, and an RLS-protected membership-scoped RPC. The PostgreSQL function cross-checks the immutable held-order record against the original recorded sale identity, timestamp, amount, currency, and observed state. Wrong-store IDs, missing orders, release-gate activation, unauthorized callers and conflicting source data fail closed.

## What the supplier sees

- Original order reference and immutable order ID.
- Original saved purchase timestamp (Central Time display).
- Original recorded sale observation, **not proof of independent payment finality**.
- Number of stored line snapshots (without item names, SKU, prices, quantities or lines).
- Existence of a sealed delivery record, **without addresses or keys**.
- Explicit **Held · not shippable** status and links to reports.

No new order ledger. No data writes. No product-identity matching. No invoice, shipping label, order delivery decryption, postage, tracking, fulfillment or public release action.

## Evidence and test requirements

- SQL function `public.get_supplier_held_order_record(uuid,uuid)` returns a strict minimal JSON shape for existing authenticated supplier members only, backed by private immutable data in `apex_internal`.
- Client parser rejects extra fields, inconsistent store/order identities, invalid dates, unsafe counts and every unexpected release flag.
- Disposable PostgreSQL suite verifies member-only access, cross-store denial, anonymous denial, zero purchase-item/recipient exposure and no durable test data.
- CI Node guardrails, TypeScript, lint, production build, Vercel preview and isolated RLS must pass before merge.
- The global public release gate remains disabled. Real order eligibility, signed provider settlement evidence, legally authorized product fulfillment, shipment state transitions, carrier connections and order-detail line read remain independent future tracks.

## Follow-up

Define an independently authorized, versioned order-detail read contract for genuinely eligible products and purchases. Separate commerce from source-history observations. The final supplier dashboard should eventually support per-line partial fulfillment, tracking and idempotent CSV updates, but none of these should be enabled from held, unverified data.
