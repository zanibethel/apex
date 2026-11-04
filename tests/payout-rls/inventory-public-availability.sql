-- PR #207: public inventory projection never bypasses independent release,
-- while the legacy SOLD OUT feed cannot mislabel positive on-hand stock.
\set ON_ERROR_STOP on

do $guard$
declare r jsonb;
begin
 if (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 or has_table_privilege('anon','public.products','SELECT')
 or has_table_privilege('anon','public.inventory_items','SELECT')
 or has_table_privilege('anon','apex_internal.product_release_authorizations','SELECT')
 or not has_function_privilege('anon','public.get_public_inventory_catalog(integer,integer)','EXECUTE')
 then raise exception 'Public catalog permissions / release gate invalid';end if;
 r:=public.get_public_inventory_catalog(0,24);
 if jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>0
 then raise exception 'Unreleased product metadata leaked';end if;
 r:=public.get_public_sold_out_catalog(0,24);
 if jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>0
 then raise exception 'Legacy sold-out feed leaked under gate';end if;
end $guard$;

begin;
set local role anon;
do $anon$
declare r jsonb;
begin
 r:=public.get_public_inventory_catalog(0,24);
 if jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>0
 then raise exception 'Anonymous user observed private catalog';end if;
end $anon$;
rollback;

do $bad$
declare denied boolean;
begin
 denied:=false;
 begin perform public.get_public_inventory_catalog(-1,24);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Negative pagination offset accepted';end if;
 denied:=false;
 begin perform public.get_public_inventory_catalog(0,25);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Too many product rows accepted';end if;
 denied:=false;
 begin perform public.get_public_inventory_catalog(10001,1);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Overwide pagination accepted';end if;
end $bad$;

do $no_sales$
begin
 if (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Public availability sync unexpectedly activated checkout';end if;
end $no_sales$;
select 'PASS: public inventory states, privileges, pagination and held checkout';
