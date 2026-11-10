-- Integration verification of ordered migrations on disposable PostgreSQL only.
-- Tests public listing, admin-only per-product restriction controls, tenant
-- denials, and unchanged content/checkout safeguards.
grant execute on function public.get_public_retail_showcase_catalog(integer,integer)
 to anon,authenticated;
grant execute on function public.set_supplier_listing_intent(uuid,uuid,text)
 to authenticated;
-- Authenticated caller A can publish an ordinary shirt even when the category
-- name previously matched an automatic blacklist. No inventory row is needed.
set role authenticated;
select set_config('test.actor','40000000-0000-4000-8000-000000000001',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"supplier"}}',false);
do $$
declare v_result text;v_feed jsonb;
begin
 v_result:=public.set_supplier_listing_intent(
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','publish');
 if v_result not like 'Live retail display enabled%' then
  raise exception 'Ordinary category-name match did not become eligible: %',v_result;end if;
 v_feed:=public.get_public_retail_showcase_catalog(0,24);
 if not exists(select 1 from jsonb_array_elements(v_feed) p where
   p->>'id'='50000000-0000-4000-8000-000000000001' and
   p->>'availability'='sold_out' and p->>'can_checkout'='false')
 then raise exception 'Expected public checkout-disabled Sold Out shirt';end if;
 if exists(select 1 from jsonb_array_elements(v_feed) p where
    p->>'id'='50000000-0000-4000-8000-000000000003')
 then raise exception 'Unrequested regulated product leaked publicly';end if;
end $$;
-- Product-level regulatory content remains denied even without a category.
do $$
begin
 begin
  perform public.set_supplier_listing_intent(
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003','publish');
  raise exception 'Expected regulated product content denial';
 exception when others then
  if SQLERRM='Expected regulated product content denial' then raise;end if;
 end;
end $$;
-- No cross-tenant supplier publishing, even if the caller guesses IDs.
do $$
begin
 begin
  perform public.set_supplier_listing_intent(
  '10000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000004','publish');
  raise exception 'Expected cross-store denial';
 exception when others then
  if SQLERRM='Expected cross-store denial' then raise;end if;
 end;
end $$;
-- Supplier cannot call either admin RPC.
do $$
begin
 begin
  perform public.get_admin_retail_product_restrictions();
  raise exception 'Expected admin read denial';
 exception when others then
  if SQLERRM='Expected admin read denial' then raise;end if;
 end;
 begin
  perform public.set_admin_retail_product_restriction(
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',true,'Unauthorized block');
  raise exception 'Expected admin write denial';
 exception when others then
  if SQLERRM='Expected admin write denial' then raise;end if;
 end;
end $$;

-- Admin restriction is authoritative regardless of supplier Publish preference.
select set_config('test.actor','60000000-0000-4000-8000-000000000001',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"platform_admin"}}',false);
do $$
declare v_rows jsonb;v_feed jsonb;
begin
 perform public.set_admin_retail_product_restriction(
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',true,
  'Admin blocked retail product display for verification');
 v_rows:=public.get_admin_retail_product_restrictions();
 if not exists(select 1 from jsonb_array_elements(v_rows) p where
   p->>'product_id'='50000000-0000-4000-8000-000000000001' and
   p->>'product_name'='Cotton Workout Shirt')
 then raise exception 'Admin restriction readback absent';end if;
 v_feed:=public.get_public_retail_showcase_catalog(0,24);
 if exists(select 1 from jsonb_array_elements(v_feed) p where
   p->>'id'='50000000-0000-4000-8000-000000000001')
 then raise exception 'Blocked product remained public';end if;
end $$;
-- Supplier cannot re-publish while blocked.
select set_config('test.actor','40000000-0000-4000-8000-000000000001',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"supplier"}}',false);
do $$
begin
 begin
  perform public.set_supplier_listing_intent(
   '10000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001','publish');
  raise exception 'Expected blocked product re-publish denial';
 exception when others then
  if SQLERRM='Expected blocked product re-publish denial' then raise;end if;
 end;
end $$;
-- Admin removal preserves supplier publication intent and audit trail.
select set_config('test.actor','60000000-0000-4000-8000-000000000001',false);
select set_config('test.jwt','{"app_metadata":{"apex_role":"platform_admin"}}',false);
do $$
declare v_feed jsonb;
begin
 perform public.set_admin_retail_product_restriction(
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',false,
  'Release product display restriction');
 v_feed:=public.get_public_retail_showcase_catalog(0,24);
 if not exists(select 1 from jsonb_array_elements(v_feed) p where
   p->>'id'='50000000-0000-4000-8000-000000000001')
 then raise exception 'Unrestricted eligible supplier-published product not restored';end if;
end $$;
reset role;
-- Audit and physical RLS verification is intentionally performed by the
-- fixture superuser. No public/admin application role can directly read
-- the private audit tables.
do $
begin
 if (select count(*) from apex_internal.retail_product_visibility_restriction_events
    where product_id='50000000-0000-4000-8000-000000000001')<>2
 then raise exception 'Expected block and unblock audit events';end if;
 if (select is_restricted from apex_internal.retail_product_visibility_restrictions
    where product_id='50000000-0000-4000-8000-000000000001') is distinct from false
 then raise exception 'Admin restriction remained active';end if;
 if not (select relrowsecurity from pg_class
    where oid='apex_internal.retail_product_visibility_restrictions'::regclass)
 then raise exception 'Private restriction table RLS not enabled';end if;
end $;
-- The public may read only the sanitized eligible catalog, not private tables.
set role anon;
select set_config('test.actor','',false);
select set_config('test.jwt','{}',false);
do $$
declare v_feed jsonb;
begin
 v_feed:=public.get_public_retail_showcase_catalog(0,24);
 if jsonb_array_length(v_feed)<>1
 then raise exception 'Expected exactly one eligible retail product; got %',v_feed;end if;
 if v_feed->0->>'can_checkout'<>'false'
 then raise exception 'Checkout flag changed';end if;
end $$;
reset role;
