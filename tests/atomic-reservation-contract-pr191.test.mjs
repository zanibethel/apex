import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const fixture=read("database/sql/apex_order_reservation_contract_REVIEW_ONLY.sql");
const tests=read("tests/payout-rls/atomic-order-reservation-contract.sql");
const concurrency=read("tests/payout-rls/atomic-order-reservation-concurrency.sh");
const workflow=read(".github/workflows/payout-rls.yml");
test("reservation engine is restricted to disposable PostgreSQL and synthetic fixtures",()=>{
 assert.match(fixture,/current_database\(\)<>'apex_test'/);
 assert.match(fixture,/create schema apex_test_reservation/);
 assert.match(fixture,/revoke all on schema apex_test_reservation/);
 assert.match(fixture,/revoke all on all tables in schema apex_test_reservation/);
 assert.match(fixture,/security invoker/);
 assert.doesNotMatch(fixture,/\b(?:update|insert into|delete from)\s+public\.|\b(?:update|insert into|delete from)\s+apex_internal\./i);
 assert.doesNotMatch(fixture,/fetch\(|https?:\/\/|btcpay\.store\.cancreateinvoice/i);
});
test("atomic fixture checks trusted provider quote references, totals, stock, and replay",()=>{
 assert.match(fixture,/pg_advisory_xact_lock/);
 assert.match(fixture,/unique\(store_id,idempotency_hash\)/);
 assert.match(fixture,/sha256\(convert_to\(v_canonical::text,'UTF8'\)\)/);
 assert.match(fixture,/for update/);
 assert.match(fixture,/v_inventory\.on_hand-v_inventory\.reserved<v_quantity/);
 assert.match(fixture,/v_shipping\.amount_cents\+v_tax\.amount_cents/);
 assert.match(fixture,/v_total<>p_expected_total_cents/);
 assert.match(fixture,/v_shipping\.approved|s\.approved/);
 assert.match(fixture,/v_tax\.approved|t\.approved/);
 assert.match(fixture,/s\.expires_at>now\(\)/);
 assert.match(fixture,/t\.expires_at>now\(\)/);
 assert.match(fixture,/v_existing\.canonical_items<>v_canonical/);
 assert.match(fixture,/set reserved=reserved\+v_quantity/);
 assert.match(fixture,/state','held_fixture_only'/);
 assert.match(fixture,/invoice_created',false/);
 assert.match(fixture,/can_pay',false/);
 assert.match(fixture,/apex_test_reservation\.orders/);
 assert.match(fixture,/apex_test_reservation\.order_lines/);
});
test("isolated SQL and parallel tests cover duplicates, stale quotes/prices, oversell and no real writes",()=>{
 for(const evidence of [
  "Idempotent replay duplicated stock or orders",
  "Replay with changed total accepted",
  "Stale browser total accepted",
  "Unapproved shipping quote accepted",
  "Expired tax quote accepted",
  "Wrong destination region accepted",
  "Cross-store quote accepted",
  "Changed saved price was ignored",
  "Insufficient-stock reservation accepted",
  "Rejected request left partial state",
  "Synthetic reservation wrote real immutable order journal",
 ])assert.ok(tests.includes(evidence),evidence);
 assert.match(concurrency,/two different requests|Two different requests/i);
 assert.match(concurrency,/same-key retries/i);
 assert.match(concurrency,/"1:1"/);
 assert.match(concurrency,/"2:1"/);
 assert.match(concurrency,/test "\$live_journal" = "0:0"/);
 assert.match(workflow,/apex_order_reservation_contract_REVIEW_ONLY\.sql/);
 assert.match(workflow,/atomic-order-reservation-contract\.sql/);
 assert.match(workflow,/atomic-order-reservation-concurrency\.sh/);
});
