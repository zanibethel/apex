-- PR #188: disposable PostgreSQL ONLY. Held journal never performs HTTP.
\set ON_ERROR_STOP on
do $$
begin
 if to_regclass('apex_internal.checkout_order_intents') is null
  or to_regclass('apex_internal.btcpay_invoice_post_intents') is null
  or has_schema_privilege('anon','apex_internal','USAGE')
  or has_schema_privilege('authenticated','apex_internal','USAGE')
  or has_table_privilege('anon','apex_internal.checkout_order_intents','SELECT')
  or has_table_privilege('authenticated','apex_internal.checkout_order_intents','INSERT')
  or has_table_privilege('authenticated','apex_internal.btcpay_invoice_post_intents','INSERT')
  or has_function_privilege('anon',
       'public.get_admin_checkout_journal_overview()','EXECUTE')
 then raise exception 'Private checkout journal leaked to an untrusted role';end if;
end $$;

begin;
set local role anon;
do $$
declare denied boolean:=false;
begin
 begin perform public.get_admin_checkout_journal_overview();
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous journal summary was exposed';end if;
 denied:=false;
 begin
  insert into apex_internal.checkout_order_intents
  (store_id,idempotency_hash,cart_hash,total_cents,item_count)
  values('62000000-0000-0000-0000-000000000001',
    repeat('a',64),repeat('b',64),10000,1);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous journal insertion permitted';end if;
end $$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"user_metadata":{"apex_role":"platform_admin"},"app_metadata":{"apex_role":"supplier"}}';
do $$
declare denied boolean:=false;
begin
 begin perform public.get_admin_checkout_journal_overview();
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier impersonated checkout admin';end if;
 denied:=false;
 begin
  insert into apex_internal.btcpay_invoice_post_intents
   (order_id,store_id,provider_store_id,provider_order_ref,total_cents)
  values('65000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001',
    'provider_test','payment_test',10000);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Supplier inserted a provider intent';end if;
end $$;
rollback;

begin;
do $$
declare
 order_id uuid:='65000000-0000-0000-0000-000000000001';
 invoice_id uuid:='66000000-0000-0000-0000-000000000001';
 store uuid:='62000000-0000-0000-0000-000000000001';
 denied boolean;
begin
 insert into apex_internal.checkout_order_intents
  (id,store_id,idempotency_hash,cart_hash,total_cents,item_count)
 values(order_id,store,repeat('a',64),repeat('b',64),10000,1);
 denied:=false;
 begin
  insert into apex_internal.checkout_order_intents
   (store_id,idempotency_hash,cart_hash,total_cents,item_count)
  values(store,repeat('a',64),repeat('c',64),20000,1);
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Duplicate idempotent request accepted';end if;
 denied:=false;
 begin
  insert into apex_internal.checkout_order_intents
  (store_id,idempotency_hash,cart_hash,total_cents,item_count)
  values(store,repeat('x',64),repeat('b',64),10000,1);
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Invalid request fingerprint accepted';end if;
 denied:=false;
 begin
  insert into apex_internal.btcpay_invoice_post_intents
   (store_id,order_id,provider_store_id,provider_order_ref,total_cents)
  values(store,order_id,'provider_1','order_reference_1',9999);
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Provider amount mismatch accepted';end if;
 insert into apex_internal.btcpay_invoice_post_intents
 (id,store_id,order_id,provider_store_id,provider_order_ref,total_cents)
 values(invoice_id,store,order_id,'provider_1','order_reference_1',10000);
 denied:=false;
 begin
  insert into apex_internal.btcpay_invoice_post_intents
   (store_id,order_id,provider_store_id,provider_order_ref,total_cents)
  values(store,order_id,'provider_2','other_reference',10000);
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Duplicate provider POST for order accepted';end if;
 denied:=false;
 begin
  insert into apex_internal.btcpay_invoice_post_intents
   (store_id,order_id,provider_store_id,provider_order_ref,total_cents)
  values(store,order_id,'provider_1','order_reference_1',10000);
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Provider reference replay accepted';end if;
 denied:=false;
 begin
  update apex_internal.checkout_order_intents
   set total_cents=20000 where id=order_id;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Order journal could be rewritten';end if;
 denied:=false;
 begin
  delete from apex_internal.btcpay_invoice_post_intents
   where id=invoice_id;
 exception when sqlstate '55000' then denied:=true;end;
 if not denied then raise exception 'Invoice intent could be deleted';end if;
 if (select status from apex_internal.checkout_order_intents
      where id=order_id)<>'held_no_payment'
  or (select status from apex_internal.btcpay_invoice_post_intents
      where id=invoice_id)<>'held_no_post'
 then raise exception 'Held-only journal state bypassed';end if;
end $$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $$
declare response jsonb;
begin
 response:=public.get_admin_checkout_journal_overview();
 if response->>'status'<>'journal_foundation'
  or (response->>'held_order_records')::integer<>1
  or (response->>'held_provider_intents')::integer<>1
  or response->>'invoice_post_enabled'<>'false'
  or response->>'checkout_enabled'<>'false'
  or (select count(*) from jsonb_object_keys(response))<>5
 then raise exception 'Verified admin journal summary invalid';end if;
end $$;
rollback;

do $$
declare response jsonb;
begin
 if exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Fixture left journal records after rollback';end if;
 if (select enabled from apex_internal.private_release_gate where singleton=true)
   is distinct from false
 then raise exception 'Private journal enabled checkout release gate';end if;
 if jsonb_array_length(public.get_public_sold_out_catalog(0,24))<>0
 then raise exception 'Private journal published products';end if;
end $$;
select 'PASS: private held-order journal, immutable intents, duplicate denial, admin-only aggregate';
