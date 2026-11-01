-- PR #126. Isolated GitHub Actions PostgreSQL ONLY, not Supabase migration.
-- Trusted operator binds the EXACT Apex store to the disposable BTCPay store.
-- A different BTCPay store cannot be substituted when reserving a POST.
begin;
create table public.btcpay_test_trusted_post_store_bindings (
 scope_id uuid primary key references public.stores(id) on delete restrict,
 btcpay_store_id text not null unique check
   (btcpay_store_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 network text not null check (network='regtest')
);
alter table public.btcpay_test_trusted_post_store_bindings enable row level security;
revoke all on public.btcpay_test_trusted_post_store_bindings from PUBLIC,anon,authenticated;
create trigger btcpay_test_post_binding_immutable
 before update or delete on public.btcpay_test_trusted_post_store_bindings
 for each row execute function apex_test_internal.block_test_receipt_mutation();

create function apex_test_internal.require_test_provider_binding()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.btcpay_test_trusted_post_store_bindings b
  where b.scope_id=new.scope_id and b.btcpay_store_id=new.btcpay_store_id
    and b.network=new.network) then
  raise exception 'Provider store binding missing or mismatched'
    using errcode='55000';
 end if;
 return new;
end; $$;
revoke all on function apex_test_internal.require_test_provider_binding()
 from PUBLIC,anon,authenticated;
create trigger btcpay_test_provider_post_bound_before_insert
 before insert on public.btcpay_test_provider_post_intents
 for each row execute function apex_test_internal.require_test_provider_binding();
commit;
