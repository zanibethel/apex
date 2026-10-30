-- CI-only: run after the existing supplier import + draft + media fixtures.
\set ON_ERROR_STOP on
\ir ../sql/apex_supplier_cost_edit_audit.sql

INSERT INTO public.supplier_import_candidates(store_id,source_index,product_name,strength,wholesale_cost_cents)
VALUES('20000000-0000-4000-8000-000000000003',9,'Private test source','20 MG',1700);
DO $check$
BEGIN
 IF has_table_privilege('authenticated','public.supplier_source_cost_audit','INSERT')
   OR has_column_privilege('authenticated','public.supplier_import_candidates','product_name','UPDATE')
   OR NOT has_column_privilege('authenticated','public.supplier_import_candidates','wholesale_cost_cents','UPDATE')
 THEN RAISE EXCEPTION 'Source cost privileges unsafe';END IF;
END $check$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
UPDATE public.products SET internal_source_cost_cents=995
WHERE store_id='20000000-0000-4000-8000-000000000003' AND sku='B-NEW-DRAFT';
DO $check$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.products WHERE sku='B-NEW-DRAFT'
   AND internal_source_cost_cents=995)
 THEN RAISE EXCEPTION 'Direct product internal cost was not saved';END IF;
END $check$;
UPDATE public.supplier_import_candidates SET wholesale_cost_cents=1799
WHERE store_id='20000000-0000-4000-8000-000000000003' AND source_index=9;
DO $check$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.supplier_source_cost_audit
  WHERE old_cost_cents=1700 AND new_cost_cents=1799
   AND actor_id='50000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'Cost audit did not capture identity and amounts';END IF;
END $check$;

UPDATE public.supplier_import_candidates SET review_status='approved_for_draft'
WHERE store_id='20000000-0000-4000-8000-000000000003' AND source_index=9;
SELECT public.create_draft_from_candidate_with_compare(
 '20000000-0000-4000-8000-000000000003',
 (SELECT id FROM public.supplier_import_candidates WHERE source_index=9),
 'MOBILE-QA-20MG',4500,0,'Internal test only',6000
);
DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE sku='MOBILE-QA-20MG'
  AND price_cents=4500 AND compare_at_price_cents=6000 AND is_published=false)
 THEN RAISE EXCEPTION 'Atomic purchase / compare price failed';END IF;
END $check$;

DO $check$
DECLARE succeeded boolean:=false;
BEGIN
 BEGIN
  PERFORM public.create_draft_from_candidate_with_compare(
   '20000000-0000-4000-8000-000000000003',
   (SELECT id FROM public.supplier_import_candidates WHERE source_index=9),
   'INVALID-COMPARE-DUP',4900,0,'',4800);
  succeeded:=true;
 EXCEPTION WHEN OTHERS THEN NULL;END;
 IF succeeded OR EXISTS(SELECT 1 FROM public.products WHERE sku='INVALID-COMPARE-DUP')
 THEN RAISE EXCEPTION 'Bad compare-at price left a draft';END IF;
END $check$;

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
DO $check$
DECLARE succeeded boolean:=false;
BEGIN
 BEGIN
  UPDATE public.supplier_import_candidates SET wholesale_cost_cents=450
  WHERE store_id='20000000-0000-4000-8000-000000000003' AND source_index=9;
  IF FOUND THEN succeeded:=true;END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF succeeded THEN RAISE EXCEPTION 'Cross-supplier source cost change';END IF;
 IF EXISTS (SELECT 1 FROM public.products WHERE sku='B-NEW-DRAFT')
 THEN RAISE EXCEPTION 'Cross-supplier product price or cost leaked';END IF;
 IF (SELECT count(*) FROM public.supplier_source_cost_audit) <> 0
 THEN RAISE EXCEPTION 'Cross-supplier source cost audit leaked';END IF;
END $check$;
RESET ROLE;
\echo PASS: cost-only supplier grants, audited edit, compare price, tenant isolation.
