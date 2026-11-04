-- USPS Small/Medium price schedule and explicit free-shipping threshold.
\set ON_ERROR_STOP on
do $pre$
begin
 if has_function_privilege('anon',
  'public.save_private_store_usps_shipping_settings(uuid,boolean,bigint,bigint,bigint)','EXECUTE')
 or has_function_privilege('authenticated',
  'public.save_private_store_shipping_settings(uuid,boolean,bigint,bigint)','EXECUTE')
 or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'USPS settings permissions or release gate unsafe';end if;
end $pre$;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000003';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"supplier"}}';
do $stranger$
declare denied boolean:=false;
begin
 begin
  perform public.save_private_store_usps_shipping_settings(
   '62000000-0000-0000-0000-000000000001',true,1465,2580,20001);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unassigned supplier changed USPS rates';end if;
end $stranger$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"supplier"}}';
do $owner$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 r jsonb;
 denied boolean:=false;
begin
 r:=public.save_private_store_usps_shipping_settings(s,true,1465,2580,20001);
 if r->>'status'<>'saved'
  or r->>'flat_shipping_cents'<>'1465'
  or r->>'medium_flat_shipping_cents'<>'2580'
  or r->>'free_shipping_min_subtotal_cents'<>'20001'
  or r->>'checkout_enabled'<>'false'
 then raise exception 'USPS Small/Medium save failed';end if;
 r:=public.save_private_store_usps_shipping_settings(s,true,1465,2580,20001);
 begin
  perform public.save_private_store_usps_shipping_settings(s,true,1465,1400,20001);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Medium below Small accepted';end if;
 denied:=false;
 begin
  perform public.save_private_store_usps_shipping_settings(s,true,1465,2580,null);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Paid shipping without threshold accepted';end if;
 denied:=false;
 begin
  perform public.save_private_store_usps_shipping_settings(s,false,1465,0,null);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Disabled shipping with nonzero charge accepted';end if;
end $owner$;
-- Audit rows are intentionally unreadable to suppliers. Inspect them only
-- as the disposable test runner's privileged role in the same transaction.
reset role;
do $audit$
begin
 if (select count(*) from public.apex_shipping_setting_events
     where store_id='62000000-0000-0000-0000-000000000001'
      and new_settings->>'medium_flat_shipping_cents'='2580')<>1
 then raise exception 'USPS audit missing or replay created duplicate event';end if;
end $audit$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000002';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
do $admin$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 p uuid:='64000000-0000-0000-0000-000000000001';
 r jsonb;
 q jsonb;
 denied boolean:=false;
begin
 r:=public.save_private_store_usps_shipping_settings(s,true,1465,2580,20001);
 q:=public.get_admin_private_checkout_charge_source(s,p,2,'');
 if q->>'schema_version'<>'2'
  or q#>>'{shipping,flat_shipping_cents}'<>'1465'
  or q#>>'{shipping,medium_flat_shipping_cents}'<>'2580'
  or q#>>'{shipping,free_shipping_min_subtotal_cents}'<>'20001'
  or q->>'can_create_order'<>'false'
  or q->>'can_create_invoice'<>'false'
  or q->>'can_pay'<>'false'
  or q ? 'tax_cents'
 then raise exception 'Admin shipping readback mismatched or checkout activated';end if;
 begin
  perform public.save_private_store_shipping_settings(s,true,795,10000);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Legacy shipping RPC could bypass two-box policy';end if;
end $admin$;
rollback;

begin;
set local role anon;
do $anon$
declare denied boolean:=false;
begin
 begin
  perform public.save_private_store_usps_shipping_settings(
   '62000000-0000-0000-0000-000000000001',true,1465,2580,20001);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous USPS edit accepted';end if;
end $anon$;
rollback;

do $post$
begin
 if exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
  or (select enabled from apex_internal.private_release_gate where singleton)
   is distinct from false
 then raise exception 'USPS configuration unexpectedly created orders/payments';end if;
end $post$;
select 'PASS: USPS box fees, admin and supplier access, no orders/payments';
