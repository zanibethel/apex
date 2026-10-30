# Apex platform administrator login — review checkpoint (October 30, 2026)

## Public website and previews
- Vercel project `apex` now uses `ssoProtection.deploymentType=preview`. The registered domain `apexanabolics.co` and production target are no longer gated by a Vercel account.
- Preview deployments remain Vercel-authenticated. The public custom domain still serves the earlier non-transactional concept shell until reviewed changes are merged and deployed.
- Production Vercel settings have no Supabase Auth env values yet; do not claim public-domain admin login is live.

## New code (this branch)
- `/admin/sign-in`: email/password sign-in through the Apex-only Supabase SSR client, with no public signup.
- `/admin`: server-rendered read-only technical dashboard.
- Authentication via `auth.getUser()`; platform authorization via trusted Auth `app_metadata.apex_role === "platform_admin"` and confirmed email.
- Existing supplier dashboard continues to use its own supplier-membership authorization.
- No products, supplier permissions, orders, or payments are enabled by this pass. No new database migration.

## Why the new Proton mailbox cannot sign in yet
Proton custom-domain mail and Supabase Auth are separate services. The dedicated Apex Supabase project had zero Auth users when inspected on October 30. A mailbox exists, but no Apex sign-in account or platform admin role has been provisioned.

## First admin acceptance procedure
1. Confirm the intended person controls their Proton mailbox and that mail send/receive works.
2. In dedicated Apex Supabase dashboard, Authentication > Users > Add user, use a supported Auth Admin create-user process. An operator should provision the intended mailbox with a private password and verified email. Do not paste credentials into GitHub, ChatGPT or logs. Invitations may require custom SMTP, which is not configured yet.
3. Once the Auth user is confirmed, grant `apex_role=platform_admin` **only through a trusted administrative process** updating `auth.users.raw_app_meta_data` for the exact verified user id. Do not assign based on mailbox spelling alone. Never store the role in user_metadata.
4. Visit the protected Vercel preview at `/admin/sign-in` (or a deliberate, expiring share link); test successful login, denied ordinary user, logout, and data isolation.
5. Before production, finish Vercel production Supabase config with separate review, audit and release gates. Keep public website accessible without Vercel sign-in; protect private routes in the app.

This step has not created any users or granted administrative roles.
