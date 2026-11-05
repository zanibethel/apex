-- Track 1: permanently revoke old private media versions on relevant
-- product, content-review, evidence and supplier/product authorization changes.
-- No asset issuer, public image endpoint, roles or commerce gate are activated.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.public_media_asset_versions_v1') is null
  or to_regclass('apex_internal.public_media_asset_revocations_v1') is null
  or to_regclass('public.private_media_evidence_events') is null
  or to_regclass('public.private_product_review_states') is null
  or to_regclass('apex_internal.product_release_authorizations') is null
  or to_regclass('apex_internal.supplier_release_authorizations') is null
  or to_regclass('apex_internal.private_release_gate') is null
  or (select enabled from apex_internal.private_release_gate
   where singleton=true) is distinct from false
 then raise exception 'Public media auto-revocation preflight denied';end if;
end $preflight$;

-- User-authored manual revocations keep an actor. Database-triggered events
-- are explicitly marked automated, rather than impersonating an admin user.
alter table apex_internal.public_media_asset_revocations_v1
 add column automated boolean not null default false;
alter table apex_internal.public_media_asset_revocations_v1
 alter column recorded_by drop not null;
alter table apex_internal.public_media_asset_revocations_v1
 add constraint apex_media_revocation_attribution_v1
 check((automated=true and recorded_by is null)
  or (automated=false and recorded_by is not null));

create function apex_internal.revoke_old_public_media_versions_v1()
returns trigger language plpgsql security definer
 set search_path=pg_catalog as $fn$
declare
 v_store uuid;
 v_product uuid;
 v_supplier uuid;
 v_reason text;
 v_note text;
begin
 if tg_op='UPDATE' and to_jsonb(old)=to_jsonb(new) then
  return null;
 end if;

 if tg_table_schema='public' and tg_table_name='products' then
  v_store=old.store_id;v_product=old.id;
  if old.image_path is distinct from new.image_path then
   v_reason='image_replaced';
   v_note='Automatic revocation: product source image changed';
  else
   v_reason='evidence_superseded';
   v_note='Automatic revocation: product identity or content revised';
  end if;
 elsif tg_table_schema='public' and tg_table_name='private_product_review_states' then
  v_store=old.store_id;v_product=old.product_id;
  v_reason='evidence_superseded';
  v_note='Automatic revocation: submitted product review changed';
 elsif tg_table_schema='public' and tg_table_name='private_media_evidence_events' then
  v_store=new.store_id;v_product=new.product_id;
  v_reason='evidence_superseded';
  v_note='Automatic revocation: newer image evidence event recorded';
 elsif tg_table_schema='apex_internal'
  and tg_table_name='product_release_authorizations' then
  v_store=old.store_id;v_product=old.product_id;
  v_reason='product_authorization_withdrawn';
  v_note='Automatic revocation: product authorization was revised';
 elsif tg_table_schema='apex_internal'
  and tg_table_name='supplier_release_authorizations' then
  v_supplier=old.supplier_id;
  v_reason='supplier_authorization_withdrawn';
  v_note='Automatic revocation: supplier authorization was revised';
 else
  raise exception 'Unexpected automatic public media revocation source';
 end if;

 insert into apex_internal.public_media_asset_revocations_v1
  (version_id,reason,recorded_by,automated,note)
 select v.version_id,v_reason,null,true,v_note
 from apex_internal.public_media_asset_versions_v1 v
 where (v_supplier is not null and exists (
   select 1 from public.stores s
   where s.id=v.store_id and s.supplier_id=v_supplier))
  or (v_supplier is null and v.store_id=v_store and v.product_id=v_product
   and (tg_table_name<>'private_media_evidence_events'
     or v.evidence_event_id<>new.id))
 on conflict(version_id) do nothing;

 return null;
end $fn$;

-- Product edits already invalidate private content reviews; this independent
-- ledger also permanently revokes old media version IDs.
create trigger apex_media_revoke_product_revision_v1
 after update of image_path,name,sku,description,category_id on public.products
 for each row when (
  old.image_path is distinct from new.image_path
  or old.name is distinct from new.name
  or old.sku is distinct from new.sku
  or old.description is distinct from new.description
  or old.category_id is distinct from new.category_id
 )
 execute function apex_internal.revoke_old_public_media_versions_v1();

create trigger apex_media_revoke_review_revision_v1
 after update of submission_id,status,snapshot on public.private_product_review_states
 for each row when (
  old.submission_id is distinct from new.submission_id
  or old.status is distinct from new.status
  or old.snapshot is distinct from new.snapshot
 )
 execute function apex_internal.revoke_old_public_media_versions_v1();

create trigger apex_media_revoke_new_evidence_v1
 after insert on public.private_media_evidence_events
 for each row execute function apex_internal.revoke_old_public_media_versions_v1();

create trigger apex_media_revoke_product_authorization_v1
 after update or delete on apex_internal.product_release_authorizations
 for each row execute function apex_internal.revoke_old_public_media_versions_v1();

create trigger apex_media_revoke_supplier_authorization_v1
 after update or delete on apex_internal.supplier_release_authorizations
 for each row execute function apex_internal.revoke_old_public_media_versions_v1();

revoke all on function apex_internal.revoke_old_public_media_versions_v1()
 from public,anon,authenticated;

do $postflight$
begin
 if (select enabled from apex_internal.private_release_gate
    where singleton=true) is distinct from false
  or has_table_privilege('anon',
   'apex_internal.public_media_asset_versions_v1','SELECT')
  or has_table_privilege('authenticated',
   'apex_internal.public_media_asset_versions_v1','INSERT')
  or has_table_privilege('anon',
   'apex_internal.public_media_asset_revocations_v1','SELECT')
  or (select count(*) from pg_trigger
      where tgname like 'apex_media_revoke_%_v1' and not tgisinternal)<>5
 then raise exception 'Automatic media revocation or release privileges invalid';end if;
end $postflight$;
commit;
