# Apex account profile and password-management preview

Feature branch: feat/account-profile-password-2026-10-30 (stacked on #19).

## Scope
- `/account/profile` is a protected, server-rendered page for an authenticated Apex account.
- User name/role shown is sourced from Supabase Auth: verified email and trusted app metadata.
- Admin and supplier dashboards both offer a My Profile link.
- A user can change only **their own Apex password**, not a Proton Mail password and not another user's credentials.
- Password submission checks minimum 12 characters, matching confirmation, a different new password and proof of the existing password using Supabase Auth. The user ID must match before mutation.
- The action uses `auth.updateUser` in the verified user's SSR session, with no service-role or Auth Admin access.
- If a reauthentication nonce is required, the user can explicitly request a code using `auth.reauthenticate()` and enter it. Code delivery depends on configured SMTP and Supabase Auth limits.
- On success, the action requests global sign-out. Supabase invalidates refresh tokens, but already issued access tokens can remain valid until they expire; this is not instantaneous JWT revocation.

## Verification / exclusions
- Guardrail tests cover authentication checks, current password, min length/confirmation, tenant independence, protected page routing and no admin secret usage.
- CI must pass lint, TypeScript, unit checks, production build and disposable RLS tests before review.
- **No test password was supplied** and no password change was attempted on Lily's real user. A human should test the flow using private credentials in the authenticated Vercel preview.
- Forgot-password emailed recovery is deferred until Apex custom SMTP, site URL/redirect allowlisting, callback route and abuse controls are fully tested.
- No privileged credential was added to a browser or repository. No database migration or production deployment was made.

## Acceptance test
1. Log in on the protected preview as an authorized Apex account.
2. Open My Profile and confirm the authenticated email and correct role.
3. Confirm incorrect current password and mismatched new passwords are rejected.
4. Enter the current password and a new, unique strong password. If Auth demands a nonce, request it and use the code from the mailbox.
5. Confirm the success message, session sign-out and fresh sign-in with the new password.
6. Verify the old password fails, signed-out profile requests redirect to sign-in, and account data from other users remains inaccessible.
