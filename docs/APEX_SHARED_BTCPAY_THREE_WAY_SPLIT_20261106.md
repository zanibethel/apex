# Apex shared BTCPay store — three-recipient split draft (November 6, 2026)

## Approved planning default

One BTCPay Server store receives the hypothetical customer payment. Apex
allocates **10% platform / 45% Lily / 45% Tierra**, with the admin able to
adjust Lily's share of the full payment and Tierra automatically receiving
the rest of the **90% supplier pool**. Example on an agreed $100 allocation
base: Apex $10, Lily $45, Tierra $45. This is a planning rule, not evidence
that a real payment can be split or that network fees have been covered.

The platform share remains exactly **1000 basis points** of the allocation
base. Positive Lily and Tierra percentages must sum to **9000 basis points**;
the entire rule sums to **10000 basis points**. The admin must explicitly
choose **one active platform payout recipient** and **two distinct active
supplier payout recipients**. These are internal identities, not proof of
wallet ownership. The configuration attaches to one **Apex storefront**
and does not require separate BTCPay provider stores.

## Where admins configure it

Visit `/admin/splits/configure` (verified Apex platform admins only).
The dedicated first section shows the default three-way breakdown and lets
admins change Lily's share (Tierra auto-balances). It makes recipients
explicit. Saving creates a new version of a **draft** via existing
`save_payout_rule_draft` RPC only when the existing admin database review
and `APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED=true` gate permit drafts.
The server validates scope, recipients' actual types, percentages and
distinct IDs even if a browser changes hidden form fields. The existing
general multi-recipient proposal editor remains available under Advanced.

**No hosted schema migration or seeded recipient identities in this PR.**
No live rule activation, BTCPay connection, wallet keys, on-chain payment,
checkout release, order settlement, shipment, or automatic transfer is added.

## Frozen test-only allocation records

`src/lib/payments/apex-shared-three-way-split-v1.mjs` builds a validated
draft with fixed platform basis points and provides a **regtest-only**
non-executing entitlement snapshot. The snapshot records rule version,
order reference, storefront identity, exact recipient IDs, individual
basis points, integer satoshi entitlements and their sum. The test helper
cannot call Prism or create payouts, and retains all execution flags false.

A revised draft must create a **new version** instead of rewriting an older
version; future live orders will need a separate immutable database snapshot
pinned before attempting provider invoice creation, as well as an audited
freeze/drain process to avoid applying new rules to already-pending invoices.

The example allocation uses **gross test satoshis** only. Real settlement
requires agreed fee/refund bases, FX timestamp rules, safe UTXO/network fee
reserves, minimum payout outputs and independent wallet confirmations. Do
not promise a real recipient receives the gross preview amount.

## Remaining payment work

1. Confirm **one** production BTCPay store/merchant authority and a
   read-only Greenfield connection in `/admin/btcpay`; configure scoped
   credentials outside code, with independent read and invoice-writer roles.
   The legacy mapping currently assumes unique provider stores per Apex
   store; one Apex storefront is sufficient for this initial setup.
2. Independently verify recipient wallet ownership, supplier identity,
   product legality and carrier/merchant payment restrictions. A supplier
   label, product title or "research" claim is not sufficient authorization.
3. Extend the existing **two-recipient Prism regtest** to a fully evidenced
   **three-wallet regtest** test: three plugin-originated payout claims,
   exact deterministic amounts, independent on-chain receipt confirmation,
   duplicate/unknown claims held, underpayments and network-fee holds.
4. Implement an administrator-reviewed activation workflow that ensures
   no previous unsettled invoice can be repriced/reallocated by changing a
   Prism rule. Freeze and reconcile all pending provider entitlements before
   creating new invoice payouts.
5. Build independently authenticated provider settlement and refund/reversal
   evidence, ledger and reconciliation. Keep real checkout, real payouts and
   fulfillment disabled until all required gates pass.

See `docs/PAYMENTS_AND_LEDGER.md`,
`docs/BTCPAY_PR162_REAL_PRISM_FORWARDING_20261102.md`,
and `docs/APEX_EXECUTION_CHECKPOINT_2026-11-06.md`.
