import test from "node:test";
import assert from "node:assert/strict";
import {runRestrictedRetailDiagnosticStagesV1}
 from "../src/lib/checkout/retail-db-diagnostic-stages-v1.mjs";
const good={
 connected:true,scopedRoleSwitchVerified:true,
 privateTableAccessDenied:true,orderWritesPerformed:false,
};
function sample({configFail=false,connectFail=false,pingFail=false,permissionFail=false,cleanupFail=false}={}){
 const calls=[];
 const pool={
  async connect(){
   calls.push("connect");
   if(connectFail)throw new Error("db secret that must never appear");
   return {
    async query(sql){
     calls.push(sql);
     if(pingFail)throw new Error("private TLS error");
     return {rows:[{reachable:1}]};
    },
    release(){calls.push("release");},
   };
  },
  async end(){
   calls.push("end");
   if(cleanupFail)throw new Error("private cleanup error");
  },
 };
 const create=async()=>{
  calls.push("create");
  if(configFail)throw new Error("private secret invalid");
  return pool;
 };
 const verify=async()=>{
  calls.push("verify");
  if(permissionFail)throw new Error("private role error");
  return good;
 };
 return {create,verify,calls};
}
test("successful real-client stages always ping read-only, check roles and clean up",async()=>{
 const v=sample();
 const r=await runRestrictedRetailDiagnosticStagesV1(v.create,v.verify);
 assert.deepEqual(r,{verified:true,stage:"connection_verified"});
 assert.deepEqual(v.calls,["create","connect","SELECT 1 AS reachable","release","verify","end"]);
 assert.equal(Object.isFrozen(r),true);
});
test("invalid settings stop before opening any connection without secret leaks",async()=>{
 const v=sample({configFail:true});
 const r=await runRestrictedRetailDiagnosticStagesV1(v.create,v.verify);
 assert.deepEqual(r,{verified:false,stage:"configuration"});
 assert.deepEqual(v.calls,["create"]);
});
test("failed network/TLS/auth reports only the connection stage, closes pool",async()=>{
 for(const option of [{connectFail:true},{pingFail:true}]){
  const v=sample(option);
  const r=await runRestrictedRetailDiagnosticStagesV1(v.create,v.verify);
  assert.deepEqual(r,{verified:false,stage:"postgres_connection"});
  assert.equal(v.calls.includes("verify"),false);
  assert.equal(v.calls.at(-1),"end");
  assert.ok(!JSON.stringify(r).includes("secret"));
  assert.ok(!JSON.stringify(r).includes("TLS"));
 }
});
test("role failure is distinguished from successful authentication and no write happens",async()=>{
 const v=sample({permissionFail:true});
 const r=await runRestrictedRetailDiagnosticStagesV1(v.create,v.verify);
 assert.deepEqual(r,{verified:false,stage:"permission_checks"});
 assert.equal(v.calls.includes("verify"),true);
 assert.equal(v.calls.at(-1),"end");
});
test("cleanup failure cannot claim a successful connection check",async()=>{
 const v=sample({cleanupFail:true});
 const r=await runRestrictedRetailDiagnosticStagesV1(v.create,v.verify);
 assert.deepEqual(r,{verified:false,stage:"pool_cleanup"});
});
test("failed permission response never reports verification success",async()=>{
 const v=sample();
 const r=await runRestrictedRetailDiagnosticStagesV1(v.create,async()=>({
  ...good,privateTableAccessDenied:false,
 }));
 assert.deepEqual(r,{verified:false,stage:"permission_checks"});
});
