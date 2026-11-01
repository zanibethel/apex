#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL ONLY. A sync hold and invoice insert race on the SAME
# advisory store lock. Proof is that the invoice waits and then fails closed.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into public.stores(id,supplier_id,slug,display_name,is_public)
 select '35000000-0000-0000-0000-000000000001',s.id,
 'split-sync-race','Split sync invoice race fixture',false
 from public.suppliers s where slug='test-supplier';
insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
values ('25000000-0000-0000-0000-000000000001','storefront',
 '35000000-0000-0000-0000-000000000001',1,'draft',now());
insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
values
 ('25000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',9000),
 ('25000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',1000);
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.review_btcpay_test_split_activation(
 '25000000-0000-0000-0000-000000000001');
commit;
SQL
a_log="$(mktemp)"
b_log="$(mktemp)"
trap 'rm -f "$a_log" "$b_log"' EXIT
PGAPPNAME=apex_hold_race_a psql -X -q -v ON_ERROR_STOP=1 >"$a_log" 2>&1 <<'SQL' &
begin;
select apex_test_internal.hold_btcpay_test_split_sync(
 '25000000-0000-0000-0000-000000000001');
select pg_sleep(7);
commit;
SQL
a=$!
# Do not rely on process start or timing alone: wait until session A is inside
# pg_sleep with its transaction and advisory lock still open.
ready=0
for _ in $(seq 1 80); do
  n="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='apex_hold_race_a' and state='active' and query like '%pg_sleep(7)%'")"
  if [[ "$n" == "1" ]]; then ready=1; break; fi
  sleep 0.1
done
if [[ "$ready" != "1" ]]; then
  cat "$a_log"
  echo "FAIL: hold worker did not reach protected section"
  wait "$a" || true
  exit 1
fi
PGAPPNAME=apex_invoice_race_b psql -X -q -v ON_ERROR_STOP=1 >"$b_log" 2>&1 <<'SQL' &
insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network
) values (
 '35000000-0000-0000-0000-000000000001','concurrent-regtest',
 'concurrent-invoice-1','concurrent-order-1',5000,'regtest'
);
SQL
b=$!
blocked=0
for _ in $(seq 1 40); do
  n="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='apex_invoice_race_b' and wait_event_type='Lock'")"
  if [[ "$n" == "1" ]]; then blocked=1; break; fi
  sleep 0.1
done
if [[ "$blocked" != "1" ]]; then
  cat "$a_log" "$b_log"
  echo "FAIL: invoice writer did not wait on shared store lock"
  wait "$a" || true
  wait "$b" || true
  exit 1
fi
wait "$a"
if wait "$b"; then
  echo "FAIL: invoice writer succeeded after hold committed"
  exit 1
fi
if ! grep -q 'Storefront on split-sync hold' "$b_log"; then
  cat "$b_log"
  echo "FAIL: invoice rejection was not the expected store hold"
  exit 1
fi
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
 if exists(select 1 from public.btcpay_test_invoices
  where invoice_id='concurrent-invoice-1') then
   raise exception 'Racing invoice committed after hold';
 end if;
 if (select count(*) from public.btcpay_test_split_sync_holds
  where scope_id='35000000-0000-0000-0000-000000000001')<>1 then
   raise exception 'Concurrent sync hold was not durable';
 end if;
end $$;
SQL
echo "PASS: invoice writer waited for shared lock and failed closed after sync hold"
