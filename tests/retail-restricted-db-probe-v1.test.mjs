import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyRestrictedRetailConnectionV1}
 from "../src/lib/checkout/retail-restricted-db-probe-v1.mjs";

const app="apex_retail_checkout_app";
const worker="apex_retail_checkout_executor";
function harness({wrongRole=false,roleSwitchDenied=false,sqlFailure=false}={}){
 const calls=[];
 let released=0;
 const client={
  async query(sql){
   calls.push(sql);
   if(sqlFailure&&sql==="SET LOCAL ROLE apex_retail_checkout_executor")
    throw new Error("sensitive database error or password");
   if(sql.includes("current_database()")){
    return {rows:[{
      role_name:wrongRole?"postgres":app,
      database_name:"postgres",may_set_executor:true,
      inherits_executor:false,may_update_inventory:false,
      may_read_private_orders:false,restricted_login:true,
    }]};
   }
   if(sql.includes("may_execute_restricted_reserve")){
    return {rows:[{
      role_name:roleSwitchDenied?app:worker,
      may_update_inventory:false,may_read_private_orders:false,
      may_execute_restricted_reserve:!roleSwitchDenied,
    }]};
   }
   return {rows:[]};
  },
  release(){released+=1;},
 };
 return {pool:{connect:async()=>client},calls,get released(){return released;}};
}
test("read-only connection verifier checks role identity and NOINHERIT grants",async()=>{
 const state=harness();
 const result=await verifyRestrictedRetailConnectionV1(state.pool);
 assert.deepEqual(result,{
  connected:true,database:"postgres",
  applicationRole:app,scopedRoleSwitchVerified:true,
  privateTableAccessDenied:true,orderWritesPerformed:false,
 });
 assert.equal(state.released,1);
 assert.equal(state.calls[1],"BEGIN READ ONLY");
 assert.equal(state.calls[2],"SET LOCAL ROLE apex_retail_checkout_executor");
 assert.equal(state.calls.at(-1),"ROLLBACK");
 const sql=state.calls.join("\n").toLowerCase();
 assert.doesNotMatch(sql,/^\s*(insert|update|delete|drop|create|alter|commit)\s/gm);
 assert.doesNotMatch(sql,/retail_order_engine_gate|apex_retail_db_password|secret_key/);
});
test("wrong connection identity fails before role-switch, never reads private orders",async()=>{
 const state=harness({wrongRole:true});
 await assert.rejects(verifyRestrictedRetailConnectionV1(state.pool),/Restricted checkout connection could not be verified/);
 assert.equal(state.calls.length,1);
 assert.equal(state.released,1);
});
test("worker role denied or SQL failure rolls back with secret-free error",async()=>{
 for(const variation of [{roleSwitchDenied:true},{sqlFailure:true}]){
  const state=harness(variation);
  await assert.rejects(
   verifyRestrictedRetailConnectionV1(state.pool),
   e=>e.message==="Restricted checkout connection could not be verified"&&
     !e.message.includes("password")
  );
  assert.equal(state.calls.at(-1),"ROLLBACK");
  assert.equal(state.released,1);
 }
});
test("private schema privilege checks use pg_catalog OIDs, not inaccessible schema lookup",()=>{
 const source=readFileSync("src/lib/checkout/retail-restricted-db-probe-v1.mjs","utf8");
 assert.match(source,/pg_catalog\.pg_class/);
 assert.match(source,/pg_catalog\.pg_namespace/);
 assert.match(source,/n\.nspname='apex_internal'/);
 assert.match(source,/c\.relname='retail_order_holds'/);
 // The executor has schema USAGE, so only the *first* app-login query
 // must avoid qualified private relation name resolution.
 const firstQuery=source.slice(source.indexOf("const first=await client.query"),
  source.indexOf("const initial=first.rows"));
 assert.doesNotMatch(firstQuery,/has_table_privilege\(current_user,'apex_internal\.retail_order_holds'/);
 // The login's schema USAGE stays revoked. This is a diagnostic-only
 // change; never grant private-schema access just to make a test pass.
 assert.doesNotMatch(source,/\bGRANT\s+USAGE\s+ON\s+SCHEMA\s+apex_internal/i);
});

test("production database name remains strictly pinned and fixture cannot be spoofed",async()=>{
 const original=process.env.CI;
 const originalDb=process.env.PGDATABASE;
 const role=harness();
 try{
  delete process.env.CI;
  delete process.env.PGDATABASE;
  await assert.rejects(
   verifyRestrictedRetailConnectionV1(role.pool,{expectedDatabase:"retail_test"}),
   /Restricted checkout connection could not be verified/
  );
  assert.equal(role.calls.length,0,"unexpected production fixture connection");
  const standard=harness();
  const pass=await verifyRestrictedRetailConnectionV1(standard.pool);
  assert.equal(pass.connected,true);
 }finally{
  if(original===undefined)delete process.env.CI;
  else process.env.CI=original;
  if(originalDb===undefined)delete process.env.PGDATABASE;
  else process.env.PGDATABASE=originalDb;
 }
});

test("missing pool refuses before any database operation",async()=>{
 await assert.rejects(verifyRestrictedRetailConnectionV1(null),
  /Restricted checkout connection could not be verified/);
});
test("script is operator-only and cannot accept live customer checkout submissions",()=>{
 const script=readFileSync("scripts/verify-apex-checkout-db-connection.mjs","utf8");
 const checkout=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 assert.match(script,/createRetailCheckoutServerPoolV1\(process\.env,pg\.Pool\)/);
 assert.match(script,/verifyRestrictedRetailConnectionV1/);
 assert.doesNotMatch(script,/console\.log|password\b|createInvoice|sendEmail|\.insert\(/);
 assert.match(checkout,/CHECKOUT_UNAVAILABLE/);
 assert.match(checkout,/status:503/);
});
