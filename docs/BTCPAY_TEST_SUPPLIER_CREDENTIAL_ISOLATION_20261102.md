# PR #173 — test-only supplier BTCPay credential isolation

**November 2, 2026.** This PR changes only disposable PostgreSQL/BTCPay `regtest` fixtures and their CI worker. **Do not apply these SQL files to hosted Supabase** or configure production Bitcoin wallets.

## Problem and control

PR #172 constrained the worker's PostgreSQL role, but its invoice API still accepted any valid-looking `apiKey` and trusted only the Apex-store-to-BTCPay-store binding. A supplier's credential could be accidentally supplied to another supplier's worker before that mismatch was detected by BTCPay.

The new `public.btcpay_test_supplier_credentials` table binds an *actual Apex supplier ID* (derived from `public.stores.supplier_id`), an exact immutable Apex store/BTCPay store mapping, and the **SHA-256 fingerprint** of the store-scoped Greenfield key. No raw token is stored in SQL; keys remain in the ephemeral server-side runner. The table has RLS enabled, no access for `anon`, `authenticated` or `apex_test_invoice_worker`, and a trigger that rejects changed store/supplier/key fields. One-way, terminal **revocation** is possible for fixture operators. In production, key rotation requires a separate audited credential-generation design.

The existing restricted worker RPC now requires a fifth argument: the credential fingerprint. It verifies an active, supplier-consistent provider binding **under the same storefront transaction advisory lock** that later consumes the invoice permit. Revocation uses this same lock. A wrong or revoked credential fails with no provider POST and without consuming the permit. The original operator functions remain inaccessible to the worker and all existing invoice-hold, audit, 90/10 draft split and post-crash protections remain intact.

## Verification

- Two distinct synthetic suppliers, two Apex stores, and two **different** test Greenfield key fingerprints in isolated PostgreSQL.
- Both directions of a cross-supplier key swap are denied before any provider HTTP, without consuming either checkout-resume permit. Live SQL credential revocation is denied before permitting invoice creation; fixture is rolled back before legitimate tests. Fingerprint mutation and public credential reads/writes are denied.
- The restricted trusted worker computes SHA-256 in Node and passes **only the 64-character digest** to PostgreSQL. Unit tests assert that raw API keys never appear in `psql` arguments.
- Real ephemeral regtest tests issue distinct store-scoped BTCPay keys to the normal and crash test stores, independently bind their fingerprints, then prove supplier A's token cannot create or view supplier B's invoices. Legitimate one-shot Greenfield invoice and post-commit crash tests remain part of the original regression.
- The actual BTCPay/Prism upstream regtest remains on existing disposable Bitcoin Core, NBXplorer, PostgreSQL and loopback-only BTCPay; no new permanent infrastructure or customer checkout is created.

## Important limitations

This is **not** production secret management or a public supplier wallet configuration feature. The underlying low-level test worker still accepts a key from its trusted controller; it must never become a Next.js action or untrusted API endpoint. The fingerprint is a verifier for a high-entropy token, not a place to store secrets, nor proof of the provider's complete authorization coverage. CI fixture setup remains privileged. We do not prove that other BTCPay administrators or third-party keys are restricted; later work must audit all provider writers, use a real secret vault, scoped worker identities, independent operator controls and credential rotation. Revocation prevents a *new* authorization but cannot cancel an external POST already accepted by BTCPay.

## Merge gate

Require exact PR-head green application quality/Node/build, isolated PostgreSQL security/worker integration, real BTCPay/Prism regression including the cross-supplier test, and Vercel preview. No live checkout or payout activation.
