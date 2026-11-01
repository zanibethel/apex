-- PR #122: disposable recovery audit integration. PR #120 fixtures create
-- a held store/rule; no external Prism setting mutation exists in this test.
\set ON_ERROR_STOP on

-- SQL-only privileged fixtures use synthetic SHA256 digests, not real provider
-- receipts. The same request ID must be exactly idempotent.
do $$
declare
 v_scope uuid:='30000000-0000-0000-0000-000000000001';
 v_rule uuid:='21000000-0000-0000-0000-000000000019';
 v_hash text:=repeat('a',64);
 v_a bigint;
 v_b bigint;
 v_rejected boolean:=false;
begin
 if apex_test_internal.assess_btcpay_test_release_readiness(v_scope)
  <> 'blocked_no_reported_change' then
   raise exception 'Initial hold incorrectly ready for checkout release';
 end if;
 v_a:=apex_test_internal.record_btcpay_test_recovery_event(
   v_scope,v_rule,'check_inventory_00001',
   'provider_inventory_checked',v_hash);
 v_b:=apex_test_internal.record_btcpay_test_recovery_event(
   v_scope,v_rule,'check_inventory_00001',
   'provider_inventory_checked',v_hash);
 if v_a is distinct from v_b then
   raise exception 'Same request did not deduplicate';
 end if;
 begin
  perform apex_test_internal.record_btcpay_test_recovery_event(
   v_scope,v_rule,'check_inventory_00001',
   'external_change_unknown',v_hash);
 exception when unique_violation then v_rejected:=true; end;
 if not v_rejected then
   raise exception 'Conflicting duplicate request was accepted';
 end if;
 if apex_test_internal.assess_btcpay_test_release_readiness(v_scope)
   <> 'blocked_no_reported_change' then
   raise exception 'Inventory read alone enabled release review';
 end if;
end $$;

-- Any uncertain external configuration update demands a hold and escalation.
select apex_test_internal.record_btcpay_test_recovery_event(
 '30000000-0000-0000-0000-000000000001',
 '21000000-0000-0000-0000-000000000019',
 'external_unknown_00001','external_change_unknown',
 repeat('b',64));
do $$
begin
 if apex_test_internal.assess_btcpay_test_release_readiness(
  '30000000-0000-0000-0000-000000000001')
   <> 'blocked_no_reported_change' then
  raise exception 'Unknown change permitted checkout release';
 end if;
end $$;

-- Even an operator-reported success does NOT suffice without independent
-- provider readback, wallet finality and an explicit later operator review.
select apex_test_internal.record_btcpay_test_recovery_event(
 '30000000-0000-0000-0000-000000000001',
 '21000000-0000-0000-0000-000000000019',
 'external_success_00001','external_change_reported_success',
 repeat('c',64));
do $$
begin
 if apex_test_internal.assess_btcpay_test_release_readiness(
  '30000000-0000-0000-0000-000000000001')
   <> 'blocked_missing_provider_readback' then
  raise exception 'Success without readback was considered ready';
 end if;
end $$;

select apex_test_internal.record_btcpay_test_recovery_event(
 '30000000-0000-0000-0000-000000000001',
 '21000000-0000-0000-0000-000000000019',
 'readback_verified_00001','provider_readback_verified',
 repeat('d',64));
do $$
begin
 if apex_test_internal.assess_btcpay_test_release_readiness(
  '30000000-0000-0000-0000-000000000001')
   <> 'blocked_missing_wallet_reconciliation' then
  raise exception 'Readback without wallet evidence considered ready';
 end if;
end $$;

select apex_test_internal.record_btcpay_test_recovery_event(
 '30000000-0000-0000-0000-000000000001',
 '21000000-0000-0000-0000-000000000019',
 'wallet_verified_00001','wallet_reconciliation_verified',
 repeat('e',64));
do $$
begin
 if apex_test_internal.assess_btcpay_test_release_readiness(
  '30000000-0000-0000-0000-000000000001')
   <> 'blocked_missing_operator_review' then
  raise exception 'Wallet proof without operator review considered ready';
 end if;
end $$;

select apex_test_internal.record_btcpay_test_recovery_event(
 '30000000-0000-0000-0000-000000000001',
 '21000000-0000-0000-0000-000000000019',
 'operator_review_00001','operator_release_reviewed',
 repeat('f',64));
do $$
begin
 if apex_test_internal.assess_btcpay_test_release_readiness(
  '30000000-0000-0000-0000-000000000001')
   <> 'review_only_candidate_checkout_stays_held' then
  raise exception 'Fully reviewed fixture did not reach non-authorizing status';
 end if;
 if (select count(*) from public.btcpay_test_split_sync_holds
  where scope_id='30000000-0000-0000-0000-000000000001' and status='held')<>1
 then raise exception 'Review removed the immutable hold'; end if;
 if (select status from public.payout_rules
  where id='21000000-0000-0000-0000-000000000019')<>'draft' then
  raise exception 'Review activated payout settings'; end if;
end $$;

-- A new incident invalidates a previous clean sequence and stays held.
select apex_test_internal.record_btcpay_test_recovery_event(
 '30000000-0000-0000-0000-000000000001',
 '21000000-0000-0000-0000-000000000019',
 'incident_after_review_00001','external_change_failed',
 repeat('0',64));
do $$
begin
 if apex_test_internal.assess_btcpay_test_release_readiness(
  '30000000-0000-0000-0000-000000000001')
   <> 'blocked_incident_after_change' then
  raise exception 'Late error did not revoke prior readiness';
 end if;
end $$;

-- Unrelated storefront and mismatched held rule cannot receive evidence.
do $$
declare denied boolean:=false;
begin
 begin
  perform apex_test_internal.record_btcpay_test_recovery_event(
    '33000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000001',
    'invalid_hold_00001','provider_readback_verified',repeat('a',64));
 exception when sqlstate '55000' then denied:=true; end;
 if not denied then raise exception 'Event without matching held rule accepted'; end if;
end $$;

-- A trusted superuser still cannot silently rewrite or delete history.
do $$
declare denied_update boolean:=false; denied_delete boolean:=false;
begin
 begin
  update public.btcpay_test_sync_recovery_events
    set evidence_sha256=repeat('1',64)
    where request_id='operator_review_00001';
 exception when sqlstate '55000' then denied_update:=true; end;
 begin
  delete from public.btcpay_test_sync_recovery_events
    where request_id='operator_review_00001';
 exception when sqlstate '55000' then denied_delete:=true; end;
 if not denied_update or not denied_delete then
  raise exception 'Recovery history not append-only'; end if;
end $$;

do $$
begin
 if has_table_privilege('authenticated',
  'public.btcpay_test_sync_recovery_events','INSERT') or
    has_table_privilege('authenticated',
  'public.btcpay_test_sync_recovery_events','UPDATE') or
    has_function_privilege('authenticated',
  'apex_test_internal.record_btcpay_test_recovery_event(uuid,uuid,text,text,text)',
  'EXECUTE') or
    has_function_privilege('authenticated',
  'apex_test_internal.assess_btcpay_test_release_readiness(uuid)',
  'EXECUTE') then
  raise exception 'Browser was granted privileged audit or release capability';
 end if;
end $$;

-- Admins may read fixture audit rows but cannot mutate them.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if (select count(*) from public.btcpay_test_sync_recovery_events)<7 then
  raise exception 'Admin cannot inspect recovery audit'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"supplier"}}',true);
do $$
begin
 if (select count(*) from public.btcpay_test_sync_recovery_events)<>0 then
   raise exception 'Supplier can inspect private recovery audit'; end if;
end $$;
rollback;
