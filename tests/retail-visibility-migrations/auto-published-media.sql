-- Disposable retail_test only. Verify publication alone permits the saved
-- product-scoped image, while unpublish/hold/review/replacement take effect.
-- No public storage policy, payment, invoice or additional image approval.
begin;
alter table public.products add column if not exists image_path text;
update public.products set image_path=
 '10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000005/80000000-0000-4000-8000-000000000001.png'
 where id='50000000-0000-4000-8000-000000000005';
update public.products set image_path=
 '10000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000004/80000000-0000-4000-8000-000000000004.png'
 where id='50000000-0000-4000-8000-000000000004';

do $permissions$
begin
 if has_function_privilege('anon','public.apex_retail_showcase_image_source_v1(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.apex_retail_showcase_image_source_v1(uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.apex_retail_showcase_image_source_v1(uuid)','EXECUTE')
 then raise exception 'Private media path is readable by an end-user SQL role';end if;
end $permissions$;

set local role service_role;
do $media$
declare
 v_id uuid:='50000000-0000-4000-8000-000000000005';
 v_other uuid:='50000000-0000-4000-8000-000000000004';
 v_path text;
begin
 v_path:=(public.apex_retail_showcase_image_source_v1(v_id))->>'source_image_path';
 if v_path is distinct from
  '10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000005/80000000-0000-4000-8000-000000000001.png'
 then raise exception 'Supplier-published synthetic image was not found';end if;
 if public.apex_retail_showcase_image_source_v1(v_other) is not null
 then raise exception 'Unpublished cross-store image was exposed';end if;
end $media$;
reset role;

update public.supplier_listing_controls set admin_gate='hold'
 where product_id='50000000-0000-4000-8000-000000000005';
set local role service_role;
do $held$
begin
 if public.apex_retail_showcase_image_source_v1('50000000-0000-4000-8000-000000000005') is not null
 then raise exception 'Held listing image was exposed';end if;
end $held$;
reset role;
update public.supplier_listing_controls set admin_gate='clear'
 where product_id='50000000-0000-4000-8000-000000000005';

update public.products set image_path=
 '10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000005/80000000-0000-4000-8000-000000000002.webp'
 where id='50000000-0000-4000-8000-000000000005';
set local role service_role;
do $replaced$
begin
 if (public.apex_retail_showcase_image_source_v1('50000000-0000-4000-8000-000000000005')->>'source_image_path')
  not like '%/80000000-0000-4000-8000-000000000002.webp'
 then raise exception 'Image replacement did not update public media pointer';end if;
end $replaced$;
reset role;

update public.supplier_listing_controls set supplier_wants_listing=false
 where product_id='50000000-0000-4000-8000-000000000005';
set local role service_role;
do $unpublished$
begin
 if public.apex_retail_showcase_image_source_v1('50000000-0000-4000-8000-000000000005') is not null
 then raise exception 'Unpublished private image was exposed';end if;
end $unpublished$;
reset role;
update public.supplier_listing_controls set supplier_wants_listing=true
 where product_id='50000000-0000-4000-8000-000000000005';

insert into public.private_product_review_states(store_id,product_id,status) values(
 '10000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000005','pending_review');
set local role service_role;
do $review$
begin
 if public.apex_retail_showcase_image_source_v1('50000000-0000-4000-8000-000000000005') is not null
 then raise exception 'Held content review did not protect image';end if;
end $review$;
reset role;
delete from public.private_product_review_states
 where product_id='50000000-0000-4000-8000-000000000005';
update public.products set image_path=
 '10000000-0000-4000-8000-000000000009/50000000-0000-4000-8000-000000000005/80000000-0000-4000-8000-000000000002.webp'
 where id='50000000-0000-4000-8000-000000000005';
set local role service_role;
do $foreign$
begin
 if public.apex_retail_showcase_image_source_v1('50000000-0000-4000-8000-000000000005') is not null
 then raise exception 'Foreign store private image path was exposed';end if;
end $foreign$;
reset role;

update apex_internal.retail_showcase_gate set enabled=false where singleton=true;
set local role service_role;
do $gate$
begin
 if public.apex_retail_showcase_image_source_v1('50000000-0000-4000-8000-000000000005') is not null
 then raise exception 'Global showcase gate did not revoke image';end if;
end $gate$;
reset role;
rollback;
