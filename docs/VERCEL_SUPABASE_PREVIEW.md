# Apex — protected Supabase preview connection

**Updated:** October 29, 2026. **Scope:** read-only public catalog and internal health check; no real supplier sign-in or commerce.

## Connected services
- Supabase project: Apex `fhqpkpztercadcxspdkg` (`us-east-1`), origin `https://fhqpkpztercadcxspdkg.supabase.co`.
- Vercel project: Apex `prj_LD1S8gNT7oplIymAcuR7LtpJ8VSj` under `zanibethels-projects`.
- Vercel Auth/SSO protection remains enabled for **all deployments**.
- **Verified:** Vercel Development + Preview contain encrypted `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_MODE=demo`. **Production was not modified.** Never put Supabase secret/service-role keys in `NEXT_PUBLIC_*`.

## Application behavior
- `/catalog` is server-rendered on each request (no caching), reading the public REST API with the publishable key only; it requests up to 24 rows from `public.products`.
- Supabase RLS enforces publication and store visibility. The loader pins the URL to this dedicated Apex project to prevent accidental cross-project connection.
- Empty DB shows a connection-established empty state. Missing env produces static UI placeholders. An unreachable or forbidden DB reports a generic unavailable state, never invented published items.
- `/api/catalog-health` reports demo-only connection state, no keys and no data values (HTTP 200 on successful public query, HTTP 503 otherwise).
- No writes, Auth session creation, service-role access, payment, checkout, or live product content.

## Verification gates
1. CI lint/typecheck/guardrails/build must pass; the dedicated disposable PostgreSQL RLS CI continues to run.
2. Deploy only to **Vercel Preview** from this branch; confirm its source commit and protection status, visit `/api/catalog-health` after login, and check `state=connected`. **Do not deploy/promote to production.**
3. Confirm `/catalog` reports no published entries until approved supplier content exists. The database currently has zero catalog rows.
4. **Not yet verified:** true hosted Supabase Auth sessions for two synthetic users. The Supabase connector currently has no create/sign-in Auth-user action. Disposable PostgreSQL CI and hosted schema/privilege introspection alone do not prove real Auth cookie/session behavior. Later, implement test-user provisioning via a supported secure Auth Admin flow with explicit authorization, and verify Alpha/Beta isolation through authenticated Data API calls.
5. Existing Supabase performance warnings about multiple permissive SELECT policies remain; optimize under a separate reviewed database migration.

## Review chain
This code PR is stacked on [PR #14](https://github.com/zanibethel/apex/pull/14) → [PR #13](https://github.com/zanibethel/apex/pull/13) → [PR #1](https://github.com/zanibethel/apex/pull/1). Merge/review them in order; preserve release gates.
