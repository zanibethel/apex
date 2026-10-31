-- APPLIED to existing Apex Supabase project fhqpkpztercadcxspdkg on 2026-10-31.
-- Hosted migration version 20261031174113 (enable_private_draft_sku_edit).
-- DO NOT reapply to the same database. Captures exactly the guarded hosted migration.
-- Only SKU column permission; products remain draft-only and supplier-scoped.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
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

do $verify$
begin
 if not has_column_privilege('authenticated','public.products','sku','UPDATE')
  or has_column_privilege('authenticated','public.products','store_id','UPDATE')
  or has_column_privilege('authenticated','public.products','is_published','UPDATE')
  or not (select relrowsecurity from pg_class where oid='public.products'::regclass)
  or (select count(*) from pg_policies
     where schemaname='public' and tablename='products' and cmd='UPDATE'
      and policyname='supplier_draft_products_update'
      and qual like '%is_published%'
      and qual like '%supplier_memberships%'
      and with_check like '%is_published%'
      and with_check like '%supplier_memberships%') <> 1
 then raise exception 'Apex SKU edit post-verification failed'; end if;
end $verify$;
commit;