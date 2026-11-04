#!/usr/bin/env bash
# Issue #215: two independent PostgreSQL sessions prove canonical-order
# serialization and shipment idempotency. Disposable apex_test ONLY.
set -euo pipefail

database="$(psql -X -At -v ON_ERROR_STOP=1 -c 'select current_database()')"
if [[ "$database" != "apex_test" ]]; then
  echo "Refusing shipment race outside disposable apex_test" >&2
  exit 1
fi
gate="$(psql -X -At -v ON_ERROR_STOP=1 -c 'select enabled from apex_internal.private_release_gate where singleton')"
if [[ "$gate" != "f" ]]; then
  echo "Private commerce gate must be off" >&2
  exit 1
fi
store="62000000-0000-0000-0000-000000000001"
order="$(psql -X -At -v ON_ERROR_STOP=1 -c "select id from apex_internal.order_detail_snapshots where store_id='$store' and sale_id='65000614-0000-4000-8000-000000000001'")"
line="$(psql -X -At -v ON_ERROR_STOP=1 -c "select id from apex_internal.order_line_snapshots where store_id='$store' and order_id='$order' and line_number=1")"
if [[ ! "$order" =~ ^[0-9a-f-]{36}$ || ! "$line" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "Missing synthetic canonical order and purchased line" >&2
  exit 1
fi
alloc="[{"'"order_line_id"'":"'"$line"'","'"quantity"'":2}]"
key="70000215-0000-4000-8000-000000000900"
reference="SYNTH-215-RACE-REPLAY"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT

# Session A locks the original immutable order row before the function.
# Session B must wait for that same row, then observe only an identical replay.
psql -X -At -v ON_ERROR_STOP=1 >"$dir/a" 2>&1 <<SQL &
begin;
select id from apex_internal.order_detail_snapshots where id='$order' for update;
select pg_sleep(3);
select apex_internal.create_review_shipment_plan('$store','$order',
 '$reference','$alloc'::jsonb,'$key');
commit;
SQL
pid_a=$!
sleep 0.3
psql -X -At -v ON_ERROR_STOP=1 >"$dir/b" 2>&1 <<SQL &
select apex_internal.create_review_shipment_plan('$store','$order',
 '$reference','$alloc'::jsonb,'$key');
SQL
pid_b=$!
waiting=0
for _ in {1..16}; do
  count="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%create_review_shipment_plan%'")"
  if [[ "$count" =~ ^[0-9]+$ && "$count" -gt 0 ]]; then
    waiting=1
    break
  fi
  sleep 0.1
done
wait "$pid_a"
wait "$pid_b"
if [[ "$waiting" -ne 1 ]]; then
  echo "Did not observe concurrent held order lock wait" >&2
  exit 1
fi
if ! grep -q '"status": "plan_recorded"' "$dir/a" ||
   ! grep -q '"status": "identical_plan_replay"' "$dir/b"; then
  echo "Concurrent replay failed to preserve one stable plan" >&2
  cat "$dir/a" "$dir/b" >&2
  exit 1
fi
# A differently keyed attempt must not quietly exceed the purchased count.
if psql -X -At -v ON_ERROR_STOP=1 >"$dir/c" 2>&1 <<SQL
select apex_internal.create_review_shipment_plan('$store','$order',
 'SYNTH-215-RACE-CONFLICT','$alloc'::jsonb,
 '70000215-0000-4000-8000-000000000901');
SQL
then
  echo "Oversubscribed original line during race" >&2
  exit 1
fi
if ! grep -q 'Shipment plans exceed immutable purchased quantity' "$dir/c"; then
  echo "Conflicting request failed for an unexpected reason" >&2
  cat "$dir/c" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -v store="$store" -v order="$order" -v line="$line" <<'SQL'
do $verify$
declare
 s uuid:=:'store';
 o uuid:=:'order';
 l uuid:=:'line';
begin
 if (select count(*) from apex_internal.review_shipment_plans
   where store_id=s and order_id=o
    and client_shipment_reference='SYNTH-215-RACE-REPLAY')<>1
 or (select coalesce(sum(planned_quantity),0) from apex_internal.review_shipment_allocations
   where store_id=s and order_id=o and order_line_id=l)<>2
 or (select count(*) from apex_internal.review_shipment_events
   where store_id=s and event_key='70000215-0000-4000-8000-000000000900')<>1
 or exists(select 1 from apex_internal.review_shipment_events
   where store_id=s and event_key='70000215-0000-4000-8000-000000000901')
 or (select enabled from apex_internal.private_release_gate where singleton)
    is distinct from false
 then raise exception 'Concurrent plan/dedupe or private gate invariant violated';end if;
end $verify$;
SQL
echo "PASS: two real sessions serialize at immutable order row; replay no-op, over-allocation denied"
