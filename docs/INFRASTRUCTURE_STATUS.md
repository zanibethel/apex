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

## Supabase: Apex catalog foundation migrated and verified
- Four connected projects exist: CreatorHub, RaiseHub, Teacher Test Studio, CoOperative. **Do not migrate Apex SQL into them.**
- One visible organization: `zanibethel's Org` ID `lapovwewsjmkuhvyowtv`.
- **Created and verified October 29, 2026:** project `Apex`, ID/ref `fhqpkpztercadcxspdkg`, in organization `lapovwewsjmkuhvyowtv`, region `us-east-1`. Supabase reports `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003 GA. [Apex dashboard](https://supabase.com/dashboard/project/fhqpkpztercadcxspdkg).
- API URL (not a secret): `https://fhqpkpztercadcxspdkg.supabase.co`.
- Pre-migration baseline: public tables **0**, migrations **0**. After the user's explicit follow-up authorization (“Ok go”), the initial catalog migration was applied successfully October 29, 2026.
- **Deployed migration:** `20261029233701_apex_initial_catalog_readonly` (recorded by Supabase). Exact executed SQL bytes are preserved in [supabase/migrations/20261029233701_apex_initial_catalog_readonly.sql](../supabase/migrations/20261029233701_apex_initial_catalog_readonly.sql) and the reviewed original [SQL source](../database/sql/apex_catalog_foundation_review.sql). These SQL headers reflect their original pre-deployment review state; this registry records the current deployment state.
- **Post-migration verification:** six empty tables in `public`: `suppliers`, `stores`, `supplier_memberships`, `categories`, `products`, `inventory_items`; RLS is enabled on all six; no `INSERT`, `UPDATE`, or `DELETE` privilege is granted to the `authenticated` application role; anonymous reads are limited to public catalog tables and by RLS to published records; no anonymous stock/supplier access. Supabase project status `ACTIVE_HEALTHY`.
- The organization is on Pro. Supabase quoted an additional **$10/month** for project creation; user explicitly approved this recurring cost prior to creation. Potential usage charges depend on actual consumption.
- The tenant-isolated first schema is now deployed. PostgreSQL tenant-isolation CI passed before deployment. The Supabase post-deployment catalog/RLS/privilege checks passed; actual cross-supplier RLS with real Supabase Auth accounts remains an integration gate before onboarding suppliers.

## Cost and shipping posture
- User reports an initial **$150** secured; bank receipt/terms not independently verified.
- A new Apex Supabase project has been provisioned after user approval of the **$10/month recurring charge**; actual invoice amounts and charges were not inspected. No domain purchase or BTCPay VPS was ordered.
- New Vercel project is on an **existing Pro team** and may consume billable usage. We did not verify actual charges or invoice totals. Do not represent the full $150 as available cash.
- All routes are concept/demo-only; no live products, checkout, wallets, supplier accounts or customer data.

## Next checkpoints
1. Review the three stacked PRs in order and preserve their approval history.
2. **Completed:** Dedicated Apex project and six-table, RLS-enabled catalog migration. Migration history is `20261029233701_apex_initial_catalog_readonly`.
3. **Completed:** Disposable PostgreSQL 17 multi-supplier RLS tests and post-deployment Supabase catalog/RLS/privilege checks. Supabase security advisor has **0 findings**; no actual supplier data added. **Next gate:** integration testing against Supabase Auth with synthetic accounts before real onboarding.
4. Populate the preview-only Supabase publishable URL/key in Vercel; no service/secret key in client code.
5. Walk through protected mobile demo, then develop searchable sample catalog.

## Isolated SQL review CI — October 29

- Proposed SQL and RLS integration tests are in draft [PR #14](https://github.com/zanibethel/apex/pull/14), updated with a second PostgreSQL 17 CI job.
- Both GitHub CI jobs passed for commit `1c9871a` ([run 40973052156](https://github.com/zanibethel/apex/actions/runs/40973052156)).
- The CI instance is disposable: it creates only synthetic Alpha/Beta suppliers and mock auth accounts, never uses Apex Supabase credentials, and never pushes data to the hosted project.
- Historical pre-migration check confirmed **zero public tables, zero migrations, ACTIVE_HEALTHY**. The subsequent explicitly approved migration is documented above.
- Supabase post-migration security advisor returned **0 findings**. Performance advisor returned three WARN findings for **multiple permissive SELECT policies** (on stores, categories and products), five INFO notices for indexes unused on the empty schema, and an existing INFO notice about Auth connection allocation. Optimize overlapping policies in a separately reviewed follow-up; do not alter them in this migration. [Policy performance advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies); [index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- **No additional migrations, real data imports or permission changes are authorized by this pass.**
