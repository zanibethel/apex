-- PR #123. Disposable PostgreSQL only. Run after #122 recovery audit tests.
-- Two different trusted administrators may sign a SYNTHETIC release preview.
-- PR #120 invoice INSERT trigger stays untouched: live or test checkout does
-- NOT resume, even after simulation shows eligibility.
\set ON_ERROR_STOP on

insert into public.stores(id,supplier_id,slug,display_name,is_public)
 select x.scope,s.id,x.slug,x.label,false
 from public.suppliers s
 cross join (values
  ('36000000-0000-0000-0000-000000000001'::uuid,
   'dual-release-happy','Dual control happy fixture'),
  ('36000000-0000-0000-0000-000000000002'::uuid,
   'dual-release-stale','Dual control stale fixture')
 ) x(scope,slug,label)
 where s.slug='test-supplier';

insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
values
 ('26000000-0000-0000-0000-000000000001','storefront',
  '36000000-0000-0000-0000-000000000001',1,'draft',now()),
 ('26000000-0000-0000-0000-000000000002','storefront',
  '36000000-0000-0000-0000-000000000002',1,'draft',now());
insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
 select r.id,p.recipient_id,p.bps
 from public.payout_rules r cross join (values
  ('10000000-0000-0000-0000-000000000001'::uuid,9000),
  ('10000000-0000-0000-0000-000000000002'::uuid,1000)
 ) p(recipient_id,bps)
 where r.id in ('26000000-0000-0000-0000-000000000001',
                '26000000-0000-0000-0000-000000000002');

-- Fixture's existing trusted platform admin reviews both stores.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
  '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if public.review_btcpay_test_split_activation(
   '26000000-0000-0000-0000-000000000001')
    <> 'approved_pending_manual_sync' or
    public.review_btcpay_test_split_activation(
   '26000000-0000-0000-0000-000000000002')
    <> 'approved_pending_manual_sync' then
   raise exception 'Synthetic draft review missing';
 end if;
end $$;
commit;
select apex_test_internal.hold_btcpay_test_split_sync(
 '26000000-0000-0000-0000-000000000001');
select apex_test_internal.hold_btcpay_test_split_sync(
 '26000000-0000-0000-0000-000000000002');

-- The provider-readback and proof hashes here are untrusted placeholders,
-- not attestation from the actual BTCPay regtest CI instance.
do $$
declare
 v_scope uuid;
 v_rule uuid;
 v_label text;
begin
 for v_scope,v_rule,v_label in
   select scope,rule_id,label
   from (values
    ('36000000-0000-0000-0000-000000000001'::uuid,
     '26000000-0000-0000-0000-000000000001'::uuid,'s1'),
    ('36000000-0000-0000-0000-000000000002'::uuid,
     '26000000-0000-0000-0000-000000000002'::uuid,'s2')
   ) as fixture(scope,rule_id,label)
 loop
   perform apex_test_internal.record_btcpay_test_recovery_event(
    v_scope,v_rule,v_label||'_success_000000',
    'external_change_reported_success',repeat('a',64));
   perform apex_test_internal.record_btcpay_test_recovery_event(
    v_scope,v_rule,v_label||'_readback_00000',
    'provider_readback_verified',repeat('b',64));
   perform apex_test_internal.record_btcpay_test_recovery_event(
    v_scope,v_rule,v_label||'_wallet_0000000',
    'wallet_reconciliation_verified',repeat('c',64));
   perform apex_test_internal.record_btcpay_test_recovery_event(
    v_scope,v_rule,v_label||'_operator_00000',
    'operator_release_reviewed',repeat('d',64));
 end loop;
end $$;

-- Refuse unsigned release previews for both stores.
do $$
begin
 if apex_test_internal.preview_btcpay_test_checkout_resume(
   '36000000-0000-0000-0000-000000000001')<>'blocked_unsigned'
 then raise exception 'Unsigned checkout resume was permitted'; end if;
end $$;

-- First admin requests a pinned head/version. A single signer cannot approve.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
  '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare
 v_id uuid;
 v_denied boolean:=false;
begin
 v_id:=public.request_btcpay_test_checkout_release(
    '36000000-0000-0000-0000-000000000001');
 if v_id is null then raise exception 'No synthetic request ID'; end if;
 begin
  perform public.approve_btcpay_test_checkout_release(v_id);
 exception when insufficient_privilege then v_denied:=true; end;
 if not v_denied then raise exception 'Requester self-approved checkout'; end if;
end $$;
commit;

-- A supplier with forged admin JWT but NO independently managed platform
-- membership cannot countersign or view either protected table.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',
  '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare v_denied boolean:=false;
begin
 begin
  perform public.approve_btcpay_test_checkout_release(
    (select id from public.btcpay_test_release_requests limit 1));
 exception when insufficient_privilege then v_denied:=true; end;
 if not v_denied then raise exception 'Forged membership allowed cosign'; end if;
 if (select count(*) from public.btcpay_test_release_requests)<>0 or
    (select count(*) from public.btcpay_test_release_approvals)<>0 then
    raise exception 'Nonadmin read dual control tables';
 end if;
end $$;
rollback;

-- Add distinct, fixture-only platform admin (already in auth.users).
insert into public.apex_admin_memberships(user_id)
 values ('00000000-0000-0000-0000-000000000003')
 on conflict do nothing;

-- A verified second admin signs the current audit head.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',
  '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare v_id uuid;
begin
 select id into v_id from public.btcpay_test_release_requests
   where scope_id='36000000-0000-0000-0000-000000000001';
 if public.approve_btcpay_test_checkout_release(v_id)
   <> 'synthetic_release_signed_no_real_checkout' then
   raise exception 'Expected dual control signature';
 end if;
end $$;
commit;

-- A signed snapshot can be simulated, but the original INSERT still fails.
do $$
declare v_denied boolean:=false;
begin
 if apex_test_internal.preview_btcpay_test_checkout_resume(
   '36000000-0000-0000-0000-000000000001')
      <> 'simulation_ready_hold_remains_active' then
   raise exception 'Expected simulation-only readiness';
 end if;
 begin
  insert into public.btcpay_test_invoices(
    apex_store_id,btcpay_store_id,invoice_id,order_reference,
    expected_amount_cents,bitcoin_network)
  values('36000000-0000-0000-0000-000000000001',
    'dual-approval-regtest','must-not-create-1','must-not-create-order',1000,'regtest');
 exception when sqlstate '55000' then v_denied:=true; end;
 if not v_denied then raise exception 'PR #120 checkout hold unexpectedly released'; end if;
 if exists(select 1 from public.btcpay_test_invoices
   where invoice_id='must-not-create-1') then
   raise exception 'Checkout bypass persisted invoice'; end if;
end $$;

-- A *later* uncertain provider update invalidates the signed simulation.
select apex_test_internal.record_btcpay_test_recovery_event(
 '36000000-0000-0000-0000-000000000001',
 '26000000-0000-0000-0000-000000000001',
 'late_unknown_00001','external_change_unknown',repeat('e',64));
do $$
begin
 if apex_test_internal.preview_btcpay_test_checkout_resume(
   '36000000-0000-0000-0000-000000000001')
      <> 'blocked_stale_evidence' then
   raise exception 'Late event did not invalidate signed review';
 end if;
end $$;

-- A different store's request becomes stale BEFORE the countersignature.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
  '{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.request_btcpay_test_checkout_release(
 '36000000-0000-0000-0000-000000000002');
commit;
select apex_test_internal.record_btcpay_test_recovery_event(
 '36000000-0000-0000-0000-000000000002',
 '26000000-0000-0000-0000-000000000002',
 'late_failure_00001','external_change_failed',repeat('f',64));

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',
  '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare v_denied boolean:=false; v_id uuid;
begin
 select id into v_id from public.btcpay_test_release_requests
  where scope_id='36000000-0000-0000-0000-000000000002';
 begin
  perform public.approve_btcpay_test_checkout_release(v_id);
 exception when sqlstate '55000' then v_denied:=true; end;
 if not v_denied then raise exception 'Stale audit head was countersigned'; end if;
end $$;
rollback;

-- Neither privileged superuser nor browser can overwrite immutable history.
do $$
declare denied1 boolean:=false; denied2 boolean:=false;
begin
 begin
  update public.btcpay_test_release_requests set audit_head_id=audit_head_id+1;
 exception when sqlstate '55000' then denied1:=true; end;
 begin
  delete from public.btcpay_test_release_approvals;
 exception when sqlstate '55000' then denied2:=true; end;
 if not denied1 or not denied2 then
  raise exception 'Immutable release records could be modified'; end if;
 if has_table_privilege('authenticated','public.btcpay_test_release_requests','INSERT') or
    has_table_privilege('authenticated','public.btcpay_test_release_approvals','INSERT') or
    has_function_privilege('authenticated',
     'apex_test_internal.preview_btcpay_test_checkout_resume(uuid)','EXECUTE')
 then raise exception 'Browser can bypass privileged release writer'; end if;
 if (select status from public.payout_rules
     where id='26000000-0000-0000-0000-000000000001')<>'draft'
 then raise exception 'Release simulation activated a payout rule'; end if;
end $$;
