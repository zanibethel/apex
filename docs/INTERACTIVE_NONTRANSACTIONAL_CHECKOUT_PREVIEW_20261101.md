# Apex — interactive, non-transactional checkout preview
Date: November 1, 2026

## Purpose and link

A separate, customer-facing **checkout UX demo** at `/checkout/preview`, accessible from the storefront home, catalog, and navigation menu. This is a DESIGN/USABILITY preview, not real buying capability. It deliberately branches from `main` rather than stacking on experimental PRs #117–#127, so it can be reviewed and shown independently.

## Customer flow

1. **Guest details:** Fictional, prefilled example name/email/shipping address and optional phone. Fields can be edited to test validation. No login required; no account or personal information is saved or submitted. The page explicitly warns against entering real PII.
2. **Order summary and cart:** Two clearly fictional branded demo items, responsive quantity controls (0–5 each), unit/subtotal/discount/shipping display, standard vs express shipping and a sample coupon `DEMO10`. Empty cart disables continuation.
3. **Simulated Bitcoin invoice:** An unscannable QR placeholder, **no wallet address**, no payment link, and a mock BTC amount computed with integer satoshis using a **fixed invented demo conversion** of $100,000/BTC (NOT a current rate or payable quote). The operator can simulate awaiting -> detected -> confirmed or expired; no timeouts, pollers, external APIs or auto-state change occur.
4. **Confirmation screen:** An explicit example-only reference `DEMO-ONLY · NO ORDER`, fictional guest name, sample total and simulated payment result. Restart clears the local UI state.

The checkout is responsive and follows Apex’s black/silver/crimson theme with an always-visible demo warning, accessible labels, visible keyboard focus, reduced-motion behavior, and mobile single-column layout. The order summary appears beside the form on wider screens and below it on smaller ones.

## Engineering and safety gates

- **No API calls, real orders, BTC invoices, QR addresses, payments, webhooks, or persistent data.** The preview uses only React client component state and a pure JavaScript pricing/validation model.
- The product examples **are not merchant stock**, catalog listings, or proof of fulfillment; price, tax and shipping values are fictional. Tax is explicitly **not calculated**, so the demo must not be used as a final total or estimate.
- The inline example address/email is deliberately fictional. Users should never enter real personal information while testing the demo. No content is written to localStorage or cookies.
- The live BTCPay/Prism worker, payout split approvals, supplier inventory, discounts, and Supabase data are **not connected**. Future checkout will need true eligible product/order load, server-side validation and final totals, applicable taxes/shipping, authenticated payment provider state, real expiry/error handling, refunds and other authorization gates.
- Existing production catalog continues to be read-only/approval-gated. This UI does **not** lift supplier publication or checkout restrictions.

## Review acceptance

- CI: Next.js lint, strict TypeScript, `tests/checkout-preview.test.mjs`, app build, and existing Supabase/payout RLS regressions.
- Confirm Vercel **preview** deployment uses this branch’s exact source commit, reports READY, and remains under protected preview authentication. It does not get promoted to production without an approved release review.
- Manually test on mobile and desktop: modify guest details, invalid email/ZIP, coupon apply/remove, each shipping option, changing quantities, empty cart, status detected/confirmed/expired, returning to details, restart reset, navigation and keyboard focus.
- Verify that no checkout action generates a browser network request and neither a backend invoice nor order record appears. The dashboard BTCPay test PRs remain separate.

## Intentional next pass

After partner review, refine the checkout appearance and usability. Only then plan a real, server-side cart/order schema and payment integration under a separate gated implementation pass. User-facing checkout is not ready for real commercial acceptance.

## Public test-mode deployment gate (Nov 1 follow-up)

The checkout demo is now authorized for a **public test-mode-only** rollout to the existing Apex domain.

- `APEX_CHECKOUT_MODE` is a **server-only** environment variable. Undefined, `off`, `live`, or any unrecognized value returns 404 on `/checkout/preview`. Only exact `demo` displays the UI.
- The page shows a prominent "TEST MODE — SIMULATED PAYMENTS ONLY" disclaimer, makes clear that Bitcoin cannot be sent, and warns testers not to enter actual personal information.
- The production setting `APEX_CHECKOUT_MODE=demo` **exposes only the nontransactional demonstration**. It does not enable any BTCPay, Prism, order, refund or payout operation. No client-side or server-side code is able to turn payments on.
- Future transactional mode will require a separately reviewed service, secure credentials, merchant permissions, legally authorized products, fulfillment/tax/shipping policies, server-side order/payment accounting, fraud checks, expiry/idempotency, fail-closed error handling and verified provider-side payout configuration. Merely changing a flag from demo to live is intentionally not sufficient.
- To hide the demonstration, set `APEX_CHECKOUT_MODE=off` and **redeploy** (Vercel environment changes require a deployment before they take effect). Existing production account/supplier functionality is otherwise unchanged.
- Require exact-head GitHub CI, Vercel production deployment READY on the intended main commit, domain assignment and public route verification. Do not promote the BTCPay experimental PR stack.
