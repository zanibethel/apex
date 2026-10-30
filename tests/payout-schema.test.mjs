import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261030222500_payout_reporting_readonly.sql",import.meta.url),"utf8");
test("every new public table enables RLS",()=>{
 const tables=[...sql.matchAll(/create table public\.(\w+)/g)].map(x=>x[1]);
 assert.equal(tables.length,8);
 for(const table of tables) assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security"));
});
test("recipient allocations and transfers are scoped to memberships",()=>{
 assert.match(sql,/allocation_entries_scoped_read/);
 assert.match(sql,/transfer_records_scoped_read/);
 assert.match(sql,/m\.recipient_id=payment_allocation_entries\.recipient_id/);
 assert.match(sql,/m\.recipient_id=payout_transfer_records\.recipient_id/);
});
test("no browser write permissions or automatic activation",()=>{
 assert.doesNotMatch(sql,/grant\s+(insert|update|delete|all)\s+on[\s\S]*to authenticated/i);
 assert.doesNotMatch(sql,/create policy\s+\w+\s+on[\s\S]*for (insert|update|delete|all)/i);
});
