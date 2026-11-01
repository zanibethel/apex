# PR #121 — BTCPay Greenfield provider drain + recovery (2026-11-01)

**DRAFT / TEST-ONLY / NO LIVE SYNCHRONIZATION.** Stacked on PR #120, #119, #118 and #117.

## Objective

PR #119 proves that an administrator's proposed storefront payout split cannot be approved if known historical invoices or allocations lack confirmation evidence. PR #120 serializes new **disposable database journal** invoice writes against a persistent split-sync hold. That is not enough to safely change global Prism settings: BTCPay may have invoices, payouts and incomplete payment activity unknown to Apex.

This pass introduces **read-only** Greenfield inventory retrieval plus fail-closed matching to an explicitly provided independent regtest ledger. It documents what a future trusted, auditable worker would have to do to reconcile unknown provider activity or an interrupted external settings change.

## Verified supported API surface

Official Greenfield API:
- `GET /api/v1/stores/{storeId}/invoices?take=N&skip=M`: full invoice inventory, without filtering by payment state. Read permission: `btcpay.store.canviewinvoices`.
- `GET /api/v1/stores/{storeId}/payouts?includeCancelled=true`: store payout inventory. Read permission and response must be checked against the **installed** BTCPay version on `/docs` and `/swagger/v1/swagger.json`. The public API alone does not prove that all Prism-generated claims are returned or linked to the correct invoice.

Sources: https://docs.btcpayserver.org/API/Greenfield/v1/ and https://docs.btcpayserver.org/Developers/api/

**Not established:** an authenticated, documented Prism 1.3.3 Greenfield endpoint to read back and modify the actual Prism split rule atomically. Existing reviewed Prism source uses a cookie-based store configuration form. Do **not** scrape forms or cookies, edit Prism database tables directly, or substitute generic BTCPay store settings for plugin-specific payout configuration.

## Code

`src/lib/payments/btcpay-provider-drain.mjs`:
1. `readRegtestGreenfieldInventory()` uses an explicit synthetic regtest guard, **loopback-only** origin, test-scoped API key, GET-only requests, no redirects, bounded complete pagination, a bounded payout array, generic sanitized errors and `includeCancelled=true`. Missing pages, malformed HTTP JSON, unsupported origin or authorization failure fail closed. This is not a general production API client.
2. `assessRegtestProviderDrain()` compares the entire provider invoice ID/order reference set against trusted journal references; requires every invoice to report `Settled` with `additionalStatus: None`, separate independent finality evidence, at least two unique recipient claims per invoice, completed BTC-CHAIN payout records, exact BigInt satoshi amounts, destination matching, separate confirmed wallet receipts and no unknown/missing/duplicate payouts. ALL unknown information is a blocker. Passing returns `eligible_for_operator_review_only`; **never** payout, activation or hold-release authority.
3. `assessRegtestSyncRecovery()` recognizes before/unknown/failed/reported-successful external change phases and unconditionally retains the checkout hold. A missing hold becomes a critical operator escalation. No attempt to automatically resend, retry or roll back a potentially broadcast payout.

`tests/btcpay-provider-drain.test.mjs` covers read-only Greenfield paths, page exhaustion, auth/shape errors, foreign origins, unknown and unmatched invoices, partial states, outstanding payouts, wrong recipients and satoshi amounts, missing wallet confirmations, duplicate claims, release denials, and crash/unknown-outcome recovery.

`npm run test` already includes `tests/*.test.mjs` in the existing quality workflow. Existing PostgreSQL and real upstream Prism regression workflows remain unchanged and must pass on the exact new PR head.

## Strict boundaries for the next implementation

A genuine, production-safe provider synchronization would require all of the following, implemented and independently verified in separate PRs:

1. **All invoice creation routes must acquire the same persistent per-store hold before calling Greenfield POST.** A database INSERT trigger after the API call does not fence external invoices. Provider-side or third-party-origin invoices must also be disabled or independently accounted for. Store-scoped locks held only inside PostgreSQL cannot span an arbitrary external provider operation atomically.
2. With checkout held, **re-fetch provider inventory until complete and stable** and reconcile against the immutable allocation journal, finalized claims, and independently verified receiving-wallet transactions. Explicitly handle provider pagination races, known invoices missing from Greenfield reads, late/partial payments, disputes, refunds, unindexed claims, and other stores' traffic. A read-only GET result is not a cryptographic finality proof or a guarantee against direct third-party invoice creation.
3. Obtain and review the installed Prism plugin's **supported** settings read/write interface, compatible with the pinned BTCPay+Prism versions. If no supported API exists, use supervised manual configuration under a durable checkout hold, followed by independent readback and regtest acceptance. Do not create an unreviewed privileged automation path.
4. Commit an immutable `pending_manual_sync -> provider_verification -> verified_by_operator` audit trail (rule ID/version, recipient identity fingerprint, timestamp, reviewer, provider evidence, recovery incident). Design crash-safe idempotent transitions and compare-and-swap semantics. Any ambiguous outcome stays held and is escalated, **not retried blindly**.
5. Only a separately reviewed release operation may resume invoice creation after independent provider readback, finality and permission checks. No release/unhold endpoint is introduced here; PR #120's hold remains intentionally sticky.
6. Calibrate UTXO/fee headroom and minimum order policies before live small-value payments. Upstream payout processors may report `Completed` without independent receiving-wallet proof, which is not sufficient for release.

### Acceptance and deployment restrictions

- PR stays **draft, unmerged, undeployed**, based on PR #120; exact-head unit, application, PostgreSQL and real upstream Prism regtest regression checks are required.
- No hosted Supabase migration, real API credential, BTCPay instance, VPS expense, Bitcoin mainnet operation, production checkout, supplier wallet or admin **Activate** button was changed.
- Passing these tests **does not authorize production sales, payment processing, payout signing or changing Prism settings**. Merchant/provider approval and operational authorization remain separate gates.
