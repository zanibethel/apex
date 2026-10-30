# Apex public menu, unified login and private contact profiles — review pass
Date: October 30, 2026

## Navigation and verified role routing
The public header now shows a hamburger menu with Home, All Products, only RLS-published category links, About and account actions. The supplier/admin sign-in shortcuts are removed from the public header. Direct staff URLs remain available at /supplier/sign-in and /admin/sign-in for support and onboarding.

Visitors use /login. After a verified Supabase Auth password login, /account directs trusted platform administrators to /admin, RLS-authorized supplier members to /supplier, and other verified accounts to /account/profile. The My Profile page always includes account email and private editable name/phone/address fields when the account_profiles table exists. Only admin/supplier accounts see their relevant extra workspace and payout settings links. This is an interface affordance; real authorization is still checked by each server route and Supabase RLS. Never rely on an email string or user_metadata for staff access.

## Customer account enrollment status
Public sign-up is NOT enabled by this change. Existing verified Supabase accounts can use the unified login. Customer self-registration needs separate review: SMTP deliverability, leaked-password protection, rate limits/CAPTCHA or equivalent abuse control, verification, account recovery and privacy handling. Do not publicly advertise self-service registration as ready until it is.

## Private profile database
Review-only SQL: database/sql/apex_account_profiles_review.sql. An authenticated user may read, insert and update ONLY their own profile record (keyed by auth.users.id). Email continues to come from verified Supabase Auth, with change of email deferred to a verified account flow. Name, phone and address are stored in public.account_profiles with self-only RLS, never in public catalog pages, wallet configs or client auth metadata. No new customer data is seeded. If the SQL isn't installed, the contact form fails closed with a clear unavailable message; existing password/account links continue working.

Apply SQL ONLY after review and disposable Postgres cross-user tests, then verify real Auth sessions: User A cannot see/write User B's contact information; anonymous cannot read profiles; changing user id is denied. Record a migration version, review Supabase security/performance advisors, check privacy/storage retention and test the actual browser form. Do not run the migration against CreatorHub/RaiseHub/CoOperative projects.

## Bitcoin and roles
Admin account: platform controls and payout split proposals. Supplier members: common supplier workspace and test-wallet requests. The wallet UI remains a shared supplier *request queue*, not per-person wallet custody. Separate personal payout preferences, if required, need a dedicated signed/approved data model and security review. No live transfer, payout activation, keys or seeds are touched here. Plain customer accounts never receive wallet links or supplier/admin workspaces.

## Release checklist
- [ ] GitHub CI lint, typecheck, tests, build on this exact PR head
- [ ] Test mobile keyboard/touch menu, category fallback when empty, and logged-out state
- [ ] Verify admin, both suppliers and ordinary customer role routing using separate verified Auth sessions
- [ ] Test access denial through direct URL as well as hidden menu links
- [ ] Test profile persistence and one-user-vs-another RLS after approved SQL migration
- [ ] Configure a production release plan; review runtime feature flags before merging to main
- [ ] Keep live checkout, publication and payments disabled
