-- Private source-cost edits. Only existing store owners/managers may edit;
-- all changes are audited, and no price is published or copied to retail.
begin;
alter table public.supplier_import_candidates
  add constraint supplier_source_cost_range check (wholesale_cost_cents between 0 and 999999999);
grant update (wholesale_cost_cents) on public.supplier_import_candidates to authenticated;

create table public.supplier_source_cost_audit (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.supplier_import_candidates(id),
  store_id uuid not null references public.stores(id),
  actor_id uuid,
  old_cost_cents bigint not null,
  new_cost_cents bigint not null,
  changed_at timestamptz not null default now()
);
alter table public.supplier_source_cost_audit enable row level security;
revoke all on public.supplier_source_cost_audit from anon, authenticated;
grant select on public.supplier_source_cost_audit to authenticated;
create policy "supplier_cost_audit_member_read" on public.supplier_source_cost_audit
for select to authenticated using (
  exists (
    select 1 from public.stores s
      join public.supplier_memberships m on m.supplier_id=s.supplier_id
    where s.id=supplier_source_cost_audit.store_id
      and m.user_id=(select auth.uid()) and m.role in ('owner','manager')
  )
);

create function apex_internal.audit_source_cost()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $fn$
begin
 if new.wholesale_cost_cents is distinct from old.wholesale_cost_cents then
   insert into public.supplier_source_cost_audit
      (candidate_id,store_id,actor_id,old_cost_cents,new_cost_cents)
   values (new.id,new.store_id,auth.uid(),old.wholesale_cost_cents,new.wholesale_cost_cents);
 end if;
 return new;
end
$fn$;
revoke all on function apex_internal.audit_source_cost() from public, anon, authenticated;
create trigger apex_source_cost_audit
after update of wholesale_cost_cents on public.supplier_import_candidates
for each row execute function apex_internal.audit_source_cost();

-- Reuse the proven SECURITY INVOKER promotion and atomically set compare-at pricing.
-- The function call and product update are one SQL transaction.
create function public.create_draft_from_candidate_with_compare(
  p_store_id uuid,
  p_candidate_id uuid,
  p_sku text,
  p_retail_price_cents bigint,
  p_quantity_on_hand integer,
  p_description text,
  p_compare_at_price_cents bigint default null
) returns uuid
language plpgsql volatile security invoker set search_path=''
as $fn$
declare v_product_id uuid;
begin
  if p_compare_at_price_cents is not null and
     (p_compare_at_price_cents <= p_retail_price_cents or
      p_compare_at_price_cents > 999999999) then
     raise exception 'Compare-at price must exceed purchase price' using errcode='22023';
  end if;
  v_product_id:=public.create_draft_from_supplier_candidate(
    p_store_id,p_candidate_id,p_sku,p_retail_price_cents,
    p_quantity_on_hand,p_description,null
  );
  if p_compare_at_price_cents is not null then
    update public.products set compare_at_price_cents=p_compare_at_price_cents
    where id=v_product_id and store_id=p_store_id and is_published=false;
    if not found then
      raise exception 'Could not assign compare-at price' using errcode='42501';
    end if;
  end if;
  return v_product_id;
end $fn$;
revoke all on function public.create_draft_from_candidate_with_compare(uuid,uuid,text,bigint,integer,text,bigint)
  from public, anon, authenticated;
grant execute on function public.create_draft_from_candidate_with_compare(uuid,uuid,text,bigint,integer,text,bigint)
  to authenticated;

commit;
