# Apex promotions — production-style management experience (PR #198)

## User-facing behavior

Admin `/admin/shipping-promotions` and supplier `/supplier/discounts` use
the same polished promotions interface.

- **Create code** has a clear Status selection: **Active** (default)
  or **Inactive**. These statuses govern discount eligibility only, and do
  not enable purchasing, catalog release, or Bitcoin invoices.
- New promotions are inserted with the chosen status. Existing promotions can
  be **Activated** / **Deactivated** immediately, with clear success feedback.
- Percentage, fixed-amount, and free-shipping discounts retain their existing
  validation, restrictions, expiration, minimum subtotal and usage limits.
- Existing codes display their actual status and usage. Editing an existing
  code is placed in a disclosure rather than filling the entire page.
- The old tall “Simulate checkout discount” interface is now a compact,
  optional **Discount calculator**. The authorized server checks the saved
  code and shipping rule and returns a breakdown of subtotal, discount,
  shipping and total, without modifying any order or redemption.
- Shared mobile CSS uses single-column fields on narrow screens, keeps
  buttons proportionate, and supports accessible labels and status feedback.

The Admin checkout review no longer shows development-mode descriptions of
the contact form, payment handoff, tax quoting or shipping. Where an actual
purchase is not possible, it says **Checkout unavailable** or
**Payment unavailable** rather than suggesting an order will be taken.

## Boundaries

Creating or activating a code does not create an Apex order, BTCPay invoice,
payment request, stock reservation, public product listing, or redemption.
The existing RLS permissions and promotion feature gate remain unchanged.
Server-side code validation, price sourcing, store restrictions and disabled
payment gates are still required.

This PR changes no shipping fees, existing promotion data, inventory, tax
collection, supplier payouts, or production payment credentials.

## Verification

- Node regression tests cover the creation-status choices, eligible code
  calculations, free-shipping waivers, normal UI copy and mobile layout.
- Run the repository quality and isolated Postgres/RLS suites on the exact
  pull-request head before merging; verify Vercel preview and production.
