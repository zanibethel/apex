-- REVIEW ONLY until separately approved for application to existing prelaunch Apex.
-- Allow authorized owners/managers to edit private draft SKU identifiers.
-- Does NOT allow store_id, product publication, staff writes or public commerce.
begin;
do $preflight$
begin
  if not (select relrowsecurity from pg_class where oid='public.products'::regclass)
     or not exists (
       select 1 from pg_policies where schemaname='public' and tablename='products'
        and policyname='supplier_draft_products_update'
        and cmd='UPDATE'
        and qual like '%is_published%'
        and qual like '%supplier_memberships%'
        and with_check like '%is_published%'
     )
     or not exists (
       select 1 from pg_constraint
       where conrelid='public.products'::regclass and contype='u'
         and pg_get_constraintdef(oid) like '%store_id, sku%'
     )
  then
    raise exception 'Apex SKU edit preflight failed: verify private draft RLS and store SKU uniqueness';
  end if;
  if has_column_privilege('authenticated','public.products','is_published','UPDATE')
    or has_column_privilege('authenticated','public.products','store_id','UPDATE')
  then
    raise exception 'Apex SKU edit preflight failed: protected columns unexpectedly writable';
  end if;
end $preflight$;

grant update (sku) on public.products to authenticated;
commit;
