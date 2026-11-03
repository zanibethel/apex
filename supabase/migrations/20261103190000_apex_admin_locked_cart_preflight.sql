-- PR #190. Locked, read-only, verified-admin checkout preflight.
-- Holds SQL row locks only UNTIL THIS RPC RETURNS, never reserves stock,
-- authorizes a quote/order, publishes products or calls any BTC provider.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regprocedure('public.get_admin_private_cart_validation(uuid,jsonb)') is null
   or to_regclass('apex_internal.checkout_order_intents') is null
   or to_regclass('apex_internal.btcpay_invoice_post_intents') is null
   or not exists(select 1 from apex_internal.private_release_gate
       where singleton=true and enabled=false)
 then raise exception 'Locked preflight prerequisite missing';end if;
end $preflight$;

create function public.get_admin_locked_cart_preflight(
 p_store_id uuid,p_items jsonb,p_expected_subtotal_cents bigint
) returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_initial jsonb;
 v_final jsonb;
 v_id uuid;
 v_locked_product uuid;
 v_verified_store uuid;
 v_locked_gate boolean;
 v_subtotal bigint;
begin
 if v_actor is null or (select auth.jwt())
    #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
 then raise exception 'Verified platform admin required' using errcode='42501';end if;
 if p_expected_subtotal_cents is null or
    p_expected_subtotal_cents not between 0 and 999999999
 then raise exception 'Invalid displayed subtotal' using errcode='22023';end if;

 -- Run the existing bounded product, quantity, tenant, and release checks
 -- before casting any untrusted product identifier to UUID.
 v_initial:=public.get_admin_private_cart_validation(p_store_id,p_items);
 if v_initial->>'state'<>'private_cart_observation' or
    v_initial->>'can_create_order'<>'false' or
    v_initial->>'can_pay'<>'false'
 then raise exception 'Private cart validation unavailable'
    using errcode='42501';end if;

 -- Lock the global gate/store, then product/stock rows in one consistent UUID
 -- order. NOWAIT fails closed if an editor is concurrently changing a row.
 -- No lock persists beyond the RPC's database transaction.
 select enabled into v_locked_gate
 from apex_internal.private_release_gate
 where singleton=true and enabled=false for share nowait;
 if not found or v_locked_gate is distinct from false
 then raise exception 'Private release gate unavailable'
   using errcode='42501';end if;
 select id into v_verified_store from public.stores
 where id=p_store_id and is_public=false for share nowait;
 if not found then raise exception 'Private store unavailable'
   using errcode='42501';end if;

 for v_id in
  select (item.value->>'product_id')::uuid
   from jsonb_array_elements(p_items) as item(value)
   order by (item.value->>'product_id')::uuid
 loop
  select p.id into v_locked_product from public.products p
   where p.store_id=p_store_id and p.id=v_id for share nowait;
  if not found then raise exception 'Product outside private store'
    using errcode='42501';end if;
  perform 1 from public.inventory_items i
   where i.store_id=p_store_id and i.product_id=v_id
   for share nowait;
  -- Missing stock row is a blocked observation, not an implicit reservation.
 end loop;

 -- Recompute AFTER locking. The browser's subtotal is used only for stale
 -- display detection; it is never authoritative for funds or inventory.
 v_final:=public.get_admin_private_cart_validation(p_store_id,p_items);
 if v_final->>'state'<>'private_cart_observation' or
    v_final->>'can_create_order'<>'false' or
    v_final->>'can_pay'<>'false'
 then raise exception 'Final private validation unavailable'
   using errcode='42501';end if;
 v_subtotal:=(v_final->>'observed_subtotal_cents')::bigint;

 return v_final||jsonb_build_object(
  'schema_version',2,
  'state','locked_private_preflight',
  'expected_subtotal_cents',p_expected_subtotal_cents::text,
  'subtotal_matches_display',v_subtotal=p_expected_subtotal_cents,
  'lock_mode','for_share_nowait',
  'locks_persist_after_response',false,
  'admission','blocked',
  'can_quote',false,
  'can_reserve_stock',false,
  'can_create_order',false,
  'can_create_invoice',false,
  'can_pay',false
 );
end $fn$;

revoke all on function public.get_admin_locked_cart_preflight(uuid,jsonb,bigint)
 from public,anon,authenticated;
grant execute on function public.get_admin_locked_cart_preflight(uuid,jsonb,bigint)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
   'public.get_admin_locked_cart_preflight(uuid,jsonb,bigint)','EXECUTE')
  or has_table_privilege('authenticated',
   'apex_internal.checkout_order_intents','INSERT')
  or has_table_privilege('authenticated',
   'apex_internal.btcpay_invoice_post_intents','INSERT')
  or (select enabled from apex_internal.private_release_gate
       where singleton=true) is distinct from false
 then raise exception 'Locked preflight privilege violation';end if;
end $postflight$;
commit;
