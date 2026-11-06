-- Disposable PostgreSQL only. Runs after private staging + review-events migration.
\set ON_ERROR_STOP on
begin;
insert into public.suppliers(id,slug,display_name) values
 ('a2000000-0000-4000-8000-000000000001','review-fixture-a','Review A'),
 ('a2000000-0000-4000-8000-000000000002','review-fixture-b','Review B');
insert into public.stores(id,supplier_id,slug,display_name,is_public) values
 ('b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','review-fixture-a','A',false),
 ('b2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','review-fixture-b','B',false);
insert into public.supplier_memberships(supplier_id,user_id,role) values
 ('a2000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001','owner'),
 ('a2000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000002','staff'),
 ('a2000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000003','manager');
insert into public.apex_supplier_variant_review_items(
 store_id,source_batch,source_row,parent_title,source_name,source_section,
 strength,size,carrier_oil,retail_price_cents,review_status,review_note
) values
 ('b2000000-0000-4000-8000-000000000001','synthetic-review',4,'Complete Parent','Synthetic','Review','A(100mg)/B(50mg)','10 mL','MCT',1200,'pending_review',''),
 ('b2000000-0000-4000-8000-000000000001','synthetic-review',4,'Complete Parent','Synthetic','Review','A(100mg)/B(50mg)','10 mL','GSO',1300,'pending_review',''),
 ('b2000000-0000-4000-8000-000000000001','synthetic-review',5,'Held Parent','Ambiguous','Review','100 mg','10 mL','',null,'needs_clarification','Confirm price'),
 ('b2000000-0000-4000-8000-000000000002','synthetic-review',5,'Other Supplier','Synthetic','Review','100 mg','10 mL','',1100,'pending_review','');

do $permissions$
begin
 if has_table_privilege('anon','public.apex_supplier_parent_review_events','SELECT')
 or has_table_privilege('anon','public.apex_supplier_parent_review_events','INSERT')
 or has_table_privilege('authenticated','public.apex_supplier_parent_review_events','UPDATE')
 or has_table_privilege('authenticated','public.apex_supplier_parent_review_events','DELETE')
 or has_table_privilege('authenticated','public.apex_supplier_variant_review_items','INSERT')
 or not (select relrowsecurity and relforcerowsecurity from pg_class
   where oid='public.apex_supplier_parent_review_events'::regclass)
 then raise exception 'Review event table privilege or RLS error';end if;
end $permissions$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
-- Allowed: owner reviews actual unchanged source rows. Client receives only
-- protected staging values and sends the identical snapshot back.
insert into public.apex_supplier_parent_review_events
 (store_id,source_batch,parent_title,decision,note,reviewed_snapshot)
select 'b2000000-0000-4000-8000-000000000001'::uuid,'synthetic-review',
 'Complete Parent','approved','',
 jsonb_agg(jsonb_build_object(
  'id',r.id::text,'row',r.source_row,'sourceName',r.source_name,
  'section',r.source_section,'strength',r.strength,'size',r.size,
  'carrier',r.carrier_oil,'price',coalesce(r.retail_price_cents::text,''),
  'status',r.review_status,'note',r.review_note
 ) order by r.source_row,r.id)
from public.apex_supplier_variant_review_items r
where r.store_id='b2000000-0000-4000-8000-000000000001'
and r.source_batch='synthetic-review' and r.parent_title='Complete Parent';

-- "Needs Changes" is allowed even when the product's source row is held.
insert into public.apex_supplier_parent_review_events
 (store_id,source_batch,parent_title,decision,note,reviewed_snapshot)
select 'b2000000-0000-4000-8000-000000000001'::uuid,'synthetic-review',
 'Held Parent','needs_changes','Confirm exact strength/price pairing',
 jsonb_agg(jsonb_build_object(
  'id',r.id::text,'row',r.source_row,'sourceName',r.source_name,
  'section',r.source_section,'strength',r.strength,'size',r.size,
  'carrier',r.carrier_oil,'price',coalesce(r.retail_price_cents::text,''),
  'status',r.review_status,'note',r.review_note
 ) order by r.source_row,r.id)
from public.apex_supplier_variant_review_items r
where r.store_id='b2000000-0000-4000-8000-000000000001'
and r.source_batch='synthetic-review' and r.parent_title='Held Parent';

do $rejects$
declare bad boolean;
begin
 -- Held options cannot be approved, regardless of UI button state.
 bad:=false;
 begin
  insert into public.apex_supplier_parent_review_events
   (store_id,source_batch,parent_title,decision,note,reviewed_snapshot)
  select 'b2000000-0000-4000-8000-000000000001','synthetic-review',
  'Held Parent','approved','',jsonb_agg(jsonb_build_object(
   'id',r.id::text,'row',r.source_row,'sourceName',r.source_name,
   'section',r.source_section,'strength',r.strength,'size',r.size,
   'carrier',r.carrier_oil,'price',coalesce(r.retail_price_cents::text,''),
   'status',r.review_status,'note',r.review_note
  ) order by r.source_row,r.id)
  from public.apex_supplier_variant_review_items r
  where r.store_id='b2000000-0000-4000-8000-000000000001'
   and r.source_batch='synthetic-review' and r.parent_title='Held Parent';
 exception when others then bad:=true;end;
 if not bad then raise exception 'Held row was approved';end if;

 -- Correct product but a tampered price in the submitted snapshot is stale.
 bad:=false;
 begin
  insert into public.apex_supplier_parent_review_events
   (store_id,source_batch,parent_title,decision,note,reviewed_snapshot)
  select 'b2000000-0000-4000-8000-000000000001','synthetic-review',
  'Complete Parent','approved','',jsonb_set(jsonb_agg(jsonb_build_object(
   'id',r.id::text,'row',r.source_row,'sourceName',r.source_name,
   'section',r.source_section,'strength',r.strength,'size',r.size,
   'carrier',r.carrier_oil,'price',coalesce(r.retail_price_cents::text,''),
   'status',r.review_status,'note',r.review_note
  ) order by r.source_row,r.id),'{0,price}','"9999"'::jsonb)
  from public.apex_supplier_variant_review_items r
  where r.store_id='b2000000-0000-4000-8000-000000000001'
   and r.source_batch='synthetic-review' and r.parent_title='Complete Parent';
 exception when others then bad:=true;end;
 if not bad then raise exception 'Stale/tampered price was accepted';end if;

 -- Changes request requires a note.
 bad:=false;
 begin
  insert into public.apex_supplier_parent_review_events
   (store_id,source_batch,parent_title,decision,note,reviewed_snapshot)
  select 'b2000000-0000-4000-8000-000000000001','synthetic-review',
  'Held Parent','needs_changes','',jsonb_agg(jsonb_build_object(
   'id',r.id::text,'row',r.source_row,'sourceName',r.source_name,
   'section',r.source_section,'strength',r.strength,'size',r.size,
   'carrier',r.carrier_oil,'price',coalesce(r.retail_price_cents::text,''),
   'status',r.review_status,'note',r.review_note
  ) order by r.source_row,r.id)
  from public.apex_supplier_variant_review_items r
  where r.store_id='b2000000-0000-4000-8000-000000000001'
   and r.source_batch='synthetic-review' and r.parent_title='Held Parent';
 exception when others then bad:=true;end;
 if not bad then raise exception 'Empty correction note accepted';end if;
end $rejects$;
do $owner$
begin
 if (select count(*) from public.apex_supplier_parent_review_events)<>2
 then raise exception 'Owner decision count mismatch';end if;
end $owner$;

-- Staff cannot view or insert private content approvals.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $staff$
declare bad boolean:=false;
begin
 if exists(select 1 from public.apex_supplier_parent_review_events)
 then raise exception 'Staff could read approval events';end if;
 begin
  insert into public.apex_supplier_parent_review_events
   (store_id,source_batch,parent_title,decision,note,reviewed_snapshot)
  values('b2000000-0000-4000-8000-000000000001','synthetic-review',
   'Complete Parent','approved','', '[{"id":"invalid"}]'::jsonb);
 exception when others then bad:=true;end;
 if not bad then raise exception 'Staff could insert approval events';end if;
end $staff$;

-- A manager of another supplier cannot see or approve this store.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $cross$
declare bad boolean:=false;
begin
 if exists(select 1 from public.apex_supplier_parent_review_events)
 then raise exception 'Cross-store approval leaked';end if;
 begin
  insert into public.apex_supplier_parent_review_events
   (store_id,source_batch,parent_title,decision,note,reviewed_snapshot)
  values('b2000000-0000-4000-8000-000000000001','synthetic-review',
   'Complete Parent','approved','', '[{"id":"invalid"}]'::jsonb);
 exception when others then bad:=true;end;
 if not bad then raise exception 'Cross-store approval was allowed';end if;
end $cross$;
reset role;
do $final$
begin
 if (select count(*) from public.apex_supplier_parent_review_events)<>2
 then raise exception 'Unexpected extra approval events';end if;
 if exists(select 1 from public.products where is_published)
 then raise exception 'Content approval modified publication';end if;
end $final$;

rollback;
select 'PASS: private review append-only; precise snapshot, held-row, tenant and role controls; no commerce changes' as result;
