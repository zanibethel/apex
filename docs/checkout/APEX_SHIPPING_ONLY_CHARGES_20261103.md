# Apex checkout — merchandise, discounts and optional shipping only (PR #196)

## Product behavior

This document supersedes the earlier tax-collection UI and TaxCloud integration design in PRs #193–#195.

The Apex checkout estimate now uses only:

1. Server-saved merchandise (unit price × quantity).
2. One validated merchandise discount code, if entered.
3. Optional **flat shipping**, configured per private storefront by its supplier owner/manager or verified Admin.
4. **Free shipping** automatically when the discounted merchandise subtotal meets the configured minimum, or when an eligible **free_shipping** promotion code is applied.
5. **Estimated total** = discounted merchandise + shipping.

No tax input, tax checkbox, tax API provider connection, tax amount, tax claim, or TaxCloud call is part of the order-summary screen or the shipping-only estimate. The same shipping/discount rules are available through the Admin and supplier workspaces.

## Management screens

- Supplier: `/supplier/shipping` sets the optional fee and free-shipping threshold; `/supplier/discounts` creates, edits, activates and previews private discount/free-shipping codes.
- Admin: `/admin/checkout-rules` manages the same shipping fee and threshold; `/admin/shipping-promotions` manages the same store's promotions.
- Supplier product cards have **no Collect sales tax** checkbox or bulk tax workflow.
- `/admin/checkout-review` shows merchandise, shipping and estimated total, with a promotion-code preview.
- The provider-specific `/admin/tax` page and TaxCloud API connector have been removed.

## Security and compatibility

Migration `20261103223000_apex_shipping_only_checkout.sql` replaces the verified Admin-only private checkout readback with a versioned shipping-only schema (v2). It omits all tax fields, preserves current item pricing, private store scope, active discount-code readback, inventory observation, and explicit `can_create_order=false`, `can_create_invoice=false`, `can_reserve_stock=false` and `can_pay=false`.

The migration revokes API access to the old tax checkbox/overview functions and **does not drop** the legacy product tax column or tax audit records; those remain in private storage for historical accounting review, without participating in checkout. The newer shipping settings and existing merchant discounts remain available.

The migration also fixes missing `authenticated` INSERT/UPDATE grants on private promotions and adds separate verified Admin row-level policies. Existing supplier owner/manager policies continue to constrain supplier-managed codes. An unrelated authenticated user remains denied by RLS, and no anonymous write permissions are added.

## Order/payment boundary

This pass **does not** enable purchasing, checkout admission, payment, invoices, BTCPay wallet forwarding, or inventory reservations. A displayed estimate is a pricing preview only; actual shippability, permitted product sales, fulfillment and payment availability remain separate prerequisites.

## External taxes and accounting

Excluding a tax-calculation line or API from Apex does **not** establish that products, merchants or transactions are exempt. The supplier/platform must separately determine and handle any tax obligations in consultation with a qualified professional. **Texas rules can require collection on taxable online sales** and may require specific documentation or invoicing if taxes are included in listed prices. Do not market prices as tax-exempt, tax-free, or already tax-inclusive without appropriate verification.

Superseded historical artifacts remain in Git history for traceability. No TaxCloud subscription or credentials are needed to operate the shipping settings.

## Private checkout review UX — PR #197

The Admin-only review displays an unpromoted baseline and then a separately verified
server-priced recalculation after entering a merchandise or free-shipping code.
When a configured flat shipping fee applies and a free-shipping minimum exists,
the interface displays the additional **post-discount merchandise** needed to
qualify, never a made-up shipping discount. When the minimum is met, the saved
shipping fee drops to zero. When shipping is disabled, the summary says free
shipping is the current default; no minimum is implied.

The two amounts are deliberately labeled separately:
- **Before discount code** is calculated from the already loaded saved store policy.
- **Estimated total** is computed from a new Admin-authenticated database read of
  saved product price, promo record, shipping settings and quantity.

Both are explicitly preview-only. Changing quantity/product remounts the promo
form and invalidates its previous calculation. No customer payment is enabled.
No changes are made to merchant shipping fees, thresholds or promo codes by
this PR.

Shipping progress is computed in integer cents using the same
`quoteOptionalShipping` helper that computes the fee; it is absent when no
free-shipping minimum is configured. The supplier/Admin shipping form no
longer references collecting sales tax or destination tax calculations.
