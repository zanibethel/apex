# Infrastructure and cost model — initial estimate

**Not vendor quotes or confirmed recurring bills.** Figures below reflect the previously drafted 2026-10-29 proposal and must be refreshed before purchase. All actual charges depend on selected plans, billing cadence, taxes, usage, network fees and renewal pricing.

| Service | What it does | Initial planning amount |
|---|---|---:|
| Vercel Pro | Next.js storefront and hosted API | $20/month |
| Supabase Pro | Database, authentication, storage and access policies | $25/month |
| DigitalOcean Basic VPS | BTCPay + Prism + Bitcoin services | $24/month |
| Daily VPS backup | Cloud backup of server | $7.20/month |
| Proton Workspace Standard, one annual-billed seat | Business email, staff VPN/password tools | $12.99/month equivalent; billed annually |
| GitHub Free | Source control, PR review and limited CI | $0 to start |
| Resend Free (optional) | Programmatic notifications | $0 to start, usage caps apply |
| WireGuard | Restricted server admin tunnel | $0 license |
| BTCPay Server and Prism | Bitcoin invoicing and payout forwarding | $0 software license; network/operational costs remain |
| Standard .com domain | Public storefront name | Plan about $11–$25/year subject to availability/renewals |

**Base monthly equivalent: ~$89.19** = $76.20 month-billed hosting + $12.99 annual-billed Proton equivalent. Plan a **$100–$125/month service allowance** for early operation, excluding variable network fees and separately approved upgrades. These are *not* proof of a settled commercial agreement or guaranteed all-in operating costs.

## Hosting
A 2-vCPU/4-GB-RAM/80-GB SSD Linux VPS is the initial budgeting candidate, not a tested sizing guarantee. Validate pruning, Bitcoin node storage consumption, growth, backup retention and restore. BTCPay must run on a continuously available service separate from Vercel.

## Operational responsibilities
- Infrastructure payer and ownership of the domain/accounts: **requires written partner agreement**.
- Operator: code, deployment configuration, baseline monitoring/maintenance within agreed scope.
- Supplier: its product content/inventory, fulfillment/customer service and product-related refund operations, subject to the agreed terms.
- No guaranteed six-week live payment date; third-party approvals and signer/security checks are external gates.
- Budget for a build period before any revenue; do not count speculative commission receipts as funding for hosting.

## Provider references for re-pricing
- https://vercel.com/pricing
- https://supabase.com/pricing
- https://www.digitalocean.com/pricing/droplets
- https://docs.digitalocean.com/products/backups/details/pricing/
- https://proton.me/business/plans
- https://github.com/pricing
- https://resend.com/pricing
- https://porkbun.com/products/domains
- https://docs.btcpayserver.org/
- https://plugin-builder.btcpayserver.org/public/plugins/prism
