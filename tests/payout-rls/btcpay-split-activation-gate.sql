-- PR #119 disposable PostgreSQL ONLY. Run after payout fixture + draft RPC,
-- receipt journal, and the new review-only split activation schema.
-- No payout status is changed to active; Prism settings remain untouched.

-- Existing fixture transfer records are pending; make selected recipients
-- eligible, but prove pending transfers still block activation.
update public.payout_recipients set status='active'
 where id in ('10000000-0000-0000-0000-000000000001',
              '10000000-0000-0000-0000-000000000002');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.save_payout_rule_draft(
 '21000000-0000-0000-0000-000000000019',
 'storefront','30000000-0000-0000-0000-000000000001',
 '[{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":9000},
   {"recipient_id":"10000000-0000-0000-0000-000000000002","basis_points":1000}]'
);
select public.review_btcpay_test_split_activation(
 '21000000-0000-0000-0000-000000000019');
do $$
begin
 if (select status from public.btcpay_test_split_activation_reviews
   where rule_id='21000000-0000-0000-0000-000000000019')<>'blocked'
 then raise exception 'Expected pending transfer blocker'; end if;
 if (select transfer_blockers from public.btcpay_test_split_activation_reviews
   where rule_id='21000000-0000-0000-0000-000000000019')<>2
 then raise exception 'Missing two unresolved transfer blockers'; end if;
end $$;
commit;

-- A privileged disposable fixture confirms the prior synthetic payouts.
-- This is NOT a browser RPC and does NOT send any coins.
update public.payout_transfer_records set state='confirmed'
 where snapshot_id='40000000-0000-0000-0000-000000000001';

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare state text; rejected boolean;
begin
 state:=public.review_btcpay_test_split_activation(
    '21000000-0000-0000-0000-000000000019');
 if state<>'approved_pending_manual_sync'
 then raise exception 'Clean store not eligible for manual sync review'; end if;
 if (select status from public.payout_rules
   where id='21000000-0000-0000-0000-000000000019')<>'draft'
 then raise exception 'Approval incorrectly activated underlying split'; end if;
 if (select count(*) from public.payout_rule_allocations
   where rule_id='21000000-0000-0000-0000-000000000019')<>2
 then raise exception 'Approved payout allocations missing'; end if;
 -- Browser-admin RPC may not modify an approved candidate in place.
 rejected:=false;
 begin
  perform public.save_payout_rule_draft(
    '21000000-0000-0000-0000-000000000019',
    'storefront','30000000-0000-0000-0000-000000000001',
    '[{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":8500},
      {"recipient_id":"10000000-0000-0000-0000-000000000002","basis_points":1500}]');
 exception when sqlstate '55000' then rejected:=true; end;
 if not rejected then raise exception 'Approved candidate edited in place'; end if;
 if (select count(*) from public.payout_rule_allocations
  where rule_id='21000000-0000-0000-0000-000000000019'
    and basis_points=9000)<>1
 then raise exception 'Approved 90/10 split overwritten'; end if;
end $$;
commit;

-- A NEW invoice after a point-in-time approval must invalidate approval on
-- the next review. This deliberately demonstrates why provider synchronization
-- MUST recheck the barrier under a cooperative invoice-creation lock.
insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network
) values (
 '30000000-0000-0000-0000-000000000001','activation-store-regtest',
 'activation-invoice-1','activation-order-1',1000,'regtest'
);
insert into public.btcpay_test_order_status(
 btcpay_store_id,invoice_id,order_reference,expected_amount_sats,
 status,status_revision
) values (
 'activation-store-regtest','activation-invoice-1','activation-order-1',
 10000,'awaiting',0
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if public.review_btcpay_test_split_activation(
  '21000000-0000-0000-0000-000000000019')<>'blocked'
 then raise exception 'New pending invoice did not revoke manual sync approval'; end if;
 if (select invoice_blockers from public.btcpay_test_split_activation_reviews
  where rule_id='21000000-0000-0000-0000-000000000019')<>1
 then raise exception 'Missing pending invoice blocker'; end if;
end $$;
commit;

-- A Greenfield Settled status alone does NOT satisfy the barrier.
update public.btcpay_test_order_status set status='settled_reported',
 status_revision=1 where invoice_id='activation-invoice-1';

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if public.review_btcpay_test_split_activation(
  '21000000-0000-0000-0000-000000000019')<>'blocked'
 then raise exception 'Invoice settled without proof was incorrectly marked drained'; end if;
end $$;
commit;

-- In the disposable fixture alone, a trusted database owner supplies a
-- synthetic finality proof for BOTH recipient claims and wallet confirmations.
insert into public.btcpay_test_invoice_finality_proofs (
 btcpay_store_id,invoice_id,confirmed_claims,confirmed_wallet_receipts
) values ('activation-store-regtest','activation-invoice-1',true,true);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
begin
 if public.review_btcpay_test_split_activation(
  '21000000-0000-0000-0000-000000000019')<>'approved_pending_manual_sync'
 then raise exception 'Fully drained synthetic invoice was not review eligible'; end if;
 if (select invoice_blockers+transfer_blockers+conflicting_rule_blockers
   from public.btcpay_test_split_activation_reviews
   where rule_id='21000000-0000-0000-0000-000000000019')<>0
 then raise exception 'Remaining blockers despite approved review'; end if;
end $$;
commit;

-- A newer admin draft is allowed, but cannot be eligible simultaneously:
-- historical approved version must be reconciled first.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.save_payout_rule_draft(
 '21000000-0000-0000-0000-000000000020',
 'storefront','30000000-0000-0000-0000-000000000001',
 '[{"recipient_id":"10000000-0000-0000-0000-000000000001","basis_points":8500},
   {"recipient_id":"10000000-0000-0000-0000-000000000002","basis_points":1500}]'
);
do $$
begin
 if public.review_btcpay_test_split_activation(
  '21000000-0000-0000-0000-000000000020')<>'blocked'
 then raise exception 'Conflicting second candidate unexpectedly approved'; end if;
end $$;
commit;

-- Nonadmins and spoofed app-role tokens cannot review candidate payouts.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
do $$
declare denied boolean:=false;
begin
 begin
  perform public.review_btcpay_test_split_activation(
    '21000000-0000-0000-0000-000000000019');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Non-admin review authorized'; end if;
 if (select count(*) from public.btcpay_test_split_activation_reviews)<>0
 then raise exception 'Non-admin can read private split reviews'; end if;
 if (select count(*) from public.btcpay_test_invoice_finality_proofs)<>0
 then raise exception 'Non-admin can read private finality records'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"supplier"}}',true);
do $$
declare denied boolean:=false;
begin
 begin
  perform public.review_btcpay_test_split_activation(
    '21000000-0000-0000-0000-000000000019');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Missing app_metadata privilege was accepted'; end if;
end $$;
rollback;

-- Direct authenticated browser writes to reviews/finality remain denied.
do $$
begin
 if has_table_privilege('authenticated',
   'public.btcpay_test_split_activation_reviews','INSERT')
  or has_table_privilege('authenticated',
   'public.btcpay_test_split_activation_reviews','UPDATE')
  or has_table_privilege('authenticated',
   'public.btcpay_test_invoice_finality_proofs','INSERT')
 then raise exception 'Browser has write grant on private approval/proof table'; end if;
 if (select status from public.payout_rules
  where id='21000000-0000-0000-0000-000000000019')<>'draft'
 then raise exception 'Payout rule silently made live'; end if;
end $$;
