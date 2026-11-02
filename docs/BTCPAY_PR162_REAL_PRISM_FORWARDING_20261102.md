# PR #162 — real Prism-generated two-wallet regtest forwarding

## Verified foundation
PR #161 merged on 2026-11-02 and confirmed a real pinned BTCPay
upstream instance, disposable Bitcoin Core regtest invoice settlement,
actual signed `InvoiceSettled` webhook, an atomic append-only
PostgreSQL receipt, and replay-safe order-status readback. All code
remains isolated from deployed commercial checkout.

## Scope
Port the previously verified PR #117/#118 **real Prism 1.3.3**
forwarding integration to the latest `main`. On a disposable GitHub
runner, install the published plugin with a pinned SHA-256 archive,
initialize **two distinct ephemeral test stores**, mint only worthless
regtest Bitcoin, and configure the current Prism test rules in the
**throwaway upstream BTCPay database**, not hosted Supabase.

Test two administrator-*supplied fixture* rule versions separately:
- **Version 1: 90/10**, gross 10,000,000 sats, Prism's synthetic
  2% reserve = 200,000 sats, supplier expected 8,820,000,
  platform expected 980,000 sats.
- **Version 2: 85/15**, gross 10,000,000 sats, same reserve,
  supplier expected 8,330,000, platform expected 1,470,000 sats.

For **each** version, require a settled provider invoice, independently
verified Bitcoin Core regtest chain, actual plugin-originated BTC-CHAIN
Greenfield payout claims, exact amount and destination reconciliation,
both claims in `Completed`, and separate receiving wallets with
confirmed on-chain amounts. A manual Bitcoin CLI send is insufficient
for payout proof. A claim without independent wallet proof is also
insufficient. Retain the stricter #160 fail-closed fix: an extra unknown
claim blocks completion even if two expected claims are complete.

## Negative/failure conditions
The pure policy tests must hold a synthetic small invoice when
explicit assumed fee reserve is inadequate, reject too-small outputs,
non-regtest addresses, malformed percentages, missing/wrong claims,
zero confirmations, incomplete payment, or unknown third payouts.
Pending overdue or underpaid payouts mean **manual review**, not
automatic resubmission of the Bitcoin payment.

The **2%** reserve, fee estimate (15,000 sats), safety margin
(15,000), and output minimum (50,000 sats) are **regtest fixtures**
and are not real network measurements or production fee configuration.

## Not included
No paid VPS, real Bitcoin, live wallets, production Supabase migration,
merchant settlement, customer checkout, admin split activation,
live payouts or product publication. The UI's administratively
configurable split drafts are not equivalent to approved production
Prism rules. Prism can change at settlement, so pending-invoice drain,
admin activation freeze and immutable rule snapshot safety from the
remaining draft stack #119–#127 must be integrated and retested
before any operational split update.

## Required merge gate
Require exact-head success of:
1. `Apex quality checks`: lint, typecheck, complete Node tests,
   app database security tests and production build.
2. `Payout RLS isolated Postgres verification`.
3. `BTCPay ephemeral upstream regtest readiness`: real
   BTCPay/Prism plugin job with both independently confirmed
   recipient wallets and both Greenfield payout claims `Completed`.
4. Vercel preview.

No merging on a passing unit test or a previous stacked-branch
CI run alone. Actual PR #162 CI logs must prove both scenarios.
