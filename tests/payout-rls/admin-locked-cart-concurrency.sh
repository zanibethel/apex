#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL only. An editor holds an inventory row UPDATE lock;
# the admin admission recheck MUST refuse to use an unlocked stale snapshot.
holder_log="$(mktemp)"
preflight_log="$(mktemp)"
holder_pid=""
cleanup(){
 if [[ -n "$holder_pid" ]];then kill "$holder_pid" 2>/dev/null || true;wait "$holder_pid" 2>/dev/null || true;fi
 rm -f "$holder_log" "$preflight_log"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 -At >"$holder_log" 2>&1 <<'SQL' &
begin;
select product_id from public.inventory_items
 where store_id='62000000-0000-0000-0000-000000000001'
 and product_id='64000000-0000-0000-0000-000000000001'
 for update;
select pg_sleep(4);
rollback;
SQL
holder_pid=$!
sleep 1
if ! kill -0 "$holder_pid" 2>/dev/null;then cat "$holder_log";exit 1;fi

if psql -X -v ON_ERROR_STOP=1 -At >"$preflight_log" 2>&1 <<'SQL'
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
set local "request.jwt.claims"='{"app_metadata":{"apex_role":"platform_admin"}}';
select public.get_admin_locked_cart_preflight(
 '62000000-0000-0000-0000-000000000001',
 '[{"product_id":"64000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
 5000);
rollback;
SQL
then
 echo "FAIL: locked preflight read through an outstanding inventory UPDATE lock";exit 1
fi
if ! grep -qi 'could not obtain lock on row' "$preflight_log";then
 echo "FAIL: unexpected preflight failure (not a row-lock conflict)"
 cat "$preflight_log"
 exit 1
fi
wait "$holder_pid"
holder_pid=""
echo "PASS: outstanding inventory writer blocks locked preflight without payment"
