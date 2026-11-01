# PR #124 — one-shot regtest journal resume and concurrency fence (2026-11-01)

**DRAFT / DISPOSABLE POSTGRES ONLY. Not a hosted Supabase migration. No live checkout, BTCPay Greenfield POST, Prism setting edits, wallet operations or payout.**

## Scope

PR #123 required two different vetted test administrators to sign a pinned immutable rule and audit-head snapshot. PR #124 adds the **next narrowly bounded experiment**: a private operator can issue exactly one synthetic *PostgreSQL journal invoice registration permit* for a store after both signatures and current evidence are rechecked under the same per-store advisory transaction lock.

This does **not** create a BTCPay Server invoice and is not a live checkout resume. All external invoice creation sources remain outside the fence, and the immutable PR #120 store hold remains present at all times.

The single-use permit is **additional authorization** beyond two administrators' signatures. Without it, the original on-hold invoice trigger rejects every insert, even after both approvals.

## Tests and data contract

- `database/sql/apex_btcpay_test_atomic_resume_fence_REVIEW_ONLY.sql`: private, read-only-to-admin resume permit records, `open|consumed|revoked` states, private operator issue function, and revised disposable invoice INSERT trigger that takes the original `storefront:<uuid>` advisory transaction lock and revalidates the two-admin and exact pinned evidence snapshot. An AFTER INSERT consumes the permit **in the same transaction**; failed inserts leave the permit unconsumed and cannot create an invoice. Any NEW append-only recovery audit event atomically revokes an unused open permit. Terminal permits can never be reopened or deleted.
- `tests/payout-rls/btcpay-atomic-resume-fence.sql`: constructs three distinct held synthetic stores; verifies two-admin approval alone does not register invoices, a testnet request cannot use a regtest permit, exactly one regtest journal INSERT succeeds, second insert is blocked, late unknown provider event revokes another unused permit, browser/supplier privileges remain restricted, and original hold/payout-rule status remain unchanged.
- `tests/payout-rls/btcpay-atomic-resume-concurrency.sh`: **real simultaneous PostgreSQL connections**, not mock concurrency. Session A countersigns while holding the store advisory lock and B tries to register an invoice; B must wait and then reject because no operator permit exists. Then a private operator issues one permit, A registers one journal invoice in a transaction and holds the lock, B attempts a competing insert, waits, and must reject after A commits/consumes the permit. The final durable state has exactly one journal invoice, one consumed permit, and the immutable hold still present.
- `.github/workflows/payout-rls.yml`: executes both new suites after PR #123 fixture tests.

## Safety properties — precise limits

1. **This is not an actual payment or checkout**. Only a synthetic regtest PostgreSQL invoice *reference* is inserted after approval. The trigger does not call or protect BTCPay's independent Greenfield API invoice creation, and no new Next.js route uses it.
2. **Fail-closed per request**. No temporary global unlock flag, no time-based lease or external automatically unlocked checkout. Any new audit event permanently revokes an unused permit in its own transaction; the shared advisory lock serializes event writing and invoice journal writes.
3. **Immutable hold survives**. An allowed single test journal insert does not change the underlying `btcpay_test_split_sync_holds.status='held'`, rule status, Prism percentage, or any payment record.
4. **SQL-only test operator**. Creation of the permit is not granted to any authenticated browser, supplier or public user. Existing admin review tests are unchanged and pass before new fixture.
5. **Synthetic evidence cannot be trusted in production**. Audit rows contain placeholder SHA256 strings rather than independently authenticated provider/chain attestations. No verification of real operator identity, MFA, cross-system atomicity or true Prism supported settings API is provided.
6. **Still missing before a genuine rollout**: hard fencing of EVERY external invoice writer before Greenfield POST, authoritative provider invoice + payout inventory, independent receiving wallet proof, crash-safe provider configuration readback, service authorization and separate legal/merchant/payment provider approvals.

## Acceptance

All three exact-head checks required: application quality, isolated PostgreSQL/RLS plus real concurrent sessions, and disposable upstream BTCPay/Prism regression. Keep draft, unmerged, undeployed. Passing these synthetic checks does not authorize real transactions or removal of payment restrictions.

Parent: PR #123; stacked dependencies: PRs #122/#121/#120/#119/#118/#117.
