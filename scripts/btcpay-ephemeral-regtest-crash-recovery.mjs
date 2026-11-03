#!/usr/bin/env node
/**
 * PR #171: REAL regtest Greenfield post-commit crash and operator readback.
 * CI-only, disposable GitHub Postgres and BTCPay localhost. Not imported
 * by Next.js. No automatic retry, payment link, mainnet or production key.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeSync} from "node:fs";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {createTrustedRegtestPgWorker} from "./btcpay-ephemeral-trusted-pg-worker.mjs";

const execAsync=promisify(execFile);
const ORIGIN="http://127.0.0.1:14142";
const SCOPE="39500000-0000-0000-0000-000000000002";
const ORDER="real-regtest-crash-1";
const SATS=10000n;
const safeId=/^[A-Za-z0-9_-]{1,100}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function testEnv(){
 const env={...process.env,PGDATABASE:"apex_test"};
 if(env.CI!=="true"||env.GITHUB_ACTIONS!=="true"||
    env.APEX_BTCPAY_EPHEMERAL!=="true"||
    env.APEX_BTCPAY_TEST_NETWORK!=="regtest"||
    env.PGHOST!=="localhost"||env.PGPORT!=="5432"||
    env.PGUSER!=="postgres"||env.PGDATABASE!=="apex_test"||
    !env.PGPASSWORD||!env.RUNNER_TEMP?.startsWith("/home/runner/work/_temp"))
   throw Error("STOP: crash recovery requires disposable GitHub-only regtest");
 return env;
}
function amountMatches(value,sats){
 const text=typeof value==="string"?value:
    typeof value==="number"&&Number.isFinite(value)?String(value):"";
 if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/.test(text))return false;
 const [whole,part=""]=text.split(".");
 return BigInt(whole)*100000000n+BigInt(part.padEnd(8,"0"))===sats;
}
async function request(path,{method="GET",json,auth}={}){
 const response=await fetch(ORIGIN+path,{
   method,redirect:"error",cache:"no-store",
   headers:{Accept:"application/json",
     ...(json===undefined?{}:{"Content-Type":"application/json"}),
     ...(auth?{Authorization:auth}:{})},
   ...(json===undefined?{}:{body:JSON.stringify(json)}),
   signal:AbortSignal.timeout(15000),
 });
 if(!response.ok)throw Error("Disposable Greenfield request failed; status "+response.status);
 return response.json();
}
async function sql(file,params={}){
 const env=testEnv();
 const args=["-X","-q","-At","-v","ON_ERROR_STOP=1"];
 for(const [name,value] of Object.entries(params)){
   if(!/^[a-z][a-z0-9_]*$/.test(name)||!safeId.test(value))
     throw Error("Invalid crash recovery SQL fixture input");
   args.push("-v",name+"="+value);
 }
 args.push("-f",file);
 try{
   const {stdout}=await execAsync("psql",args,{
     env,encoding:"utf8",timeout:15000,maxBuffer:32*1024,
   });
   return stdout.trim();
 }catch{
   throw Error("Crash recovery isolated PostgreSQL operation failed");
 }
}
async function crashChild(){
 const env=testEnv();
 const storeId=env.APEX_BTCPAY_CRASH_STORE;
 const apiKey=env.APEX_BTCPAY_CRASH_KEY;
 if(env.APEX_BTCPAY_CRASH_SCOPE!==SCOPE||!safeId.test(storeId||"")||
   typeof apiKey!=="string"||apiKey.length<12)
   throw Error("Missing disposable crash fixture credentials");
 let postCount=0;
 const workerEnv={...env,PGUSER:"apex_test_invoice_worker",
  PGPASSWORD:env.APEX_BTCPAY_TEST_WORKER_PASSWORD};
const worker=createTrustedRegtestPgWorker({env:workerEnv,
   fetchImpl:async(url,options)=>{
     const u=new URL(url);
     if(u.origin!==ORIGIN||
       u.pathname!=="/api/v1/stores/"+storeId+"/invoices"||
       options.method!=="POST"||options.redirect!=="error"||
       options.headers.Authorization!=="token "+apiKey||
       ++postCount!==1)
       throw Error("Unsafe regtest crash injection request");
     // The real provider receives and accepts exactly one POST. The process
     // is killed before ANY durable observation can be written.
     const response=await fetch(url,options);
     if(!response.ok)throw Error("Real disposable provider rejected crash POST");
     const created=await response.json();
     if(!safeId.test(created?.id||"")||created.storeId!==storeId)
       throw Error("No confirmed provider acceptance before fault injection");
     writeSync(2,"DISPOSABLE_POST_COMMITTED_CRASH_INJECTED\n");
     process.exit(79);
   },
 });
 await worker.createInvoice({scopeId:SCOPE,storeId,orderRef:ORDER,
   amountSats:SATS,apiKey});
 throw Error("Crash fixture exited without injecting post-commit failure");
}
export async function runEphemeralCrashRecovery({basic,network,testOnly,otherSupplierKey}={}){
 const env=testEnv();
 if(testOnly!==true||network!=="regtest"||
   typeof basic!=="string"||!/^Basic [A-Za-z0-9+/=]+$/.test(basic))
   throw Error("Disposable operator authorization required");
 const store=await request("/api/v1/stores",{
   method:"POST",auth:basic,json:{name:"Apex Post-Commit Crash Regtest"},
 });
 if(!safeId.test(store?.id||""))throw Error("Invalid disposable crash store");
 const storeId=store.id;
 const wallet=await request("/api/v1/stores/"+storeId+
  "/payment-methods/BTC-CHAIN/wallet/generate",{
   method:"POST",auth:basic,
   json:{label:"Disposable Crash Regtest",savePrivateKeys:false,
      scriptPubKeyType:"Segwit"},
 });
 if(wallet?.paymentMethodId!=="BTC-CHAIN"||
   typeof wallet?.config?.accountDerivation!=="string")
   throw Error("No disposable crash-store BTC-CHAIN configuration");
 const permissions=[
  "btcpay.store.cancreateinvoice:"+storeId,
  "btcpay.store.canviewinvoices:"+storeId,
 ];
 const key=await request("/api/v1/api-keys",{
   method:"POST",auth:basic,
   json:{label:"Ephemeral crash recovery Greenfield",permissions},
 });
 if(typeof key?.apiKey!=="string"||key.apiKey.length<12||
   !Array.isArray(key.permissions)||key.permissions.length!==permissions.length||
   !permissions.every(p=>key.permissions.some(
     x=>x===p||x?.policy===p||x?.toString?.()===p)))
   throw Error("Disposable crash-store scoped key missing required grants");
 await sql("tests/payout-rls/btcpay-real-provider-crash-setup.sql",{
   store_id:storeId,
 credential_sha256:createHash("sha256").update(key.apiKey,"utf8").digest("hex"),
 });
 // Supplier A's real store-scoped key cannot authorize an invoice for
 // supplier B. Reject at PostgreSQL before even attempting Greenfield HTTP.
 if(typeof otherSupplierKey!=="string"||otherSupplierKey.length<12||
    otherSupplierKey===key.apiKey)
   throw Error("Independent supplier A credential required");
 let crossStoreNetworkCalls=0;
 const crossWorkerEnv={...env,PGUSER:"apex_test_invoice_worker",
   PGPASSWORD:env.APEX_BTCPAY_TEST_WORKER_PASSWORD};
 const crossWorker=createTrustedRegtestPgWorker({
   env:crossWorkerEnv,
   fetchImpl:async()=>{crossStoreNetworkCalls++;throw Error("forbidden provider request");},
 });
 await assert.rejects(crossWorker.createInvoice({
   scopeId:SCOPE,storeId,orderRef:"other-supplier-token-denied",
   amountSats:SATS,apiKey:otherSupplierKey,
 }));
 assert.equal(crossStoreNetworkCalls,0,
   "Supplier A's credential attempted HTTP against supplier B");
 const forbiddenRead=await fetch(
   ORIGIN+"/api/v1/stores/"+storeId+"/invoices?take=1&skip=0",{
     method:"GET",redirect:"error",cache:"no-store",
     headers:{Authorization:"token "+otherSupplierKey,Accept:"application/json"},
     signal:AbortSignal.timeout(10000),
   });
 assert.equal(forbiddenRead.ok,false,
   "BTCPay issued supplier A a key that can view supplier B invoices");
 // A genuinely separate Node process commits the SQL intent, POSTs to the
 // actual BTCPay regtest instance, then exits(79) before GET/observation.
 let faultInjected=false;
 try{
   await execAsync(process.execPath,[fileURLToPath(import.meta.url),"--crash-child"],{
     env:{...env,
       APEX_BTCPAY_CRASH_SCOPE:SCOPE,
       APEX_BTCPAY_CRASH_STORE:storeId,
       APEX_BTCPAY_CRASH_KEY:key.apiKey,
     },
     timeout:30000,maxBuffer:4096,
   });
 }catch(error){
   faultInjected=error.code===79&&
      String(error.stderr||"").includes("DISPOSABLE_POST_COMMITTED_CRASH_INJECTED");
 }
 assert.equal(faultInjected,true,
   "Must prove real provider accepted POST before separate worker process exited");
 const persisted=JSON.parse(await sql(
   "tests/payout-rls/btcpay-real-provider-crash-intent.sql"));
 assert.ok(uuid.test(persisted.intentId));
 assert.equal(persisted.storeId,storeId);
 assert.equal(persisted.orderRef,ORDER);
 assert.equal(persisted.amountSats,SATS.toString());
 assert.equal(persisted.network,"regtest");
 assert.equal(Number(persisted.observationCount),0,
   "Crashed worker cannot forge a completed durable observation");
 let unexpectedHttpCalls=0;
 const workerEnv={...env,PGUSER:"apex_test_invoice_worker",
  PGPASSWORD:env.APEX_BTCPAY_TEST_WORKER_PASSWORD};
const restarted=createTrustedRegtestPgWorker({env:workerEnv,
   fetchImpl:async()=>{
     unexpectedHttpCalls++;
     throw Error("Second worker must not reach provider");
   },
 });
 const repeat=()=>restarted.createInvoice({scopeId:SCOPE,storeId,
   orderRef:ORDER,amountSats:SATS,apiKey:key.apiKey});
 await assert.rejects(repeat());
 assert.equal(unexpectedHttpCalls,0,
   "Restarted worker must reject reused permit before network");
 // Read-only, authenticated full invoice inventory is the operator's source.
 // No second POST and no automatic claim of fulfillment.
 const invoiceList=await request("/api/v1/stores/"+storeId+
   "/invoices?take=20&skip=0",{auth:"token "+key.apiKey});
 assert.ok(Array.isArray(invoiceList));
 assert.equal(invoiceList.length,1,"One and only one provider invoice after crash");
 const id=invoiceList[0]?.id;
 assert.ok(safeId.test(id||""));
 const provider=await request("/api/v1/stores/"+storeId+"/invoices/"+
   encodeURIComponent(id),{auth:"token "+key.apiKey});
 assert.equal(provider.id,id);
 assert.equal(provider.storeId,storeId);
 assert.equal(provider.currency,"BTC");
 assert.equal(provider.metadata?.orderId,ORDER);
 assert.equal(provider.metadata?.apexIntentId,persisted.intentId);
 assert.ok(amountMatches(provider.amount,SATS),
   "Provider's post-crash amount must equal reserved integer satoshis");
 assert.ok(["New","Processing","Settled","Expired","Invalid"].includes(provider.status));
 const observation=await sql("tests/payout-rls/btcpay-worker-observe.sql",{
   intent_id:persisted.intentId,
   kind:"invoice_seen_by_readback",invoice_id:id,
 });
 assert.equal(observation,"recorded_without_checkout_authorization");
 assert.equal(await sql("tests/payout-rls/btcpay-real-provider-crash-final.sql",{
   invoice_id:id,
 }),"verified");
 await assert.rejects(repeat());
 assert.equal(unexpectedHttpCalls,0);
 const finalList=await request("/api/v1/stores/"+storeId+
   "/invoices?take=20&skip=0",{auth:"token "+key.apiKey});
 assert.equal(finalList.length,1);
 assert.equal(finalList[0]?.id,id);
 return Object.freeze({
  regtestProcessCrashAfterPostVerified:true,
  postCrashProviderReadbackVerified:true,
  postCrashDurableReconciliationVerified:true,
  postCrashReplayPrevented:true,
  providerInvoiceCount:1,
  newCustomerCheckout:false,payoutActivation:false,productionReady:false,
 });
}
if(process.argv[1]?.endsWith("btcpay-ephemeral-regtest-crash-recovery.mjs")&&
   process.argv[2]==="--crash-child"){
 await crashChild();
}
