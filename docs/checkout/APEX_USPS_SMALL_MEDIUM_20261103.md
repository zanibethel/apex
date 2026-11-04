# USPS Priority Mail shipping — updated November 3, 2026

The supplier chose a **Padded Flat Rate Envelope** instead of a Small Flat Rate Box.
Keep the existing storage field `flat_shipping_cents` and internal tier key `small`
for compatibility, but these now represent the *padded envelope* (not a Small box).

## Customer shipping
- **Padded Flat Rate Envelope (default): $15.00 retail**, commercial label reference **$12.84**.
- **Medium Flat Rate Box (larger shipments): $25.80 retail**, commercial label reference **$22.02**.
- Merchandise *after discounts* **strictly over $200.00** (starting at $200.01): **free shipping**.
- An eligible free-shipping code also removes the charge.
- Packaging cannot be selected by item count alone; the supplier must confirm the packed order fits. The app exposes a Medium option if it does not fit the envelope.
- These are editable flat-rate charges, not a live USPS postage quote. Commercial cost references are internal planning values, not an assurance of a discounted label purchase.

USPS Notice 123 effective October 4, 2026:
https://pe.usps.com/text/dmm300/Notice123.htm

## Implementation
- `flat_shipping_cents` = 1500 (Padded Envelope), `medium_flat_shipping_cents` = 2580 (Medium).
- `free_shipping_min_subtotal_cents` = 20001.
- Supplier and Admin shipping forms, internal checkout review, and discount calculator label the envelope and Medium Box explicitly.
- The client-facing review defaults to the padded envelope; Medium is a deliberate override. No inference of packaging fit.
- Stored prices and discounts remain server-sourced. Taxes, order placement, BTCPay, postage purchase and live checkout are unchanged.

## Examples
| Discounted merchandise | Padded Envelope | Medium Box |
| --- | ---: | ---: |
| $199.99 | $15.00 | $25.80 |
| $200.00 | $15.00 | $25.80 |
| $200.01 | Free | Free |
| $220 before a 10% discount ($198 after) | $15.00 | $25.80 |
| Eligible free-shipping code at $100 | Free | Free |
