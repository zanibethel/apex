# Apex — product tiles, header mini cart and full checkout review

November 14, 2026. Production target: https://apexanabolics.co

## Customer behavior
1. Each supplier-published product tile shows its image, name, short product description and listed price. A link opens complete product details. A sold-out product still shows its price and a **Sold out** action that explains **Out of stock — cannot be added to your cart** if tapped. It does not add anything.
2. When an in-stock listing is added, the cart icon in the header shows the item count. Tapping the icon opens a small overlay, **not a navigation to a cart page**. It contains selected lines, quantities, current server-verified prices, stock errors and actions to change or remove items. Clicking outside, pressing Escape or using Close dismisses it.
3. The overlay calls the existing `POST /api/cart/quote` with the current cart and selected code, and shows merchandise subtotal, discount, automatic USPS shipping and **estimated total**. The preview never trusts a price sent from the browser. A changed item, quantity or discount invalidates the last displayed quote until a fresh response arrives.
4. The optional discount entry starts blank and requires **Apply**. Its 3–24 character letters/numbers/dash/underscore validation matches the existing customer cart. The server validates whether the promotion is actually saved and eligible. Applied codes can be removed.
5. The **Checkout** CTA opens `/checkout`, the full checkout review: item quantities, discounted estimates, shipping and the existing delivery-information review. The same discount code is carried through the shared cart context. `/cart` remains available for existing links.
6. This **does not enable buying**. Current checkout admission flags, private order engine, BTCPay/Prism, shipping labels and settlement remain unchanged. All five existing demonstration products remain Sold Out. A saved item that becomes unavailable displays an error and cannot proceed to an actual payment.

## Implementation boundaries
- Client cart selection remains local in `CustomerCartProvider`; only product UUID and quantity are saved in local storage. Discount code remains in in-memory context, not local storage or an order.
- Mini cart uses only `/api/cart/quote`, with abortable no-store requests. Responses must match the latest cart/discount request before displaying. No authorization flag from a quote can create an order.
- Full checkout reuses the existing gated `CartPage` server component. `POST /api/checkout/handoff/v1` remains HTTP 503, and the private nonpayable route remains independently default off.
- No schema changes, inventory mutations, admin privileges, payment credentials, migrations or new dependencies.
- Security regression tests cover denied checkout, discount normalizer, out-of-stock feedback, stale stock, popup interactions and shared-code handoff.

## Manual verification after deployment
- On a phone, open the catalog. Confirm name, description, image and price on each tile. Tap Sold Out: an understandable error should appear and the cart count must not change.
- Tap the cart icon. Verify an empty mini-cart, accessible close button, and no redirect.
- With an approved in-stock listing when one becomes available, add it, change quantity, verify server price and shipping totals, enter and apply a real promo code, remove it, and confirm out-of-stock changes show an error. Do **not** publish or increase inventory just for this UI test.
- Tap Checkout; confirm `/checkout` opens the full review and retains the applied code, but payments remain unavailable.
- Verify outside-click and Escape dismissal; ensure the popup fits a mobile viewport without horizontal scrolling.
- Confirm private order engine OFF, no retail holds, and existing demo inventory unchanged using **read-only** database checks.

The current five-demo production state supports testing the sold-out tile and empty-cart interactions. Full in-stock interactive proof requires an independently approved real-stock product or a later isolated browser QA fixture; automated tests validate the rest without modifying production.
