import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRetailPostgresAdmissionDependenciesV1}
 from "../src/lib/checkout/retail-postgres-admission-dependencies-v1.mjs";

const USER="f1c93598-ed11-470e-aa1a-0c497644a980";
const STORE="10000000-0000-4000-8000-000000000001";
const PROD="50000000-0000-4000-8000-000000000001";
const OP="nonpayable_retail_order_v1";
const items=[{product_id:PROD,quantity:1}];
function stub({deny=false,badScope=false,fail="",badRows=false}={}){
 const calls=[];
 let released=0,connects=0;
 const client={
  async query(sql,params){
   calls.push({sql,params});
   if(fail&&sql.includes(fail))throw new Error("secret SQL error with buyer data");
   if(sql.includes("consume_retail_budget"))
    return {rows:badRows?[]:[{payload:!deny}]};
   if(sql.includes("resolve_retail_store"))
    return {rows:badRows?[]:[{payload:badScope?
      {verified:false}:{verified:true,storeId:STORE}}]};
   return {rows:[]};
  },
  release(){released++;},
 };
 return {pool:{async connect(){connects++;return client;}},calls,
  get released(){return released;},get connects(){return connects;}};
}
test("durable rate limit executes only scoped SQL with explicit transaction",async()=>{
 const db=stub();
 const guards=createRetailPostgresAdmissionDependenciesV1({pool:db.pool});
 const b=await guards.consumeDurableAdmissionBudget({subjectId:USER,operation:OP});
 assert.deepEqual(b,{allowed:true,durable:true});
 assert.equal(Object.isFrozen(b),true);
 assert.deepEqual(db.calls.map(v=>v.sql),[
  "BEGIN","SET LOCAL ROLE apex_retail_checkout_executor",
  "SET LOCAL statement_timeout = '6s'",
  "SET LOCAL lock_timeout = '2s'",
  "SET LOCAL idle_in_transaction_session_timeout = '6s'",
  "select apex_internal.checkout_worker_consume_retail_budget_v1($1::uuid,$2::text) as payload",
  "COMMIT",
 ]);
 assert.deepEqual(db.calls[5].params,[USER,OP]);
 assert.equal(db.connects,1);
 assert.equal(db.released,1);
});
test("approved source lookup is read-only and DB-resolved",async()=>{
 const db=stub();
 const guards=createRetailPostgresAdmissionDependenciesV1({pool:db.pool});
 const resolved=await guards.resolveTrustedRetailStore({subjectId:USER,items});
 assert.deepEqual(resolved,{verified:true,storeId:STORE});
 assert.deepEqual(db.calls.map(v=>v.sql),[
  "BEGIN READ ONLY","SET LOCAL ROLE apex_retail_checkout_executor",
  "SET LOCAL statement_timeout = '6s'",
  "SET LOCAL lock_timeout = '2s'",
  "SET LOCAL idle_in_transaction_session_timeout = '6s'",
  "select apex_internal.checkout_worker_resolve_retail_store_v1($1::jsonb) as payload",
  "COMMIT",
 ]);
 assert.deepEqual(db.calls[5].params,[JSON.stringify(items)]);
 assert.equal(db.released,1);
});
test("rate limit denial and unverified store are never promoted to verified",async()=>{
 const db=stub({deny:true,badScope:true});
 const guards=createRetailPostgresAdmissionDependenciesV1({pool:db.pool});
 assert.deepEqual(await guards.consumeDurableAdmissionBudget({
  subjectId:USER,operation:OP,
 }),{allowed:false,durable:true});
 assert.deepEqual(await guards.resolveTrustedRetailStore({
  subjectId:USER,items,
 }),{verified:false});
 assert.equal(db.released,2);
});
test("invalid subjects, operation, and invalid/multi-line carts fail before SQL",async()=>{
 const db=stub();
 const guards=createRetailPostgresAdmissionDependenciesV1({pool:db.pool});
 for(const data of [
  {subjectId:"attacker",operation:OP},
  {subjectId:USER,operation:"other"},
  {subjectId:null,operation:OP},
 ]){
  await assert.rejects(guards.consumeDurableAdmissionBudget(data),
   /Retail admission dependency unavailable/);
 }
 for(const selection of [
  null,[],Array.from({length:9},()=>items[0]),
  [items[0],items[0]],
  [{product_id:PROD,quantity:11}],
  [{product_id:PROD,quantity:1,storeId:STORE}],
  [{product_id:PROD,quantity:0}],
 ]){
  await assert.rejects(guards.resolveTrustedRetailStore({
   subjectId:USER,items:selection,
  }),/Retail admission dependency unavailable/);
 }
 assert.equal(db.connects,0);
});
test("DB failures and malformed results fail closed with a rollback and no private errors",async()=>{
 for(const params of [
  {fail:"resolve_retail_store"},
  {fail:"SET LOCAL ROLE"},
  {badRows:true},
 ]){
  const db=stub(params);
  const guards=createRetailPostgresAdmissionDependenciesV1({pool:db.pool});
  await assert.rejects(
   guards.resolveTrustedRetailStore({subjectId:USER,items}),
   error=>error.message==="Retail admission dependency unavailable"&&
    !error.message.includes("buyer")&&!error.message.includes("secret")
  );
  assert.equal(db.calls.at(-1).sql,"ROLLBACK");
  assert.equal(db.connects,1);
  assert.equal(db.released,1);
 }
});
test("nonpayable SQL migration never exposes private guard functions to API roles",()=>{
 const sql=readFileSync(
  "supabase/migrations/20261114074500_apex_private_retail_admission_guards.sql","utf8");
 const route=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 assert.match(sql,/on conflict\(subject_id\) do update/);
 assert.match(sql,/attempts<10/);
 assert.match(sql,/security definer/);
 assert.match(sql,/set search_path=pg_catalog/);
 assert.match(sql,/grant execute on function apex_internal.checkout_worker_consume_retail_budget_v1/);
 assert.match(sql,/grant execute on function apex_internal.checkout_worker_resolve_retail_store_v1/);
 assert.match(sql,/to apex_retail_checkout_executor/);
 assert.doesNotMatch(sql,/grant\s+(?:select|insert|update|delete)\s+on\s+(?:table\s+)?apex_internal\.retail_admission_budgets_v1\s+to\s+(anon|authenticated|service_role|apex_retail_checkout_app)/i);
 assert.doesNotMatch(sql,/update\s+apex_internal\.retail_order_engine_gate\s+set\s+enabled\s*=\s*true/i);
 assert.match(route,/code:"CHECKOUT_UNAVAILABLE"/);
 assert.match(route,/status:503/);
 assert.doesNotMatch(route,/admitPrivateNonpayableRetailOrderV1|request\.text\(/);
});
