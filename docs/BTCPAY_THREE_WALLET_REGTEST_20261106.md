# BTCPay / Prism three independent receiving wallets — disposable regtest v1

**Date:** 2026-11-06. **Scope:** Test infrastructure only, zero real Bitcoin.

## Purpose

Apex's intended eventual provider topology is **one BTCPay Server store**
with three payout destinations: **Apex platform (10%), Lily (45%),
Tierra (45%)** initially. Lily/Tierra can be rebalanced in admin draft
rules (the platform share remains 10%). One provider store is distinct
from the three recipient wallets; separate BTCPay provider stores are
not required for this model.

The installed Prism 1.3.3 **test-only** runner previously proved two
different **two-recipient** rule versions. This update preserves those
scenarios and adds one disposable **single-BTCPay-store, three-recipient**
scenario. Different CI stores per test version isolate test inputs from
each other; production still intends exactly one provider store.

## Regtest flow and verification

1. Use the official pinned BTCPay upstream, Bitcoin Core regtest and the
   pinned Prism 1.3.3 package (or pinned source fallback), exclusively on
   a temporary GitHub runner. No mainnet or secret-bearing workflows.
2. Create one synthetic BTCPay provider store for the three-way case.
   Create three *different disposable receiving wallets* and corresponding
   regtest addresses. A fourth wallet is used as the synthetic merchant
   invoice funding source.
3. Install a frozen Prism rule: Apex 1000, Lily 4500, Tierra 4500
   basis points. Preview a 10,000,000-satoshi synthetic invoice with a
   declared **2% reserve**. The expected receiving-wallet amounts are
   Apex 980,000, Lily 4,410,000 and Tierra 4,410,000 satoshis.
4. Fund a BTCPay invoice on Bitcoin Core regtest and verify a settled
   invoice. Require **exactly three** on-chain payout claims with
   `Prism (apex)`, `Prism (lily)`, and `Prism (tierra)` metadata.
   Check actual independently received amounts and block confirmations,
   all three claims at `Completed`, and a separate read-only Greenfield
   invoice/payout inventory check with each destination and amount
   matching exactly once.
5. Fail closed on missing, duplicate, fourth/unknown, tampered or
   partially paid claims; never auto-resend an ambiguous payout. Unit
   tests additionally cover incorrect network, addresses, role
   percentages, fees, missing confirmations and stale rules.

**Important:** The fixed 2% reserve and minimum outputs are fixture
assumptions, not predicted mainnet fees. Payout claims represent transfers
after network fees and may not be simultaneous with the customer payment.

## Explicitly not done

- No real BTCPay Server is provisioned or connected.
- No keys, supplier wallets, recipient identities or payout entitlements
  have been inserted into hosted Supabase or Vercel production.
- No real three-wallet split has been executed.
- No Prism admin-API rule updater, activation, rule freeze/drain,
  invoice writer, payment webhooks, settlement attestation or supplier
  fulfillment authorization has been introduced by these tests.
- A green simulation cannot substitute for legal merchant/product/
  supplier and carrier eligibility checks.

After this CI test passes, next steps are to provision an approved
single BTCPay server/store, verify three independently controlled wallet
destinations and operator rights, configure the **read-only** Greenfield
connection via secret-managed Vercel settings, and design a reversible,
frozen admin payout-rule activation process with on-chain reconciliation.
Only later consider real funds and only with independent regulatory
clearance and payment merchant acceptance.

Relevant references:
- `docs/APEX_SHARED_BTCPAY_THREE_WAY_SPLIT_20261106.md`
- `docs/BTCPAY_PR162_REAL_PRISM_FORWARDING_20261102.md`
- `docs/APEX_EXECUTION_CHECKPOINT_2026-11-06.md`
