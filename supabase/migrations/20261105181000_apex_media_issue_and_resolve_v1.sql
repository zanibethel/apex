-- Apex Track 1: audited media issuing/authorizing SQL ONLY.
-- All records remain private, release gates remain OFF, no customer media access.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $pre$
begin
 if to_regclass('apex_internal.private_release_gate') is null
 or to_regclass('apex_internal.public_media_asset_versions_v1') is null
 or to_regclass('apex_internal.public_media_asset_revocations_v1') is null
 or to_regclass('public.private_media_evidence_events') is null
 or to_regclass('public.private_product_review_states') is null
 or not exists(select 1 from apex_internal.private_release_gate
  where singleton=true and enabled=false)
 then raise exception 'Media issue/delivery preflight: global release must be OFF';end if;
end $pre$;

-- The approved-copy bucket is ALSO PRIVATE, and has no client Storage
-- policies. Its objects are immutable by convention (no update/delete
-- privileges or API upserts); only the Edge service-role worker may write.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('apex-approved-product-images-v1','apex-approved-product-images-v1',
 false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
do $bucket$
begin
 if not exists(select 1 from storage.buckets
  where id='apex-approved-product-images-v1' and public=false
  and file_size_limit=3145728
  and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[])
 then raise exception 'Approved private copy bucket must remain private';end if;
end $bucket$;

-- Separate hard-disabled switch. Any later activation requires an explicit
-- reviewed migration, not a supplier preference or unverified media event.
create table apex_internal.private_media_delivery_gate_v1(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false check(enabled=false)
);
insert into apex_internal.private_media_delivery_gate_v1(singleton,enabled)
values(true,false);
alter table apex_internal.private_media_delivery_gate_v1 enable row level security;
alter table apex_internal.private_media_delivery_gate_v1 force row level security;
revoke all on apex_internal.private_media_delivery_gate_v1
 from public,anon,authenticated;

-- A service-role-only, atomically read, exact-submission preflight.
-- NEVER expose private paths to a customer or supplier API.
create function public.apex_media_issue_preflight_v1(
 p_store uuid,p_product uuid,p_submission uuid,p_evidence uuid)
returns jsonb language sql stable security definer
 set search_path=pg_catalog as $fn$
 select jsonb_build_object(
  'store_id',p.store_id,'product_id',p.id,
  'submission_id',r.submission_id,'evidence_id',e.id,
  'source_image_path',p.image_path
 )
 from public.products p
 join public.stores s on s.id=p.store_id and s.is_public=false
 join public.categories cat on cat.id=p.category_id and cat.store_id=p.store_id
 join public.supplier_listing_controls c on c.store_id=p.store_id
  and c.product_id=p.id and c.supplier_wants_listing=true and c.admin_gate='clear'
  and (not c.republish_approval_required or c.republish_approved)
 join public.private_product_review_states r on r.store_id=p.store_id
  and r.product_id=p.id and r.submission_id=p_submission
  and r.status='approved_internal'
  and r.snapshot->>'image_path'=p.image_path
  and r.snapshot->>'name'=p.name and r.snapshot->>'sku'=p.sku
  and r.snapshot->>'description'=p.description
  and r.snapshot->>'category_id'=p.category_id::text
 join public.private_media_evidence_events e on e.store_id=p.store_id
  and e.product_id=p.id and e.submission_id=r.submission_id
  and e.id=p_evidence and e.image_path=p.image_path
  and e.review_status='evidence_recorded'
  and length(btrim(e.identity_reference))>=8
  and length(btrim(e.rights_reference))>=8
 join apex_internal.supplier_release_authorizations sa on sa.supplier_id=s.supplier_id
  and sa.status='verified' and sa.valid_until>=current_date
  and sa.reviewed_by is not null and sa.reviewed_at is not null
  and length(btrim(coalesce(sa.evidence_reference,'')))>=8
 join apex_internal.product_release_authorizations pa on pa.store_id=p.store_id
  and pa.product_id=p.id and pa.status='verified' and pa.valid_until>=current_date
  and pa.reviewed_by is not null and pa.reviewed_at is not null
  and length(btrim(coalesce(pa.evidence_reference,'')))>=8
 where p.store_id=p_store and p.id=p_product and p.is_published=false
  and p.is_active=true and p.currency='USD'
  and p.price_cents between 1 and 999999999
  and p.image_path ~ (
   '^'||p.store_id::text||'/'||p.id::text||
   '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$'
  )
  and not exists(select 1 from public.private_media_evidence_events later
   where later.store_id=e.store_id and later.product_id=e.product_id
    and (later.created_at,later.id)>(e.created_at,e.id))
  and not exists(select 1 from apex_internal.listing_identity_holds h
   where h.supplier_id=s.supplier_id and h.active=true
    and h.signature=apex_internal.listing_signature(p.name))
 limit 1;
$fn$;
revoke all on function public.apex_media_issue_preflight_v1(uuid,uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.apex_media_issue_preflight_v1(uuid,uuid,uuid,uuid)
 to service_role;

-- Service-only transactional finalization after the independent Edge worker
-- has read/copied BOTH objects and verified their SHA-256 byte digests.
-- The service-role credential never appears in Vercel or browser JavaScript.
create function public.apex_media_issue_v1(
 p_store uuid,p_product uuid,p_submission uuid,p_evidence uuid,
 p_version uuid,p_sha256 text,p_actor uuid)
returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare v_snapshot jsonb;v_path text;v_ext text;v_asset text;
begin
 if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
  or p_actor is null
  or not exists(select 1 from auth.users u where u.id=p_actor
    and u.raw_app_meta_data->>'apex_role'='platform_admin'
    and u.email_confirmed_at is not null)
 then return null;end if;
 -- Serialize per-product issue with any concurrent product mutation.
 perform 1 from public.products where store_id=p_store and id=p_product for update;
 v_snapshot:=public.apex_media_issue_preflight_v1(
  p_store,p_product,p_submission,p_evidence);
 if v_snapshot is null then return null;end if;
 v_path:=v_snapshot->>'source_image_path';
 v_ext:=split_part(v_path,'.',2);
 v_asset:='media/v1/'||p_store::text||'/'||p_product::text
  ||'/'||p_version::text||'/'||p_sha256||'.'||v_ext;
 insert into apex_internal.public_media_asset_versions_v1(
  version_id,store_id,product_id,submission_id,evidence_event_id,
  source_image_path,asset_sha256,asset_key,recorded_by)
 values(p_version,p_store,p_product,p_submission,p_evidence,
  v_path,p_sha256,v_asset,p_actor);
 return jsonb_build_object('version_id',p_version,'asset_key',v_asset);
exception when unique_violation or check_violation then
 return null;
end $fn$;
revoke all on function public.apex_media_issue_v1(uuid,uuid,uuid,uuid,uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.apex_media_issue_v1(uuid,uuid,uuid,uuid,uuid,text,uuid)
 to service_role;

-- One noncached, service-only decision per asset request. The newest version
-- MUST still match the latest approved evidence and current independent
-- authorizations; even an older valid version cannot be resurrected.
create function public.apex_media_resolve_v1(p_product uuid)
returns jsonb language sql volatile security definer
 set search_path=pg_catalog as $fn$
 select jsonb_build_object(
  'version_id',v.version_id,
  'asset_key',v.asset_key,
  'sha256',v.asset_sha256
 )
 from apex_internal.public_media_asset_versions_v1 v
 join public.products p on p.id=v.product_id and p.store_id=v.store_id
 join public.stores s on s.id=v.store_id and s.is_public=false
 join public.categories cat on cat.id=p.category_id
  and cat.store_id=p.store_id and cat.is_published=true
 join public.supplier_listing_controls c on c.store_id=v.store_id
  and c.product_id=v.product_id and c.supplier_wants_listing=true
  and c.admin_gate='clear'
  and (not c.republish_approval_required or c.republish_approved)
 join public.private_product_review_states r on r.store_id=v.store_id
  and r.product_id=v.product_id and r.status='approved_internal'
  and r.submission_id=v.submission_id
  and r.snapshot->>'image_path'=v.source_image_path
  and r.snapshot->>'name'=p.name and r.snapshot->>'sku'=p.sku
  and r.snapshot->>'description'=p.description
  and r.snapshot->>'category_id'=p.category_id::text
 join public.private_media_evidence_events e on e.id=v.evidence_event_id
  and e.store_id=v.store_id and e.product_id=v.product_id
  and e.submission_id=v.submission_id and e.image_path=v.source_image_path
  and e.review_status='evidence_recorded'
  and length(btrim(e.identity_reference))>=8
  and length(btrim(e.rights_reference))>=8
 join apex_internal.supplier_release_authorizations sa
  on sa.supplier_id=s.supplier_id and sa.status='verified'
  and sa.valid_until>=current_date and sa.reviewed_at is not null
  and sa.reviewed_by is not null
  and length(btrim(coalesce(sa.evidence_reference,'')))>=8
 join apex_internal.product_release_authorizations pa
  on pa.store_id=v.store_id and pa.product_id=v.product_id
  and pa.status='verified' and pa.valid_until>=current_date
  and pa.reviewed_at is not null and pa.reviewed_by is not null
  and length(btrim(coalesce(pa.evidence_reference,'')))>=8
 where v.product_id=p_product and p.image_path=v.source_image_path
  and p.is_published=false and p.is_active=true and p.currency='USD'
  and not exists(select 1 from apex_internal.public_media_asset_revocations_v1 z
   where z.version_id=v.version_id)
  and not exists(select 1 from public.private_media_evidence_events later
   where later.store_id=e.store_id and later.product_id=e.product_id
    and (later.created_at,later.id)>(e.created_at,e.id))
  and not exists(select 1 from apex_internal.listing_identity_holds h
   where h.supplier_id=s.supplier_id and h.active=true
    and h.signature=apex_internal.listing_signature(p.name))
  and exists(select 1 from apex_internal.private_release_gate g
   where g.singleton=true and g.enabled=true)
  and exists(select 1 from apex_internal.private_media_delivery_gate_v1 g
   where g.singleton=true and g.enabled=true)
  and v.version_id=(
   select newest.version_id from apex_internal.public_media_asset_versions_v1 newest
   where newest.store_id=v.store_id and newest.product_id=v.product_id
   order by newest.recorded_at desc,newest.version_id desc limit 1
  )
 order by v.recorded_at desc,v.version_id desc limit 1;
$fn$;
revoke all on function public.apex_media_resolve_v1(uuid)
 from public,anon,authenticated;
grant execute on function public.apex_media_resolve_v1(uuid) to service_role;

do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
  is distinct from false
 or (select enabled from apex_internal.private_media_delivery_gate_v1 where singleton)
  is distinct from false
 or exists(select 1 from apex_internal.public_media_asset_versions_v1)
 or has_function_privilege('anon','public.apex_media_issue_v1(uuid,uuid,uuid,uuid,uuid,text,uuid)','EXECUTE')
 or has_function_privilege('authenticated','public.apex_media_resolve_v1(uuid)','EXECUTE')
 or (select public from storage.buckets where id='apex-approved-product-images-v1')
 then raise exception 'Media issue/delivery privileges or gates invalid';end if;
end $post$;
commit;
