import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
test("hosted private order foundation remains held-only, immutable and RLS-protected",()=>{
 const sql=read("supabase/migrations/20261104235408_apex_private_order_detail_foundation.sql");
 assert.match(sql,/record_status text not null default 'held_unverified'/);
 assert.match(sql,/payment_authorized boolean not null default false/);
 assert.match(sql,/fulfillment_authorized boolean not null default false/);
 assert.match(sql,/shipping_authorized boolean not null default false/);
 assert.match(sql,/force row level security/g);
 assert.match(sql,/revoke all on apex_internal\.order_detail_snapshots/);
 assert.match(sql,/deny_order_detail_mutation/);
 assert.match(sql,/join public\.supplier_memberships m/);
 assert.match(sql,/m\.user_id=v_uid/);
 assert.doesNotMatch(sql,/grant (insert|update|delete) on apex_internal\.order_detail/i);
});
test("migration filename matches the applied Supabase history version",()=>{
 const ci=read(".github/workflows/payout-rls.yml");
 assert.match(ci,/supabase\/migrations\/20261104235408_apex_private_order_detail_foundation\.sql/);
 assert.match(ci,/tests\/payout-rls\/private-order-detail-foundation\.sql/);
 assert.doesNotMatch(ci,/20261104140000_apex_private_order_detail_foundation\.sql/);
});
test("isolated original-order fixture rolls back and cannot run in production",()=>{
 const fixture=read("tests/payout-rls/private-order-detail-foundation.sql");
 assert.match(fixture,/current_database\(\)<>'apex_test'/);
 assert.match(fixture,/Cross-store order line accepted/);
 assert.match(fixture,/Unrelated supplier saw private order counts/);
 assert.match(fixture,/rollback;/);
});
