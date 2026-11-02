-- DISPOSABLE CI ONLY: an unreviewed source may create an auditable
-- private zero-stock card, not a public listing or checkout item.
\set ON_ERROR_STOP on
insert into public.supplier_import_candidates(
 store_id,source_index,product_name,strength,wholesale_cost_cents,review_status)
values
 ('20000000-0000-4000-8000-000000000003',901,'Synthetic Laboratory Reference','5 MG',1201,'unverified'),
 ('20000000-0000-4000-8000-000000000001',902,'Other Supplier Only','10 MG',950,'unverified');
select id as candidate_id from public.supplier_import_candidates
 where store_id='20000000-0000-4000-8000-000000000003' and source_index=901 \gset
select set_config('apex.test.unreviewed_candidate', :'candidate_id',false);

do $test$
begin
 if has_function_privilege('anon',
  'public.create_private_draft_from_source(uuid,uuid,text,text,bigint)','EXECUTE')
 then raise exception 'Anonymous caller can prepare private source records';end if;
end $test$;
set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $test$
declare succeeded boolean:=false;
begin
 begin
  perform public.create_private_draft_from_source(
   '20000000-0000-4000-8000-000000000003',
   current_setting('apex.test.unreviewed_candidate')::uuid,
   'CROSS-PRIVATE-IMPORT','Unauthenticated cross-tenant product',1201);
  succeeded:=true;
 exception when others then null;end;
 if succeeded then raise exception 'Cross-supplier source import allowed';end if;
end $test$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $test$
declare succeeded boolean:=false;
begin
 begin
  perform public.create_private_draft_from_source(
   '20000000-0000-4000-8000-000000000003',
   current_setting('apex.test.unreviewed_candidate')::uuid,
   'STALE-COST-PRIVATE','Stale source cost attempt',1200);
  succeeded:=true;
 exception when others then null;end;
 if succeeded then raise exception 'Stale wholesale source cost accepted';end if;
end $test$;

select public.create_private_draft_from_source(
 '20000000-0000-4000-8000-000000000003',
 current_setting('apex.test.unreviewed_candidate')::uuid,
 'BETA-PRIVATE-PREP-901','Neutral synthetic draft description',1201
);
do $test$
begin
 if not exists (
  select 1 from public.products p
   join public.supplier_candidate_drafts link on link.product_id=p.id
   join public.inventory_items i on i.store_id=p.store_id and i.product_id=p.id
   join public.supplier_import_candidates c on c.id=link.candidate_id
  where p.sku='BETA-PRIVATE-PREP-901'
   and p.price_cents=2402 and p.compare_at_price_cents=3003
   and p.internal_source_cost_cents=1201 and p.is_active=false
   and p.is_published=false and p.image_path is null
   and i.quantity_on_hand=0 and i.quantity_reserved=0
   and c.review_status='unverified'
   and link.candidate_id=current_setting('apex.test.unreviewed_candidate')::uuid
 ) then raise exception 'Unverified private source draft failed persistence checks';end if;
end $test$;
do $test$
declare succeeded boolean:=false;
begin
 begin
  perform public.create_private_draft_from_source(
   '20000000-0000-4000-8000-000000000003',
   current_setting('apex.test.unreviewed_candidate')::uuid,
   'BETA-PRIVATE-DUP-901','Duplicate attempt',1201);
  succeeded:=true;
 exception when others then null;end;
 if succeeded then raise exception 'Duplicate source produced second private card';end if;
 if exists(select 1 from public.products where sku='BETA-PRIVATE-DUP-901')
 then raise exception 'Duplicate failure produced orphan product';end if;
end $test$;
reset role;
do $test$
begin
 if exists(select 1 from public.products where sku='BETA-PRIVATE-PREP-901' and is_published)
 or not exists(select 1 from apex_internal.private_release_gate where singleton=true and enabled=false)
 then raise exception 'Private source preparation bypassed public release gate';end if;
end $test$;
\echo PASS: unreviewed source creates linked private zero-stock card with no approval, sale, or cross-tenant access.
