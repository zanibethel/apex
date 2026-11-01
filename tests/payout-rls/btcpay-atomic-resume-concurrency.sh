#!/usr/bin/env bash
# PR #124. Two actual PostgreSQL sessions. Disposable regtest journal only.
# Step 1: a second admin approval holds the storefront lock; an invoice
# writer must WAIT and then reject because no operator permit exists.
# Step 2: after operator permit, two simultaneous writers compete. Exactly
# one succeeds; the other waits, then rejects after atomic consumption.
set -euo pipefail

a_log="$(mktemp)"
b_log="$(mktemp)"
trap 'rm -f "$a_log" "$b_log"' EXIT
scope="37000000-0000-0000-0000-000000000003"

PGAPPNAME=apex_resume_cosign_a psql -X -q -v ON_ERROR_STOP=1 >"$a_log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',
 '{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.approve_btcpay_test_checkout_release(
 (select id from public.btcpay_test_release_requests
  where scope_id='37000000-0000-0000-0000-000000000003'));
select pg_sleep(7);
commit;
SQL
a=$!

ready=0
for _ in $(seq 1 100); do
 n="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='apex_resume_cosign_a' and state='active' and query like '%pg_sleep(7)%'")"
 if [[ "$n" == "1" ]]; then ready=1; break; fi
 sleep 0.1
done
if [[ "$ready" != "1" ]]; then
 echo "Second administrator did not acquire the shared lock"
 cat "$a_log"
 wait "$a" || true
 exit 1
fi

PGAPPNAME=apex_resume_before_permit_b psql -X -q -v ON_ERROR_STOP=1 >"$b_log" 2>&1 <<'SQL' &
insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network)
values('37000000-0000-0000-0000-000000000003',
 'racing-regtest','pre-permit-race','pre-permit-order',1000,'regtest');
SQL
b=$!
blocked=0
for _ in $(seq 1 60); do
 n="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='apex_resume_before_permit_b' and wait_event_type='Lock'")"
 if [[ "$n" == "1" ]]; then blocked=1; break; fi
 sleep 0.1
done
if [[ "$blocked" != "1" ]]; then
 echo "Pre-permit invoice writer did not wait for administrator lock"
 cat "$a_log" "$b_log"
 wait "$a" || true
 wait "$b" || true
 exit 1
fi
wait "$a"
if wait "$b"; then
 echo "Invoice race bypassed the missing operator permit"
 exit 1
fi
if ! grep -q "Storefront on split-sync hold" "$b_log"; then
 echo "Expected the held-store error after cosign, not a different failure"
 cat "$b_log"
 exit 1
fi

# A second verified admin cosign is NECESSARY but NOT SUFFICIENT.
# Privileged synthetic operator issues one disposable journal-only permit.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
select apex_test_internal.open_btcpay_test_checkout_resume(
 '37000000-0000-0000-0000-000000000003');
SQL

: > "$a_log"
: > "$b_log"
PGAPPNAME=apex_resume_one_shot_writer_a psql -X -q -v ON_ERROR_STOP=1 >"$a_log" 2>&1 <<'SQL' &
begin;
insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network)
values('37000000-0000-0000-0000-000000000003',
 'racing-regtest','one-shot-winner','one-shot-winner-order',1000,'regtest');
select pg_sleep(7);
commit;
SQL
a=$!
ready=0
for _ in $(seq 1 100); do
 n="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='apex_resume_one_shot_writer_a' and state='active' and query like '%pg_sleep(7)%'")"
 if [[ "$n" == "1" ]]; then ready=1; break; fi
 sleep 0.1
done
if [[ "$ready" != "1" ]]; then
 echo "First writer never acquired the one-shot permit"
 cat "$a_log"
 wait "$a" || true
 exit 1
fi

PGAPPNAME=apex_resume_loser_writer_b psql -X -q -v ON_ERROR_STOP=1 >"$b_log" 2>&1 <<'SQL' &
insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network)
values('37000000-0000-0000-0000-000000000003',
 'racing-regtest','one-shot-loser','one-shot-loser-order',1000,'regtest');
SQL
b=$!
blocked=0
for _ in $(seq 1 60); do
 n="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='apex_resume_loser_writer_b' and wait_event_type='Lock'")"
 if [[ "$n" == "1" ]]; then blocked=1; break; fi
 sleep 0.1
done
if [[ "$blocked" != "1" ]]; then
 echo "Second writer did not wait for the shared transaction lock"
 cat "$a_log" "$b_log"
 wait "$a" || true
 wait "$b" || true
 exit 1
fi
wait "$a"
if wait "$b"; then
 echo "Two simultaneous writers registered test invoices with one permit"
 exit 1
fi
if ! grep -q "Storefront on split-sync hold" "$b_log"; then
 echo "Loser failed for unexpected reason"
 cat "$b_log"
 exit 1
fi

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare blocked boolean:=false;
begin
 if (select count(*) from public.btcpay_test_invoices
    where apex_store_id='37000000-0000-0000-0000-000000000003')<>1 or
   not exists(select 1 from public.btcpay_test_invoices
     where invoice_id='one-shot-winner') or
   exists(select 1 from public.btcpay_test_invoices
     where invoice_id in('pre-permit-race','one-shot-loser')) then
     raise exception 'Concurrency did not preserve exactly one successful insert';
 end if;
 if (select status from public.btcpay_test_checkout_resume_permits
     where scope_id='37000000-0000-0000-0000-000000000003')<>'consumed' then
    raise exception 'One-shot permission not irrevocably consumed'; end if;
 if not exists(select 1 from public.btcpay_test_split_sync_holds
   where scope_id='37000000-0000-0000-0000-000000000003' and status='held')
 then raise exception 'Immutable sync hold was removed'; end if;
 begin
   perform apex_test_internal.open_btcpay_test_checkout_resume(
     '37000000-0000-0000-0000-000000000003');
 exception when sqlstate '55000' then blocked:=true; end;
 if not blocked then raise exception 'Existing consumed permit was reopened'; end if;
end $$;
SQL
echo "PASS: competing administrator/write and one-permit/two-writer races fail closed"
