# Track 2 → Track 3: eligible order read handoff v1 (PR #303)

## Current authority boundary

This is **a read-only blocked readiness response**, not an eligible order queue.
The existing original order, purchased-line and held-review shipment IDs are
stable identifiers, but their existence supplies no independent payment,
product, supplier or transport eligibility evidence. A recorded sale state of
`confirmed` is not payment processor settlement. A sealed delivery record
does not authorize address access. Held shipment review plans remain separate.

RPC: `public.get_supplier_eligible_order_readiness_v1(p_store_id uuid)`.
It requires a signed-in supplier membership scoped to that store and the
existing private release gate to remain OFF. Returns contract version 1,
original held-order count, `eligible_order_count: 0`,
`eligible_orders: []`, and
`blocker: independent_eligibility_evidence_not_integrated`.
A missing RPC, malformed result or source conflict must be displayed as
**unavailable**, never as zero eligible or ready to ship.
No customer PII, delivery envelope, payment token or shipment detail is exposed.

**No writer is added.** The supplier dashboard shows the missing evidence
boundary without unlocking checkout, tracking, postage or shipment transitions.

## Requirements before Track 2 may propose v2 eligible records

An independently authenticated, append-only source must bind:
- original (supplier store ID, order ID, purchase time) and all immutable line IDs;
- exact line quantities, amounts and source version with reconciliation;
- payment provider identity, validated final settlement evidence, refund/reversal
  observations, and idempotent event identity (never `sale_state` alone);
- per-line merchandise and transport authorization plus supplier authority
  verified independently of the supplier's own checkbox or claims;
- an separately authorized protected delivery-envelope reference, never
  plaintext address in the queue;
- current authorization revision and revocation handling. A stale, refunded,
  revoked, held, cross-store or incomplete record must fail closed.

Only after Track 2 supplies and tests that source can a future v2
read-only queue project eligible records. It must be bounded and membership
scoped, avoid exposing PII, and reconcile multiple shipments against the
original purchased lines. Actual tracking, labels, shipment transitions and
carrier interactions remain distinct audited work, subject to separate
eligibility and legal authorization gates.

## Verification and rollout

Node tests validate the parser's exact blocked shape and reject forged
eligibility, new capability flags, wrong stores, extra keys and bad counts.
PostgreSQL fixtures verify membership and anonymous denial, current held records
never enter the eligible lane, and no direct internal-table grants. CI must
apply the migration in disposable PostgreSQL after PR #302's ledger. Production
migration readback and production commit checks are separate release gates.

See Issues #214, #215, #216–#219 and
`docs/APEX_EXECUTION_CHECKPOINT_2026-11-06.md`.
