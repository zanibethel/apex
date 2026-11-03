# PR #174 — crash-safe, independently reviewed provider reconciliation (regtest only)

**November 2, 2026.** This is an isolated PostgreSQL/BTCPay/Bitcoin disposable-regtest test pass, not a production migration. It does not enable customer checkout, supplier payments, BTCPay mainnet, payout-rule activation or invoice retries.

## Why this pass is necessary

Previously the test worker could call its observation RPC with only an invoice-intent UUID. An operator could also use the privileged fixture SQL connection after a crash to append an invoice ID without a separate, verifiable recovery approval. Both were audit gaps.

## New boundaries

1. The worker's existing single-use durable SQL reservation now mints a random 64-character **in-process observation capability**. Only a SHA-256 digest is stored in the RLS-protected PostgreSQL table; the raw capability is returned only to the *original* process. The worker must supply it to append its initial invoice observation or unknown-outcome observation. It is consumed atomically, so a replacement worker cannot re-read it or issue a second observation. The worker's old unguarded reserve/observe RPCs are revoked.
2. After a real worker process dies following an accepted Greenfield POST, its original observation capability is lost. A replacement can neither reserve a second POST nor record a readback with the absent token.
3. The isolated operator side has two separately authenticated **PostgreSQL LOGIN** roles: `apex_test_recovery_requester` and `apex_test_recovery_reviewer`. Each gets a different per-run random masked password; neither can access the underlying payment, recovery, or capability tables directly. Two private, non-exposed, fixed-purpose SECURITY DEFINER RPCs enforce a database-authenticated `session_user`, rather than a caller-supplied actor name.
4. The first role can request a recovery for exactly one previously reserved immutable intent, consumed permit, bound regtest store and still-held storefront. It stores the precise provider invoice ID and hash of independently verified readback. A second role may approve only the **same** evidence digest after performing its own authenticated read-only provider GET. Both actions hold the storefront's PostgreSQL advisory lock and use immutable request/approval records. Approval and the invoice-readback append happen in a single transaction.
5. Mismatched evidence, repeated approval, same-role attempts, an already-observed invoice, a missing hold or a wrong store fail closed. Recovery **never** reopens checkout, issues a second provider POST, changes the payout split or enables fulfillment.

## CI checks

- Application Guardrails/unit tests verify the isolated runner gates, input validation, no token leakage to SQL, the role-based API boundary and mismatch failure.
- Actual isolated PostgreSQL checks role attributes/grants, denied privilege escalation, denied `SET ROLE` identity spoofing, disabled direct table writes and the worker's old unguarded RPCs. A synthetic timeout creates an unknown outcome; a separate requester connection logs a simulated readback, a different reviewer connection rejects mismatched evidence, and a matching review appends one immutable readback. Replay fails, all payment holds and draft rules remain unchanged.
- The existing actual BTCPay/Prism upstream suite still tests on-chain 90/10 and 85/15 payments and legitimate provider invoice creation. Its *separate-process* crash test reads the accepted invoice twice through authenticated, scoped GET requests. It hashes a canonical scope/order/amount/status record, requires matching hashes through the two operator logins and verifies the same durable invoice was recorded once. The original worker capability must remain unused after process death, and the restarted worker must still refuse any second provider POST.

## Important limitations

This is **synthetic operator independence inside the same GitHub Actions runner**: the test controller can provision both passwords and perform both authenticated GET requests. It is not proof of two independently authenticated humans, a trusted third-party receipt attestation, an external HSM, a secret vault, physical credential isolation, or production-grade separation of duties. The SQL functions validate the append-only records, but only the controller's Greenfield GETs inspect actual provider metadata and Bitcoin amount; PostgreSQL cannot independently attest BTCPay API responses or prevent another API key from creating outside invoices. A production rollout needs two real operator identities and access reviews, separate privilege domains, credential revocation, monitored provider-writer inventory, incident workflows, and actual merchant approvals.

Do **not** copy any `database/sql/*_REVIEW_ONLY.sql` file to hosted Supabase migrations. All source remains reviewable as one PR. Merge only after latest exact-head app, isolated PostgreSQL, real on-chain BTCPay/Prism crash recovery, and Vercel checks succeed.
