# Apex — environment and provider connection registry

**Last verified:** October 29, 2026

## Source
- Repository: `zanibethel/apex` (public; do not commit personal, supplier, payment or signing secrets).
- Review chain: [planning PR #1](https://github.com/zanibethel/apex/pull/1) → [app PR #13](https://github.com/zanibethel/apex/pull/13) → [database review PR #14](https://github.com/zanibethel/apex/pull/14).
- None of these draft PRs was merged as of this entry.

## Vercel: created, branch build READY
- Team: `zanibethels-projects`, ID `team_AH72aX1BaaPucIOvrSgvpEhw` (existing Pro account).
- Project: `apex`, ID `prj_LD1S8gNT7oplIymAcuR7LtpJ8VSj`.
- Linked GitHub repository: `zanibethel/apex`, verified in Vercel Git deployment context.
- Framework: Next.js; Node.js 22.
- Deployment: `dpl_F1WnvY2A8TnGpro3WmQqQLgAamLP`, source `feat/initial-nextjs-shell-2026-10-29`, SHA `7b27eb27581eac81b88c2fc950b376d580d39a8e`.
- Build state: READY. [Vercel deployment inspector](https://vercel.com/zanibethels-projects/apex/F1WnvY2A8TnGpro3WmQqQLgAamLP).
- **Important**: Although requested for an internal development preview, Vercel assigned this first deployment **target=production** and system aliases. In response, the entire Apex project was configured with Vercel Authentication / SSO **deploymentType=all**. It is NOT approved for public traffic or real checkout.
- No custom domain has been purchased or attached. No Supabase runtime variables or payment credentials have been set.
- Subsequent source reviews must pass CI and receive explicit deployment/visibility approval before changing protection or opening commercial traffic.

## Supabase: separate Apex project created, no schema migration
- Four connected projects exist: CreatorHub, RaiseHub, Teacher Test Studio, CoOperative. **Do not migrate Apex SQL into them.**
- One visible organization: `zanibethel's Org` ID `lapovwewsjmkuhvyowtv`.
- **Created and verified October 29, 2026:** project `Apex`, ID/ref `fhqpkpztercadcxspdkg`, in organization `lapovwewsjmkuhvyowtv`, region `us-east-1`. Supabase reports `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003 GA. [Apex dashboard](https://supabase.com/dashboard/project/fhqpkpztercadcxspdkg).
- API URL (not a secret): `https://fhqpkpztercadcxspdkg.supabase.co`.
- Verified via direct project inspection: `public` tables **0**, migrations **0**. **Explicit user hold: do not run database migrations yet.**
- The organization is on Pro. Supabase quoted an additional **$10/month** for project creation; user explicitly approved this recurring cost prior to creation. Potential usage charges depend on actual consumption.
- The tenant-isolated first schema is saved in [Supabase review](SUPABASE_FOUNDATION_REVIEW.md) and must receive database integration tests before migrations are applied.

## Cost and shipping posture
- User reports an initial **$150** secured; bank receipt/terms not independently verified.
- A new Apex Supabase project has been provisioned after user approval of the **$10/month recurring charge**; actual invoice amounts and charges were not inspected. No domain purchase or BTCPay VPS was ordered.
- New Vercel project is on an **existing Pro team** and may consume billable usage. We did not verify actual charges or invoice totals. Do not represent the full $150 as available cash.
- All routes are concept/demo-only; no live products, checkout, wallets, supplier accounts or customer data.

## Next checkpoints
1. Review the three stacked PRs in order and preserve their approval history.
2. **Completed:** New Apex project created and verified (healthy, no public tables or migrations). Keep it isolated from all other projects.
3. **On hold per user instruction:** Review SQL and RLS test matrix; only after a separate go-ahead generate a formal migration via Supabase CLI, apply it to the Apex project, test multi-supplier RLS and run advisors.
4. Populate the preview-only Supabase publishable URL/key in Vercel; no service/secret key in client code.
5. Walk through protected mobile demo, then develop searchable sample catalog.
