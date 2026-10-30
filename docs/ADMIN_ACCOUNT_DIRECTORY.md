# Apex administrator-managed accounts — staged implementation

**Status:** code-only preview; invitations DISABLED; no production deployment. Stacked on draft PR #18.

## What is actually in the database
- Supabase Auth owns identity records in `auth.users` and keeps password hashes and sessions out of ordinary public tables.
- The current initial platform authorization is **trusted** `auth.users.raw_app_meta_data.apex_role = "platform_admin"`, checked after `auth.getUser()`. An email domain or user-editable metadata does not grant authority.
- No `public.profiles` or `public.platform_memberships` table has been created by this change. A future audited role model can add those after design review.
- The dedicated Apex Supabase project contained **zero Auth users** at the October 30 verification. Proton mailbox creation does not populate Supabase Auth.

## First administrator bootstrap (one time only)
1. Confirm control of `missapex@apexanabolics.co` in Proton.
2. Use the *Apex* Supabase project **Authentication → Users → Add user → Create new user** to create an Auth identity with a private, unique password, email confirmation and verified ownership. This is independent of Proton credentials.
3. After identity verification, grant `apex_role: "platform_admin"` using a narrow trusted administrative action for the exact Auth user ID. Never write `user_metadata` for authorization and do not insert directly into `auth.users`.
4. Sign into the protected preview `/admin/sign-in`, verify server role checks, then open `/admin/users`.
5. Test unprivileged denial, verified admin directory access and sign-out. Do not promote to production before review.

## New protected directory and invitations
- `/admin/users` requires a fresh server-side `auth.getUser()` plus verified email and trusted platform admin role. It reads up to 50 Auth accounts using a privileged server-only Auth Admin client.
- Invitation creation is separately gated behind `APEX_AUTH_INVITES_ENABLED=true` and a valid `SUPABASE_SECRET_KEY` (must begin with `sb_secret_`); default is **disabled**.
- The privileged Auth Admin client only connects to the exact Apex Supabase project and requires demo mode. No secret is available to browser code or stored in this repository.
- Invitations create unprivileged accounts; no self-assigned roles, deletes, user updates, or automatic elevation.
- Before enabling invitations: configure verified custom SMTP (e.g. a separately authenticated Resend sender subdomain), check provider rate limits, configure redirect/confirmation and test full email delivery. Supabase's default SMTP is restricted and unsuitable for launch.
- The current user directory is a first-page read-only view, not yet a full pagination/audit/permission management system.

## Release and security gates
- Keep the Apex public concept page reachable without Vercel login. Preview Vercel Authentication remains enabled.
- Do not set any `SUPABASE_SECRET_KEY` in the production environment without a reviewed release. Never copy it to `NEXT_PUBLIC_*`.
- Add MFA/step-up checks, invitation throttles, immutable audit events, user-role change workflows and deactivation/session revocation before enabling broad administration.
- Run lint/typecheck/unit tests/build and verify unauthorized access; no account invitations were issued in this PR.
