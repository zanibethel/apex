# Apex Phase 2 — Pass 5: existing Supabase as prelaunch test environment

Date: 2026-10-31. Owner explicitly directed: **no temporary databases**. Use the existing Apex Supabase project for prelaunch testing with public commerce and publishing disabled.

## Applied and read-back verified

- Existing project: fhqpkpztercadcxspdkg.
- Recorded hosted migration: 20261031162856 / repair_private_draft_image_rls_and_uuid_path.
- GitHub artifact: supabase/migrations/20261031162856_repair_private_draft_image_rls_and_uuid_path.sql.
- Applied through connected Supabase migration tool in a **single guarded transaction** with a short lock timeout and postconditions.
- Exact scope: two storage.objects RLS policies and one public.products image_path CHECK constraint.
- Corrected nested policy lookup to bind storage.objects.name rather than the product title.
- Corrected generated image filename validation to require complete 8-4-4-4-12 UUIDs and allowed PNG/JPEG/WebP extensions.
- No new branch or database. No product rows, supplier rows, image objects, orders or customer records modified.
- Before and after: 0 products, 0 inventory records, 0 draft image objects.

Verification: both policies use storage.foldername(objects.name) and no longer storage.foldername(p.name). The INSERT policy and products CHECK constraint both contain the final 12 UUID hex characters. Storage/product RLS are enabled. Bucket is private, 3 MiB, JPEG/PNG/WebP.

Supabase's Storage SQL roles retain broad underlying table grants; **RLS** is the effective authorization. The only two policies are draft-image INSERT and SELECT, scoped to authenticated supplier owner/manager members. No UPDATE, DELETE or ALL Storage policies exist.

## Historical schema drift still needs reconciliation

The new migration version is properly recorded, but three earlier migrations have differently numbered GitHub files:

| Name | Hosted version | GitHub version |
| --- | --- | --- |
| payout_reporting_readonly | 20261031011913 | 20261030222500 |
| multi_split_draft_rpc | 20261031011915 | 20261030233000 |
| payout_recipient_admin | 20261031011917 | 20261030234500 |

Other hosted catalog and Storage changes exist as database/sql review/setup scripts, without a complete corresponding numbered migration sequence. Do not run blind db push, db reset or reapply this migration on the live database. Resolve provenance before automated migration replay.

## Next: authenticated QA against the current live prelaunch project

Use existing assigned supplier accounts; do not introduce synthetic Auth accounts, purchases or fake payments. When the server's controlled prelaunch draft-write flag is intentionally enabled:

1. Owner/manager creates a harmless unpublished internal QA product and uploads a small image under 3 MiB, then reloads to verify persistence through a private signed preview URL.
2. Owner/manager confirms draft title, description, category, price, compare-at price and source-cost editing where permitted.
3. Staff can view private supplier product/stock data but is denied image signing/reading by the current owner/manager-only Storage policy. This is a known UX policy decision to resolve before release. Staff must not see write controls or be able to invoke mutations.
4. Unaffiliated and anonymous accounts cannot view unpublished products, list image objects or mint signed URLs.
5. Verify bad MIME and oversized file rejection, invalid paths, duplicate overwrite rejection, concurrent inventory edits and audit records.
6. Note the current two-step product/zero-inventory creation may leave a partial draft if inventory insertion fails; atomicity/recovery remains a separate follow-up.

Do not write directly to Supabase Storage metadata tables. Test real uploads only through the Supabase Storage HTTP service and signed-upload SDK.

The earlier disposable PostgreSQL CI fixture is a test-only process, not an additional hosted Supabase database. Its successes do not prove the actual signed-upload HTTP flow. No authenticated browser upload was completed during this pass.

## Existing prelaunch security notices

Supabase advisor warnings (both existed before and after the migration):
- SECURITY DEFINER function public.save_payout_rule_draft callable by authenticated users. Authorization logic is present, but dedicated review is still required.
- Supabase Auth leaked-password protection is disabled.

No live checkout, fulfillment, sales, payout execution, crypto transfers or product publishing was enabled.

## PR disposition

PR #69's branch-only hosted smoke test was closed unmerged because the user declined temporary databases. This pass builds on PR #68 so it includes corrected policies, constraints and isolated RLS regression tests. PRs #66-#68 remain unmerged. The **database** was updated with authorization; the **production application** was not deployed.
