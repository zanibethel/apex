#!/usr/bin/env bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 <<'SQL'
insert into public.apex_admin_memberships(user_id) values ('00000000-0000-0000-0000-000000000001');
insert into public.payout_recipients(id,display_name,recipient_type) values
 ('10000000-0000-0000-0000-000000000001','Recipient One','partner'),
 ('10000000-0000-0000-0000-000000000002','Recipient Two','partner');
insert into public.payout_recipient_memberships(recipient_id,user_id) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');
insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
 values ('20000000-0000-0000-0000-000000000001','storefront','30000000-0000-0000-0000-000000000001',1,'draft',now());
insert into public.payment_allocation_snapshots(id,external_order_ref,rule_id,rule_version,gross_sats,distributable_sats)
 values ('40000000-0000-0000-0000-000000000001','test-only-order','20000000-0000-0000-0000-000000000001',1,100,100);
insert into public.payment_allocation_entries(snapshot_id,recipient_id,basis_points,amount_sats) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',6000,60),
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',4000,40);
insert into public.payout_transfer_records(snapshot_id,recipient_id,amount_sats,state) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',60,'pending'),
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',40,'pending');
SQL
query_count() {
  local user_id="$1" table="$2"
  psql -v ON_ERROR_STOP=1 -Atqc "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$user_id',true); select count(*) from public.$table; rollback;" | tail -n 1
}
expect_count() {
 local got
 got="$(query_count "$1" "$2")"
 if [[ "$got" != "$3" ]]; then echo "FAIL: $2 expected $3 rows, got $got"; exit 1; fi
 echo "PASS: $2 returns $got rows for test identity"
}
ADMIN=00000000-0000-0000-0000-000000000001
ONE=00000000-0000-0000-0000-000000000002
TWO=00000000-0000-0000-0000-000000000003
expect_count "$ADMIN" payment_allocation_entries 2
expect_count "$ADMIN" payout_transfer_records 2
expect_count "$ADMIN" payment_allocation_snapshots 1
expect_count "$ONE" payout_recipients 1
expect_count "$ONE" payment_allocation_entries 1
expect_count "$ONE" payout_transfer_records 1
expect_count "$ONE" payment_allocation_snapshots 0
expect_count "$ONE" payout_rules 0
expect_count "$TWO" payment_allocation_entries 1
expect_count "$TWO" payout_transfer_records 1
# Confirm no browser mutations are possible even when logged in.
if psql -v ON_ERROR_STOP=1 -Atqc "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$ONE',true); update public.payout_recipients set display_name='tamper'; rollback;" >/dev/null 2>&1; then
 echo "FAIL: authenticated role unexpectedly permitted UPDATE"; exit 1
fi
echo "PASS: authenticated UPDATE denied"
