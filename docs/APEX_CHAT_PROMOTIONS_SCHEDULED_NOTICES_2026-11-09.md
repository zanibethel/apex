# Apex chat operations, promotions and scheduled storefront notices

## Scope
Apex retail display remains non-transactional. This feature extends the signed-in operator chat and adds a compact top-of-storefront rotating notice strip on the homepage and product catalog.

### Storefront announcements
- Display-only top strip beneath the main header; no checkout, invoice or payout trigger.
- Cycles among currently active notices every seven seconds, with manual previous/next controls and reduced-motion detection.
- Uses the visitor's browser clock for automatic start and expiration transitions; a refresh picks up newly added or edited notices.
- Future notices within 90 days are included in the sanitized read source but not displayed before their scheduled start. Expired or disabled notices are hidden.
- Server stores notices privately and returns sanitized headline, optional detail, internal link and dates only. Links are limited to `/` and `/catalog`; HTML/JS injection is not supported.
- Platform admin can create global or store-specific notices. Supplier owners/managers can create and edit notices belonging to their assigned private storefront.
- Admin can manage all notices, while suppliers cannot read or edit another supplier's notices.
- Create/edit/toggle requires authenticated RPC, with a second confirmation in the UI and stale-version protection for edits. Every save creates a private audit event.

### Chat operational tools
Supplier owners/managers and the verified platform admin can type:
- `manage banners`, `create banner: New hours this weekend` or `notices` to open the embedded notice scheduler
- `discount codes`, `create code WELCOME10 for 10%` to open the existing discount-code editor embedded in chat; the user reviews and confirms a change before it is sent
- `payout settings` to view recent authorized sale records and wallet request **statuses**, plus the platform admin's saved supplier-split draft
- `change password` to open the secure Apex profile form, **without entering or showing passwords or verification codes in chat**

Payout split drafts: a verified admin can configure one **10% Apex + Lily/Tierra split of the remaining 90%** in chat. Recipients are selected from active records, the existing versioned `saveMultiRecipientDraft` action independently validates ownership and recipient types, and a second confirmation precedes saving a **draft proposal only**. It never alters the live BTCPay/Prism rule or initiates a payment.

Discount codes: reused `saveSupplierPromotion` and `toggleSupplierPromotion` actions with their existing authentication, limits and `APEX_DRAFT_PROMOS_ENABLED` flag. No coupon can be created or changed if that backend schema or flag is unavailable. No checkout or payment changes.

### Dedicated pages
- `/admin/promotions`: verified platform admin notice and discount management, linked from the admin dashboard
- `/supplier/promotions`: authorized supplier notice and discount management, linked from supplier dashboard
- Chat remains accessible from the site header/floating assistant.

## Rollout and migration
Migration: `supabase/migrations/20261110065000_apex_scheduled_storefront_notices.sql`

**Migration applied to production November 9, 2026 (Central time)** after isolated PostgreSQL verification. Source migration: `20261110065000_apex_scheduled_storefront_notices.sql`. The disposable PostgreSQL workflow `.github/workflows/notice-migrations.yml`, which installs the complete new schema in isolation and tests:
- public active/current/future/expired projection
- cross-supplier denials, admin-only global notices
- audit and private RLS
- stale edit rejection and no untrusted public fields

After migration, verify from authorized admin/supplier accounts, including mobile:
1. Create an active global notice in `/admin/promotions` and confirm the home/catalog top strip appears after reload.
2. Create two scheduled notices with one future start and one past end; verify only currently active notices cycle and future/expired ones remain hidden.
3. Confirm pause/resume and edit, stale-session conflict, and cross-supplier denial.
4. Test `manage banners` through chat and verify the site immediately after refresh.
5. Confirm discount code management is disabled when `APEX_DRAFT_PROMOS_ENABLED` is not enabled, and use existing promotion-authorization tests before enabling it.
6. Confirm admin three-way chat split draft is disabled unless `APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED` is enabled; verify no live payouts are affected.
7. Confirm passwords/verification codes cannot be submitted in chat and profile security controls remain independent.

PR #327 was merged as `332c788f8d6fd7f508ab90f08df57823b25d28f1`, and Vercel production deployed READY. The notice migration is live. The public notice feed initially returned `[]`; authorized live-browser creation, rotation and expiry verification remains to be completed. Existing payout draft and checkout payment gates were not enabled.
