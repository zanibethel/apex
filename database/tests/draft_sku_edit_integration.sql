-- CI-only: executed AFTER the full supplier product/media/cost fixtures.
-- The SQL is the exact review-only SKU grant, not a test reimplementation.
\set ON_ERROR_STOP on
\ir ../sql/apex_draft_sku_edit_REVIEW_ONLY.sql

DO $assert$
BEGIN
 IF NOT has_column_privilege('authenticated','public.products','sku','UPDATE')
    OR has_column_privilege('authenticated','public.products','store_id','UPDATE')
    OR has_column_privilege('authenticated','public.products','is_published','UPDATE')
 THEN RAISE EXCEPTION 'SKU grant exposed protected product fields'; END IF;
END $assert$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
UPDATE public.products SET sku='APX-BETA-DRAFT-001'
 WHERE store_id='20000000-0000-4000-8000-000000000003'
 AND sku='B-NEW-DRAFT' AND is_published=false;

DO $assert$
DECLARE changed boolean:=false;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.products
  WHERE sku='APX-BETA-DRAFT-001' AND is_published=false)
 THEN RAISE EXCEPTION 'Authorized draft SKU edit failed';END IF;

 -- Database (store_id,sku) unique index is still authoritative.
 BEGIN
  UPDATE public.products SET sku='MOBILE-QA-20MG'
   WHERE store_id='20000000-0000-4000-8000-000000000003'
   AND sku='APX-BETA-DRAFT-001';
  changed:=true;
 EXCEPTION WHEN unique_violation THEN NULL;END;
 IF changed THEN RAISE EXCEPTION 'Duplicate store SKU accepted';END IF;

 -- Public store/published products cannot be edited even by a member.
 UPDATE public.products SET sku='SHOULD-NOT-BE-SAVED'
  WHERE store_id='20000000-0000-4000-8000-000000000002'
   AND sku='B-PUB';
 IF FOUND THEN RAISE EXCEPTION 'Published product SKU was editable';END IF;
END $assert$;

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
DO $assert$
BEGIN
 UPDATE public.products SET sku='CROSS-TENANT'
 WHERE store_id='20000000-0000-4000-8000-000000000003'
   AND sku='APX-BETA-DRAFT-001';
 IF FOUND THEN RAISE EXCEPTION 'Cross tenant SKU edit unexpectedly succeeded';END IF;
END $assert$;

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
DO $assert$
BEGIN
 UPDATE public.products SET sku='OUTSIDER'
 WHERE store_id='20000000-0000-4000-8000-000000000003'
   AND sku='APX-BETA-DRAFT-001';
 IF FOUND THEN RAISE EXCEPTION 'Unaffiliated SKU edit succeeded'; END IF;
END $assert$;
RESET ROLE;
\echo PASS: draft SKU edits remain tenant-scoped, unique and unpublished.
