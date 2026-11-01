# Real BTCPay signed webhook → disposable PostgreSQL persistence (2026-11-01)

**DRAFT. Test-only GitHub-hosted regtest. No hosted Supabase migration, production checkout or payout.**

This branch stacks on the proven real BTCPay signed-webhook test (#112), and temporarily brings in review-only receipt and order-status SQL from #107 and #113 so a disposable PostgreSQL 17 service can verify the **whole** path. The duplicated stacked patches require an orderly rebase before merge.

The GitHub runner initializes a synthetic Postgres database completely separate from BTCPay's own development Postgres. It then starts BTCPay and Bitcoin Core on regtest, creates a synthetic merchant and a 10,000-satoshi invoice, saves an immutable local order snapshot, pays with mined regtest coins, receives a real HMAC-signed `InvoiceSettled` webhook, re-fetches the actual invoice from Greenfield, atomically commits a private receipt/observation/status/history transaction, and only then replies HTTP 200. Duplicate signed deliveries, tampered signatures and signed wrong-store events must not add records. The final assertion queries actual persisted tables: exactly one receipt, observation and history entry; status `settled_reported` at revision 1. Data is destroyed after the job.

This demonstrates a synthetic **status display**, never payment authorization. No customer order is fulfilled, no real money is credited and no Prism supplier split occurs. Admin payout rules remain draft/configurable, not hardcoded 90/10.

Design boundaries: SHA-256 payload hash only, no private wallet mnemonics or webhook secret in DB/logs; SQL parameters quoted as literals via psql; private SECURITY INVOKER writer never granted to browsers; fail closed on DB error; bounded localhost SSRF exception for the ephemeral runner only. No production or Vercel secrets are used.

Before production, consolidate overlapping PRs, replace the disposable postgres-superuser worker with a narrowly privileged and externally secured private identity, test crash/restart and settlement revisions, validate actual order quote/FX snapshots and review wallet/commercial compliance; no live checkout here.
