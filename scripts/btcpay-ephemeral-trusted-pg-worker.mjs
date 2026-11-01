/**
 * PR #126. GitHub-hosted disposable-regtest-only, privileged PostgreSQL bridge.
 * This module owns BOTH SQL authorization and its BTCPay request. No Next.js
 * API route, supplied SQL callback, or hosted database connection.
 */
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {createPreauthorizedRegtestInvoice} from
  "../src/lib/payments/btcpay-regtest-prepost-fence.mjs";

const execAsync=promisify(execFile);
const safeId=/^[A-Za-z0-9_-]{1,100}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const queries=Object.freeze({
  reserve:fileURLToPath(new URL("../tests/payout-rls/btcpay-worker-reserve.sql",import.meta.url)),
  verify:fileURLToPath(new URL("../tests/payout-rls/btcpay-worker-verify.sql",import.meta.url)),
  observe:fileURLToPath(new URL("../tests/payout-rls/btcpay-worker-observe.sql",import.meta.url)),
});
function requireIsolation(env){
  if(env?.CI!=="true"||env?.GITHUB_ACTIONS!=="true"||
     env?.APEX_BTCPAY_EPHEMERAL!=="true"||
     env?.APEX_BTCPAY_TEST_NETWORK!=="regtest"||
     env?.PGHOST!=="localhost"||env?.PGPORT!=="5432"||
     env?.PGDATABASE!=="apex_test"||env?.PGUSER!=="postgres"||
     typeof env?.RUNNER_TEMP!=="string"||
     !env.RUNNER_TEMP.startsWith("/home/runner/work/_temp")||
     typeof env?.PGPASSWORD!=="string"||env.PGPASSWORD.length<1)
   throw Error("STOP: trusted worker requires isolated GitHub Postgres regtest fixture");
}
function validate(name,value,regex){
  if(typeof value!=="string"||!regex.test(value))
    throw Error("Invalid synthetic worker "+name);
}
export function createTrustedRegtestPgWorker({
  env=process.env,runPsql,fetchImpl=fetch,
}={}){
  requireIsolation(env);
  if(typeof fetchImpl!=="function")throw Error("Missing test fetch adapter");
  const exec=runPsql||async(args)=>{
    // No provider credential, wallet secret or identity token goes to psql.
    const {stdout}=await execAsync("psql",args,{
      encoding:"utf8",timeout:12000,maxBuffer:32768,
      env,stdio:["ignore","pipe","pipe"],
    });
    return stdout.trim();
  };
  if(typeof exec!=="function")throw Error("Invalid isolated SQL executor");

  async function sql(operation,values){
    const args=["-X","-q","-At","-v","ON_ERROR_STOP=1"];
    for(const [name,value] of Object.entries(values)){
      validate(name,name,/^[a-z_]+$/);
      validate(name,value,/^[A-Za-z0-9_-]{0,100}$/);
      args.push("-v",name+"="+value);
    }
    args.push("-f",queries[operation]);
    try{return String(await exec(args)).trim();}
    catch{throw Error("Trusted disposable PostgreSQL operation failed; no retry");}
  }

  async function createInvoice({scopeId,storeId,orderRef,amountSats,apiKey}={}){
    validate("store",storeId,safeId);
    validate("order",orderRef,safeId);
    validate("scope",scopeId,uuid);
    if(typeof amountSats!=="bigint"||amountSats<1000n||
       amountSats>100000000n)throw Error("Invalid fixture satoshi amount");
    if(typeof apiKey!=="string"||apiKey.length<12)
      throw Error("Missing disposable BTCPay key");
    let reservedId=null;
    const reserveDurably=async({storeId:postedStore,orderRef:postedOrder,
      amountSats:postedAmount,network})=>{
      if(postedStore!==storeId||postedOrder!==orderRef||
         postedAmount!==amountSats||network!=="regtest")
        throw Error("Untrusted regtest invoice reservation request");
      const intentId=await sql("reserve",{
        scope_id:scopeId,store_id:storeId,
        order_ref:orderRef,amount_sats:amountSats.toString(),
      });
      if(!uuid.test(intentId))
        throw Error("Provider intent must be a committed UUID");
      reservedId=intentId;
      const text=await sql("verify",{intent_id:intentId,scope_id:scopeId});
      let verified;
      try{verified=JSON.parse(text);}catch{throw Error("Durable reservation readback missing");}
      if(verified?.intentId!==intentId||
         verified?.storeId!==storeId||
         verified?.orderRef!==orderRef||
         verified?.amountSats!==amountSats.toString()||
         verified?.network!=="regtest"||
         verified?.status!=="reserved_before_post")
         throw Error("Durable reservation verification mismatch");
      return Object.freeze({
        intentId,storeId,orderRef,amountSats,network:"regtest",
        status:"reserved_before_post",
      });
    };
    const recordObservation=async({intentId,kind,invoiceId,network})=>{
      if(intentId!==reservedId||network!=="regtest"||
         !["post_outcome_unknown","invoice_seen_by_readback"].includes(kind)||
         (kind==="post_outcome_unknown"&&invoiceId!==null)||
         (kind==="invoice_seen_by_readback"&&!safeId.test(invoiceId||"")))
        throw Error("Invalid trusted worker receipt");
      return sql("observe",{
        intent_id:intentId,kind,invoice_id:invoiceId||"",
      });
    };
    // All credentials are closed over by this isolated worker. No public
    // caller may supply the authorization or observation callbacks.
    return createPreauthorizedRegtestInvoice({
      testOnly:true,network:"regtest",
      serverUrl:"http://127.0.0.1:14142/",
      storeId,apiKey,orderRef,amountSats,fetchImpl,
      reserveDurably,recordObservation,
    });
  }
  return Object.freeze({createInvoice});
}
