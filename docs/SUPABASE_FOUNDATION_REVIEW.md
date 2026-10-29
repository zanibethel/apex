# Apex Supabase database foundation — review gate

**Status:** SQL source drafted on GitHub. **Not migrated or linked to a database.**

## Account inventory, October 29, 2026
The connected Supabase account currently contains CreatorHub, RaiseHub, Teacher Test Studio and CoOperative. No `Apex` project was found. Never apply this SQL to one of the other projects. The existing single visible organization is **zanibethel's Org** (`lapovwewsjmkuhvyowtv`); creation and billing require explicit organization selection and the provider's actual cost confirmation.

## SQL scope

File: [database/sql/apex_catalog_foundation_review.sql](../database/sql/apex_catalog_foundation_review.sql)

- Supplier and store identity, store-scoped categories/products and private inventory.
- Auth-user memberships assigned only by a trusted administrator.
- Public catalog can read only published products/categories in public stores.
- Authenticated supplier users can read only records belonging to their own supplier(s).
- All six tables enable RLS; Data API roles have **SELECT only**, with no write policies in phase one.
- No order, payment, wallet or live checkout tables are enabled.
- No real product names, customer data, keys or supplier details are stored in GitHub.

## Before any migration

1. Confirm the Supabase organization, project creation cost, region and account payer.
2. Create a **dedicated** Apex project with no shared database.
3. Generate a proper migration filename using the Supabase CLI `supabase migration new apex_initial_catalog`, place this reviewed SQL inside it, and add the CLI-generated file to source control.
4. Apply via a separately reviewed migration action, verify all six RLS flags and role grants, and run authenticated/anon isolation tests with at least two synthetic supplier identities.
5. Run Supabase security/performance advisors, then capture pass/fail evidence. **Do not** permit real supplier data until isolation tests pass.
6. Only after that, add the project's **publishable** URL/key to Vercel development/preview environments. Never expose secret/service-role keys with `NEXT_PUBLIC_`.

## Explicit access matrix

| Actor | Supplier/member table | Published public catalog | Unpublished catalog | Stock | Write |
|---|---|---|---|---|---|
| Anonymous | No | Yes | No | No | No |
| Authenticated, not a member | Self membership row (none) | Yes | No | No | No |
| Supplier A member | Supplier A / self membership | Yes | Supplier A only | Supplier A only | No |
| Supplier B member | Supplier B / self membership | Yes | Supplier B only | Supplier B only | No |

**Important:** SQL is review-only. It has not been run or integration-tested against Supabase. Static source guardrail tests are not a substitute for PostgreSQL/RLS tests.
