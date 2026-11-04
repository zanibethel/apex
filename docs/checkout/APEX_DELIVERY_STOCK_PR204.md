# PR #204 — Delivery details and inventory readiness

## Delivered

- Added a real customer-cart contact / U.S. delivery-address form on the existing `/cart` route. Customers may review their details for formatting; the form stays in React component memory. No address, phone, email, or recipient information is sent to the application server or stored in localStorage.
- Addresses validate required names, email format, optional telephone, street, city, state (U.S. states + D.C.) and ZIP/ZIP+4, using bounded input lengths and normalized display.
- Delivery review shows the existing USPS Padded Flat Rate Envelope or Medium Flat Rate Box selection, but does not label an address as deliverable or generate an order number.
- The prepared-details model requires the same strict real-UUID cart item selection limits as PR #203; it returns explicit `canSubmitOrder=false`, `canReserveStock=false`, `canCreateInvoice=false`, and `canPay=false`.
- The existing admin checkout-readiness screen now aggregates **verified private inventory** into stock-recorded, zero-available, and unverified categories. It reports observed status without promoting that stock to public or authorizing orders.

## Deliberately unchanged

- All products remain unpublished and customer ordering remains unavailable.
- No public inventory availability assertion or stock count is released.
- No public release gate, supplier/product authorization, inventory reservation, payment, postal label purchase, or order ledger is modified.
- No new database migration or service credentials are introduced.

## Verification

`tests/delivery-inventory-pr204.test.mjs` exercises valid/invalid shipping details, stale and oversized cart state, the privacy/no-order flags, and private stock aggregation. The standard application check and isolated database security suites must pass before merge.

## Next independently gated work

A true purchaser order record requires transactional admission against independently authorized product/supplier data, live stock reservation, server-calculated amount snapshots, explicit fulfillment consent, and payment-provider reconciliation. A delivery form alone is not a placed order.
