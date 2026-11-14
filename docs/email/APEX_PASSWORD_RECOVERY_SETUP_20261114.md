# Apex account password recovery — rollout and security contract
Date: 2026-11-14.

## Feature
- Unified customer, supplier, and admin sign-in pages link to `/account/forgot-password`.
- The server action calls Supabase `auth.resetPasswordForEmail` with a fixed Apex redirect; it does not require the single-email registration pilot flags.
- Request responses are intentionally identical whether or not the email exists. Never expose provider errors, accounts, passwords or OTP hashes to chat or logs.
- Email GET link contains `{{ .TokenHash }}` with `type=recovery`, and routes through `/account/reset-password/confirm`.
- The GET route stores the hash in a Secure, HttpOnly, SameSite=Lax, 15-minute `__Host-` cookie, redirects off the sensitive URL with no-store and no-referrer, and **does not consume the one-time code** (avoids mail-client prefetch).
- Password submission validates matching 12–128-character values, deletes the recovery cookie, verifies the one-time `type:recovery` token with Supabase Auth, checks authenticated identity with `getUser()`, then invokes `updateUser({password})`, and signs out globally. No session-only bypass.
- The feature does not create a new account, upgrade any role, touch supplier memberships, or enable the checkout/payment gates.

## Hosted email template step (required)
The connected Supabase tools do not support editing hosted Auth email templates. Save the HTML from `docs/email/apex-reset-password.html` at
`https://supabase.com/dashboard/project/fhqpkpztercadcxspdkg/auth/templates`, **Reset password** (not Confirm sign up).
- Subject: `Reset your Apex Anabolics password`
- Keep the existing verified sender `Apex Anabolics <accounts@apexanabolics.co>` and Resend SMTP credentials untouched.
- New message must use `https://apexanabolics.co/account/reset-password/confirm?token_hash={{ .TokenHash }}&type=recovery` and the cleaned logo URL.
- Do not replace the existing Confirm sign up template. After saving, inspect the actual hosted values.
- Ensure `https://apexanabolics.co/account/reset-password/confirm` is present in the Auth redirect allowlist as an exact URL when using the redirectTo supplied by the action. The custom template link itself is a fixed Apex origin.
- Keep Resend open/click tracking disabled on one-time Auth links.

## End-to-end release check
1. CI must pass lint, typecheck, tests, build, and RLS. Verify Vercel production deployment SHA is READY and assigned to apexanabolics.co.
2. With an owned existing Apex test account, request a reset. Confirm the branded email delivered from accounts@apexanabolics.co, the reset button opens Apex on another browser, and no raw token leaks into the landing URL, client logs, or screenshots.
3. Set a different password and sign in with it. Verify old password does not work. Reusing the same link should fail. Invalid, missing, and expired links must offer a new request.
4. Verify no privilege change, no test-registration bypass, and no change to the private checkout engine or release flags.
5. Limit resend requests via Supabase Auth rate limits and review provider/IP abuse controls before public rollout; a public forgot-password page must not become an email flood endpoint.
