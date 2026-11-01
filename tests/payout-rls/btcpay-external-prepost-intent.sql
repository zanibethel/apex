-- PR #125 disposable Postgres. Exercises pre-POST reservation under
-- two-admin test signoffs; NEVER calls an external BTCPay server.
\set ON_ERROR_STOP on
insert into public.stores(id,supplier_id,slug,display_name,is_public)
 select '38000000-0000-0000-0000-000000000001',s.id,
 'prepost-fence','Regtest pre-POST fence fixture',false
 from public.suppliers s where s.slug='test-supplier';
insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
values('28000000-0000-0000-0000-000000000001','storefront',
 '38000000-0000-0000-0000-000000000001',1,'draft',now());
insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
values
 ('28000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',9000),
 ('28000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',1000);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if public.review_btcpay_test_split_activation(
  '28000000-0000-0000-0000-000000000001')
   <> 'approved_pending_manual_sync' then
   raise exception 'Prepost split review missing';
 end if;
end $$;
commit;
select apex_test_internal.hold_btcpay_test_split_sync(
 '28000000-0000-0000-0000-000000000001');

do $$
declare
 s uuid:='38000000-0000-0000-0000-000000000001';
 r uuid:='28000000-0000-0000-0000-000000000001';
begin
 perform apex_test_internal.record_btcpay_test_recovery_event(
  s,r,'prepost_success_00001','external_change_reported_success',repeat('a',64));
 perform apex_test_internal.record_btcpay_test_recovery_event(
  s,r,'prepost_readback_0001','provider_readback_verified',repeat('b',64));
 perform apex_test_internal.record_btcpay_test_recovery_event(
  s,r,'prepost_wallet_000001','wallet_reconciliation_verified',repeat('c',64));
 perform apex_test_internal.record_btcpay_test_recovery_event(
  s,r,'prepost_operator_0001','operator_release_reviewed',repeat('d',64));
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.request_btcpay_test_checkout_release(
 '38000000-0000-0000-0000-000000000001');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare req uuid;
begin
 select id into req from public.btcpay_test_release_requests where
  scope_id='38000000-0000-0000-0000-000000000001';
 if public.approve_btcpay_test_checkout_release(req)
  <> 'synthetic_release_signed_no_real_checkout' then
  raise exception 'Two-admin approval required'; end if;
end $$;
commit;
select apex_test_internal.open_btcpay_test_checkout_resume(
 '38000000-0000-0000-0000-000000000001');

-- Reservation must complete in its own durable transaction BEFORE any POST.
do $$
declare
 v_intent uuid;
 v_denied boolean:=false;
begin
 v_intent:=apex_test_internal.reserve_btcpay_test_provider_post(
 '38000000-0000-0000-0000-000000000001',
 'synthetic-regtest-store','order-prepost-1',10000);
 if v_intent is null or
 (select status from public.btcpay_test_checkout_resume_permits
  where scope_id='38000000-0000-0000-0000-000000000001')<>'consumed' then
   raise exception 'Durable reservation failed to consume permit';
 end if;
 if (select count(*) from public.btcpay_test_provider_post_intents
  where scope_id='38000000-0000-0000-0000-000000000001' and
   network='regtest' and amount_sats=10000 and
   order_reference='order-prepost-1')<>1 then
   raise exception 'Durable intent not committed'; end if;
 begin
  perform apex_test_internal.reserve_btcpay_test_provider_post(
  '38000000-0000-0000-0000-000000000001',
  'synthetic-regtest-store','order-prepost-1',10000);
 exception when sqlstate '55000' then v_denied:=true; end;
 if not v_denied then
  raise exception 'Second external POST was authorized after consumption';
 end if;
 if not exists(select 1 from public.btcpay_test_split_sync_holds
   where scope_id='38000000-0000-0000-0000-000000000001'
    and status='held') then
   raise exception 'Provider intent removed immutable store hold'; end if;
end $$;

-- An operator can append an unknown outcome and later independent provider
-- observation, but cannot rewrite or delete previous evidence.
do $$
declare
 v_id uuid;
 v_rejected boolean:=false;
begin
 select id into v_id from public.btcpay_test_provider_post_intents
  where order_reference='order-prepost-1';
 if apex_test_internal.observe_btcpay_test_provider_post(
    v_id,'post_outcome_unknown')<>'recorded_without_checkout_authorization' then
   raise exception 'Unknown outcome not persisted'; end if;
 if apex_test_internal.observe_btcpay_test_provider_post(
    v_id,'invoice_seen_by_readback','regtest-invoice-1')
    <>'recorded_without_checkout_authorization' then
   raise exception 'Readback recovery not persisted'; end if;
 begin
  perform apex_test_internal.observe_btcpay_test_provider_post(
   v_id,'invoice_seen_by_readback','regtest-invoice-2');
 exception when sqlstate '55000' then v_rejected:=true; end;
 if not v_rejected then raise exception 'Conflicting provider readback accepted'; end if;
 if (select count(*) from public.btcpay_test_provider_post_observations
  where intent_id=v_id)<>2 then
   raise exception 'Missing append-only recovery observations'; end if;
end $$;

do $$
declare denied boolean:=false;
begin
 begin
  update public.btcpay_test_provider_post_intents
    set order_reference='tampered';
 exception when sqlstate '55000' then denied:=true; end;
 if not denied then raise exception 'Intent mutation bypassed trigger'; end if;
 if has_function_privilege('authenticated',
  'apex_test_internal.reserve_btcpay_test_provider_post(uuid,text,text,bigint)',
  'EXECUTE') or
  has_function_privilege('authenticated',
  'apex_test_internal.observe_btcpay_test_provider_post(uuid,text,text)',
  'EXECUTE') or
  has_table_privilege('authenticated',
  'public.btcpay_test_provider_post_intents','INSERT') then
   raise exception 'Browser may authorize provider POST'; end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"supplier"}}',true);
do $$
begin
 if (select count(*) from public.btcpay_test_provider_post_intents)<>0 or
    (select count(*) from public.btcpay_test_provider_post_observations)<>0 then
  raise exception 'Supplier can read privileged provider POST recovery'; end if;
end $$;
rollback;
