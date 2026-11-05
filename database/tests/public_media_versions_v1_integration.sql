-- CI ONLY: changes after schema install are in a rolled-back transaction.
\set ON_ERROR_STOP on
\ir ../../supabase/migrations/20261105162000_apex_private_public_media_versions_v1.sql

begin;
set local statement_timeout='30s';
do $check$
declare
 p record; actor uuid;
 v_id uuid='81111111-1111-4111-8111-111111111111';
 e_id uuid='81111111-1111-4111-8111-111111111112';
 source_path text;
 sha text=repeat('a',64);
 key_path text;
 blocked boolean;
begin
 if current_database()<>'apex_test'
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
  or has_table_privilege('anon','apex_internal.public_media_asset_versions_v1','SELECT')
  or has_table_privilege('authenticated','apex_internal.public_media_asset_versions_v1','INSERT')
  or has_table_privilege('anon','apex_internal.public_media_asset_revocations_v1','SELECT')
 then raise exception 'Private media contract CI preflight or privileges failed';end if;

 select id,store_id into p from public.products order by id limit 1;
 select id into actor from auth.users order by id limit 1;
 if p.id is null or actor is null then raise exception 'No isolated product/user fixture';end if;
 source_path=p.store_id::text||'/'||p.id::text||
  '/81111111-1111-4111-8111-111111111113.png';
 key_path='media/v1/'||p.store_id::text||'/'||p.id::text||
  '/'||v_id::text||'/'||sha||'.png';

 insert into public.private_media_evidence_events
  (id,store_id,product_id,submission_id,image_path,review_status,
   identity_reference,rights_reference,note,created_by)
 values(e_id,p.store_id,p.id,'81111111-1111-4111-8111-111111111114',
  source_path,'needs_correction','','',
  'Synthetic example deliberately has no image approval',actor);

 insert into apex_internal.public_media_asset_versions_v1
  (version_id,store_id,product_id,submission_id,evidence_event_id,
   source_image_path,asset_sha256,asset_key,recorded_by)
 values(v_id,p.store_id,p.id,'81111111-1111-4111-8111-111111111114',
  e_id,source_path,sha,key_path,actor);
 if (select asset_key from apex_internal.public_media_asset_versions_v1
     where version_id=v_id)<>key_path
 then raise exception 'Media version immutable key mismatch';end if;

 -- A candidate is never a public media approval. Explicit revocations are
 -- permanent append-only, even if future source details return to old values.
 insert into apex_internal.public_media_asset_revocations_v1
  (version_id,reason,recorded_by,note)
 values(v_id,'asset_integrity_failed',actor,
  'Synthetic failed immutable asset hash readback');
 if (select count(*) from apex_internal.public_media_asset_revocations_v1
    where version_id=v_id)<>1
 then raise exception 'Revocation event not recorded';end if;

 blocked:=false;
 begin
  update apex_internal.public_media_asset_versions_v1
   set asset_sha256=repeat('b',64) where version_id=v_id;
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Version overwrite was possible';end if;

 blocked:=false;
 begin
  delete from apex_internal.public_media_asset_versions_v1 where version_id=v_id;
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Version deletion was possible';end if;

 blocked:=false;
 begin
  update apex_internal.public_media_asset_revocations_v1
   set note='Attempt to erase a revocation' where version_id=v_id;
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Revocation overwrite was possible';end if;

 blocked:=false;
 begin
  delete from apex_internal.public_media_asset_revocations_v1 where version_id=v_id;
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Revocation deletion was possible';end if;

 blocked:=false;
 begin
  insert into apex_internal.public_media_asset_versions_v1
   (version_id,store_id,product_id,submission_id,evidence_event_id,
    source_image_path,asset_sha256,asset_key,recorded_by)
  values('81111111-1111-4111-8111-111111111115',p.store_id,p.id,
   '81111111-1111-4111-8111-111111111114',e_id,
   source_path,repeat('x',64),'https://private.example/object',actor);
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Forged asset URL and hash accepted';end if;

 blocked:=false;
 begin
  insert into apex_internal.public_media_asset_versions_v1
   (version_id,store_id,product_id,submission_id,evidence_event_id,
    source_image_path,asset_sha256,asset_key,recorded_by)
  values('81111111-1111-4111-8111-111111111116',p.store_id,p.id,
   '81111111-1111-4111-8111-111111111114',e_id,
   replace(source_path,p.id::text,'40000000-0000-4000-8000-000000000001'),
   sha,key_path,actor);
 exception when others then blocked:=true;end;
 if not blocked then raise exception 'Cross-product private source path accepted';end if;

 if (select count(*) from apex_internal.public_media_asset_versions_v1)<>1
  or (select count(*) from apex_internal.public_media_asset_revocations_v1)<>1
 then raise exception 'Rejected writes partially persisted';end if;
end $check$;

set local role anon;
do $denied$
declare allowed boolean:=false;
begin
 begin
  perform count(*) from apex_internal.public_media_asset_versions_v1;
  allowed:=true;
 exception when insufficient_privilege then null;end;
 if allowed then raise exception 'Anonymous read private media versions';end if;
end $denied$;
reset role;

set local role authenticated;
do $denied$
declare allowed boolean:=false;
begin
 begin
  perform count(*) from apex_internal.public_media_asset_revocations_v1;
  allowed:=true;
 exception when insufficient_privilege then null;end;
 if allowed then raise exception 'Supplier read private media revocations';end if;
end $denied$;
reset role;
rollback;

do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
  or exists(select 1 from apex_internal.public_media_asset_versions_v1)
  or exists(select 1 from apex_internal.public_media_asset_revocations_v1)
 then raise exception 'Media test persisted candidates, revocations or release';end if;
end $post$;
select 'PASS: private immutable media versions, permanent revocations, forged keys denied, roles isolated, gate off';
