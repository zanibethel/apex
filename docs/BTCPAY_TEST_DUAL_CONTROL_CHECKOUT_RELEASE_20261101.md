# PR #123 — two-admin checkout release simulation (disposable-only)
Date: November 1, 2026

**NO PRODUCTION ACTIVATION. NO hosted Supabase migration, deployed checkout change, Prism settings write, real wallet, payment, funds transfer or merchant authorization.**

## What this proves

PRs #119–#122 built synthetic admin review, an immutable storefront invoice-creation hold, read-only BTCPay/Prism regtest reconciliation, and append-only recovery evidence. This pass adds a two-person authorization contract for a *future checkout resumption* while deliberately retaining PR #120's actual invoice INSERT blocker.

A vetted admin creates a release request pinned to: storefront UUID, source immutable rule UUID/version, exact canonical recipient allocations, and the most recent append-only recovery audit event ID. A different independently vetted platform admin must countersign. The countersignature is rejected if any of those facts have changed, if a new evidence/incident entry arrives, if the rule is no longer the reviewed draft, if a prior invoice/transfer is not final, or if the recovery sequence does not include the required readback/wallet/operator review. A storefront advisory transaction lock serializes the checks against test invoice registration, review events, and competing release operations.

The acceptance status is deliberately named `simulation_ready_hold_remains_active`. **It is NOT an instruction to issue a Bitcoin invoice.** The original test invoice insert trigger continues to block every invoice on a held store. The SQL fixture does not change that trigger.

## Files

- `database/sql/apex_btcpay_test_dual_control_release_REVIEW_ONLY.sql`: isolated PostgreSQL schema, RLS, immutable requests/approvals, role-checked request and countersign RPCs, and a private read-only readiness preview.
- `tests/payout-rls/btcpay-dual-control-release.sql`: exact audit-head matching, self-approval denial, forged admin role denial, distinct approved administrator cosign, confirmation that test invoice INSERT remains blocked, late incident revocation, stale request denial and immutable audit record enforcement.
- `.github/workflows/payout-rls.yml`: executes the new isolated SQL suite after the PR #122 recovery audit tests.

## Security boundaries and remaining work

1. **Synthetic evidence is not independently authenticated.** Prior test events use arbitrary SHA256 placeholders. Status labels and hashes alone are never valid proof of real BTCPay/Prism state. This pass has no production evidence collector and no supported Prism settings-changing API.
2. The fixture trusts synthetic PostgreSQL `auth.jwt()` metadata and admin memberships; real Supabase tokens, admin MFA/step-up auth, key custody and separation of duties still need review and tests. A single person operating two test accounts does not provide real human-independent approval.
3. No actual checkout resume happens here. The shared storefront hold remains immutable and continues to block even synthetic invoice INSERT. Future implementation must explicitly enforce the same lock before **every external** BTCPay Greenfield invoice POST, including all third-party callers; only then can a production-safe unlock be designed.
4. A future unlock must use authoritative provider finality and configuration readback, audit-head compare-and-swap, safe interruption recovery, and a re-lock-on-incident path. Direct Prism database writes and form-cookie scraping are not production solutions.
5. No money movement, bitcoin mainnet request, auto payout, deployment, hosted database change or spending.

## Acceptance

Require exact-head Apex quality, isolated PostgreSQL/RLS, and real upstream BTCPay/Prism regtest regressions before reviewing draft PR for merge. Do not merge stacked drafts or deploy without independent dependency review and explicit permission. Passing simulated dual control does not authorize customer checkout or regulated product sales.

Parent: #122; dependencies: #121, #120, #119, #118, #117.
