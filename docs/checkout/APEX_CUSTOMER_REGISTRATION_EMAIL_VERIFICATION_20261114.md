# Apex customer registration + email verification — release contract

Created: 2026-11-14. No live checkout, invoices, payouts or inventory holds.

## Scope
- New `/account/sign-up` customer page, shared Supabase Auth password signup,
  optional resend confirmation, and `/account/confirm` one-time token/callback.
- Existing `/account/sign-in` continues to route verified platform admins,
  supplier memberships, and customers to their existing destinations.
- No administrative access is assigned from `user_metadata`, submitted email,
  or new customer creation. No tables, RLS rules or payment settings change.
- A successful verification routes to `/account/verified` and checks
  `auth.getUser()` server-side before presenting the success message.
- Callback only accepts token_hash/type=email or PKCE code, does not accept a
  caller-controlled redirect destination, and sends no sensitive tokens to the
  finished page. Redirect is always fixed to the production Apex domain.

## Release gate — OFF by default
Both server-only Vercel environment variables must be present, exactly:
`APEX_CUSTOMER_REGISTRATION_ENABLED=true`
`APEX_CUSTOMER_REGISTRATION_OPERATOR_APPROVAL=confirmed-email-flow-v1`

Neither is added by this PR, and neither enables checkout. The private DB
retail gate and six existing order-submission release flags stay untouched.

Do not set either new flag until **all** provider verification below succeeds.

## Supabase Auth provider prerequisites

1. Inspect **Authentication → Sign In / Providers** (snapshot supplied in
   conversation showed new signup ON, anonymous login OFF, confirm email ON;
   screenshot cannot prove changes were saved or persist).
2. Set Site URL to `https://apexanabolics.co`. Add the *exact*
   `https://apexanabolics.co/account/confirm` to allowed redirect URLs.
   Never allow wildcard untrusted origins.
3. Review **Authentication → Email Templates → Confirm signup**. Recommended
   cross-device SSR confirmation template link:
   `https://apexanabolics.co/account/confirm?token_hash={{ .TokenHash }}&type=email`
   with visible link text **Confirm your Apex email**. Do not log or persist
   the token_hash. The default Supabase confirmation URL remains compatible
   with the PKCE `?code` callback when browser cookies are available.
4. Confirm Auth SMTP or approved email delivery configured, redirect allowed,
   rate limiting and bot protection reviewed. The built-in sender may have
   recipient or throughput limitations. Do not claim messages are delivered
   without actual tests.
5. Use a disposable, owned test inbox: create one customer with 12+ character
   password; verify exactly one email arrived; follow link across devices;
   confirmed session can open /account/profile. Try expired/reused link;
   unverified sign-in must fail; test resend rate limits and recovery.
6. Independently confirm existing platform admin and supplier credentials
   continue routing correctly. Never create or reveal a test administrator.

## Abuse resistance
- Two server-only flags deny signup and resend by default.
- Email validation and password minimum 12 characters enforced on server.
- Generic resend responses avoid address enumeration.
- Supabase Auth rate limits still apply; review CAPTCHA/edge IP throttle
  before broad public activation. Do not assume plan-tier protections.
- Confirmation redirects no-store/no-referrer; untrusted next/redirect URL
  values ignored; no service-role or admin Auth API.
- Never log passwords, email, email tokens, or session data.

## Operator verification
Node tests: `node --test tests/customer-registration-email-flow.test.mjs`.
Full CI: lint, types, tests and production build. After merging, the signup
page may be visible, but account creation remains OFF until operator flips
both registration flags after actual SMTP/verification rehearsal.

## Private single-address customer-email pilot (after saved Site URL)

The current operator is preparing a **single test-customer pilot**. Production
Vercel must require ALL THREE server-only settings before the signup form or
signup/resend server action is accessible:

- `APEX_CUSTOMER_REGISTRATION_ENABLED=true`
- `APEX_CUSTOMER_REGISTRATION_OPERATOR_APPROVAL=confirmed-email-flow-v1`
- `APEX_CUSTOMER_REGISTRATION_TEST_EMAIL=<approved test email>`

The third value is a *single full email* (no wildcards, plus-alias matching,
lists or public keys). Initial requested test identity is controlled by the
site operator and is not hardcoded into source control. Backend rejects all
other address entries before calling Supabase Auth. Existing supplier/admin
sign-in and all checkout/payment gates remain independent and unchanged.

**Critical limit**: This is only an Apex *application form/server-action*
allowlist. Hosted Supabase's **Allow new users to sign up** setting is globally
ON, so its public Auth API is still independently reachable. Do not claim this
enforces a provider-level invite-only policy. For strict provider-wide
restriction, add/approve a Supabase Before User Created Auth hook or disable
the hosted provider signup setting. Never use frontend-only filtering to
promise signup isolation.

To run the pilot after code/CI/deployment verification:
1. Confirm the saved Supabase Site URL is `https://apexanabolics.co` and
   the exact `https://apexanabolics.co/account/confirm` redirect exists.
2. Test provider confirmation templates/SMTP using the operator's own inbox.
   Supabase rate limits apply. Cross-device verification requires the
   correct token_hash email template (see earlier steps).
3. Set all three production-only Vercel vars, redeploy the tested `main` SHA,
   inspect release flags and ensure no checkout admission flag was set.
4. The operator opens the live signup form, supplies their own 12+ character
   password privately, follows the confirmation link and signs in.
5. Verify `auth.users.email_confirmed_at` and that no admin role or supplier
   membership was added. If email fails or provider misroutes, close the
   registration gate again without touching existing customer sessions.
