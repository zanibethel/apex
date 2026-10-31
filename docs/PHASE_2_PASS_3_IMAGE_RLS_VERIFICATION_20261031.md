# Apex Phase 2 — Pass 3: isolated draft-image policy regression

Date: 2026-10-31. Stacked on Phase 2 Pass 2 / draft PR #67. **No production or hosted Supabase change.**

## Tested in a disposable PostgreSQL 17 CI service

The new `database/tests/private_image_policy_integration.sh` is appended to the existing `rls-integration` job **after** catalog, supplier operation, source review, candidate promotion, product media and mobile-card fixtures have installed synthetic identities and private draft rows.

It refuses to run unless `PGHOST` is localhost/127.0.0.1 and `PGDATABASE` is `apex_test`. It sets up a minimal synthetic `storage` bucket/object API plus documented `storage.foldername`/`storage.filename` semantics. It transforms the *review-only setup SQL* into the hosted *original buggy binding* **in the disposable database only**, then verifies an otherwise-eligible manager upload is denied. CI surfaced a **second independently verified production bug**: both the stored Storage filename allowlist and the stored `products_private_image_path` check omit the final twelve hex characters of UUID file names. Those omissions block generated image paths even after the name-binding fix; the completed repair must address both layers.

The runner executes the **exact** review-only Storage policy repair from PR #67 (corrected in this stacked PR to include the full UUID), not a reimplementation. It reconstructs the hosted truncated product image-path check in disposable PostgreSQL, confirms attaching a valid UUID path fails, and applies `database/sql/apex_private_product_image_path_constraint_repair_REVIEW_ONLY.sql` (also never deployed). Post-repair assertions cover:
- Owner and manager insert/list/read for their supplier's private draft
- Staff can see their supplier product but cannot read/upload owner/manager-only private images
- Unaffiliated user and another supplier are denied; anonymous has no Storage read/insert grant
- Invalid extensions and published product uploads are rejected
- No supplier UPDATE/DELETE policy or access grant was added
- Saving a full UUID image path on the draft product after the product constraint repair
- Replaying each guarded repair fails safely without removing healthy policies

This is *isolated database-level* coverage, not a real Supabase signed upload, browser validation or manual application to production. The mock storage schema intentionally does **not** simulate signed-token authorization or the Storage HTTP service. Both authored database repairs are still **REVIEW ONLY**. The corrected source setup scripts alone do not change hosted SQL or actual signed-upload behavior.

## Hosted migration/source provenance — read-only reconciliation

| Hosted migration name | Hosted version | GitHub migration file | Source status |
| --- | --- | --- | --- |
| `apex_initial_catalog_readonly` | `20261029233701` | `20261029233701_apex_initial_catalog_readonly.sql` | Name/version match, contents not independently diffed |
| `payout_reporting_readonly` | `20261031011913` | `20261030222500_payout_reporting_readonly.sql` | Name matches, **version differs** |
| `multi_split_draft_rpc` | `20261031011915` | `20261030233000_multi_split_draft_rpc.sql` | Name matches, **version differs** |
| `payout_recipient_admin` | `20261031011917` | `20261030234500_payout_recipient_admin.sql` | Name matches, **version differs** |

Several other deployed catalog/product/storage policies live as review-only scripts under `database/sql/`, not as equivalent numbered migrations in `supabase/migrations/`. Their full application chronology and diff provenance still require a separately approved migration reconciliation. Do not rename/replay historical files or edit Supabase migration history just to make versions line up.

## Release gates

1. CI `verify` and `rls-integration` must pass at the same commit; Vercel *preview* READY is additional build evidence, not browser QA.
2. Verify an isolated real Supabase test environment and its signed-upload mechanism after separate approval (a project branch may incur compute cost). Do not point the CI shell runner at production.
3. Reconcile migration source chronology before either hosted image-policy or product-constraint DDL. Validate the complete 8-4-4-4-12 UUID patterns in both hosted definitions after any separately approved rollout.
4. Manual owner/manager/staff account testing of actual draft CRUD, image persistence, category/price and optimistic stock editing remains required.
5. No production merge, product publishing, checkout, payments or fulfillment. PR #66 remains independently unmerged.
