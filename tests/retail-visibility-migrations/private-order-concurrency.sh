#!/usr/bin/env bash
# Disposable PostgreSQL only: two concurrent order reservations, no live commerce.
set -euo pipefail
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
if [[ "$db" != "retail_test" ]]; then
  echo "Refusing private order concurrency fixture outside retail_test" >&2
  exit 1
fi
tmp="$(mktemp -d)"
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -qAtc    "update apex_internal.retail_order_engine_gate set enabled=false where singleton=true;" >/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
update public.inventory_items
 set quantity_on_hand=3,quantity_reserved=0
 where product_id='50000000-0000-4000-8000-000000000001';
update public.inventory_items
 set quantity_on_hand=1,quantity_reserved=0
 where product_id='50000000-0000-4000-8000-000000000005';
update apex_internal.retail_order_engine_gate set enabled=true where singleton=true;
SQL

# Same-key transactions must obtain ONE original ID; no double reservation.
psql -X -v ON_ERROR_STOP=1 -qAt >"$tmp/same-first" 2>&1 <<'SQL' &
begin;
select apex_internal.reserve_retail_order_hold(
 '10000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000701',repeat('7',64),
 '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
 '','auto',4700);
select pg_sleep(2);
commit;
SQL
same_pid=$!
sleep 0.4
psql -X -v ON_ERROR_STOP=1 -qAt >"$tmp/same-second" 2>&1 <<'SQL'
select apex_internal.reserve_retail_order_hold(
 '10000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000701',repeat('7',64),
 '[{"product_id":"50000000-0000-4000-8000-000000000001","quantity":1}]',
 '','auto',4700);
SQL
wait "$same_pid"
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
do $verify$
begin
 if (select count(*) from apex_internal.retail_order_holds where
    request_id='80000000-0000-4000-8000-000000000701')<>1 or
    (select quantity_reserved from public.inventory_items where
     product_id='50000000-0000-4000-8000-000000000001')<>1
 then raise exception 'Concurrent same-key hold created duplicates';end if;
end $verify$;
SQL
grep -q '"replayed": true' "$tmp/same-second" || {
 echo "Second same-key call was not replayed"; cat "$tmp/same-second"; exit 1;
}

# Different keys racing for one serum unit: first transaction locks the row,
# second must fail after waiting; reserved stock must never exceed on-hand.
psql -X -v ON_ERROR_STOP=1 -qAt >"$tmp/stock-first" 2>&1 <<'SQL' &
begin;
select apex_internal.reserve_retail_order_hold(
 '10000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000702',repeat('8',64),
 '[{"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]',
 '','auto',5499);
select pg_sleep(2);
commit;
SQL
stock_pid=$!
sleep 0.4
if psql -X -v ON_ERROR_STOP=1 -qAt >"$tmp/stock-second" 2>&1 <<'SQL'
select apex_internal.reserve_retail_order_hold(
 '10000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000703',repeat('9',64),
 '[{"product_id":"50000000-0000-4000-8000-000000000005","quantity":1}]',
 '','auto',5499);
SQL
then
 echo "Concurrent out-of-stock order unexpectedly succeeded"; exit 1
fi
wait "$stock_pid"
grep -q "Insufficient verified stock" "$tmp/stock-second" || {
 echo "Second competing hold failed for an unexpected reason";
 cat "$tmp/stock-second"; exit 1;
}
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
do $verify$
begin
 if (select count(*) from apex_internal.retail_order_holds where
   request_id in ('80000000-0000-4000-8000-000000000702',
     '80000000-0000-4000-8000-000000000703'))<>1 or
   (select quantity_reserved from public.inventory_items where
    product_id='50000000-0000-4000-8000-000000000005')<>1 or
   (select quantity_on_hand from public.inventory_items where
    product_id='50000000-0000-4000-8000-000000000005')<>1
 then raise exception 'Two concurrent orders oversold the one-unit serum';end if;
end $verify$;
SQL
echo "Atomic same-key and independent-key inventory races verified"
