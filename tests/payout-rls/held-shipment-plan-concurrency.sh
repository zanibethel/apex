#!/usr/bin/env bash
set -euo pipefail

psql_test() { psql -X -Atq -v ON_ERROR_STOP=1 -v VERBOSITY=verbose "$@"; }
[[ "$(psql_test -c 'select current_database()')" == apex_test ]]
[[ "$(psql_test -c "select count(*) from apex_internal.order_detail_snapshots where source_order_reference like 'SYNTH-PLAN-%'")" == 7 ]]

work="$(mktemp -d)"
cleanup() {
  if [[ -n "${first_pid:-}" ]]; then kill "$first_pid" 2>/dev/null || true; fi
  if [[ -n "${second_pid:-}" ]]; then kill "$second_pid" 2>/dev/null || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
mkfifo "$work/first.in"
store='62000000-0000-0000-0000-000000000001'
actor='00000000-0000-0000-0000-000000000002'
auth="set local role authenticated; set local \"request.jwt.claim.sub\" = '$actor';"

id() { printf '%s-0000-4000-8000-%012d' "$1" "$2"; }

create_plan() {
  local order="$1" request="$2"
  printf "select v->>'shipment_id', v->>'replayed' from public.save_supplier_held_shipment_plan_v1(
    '%s', '%s', '%s', null, null, null, jsonb_build_array(jsonb_build_object('line_id', '%s', 'quantity', 1)), null) v" \
    "$store" "$(id a2150000 "$order")" "$(id a2157000 "$request")" "$(id a2152000 "$order")"
}

transition() {
  local order="$1" request="$2" shipment="$3" state="$4" reason="$5"
  printf "select v->>'shipment_id', v->>'replayed' from public.save_supplier_held_shipment_plan_v1(
    '%s', '%s', '%s', '%s', 1, '%s', null, '%s') v" \
    "$store" "$(id a2150000 "$order")" "$(id a2157000 "$request")" "$shipment" "$state" "$reason"
}

wait_for_activity() {
  local name="$1" condition="$2"
  for _ in {1..100}; do
    if [[ "$(psql_test -c "select exists (select 1 from pg_stat_activity where application_name='$name' and $condition)")" == t ]]; then
      return
    fi
    sleep .05
  done
  cat "$work/first.log" "$work/second.log" >&2
  echo "Expected $name to reach $condition" >&2
  exit 1
}

race() {
  local first_sql="$1" second_sql="$2" expected_failure="${3:-}" isolation="${4:-}"
  : > "$work/second.log"
  PGAPPNAME=shipment_race_first psql_test < "$work/first.in" > "$work/first.log" 2>&1 &
  first_pid=$!
  exec {first_input}> "$work/first.in"
  printf 'begin;\n%s\n%s;\n' "$auth" "$first_sql" >&"$first_input"
  wait_for_activity shipment_race_first "state = 'idle in transaction' and query like 'select v%'"

  PGAPPNAME=shipment_race_second psql_test -c "begin $isolation; $auth $second_sql; commit;" > "$work/second.log" 2>&1 &
  second_pid=$!
  wait_for_activity shipment_race_second "wait_event_type = 'Lock'"
  printf 'commit;\n\\q\n' >&"$first_input"
  exec {first_input}>&-
  wait "$first_pid"
  first_pid=''
  if [[ -z "$expected_failure" ]]; then
    wait "$second_pid" || { cat "$work/second.log" >&2; exit 1; }
  else
    if wait "$second_pid"; then echo "Expected $expected_failure" >&2; exit 1; fi
    if [[ "$(<"$work/second.log")" != *"$expected_failure"* ]]; then cat "$work/second.log" >&2; exit 1; fi
  fi
  second_pid=''
}

# Different keys race for a one-unit line. The waiter sees the committed balance.
race "$(create_plan 3 1)" "$(create_plan 3 2)" 'PT409: shipment_plan_quantity_conflict'
winner="$(cut -d '|' -f 1 "$work/first.log")"
# A waiting planner can use a unit only after the cancellation releases it.
race "$(transition 3 3 "$winner" cancelled quantity_correction)" "$(create_plan 3 4)"

# Two copies of the same request return one ID and only one creation event.
race "$(create_plan 4 5)" "$(create_plan 4 5)"
replayed_id="$(cut -d '|' -f 1 "$work/first.log")"
[[ "$(cat "$work/first.log")" == "$replayed_id|false" ]]
[[ "$(cat "$work/second.log")" == "$replayed_id|true" ]]
race "$(transition 4 6 "$replayed_id" under_review review_started)" \
  "$(transition 4 7 "$replayed_id" cancelled plan_no_longer_needed)" \
  'PT409: shipment_plan_revision_conflict'

# The store-level key is unique even when requests lock different orders.
race "$(create_plan 2 8)" "$(create_plan 7 8)" 'PT409: shipment_plan_request_conflict'

# A repeatable-read transaction cannot allocate against its older snapshot.
old_plan="$(psql_test -c "begin; $auth $(create_plan 5 9); commit;" | cut -d '|' -f 1)"
psql_test -c "begin; $auth $(transition 5 10 "$old_plan" cancelled quantity_correction); commit;" >/dev/null
race "$(create_plan 5 11)" "$(create_plan 5 12)" '40001:' 'isolation level repeatable read'

[[ "$(psql_test -c "select count(*) from apex_internal.held_shipment_plan_events where shipment_id = '$replayed_id'")" == 2 ]]
[[ "$(psql_test -c "select state from apex_internal.held_shipment_plans where id = '$replayed_id'")" == under_review ]]
[[ "$(psql_test -c "select count(*) from apex_internal.held_shipment_plan_revisions where order_id = '$(id a2150000 7)'")" == 0 ]]
[[ "$(psql_test -c "select planned_quantity from apex_internal.held_shipment_plan_balance('$store', '$(id a2150000 3)')")" == 1 ]]
[[ "$(psql_test -c "select planned_quantity from apex_internal.held_shipment_plan_balance('$store', '$(id a2150000 5)')")" == 1 ]]
echo 'PASS: concurrent capacity, cancellation, exact replay, cross-order key conflict, stale revision and repeatable-read isolation'
