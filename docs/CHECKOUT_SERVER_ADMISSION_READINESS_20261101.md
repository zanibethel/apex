# Apex — checkout admission readiness (first server-side preparation pass)
November 1, 2026 | **Review-only**

## Why this pass exists

Apex's public catalog currently reads only `id,name,description`. It does **not** expose authoritative purchase prices or verified sellable stock. Supplier publishing intent is a separate private workflow; it does not make a product public or purchasable. `database/sql/apex_private_release_decision_engine_REVIEW_ONLY.sql` intentionally returns `effective_public:false` and holds the public release gate off.

Therefore we **cannot safely add real supplier product IDs to the customer cart or convert the demo cart into an ordering flow yet**. A browser cannot be trusted for item eligibility, product prices, discounts, remaining stock, or payment routing.

## Delivered in this pass

- New admin-only, read-only page: `/admin/checkout-readiness`, linked from the authenticated platform admin dashboard.
- Reads up to 40 recent private supplier listing controls, in batches of 8, calling the **existing authenticated** `get_private_release_readiness` Supabase RPC for each. Missing RPC/permissions/error/partial result fails closed.
- Presents verified private readiness checks: supplier request, admin hold, normalized identity conflicts, content review, required product setup, private available stock, independently verified supplier authorization, independently verified product authorization, and the structural public release gate. These are **prechecks**, NOT transaction eligibility.
- `src/lib/checkout/private-cart-readiness.mjs` enforces the private response schema and always returns `canAddToRealCart:false`, `canQuoteRealProduct:false`, `canCreateOrder:false` and `canCreatePayment:false`, even if a crafted payload marks all private checks true. Only `demo` and `disabled` are accepted as display states.
- New unit and authorization regression checks for malformed/forged snapshots and admin-gated page source.

## Admin controls and scope

This page has no buttons to activate sales. Platform admins already use `/admin/listing-controls` for holds/reviews and supplier owners/managers use private publication intent; those controls continue to have no effect on real checkout.

Only the existing fictional **Demo Shirt and Demo Bottle** can be added to the current customer demo cart. `APEX_CHECKOUT_MODE=demo` still allows the UI demonstration only, not real money. No real product prices, wallet details, checkout endpoints or orders are made available to customers by this pass.

No hosted Supabase schema was altered; the existing private release RPC is read-only and user-authenticated, **not a service-role bypass**.

## Subsequent gated passes

1. Obtain independent signoffs on merchant eligibility and on which products can legally be sold, including product-specific authorization and any payment-provider restrictions.
2. Define an explicit public-sellable product read model (approved supplier/store/category/product states, verified inventory, tax/shipping rules, currency and immutable price revision). Add RLS and a trusted server-side validator that re-fetches **every** cart line by ID and fails closed; do not accept submitted client prices.
3. Implement an unpayable, server-calculated quote preview with currency-safe integer arithmetic, quantity caps, price-change notices and expiry. Only after verification connect eligible items to the customer cart.
4. Introduce a separate protected order intent and payment provider transition after independent provider approval, anti-duplicate/timeout recovery, controlled checkout activation, reconciliation and administrative signoff. Do not infer readiness from the isolated experimental BTCPay/Prism PRs.

**Acceptance:** exact-head application quality and isolated PostgreSQL security checks pass; keep PR draft and unmerged pending review. No payment configuration or live storefront code path is activated by this pass.
