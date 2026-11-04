#!/usr/bin/env bash
# Disposable CI-only PostgreSQL concurrency proof. No real customer records.
set -euo pipefail
if [[ "${PGDATABASE:-}" != "apex_test" ]]; then
  echo 'Refusing order race test outside disposable apex_test' >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -f tests/payout-rls/atomic-held-order-race-setup.sql >/dev/null
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
# Connection A inserts and retains its source row lock while sleeping.
PGAPPNAME=apex_order_race_a psql -X -At -v ON_ERROR_STOP=1 >"$tmpdir/a.log" 2>&1 <<'SQL' &
begin;
select apex_internal.ci_only_held_order_race()->>'status';
select pg_sleep(8);
commit;
SQL
pid_a=$!

# Wait until A has actually inserted its order and reached pg_sleep.
observed_a=0
for _ in $(seq 1 65); do
  state="$(psql -X -At -v ON_ERROR_STOP=1 -c \
    "select count(*) from pg_stat_activity where application_name='apex_order_race_a' and state='active' and query like '%pg_sleep(8)%'")"
  if [[ "$state" == "1" ]]; then observed_a=1; break; fi
  if ! kill -0 "$pid_a" 2>/dev/null; then break; fi
  sleep 0.15
done
if [[ "$observed_a" != "1" ]]; then
  cat "$tmpdir/a.log" >&2
  echo 'First order writer did not reach lock-holding window' >&2
  wait "$pid_a" || true
  exit 1
fi

# Concurrent connection B must block on the locked source sale until A commits.
PGAPPNAME=apex_order_race_b psql -X -At -v ON_ERROR_STOP=1 >"$tmpdir/b.log" 2>&1 <<'SQL' &
select apex_internal.ci_only_held_order_race()->>'status';
SQL
pid_b=$!
blocked=0
for _ in $(seq 1 65); do
  waiting="$(psql -X -At -v ON_ERROR_STOP=1 -c \
    "select count(*) from pg_stat_activity where application_name='apex_order_race_b' and wait_event_type='Lock'")"
  if [[ "$waiting" == "1" ]]; then blocked=1; break; fi
  if ! kill -0 "$pid_b" 2>/dev/null; then break; fi
  sleep 0.15
done
if [[ "$blocked" != "1" ]]; then
  cat "$tmpdir/a.log" "$tmpdir/b.log" >&2
  echo 'Concurrent writer did not block on existing source sale' >&2
  wait "$pid_a" || true
  wait "$pid_b" || true
  exit 1
fi
wait "$pid_a"
wait "$pid_b"
grep -qx 'new' "$tmpdir/a.log"
grep -qx 'identical_replay' "$tmpdir/b.log"

check="$(psql -X -At -v ON_ERROR_STOP=1 <<'SQL'
select
 (select count(*) from apex_internal.order_detail_snapshots
   where sale_id='65000414-0000-4000-8000-000000000001')::text||':'||
 (select count(*) from apex_internal.order_line_snapshots
   where order_id=(select id from apex_internal.order_detail_snapshots
    where sale_id='65000414-0000-4000-8000-000000000001'))::text||':'||
 (select count(*) from apex_internal.order_delivery_envelopes
   where order_id=(select id from apex_internal.order_detail_snapshots
    where sale_id='65000414-0000-4000-8000-000000000001'))::text||':'||
 (select count(*) from apex_internal.held_order_intake_accounting
   where order_id=(select id from apex_internal.order_detail_snapshots
    where sale_id='65000414-0000-4000-8000-000000000001'))::text||':'||
 (select count(*) from apex_internal.held_order_intake_audit
   where order_id=(select id from apex_internal.order_detail_snapshots
    where sale_id='65000414-0000-4000-8000-000000000001'))::text;
SQL
)"
if [[ "$check" != '1:2:1:1:1' ]]; then
  echo "Unexpected concurrent snapshot cardinalities: $check" >&2
  exit 1
fi
echo 'PASS: two concurrent trusted test calls serialize into one held order and one audit event'
