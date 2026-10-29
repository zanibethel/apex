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

## Verified progress — October 29, 2026

- Vercel project env listing confirms exactly three expected encrypted variables targeted to **development and preview** (not production).
- [Preview deployment](https://vercel.com/zanibethels-projects/apex/AqisvHUx5MqsZCWMrARwjsCa1Sgb) for source commit `47e5b20` reports **READY**, `target=null` (preview); URL `https://apex-p6bg4l7xp-zanibethels-projects.vercel.app`. All-deployments Vercel Authentication remains enabled.
- [GitHub Actions run 40976412218](https://github.com/zanibethel/apex/actions/runs/40976412218) reports **success** for the source code. The disposable PostgreSQL RLS integration job continues to pass.
- **Hosted Apex RLS test (rollback-only) PASS:** an SQL transaction in actual project `fhqpkpztercadcxspdkg` temporarily inserted two synthetic `auth.users` identities, supplier memberships, published/draft product examples and inventory, then switched PostgreSQL roles and simulated user-ID claims. Assertions confirmed anonymous public-read behavior and each supplier's ability to read their own private records, without reading the other supplier's private records. The transaction was explicitly **ROLLBACK**.
- Follow-up read-only query verified **0 Auth users, suppliers, stores, memberships, categories, products and inventory rows**. The fixture left no persistent records.
- **Scope limitation:** SQL role/JWT-claim simulation is not a GoTrue-issued login, real email/password session, or end-to-end Data API login test. Such tests remain required when a secure synthetic Auth-user creation/sign-in workflow is available. Do not claim full Auth completion.
- **Runtime limitation:** Vercel confirmed build READY; the protected preview's authenticated `/api/catalog-health` HTTP response has not been accessed from an authenticated browser. Build READY is not proof of API connectivity. Validate it after signing in to protected Vercel preview.
- No additional database migration, payment changes, checkout, or real supplier account setup occurred in this pass.
