-- REVIEW ONLY. Apply only after prior Apex migrations are reviewed and approved.
-- Atomic draft writes via explicitly authorized SECURITY DEFINER RPC.
-- Admin role comes from trusted app_metadata; membership grants are never self-service.
begin;
create or replace function public.save_payout_rule_draft(
 p_rule_id uuid,
 p_scope_type text,
 p_scope_id uuid,
 p_recipients jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 v_id uuid;
 v_total integer;
 v_count integer;
 v_version integer;
begin
 if auth.uid() is null or not exists (
   select 1 from public.apex_admin_memberships a where a.user_id=auth.uid()
 ) or coalesce(auth.jwt()->'app_metadata'->>'apex_role','') <> 'platform_admin' then
   raise exception 'Unauthorized';
 end if;
 if p_scope_type not in ('storefront','supplier','product') or p_scope_id is null then
   raise exception 'Invalid scope';
 end if;
 if not (
   (p_scope_type='storefront' and exists(select 1 from public.stores where id=p_scope_id))
   or (p_scope_type='supplier' and exists(select 1 from public.suppliers where id=p_scope_id))
   or (p_scope_type='product' and exists(select 1 from public.products where id=p_scope_id))
 ) then raise exception 'Scope does not exist'; end if;
 if jsonb_typeof(p_recipients) <> 'array' then raise exception 'Invalid allocations'; end if;
 v_count=jsonb_array_length(p_recipients);
 if v_count<1 or v_count>100 then raise exception 'Invalid recipient count'; end if;
 if exists(
  select 1 from jsonb_array_elements(p_recipients) r
  where jsonb_typeof(r) <> 'object'
    or jsonb_typeof(r->'recipient_id') <> 'string'
    or jsonb_typeof(r->'basis_points') <> 'number'
    or (r->>'basis_points') !~ '^[0-9]{1,5}$'
 ) then raise exception 'Invalid allocation format'; end if;
 select count(distinct recipient_id), sum(basis_points)
 into v_count,v_total from jsonb_to_recordset(p_recipients)
 as x(recipient_id uuid,basis_points integer);
 if v_count<>jsonb_array_length(p_recipients) or v_total<>10000 then
   raise exception 'Allocations must total 10000 bps with unique recipients';
 end if;
 if exists(
  select 1 from jsonb_to_recordset(p_recipients) as x(recipient_id uuid,basis_points integer)
  left join public.payout_recipients p on p.id=x.recipient_id
  where p.id is null or x.basis_points<0 or x.basis_points>10000
 ) then raise exception 'Invalid recipient'; end if;
 if p_rule_id is null then
  -- Serialize draft version allocation for the same scope.
  perform pg_advisory_xact_lock(hashtextextended(p_scope_type||':'||p_scope_id::text,0));
  select coalesce(max(version),0)+1 into v_version
    from public.payout_rules where scope_type=p_scope_type and scope_id=p_scope_id;
  insert into public.payout_rules(scope_type,scope_id,version,status,effective_from)
    values(p_scope_type,p_scope_id,v_version,'draft',now()) returning id into v_id;
 else
  select id into v_id from public.payout_rules
    where id=p_rule_id and scope_type=p_scope_type and scope_id=p_scope_id
      and status='draft' for update;
  if v_id is null then raise exception 'Only matching drafts may be edited'; end if;
  delete from public.payout_rule_allocations where rule_id=v_id;
 end if;
 insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
 select v_id,x.recipient_id,x.basis_points
 from jsonb_to_recordset(p_recipients) as x(recipient_id uuid,basis_points integer);
 return v_id;
end; $$;
-- No generic browser writes. SECURITY DEFINER is deliberately limited by
-- explicit auth.uid(), trusted app_metadata and membership checks above.
create policy payout_rules_admin_insert on public.payout_rules
 for insert to authenticated with check(
 status='draft' and exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 and (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');
create policy payout_rule_allocations_admin_insert on public.payout_rule_allocations
 for insert to authenticated with check(
 exists(select 1 from public.payout_rules r where r.id=rule_id and r.status='draft')
 and exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 and (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');
create policy payout_rule_allocations_admin_delete on public.payout_rule_allocations
 for delete to authenticated using(
 exists(select 1 from public.payout_rules r where r.id=rule_id and r.status='draft')
 and exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 and (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin');
revoke insert,update,delete on public.payout_rules from PUBLIC,anon,authenticated;
revoke insert,update,delete on public.payout_rule_allocations from PUBLIC,anon,authenticated;
revoke all on function public.save_payout_rule_draft(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.save_payout_rule_draft(uuid,text,uuid,jsonb) to authenticated;
commit;
