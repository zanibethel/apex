-- PR #211: verified platform administrator must explicitly activate
-- the daily sender. The worker token is hashed server-side in Next.js,
-- and only the SHA-256 fingerprint is stored in the private database.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $preflight$
begin
 if to_regclass('apex_internal.supplier_report_mail_worker_tokens') is null
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Admin report sender preflight denied';end if;
end $preflight$;

create table apex_internal.supplier_report_mail_activation_audit(
 id bigint generated always as identity primary key,
 activated_by uuid not null references auth.users(id) on delete restrict,
 token_fingerprint_sha256 text not null
  check(token_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
 activated_at timestamptz not null default now()
);
alter table apex_internal.supplier_report_mail_activation_audit enable row level security;
alter table apex_internal.supplier_report_mail_activation_audit force row level security;
revoke all on apex_internal.supplier_report_mail_activation_audit
 from public,anon,authenticated;

create function public.get_admin_daily_mail_sender_readiness(p_expected_sha256 text)
 returns jsonb language plpgsql stable security definer
 set search_path=pg_catalog as $fn$
declare v_uid uuid:=(select auth.uid());
begin
 if v_uid is null
  or (select auth.jwt()) #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists(select 1 from auth.users u
   where u.id=v_uid and u.email_confirmed_at is not null)
 then raise exception 'Verified platform admin required' using errcode='42501';end if;
 return jsonb_build_object(
  'schema_version',1,
  'sender_activated',exists(
    select 1 from apex_internal.supplier_report_mail_worker_tokens
    where name='daily_report_sender' and token_sha256=p_expected_sha256),
  'recipient_mode','verified_supplier_member_opt_in',
  'purchasing_enabled',false);
end $fn$;
revoke all on function public.get_admin_daily_mail_sender_readiness(text)
 from public,anon,authenticated;
grant execute on function public.get_admin_daily_mail_sender_readiness(text)
 to authenticated;

create function public.admin_activate_daily_report_mail_sender(p_token_sha256 text)
 returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog as $fn$
declare v_uid uuid:=(select auth.uid());
begin
 if v_uid is null
  or (select auth.jwt()) #>> '{app_metadata,apex_role}' is distinct from 'platform_admin'
  or coalesce((select auth.jwt())->>'is_anonymous','false')='true'
  or not exists(select 1 from auth.users u
   where u.id=v_uid and u.email_confirmed_at is not null)
 then raise exception 'Verified platform admin required' using errcode='42501';end if;
 if p_token_sha256 is null
  or p_token_sha256 !~ '^[0-9a-f]{64}$'
 then raise exception 'Invalid SHA-256 fingerprint' using errcode='22023';end if;
 insert into apex_internal.supplier_report_mail_worker_tokens(
  name,token_sha256)
 values('daily_report_sender',p_token_sha256)
 on conflict(name) do update
  set token_sha256=excluded.token_sha256,created_at=now();
 insert into apex_internal.supplier_report_mail_activation_audit(
  activated_by,token_fingerprint_sha256)
 values(v_uid,p_token_sha256);
 return jsonb_build_object('schema_version',1,'sender_activated',true,
  'recipient_mode','verified_supplier_member_opt_in',
  'purchasing_enabled',false);
end $fn$;
revoke all on function public.admin_activate_daily_report_mail_sender(text)
 from public,anon,authenticated;
grant execute on function public.admin_activate_daily_report_mail_sender(text)
 to authenticated;

do $postflight$
begin
 if has_table_privilege('anon',
  'apex_internal.supplier_report_mail_activation_audit','SELECT')
  or has_table_privilege('authenticated',
  'apex_internal.supplier_report_mail_worker_tokens','UPDATE')
  or has_function_privilege('anon',
   'public.admin_activate_daily_report_mail_sender(text)','EXECUTE')
  or (select enabled from apex_internal.private_release_gate where singleton)
     is distinct from false
 then raise exception 'Admin sender activation postflight denied';end if;
end $postflight$;
commit;