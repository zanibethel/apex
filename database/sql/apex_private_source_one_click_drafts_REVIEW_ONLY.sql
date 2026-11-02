-- REVIEW ONLY: enable source-linked PRIVATE product drafts before source verification.
-- Product sourcing approval and public sale eligibility remain independent.
-- Run in disposable PostgreSQL CI first, then reviewed hosted migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $check$
begin
 if not exists(select 1 from apex_internal.private_release_gate where singleton=true and enabled=false)
 or to_regclass('public.supplier_candidate_drafts') is null
 or to_regclass('public.supplier_import_candidates') is null
 or not exists(select 1 from pg_policies where schemaname='public'
    and tablename='supplier_candidate_drafts'
    and policyname='supplier_candidate_draft_insert')
 then raise exception 'Private source-draft preflight failed'; end if;
end $check$;

-- A mapping records origin, NOT source approval or public listing entitlement.
-- Preserve owner/manager, same-store, private product, actor restrictions.
drop policy supplier_candidate_draft_insert on public.supplier_candidate_drafts;
create policy supplier_candidate_draft_insert on public.supplier_candidate_drafts
 for insert to authenticated with check (
  created_by=(select auth.uid())
  and exists (
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=store_id and s.is_public=false
    and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  )
  and exists (
   select 1 from public.supplier_import_candidates c
   where c.id=candidate_id and c.store_id=store_id
  )
  and exists (
   select 1 from public.products p where p.id=product_id
    and p.store_id=store_id and p.is_published=false
  )
 );

create or replace function public.create_private_draft_from_source(
 p_store_id uuid,p_candidate_id uuid,p_sku text,
 p_description text,p_expected_cost_cents bigint
) returns uuid language plpgsql security invoker set search_path='' as $fn$
declare
 v_source record;
 v_product_id uuid;
 v_title text;
 v_sale bigint;
 v_compare bigint;
begin
 if (select auth.uid()) is null or
    p_store_id is null or p_candidate_id is null or
    p_sku is null or p_sku !~ '^[A-Z0-9][A-Z0-9._-]{0,59}$' or
    p_description is null or length(p_description)>1500 or
    p_expected_cost_cents is null or p_expected_cost_cents<1
 then raise exception 'Invalid private source draft request' using errcode='22023';end if;

 if not exists(
  select 1 from public.stores s join public.supplier_memberships m
   on m.supplier_id=s.supplier_id
  where s.id=p_store_id and not s.is_public
    and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
 ) then raise exception 'Supplier access required' using errcode='42501';end if;

 select c.id,c.product_name,c.strength,c.wholesale_cost_cents
 into v_source from public.supplier_import_candidates c
 where c.id=p_candidate_id and c.store_id=p_store_id
 for update;
 if not found or v_source.wholesale_cost_cents<>p_expected_cost_cents
 then raise exception 'Source cost or identity changed; refresh before creating draft' using errcode='22023';end if;
 if exists(select 1 from public.supplier_candidate_drafts x
  where x.candidate_id=p_candidate_id)
 then raise exception 'Source already linked to a private draft' using errcode='23505';end if;
 v_title:=btrim(v_source.product_name)||' — '||btrim(v_source.strength);
 v_sale:=v_source.wholesale_cost_cents*2;
 v_compare:=(v_source.wholesale_cost_cents*5+1)/2;
 if length(v_title) not between 1 and 120 or
    v_compare>999999999 or v_sale>999999999 or v_sale<1
 then raise exception 'Source name or provisional pricing invalid' using errcode='22023';end if;
 -- Internal preparation only. Zero stock is REAL, not a visual placeholder.
 -- Compare-at value is a PROPOSAL, never evidence of a past discount.
 insert into public.products(
  store_id,sku,name,description,price_cents,compare_at_price_cents,
  internal_source_cost_cents,currency,is_published,is_active
 ) values(
  p_store_id,p_sku,v_title,p_description,v_sale,v_compare,
  v_source.wholesale_cost_cents,'USD',false,false
 ) returning id into v_product_id;
 insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
 values(p_store_id,v_product_id,0,0);
 insert into public.supplier_candidate_drafts(candidate_id,store_id,product_id,created_by)
 values(p_candidate_id,p_store_id,v_product_id,(select auth.uid()));
 return v_product_id;
end $fn$;
revoke all on function public.create_private_draft_from_source(uuid,uuid,text,text,bigint)
 from public,anon;
grant execute on function public.create_private_draft_from_source(uuid,uuid,text,text,bigint)
 to authenticated;
do $post$
begin
 if has_function_privilege('anon','public.create_private_draft_from_source(uuid,uuid,text,text,bigint)','EXECUTE')
 or not has_function_privilege('authenticated','public.create_private_draft_from_source(uuid,uuid,text,text,bigint)','EXECUTE')
 or not exists(select 1 from apex_internal.private_release_gate where singleton=true and enabled=false)
 then raise exception 'Private draft permissions or release gate invalid';end if;
end $post$;
commit;
