-- PR #173. CI-only BTCPay REGTEST supplier credential binding.
-- Never apply to hosted Supabase; no real credential or wallet is stored.
-- Install after trusted store bindings; before any test worker invocation.
\set ON_ERROR_STOP on
begin;

create table public.btcpay_test_supplier_credentials (
 scope_id uuid primary key references public.btcpay_test_trusted_post_store_bindings(scope_id)
   on delete restrict,
 supplier_id uuid not null references public.suppliers(id) on delete restrict,
 btcpay_store_id text not null unique
   check (btcpay_store_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 credential_sha256 text not null unique
   check (credential_sha256 ~ '^[0-9a-f]{64}$'),
 status text not null default 'active' check (status in ('active','revoked')),
 bound_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 check ((status='active' and revoked_at is null) or
        (status='revoked' and revoked_at is not null))
);
alter table public.btcpay_test_supplier_credentials enable row level security;
revoke all on public.btcpay_test_supplier_credentials from PUBLIC,anon,authenticated;

create function apex_test_internal.enforce_supplier_credential_binding()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if tg_op='DELETE' then
   raise exception 'Supplier credential evidence cannot be deleted'
     using errcode='55000';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('storefront:'||new.scope_id::text,0));
 if tg_op='UPDATE' then
   if old.status<>'active' or new.status<>'revoked' or
      new.revoked_at is null or
      new.scope_id is distinct from old.scope_id or
      new.supplier_id is distinct from old.supplier_id or
      new.btcpay_store_id is distinct from old.btcpay_store_id or
      new.credential_sha256 is distinct from old.credential_sha256 or
      new.bound_at is distinct from old.bound_at then
     raise exception 'Only terminal credential revocation is permitted'
       using errcode='55000';
   end if;
   return new;
 end if;
 if not exists (
   select 1 from public.stores s
   join public.btcpay_test_trusted_post_store_bindings b
     on b.scope_id=s.id
   where s.id=new.scope_id and s.supplier_id=new.supplier_id
     and b.btcpay_store_id=new.btcpay_store_id and b.network='regtest'
 ) then
   raise exception 'Supplier and BTCPay store mismatch'
     using errcode='55000';
 end if;
 return new;
end;
$fn$;
revoke all on function apex_test_internal.enforce_supplier_credential_binding()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_supplier_credential_guard
 before insert or update or delete on public.btcpay_test_supplier_credentials
 for each row execute function apex_test_internal.enforce_supplier_credential_binding();

commit;
