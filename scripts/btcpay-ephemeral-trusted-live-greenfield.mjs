#!/usr/bin/env node
/**
 * PR #127: actual Greenfield POST from trusted SQL-backed worker, ONLY against
 * freshly started local BTCPay Server / disposable Bitcoin regtest.
 *
 * No real funds, no live provider credentials, no hosted database and no
 * customer-facing checkout. All secrets are generated in memory and omitted
 * from logs. Existing on-chain Prism integration runs separately.
 */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createTrustedRegtestPgWorker} from
  "./btcpay-ephemeral-trusted-pg-worker.mjs";

const execAsync=promisify(execFile);
const ORIGIN="http://127.0.0.1:14142";
const scopeId="39500000-0000-0000-0000-000000000001";
const orderRef="real-regtest-worker-1";
const amountSats=10000n;
const safeId=/^[A-Za-z0-9_-]{1,100}$/;
const env=process.env;
if(env.CI!=="true"||env.GITHUB_ACTIONS!=="true"||
   env.APEX_BTCPAY_EPHEMERAL!=="true"||
   env.APEX_BTCPAY_TEST_NETWORK!=="regtest"||
   env.PGHOST!=="localhost"||env.PGPORT!=="5432"||
   env.PGDATABASE!=="apex_test"||env.PGUSER!=="postgres")
   throw Error("STOP: real worker smoke only inside isolated regtest runner");

async function request(path,{method="GET",json,auth}={}){
  let response;
  try{
    response=await fetch(ORIGIN+path,{
      method,redirect:"error",cache:"no-store",
      headers:{Accept:"application/json",
        ...(json===undefined?{}:{"Content-Type":"application/json"}),
        ...(auth?{Authorization:auth}:{})},
      ...(json===undefined?{}:{body:JSON.stringify(json)}),
      signal:AbortSignal.timeout(15000),
    });
  }catch{
    throw Error("Local BTCPay Greenfield transport failure; no retries");
  }
  if(!response?.ok)
    throw Error("Local BTCPay Greenfield HTTP "+
      (Number.isInteger(response?.status)?response.status:"unknown")+
      " on "+path.split("?")[0]);
  try{return await response.json();}
  catch{throw Error("Local BTCPay returned invalid JSON");}
}
async function sql(file,params={}){
  const args=["-X","-q","-At","-v","ON_ERROR_STOP=1"];
  for(const [name,value] of Object.entries(params)){
    if(!/^[a-z_]+$/.test(name)||!safeId.test(value))
      throw Error("Unsafe isolated PostgreSQL fixture parameter");
    args.push("-v",name+"="+value);
  }
  args.push("-f",file);
  try{
    const {stdout}=await execAsync("psql",args,{
      env,encoding:"utf8",timeout:15000,maxBuffer:64*1024,
      stdio:["ignore","pipe","pipe"],
    });
    return stdout.trim();
  }catch{throw Error("Isolated regtest PostgreSQL test failed");}
}

const suffix=randomBytes(18).toString("hex");
const email="apex-trusted-worker-"+suffix.slice(0,16)+"@example.com";
const password="A7!q"+suffix+"Zz9";
const user=await request("/api/v1/users",{
  method:"POST",
  json:{email,name:"Apex disposable real-worker test",
    password,isAdministrator:true,sendInvitationEmail:false},
});
assert.equal(typeof user?.id,"string","Could not create disposable account");
const basic="Basic "+Buffer.from(email+":"+password).toString("base64");
const me=await request("/api/v1/users/me",{auth:basic});
assert.equal(me?.id,user.id,"Synthetic administrator identity mismatch");
const store=await request("/api/v1/stores",{
 method:"POST",auth:basic,json:{name:"Apex Trusted Worker Regtest"},
});
if(!safeId.test(store?.id||""))throw Error("Invalid disposable store");
const storeId=store.id;
// No real wallet; generate isolated regtest-only watch configuration and
// never print or save its derivation or returned mnemonic.
const wallet=await request("/api/v1/stores/"+storeId+
 "/payment-methods/BTC-CHAIN/wallet/generate",{
  method:"POST",auth:basic,
  json:{label:"Regtest Worker Disposable",savePrivateKeys:false,
    scriptPubKeyType:"Segwit"},
});
if(wallet?.paymentMethodId!=="BTC-CHAIN"||
  typeof wallet?.config?.accountDerivation!=="string")
  throw Error("Disposable regtest on-chain wallet setup failed");
const permissions=[
 "btcpay.store.cancreateinvoice:"+storeId,
 "btcpay.store.canviewinvoices:"+storeId,
];
const key=await request("/api/v1/api-keys",{
 method:"POST",auth:basic,
 json:{label:"Ephemeral trusted-worker Greenfield",permissions},
});
if(typeof key?.apiKey!=="string"||key.apiKey.length<12||
   !Array.isArray(key.permissions)||
   !permissions.every(p=>key.permissions.some(
      x=>x===p||x?.policy===p||x?.toString?.()===p)))
   throw Error("Store-scoped Greenfield invoice key not confirmed");

// The provider exists before SQL fixture registration; all future
// authorization is controlled by transactionally committed local PostgreSQL.
// This script is the only owner of BOTH the test-store key and SQL operator.
await sql("tests/payout-rls/btcpay-real-provider-worker-setup.sql",{
 store_id:storeId,
});

let posts=0;
const worker=createTrustedRegtestPgWorker({
 fetchImpl:async(url,opts)=>{
  if(!url.startsWith(ORIGIN+"/api/v1/stores/"+storeId+"/invoices"))
    throw Error("Worker attempted external or cross-store Greenfield request");
  if(opts.method==="POST")posts++;
  return fetch(url,opts);
 },
});
const result=await worker.createInvoice({
 scopeId,storeId,orderRef,amountSats,apiKey:key.apiKey,
});
assert.equal(result.status,"observed_regtest_invoice_no_checkout",
 "Real Greenfield invoice did not match independent readback and durable audit");
assert.equal(result.providerPostAttempts,1);
assert.equal(result.automaticallyRetry,false);
assert.equal(result.checkoutReleaseAllowed,false);
assert.equal(result.fulfillmentAllowed,false);
assert.equal(result.splitActivationAllowed,false);
assert.equal(result.productionReady,false);
if(!safeId.test(result.invoiceId||""))
  throw Error("Real provider invoice ID missing from verified readback");

// Read the actual provider inventory with the same narrow Greenfield token.
const invoices=await request("/api/v1/stores/"+storeId+"/invoices?take=20&skip=0",{
 auth:"token "+key.apiKey,
});
if(!Array.isArray(invoices)||
   invoices.filter(x=>x?.id===result.invoiceId).length!==1||
   invoices.length!==1)
  throw Error("Real disposable provider inventory was not exactly one invoice");

// A second identical user request must NEVER cause even a second HTTP POST.
let blocked=false;
try{
  await worker.createInvoice({scopeId,storeId,orderRef,amountSats,
    apiKey:key.apiKey});
}catch{blocked=true;}
assert.equal(blocked,true,"Committed provider intent unexpectedly allowed a second operation");
assert.equal(posts,1,"Duplicate request made an additional external Greenfield POST");

const dbResult=await sql(
 "tests/payout-rls/btcpay-real-provider-worker-check.sql",{
  invoice_id:result.invoiceId,
});
assert.equal(dbResult,"verified","Durable provider invoice journal verification failed");
process.stdout.write(JSON.stringify({
 result:"verified",network:"regtest",realGreenfieldPostCount:posts,
 realGreenfieldInvoiceReadback:true,realProviderInventoryCount:1,
 durablePrePostReservation:true,duplicateRequestRejected:true,
 independentAdminCosignFixture:true,immutableHoldStillActive:true,
 publicCheckoutEnabled:false,splitActivated:false,productionReady:false,
})+"\n");
