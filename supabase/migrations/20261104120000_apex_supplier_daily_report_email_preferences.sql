-- PR #211: opt-in daily supplier report mail preferences (verified account
-- address only). Internal outbox is never a public messaging API.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $preflight$
begin
 if to_regclass('public.stores') is null
  or to_regclass('public.supplier_memberships') is null
  or to_regclass('apex_internal.supplier_daily_order_reports') is null
  or to_regprocedure('public.get_supplier_daily_order_report(uuid,date)') is null
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Email reporting preflight denied';end if;
end $preflight$;

create table apex_internal.supplier_daily_report_email_subscriptions(
 store_id uuid not null references public.stores(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(store_id,user_id)
);
alter table apex_internal.supplier_daily_report_email_subscriptions enable row level security;
alter table apex_internal.supplier_daily_report_email_subscriptions force row level security;
revoke all on apex_internal.supplier_daily_report_email_subscriptions
 from public,anon,authenticated;

create table apex_internal.supplier_daily_report_email_outbox(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id) on delete restrict,
 report_date date not null,
 user_id uuid not null references auth.users(id) on delete restrict,
 state text not null default 'claimed'
  check (state in ('claimed','accepted')),
 lease_expires_at timestamptz,
 attempt_count integer not null default 0 check(attempt_count between 0 and 20),
 provider_email_id text
  check(provider_email_id is null or length(provider_email_id) between 8 and 128),
 updated_at timestamptz not null default now(),
 unique(store_id,report_date,user_id),
 check((state='accepted' and provider_email_id is not null)
  or (state='claimed' and provider_email_id is null))
);
alter table apex_internal.supplier_daily_report_email_outbox enable row level security;
alter table apex_internal.supplier_daily_report_email_outbox force row level security;
revoke all on apex_internal.supplier_daily_report_email_outbox
 from public,anon,authenticated;
comment on table apex_internal.supplier_daily_report_email_outbox is
 'Idempotent Resend accepted-message journal. Accepted means provider acknowledgement, not final mailbox delivery.';
create index apex_daily_report_email_subscription_enabled_idx
 on apex_internal.supplier_daily_report_email_subscriptions(store_id,user_id)
 where enabled=true;

create function public.get_supplier_daily_report_email_preference(p_store_id uuid)
 returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_uid uuid:=(select auth.uid());v_enabled boolean;v_verified boolean;
begin
 if v_uid is null or not exists(
  select 1 from public.stores s
  join public.supplier_memberships m on m.supplier_id=s.supplier_id
  where s.id=p_store_id and m.user_id=v_uid)
 then raise exception 'Verified supplier membership required' using errcode='42501';end if;
 select (u.email_confirmed_at is not null
  and length(btrim(coalesce(u.email,''))) between 3 and 254)
 into v_verified from auth.users u where u.id=v_uid;
 select enabled into v_enabled
 from apex_internal.supplier_daily_report_email_subscriptions
 where store_id=p_store_id and user_id=v_uid;
 return jsonb_build_object(
  'schema_version',1,'store_id',p_store_id,
  'enabled',coalesce(v_enabled,false),
  'recipient_verified',coalesce(v_verified,false),
  'recipient_source','verified_account_email',
  'schedule','before_08_00_America_Chicago',
  'report_type','previous_central_calendar_day');
end $fn$;
revoke all on function public.get_supplier_daily_report_email_preference(uuid)
 from public,anon,authenticated;
grant execute on function public.get_supplier_daily_report_email_preference(uuid)
 to authenticated;

create function public.set_supplier_daily_report_email_preference(
 p_store_id uuid,p_enabled boolean
) returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare v_uid uuid:=(select auth.uid());v_verified boolean;
begin
 if v_uid is null or p_enabled is null
  or not exists(
   select 1 from public.stores s
   join public.supplier_memberships m on m.supplier_id=s.supplier_id
   where s.id=p_store_id and m.user_id=v_uid)
 then raise exception 'Verified supplier membership required' using errcode='42501';end if;
 select (u.email_confirmed_at is not null
  and length(btrim(coalesce(u.email,''))) between 3 and 254)
 into v_verified from auth.users u where u.id=v_uid;
 if p_enabled and coalesce(v_verified,false) is distinct from true
 then raise exception 'A confirmed account email is required'
  using errcode='42501';end if;
 insert into apex_internal.supplier_daily_report_email_subscriptions(
  store_id,user_id,enabled,updated_at)
 values(p_store_id,v_uid,p_enabled,now())
 on conflict(store_id,user_id) do update
  set enabled=excluded.enabled,updated_at=now();
 return public.get_supplier_daily_report_email_preference(p_store_id);
end $fn$;
revoke all on function public.set_supplier_daily_report_email_preference(uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.set_supplier_daily_report_email_preference(uuid,boolean)
 to authenticated;

do $postflight$
begin
 if has_table_privilege('anon','apex_internal.supplier_daily_report_email_subscriptions','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_daily_report_email_subscriptions','UPDATE')
  or has_table_privilege('authenticated','apex_internal.supplier_daily_report_email_outbox','INSERT')
  or has_function_privilege('anon','public.get_supplier_daily_report_email_preference(uuid)','EXECUTE')
  or has_function_privilege('anon','public.set_supplier_daily_report_email_preference(uuid,boolean)','EXECUTE')
  or (select enabled from apex_internal.private_release_gate where singleton) is distinct from false
 then raise exception 'Supplier email preference postflight denied';end if;
end $postflight$;
commit;
