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

## Supabase: existing account reviewed, Apex not provisioned
- Four connected projects exist: CreatorHub, RaiseHub, Teacher Test Studio, CoOperative. **Do not migrate Apex SQL into them.**
- One visible organization: `zanibethel's Org` ID `lapovwewsjmkuhvyowtv`.
- An actual Apex project is **NOT YET CREATED**. Obtain the user's organization selection, actual cost confirmation when required, desired region, and payer authorization before creating.
- The tenant-isolated first schema is saved in [Supabase review](SUPABASE_FOUNDATION_REVIEW.md) and must receive database integration tests before migrations are applied.

## Cost and shipping posture
- User reports an initial **$150** secured; bank receipt/terms not independently verified.
- No domain purchase, Supabase new project, BTCPay VPS, or paid subscription authorized/ordered through this work.
- New Vercel project is on an **existing Pro team** and may consume billable usage. We did not verify actual charges or invoice totals. Do not represent the full $150 as available cash.
- All routes are concept/demo-only; no live products, checkout, wallets, supplier accounts or customer data.

## Next checkpoints
1. Review the three stacked PRs in order and preserve their approval history.
2. Confirm which Supabase organization should own Apex, look up actual cost, and create only after confirmation.
3. Generate a formal migration via Supabase CLI; apply only to **new Apex project**, test multi-supplier RLS and run security advisors.
4. Populate the preview-only Supabase publishable URL/key in Vercel; no service/secret key in client code.
5. Walk through protected mobile demo, then develop searchable sample catalog.
