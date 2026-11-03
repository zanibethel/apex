# Apex — private server-priced destination charge estimate (PR #194)

## What this pass implements

On the existing admin-only `/admin/checkout-review` screen, select a saved product and quantity, then enter a **U.S. state**, **ZIP** and **optional discount code**. Click **Recalculate saved charges**. The estimate is computed from data re-read from Supabase in one admin-only database RPC:

- Stored product ID and current USD unit price, quantity, default-on or unchecked `collect_sales_tax` flag and current inventory observation.
- Private store's optional flat shipping fee and automatic free-shipping threshold.
- Exact promotion record scoped to that store (percentage, fixed-dollar or free-shipping), including active status, usage limit, start/end dates and minimum subtotal. Unknown/ineligible codes fail closed.
- Merchandise discounts are applied before the automatic free-shipping threshold. A valid free-shipping code waives the fee without changing merchandise prices.
- The browser's displayed subtotal is used **only to detect staleness**, never as the authoritative charge.
- The result shows saved merchandise, promotion discount, shipping fee, waiver, provisional taxable merchandise, **before-tax estimate** and a clear **Final total not available** indicator.

The endpoint checks the signed-in user's trusted Supabase `app_metadata.apex_role=platform_admin`; the underlying RPC validates `auth.uid()` and that the store and product are private. Anonymous/supplier calls are denied, no privileged keys are exposed. The RPC returns a read-only snapshot and literal `can_quote_final_total=false`, `can_reserve_stock=false`, `can_create_order=false`, `can_create_invoice=false`, `can_pay=false`. No order, invoice, payment or coupon redemption is written.

## What requires a real tax provider

A state and ZIP format are **not evidence that the ZIP belongs to that state**, nor proof of tax nexus, seller/product eligibility, exemption or shipping taxability. A checked **Collect sales tax** product flag is internal configuration, not a tax rate. An unchecked flag does not establish a legally valid exemption.

Until an authoritative provider is connected and has verified the shipping address, seller nexus, taxability of each product and shipping charge, discounts and any exemption documents, the service **never fills in a tax amount or final payable total**. It does not use a hard-coded Texas rate or a client-calculated amount. There is no invoice POST or shopper checkout route.

A future separate provider adapter should:
1. Normalize/validate country, state, ZIP and full destination using trusted data; no delivery details are persisted by this private form.
2. Send only approved seller and product tax classifications, discounts and shipment facts to a selected, authenticated tax engine, using server-held credentials.
3. Verify provider response belongs to the *exact cart fingerprint*, destination, store, currency, discount and shipping amounts; verify response signature/source and expiration. Fail closed on any mismatch, stale quote or unavailable provider.
4. Capture jurisdiction and line/shipping tax breakdown, issue/expiry, exemption reasoning and revision in an immutable server-side tax quote; only then permit an internally verified full total in a **separately authorized** workflow.
5. Recheck inventory/eligibility/price/tax in the same order-reservation transaction, and validate payment eligibility before any invoice is created.

## Tests and deployment gate

- SQL: `tests/payout-rls/admin-destination-charge-source.sql` exercises actual PostgreSQL roles, forged JWT metadata denial, anonymous denial, cross-store product rejection, stale saved pricing, changed tax flag and shipping policy, store-scoped promotion retrieval and no order or provider journal writes.
- Node tests: `tests/admin-destination-charge-pr194.test.mjs` exercises destination syntax, checkout amount order, shipping thresholds, free-shipping codes, failed/revoked promotions, stale price warnings, all permanent checkout holds, malformed source results and refusal to fabricate a tax total.
- Admin UI does not send customer names, email, phone, street or payment data to the quote action; only the two-letter state and ZIP are needed to prepare the later tax quote.
- Apply migration only after exact-head CI and preview verification. Keep public catalog release gate disabled, all product stock unchanged and real checkout unavailable.

**Result:** a near-complete, server-priced private checkout estimate with a precise verified-tax integration boundary, **not** a tax quote or a completed customer checkout.
