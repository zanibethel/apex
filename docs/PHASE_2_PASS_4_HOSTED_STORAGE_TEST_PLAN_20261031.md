# Apex Phase 2 — Pass 4: hosted Supabase branch acceptance (prepared, not executed)

Date: 2026-10-31. This pass is stacked after draft PR #68.

## Billing and environment gate

Production Apex project ref: fhqpkpztercadcxspdkg. Never use its credentials for this fixture.

- Supabase branch listing returned **no development branches**.
- A create-branch request for apex-phase2-image-acceptance-20261031 required a separate cost confirmation.
- Supabase quoted **$0.01344 per hour** (approximately **$0.32 for 24 hours**, before any additional usage fees).
- No branch was created and no additional billing consent, hosted DDL or data writes were performed.
- The user's explicit agreement to the quoted cost is required to create the hosted test environment.

## Prepared executable

Run manually only in an approved isolated environment:

    node scripts/isolated-supabase-image-smoke.mjs

The test requires these environment variables configured privately, never pasted into chat or committed:

- APEX_TEST_EXECUTION = isolated-fixture-only
- APEX_TEST_SUPABASE_REF = exact isolated branch project ref (never production)
- APEX_TEST_SUPABASE_URL = https://<branch_ref>.supabase.co
- APEX_TEST_SUPABASE_PUBLISHABLE_KEY = branch-only public key
- APEX_TEST_SUPABASE_SERVICE_ROLE_KEY = branch-only admin key

The script refuses production Apex and mismatched target URLs before any API request, checks that a private image bucket and product schema exist before writes, and does not run automatically in PR CI. Never use production credentials.

It creates synthetic, confirmed users with .invalid emails, two synthetic suppliers and private stores, harmless unpublished test products, and 1x1 PNG images. It exercises real Supabase Auth and Storage HTTP APIs:
1. Owner and manager can sign uploads, upload the PNG, list private objects, create signed read URLs and download the image.
2. Owner/manager can attach their image to their draft through the Data API with the corrected full UUID constraint.
3. Staff sees their assigned product but cannot upload, list, sign image reads or modify the image path.
4. An unaffiliated user, unrelated supplier and anonymous user cannot read or upload the supplier's private draft images.
5. Synthetic fixtures receive cleanup attempts; the test branch should be deleted after testing to stop hourly charges.

The script does not exercise the authenticated Next.js UI; browser QA is a separate gate.

## Migration drift blocks immediate branch acceptance

New Supabase branches replay the hosted migration history without production records. Hosted Apex has four migration records. Three payout migration versions are different from the names of the corresponding checked-in SQL files. Catalog product and Storage changes also live in database/sql review files rather than numbered migrations. A fresh branch may lack the image bucket, product columns or write policies.

After cost consent and branch creation:
1. Inspect branch schema, policies, bucket and history; do not assume it matches production.
2. Reconcile the missing catalog DDL in a branch-only reviewed migration. Do not replay historical files blindly.
3. Apply the two guarded review-only image repairs ONLY to a correctly prepared branch, with separate approval for the branch DDL. No production migrations.
4. Use branch-only test credentials to run the signed-upload smoke, review results and manually test the protected Vercel preview with owner/manager/staff accounts.
5. Delete the ephemeral branch and document teardown.

## Release gate

Draft PRs #66, #67 and #68 are still unmerged. This pass adds only test tooling and documentation. No change to production, commerce, order flow, product publishing, crypto payment or fulfillment.
