# Technical architecture (proposed)

```text
Browser
  -> Launch domain / Vercel / Next.js storefront
     -> Supabase Auth + Postgres + private object storage
     -> server-only checkout adapter -> BTCPay Server (separate VPS)
                                      -> Prism payout forwarding
                                      -> supplier BTC destination
                                      -> platform BTC destination
     <- signed/verified payment callback -> idempotent payment ledger
Operator/supplier dashboards -> role-checked server access -> Supabase
Business mail: Proton Workspace | automated transactional email: optional Resend
Payment server administration: restricted WireGuard/private access
```

## Hosting boundaries
- **Vercel** serves Next.js UI and approved server-side API routes; no crypto spending secrets in client bundles.
- **Supabase** owns products, stores, user roles, carts, orders, stock, signed price quotes, payment events, payout reconciliation and audit logs. Enforce RLS and additional server checks.
- **DigitalOcean VPS** (planned 2 vCPU/4 GB/80 GB, verify actual Bitcoin node disk usage) hosts BTCPay, Prism and Bitcoin services. It must not be treated as a generic free or serverless Vercel function.
- **Proton Workspace** for business mail, password/vpn services; **WireGuard** for private administration. Public checkout endpoints still need HTTPS.
- **GitHub** holds code/plans, not secrets; CI includes type checks/tests and security scan.

## Supplier isolation
Tables and scoped storage use explicit `supplier_id` and `store_id` from day one. Authorization must be enforced on the server and via RLS—not merely hidden dashboard links. Add future suppliers as separate domains/brands and preferably separate BTCPay stores with audited permission boundaries.

## Payments: proposed, NOT production-proven
BTCPay creates Bitcoin invoices and observes incoming confirmed payments. Prism may forward balances to configured destinations with delay/batching and requires authorized transaction signing. Do not assert a single on-chain customer transaction pays both parties directly. The payment adapter must verify actual payout transactions and handle partial, failed, replaced, underfunded and delayed transfers.

Keep the customer invoice, blockchain receipt, owed split amounts, outgoing transfers and refunds as *different ledger events*. Use integer satoshi amounts and USD-cent snapshots. See [payments](PAYMENTS_AND_LEDGER.md).

## No-custody preference and open risk
Aim to minimize platform control of supplier funds; confirm actual custody, payout-signing rights and any licensing/money-transmission consequences of any interim hot-wallet forwarding setup. A watch-only receiving wallet cannot sign automatic outgoing Prism payouts. Do not deploy production wallet keys until independently reviewed.

## Future migration seam
Wrap Bitcoin features behind a payment provider interface. No customer/supplier dashboard should need to know Prism internals. A hosted or noncustodial alternative may replace Prism if tests or authorization fail.
