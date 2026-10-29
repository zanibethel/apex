# Product vision — Apex

_Last updated: 2026-10-29. Planning document, not a live-commerce authorization._

## Purpose
Launch a clean, mobile-first, branded storefront for a single founding supplier, backed by an operator administration interface. Build the data model with supplier/store IDs so other separately branded suppliers can be supported later without redesigning orders and reporting.

The founding supplier is the only seller on the launch domain; a future supplier must not inherit that domain or its brand by default.

## People and access
- **Customer:** views the catalog and, once a go-live gate is passed, places an order and receives status notifications.
- **Supplier administrator:** maintains authorized catalog, price and stock; sees only their supplier's orders; confirms fulfillment; processes service and refund decisions.
- **Platform operator:** configures stores, views platform-wide audited sales/payment/commission information and investigates incidents; does not need supplier private keys.
- **Support staff (later):** limited roles rather than unrestricted admin access.

## First-supplier MVP (six-week scope)
1. Responsive public pages; product listing/details, availability, search/filter, basic cart and checkout states.
2. Supplier login and protected supplier-specific dashboard.
3. Product and inventory management, order statuses, supplier fulfillment confirmation and refund-event records.
4. Order emails/notifications with links to authenticated details (no confidential order data in email).
5. Operator dashboard: daily/weekly/monthly sales, payment status, supplier amounts, platform share, returns/refunds, exportable statements.
6. Bitcoin test invoices and **experimental** 90/10 payout allocation with robust records and reconciliation.
7. Security controls, backup/recovery instructions, monitoring, and a signoff checklist.

## Partner UX and design direction

The founding partner explicitly prioritizes a **premium, beautiful, easy-to-navigate** shopping experience. Product discovery, clean mobile layout, clear checkout steps and consistent brand styling are MVP acceptance criteria—not optional post-launch polish. See [partner design brief](UX_AND_DESIGN_BRIEF.md), with anonymized feedback and concrete review tests.

## Deliberately out of scope
Multi-supplier self-service onboarding; vendor-to-vendor crypto payouts; Lightning and altcoins; **complex** promotional engines; AI product recommendation services; mobile native apps; advanced BI; recurring subscriptions. A **single scheduled 24-hour flash-sale rule** is a conditional candidate for the MVP if core payment/security work stays on track. See [December launch and promotions](DECEMBER_LAUNCH_AND_PROMOTIONS.md).

## Product-finder idea (later)
A rule-based, catalog-backed helper rather than a paid AI model. It can suggest browsing categories using documented non-medical product attributes. Do not generate unsupported medical claims or individualized treatment guidance.

## Commercial boundaries
The operator proposes a percentage of eligible sales in exchange for initial development and routine maintenance, without a separate initial labor invoice. The signed partner agreement must determine precise commission basis, domain/brand ownership, term, termination, and responsibility for refunds and exceptional projects. **No document here substitutes for that agreement.**

Live sale and fulfillment of regulated products must be limited to legally authorized transactions with appropriate business, merchant and payment arrangements.
