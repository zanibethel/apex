# Apex Track 2 — Historical payment record review and test runbook

**November 5, 2026 · PR scope:** A read-only admin page and a paginated, bounded cross-reference review of existing allocation-rule, allocation-snapshot and transfer-journal tables. This is **not** a real payment, invoice, wallet, refund, reconciliation of the external BTCPay provider, or commercial checkout admission.

## What is implemented

- Protected route: `/admin/payment-monitor/history`, linked from `/admin/payment-monitor`.
- Session-bound Supabase RLS reads. Every page is restricted to a verified platform administrator. No service-role/secret key, hosted migration, provider network request, wallet lookup, payment write, or payout action.
- Bounded pagination: up to **5,000 rows per reporting table**, **250 rows per page**. A hard over-limit, missing page, unexpected count change, wrong ordering, duplicate ID or changed first page fails closed. Results never return partial aggregate counts or raw source IDs to the UI on scan failure.
- Existing reporting sources: `payout_rules`, `payment_allocation_snapshots` and `payout_transfer_records`. The scanner compares snapshot-to-rule references and versions; transfer-to-snapshot references; chronologies; snapshot aggregate amounts; and basic stored state validity. It reports generic aggregate findings only.
- The page clearly says that a completed read is **not a transactionally consistent snapshot** and is **not independent Bitcoin/BTCPay settlement evidence**. Records can change between sequential reads. RLS might limit row visibility; the 5,000-row cap can prevent a complete read. Missing references mean *unresolved within readable reporting records*, never proof of a missing on-chain payment.
- All authorization flags remain false. The production private release gate remains off.

## Test on the production website (read-only)

1. Visit [apexanabolics.co/admin](https://apexanabolics.co/admin) and sign in to an existing **platform administrator** account.
2. Choose **Payment monitor** and select **Review historical payment records**. Or directly open [the historical review](https://apexanabolics.co/admin/payment-monitor/history).
3. Confirm that you see **Historical payment record review**, the three counts for rules, allocation snapshots and transfer records, and the notice that Bitcoin settlement remains unverified.
4. If there are no reporting rows, verify that all three counts show **0**. That is an empty reporting history, not proof of payment success. If the count is unavailable, the page must report that **no partial audit was accepted**, rather than showing successful or made-up counts.
5. Where reporting rows exist, verify that the displayed findings are aggregate counts and generic descriptions, never customer addresses, payment credentials, wallet destinations, recipient details or raw order IDs.
6. Navigate back to the standard Payment monitor and verify that its newest-30-record panels still render. Existing notices must still show customer checkout **Disabled**, BTCPay/Prism evidence **Not connected**, and payout actions **Not available**.
7. Sign out, then open `/admin/payment-monitor/history` in a private browser window. The route must redirect to **/admin/sign-in**. A normal supplier session must not gain administrator access.
8. **Do not place a real order, send Bitcoin, purchase shipping labels, configure live merchant credentials or activate checkout** to test this page. All of these are outside this PR.

## Developer test commands

From a fresh checkout of the exact merged commit:

```bash
npm ci --no-audit --no-fund
node --test tests/admin-payment-history-scan-v1.test.mjs
npm run check
```

`npm run check` runs lint, TypeScript, all unit tests and Next build. The GitHub **Apex quality checks** workflow additionally runs disposable PostgreSQL/RLS integration. The PR must have both `verify` and `rls-integration` green and Vercel preview READY at the exact head before merge.

## Synthetic failure scenarios covered by automated tests

- Zero rows, valid multi-page history, last partial page.
- Duplicate IDs and out-of-order pagination.
- Middle page denied, empty or missing; count changed between pages; first page changes on re-read; over 5,000 rows.
- Rule-version mismatch, invalid amounts, invalid transfer states, pre-snapshot transfer timestamps and unresolved references.
- Direct route and scanner contain no payment writes, additional RPCs, external provider calls or privileged secret access.

## Definition of done and remaining blockers

**This PR completes bounded read-only historical reporting inspection, not external reconciliation or checkout.** To establish independent payment finality requires a separately approved, authenticated provider feed, signed event evidence, verified Bitcoin chain/wallet receipts, full event provenance and cross-provider checks. The canonical transactional order writer and production merchant release gates remain separately incomplete and disabled.
