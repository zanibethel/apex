#!/usr/bin/env bash
set -euo pipefail
# Disposable Postgres only; competing cancellation and expiry may release
# the same hold ONCE, with a single terminal audit event.
database="$(psql -X -At -v ON_ERROR_STOP=1 -c 'select current_database()')"
test "$database" = "apex_test"
store='77000000-0000-0000-0000-000000000001'
product='78000000-0000-0000-0000-000000000001'
order_id="$(psql -X -At -v ON_ERROR_STOP=1 -c "
 select apex_test_reservation.reserve_with_verified_quotes(
 '$store',repeat('8',64),
 '[{\"product_id\":\"$product\",\"quantity\":2}]'::jsonb,
 'ship-demo-1','tax-demo-1','TX',6050)->>'order_id';")"
if [[ ! "$order_id" =~ ^[0-9a-f-]{36}$ ]];then echo 'Missing held order';exit 1;fi
psql -X -v ON_ERROR_STOP=1 -c "
 update apex_test_reservation.orders
 set held_until=now()-interval '1 minute'
 where store_id='$store' and id='$order_id'
  and state='held_fixture_only';" >/dev/null
a_log="$(mktemp)"; b_log="$(mktemp)"
cleanup(){ rm -f "$a_log" "$b_log"; }
trap cleanup EXIT
psql -X -At -v ON_ERROR_STOP=1 -c "
 select apex_test_reservation.release_held_contract(
 '$store','$order_id','cancel');" >"$a_log" 2>&1 & a=$!
psql -X -At -v ON_ERROR_STOP=1 -c "
 select apex_test_reservation.expire_due_holds(10);" >"$b_log" 2>&1 & b=$!
wait "$a" || { cat "$a_log";exit 1; }
wait "$b" || { cat "$b_log";exit 1; }

# Irrespective of winner, exactly one reserved quantity is released and
# exactly one append-only audit is written; the loser does nothing.
row="$(psql -X -At -v ON_ERROR_STOP=1 -c "
select concat(
 (select count(*) from apex_test_reservation.order_release_events where order_id='$order_id'),
 ':',
 (select reserved from apex_test_reservation.inventory where store_id='$store' and product_id='$product'),
 ':',
 (select case when state in ('cancelled_fixture_only','expired_fixture_only')
  then 1 else 0 end from apex_test_reservation.orders where id='$order_id'),
 ':',
 (select case when release_reason=case when state='cancelled_fixture_only'
  then 'cancel' else 'expire' end then 1 else 0 end
  from apex_test_reservation.orders where id='$order_id')
);")"
if [[ "$row" != "1:0:1:1" ]];then
 echo "FAIL: conflicting terminal actions double-released stock or lost audit ($row)"
 cat "$a_log" "$b_log";exit 1
fi
events="$(psql -X -At -v ON_ERROR_STOP=1 -c "
 select concat(
  (select count(*) from apex_internal.checkout_order_intents),':',
  (select count(*) from apex_internal.btcpay_invoice_post_intents)
 );")"
test "$events" = '0:0'
echo 'PASS: conflicting cancel/expiry race releases once, writes one audit, real journals untouched'
