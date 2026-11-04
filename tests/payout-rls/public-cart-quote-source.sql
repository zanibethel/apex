-- PR #203: no public price/stock leak and no cart-to-order capability.
\set ON_ERROR_STOP on
do $pre$
declare r jsonb;
begin
 if has_table_privilege('anon','public.apex_store_shipping_settings','SELECT')
  or has_table_privilege('anon','public.supplier_discount_codes','SELECT')
  or not has_function_privilege('anon',
   'public.get_public_cart_quote_source(jsonb,text)','EXECUTE')
 then raise exception 'Public cart source permissions incorrect';end if;
 r:=public.get_public_cart_quote_source(
  '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,'');
 if r->>'state'<>'catalog_unavailable' or r->>'can_place_order'<>'false'
  or r->>'can_pay'<>'false' or jsonb_array_length(r->'items')<>0
 then raise exception 'Held catalog leaked product pricing';end if;
end $pre$;

begin;
set local role anon;
do $anon$
declare r jsonb;
begin
 r:=public.get_public_cart_quote_source(
  '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,'');
 if r->>'state'<>'catalog_unavailable' or r->>'can_place_order'<>'false'
 then raise exception 'Anonymous cart did not honor global gate';end if;
end $anon$;
rollback;

do $negative$
declare denied boolean:=false;
begin
 begin
  perform public.get_public_cart_quote_source('[]'::jsonb,'');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Empty cart permitted';end if;
 denied:=false;
 begin
  perform public.get_public_cart_quote_source(
  '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1},
    {"product_id":"64000000-0000-0000-0000-000000000001","quantity":2}]'::jsonb,'');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Duplicate IDs permitted';end if;
 denied:=false;
 begin
  perform public.get_public_cart_quote_source(
  '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":11}]'::jsonb,'');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Oversized quantities permitted';end if;
 denied:=false;
 begin
  perform public.get_public_cart_quote_source(
  '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,'bad code');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Untrusted code accepted';end if;
end $negative$;

do $post$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
  or exists(select 1 from apex_internal.checkout_order_intents)
  or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Cart source unexpectedly released public products or payments';end if;
end $post$;
select 'PASS: bounded public cart readback, invalid input, no checkout';
