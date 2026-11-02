-- REVIEW ONLY. Private supplier correction resubmission. Requires separate
-- authorization, disposable PostgreSQL/RLS tests and hosted preflight before use.
-- This does NOT unlock a listing, enable the public release gate or affect checkout.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regprocedure('public.set_supplier_listing_intent(uuid,uuid,text)') is null
  or to_regclass('public.supplier_listing_controls') is null
  or to_regclass('public.supplier_listing_events') is null
  or not exists (
   select 1 from apex_internal.private_release_gate
   where singleton=true and enabled=false
  )
  or not exists (
   select 1 from pg_constraint
   where conrelid='public.supplier_listing_events'::regclass
   and conname='supplier_listing_events_action_check'
  )
 then raise exception 'Apex correction resubmission preflight failed'; end if;
end $preflight$;

alter table public.supplier_listing_events
 drop constraint supplier_listing_events_action_check;
alter table public.supplier_listing_events
 add constraint supplier_listing_events_action_check
 check(action in(
 'publish_requested','unpublish_requested','admin_unpublish',
 'admin_hold','admin_review_required','admin_republish_approved',
 'supplier_corrections_resubmitted'
 ));

-- The immutable event is the source of the correction request. Existing
-- store-scoped event RLS gives the assigned supplier and platform admin
-- read access without exposing other sellers or private product data.
create or replace function public.resubmit_supplier_listing_corrections(
 p_store_id uuid,p_product_id uuid,p_note text
) returns text language plpgsql security definer
 set search_path=pg_catalog as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_control public.supplier_listing_controls%rowtype;
 v_note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
 if v_actor is null or v_note is null
  or length(v_note)<5 or length(p_note)>500
  or not exists (
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and s.is_public=false
    and m.user_id=v_actor and m.role in ('owner','manager')
  )
 then raise exception 'Authorized supplier and a correction note are required'; end if;

 if not exists (
  select 1 from public.products p where p.store_id=p_store_id
   and p.id=p_product_id and p.is_published=false
 ) then raise exception 'Private product unavailable'; end if;

 select * into v_control from public.supplier_listing_controls
 where store_id=p_store_id and product_id=p_product_id for update;
 if not found or (v_control.admin_gate='clear'
  and not v_control.republish_approval_required)
 then raise exception 'No admin hold or review request to resubmit'; end if;

 if exists (
  select 1 from public.supplier_listing_events
  where store_id=p_store_id and product_id=p_product_id
   and action='supplier_corrections_resubmitted'
   and created_at>now()-interval '1 minute'
 ) then raise exception 'A correction request was just sent. Please avoid duplicates'; end if;

 -- Move the existing private queue row to the top but preserve the reason,
 -- hold, required approval, and independent public eligibility restrictions.
 update public.supplier_listing_controls set
  supplier_wants_listing=false,changed_by=v_actor,changed_at=now()
 where store_id=p_store_id and product_id=p_product_id;

 insert into public.supplier_listing_events(
  store_id,product_id,action,actor_id,reason
 ) values(
  p_store_id,p_product_id,'supplier_corrections_resubmitted',v_actor,v_note
 );
 return 'Corrections submitted to administrator; listing remains locked and private';
end $fn$;
revoke all on function public.resubmit_supplier_listing_corrections(uuid,uuid,text)
 from public,anon;
grant execute on function public.resubmit_supplier_listing_corrections(uuid,uuid,text)
 to authenticated;

do $postflight$
begin
 if has_function_privilege('anon',
  'public.resubmit_supplier_listing_corrections(uuid,uuid,text)','EXECUTE')
 or not has_function_privilege('authenticated',
  'public.resubmit_supplier_listing_corrections(uuid,uuid,text)','EXECUTE')
 or not exists (
  select 1 from apex_internal.private_release_gate
  where singleton=true and enabled=false
 )
 then raise exception 'Apex corrections permission or release-gate postflight failed'; end if;
end $postflight$;
commit;
