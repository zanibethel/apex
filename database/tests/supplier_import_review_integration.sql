-- CI-only private supplier cost queue isolation test.
\set ON_ERROR_STOP on
\ir ../sql/apex_private_supplier_import_review.sql

INSERT INTO public.supplier_import_candidates
 (store_id,source_index,product_name,strength,wholesale_cost_cents)
VALUES ('20000000-0000-4000-8000-000000000003',0,'Synthetic Preview Candidate','10 MG',1250),
       ('20000000-0000-4000-8000-000000000001',1,'Other Supplier Preview','5 MG',950);

DO $check$
BEGIN
 IF has_column_privilege('authenticated','public.supplier_import_candidates','wholesale_cost_cents','UPDATE')
    OR has_table_privilege('authenticated','public.supplier_import_candidates','INSERT')
    OR has_table_privilege('authenticated','public.supplier_import_review_audit','INSERT')
 THEN RAISE EXCEPTION 'Wholesale cost or audit table unexpectedly writable'; END IF;
END $check$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.supplier_import_candidates)<>1
 THEN RAISE EXCEPTION 'Beta supplier candidate isolation failed'; END IF;
END $check$;
UPDATE public.supplier_import_candidates SET review_status='under_review'
 WHERE store_id='20000000-0000-4000-8000-000000000003' AND source_index=0;
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.supplier_import_review_audit)<>1
 THEN RAISE EXCEPTION 'Supplier review audit missing'; END IF;
END $check$;

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.supplier_import_candidates)<>0
 THEN RAISE EXCEPTION 'Unaffiliated candidate read leaked'; END IF;
END $check$;
RESET ROLE;
\echo PASS: private candidate queue, audit and wholesaler cost isolation.
