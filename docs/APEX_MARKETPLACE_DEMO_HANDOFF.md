# Apex Marketplace — Fictional Product Demo, E2E Testing and Buyer Handoff

Status: private UI transaction rehearsal (PR pending). This is **not a production commerce launch**.

## Product intent and isolation

Existing saved Apex product records are development/test records, **not proof of available inventory or permission to sell**. A "not for human consumption" label does **not** itself establish legal eligibility for a product or replace independent review.

For a marketplace demonstration, use an entirely fictional catalog rather than real-sounding regulated product names. The code file src/lib/catalog/marketplace-demo-fixtures.mjs contains five intentionally imaginary accessories with SKU prefixes DEMO- and IDs sample-*. These records are **not written to Supabase** and must not be routed to public catalog, payment, or order infrastructure.

## Current private rehearsal

Authenticated supplier owner/manager: /supplier/catalog/storefront-test

1. Existing private showroom: saved product cards, stock/visibility UI switches and a local cart. Changes reset when the page reloads.
2. New separate demonstration: synthetic generic products with independent **Show sample** and **In stock** switches; sold-out samples remain visibly marked.
3. Add sample quantities to an in-browser cart, check totals, switch simulated shipping, try DEMO10, and review a checkout layout with *fictional* customer and delivery details.
4. "Place demo order" creates a local immutable line-item snapshot and receipt prefixed DEMO-. No API, real order, charge, or customer record is created.
5. Supplier operations rehearsal: explicitly advance simulate_payment → start_packing → mark_shipped → mark_delivered. Invalid/repeat transitions fail.
6. Review local event history, inspect the fictional receipt and optionally export only the fictional JSON order; reset the rehearsal.
7. The simulation uses no real customer data, email sending, USPS, BTCPay, Prism, Stripe, wallet or shipping label. It never invokes the public product release gate and is not accessible to signed-out users.

**Limitation:** The complete buyer-to-supplier experience is simulated **within one authenticated browser page**. The actions are not persisted and do not exercise real multi-session buyer/supplier RPCs, payment webhooks, or supplier reports. Do not claim end-to-end backend integration has passed merely because the UI rehearsal passes.

## Required next implementation: isolated, persisted integration sandbox

Before selling or deploying a third-party marketplace, complete a separate sandbox that **cannot share payment secrets, public release flags, inventory or production orders**:

- Versioned test-only tenant and fictional product fixture creation/reset with explicit demo_mode; do not infer demo from product names.
- Authenticated buyer test accounts separate from supplier/admin roles; test row-level security for cross-tenant guessing, role changes, private drafts and leakage.
- Persist demo orders, immutable snapshot lines, idempotency keys, timestamps, supplier fulfillment events and audit records in dedicated sandbox storage.
- Deterministic simulated payment gateway with separate success/failure/partial/expired/replayed callback scenarios. Do not use real wallet addresses, payment invoices or webhooks for demo orders.
- Test discounts, shipping thresholds, stock tracking OFF vs ON, out-of-stock presentation, price changes between cart and checkout, concurrent reservations and stale revisions.
- Verify supplier dashboard receipt, order status, CSV export/import, daily reporting and tracking fields against only sandbox data.
- Verify retries, duplicate webhook/order replay protection, refunds/cancellations, RLS and logs; fail closed on stale events.
- Full Playwright buyer-to-supplier browser tests against a dedicated test environment, including iPhone keyboard zoom, accessibility and small screens.
- A one-command reset/seed script and a report for every tested requirement, with independent verification before deploying any real commerce integration.

## Transfer-ready marketplace checklist

A prospective buyer should receive a **portable software business**, not the current owner's personal accounts or supplier test data.

- **Ownership and intellectual property:** inventory of repositories, licenses, code dependencies, branded content, contracts and any assignments necessary for transfer.
- **Environment portability:** documented tenant provisioning, Supabase schema and RLS migrations, Vercel config, env-variable templates, secret rotation, DNS/domain transfer plan, email/Resend and payment-provider setup.
- **Roles and governance:** buyer/owner/admin/supplier permissions; new operator can disable/reassign suppliers, create their own test tenants and set approval policy without changing application code.
- **Financial integrations:** purchaser provisions their own merchant/gateway credentials, wallets, keys, payout policies and tax/shipping rules. No previous owner's secrets or commission wallets are inherited.
- **Data governance:** privacy, retention, access logs, consent, backup/restore, demo dataset deletion, customer/supplier data export and legal ownership terms.
- **Runbooks and reliability:** monitoring, incident response, rate limits, recovery, idempotency, deployment/rollback, infrastructure costs, support workflows and maintenance contacts.
- **Commercial readiness:** neutral brand/theme configuration, feature licensing options, operator onboarding, a bounded acceptance checklist and a defined migration/handoff scope.

## Release standard

A private *UI* demo is valuable for layout iteration; it is not a public sales authorization or a tested payment/fulfillment system. Keep actual checkout and public release disabled until required eligibility, payments, stock and security checks have independent evidence.


## Supplier product creation on the live Apex domain

This is independent of the payment rail. An authenticated supplier owner or manager can open the supplier dashboard, select **Add product**, or ask supplier chat **add product**. These direct the user to /supplier/catalog/bulk?new=1#apex-product-workspace, pre-opening an unsaved product card in their authorized private store. After entering title, price, description and optional category, **Save changes** uses the existing supplier-scoped draft creation action and generates a SKU if blank. The product is persisted with starting inventory of zero and can then have an image uploaded/reused and stock tracking configured. It is available on the private storefront tester on a fresh view.

**BTCPay/Prism credentials are not required for product creation, editing or private presentation.** Saving a product does **not** create a BTCPay invoice, mark it eligible for real payment, or open sales. Supplier publishing preferences are separate from actual public release authorization; private test content does not inherit public-release eligibility by being described as a placeholder.

For future transferable marketplace deployments, configure catalog creation/visibility and merchant checkout separately. A legally eligible new operator will provision and verify independent payment credentials and their own release policies before enabling purchasing.

