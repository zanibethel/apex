# PR #175 — Private payment reporting dashboard (read-only)

**November 2, 2026.** This is a UI-only follow-up to merged PR #174. It does not implement a live payment worker, hosted BTCPay/Prism settings, operator recovery approval, payouts, merchant wallet access, or customer checkout.

## User experience

- New admin-only server-rendered page: `/admin/payment-monitor`, linked from the existing `/admin` control room.
- It rechecks Supabase Auth `getUser()` and trusted `app_metadata.apex_role=platform_admin` through the existing `isVerifiedPlatformAdmin` guard; any unauthenticated or non-admin visitor is redirected to the admin sign-in.
- Reads **only** existing RLS-scoped hosted reporting tables (`payout_rules`, `payout_transfer_records`, `payment_allocation_snapshots`) and `stores`, through the signed-in user's normal server-side Supabase session. **No service-role or private BTCPay credentials**.
- Displays the latest 30 rule records, transfer journal records and snapshot count. Transfer states are explicitly labeled **database-recorded**, not independently confirmed Bitcoin deposits, payouts or provider settlements. The page never displays provider references, full order references, API keys, wallet addresses or authentication details.
- Distinguishes unavailable/missing reporting tables from a valid zero-result query. Unknown states fail into a review-needed classification, not a green success. Counts are explicitly **bounded samples**, not business-wide totals.
- Links to existing draft split and checkout-readiness pages. No forms, server actions or payment buttons, and `robots` is set to noindex/nofollow.

## Risk and availability boundaries

This dashboard is **not connected to the test-only SQL fixtures** used by PRs #165–174, nor does it claim to display live regtest results. It also does not connect to a hosted provider invoice feed, production Prism configuration, external wallets or independently verified blockchain receipts. The private payout reporting migration is marked *review only* and may not be present on the hosted Supabase project: the page must show **unavailable** rather than silently fabricate records if RLS/permissions or schema prevents a query. A recorded transfer state of `confirmed` is explicitly not on-chain proof.

This is visibility into existing private ledger proposals only. All real checkout and payout capability remains disabled. No production migration or secret changes are part of the PR.

## Verification

The new pure display helper has Node tests for invalid states, bounded records, missing-readback vs empty distinctions, frozen display results, and permanent no-payment/no-recovery permissions. A route contract test checks verified admin authorization, session-bound RLS reads, no service-role or mutation paths, no public-provider calls, and its control-room link. Keep normal Apex quality/build, isolated PostgreSQL/RLS and BTCPay/Prism CI regressions green before merging.
