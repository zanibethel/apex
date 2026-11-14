# Apex Auth email branding and cross-browser verification

## Verified on 2026-11-14
- The designated pilot customer exists and `email_confirmed_at` is populated, even though the original confirmation landing displayed "Unable to verify email." The account's last sign-in was null at inspection.
- Apex's existing `/account/confirm` rejected a redirect without `token_hash` or `code`. Supabase's default `{{ .ConfirmationURL }}` verifies on Supabase's servers, then redirects, sometimes **without** a code/hash, especially when email opens in a different browser. We now show a neutral "Check your account" state and a sign-in link instead of a false failure.
- **Resend already has `apexanabolics.co` verified and sending-enabled.** No new DNS domain and no edits to existing Proton Mail MX records are needed for the current verified Resend sending domain.

## Branded confirmation template ready for Supabase Auth
- Subject: **Confirm your Apex Anabolics account**
- Sender name: **Apex Anabolics**
- Sender email: **accounts@apexanabolics.co**
- Template file: `docs/email/apex-confirm-signup.html`; copy HTML into **Supabase Dashboard → Authentication → Email Templates → Confirm sign up**.
- This template uses `{{ .TokenHash }}` and a fixed `https://apexanabolics.co/account/confirm?token_hash=...&type=email` URL. The server verifies the OTP, so it does not rely on PKCE state from the browser where registration began.
- Never print, log, store, or screenshot complete confirmation URLs; these are one-time credentials.
- Replacing the template changes **future emails only**. The prior verified pilot account does not need another confirmation.
- The logo is publicly served at `https://apexanabolics.co/apex-logo.png`. Wordmark/text remain readable when a mail client blocks remote images.

## Branded sender requires Supabase Auth SMTP settings
**This repository change cannot configure the hosted SMTP sender.**
Use the Supabase **Resend integration**, which can create a project-scoped sending API key and set Supabase Auth SMTP on authorization, or configure the SMTP fields in the hosted dashboard:

| Field | Value |
| --- | --- |
| Sender name | `Apex Anabolics` |
| Sender email | `accounts@apexanabolics.co` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | A **new, send-only Resend API key** entered directly in Supabase's password field. Never paste or commit the key into GitHub, chat, Vercel public variables, or this file. |

Use `https://apexanabolics.co` as the Site URL and retain the existing exact redirect allowlist entry `https://apexanabolics.co/account/confirm`. Leave Resend open/click tracking off for Auth links.

## Verification before calling branding live
1. Save SMTP settings and the template in Supabase. Confirm the Supabase hosted sender now points to the verified Apex domain.
2. Send a new confirmation to a disposable test email that is actually unverified; the current pilot account is **already verified**, so resending confirmation to it may not work.
3. Confirm the From address, subject, styling, Gmail delivery, link target and cross-browser flow. A confirmation link received by Gmail should reach Apex's token_hash callback without a session in the original browser.
4. Sign in, check user.email_confirmed_at and no admin/supplier membership. Never relax authentication, supplier/admin access, order gate or payment restrictions.

## Security notes
- Old hosted default links that arrive without a token result in an informational sign-in screen, *not* an assertion of verified identity.
- Untrusted status query strings only affect copy. Protected profile, order and supplier routes still call server-verified `auth.getUser()` and enforce permissions independently.
- Some mail systems prefetch one-time links. If this becomes an issue, move to a two-step confirmation button or OTP entry page before broader release; never put raw tokens in telemetry.
- Keep sender configuration and template edits restricted to Apex's hosted Supabase project; no changes to unrelated brands.

## Email logo artifact remediation (2026-11-14)
- The iPhone/Gmail confirmation screenshot exposed two opaque black patches at the upper corners of the transparent Apex PNG. The build now runs `scripts/clean-apex-logo.mjs` before Next.js to clear only nearly-black fully opaque pixels in those empty corners. The central silver/crimson mark is preserved, and the source PNG remains in version control.
- **The repository email template is not automatically pushed into hosted Supabase.** After the corrected logo asset deploys, copy the updated `docs/email/apex-confirm-signup.html` into Supabase Auth → Email Templates → Confirm sign up. It uses `?v=20261114-clean` to avoid Gmail's cached old image.
- Re-send a confirmation email to an *unverified* owned test user, inspect the received email on mobile, and verify its OTP link still works. Do not expose a one-time confirmation URL. Existing emails may remain cached and unchanged.
- No SMTP credentials, existing identities, checkout release flags, payments, or payout settings are touched by this change.
