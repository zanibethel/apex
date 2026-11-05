-- Disposable Postgres only: validates privileged issue/resolution, denials and revocation.
\set ON_ERROR_STOP on
create role service_role nologin bypassrls;
create schema if not exists storage;
create table if not exists storage.buckets(
 id text primary key,name text not null,public boolean not null,
 file_size_limit bigint,allowed_mime_types text[]
);
alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'::jsonb;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
\ir ../../supabase/migrations/20261105181000_apex_media_issue_and_resolve_v1.sql
begin;
update auth.users set raw_app_meta_data='{"apex_role":"platform_admin"}'::jsonb,
 email_confirmed_at=now() where id='50000000-0000-4000-8000-000000000003';

-- Use a previously submitted synthetic review product. Its captured snapshot
-- can be updated for disposable-only proof without forging hosted approvals.
do $prepare$
declare p record;actor uuid='50000000-0000-4000-8000-000000000003';
 ev uuid='84444444-4444-4444-8444-444444444441';
begin
 select p.id,p.store_id,s.supplier_id,p.category_id,p.image_path
 into p from public.products p join public.stores s on s.id=p.store_id
 join public.private_product_review_states r
 on r.product_id=p.id and r.store_id=p.store_id
 where p.category_id is not null and p.image_path is not null
 order by p.id limit 1;
 if p.id is null then raise exception 'Missing synthetic submitted photo';end if;
 perform set_config('apex.media.product',p.id::text,true);
 perform set_config('apex.media.store',p.store_id::text,true);
 perform set_config('apex.media.supplier',p.supplier_id::text,true);
 perform set_config('apex.media.evidence',ev::text,true);
 update public.products set is_active=true,is_published=false where id=p.id;
 update public.stores set is_public=false where id=p.store_id;
 update public.supplier_listing_controls set supplier_wants_listing=true,
  admin_gate='clear',republish_approval_required=false
  where product_id=p.id and store_id=p.store_id;
 insert into public.supplier_listing_controls(store_id,product_id,
  product_name,product_sku,supplier_wants_listing,admin_gate)
 select p.store_id,p.id,x.name,x.sku,true,'clear' from public.products x
 where x.id=p.id
 on conflict(store_id,product_id) do update set
  supplier_wants_listing=true,admin_gate='clear';
 insert into apex_internal.supplier_release_authorizations(
  supplier_id,status,valid_until,reviewed_at,reviewed_by,evidence_reference)
 values(p.supplier_id,'verified',current_date+5,now(),actor,
  'synthetic supplier verification')
 on conflict(supplier_id) do update set
  status='verified',valid_until=current_date+5,reviewed_at=now(),
  reviewed_by=actor,evidence_reference='synthetic supplier verification';
 insert into apex_internal.product_release_authorizations(
  store_id,product_id,status,valid_until,reviewed_at,reviewed_by,evidence_reference)
 values(p.store_id,p.id,'verified',current_date+5,now(),actor,
  'synthetic product verification')
 on conflict(store_id,product_id) do update set
  status='verified',valid_until=current_date+5,reviewed_at=now(),
  reviewed_by=actor,evidence_reference='synthetic product verification';
 delete from apex_internal.listing_identity_holds
  where supplier_id=p.supplier_id;
 update public.private_product_review_states r set
  status='approved_internal',submission_id='84444444-4444-4444-8444-444444444442',
  snapshot=jsonb_build_object('name',x.name,'sku',x.sku,
   'description',x.description,'category_id',x.category_id,
   'image_path',x.image_path)
 from public.products x where r.product_id=p.id and r.store_id=p.store_id
  and x.id=p.id;
 insert into public.private_media_evidence_events(
  id,store_id,product_id,submission_id,image_path,review_status,
  identity_reference,rights_reference,note,created_by)
 select ev,p.store_id,p.id,
  '84444444-4444-4444-8444-444444444442',x.image_path,
  'evidence_recorded','synthetic authenticated label evidence',
  'synthetic signed image permission',
  'Synthetic disposable media approval for automated test only',actor
 from public.products x where x.id=p.id;
end $prepare$;

do $check$
declare p uuid=current_setting('apex.media.product')::uuid;
 s uuid=current_setting('apex.media.store')::uuid;
 e uuid=current_setting('apex.media.evidence')::uuid;
 v uuid='84444444-4444-4444-8444-444444444443';
 x jsonb;
begin
 x:=public.apex_media_issue_preflight_v1(
  s,p,'84444444-4444-4444-8444-444444444442',e);
 if x is null or x->>'source_image_path' is null
 then raise exception 'Current synthetic independently authorized media refused';end if;
 x:=public.apex_media_issue_v1(s,p,
  '84444444-4444-4444-8444-444444444442',
  e,v,repeat('a',64),'50000000-0000-4000-8000-000000000003');
 if x is null or x->>'version_id'<>v::text
 then raise exception 'Service-side digest issue failed';end if;
 if public.apex_media_resolve_v1(p) is not null
 then raise exception 'Hard-disabled image delivery gate bypassed';end if;
 -- Both gates can only open in isolated synthetic transaction after
 -- explicitly dropping the hard OFF checks. Never performed on hosted.
 alter table apex_internal.private_media_delivery_gate_v1
  drop constraint private_media_delivery_gate_v1_enabled_check;
 alter table apex_internal.private_release_gate
  drop constraint private_release_gate_enabled_check;
 update apex_internal.private_media_delivery_gate_v1 set enabled=true where singleton;
 update apex_internal.private_release_gate set enabled=true where singleton;
 update public.categories set is_published=true
  where id=(select category_id from public.products where id=p);
 x:=public.apex_media_resolve_v1(p);
 if x is null or x->>'sha256'<>repeat('a',64)
  or x ? 'source_image_path' or x ? 'store_id'
 then raise exception 'Independently verified image not selected safely';end if;
 -- One changed image must revoke permanently and remove live lookup.
 update public.products set image_path=
  s::text||'/'||p::text||'/84444444-4444-4444-8444-444444444444.png'
 where id=p;
 if public.apex_media_resolve_v1(p) is not null
  or (select count(*) from apex_internal.public_media_asset_revocations_v1
   where version_id=v)<>1
 then raise exception 'Source edit did not revoke the matching image';end if;
end $check$;
rollback;

set role anon;
do $deny$
declare allowed boolean:=false;
begin
 begin
  perform public.apex_media_resolve_v1(
   '84444444-4444-4444-8444-444444444444');
  allowed:=true;
 exception when insufficient_privilege then null;end;
 if allowed then raise exception 'Anonymous privileged media resolver callable';end if;
end $deny$;
reset role;
do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
  or (select enabled from apex_internal.private_media_delivery_gate_v1 where singleton)
  or exists(select 1 from apex_internal.public_media_asset_versions_v1)
  or exists(select 1 from apex_internal.public_media_asset_revocations_v1)
 then raise exception 'Media isolated test persisted release or records';end if;
end $post$;
select 'PASS: private media issue, gate-off denial, synthetic positive and permanent revocation';
