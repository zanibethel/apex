-- CI ONLY: synthetic automatic revocation, completely rolled back.
\set ON_ERROR_STOP on
\ir ../../supabase/migrations/20261105170000_apex_public_media_auto_revocation_v1.sql

begin;
set local statement_timeout='30s';
do $check$
declare
 p record;actor uuid;
 ev1 uuid='82222222-2222-4222-8222-222222222221';
 ev2 uuid='82222222-2222-4222-8222-222222222222';
 submission uuid='82222222-2222-4222-8222-222222222223';
 v_version uuid;source text;key_path text;
 digest text=repeat('b',64);
 n integer;
begin
 if current_database()<>'apex_test'
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'Automatic revocation test not isolated';end if;

 select p.id,p.store_id,s.supplier_id into p
 from public.products p
 join public.stores s on s.id=p.store_id
 join apex_internal.product_release_authorizations pa
  on pa.store_id=p.store_id and pa.product_id=p.id
 join apex_internal.supplier_release_authorizations sa
  on sa.supplier_id=s.supplier_id
 order by p.id limit 1;
 select id into actor from auth.users order by id limit 1;
 if p.id is null or actor is null
 then raise exception 'Missing synthetic media approval fixture';end if;

 source=p.store_id::text||'/'||p.id::text||
  '/82222222-2222-4222-8222-222222222224.png';
 update public.products set image_path=source
 where store_id=p.store_id and id=p.id;

 insert into public.private_media_evidence_events(
  id,store_id,product_id,submission_id,image_path,review_status,
  identity_reference,rights_reference,note,created_by)
 values(ev1,p.store_id,p.id,submission,source,
  'needs_correction','','',
  'Synthetic media evidence deliberately not approved',actor);

 -- Helper: insert an isolated version with a new immutable revision UUID.
 for n in 1..4 loop
  v_version=(
   '82222222-2222-4222-8222-' || lpad(n::text,12,'0'))::uuid;
  key_path='media/v1/'||p.store_id::text||'/'||p.id::text||
   '/'||v_version::text||'/'||digest||'.png';
  insert into apex_internal.public_media_asset_versions_v1(
   version_id,store_id,product_id,submission_id,evidence_event_id,
   source_image_path,asset_sha256,asset_key,recorded_by)
  values(v_version,p.store_id,p.id,submission,ev1,source,digest,key_path,actor);

  if n=1 then
   update public.products set image_path=p.store_id::text||'/'||p.id::text||
    '/82222222-2222-4222-8222-222222222225.png'
   where id=p.id and store_id=p.store_id;
  elsif n=2 then
   insert into public.private_media_evidence_events(
    id,store_id,product_id,submission_id,image_path,review_status,
    identity_reference,rights_reference,note,created_by)
   values(ev2,p.store_id,p.id,submission,source,
    'needs_correction','','',
    'Second evidence event must invalidate earlier version',actor);
  elsif n=3 then
   update apex_internal.product_release_authorizations
    set valid_until=coalesce(valid_until,current_date)-1 where store_id=p.store_id and product_id=p.id;
  elsif n=4 then
   update apex_internal.supplier_release_authorizations
    set valid_until=coalesce(valid_until,current_date)-1 where supplier_id=p.supplier_id;
  end if;
  if (select count(*) from apex_internal.public_media_asset_revocations_v1
      where version_id=v_version)<>1
   then raise exception 'Version % was not automatically revoked',v_version;end if;
 end loop;

 if (select count(*) from apex_internal.public_media_asset_revocations_v1
   where automated=true and recorded_by is null)<>4
 then raise exception 'Automated revocations are not separately attributed';end if;

 if exists(select 1 from apex_internal.public_media_asset_revocations_v1
  where reason not in('image_replaced','evidence_superseded',
   'product_authorization_withdrawn','supplier_authorization_withdrawn'))
 then raise exception 'Wrong automatic revocation reason';end if;

 -- User-supplied "system" attribution is forbidden without an actor unless
 -- an explicitly recorded automatic trigger performs the insertion.
 begin
  insert into apex_internal.public_media_asset_revocations_v1
   (version_id,reason,automated,recorded_by,note)
  values('82222222-2222-4222-8222-222222222299',
   'administrative_revocation',false,null,
   'Forged manual revocation with no reviewer');
  raise exception 'Expected forged manual revocation to fail';
 exception
  when check_violation or foreign_key_violation then null;
 end;

 if (select count(*) from apex_internal.public_media_asset_revocations_v1)<>4
 then raise exception 'Repeated revocation appended duplicate rows';end if;
end $check$;
rollback;

do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
  or exists(select 1 from apex_internal.public_media_asset_versions_v1)
  or exists(select 1 from apex_internal.public_media_asset_revocations_v1)
  or has_table_privilege('anon','apex_internal.public_media_asset_revocations_v1','SELECT')
 then raise exception 'CI auto-revocation left release, rights or version records';end if;
end $post$;
select 'PASS: source edits, evidence updates and release changes permanently revoke exact versions';
