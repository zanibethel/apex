-- Disposable PostgreSQL only. Tests review-only snapshot RPC against the
-- initial catalog RLS. No hosted DB, payment or supplier release changes.
\set ON_ERROR_STOP on

insert into public.suppliers(id,slug,display_name)
 values('71000000-0000-0000-0000-000000000001','snapshot-test','Private snapshot test');
insert into public.stores(id,supplier_id,slug,display_name,is_public)
 values('72000000-0000-0000-0000-000000000001',
 '71000000-0000-0000-0000-000000000001','snapshot-test','Private snapshot store',false);
insert into public.categories(id,store_id,slug,name,is_published)
 values('73000000-0000-0000-0000-000000000001',
 '72000000-0000-0000-0000-000000000001','draft','Draft category',false);
insert into public.products(id,store_id,category_id,sku,name,description,
 price_cents,currency,is_published)
 values('74000000-0000-0000-0000-000000000001',
 '72000000-0000-0000-0000-000000000001',
 '73000000-0000-0000-0000-000000000001',
 'SNAPSHOT-TEST-1','Synthetic private test item','Test only',1234567,'USD',false);
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
 values('72000000-0000-0000-0000-000000000001',
 '74000000-0000-0000-0000-000000000001',11,3);

-- Even RLS-authorized authenticated browser users must not obtain another
-- supplier's private price or stock through the RPC.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{}',true);
do $test$
declare v_denied boolean:=false;
begin
 begin
  perform public.get_private_checkout_product_snapshot(
   '72000000-0000-0000-0000-000000000001',
   '74000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then v_denied:=true;
 end;
 if not v_denied then raise exception 'Regular user could read private checkout snapshot';end if;
end $test$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $test$
declare v jsonb; v_other jsonb;
begin
 v:=public.get_private_checkout_product_snapshot(
  '72000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001');
 if v->>'state'<>'observed_private'
  or v->>'price_cents'<>'1234567'
  or v->>'currency'<>'USD'
  or (v->>'quantity_on_hand')::int<>11
  or (v->>'quantity_reserved')::int<>3
  or (v->>'quantity_available')::int<>8
  or (v->>'inventory_observed')::boolean is not true
  or (v->>'can_quote')::boolean is not false
  or (v->>'can_order')::boolean is not false
  or (v->>'can_pay')::boolean is not false
 then raise exception 'Admin snapshot did not preserve private price/stock and blocked permissions';end if;
 if (v->>'is_published')::boolean is not false
  or (v->>'store_is_public')::boolean is not false
 then raise exception 'Draft product unexpectedly publicly available';end if;
 v_other:=public.get_private_checkout_product_snapshot(
  '72000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000002');
 if v_other->>'state'<>'unavailable'
  or (v_other->>'can_pay')::boolean is not false
  or v_other ? 'price_cents'
 then raise exception 'Missing item disclosed a private price';end if;
end $test$;
commit;

begin;
set local role anon;
do $test$
declare v_denied boolean:=false;
begin
 begin
  perform public.get_private_checkout_product_snapshot(
   '72000000-0000-0000-0000-000000000001',
   '74000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then v_denied:=true;
 end;
 if not v_denied then raise exception 'Anonymous user obtained protected snapshot';end if;
end $test$;
commit;
select 'PASS: private admin snapshot only, never payable';
