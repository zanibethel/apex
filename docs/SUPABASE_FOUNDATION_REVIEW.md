# Apex Supabase database foundation — review gate

**Status:** SQL source drafted on GitHub. **Not migrated or executed.** A dedicated Apex project now exists, but has **zero public tables and zero migrations**.

## Account inventory, October 29, 2026
The connected Supabase account currently contains CreatorHub, RaiseHub, Teacher Test Studio and CoOperative. A dedicated **Apex** project was created later on October 29 after the user approved Supabase's quoted **$10/month** recurring cost: `fhqpkpztercadcxspdkg`, region `us-east-1`, organization **zanibethel's Org** (`lapovwewsjmkuhvyowtv`). Supabase confirms `ACTIVE_HEALTHY`, zero public tables and zero migrations. Never apply this SQL to any of the four existing unrelated projects.

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

1. **Done:** Project created in `zanibethel's Org` with user approval of $10/month; region `us-east-1`.
2. **Done:** A dedicated Apex project exists and has no shared tables. **User explicitly says do not run migrations yet.**
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

## Executable PostgreSQL isolation tests (review change)

The initial node tests merely checked SQL strings. The updated CI now includes a **second, disposable PostgreSQL 17 job** running `database/tests/catalog_rls_integration.sql` against the actual proposed SQL file. It does not connect to Supabase, use account credentials, or create persistent infrastructure.

The harness creates synthetic roles/users and two synthetic suppliers, executes the reviewed SQL, and checks:
- RLS enabled for every new public table.
- Anonymous readers see public stores and published categories/products only.
- An authenticated non-member sees no protected inventory, memberships or supplier records.
- Supplier Alpha and Beta can read their own draft catalogs and stock, but not each other's.
- A public product in an unpublished category and a product in a private store are not exposed.
- Cross-store category references and over-reservation are rejected.
- Anonymous and authenticated application roles have no write rights, and stock/supplier identity is hidden from anonymous callers.

**No migration applied.** Run the SQL only in ephemeral CI PostgreSQL; the fixture creates test roles and must never be used in the Apex production Supabase instance. The live Apex project `fhqpkpztercadcxspdkg` remains migration-free until explicitly approved.
