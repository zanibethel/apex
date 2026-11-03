#!/usr/bin/env bash
set -euo pipefail
# CI/Disposable PostgreSQL only. Real Apex order and provider journals untouched.
database="$(psql -X -At -v ON_ERROR_STOP=1 -c 'select current_database()')"
if [[ "$database" != "apex_test" ]]; then echo "Unsafe reservation target";exit 1;fi
log1="$(mktemp)"
log2="$(mktemp)"
cleanup(){ rm -f "$log1" "$log2"; }
trap cleanup EXIT

run_one(){
 local key="$1" product="$2" qty="$3" ship="$4" tax="$5" total="$6" dest="$7"
 psql -X -At -v ON_ERROR_STOP=1 -c "select apex_test_reservation.reserve_held_contract(
  '77000000-0000-0000-0000-000000000001',
  repeat('$key',64),
  '[{\"product_id\":\"$product\",\"quantity\":$qty}]'::jsonb,
  '$ship','$tax','TX',$total
 );"
}

# Two different requests compete for one synthetic unit: exactly one wins.
run_one 5 78000000-0000-0000-0000-000000000002 1 ship-race-1 tax-race-1 4750 TX >"$log1" 2>&1 & a=$!
run_one 6 78000000-0000-0000-0000-000000000002 1 ship-race-1 tax-race-1 4750 TX >"$log2" 2>&1 & b=$!
sa=0;sb=0
wait "$a" || sa=$?
wait "$b" || sb=$?
if [[ "$sa" -eq "$sb" ]];then
 echo "FAIL: competing one-unit reservations did not produce exactly one winner"
 cat "$log1" "$log2";exit 1
fi
if [[ "$sa" -eq 0 ]];then
 grep -q '"state": "held_fixture_only"' "$log1" || { cat "$log1";exit 1; }
 grep -q 'insufficient stock' "$log2" || { cat "$log2";exit 1; }
else
 grep -q '"state": "held_fixture_only"' "$log2" || { cat "$log2";exit 1; }
 grep -q 'insufficient stock' "$log1" || { cat "$log1";exit 1; }
fi

one_unit_state="$(psql -X -At -v ON_ERROR_STOP=1 -c "
 select concat(i.reserved,':',count(l.order_id))
 from apex_test_reservation.inventory i
 left join apex_test_reservation.order_lines l on l.product_id=i.product_id
 where i.product_id='78000000-0000-0000-0000-000000000002'
 group by i.reserved;")"
if [[ "$one_unit_state" != "1:1" ]];then
 echo "FAIL: one-unit inventory oversold or duplicate order generated ($one_unit_state)";exit 1
fi

# Competing same-key retries serialize and return the same held order.
run_one 7 78000000-0000-0000-0000-000000000001 2 ship-demo-1 tax-demo-1 6050 TX >"$log1" 2>&1 & c=$!
run_one 7 78000000-0000-0000-0000-000000000001 2 ship-demo-1 tax-demo-1 6050 TX >"$log2" 2>&1 & d=$!
wait "$c" || { cat "$log1";exit 1; }
wait "$d" || { cat "$log2";exit 1; }
grep -q '"state": "held_fixture_only"' "$log1" && grep -q '"state": "replayed_held"' "$log2" || {
 grep -q '"state": "replayed_held"' "$log1" &&
 grep -q '"state": "held_fixture_only"' "$log2" || {
 echo "FAIL: same-key retries did not yield held + replay";cat "$log1" "$log2";exit 1; }
}
two_unit_state="$(psql -X -At -v ON_ERROR_STOP=1 -c "
 select concat(i.reserved,':',count(l.order_id))
 from apex_test_reservation.inventory i
 left join apex_test_reservation.order_lines l on l.product_id=i.product_id
 where i.product_id='78000000-0000-0000-0000-000000000001'
 group by i.reserved;")"
if [[ "$two_unit_state" != "2:1" ]];then
 echo "FAIL: same-key retry double-reserved inventory ($two_unit_state)";exit 1
fi

live_journal="$(psql -X -At -v ON_ERROR_STOP=1 -c "
 select (select count(*) from apex_internal.checkout_order_intents)::text||':'||
  (select count(*) from apex_internal.btcpay_invoice_post_intents)::text;")"
test "$live_journal" = "0:0"
echo "PASS: concurrent synthetic 1-unit oversell denied, identical-key retry idempotent, real journals untouched"
