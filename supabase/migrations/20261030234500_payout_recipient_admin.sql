-- Review-only recipient administration. Requires prior payout schema migration.
-- SECURITY INVOKER and RLS restrict mutations to trusted admin memberships.
begin;
create policy payout_recipients_admin_insert on public.payout_recipients
for insert to authenticated with check (
 exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 and (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin'
);
create policy payout_recipients_admin_update on public.payout_recipients
for update to authenticated
using (
 exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 and (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin'
)
with check (
 exists(select 1 from public.apex_admin_memberships a where a.user_id=(select auth.uid()))
 and (select auth.jwt()->'app_metadata'->>'apex_role')='platform_admin'
);
grant insert,update(display_name,recipient_type,status) on public.payout_recipients to authenticated;
commit;
