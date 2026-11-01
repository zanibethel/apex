#!/usr/bin/env bash
set -euo pipefail
# Disposable CI: two concurrent admins review two different versions, one scope.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into public.stores(id,supplier_id,slug,display_name,is_public)
 select '33000000-0000-0000-0000-000000000002',s.id,
 'test-activation-race','Activation race fixture',false
 from public.suppliers s where slug='test-supplier';
insert into public.payout_rules(id,scope_type,scope_id,version,status,effective_from)
values
 ('23000000-0000-0000-0000-000000000001','storefront',
  '33000000-0000-0000-0000-000000000002',1,'draft',now()),
 ('23000000-0000-0000-0000-000000000002','storefront',
  '33000000-0000-0000-0000-000000000002',2,'draft',now());
insert into public.payout_rule_allocations(rule_id,recipient_id,basis_points)
values
 ('23000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',9000),
 ('23000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',1000),
 ('23000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',8500),
 ('23000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',1500);
SQL
f1="$(mktemp)"
f2="$(mktemp)"
trap 'rm -f "$f1" "$f2"' EXIT
review() {
  local version="$1"
  psql -X -q -v ON_ERROR_STOP=1 -At <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"app_metadata":{"apex_role":"platform_admin"}}',true);
select public.review_btcpay_test_split_activation(
 '23000000-0000-0000-0000-00000000000${version}');
commit;
SQL
}
review 1 >"$f1" & a=$!
review 2 >"$f2" & b=$!
wait "$a"
wait "$b"
got="$(cat "$f1" "$f2" | grep -E '^(approved_pending_manual_sync|blocked)$' | sort)"
want="$(printf 'approved_pending_manual_sync\nblocked' | sort)"
if [[ "$got" != "$want" ]]; then
 echo "FAIL: concurrent reviews did not produce one eligible and one blocked"; exit 1
fi
psql -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
do $$
begin
 if (select count(*) from public.btcpay_test_split_activation_reviews
     where scope_id='33000000-0000-0000-0000-000000000002'
       and status='approved_pending_manual_sync')<>1
 then raise exception 'Concurrent reviews approved two versions'; end if;
 if (select count(*) from public.btcpay_test_split_activation_reviews
     where scope_id='33000000-0000-0000-0000-000000000002')<>2
 then raise exception 'Review audit count incorrect'; end if;
 if (select count(*) from public.payout_rules
     where scope_id='33000000-0000-0000-0000-000000000002'
       and status<>'draft')<>0
 then raise exception 'Review unexpectedly made rules active'; end if;
end $$;
SQL
echo "PASS: one eligible review and one blocked, no live activation"
