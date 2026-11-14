# Apex dimensional multi-parcel shipping — November 14, 2026

## Customer outcome

Instead of treating *any number of items* as one $25.80 Medium Flat Rate package, Apex calculates an **estimated count of USPS packages** from the actual packed dimensions and unit weight supplied by the supplier. A cart of ten bulky items may require ten Medium boxes; the posted shipping amount sums the configured fee for each.

The existing merchant-configured prices, currently **$15 padded envelope** and **$25.80 Medium Flat Rate box**, are **Apex's own settings**, not a live USPS API/label rate. The $200.01 **post-discount** merchandise free-shipping minimum and eligible free-shipping code waive the entire multi-package customer charge. They do not remove the supplier's shipping expense.

USPS 2026 public package references: [USPS Notice 123](https://pe.usps.com/text/dmm300/Notice123.htm). Two Medium Flat Rate interior sizes are evaluated. Conservative smaller-than-published usable dimensions are used in the estimator:

- Padded envelope: usable 304 × 228 × 25 mm, **flexible/nonfragile goods only**. USPS exterior face is 12.5 × 9.5 in. Thickness is an internal conservative planning allowance, **not** a USPS published interior.
- Medium Box A: usable 279 × 215 × 139 mm (published 11 × 8.5 × 5.5 in).
- Medium Box B: usable 345 × 301 × 85 mm (published 13.625 × 11.875 × 3.375 in).
- 31,750 g per box (just below USPS 70 lb domestic flat-rate maximum). The packing approximation caps mixed-item fill to 68% of geometric box volume, and checks each object's sorted dimensions for allowed 90° rotations. It does **not** guarantee real-world fit; fulfillment must verify packaging physically.

## Supplier workflow

Go to `/supplier/shipping`. Each existing private supplier product has a **Packed dimensions and weight** form. Enter length, width, height in inches, weight in ounces, and choose whether the item is flexible/non-fragile enough for a padded envelope. The backend converts into integer millimeters and grams.

Only authenticated, confirmed **owner/manager** members of the product's private supplier store can read, create, edit, or delete private profiles. All changes go through RLS and an audit trigger with old/new snapshots. Stale-edit version checks reject concurrent overwrites. A missing profile is never guessed or pre-filled. No existing five demo products have automatically inferred dimensions.

## Quote versioning

- Existing `get_public_retail_cart_quote_source` (**v1**) remains unchanged for older clients and test contracts.
- New `get_public_retail_cart_quote_source_v2` wraps v1's exact product visibility, store, price, discount, and stock authorization. It returns profile dimensions only for the already-released quote item IDs. No direct table access is granted to `anon`.
- `/api/cart/quote` consumes v2; shared JS validates its exact schema and product correspondence. With complete profiles, server-side estimate chooses the lowest-cost safe candidate packaging plan, includes **one fee per package**, and reports package count/types.
- With **any missing profile**, the current quantity-based total is retained **only as a provisional quote**, explicitly marked in both mini cart and full checkout review. Never use it to admit a payment.
- Oversized or invalid profiles fail closed with a supplier-review message. No silent large-box price is invented.
- Package estimates are not USPS live shipping quotes, label purchases, fulfillment allocations, tax charges or proof of fit. Orders, stock reservation, delivery records, payable checkout and BTCPay/Prism remain separately disabled.

## Rollout

1. Pass the full Apex quality, lint, typecheck, build, Node shipping calculation tests, RLS supplier isolation and disposable PostgreSQL v2 quote tests.
2. Apply the versioned additive migration `20261114214000_apex_supplier_dimensional_shipping_profiles_v2.sql` while the old v1 public cart is serving traffic.
3. Confirm the new table RLS (no anon table access), new v2 function, no committed profile rows and existing order-engine gate OFF.
4. Merge the tested PR and wait for a READY Vercel production deployment. Then test supplier /shipping form with *verified real measurements* and refresh the public cart to see calculated parcel counts.
5. Check shipping fees for multiple bulky units, envelope-only items and mixed orders, discounts, and free shipping. Confirm malformed, stale, cross-supplier and oversize updates fail. Before a payable launch, make complete shipping profiles a hard requirement of order admission, and integrate actual USPS label rate/purchase evidence.

This PR has no unannounced default dimensions, no new billable products, and does not make real checkout, cryptocurrency payment or USPS shipping live.
