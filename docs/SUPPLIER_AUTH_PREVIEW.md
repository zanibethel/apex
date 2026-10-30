# Supplier sign-in — review checkpoint

**Project:** `Apex` Supabase `fhqpkpztercadcxspdkg` / protected Vercel project `apex`.

## Implemented in the proposed pull request
- Invitation-only email/password sign-in; **no open registration**.
- `@supabase/ssr` handles cookie-backed sessions, Next.js 16 `src/proxy.ts` refreshes verified claims and preserves no-store cache headers.
- Server actions call Supabase Auth, never log passwords, reject users without RLS-visible supplier membership, and revoke their session.
- `/supplier` is a server-rendered, read-only workspace. Every render calls `auth.getUser()` and queries memberships/stores using the signed-in user's RLS-scoped client.
- Login does **not** allow users to assign themselves roles, import suppliers, update inventory or place orders. No admin/service-role secret key is needed.
- Exact dependency versions pinned to `@supabase/ssr@0.12.7` and `@supabase/supabase-js@2.118.0`; lockfile generated in CI and retained in GitHub.
- Dedicated Apex Supabase URL and publishable key are configured in Vercel **development/preview only**, not production. Vercel Authentication still gates all deployments.

## Evidence and remaining gates
- Previous disposable PostgreSQL RLS CI and hosted rollback-only role simulations passed with synthetic Alpha/Beta identities. They are **not a genuine signed-in Supabase Auth session test**.
- As of this implementation check, **Apex has 0 real Auth users and 0 supplier memberships**. The available Supabase connector does not expose an Auth Admin create-user/sign-in action; do **not** insert directly into `auth.users` in an attempt to bypass the supported Auth flow.
- For actual end-to-end testing, create two **synthetic** test users through a supported Supabase Auth dashboard/admin flow, then assign one membership each to two **distinct synthetic** suppliers using an explicitly approved admin-only process. The membership table currently has no client write grants by design. Avoid putting test credentials in GitHub or Vercel variables.
- Run `node scripts/test-real-auth-isolation.mjs` locally with two test credentials provided in private environment variables `APEX_TEST_A_EMAIL`, `APEX_TEST_A_PASSWORD`, `APEX_TEST_B_EMAIL`, `APEX_TEST_B_PASSWORD`, plus the Apex public URL and publishable key. It only issues read queries, verifies true Auth sign-in and tenant isolation, then signs out. Remove synthetic fixtures when complete.
- Live password-form submission through the protected Vercel preview and the user's real browser remains unverified until those accounts exist.
- Before real supplier onboarding: explicit admin provisioning flow with audit, MFA for admins, rate-limit/CAPTCHA review, stale-session handling and supplier invitation approval. **No new database migrations or production deployment in this pass.**
- PR review chain: planning #1 → app #13 → SQL foundation #14 → catalog preview #15 → this supplier-auth PR.

## Dependency and review note

The exact pinned dependency graph is checked in via `package-lock.json`, created by a temporary one-shot GitHub Action. That temporary write-enabled workflow was removed after successful generation. CI now installs with `npm ci` to verify the lockfile rather than resolving fresh versions.
