#!/usr/bin/env bash
set -euo pipefail
# Disposably test two genuinely concurrent workers replaying the SAME signed
# delivery. Uses the already seeded test order and review-only private writer.
call=$(cat <<'SQL'
select apex_test_internal.record_verified_btcpay_event(
 'test-store-alpha','invoice-alpha','race-sync','InvoiceSettled',
 repeat('9',64),'order-alpha',10000,'Settled','None','regtest');
SQL
)
f1="$(mktemp)"
f2="$(mktemp)"
trap 'rm -f "$f1" "$f2"' EXIT
psql -X -v ON_ERROR_STOP=1 -Atqc "$call" >"$f1" &
p1=$!
psql -X -v ON_ERROR_STOP=1 -Atqc "$call" >"$f2" &
p2=$!
wait "$p1"
wait "$p2"

results="$(cat "$f1" "$f2" | sort)"
expected="$(printf 'accepted\nduplicate')"
if [[ "$results" != "$expected" ]]; then
  echo "FAIL: duplicate concurrent delivery was not idempotent"
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -Atqc "
do \$\$
begin
  if (select count(*) from public.btcpay_test_webhook_receipts
      where btcpay_store_id='test-store-alpha' and delivery_id='race-sync')<>1 or
     (select count(*) from public.btcpay_test_invoice_observations
      where btcpay_store_id='test-store-alpha' and delivery_id='race-sync')<>1 or
     (select count(*) from public.btcpay_test_order_status_history
      where btcpay_store_id='test-store-alpha' and delivery_id='race-sync')<>1
   then raise exception 'concurrent delivery double-recorded'; end if;
  if (select status_revision from public.btcpay_test_order_status
      where invoice_id='invoice-alpha')<>6 or
     (select status from public.btcpay_test_order_status
      where invoice_id='invoice-alpha')<>'manual_review'
   then raise exception 'concurrent replay changed manual review or version'; end if;
end
\$\$;
"
echo "PASS: competing workers serialized, one accepted and one duplicate; no extra credit"
