# Apex role isolation audit — November 14, 2026

## Scope
Read-only inspection of Apex Supabase project `fhqpkpztercadcxspdkg` against the existing verified pilot **customer** account, plus Next.js authorization code and repository tests. This is an access-boundary review, **not** a live checkout or payments release. No Auth users, roles, memberships, or financial records were modified.

## Verified observations (production database)
- Supabase Auth reports the pilot account exists, email is confirmed, is non-anonymous, and **does not** have `app_metadata.apex_role=platform_admin`.
- The account has **zero** supplier memberships.
- Running as the actual PostgreSQL `authenticated` role with that user's `auth.uid()` claim in a **READ ONLY** transaction returned:
  - `supplier_memberships`: 0 visible rows
  - `supplier_wallet_requests`: 0 visible rows
  - `supplier_sales_history`: 0 visible rows
  - `supplier_import_candidates`: 0 visible rows
  - private `stores`: 0 visible rows
- Read-only calls to `get_admin_checkout_journal_overview()` and `get_admin_retail_product_restrictions()` using the non-admin test user's Auth claims both failed with PostgreSQL **42501 / administrator required**; no admin data was returned.
- All reviewed direct supplier tables have RLS enabled, including `supplier_memberships`, `supplier_wallet_requests`, `supplier_sales_history`, and `supplier_import_candidates`.
- Supplier membership table currently has three member accounts in **one supplier**. Therefore, **cross-supplier** isolation with two different supplier IDs cannot be demonstrated in production yet.
- The admin dashboard and user directory both require server-side `auth.getUser()` and trusted `app_metadata` role checks; the main supplier dashboard requires server-side `getUser()` plus RLS-visible membership.

## Code correction
- The main `/supplier` dashboard previously checked `getUser()`, non-anonymous status and RLS membership, but **did not explicitly require `email_confirmed_at`**. Other supplier pages already did. Added explicit verified-email requirement to prevent an unconfirmed supplier member from reaching the dashboard summary.
- Added a regression assertion in `tests/supplier-auth-guards.test.mjs`.
- No customer registration, role assignment, membership writes, payment, fulfillment, checkout, BTCPay or SMTP settings changed.

## Unresolved security advisories (not silently waived)
The Supabase security advisor reported:
- 13 publicly executable `SECURITY DEFINER` functions with the `anon` role, including intentionally public catalogs and mail-worker token functions. Review their internal checks and exposure before declaring launch approval.
- 48 `authenticated`-executable `SECURITY DEFINER` functions, including admin and supplier RPCs. The two admin read RPCs tested above rejected the pilot customer; **these tests do not prove every RPC is safe**.
- 40 internal RLS-enabled tables with no policies; their default deny posture is intentional for private data, but grants and RPC bypasses should remain audited.
- Leaked-password protection disabled in Supabase Auth. Enable as an explicit owner security-setting decision during launch review.
Reference: https://supabase.com/docs/guides/database/database-linter

## Remaining end-to-end checks
1. Signed in as the pilot customer in a real browser, visit `/supplier` and `/admin`, then `/admin/users`, `/supplier/wallets`, and `/supplier/orders`. All must deny privileged access; the account must still be able to open `/account/profile`.
2. Confirm a supplier member can access **only** assigned supplier areas and cannot reach admin routes. Confirm an admin can open admin routes.
3. Test a second independently scoped supplier when provisioned; one supplier ID is not sufficient evidence for cross-tenant isolation.
4. Test sensitive mutations (including supplier product edits and admin proposals) via an explicitly authorized, disposable non-production workflow before live checkout.
5. Audit the remaining RPC advisory findings. Do not enable the retail order engine, BTCPay live invoices, Prism payments, or fulfillment based on this access review alone.
