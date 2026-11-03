import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parsePrivateGreenfieldBindings,probePrivateGreenfieldStore}
 from "../src/lib/btcpay/private-greenfield-status.mjs";

const apex="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const second="62000000-0000-0000-0000-000000000002";
const binding={apexStoreId:apex,providerUrl:"https://pay.example.org",
 providerStoreId:"provider-one",keyEnv:"APEX_BTCPAY_KEY_PRIMARY"};
const raw=JSON.stringify([binding]);
const key="secretTestCredentialForReadOnlyProbe01";

test("only bounded HTTPS store-scoped bindings with separate key refs can be configured",()=>{
 assert.equal(parsePrivateGreenfieldBindings().state,"unconfigured");
 const p=parsePrivateGreenfieldBindings(raw);
 assert.equal(p.state,"configured");
 assert.equal(p.bindings[0].providerOrigin,"https://pay.example.org");
 assert.equal(Object.isFrozen(p.bindings[0]),true);
 for(const candidate of [
  "bad",JSON.stringify([]),JSON.stringify([binding,binding]),
  JSON.stringify([{...binding,providerUrl:"http://pay.example.org"}]),
  JSON.stringify([{...binding,providerUrl:"https://127.0.0.1"}]),
  JSON.stringify([{...binding,providerUrl:"https://localhost"}]),
  JSON.stringify([{...binding,providerUrl:"https://pay.example.org:444"}]),
  JSON.stringify([{...binding,providerUrl:"https://pay.example.org/login"}]),
  JSON.stringify([{...binding,providerUrl:"https://user:pass@pay.example.org"}]),
  JSON.stringify([{...binding,keyEnv:"NEXT_PUBLIC_BTCPAY_KEY"}]),
  JSON.stringify([binding,{...binding,apexStoreId:second}]),
  JSON.stringify([binding,{...binding,apexStoreId:second,providerStoreId:"provider-two"}]),
  JSON.stringify([{...binding,extra:"untrusted"}]),
 ])assert.equal(parsePrivateGreenfieldBindings(candidate).state,"invalid");
});
test("read-only provider check uses exact store path, no redirect and never returns secrets",async()=>{
 let requests=0;
 const response=await probePrivateGreenfieldStore({
  apexStoreId:apex,rawBindings:raw,env:{APEX_BTCPAY_KEY_PRIMARY:key},
  fetchImpl:async (url,options)=>{
   requests++;
   assert.equal(url,"https://pay.example.org/api/v1/stores/provider-one");
   assert.equal(options.method,"GET");
   assert.equal(options.redirect,"error");
   assert.equal(options.cache,"no-store");
   assert.equal(options.headers.Authorization,"token "+key);
   return {status:200,ok:true,text:async()=>JSON.stringify({
    id:"provider-one",name:"Research Store",defaultCurrency:"USD"})};
  },
 });
 assert.equal(requests,1);
 assert.deepEqual(response,{status:"store_verified",providerName:"Research Store",defaultCurrency:"USD"});
 assert.ok(!JSON.stringify(response).includes(key));
});
test("probe fails closed for missing, cross-store, failed and malformed connections",async()=>{
 const mk=(status,body)=>async()=>({
  status,ok:status>=200&&status<300,
  text:async()=>typeof body==="string"?body:JSON.stringify(body),
 });
 const base={apexStoreId:apex,rawBindings:raw,env:{APEX_BTCPAY_KEY_PRIMARY:key}};
 assert.equal((await probePrivateGreenfieldStore({apexStoreId:apex})).status,"no_bindings");
 assert.equal((await probePrivateGreenfieldStore({...base,env:{}})).status,"missing_key");
 assert.equal((await probePrivateGreenfieldStore({...base,apexStoreId:second})).status,"no_store_binding");
 assert.equal((await probePrivateGreenfieldStore({...base,fetchImpl:mk(403,{})})).status,"key_denied");
 assert.equal((await probePrivateGreenfieldStore({...base,fetchImpl:mk(404,{})})).status,"store_not_found");
 assert.equal((await probePrivateGreenfieldStore({...base,fetchImpl:mk(500,{})})).status,"provider_error");
 assert.equal((await probePrivateGreenfieldStore({...base,fetchImpl:mk(200,{
  id:"provider-two",name:"Another Store",defaultCurrency:"USD"})})).status,"store_mismatch");
 assert.equal((await probePrivateGreenfieldStore({...base,fetchImpl:mk(200,{
  id:"provider-one",name:"Store",defaultCurrency:"EUR"})})).status,"currency_mismatch");
 assert.equal((await probePrivateGreenfieldStore({...base,fetchImpl:mk(200,"oops")})).status,"invalid_response");
 assert.equal((await probePrivateGreenfieldStore({...base,fetchImpl:async()=>{throw Error("sensitive network failure");}})).status,"unreachable");
});
test("only authenticated admin sees connectivity page, without wallet or invoice actions",()=>{
 const page=readFileSync("src/app/admin/btcpay/page.tsx","utf8");
 const helper=readFileSync("src/lib/btcpay/private-greenfield-status.mjs","utf8");
 const admin=readFileSync("src/app/admin/page.tsx","utf8");
 const checkout=readFileSync("src/app/admin/checkout-review/page.tsx","utf8");
 assert.match(page,/isVerifiedPlatformAdmin\(auth.user\)/);
 assert.match(page,/get_admin_private_category_stores/);
 assert.match(page,/APEX_BTCPAY_BINDINGS_JSON/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.match(page,/Checkout remains disabled/);
 assert.match(helper,/method:"GET"/);
 assert.doesNotMatch(helper,/method:"POST"|createInvoice|createPayout|wallet\/generate/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.upsert\(|createInvoice|service_role|createPublicUrl/);
 assert.match(admin,/href: "\/admin\/btcpay"/);
 assert.match(checkout,/href="\/admin\/btcpay"/);
});
