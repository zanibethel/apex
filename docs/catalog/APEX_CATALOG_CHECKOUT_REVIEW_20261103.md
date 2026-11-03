# Apex catalog organization and production-style checkout review — 2026-11-03

## Real Apex Supabase catalog update (executed)

Authenticated connected operator maintenance against project `fhqpkpztercadcxspdkg`, original private store `bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3`. The owner explicitly requested catalog organization and continued editability.

- Read the previously merged exact 63-product taxonomy CSV, validated every immutable ID, SKU, and title against the live 63 products. Zero identity mismatches, zero category conflicts.
- In one atomic PostgreSQL transaction, created **eight** missing research categories as unpublished and assigned **49** exact reviewed products to those categories, marking those 49 private records active. Retained the original GetSwole category and active variant.
- Kept **13 identity/composition/strength-review** variants uncategorized and inactive. No identity correction or regulatory/product eligibility was presumed.
- Readback: 63 products, **9 categories**, **50 categorized**, **50 active**, **63 zero-stock**, **0 product published**, **0 category published**. Source cost, USD retail/compare-at pricing, product names, descriptions, SKUs, and images were not overwritten.
- Existing `apex_internal.capture_catalog_audit` triggers recorded **8 category INSERT** and **49 product UPDATE** events. This connected owner maintenance operation did not impersonate an authenticated admin or supplier; the trigger's `actor_id` can be null for operator SQL. Future edits should normally use authenticated supplier/admin actions.
- No supplier Publish intent, admin hold, source approval, verified release evidence, global gallery gate, checkout, payment or wallet was changed.

**This is not public product publication.** The released product feed and payment flow remain separately gated.

## PR #185 — private production-style checkout review

- Add authenticated admin route `/admin/checkout-review` from the existing real storefront preview.
- It uses real 63-product record names, categories, prices, images, and zero-stock values from signed-in Supabase RLS. It presents the two-stage customer information / Bitcoin handoff layout, with a browser-only form and payment handoff clearly disabled; no server quote, orders, invoices, addresses or payment status are invented.
- Saved compare-at references are shown **only as references**, not proven markdown discounts. Short descriptions can be expanded to full details in existing product tiles.
- The legacy sample checkout is unchanged; the new real-data route is the primary admin review path. Product/source cost data never becomes public through this route.
- No payment SDK, BTCPay key, or public checkout activation. A live BTCPay integration additionally needs a real provider instance, exact store binding, least-privilege keys, wallet/webhook configuration, verified signed settlement and reconciliation, and independent approval of customer-facing products.

## Owner review links

- `/admin/storefront-preview` — private real product tile review.
- `/admin/checkout-review` — private production-style buyer flow review.
- `/supplier/catalog/bulk` — change prices, titles, descriptions, categories, inventory and images.
- `/admin/catalog-release` — see actual release eligibility, not just supplier intent.

Production release remains a separate audited decision. No payment processing should be activated by this review pass.
