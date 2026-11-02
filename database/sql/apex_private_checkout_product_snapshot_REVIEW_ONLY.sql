-- REVIEW ONLY. NOT A DEPLOYED MIGRATION.
-- Admin-only private snapshot of existing price / inventory rows.
-- NEVER provides checkout admission, customer price quotation or stock reservation.
-- Test against isolated PostgreSQL before a separately approved hosted rollout.
begin;

create or replace function public.get_private_checkout_product_snapshot(
 p_store_id uuid,p_product_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog as $fn$
declare
 v_actor uuid := auth.uid();
 v_admin boolean := coalesce(auth.jwt() #>> '{app_metadata,apex_role}'='platform_admin',false);
 v_product record;
begin
 if v_actor is null or not v_admin then
  raise exception 'Platform administrator required' using errcode='42501';
 end if;
 if p_store_id is null or p_product_id is null then
  raise exception 'Store and product required' using errcode='22023';
 end if;

 -- One statement snapshot, store-scoped join, no lock and no mutation.
 -- A snapshot is OBSERVATIONAL; any future order MUST re-read and lock
 -- stock and price/approval state in its own authorized transaction.
 select p.id,p.store_id,p.name,p.sku,p.price_cents,p.currency,
        p.is_published,p.updated_at,p.category_id,
        s.is_public as store_is_public,
        c.is_published as category_is_published,
        i.quantity_on_hand,i.quantity_reserved,i.updated_at as inventory_updated_at
 into v_product
 from public.products p
 join public.stores s on s.id=p.store_id
 left join public.categories c on c.store_id=p.store_id and c.id=p.category_id
 left join public.inventory_items i
   on i.store_id=p.store_id and i.product_id=p.id
 where p.store_id=p_store_id and p.id=p_product_id;
 if not found then
  return jsonb_build_object('state','unavailable',
    'can_quote',false,'can_order',false,'can_pay',false);
 end if;

 return jsonb_build_object(
  'schema_version',1,
  'state','observed_private',
  'store_id',v_product.store_id,
  'product_id',v_product.id,
  'sku',v_product.sku,
  'name',v_product.name,
  'currency',v_product.currency,
  -- String, not JSON number: never silently round Postgres bigint in JS.
  'price_cents',v_product.price_cents::text,
  'price_observed_updated_at',v_product.updated_at,
  'is_published',v_product.is_published,
  'store_is_public',v_product.store_is_public,
  'category_is_published',v_product.category_is_published,
  'inventory_observed',v_product.quantity_on_hand is not null,
  'quantity_on_hand',v_product.quantity_on_hand,
  'quantity_reserved',v_product.quantity_reserved,
  'quantity_available',case when v_product.quantity_on_hand is not null
     and v_product.quantity_reserved is not null
    then greatest(v_product.quantity_on_hand-v_product.quantity_reserved,0)
    else null end,
  'inventory_observed_updated_at',v_product.inventory_updated_at,
  'observed_at',statement_timestamp(),
  'can_quote',false,'can_order',false,'can_pay',false
 );
end $fn$;

-- PostgreSQL's default function privilege includes PUBLIC, so revoke it.
revoke all on function public.get_private_checkout_product_snapshot(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.get_private_checkout_product_snapshot(uuid,uuid)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
   'public.get_private_checkout_product_snapshot(uuid,uuid)','EXECUTE')
 or not has_function_privilege('authenticated',
   'public.get_private_checkout_product_snapshot(uuid,uuid)','EXECUTE')
 or has_table_privilege('anon','public.inventory_items','SELECT')
 then
  raise exception 'Private checkout snapshot privilege postflight failed';
 end if;
end $postflight$;
commit;
