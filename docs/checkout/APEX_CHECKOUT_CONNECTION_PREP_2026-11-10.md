# Apex checkout connection preparation — 2026-11-10

Repository: `zanibethel/apex`. Existing Apex Supabase and one shared BTCPay store.
This increment is **read-only and non-transactional**. No additional product restrictions,
supplier approval obligations, database migrations, or new checkout gates are introduced.

## What changed
- Added an authenticated platform-admin `/admin/checkout-integration` overview.
- Reuses the already reviewed storefront-list RPC, retail-display gate, held-order
  journal RPC and BTCPay Greenfield **read-only** probe.
- Connects status reporting across Track 1 catalog/quote, Track 1 → Track 2
  canonical handoff, held-order journal, one shared BTCPay store, payout recipient
  directory, Prism synchronization, and customer endpoint.
- Shows an ordered next integration task and direct links to existing admin tools.
- Does not display API tokens, wallet destinations, HMACs, user PII, or private
  product evidence. Cannot change production state.

## Existing code and protections unchanged
- `src/app/api/checkout/handoff/v1/route.ts` still responds HTTP 503 and
  `CHECKOUT_UNAVAILABLE` without reading the request body.
- `apex_internal.private_release_gate` remains independent and disabled.
- Supplier publishing and current catalog checks are unchanged; **no new** keyword,
  category, or product restrictions are added.
- The existing retailer showcase is not a purchasable product feed.
- `src/lib/checkout/track1-to-track2-adapter-v1.mjs` and
  `src/lib/payments/checkout-order-handoff-v1.mjs` remain server-only validators.
- Provider readback and recipient directory status are not invoice permission
  or independent proof of wallet control.

## Next development
1. Complete one-provider-store read-only BTCPay connection and verify the
   one Apex / Lily / Tierra recipient directory and independently controlled wallets.
2. Agree on an explicit versioned cart/order contract backed by an atomic, server
   authoritative product eligibility, price, inventory and shipping transaction.
   Resolve the retail-display versus legacy quote schema mismatch without inventing
   automatic product rules.
3. Implement test-only, idempotent order/invoice handoff, signed provider evidence,
   reconciliation and replay/timeout recovery with disposable BTCPay regtest fixtures.
4. Verify Prism split accounting and rollback for the agreed configurable 3-way split.
5. After product/merchant authorization and technical acceptance, separately decide
   on controlled production checkout release. **Do not enable live checkout here.**

## Verification
- Run `npm run check` and the existing isolated PostgreSQL integration suites.
- Run `node --test tests/checkout-connection-readiness-v1.test.mjs`.
- Manual admin smoke: `/admin/checkout-integration` returns real, read-only status
  and links, while an unauthenticated session redirects to `/admin/sign-in`.
- Verify `POST /api/checkout/handoff/v1` still returns the non-admitting 503,
  the cart checkout button remains disabled, and no invoice or payout is created.
