-- Run only after the existing catalog, supplier operations and candidate RLS fixtures.
\set ON_ERROR_STOP on
\ir ../sql/apex_candidate_draft_promotion.sql

-- No public/anonymous RPC access; no customer read of internal mapping.
DO $check$
BEGIN
 IF has_function_privilege('anon',
  'public.create_draft_from_supplier_candidate(uuid,uuid,text,bigint,integer,text,uuid)','EXECUTE')
   OR has_table_privilege('anon','public.supplier_candidate_drafts','SELECT')
   OR has_column_privilege('authenticated','public.supplier_candidate_drafts','store_id','UPDATE')
 THEN RAISE EXCEPTION 'Draft promotion leaked privilege'; END IF;
END $check$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
-- Candidate from prior fixture is still under_review.
DO $check$
DECLARE succeeded boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_draft_from_supplier_candidate(
      '20000000-0000-4000-8000-000000000003',
      (SELECT id FROM public.supplier_import_candidates WHERE source_index=0),
      'BEFORE-REVIEW',3400,3,'Test-only');
    succeeded:=true;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  IF succeeded THEN RAISE EXCEPTION 'Unreviewed candidate was promoted'; END IF;
END $check$;

UPDATE public.supplier_import_candidates SET review_status='approved_for_draft'
 WHERE store_id='20000000-0000-4000-8000-000000000003' AND source_index=0;
SELECT public.create_draft_from_supplier_candidate(
  '20000000-0000-4000-8000-000000000003',
  (SELECT id FROM public.supplier_import_candidates WHERE source_index=0),
  'BETA-REVIEWED-DRAFT',3400,3,'Confirmed test quantity'
);

DO $check$
BEGIN
 IF (SELECT count(*) FROM public.supplier_candidate_drafts) <> 1
 THEN RAISE EXCEPTION 'Candidate-to-draft link missing'; END IF;
 IF (SELECT p.price_cents FROM public.products p WHERE p.sku='BETA-REVIEWED-DRAFT') <> 3400
 THEN RAISE EXCEPTION 'Retail price did not come from explicit input'; END IF;
 IF (SELECT p.is_published FROM public.products p WHERE p.sku='BETA-REVIEWED-DRAFT')
 THEN RAISE EXCEPTION 'Promoted product was published'; END IF;
 IF (SELECT i.quantity_on_hand FROM public.inventory_items i JOIN public.products p ON p.id=i.product_id
   WHERE p.sku='BETA-REVIEWED-DRAFT') <> 3
 THEN RAISE EXCEPTION 'Explicit quantity not preserved'; END IF;
 IF (SELECT count(*) FROM public.supplier_catalog_audit a
     WHERE a.entity_type='products' AND a.after_state->>'sku'='BETA-REVIEWED-DRAFT') <> 1
 THEN RAISE EXCEPTION 'Product audit missing'; END IF;
END $check$;

DO $check$
DECLARE succeeded boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_draft_from_supplier_candidate(
      '20000000-0000-4000-8000-000000000003',
      (SELECT id FROM public.supplier_import_candidates WHERE source_index=0),
      'BETA-DUPLICATE-DRAFT',3500,1,'Duplicate must roll back');
    succeeded:=true;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  IF succeeded THEN RAISE EXCEPTION 'Duplicate candidate promoted twice'; END IF;
  IF exists(SELECT 1 FROM public.products WHERE sku='BETA-DUPLICATE-DRAFT')
  THEN RAISE EXCEPTION 'Duplicate failure left orphan product'; END IF;
END $check$;

-- Keep the real source UUID for the cross-supplier denial test even after RLS hides Beta rows.
SELECT set_config('apex.test_candidate_id',candidate_id::text,false)
FROM public.supplier_candidate_drafts
WHERE store_id='20000000-0000-4000-8000-000000000003';

-- Another supplier has no access to Beta candidate/store.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
DO $check$
DECLARE succeeded boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_draft_from_supplier_candidate(
      '20000000-0000-4000-8000-000000000003',
      current_setting('apex.test_candidate_id')::uuid,
      'CROSS-STORE-DRAFT',10000,0,'');
    succeeded:=true;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  IF succeeded THEN RAISE EXCEPTION 'Cross-supplier draft promotion succeeded'; END IF;
  IF (SELECT count(*) FROM public.supplier_candidate_drafts) <> 0
  THEN RAISE EXCEPTION 'Cross-supplier candidate mapping leaked'; END IF;
END $check$;

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.supplier_candidate_drafts) <> 0
 THEN RAISE EXCEPTION 'Nonmember candidate mapping leaked'; END IF;
END $check$;
RESET ROLE;
\echo PASS: atomic source draft promotion, explicit retail/stock, no duplication, tenant isolation.
