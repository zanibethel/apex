-- Run ONLY in disposable CI PostgreSQL after catalog_rls_integration.sql.
\set ON_ERROR_STOP on
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $jwt$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
$jwt$;
GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;

\ir ../sql/apex_supplier_operations_review.sql

-- Restricted accounting tables are never writable by suppliers.
DO $assert$
BEGIN
 IF has_table_privilege('authenticated','public.supplier_sales_history','INSERT')
    OR has_table_privilege('authenticated','public.store_split_draft_audit','INSERT')
    OR has_table_privilege('authenticated','public.supplier_catalog_audit','INSERT')
 THEN RAISE EXCEPTION 'Audit/report data unexpectedly writable'; END IF;
 IF has_column_privilege('authenticated','public.products','is_published','UPDATE')
    OR has_column_privilege('authenticated','public.inventory_items','quantity_reserved','UPDATE')
 THEN RAISE EXCEPTION 'Supplier can alter publish/reserved stock fields'; END IF;
END $assert$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
-- Beta manager can manage drafts within Beta PRIVATE store only.
INSERT INTO public.products(store_id,sku,name,price_cents)
 VALUES('20000000-0000-4000-8000-000000000003','B-NEW-DRAFT','Draft test item',1999);
INSERT INTO public.inventory_items(store_id,product_id,quantity_on_hand)
 SELECT store_id,id,5 FROM public.products WHERE sku='B-NEW-DRAFT';

UPDATE public.inventory_items SET quantity_on_hand=7
 WHERE store_id='20000000-0000-4000-8000-000000000003'
 AND product_id=(SELECT id FROM public.products WHERE sku='B-NEW-DRAFT');

DO $assert$
BEGIN
 IF (select count(*) from public.supplier_catalog_audit where store_id='20000000-0000-4000-8000-000000000003') < 3
 THEN RAISE EXCEPTION 'Catalog/stock audit trail was not created'; END IF;
 IF (select quantity_on_hand from public.inventory_items
      where product_id=(select id from public.products where sku='B-NEW-DRAFT')) <> 7
 THEN RAISE EXCEPTION 'Stock change not persisted'; END IF;
END $assert$;

-- Unauthorized cross-store insertion must fail with RLS.
DO $assert$
BEGIN
 BEGIN
  INSERT INTO public.products(store_id,sku,name,price_cents)
   VALUES('20000000-0000-4000-8000-000000000001','CROSS-INVALID','Wrong store',100);
  RAISE EXCEPTION 'Cross store product write unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $assert$;
-- Suppliers cannot create real "confirmed" sales records.
DO $assert$
BEGIN
 BEGIN
  INSERT INTO public.supplier_sales_history(store_id,order_reference,sale_state,gross_cents,occurred_at)
   VALUES('20000000-0000-4000-8000-000000000003','BAD','confirmed',1,now());
  RAISE EXCEPTION 'Supplier created fake sales event';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $assert$;

-- Unaffiliated user cannot view private report/audit or edit catalog.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM public.supplier_catalog_audit)>0
 THEN RAISE EXCEPTION 'Unaffiliated user read private audit'; END IF;
 BEGIN
  INSERT INTO public.categories(store_id,slug,name) VALUES
  ('20000000-0000-4000-8000-000000000003','unauthorized','Unauthorized');
  RAISE EXCEPTION 'Unaffiliated category insert succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $assert$;

-- Admin split draft requires trusted app_metadata role, and writes are audited.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
SELECT set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',false);
INSERT INTO public.store_split_drafts(store_id,supplier_percent,edited_by)
 VALUES('20000000-0000-4000-8000-000000000001',90,'50000000-0000-4000-8000-000000000001');
UPDATE public.store_split_drafts
 SET supplier_percent=87,edited_by='50000000-0000-4000-8000-000000000001'
 WHERE store_id='20000000-0000-4000-8000-000000000001';
DO $assert$
BEGIN
 IF (SELECT count(*) FROM public.store_split_draft_audit)<>2
 THEN RAISE EXCEPTION 'Admin split audit missing events'; END IF;
END $assert$;
-- Role-claim denied to non-admins even if they are suppliers.
SELECT set_config('request.jwt.claims','{}',false);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM public.store_split_drafts)<>0
 THEN RAISE EXCEPTION 'Unprivileged admin split settings leaked'; END IF;
END $assert$;
RESET ROLE;
\echo PASS: draft product/inventory permissions, audit, sales privacy, admin split policy.
