import test from "node:test";
import assert from "node:assert/strict";
import {inspectSharedBtcpayReadinessV1} from "../src/lib/btcpay/shared-store-readiness-v1.mjs";

const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const other="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d4";
const binding=(id=store,keyEnv="APEX_BTCPAY_KEY_READ_ONLY")=>
 JSON.stringify([{apexStoreId:id,providerStoreId:"ProviderOne",
  providerUrl:"https://btcpay.example.org",keyEnv}]);
const recipients=[
 {display_name:"Apex Platform",recipient_type:"platform",status:"inactive"},
 {display_name:"Lily",recipient_type:"supplier",status:"inactive"},
 {display_name:"Tierra",recipient_type:"supplier",status:"inactive"},
];
const env={APEX_BTCPAY_KEY_READ_ONLY:"read-private-credential-A",
 APEX_BTCPAY_KEY_INVOICE_WRITER:"write-private-credential-B"};
test("without hosting, reports no binding and refuses every money operation",async()=>{
 const r=await inspectSharedBtcpayReadinessV1({apexStoreIds:[store],recipients,env:{}});
 assert.equal(r.storeStatus,"no_bindings");
 assert.equal(r.recipientStatus,"inactive_recipients");
 for(const k of ["canCreateInvoice","canExecutePayout","canReleaseCheckout","canShip","productionReady"])
  assert.equal(r[k],false);
 assert.equal(r.confirmedWalletCount,0);
});
test("single store-only binding reads expected USD Greenfield identity",async()=>{
 const calls=[];
 const r=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:[store],recipients,env,rawBindings:binding(),
  fetchImpl:async (url,opts)=>{
   calls.push([url,opts.method,opts.headers.Authorization]);
   return {status:200,ok:true,text:async()=>JSON.stringify({
    id:"ProviderOne",name:"Apex Anabolics",defaultCurrency:"USD"})};
  },
 });
 assert.equal(r.storeStatus,"store_verified");
 assert.equal(r.providerName,"Apex Anabolics");
 assert.deepEqual(calls,[["https://btcpay.example.org/api/v1/stores/ProviderOne","GET",
  "token "+env.APEX_BTCPAY_KEY_READ_ONLY]]);
 assert.equal(r.writerStatus,"configured_not_authorized");
 assert.equal(r.prismSyncStatus,"not_implemented");
 assert.equal(r.canExecutePayout,false);
 assert.equal(JSON.stringify(r).includes("credential"),false);
});
test("rejects shared-store mapping to multiple Apex stores",async()=>{
 const r=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:[store,other],rawBindings:binding(),env,recipients,
  fetchImpl:()=>{throw Error("must not fetch");},
 });
 assert.equal(r.storeStatus,"single_apex_store_required");
});
test("rejects multiple provider stores even for a single Apex store",async()=>{
 const r=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:[store],rawBindings:JSON.stringify([
   JSON.parse(binding())[0],
   {apexStoreId:other,providerStoreId:"Another",providerUrl:"https://btcpay.example.org",
    keyEnv:"APEX_BTCPAY_KEY_ANOTHER"}
  ]),env,recipients,fetchImpl:()=>{throw Error("must not fetch");},
 });
 assert.equal(r.storeStatus,"single_provider_binding_required");
});
test("rejects mismatched store binding and wrong secret role",async()=>{
 const a=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:[store],rawBindings:binding(other),env,recipients,
  fetchImpl:()=>{throw Error("must not fetch");}});
 const b=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:[store],rawBindings:binding(store,"APEX_BTCPAY_KEY_INVOICE_WRITER"),
  env,recipients,fetchImpl:()=>{throw Error("must not fetch");}});
 assert.equal(a.storeStatus,"wrong_store_or_read_key");
 assert.equal(b.storeStatus,"wrong_store_or_read_key");
});
test("does not reuse invoice-writing key as read-only key",async()=>{
 const r=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:[store],rawBindings:binding(),recipients,
  env:{...env,APEX_BTCPAY_KEY_INVOICE_WRITER:env.APEX_BTCPAY_KEY_READ_ONLY},
  fetchImpl:()=>{throw Error("must not fetch");}});
 assert.equal(r.storeStatus,"credential_reuse_rejected");
 assert.equal(r.writerStatus,"same_key_rejected");
});
test("store read denies wrong identity or USD currency mismatch",async()=>{
 for(const [reply,expected] of [
  [{id:"ProviderOther",name:"Apex",defaultCurrency:"USD"},"store_mismatch"],
  [{id:"ProviderOne",name:"Apex",defaultCurrency:"EUR"},"currency_mismatch"],
 ]) {
  const r=await inspectSharedBtcpayReadinessV1({
   apexStoreIds:[store],rawBindings:binding(),env,recipients,
   fetchImpl:async()=>({status:200,ok:true,text:async()=>JSON.stringify(reply)})});
  assert.equal(r.storeStatus,expected);
  assert.equal(r.canCreateInvoice,false);
 }
});
test("permission denial and outage never imply readiness",async()=>{
 for(const [fetchImpl,expected] of [
  [async()=>({status:403,ok:false}),"key_denied"],
  [async()=>{throw Error("offline");},"unreachable"]
 ]) {
  const r=await inspectSharedBtcpayReadinessV1({
   apexStoreIds:[store],rawBindings:binding(),env,recipients,fetchImpl});
  assert.equal(r.storeStatus,expected);
  assert.equal(r.productionReady,false);
 }
});
test("active recipient directory remains wallet-unverified; missing entry is blocked",async()=>{
 const active=recipients.map(r=>({...r,status:"active"}));
 const a=await inspectSharedBtcpayReadinessV1({apexStoreIds:[store],recipients:active});
 const b=await inspectSharedBtcpayReadinessV1({apexStoreIds:[store],recipients:active.slice(0,2)});
 assert.equal(a.recipientStatus,"directory_only_wallets_unverified");
 assert.equal(b.recipientStatus,"three_recipients_required");
});
test("unknown malformed binding fails closed without outgoing requests",async()=>{
 const r=await inspectSharedBtcpayReadinessV1({
  apexStoreIds:[store],rawBindings:"not JSON",recipients,env,
  fetchImpl:()=>{throw Error("must not fetch");}});
 assert.equal(r.storeStatus,"single_provider_binding_required");
});
