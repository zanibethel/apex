#!/usr/bin/env bash
# Issue #216: isolated two-session audit-only annotation race.
set -euo pipefail
test "$(psql -X -At -v ON_ERROR_STOP=1 -c 'select current_database()')" = "apex_test"
store="62000000-0000-0000-0000-000000000001"
actor="00000000-0000-0000-0000-000000000002"
order="$(psql -X -At -v ON_ERROR_STOP=1 -c "select id from apex_internal.order_detail_snapshots where store_id='$store' and sale_id='65000614-0000-4000-8000-000000000001'")"
test -n "$order"
oldrole="$(psql -X -At -v ON_ERROR_STOP=1 -c "select m.role from public.supplier_memberships m join public.stores s on s.supplier_id=m.supplier_id where s.id='$store' and m.user_id='$actor'")"
case "$oldrole" in owner|manager|staff) ;; *) exit 1;; esac
dir="$(mktemp -d)"
cleanup(){
 psql -X -v ON_ERROR_STOP=1 -c "update public.supplier_memberships m set role='$oldrole' from public.stores s where s.supplier_id=m.supplier_id and s.id='$store' and m.user_id='$actor'" >/dev/null || true
 rm -rf "$dir"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -c "update public.supplier_memberships m set role='manager' from public.stores s where s.supplier_id=m.supplier_id and s.id='$store' and m.user_id='$actor'" >/dev/null
payload="$(printf '[{"order_id":"%s","row_kind":"order_line","line_number":1,"shipment_id":null,"source_revision":0,"review_version":0,"review_state":"reviewed","review_note":"Concurrent synthetic review"}]' "$order")"
first="72000216-0000-4000-8000-000000000980"
second="72000216-0000-4000-8000-000000000981"
third="72000216-0000-4000-8000-000000000982"
psql -X -At -v ON_ERROR_STOP=1 >"$dir/a" 2>&1 <<SQL &
begin;
select id from public.stores where id='$store' for update;
select pg_sleep(3);
set local role authenticated;
select set_config('request.jwt.claim.sub','$actor',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
select public.apply_supplier_cumulative_review_annotations('$store','$first','$payload'::jsonb);
commit;
SQL
pid_a=$!
sleep 0.3
psql -X -At -v ON_ERROR_STOP=1 >"$dir/b" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$actor',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
select public.apply_supplier_cumulative_review_annotations('$store','$second','$payload'::jsonb);
commit;
SQL
pid_b=$!
observed=0
for _ in {1..16};do
 count="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%apply_supplier_cumulative_review_annotations%'")"
 if [[ "$count" =~ ^[0-9]+$ && "$count" -gt 0 ]];then observed=1;break;fi
 sleep 0.1
done
wait "$pid_a"
wait "$pid_b"
if [[ "$observed" -ne 1 ]] ||
 ! grep -q '"updated": 1' "$dir/a" ||
 ! grep -q '"already_recorded": 1' "$dir/b";then
 echo "Two-session serialization or idempotence failed" >&2
 cat "$dir/a" "$dir/b" >&2;exit 1
fi
conflict="$(printf '[{"order_id":"%s","row_kind":"order_line","line_number":1,"shipment_id":null,"source_revision":0,"review_version":0,"review_state":"needs_attention","review_note":"Changed offline value"}]' "$order")"
if psql -X -At -v ON_ERROR_STOP=1 >"$dir/c" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','$actor',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
select public.apply_supplier_cumulative_review_annotations('$store','$third','$conflict'::jsonb);
commit;
SQL
then echo "Stale conflicting review import was accepted" >&2;exit 1;fi
if ! grep -q 'Stale review annotation version' "$dir/c";then
 cat "$dir/c" >&2;exit 1
fi
counts="$(psql -X -At -v ON_ERROR_STOP=1 -c "
select (select count(*) from apex_internal.supplier_review_annotations where store_id='$store' and order_id='$order')::text
||'|'||(select count(*) from apex_internal.supplier_review_annotation_audit where store_id='$store' and order_id='$order')::text
||'|'||(select count(*) from apex_internal.supplier_review_upload_receipts where store_id='$store')::text
||'|'||(select review_version from apex_internal.supplier_review_annotations where store_id='$store' and row_key='$order:line:1')::text
||'|'||(select enabled from apex_internal.private_release_gate where singleton)::text")"
if [[ "$counts" != "1|1|2|1|false" ]];then
 echo "Audit or import receipts mismatched: $counts" >&2;exit 1
fi
echo "PASS: two real sessions, one review note, one audit, stale conflict rejected"
