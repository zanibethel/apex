\set ON_ERROR_STOP on
-- Only run on disposable postgres after review-only function installation.
-- The current structural gate intentionally returns NO items even if all
-- other authorization records are synthetically green.
do $check$
declare v jsonb;
begin
 v:=public.get_public_sold_out_catalog();
 if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>0 then
  raise exception 'Disabled global release gate leaked products';
 end if;
end $check$;

begin;
set local role anon;
do $check$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0 then
  raise exception 'Anonymous access leaked unreleased product';
 end if;
end $check$;
commit;

-- Test the positive path ONLY by removing the impossibility constraint in
-- this disposable fixture, never in a hosted environment.
alter table apex_internal.private_release_gate
 drop constraint private_release_gate_enabled_check;
update apex_internal.private_release_gate set enabled=true where singleton=true;

begin;
set local role anon;
do $check$
declare v jsonb; item jsonb;
begin
 v:=public.get_public_sold_out_catalog();
 if jsonb_array_length(v)<>1 then
  raise exception 'Synthetic, fully approved sold-out item not returned';
 end if;
 item:=v->0;
 if item->>'name'<>'Synthetic approved sample'
  or item->>'price_cents'<>'5000'
  or item->>'availability'<>'sold_out'
  or (item->>'can_checkout')::boolean is not false
  or item ? 'image_path' or item ? 'source_cost_cents'
  or item ? 'inventory' or item ? 'quantity_on_hand'
  or item ? 'supplier_id' or item ? 'wallet'
  or (select count(*) from jsonb_object_keys(item))<>7
 then raise exception 'Public result contained unsafe or incorrect data'; end if;
end $check$;
commit;

update public.supplier_listing_controls set admin_gate='hold';
do $check$ begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Admin hold was bypassed';end if;
end $check$;
update public.supplier_listing_controls set admin_gate='clear';

update apex_internal.product_release_authorizations set status='blocked';
do $check$ begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Product authorization bypassed';end if;
end $check$;
update apex_internal.product_release_authorizations set status='verified';

update apex_internal.supplier_release_authorizations set valid_until=current_date-1;
do $check$ begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Expired supplier authorization bypassed';end if;
end $check$;
update apex_internal.supplier_release_authorizations set valid_until=current_date+1;

update public.inventory_items set quantity_on_hand=2
 where store_id='62000000-0000-0000-0000-000000000001' and product_id='64000000-0000-0000-0000-000000000001';
do $check$ begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Product with nonzero inventory shown as sold out';end if;
end $check$;
update public.inventory_items set quantity_on_hand=0
 where store_id='62000000-0000-0000-0000-000000000001' and product_id='64000000-0000-0000-0000-000000000001';

update public.supplier_listing_controls set supplier_wants_listing=false;
do $check$ begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Supplier publication intent bypassed';end if;
end $check$;
update public.supplier_listing_controls set supplier_wants_listing=true;

update apex_internal.private_release_gate set enabled=false;
do $check$ begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Re-disabled release gate still shows products';end if;
end $check$;

select 'PASS: public gallery returns only authorized synthetic sold-out metadata';
