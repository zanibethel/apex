# USPS Flat Rate shipping — November 3, 2026

## Customer pricing
- USPS Priority Mail Small Flat Rate Box: **$14.65** per shipped order.
- USPS Priority Mail Medium Flat Rate Box: **$25.80** per shipped order.
- Merchandise discounted total **over $200.00** (from **$200.01**) receives **free shipping**, regardless of box size.
- Exactly $200.00 does **not** qualify.
- A valid free-shipping discount code can waive Small or Medium postage below $200.01.
- Only one box rate is charged per current checkout estimate; fulfillment must verify that all items actually fit the selected package. Multiple-box orders are not priced automatically in this iteration.

USPS retail rates are from USPS Postal Explorer, Notice 123, effective October 4, 2026:
https://pe.usps.com/text/dmm300/Notice123.htm

These are configured retail-price defaults, not a live USPS rate API; supplier and Admin may update the stored fees when rates change. Commercial label pricing may differ.

## Implementation
- Database stores two explicit integer-cent amounts: `flat_shipping_cents` (Small) and `medium_flat_shipping_cents` (Medium), plus threshold `free_shipping_min_subtotal_cents=20001` for this store.
- Saved server-side price and promo computations use the selected Small or Medium box and apply the discount before the free-shipping threshold.
- Supplier and Admin configure shipping using a verified role-scoped RPC; every actual change writes an auditable event.
- Admin checkout review and promotion calculator allow selecting a box size for an accurate estimate. The default estimate uses Medium until packaging is confirmed.
- No sales tax line, no postal label purchase, no public checkout/order/invoice/payment activation.
- Apply the new SQL migration before deploying the app changes. Configure the live store through the authorized shipping screen or a separately audited owner operation after verifying store and admin identity.

## Acceptance cases
| Discounted merchandise | Small | Medium |
| ---: | ---: | ---: |
| $199.99 | $14.65 | $25.80 |
| $200.00 | $14.65 | $25.80 |
| $200.01 | FREE | FREE |
| $220.00 before a 10% code ($198.00 after) | $14.65 | $25.80 |
| $100.00 with eligible free-shipping code | FREE | FREE |

Before paid checkout can be enabled, ensure the chosen box fits the complete cart, and handle shipments needing more than one box explicitly; do not quote a single-box rate for an order that cannot fit.
