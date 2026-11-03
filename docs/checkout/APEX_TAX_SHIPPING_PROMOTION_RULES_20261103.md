# Apex checkout configuration — tax flags, optional shipping, free delivery (PR #193)

## User-visible controls

**Supplier product manager** `/supplier/catalog/bulk`:
- Every existing and new product defaults to **Collect sales tax: checked**.
- Each saved private product card has its own **Collect sales tax** checkbox.
- Select multiple saved cards with the existing checkboxes and use **Collect sales tax on selected** or **Do not collect sales tax on selected** (up to 50 IDs at a time).
- Settings save immediately through a store-bound, authenticated, audited database RPC. No product listing, inventory, approval, or price changes are performed.
- The existing product detail save/CSV upload does not overwrite the tax flag. New draft products retain the default-on setting.

**Admin controls** `/admin/checkout-rules`: browse private Apex products, select several for bulk collect/do-not-collect, toggle single-product flags, and edit store shipping settings. This is backed by a verified-admin-only readback RPC.

**Supplier shipping** `/supplier/shipping`: configure no shipping charge, or a flat USD fee plus an optional minimum merchandise subtotal for free shipping. Save requires private-store owner/manager membership or the verified platform administrator. All changes are audited. No settings row means **shipping fee off**.

**Discount codes** `/supplier/discounts`: existing percentage/fixed codes continue working. The new **Free shipping** benefit has no merchandise discount amount; it waives the configured shipping charge when the code is active and meets any minimum, date, and usage restrictions. The supplier code-preview action now reads the saved shipping policy to show the amount before sales tax. It makes no order and does not redeem the code.

**Private Admin checkout review** `/admin/checkout-review` displays saved product tax-collection flag and configured shipping/pre-tax preview. Actual tax remains pending jurisdiction verification and Bitcoin checkout stays blocked.

## Calculation order

1. Trust only server-read product prices, per-product `collect_sales_tax`, shipping policy and validated promotion record. Reject missing or non-boolean tax flags.
2. Merchandise subtotal = sum(price × quantity) using integer cents.
3. Apply **one eligible** fixed/percentage promotion to merchandise. An eligible `free_shipping` promotion has merchandise discount = zero.
4. Compare **discounted merchandise subtotal**, before tax/shipping, with the free-shipping threshold. A valid free-shipping code independently waives the shipping charge regardless of threshold. A shipping-disabled policy costs zero.
5. Taxable merchandise base uses only lines with `collect_sales_tax=true`, adjusted proportionally for merchandise discounts in this **private preview**. This is a provisional base, **not a legal tax determination**.
6. Tax **cannot be finalized** from the checkbox or a guessed flat rate. Final sales tax may depend on destination, product classification, discounts, shipping taxability and tax nexus. A future verified tax provider/jurisdiction service must supply an authoritative quote before enabling real orders.
7. The private calculator therefore returns `taxCents=null`, `totalCents=null`, `canPlaceOrder=false`, `canCreateInvoice=false` even when a shipping/pre-tax preview exists.

Unchecking **Collect sales tax** records a configuration preference for potential exemption/non-taxability, **not** proof of an applicable legal exemption. Verification before payment is required. A tax-setting change invalidates prior private product reviews when the release-review invalidation function is installed.

## Database protections

Migration `20261103193000_apex_private_checkout_charge_settings.sql`:
- Adds default-on `public.products.collect_sales_tax`.
- Adds private shipping settings and append-only-intent audit tables with RLS and no direct authenticated write grants.
- Adds bounded, atomic `set_bulk_product_tax_collection` and `save_private_store_shipping_settings` RPCs with strict actor/store checks; read-only `get_admin_private_checkout_rules_overview` is platform-admin only.
- Expands the pre-existing promotion constraints to allow `free_shipping` with sentinel `discount_value=1`, preserving all existing percentage/fixed codes and RLS.
- Does not grant public catalog or checkout access or change product stock, BTCPay credentials, invoice submission, order journals, or supplier splits.

## Tests and rollout

The Node tests verify taxable/non-taxable line arithmetic, free-shipping codes, minimum thresholds **after merchandise discounts**, disabled shipping, invalid policies, and the absence of any final payment total. Disposable PostgreSQL checks default-on flags, role denial, cross-store enforcement, duplicate IDs, audit/no-op behavior, free-shipping database constraints, and intact release/payment gates.

Release this configuration only after exact-head tests, Postgres suite, Vercel preview, then migration and live database verification. This does not authorize real sales.
