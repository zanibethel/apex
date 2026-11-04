-- PR #206: configurable 1..50 item padded envelope capacity per private store.
\set ON_ERROR_STOP on
do $check$
begin
 if (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 or has_function_privilege('anon',
  'public.save_private_store_usps_shipping_capacity(uuid,boolean,bigint,bigint,bigint,integer)','EXECUTE')
 or has_function_privilege('authenticated',
  'public.save_private_store_usps_shipping_settings(uuid,boolean,bigint,bigint,bigint)','EXECUTE')
 then raise exception 'Envelope capacity grants or product release gate invalid';end if;
 if (select envelope_max_items from public.apex_store_shipping_settings
  where store_id='62000000-0000-0000-0000-000000000001') is distinct from 4
 then raise exception 'Existing store capacity default was not preserved';end if;
end $check$;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000003';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"supplier"}}';
do $outsider$
declare denied boolean:=false;
begin
 begin
  perform public.save_private_store_usps_shipping_capacity(
   '62000000-0000-0000-0000-000000000001',true,1500,2580,20001,4);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unassigned supplier changed envelope capacity';end if;
end $outsider$;
rollback;

begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"supplier"}}';
do $owner$
declare
 s uuid:='62000000-0000-0000-0000-000000000001';
 r jsonb;
 denied boolean;
 qty int;
begin
 r:=public.save_private_store_usps_shipping_capacity(s,true,1500,2580,20001,4);
 if r->>'status'<>'saved' or r->>'envelope_max_items'<>'4'
  or r->>'flat_shipping_cents'<>'1500' or r->>'medium_flat_shipping_cents'<>'2580'
  or r->>'checkout_enabled'<>'false'
 then raise exception 'Supplier did not save USPS capacity';end if;
 r:=public.save_private_store_usps_shipping_capacity(s,true,1500,2580,20001,3);
 if r->>'envelope_max_items'<>'3' then raise exception 'Capacity edit did not persist';end if;
 denied:=false;
 begin perform public.save_private_store_usps_shipping_capacity(s,true,1500,2580,20001,0);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Capacity zero unexpectedly accepted';end if;
 denied:=false;
 begin perform public.save_private_store_usps_shipping_capacity(s,true,1500,2580,20001,51);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Oversized capacity unexpectedly accepted';end if;
 denied:=false;
 begin perform public.save_private_store_usps_shipping_settings(s,true,1500,2580,20001);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Legacy 5-arg editor bypassed capacity';end if;
end $owner$;
reset role;
do $audit$
begin
 if (select count(*) from public.apex_shipping_setting_events
  where store_id='62000000-0000-0000-0000-000000000001'
   and new_settings->>'envelope_max_items'='3')<>1
 then raise exception 'Envelope limit change lacks single audit event';end if;
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
 readback jsonb;
begin
 r:=public.save_private_store_usps_shipping_capacity(s,true,1500,2580,20001,5);
 readback:=public.get_admin_private_checkout_charge_source(s,p,1,'');
 if r->>'envelope_max_items'<>'5' or
   readback#>>'{shipping,envelope_max_items}'<>'5'
  or readback->>'can_pay'<>'false' or readback->>'can_create_order'<>'false'
 then raise exception 'Admin capacity update/readback failed';end if;
end $admin$;
rollback;

begin;
set local role anon;
do $anon$
declare denied boolean:=false; r jsonb;
begin
 begin
  perform public.save_private_store_usps_shipping_capacity(
   '62000000-0000-0000-0000-000000000001',true,1500,2580,20001,4);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous edited envelope capacity';end if;
 r:=public.get_public_cart_quote_source(
   '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":5}]'::jsonb,'');
 if r->>'state'<>'catalog_unavailable' or r->>'can_pay'<>'false'
 then raise exception 'Public catalog was released by capacity migration';end if;
end $anon$;
rollback;

do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Envelope capacity changes created orders or payments';end if;
end $post$;
select 'PASS: capacity settings, audit, RLS roles, and nonpayable public cart';
