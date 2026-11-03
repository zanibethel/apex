-- PR #173. Disposable PostgreSQL supplier identity and credential restrictions.
-- Fixture supplies two different suppliers, stores and two independent API keys.
\set ON_ERROR_STOP on
do $$
declare
 a uuid:='39000000-0000-0000-0000-000000000001';
 b uuid:='39000000-0000-0000-0000-000000000002';
begin
 if (select count(distinct s.supplier_id) from public.stores s
   where s.id in(a,b))<>2 then
   raise exception 'Cross-store test lacks independent supplier identities';
 end if;
 if (select count(*) from public.btcpay_test_supplier_credentials c
   where c.scope_id in(a,b) and c.status='active')<>2 then
   raise exception 'Exactly two active provider credentials required';
 end if;
 if exists(select 1 from public.btcpay_test_supplier_credentials c
    join public.stores s on s.id=c.scope_id
    join public.btcpay_test_trusted_post_store_bindings b on b.scope_id=c.scope_id
    where c.supplier_id<>s.supplier_id or
      c.btcpay_store_id<>b.btcpay_store_id or b.network<>'regtest') then
   raise exception 'Supplier/provider store binding is inconsistent';
 end if;
 if has_table_privilege('apex_test_invoice_worker',
     'public.btcpay_test_supplier_credentials','SELECT') or
    has_table_privilege('apex_test_invoice_worker',
     'public.btcpay_test_supplier_credentials','INSERT') or
    has_table_privilege('authenticated',
     'public.btcpay_test_supplier_credentials','SELECT') or
    has_table_privilege('anon',
     'public.btcpay_test_supplier_credentials','SELECT') then
   raise exception 'Credential fingerprints are directly readable or writable';
 end if;
end $$;

-- Public/browser roles and arbitrary SQL callers have no entry point.
begin;
set local role authenticated;
do $$
declare blocked boolean:=false;
begin
 begin
  perform apex_test_worker.worker_reserve_btcpay_test_provider_post(
    '39000000-0000-0000-0000-000000000001',
    'trusted-synthetic-store-ok','browser-forgery-1',10000,repeat('a',64));
 exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Browser called private worker RPC'; end if;
end $$;
rollback;

-- Wrong supplier credential must fail *before* burning either open permit.
-- SQL function checks are scoped to immutable Apex supplier identity.
begin;
set local role apex_test_invoice_worker;
do $$
declare denied boolean:=false;
begin
 begin
  perform apex_test_worker.worker_reserve_btcpay_test_provider_post(
    '39000000-0000-0000-0000-000000000001',
    'trusted-synthetic-store-ok','supplier-b-token',10000,
    encode(sha256(convert_to('other_supplier_disposable_key_do_not_use','UTF8')),'hex'));
 exception when sqlstate '55000' then denied:=true; end;
 if not denied then raise exception 'Supplier B credential authorized A'; end if;
 denied:=false;
 begin
  perform apex_test_worker.worker_reserve_btcpay_test_provider_post(
    '39000000-0000-0000-0000-000000000002',
    'trusted-synthetic-store-timeout','supplier-a-token',10000,
    encode(sha256(convert_to('disposable_fake_key_do_not_use','UTF8')),'hex'));
 exception when sqlstate '55000' then denied:=true; end;
 if not denied then raise exception 'Supplier A credential authorized B'; end if;
end $$;
rollback;
do $$
begin
 if (select count(*) from public.btcpay_test_checkout_resume_permits
    where scope_id in ('39000000-0000-0000-0000-000000000001',
                       '39000000-0000-0000-0000-000000000002')
      and status='open')<>2 then
   raise exception 'Wrong supplier consumed an invoice permit';
 end if;
end $$;

-- The admin may permanently REVOKE a key; an already-open permit must then
-- refuse its old token. The transaction rollback restores synthetic fixtures
-- so the legitimate worker tests can still run on the exact same stores.
begin;
update public.btcpay_test_supplier_credentials
set status='revoked',revoked_at=clock_timestamp()
where scope_id='39000000-0000-0000-0000-000000000001';
set local role apex_test_invoice_worker;
do $$
declare denied boolean:=false;
begin
 begin
  perform apex_test_worker.worker_reserve_btcpay_test_provider_post(
    '39000000-0000-0000-0000-000000000001',
    'trusted-synthetic-store-ok','revoked-key',10000,
    encode(sha256(convert_to('disposable_fake_key_do_not_use','UTF8')),'hex'));
 exception when sqlstate '55000' then denied:=true; end;
 if not denied then raise exception 'Revoked key authorized provider POST'; end if;
end $$;
rollback;

do $$
declare denied boolean:=false;
begin
 begin
  update public.btcpay_test_supplier_credentials
  set credential_sha256=repeat('b',64)
  where scope_id='39000000-0000-0000-0000-000000000001';
 exception when sqlstate '55000' then denied:=true; end;
 if not denied then raise exception 'Credential fingerprint was silently overwritten'; end if;
 if (select count(*) from public.btcpay_test_supplier_credentials
     where status='active')<>2 then
    raise exception 'Fixture revocation rollback did not restore two keys';
 end if;
end $$;
select 'supplier_credentials_denials_verified';
