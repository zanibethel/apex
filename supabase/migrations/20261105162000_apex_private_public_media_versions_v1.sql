-- Track 1: private-only immutable public-media *candidate* version ledger.
-- No writer API, public bucket, signed link, public RPC or release authorization.
-- A separate, audited digest-copy and approval flow must be reviewed before
-- even one candidate is inserted or public media becomes available.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('apex_internal.private_release_gate') is null
  or to_regclass('public.private_media_evidence_events') is null
  or to_regclass('public.private_product_review_states') is null
  or to_regclass('public.products') is null
  or to_regclass('auth.users') is null
  or to_regclass('apex_internal.public_media_asset_versions_v1') is not null
  or to_regclass('apex_internal.public_media_asset_revocations_v1') is not null
  or (select enabled from apex_internal.private_release_gate
      where singleton=true) is distinct from false
 then raise exception 'Public media version ledger preflight denied';end if;
end $preflight$;

create table apex_internal.public_media_asset_versions_v1 (
 version_id uuid primary key,
 store_id uuid not null,
 product_id uuid not null,
 submission_id uuid not null,
 evidence_event_id uuid not null references
  public.private_media_evidence_events(id) on delete restrict,
 source_image_path text not null,
 asset_sha256 text not null,
 asset_key text not null unique,
 recorded_by uuid not null references auth.users(id) on delete restrict,
 recorded_at timestamptz not null default now(),
 foreign key(store_id,product_id) references
  public.products(store_id,id) on delete restrict,
 check(source_image_path =
  store_id::text || '/' || product_id::text || '/' ||
  split_part(source_image_path,'/',3)),
 check(source_image_path ~
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp)$'),
 check(asset_sha256 ~ '^[0-9a-f]{64}$'),
 check(asset_key =
  'media/v1/' || store_id::text || '/' || product_id::text ||
  '/' || version_id::text || '/' || asset_sha256 || '.' ||
  split_part(source_image_path,'.',2))
);
create index apex_media_versions_lookup_v1
 on apex_internal.public_media_asset_versions_v1
 (store_id,product_id,recorded_at desc,version_id);

create table apex_internal.public_media_asset_revocations_v1 (
 version_id uuid primary key references
  apex_internal.public_media_asset_versions_v1(version_id) on delete restrict,
 reason text not null check(reason in (
  'image_replaced','evidence_superseded','rights_withdrawn',
  'product_authorization_withdrawn','supplier_authorization_withdrawn',
  'administrative_revocation','asset_integrity_failed'
 )),
 recorded_by uuid not null references auth.users(id) on delete restrict,
 recorded_at timestamptz not null default now(),
 note text not null check(length(btrim(note)) between 10 and 1000)
);

alter table apex_internal.public_media_asset_versions_v1 enable row level security;
alter table apex_internal.public_media_asset_versions_v1 force row level security;
alter table apex_internal.public_media_asset_revocations_v1 enable row level security;
alter table apex_internal.public_media_asset_revocations_v1 force row level security;
revoke all on apex_internal.public_media_asset_versions_v1
 from public,anon,authenticated;
revoke all on apex_internal.public_media_asset_revocations_v1
 from public,anon,authenticated;
-- Neither table gets an RLS policy, a client grant, nor a public read function.

create function apex_internal.prevent_public_media_ledger_mutation_v1()
returns trigger language plpgsql set search_path=pg_catalog as $fn$
begin
 raise exception 'Public media version and revocation records are immutable';
end $fn$;

create trigger public_media_versions_immutable_v1
 before update or delete on apex_internal.public_media_asset_versions_v1
 for each row execute function apex_internal.prevent_public_media_ledger_mutation_v1();
create trigger public_media_revocations_immutable_v1
 before update or delete on apex_internal.public_media_asset_revocations_v1
 for each row execute function apex_internal.prevent_public_media_ledger_mutation_v1();

revoke all on function apex_internal.prevent_public_media_ledger_mutation_v1()
 from public,anon,authenticated;

do $postflight$
begin
 if (select enabled from apex_internal.private_release_gate
     where singleton=true) is distinct from false
  or exists(select 1 from apex_internal.public_media_asset_versions_v1)
  or exists(select 1 from apex_internal.public_media_asset_revocations_v1)
  or has_table_privilege('anon',
    'apex_internal.public_media_asset_versions_v1','SELECT')
  or has_table_privilege('authenticated',
    'apex_internal.public_media_asset_versions_v1','SELECT')
  or has_table_privilege('authenticated',
    'apex_internal.public_media_asset_versions_v1','INSERT')
  or has_table_privilege('anon',
    'apex_internal.public_media_asset_revocations_v1','SELECT')
  or has_table_privilege('authenticated',
    'apex_internal.public_media_asset_revocations_v1','INSERT')
 then raise exception 'Public media ledger privileges or release gate changed';end if;
end $postflight$;
commit;
