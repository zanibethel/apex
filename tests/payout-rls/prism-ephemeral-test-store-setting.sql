-- CI-only: writes synthetic PrismSettings to a disposable upstream BTCPay
-- PostgreSQL instance, never to hosted Apex Supabase.
-- Called with psql -v store_id=... -v settings_json=... after validation.
begin;
do $$
begin
  if current_database() <> 'btcpayserver' then
    raise exception 'STOP: Prism fixture must use disposable BTCPay database';
  end if;
  if inet_server_port() <> 39372 then
    -- Inside Postgres listening port is 5432 even when host maps 39372.
    -- Host-level port and disposable runner are validated by caller.
    if inet_server_port() <> 5432 then
      raise exception 'STOP: unexpected Postgres server port';
    end if;
  end if;
end $$;
insert into "StoreSettings" ("StoreId","Name","Value")
values (:'store_id','PrismSettings',:'settings_json'::jsonb)
on conflict ("StoreId","Name")
do update set "Value"=excluded."Value";
commit;
select 'seeded';
