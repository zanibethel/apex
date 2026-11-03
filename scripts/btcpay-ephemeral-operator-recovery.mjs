/**
 * PR #174. Disposable-regtest ONLY: separate authenticated PostgreSQL
 * operator logins corroborate read-only provider evidence before appending
 * the post-crash readback observation. Never expose through Next.js routes.
 */
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";

const execAsync=promisify(execFile);
const safe=/^[A-Za-z0-9_-]{1,100}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest=/^[0-9a-f]{64}$/;
const scripts=Object.freeze({
 request:fileURLToPath(new URL("../tests/payout-rls/btcpay-operator-request.sql",import.meta.url)),
 approve:fileURLToPath(new URL("../tests/payout-rls/btcpay-operator-approve.sql",import.meta.url)),
});
const roles=Object.freeze({
 requester:"apex_test_recovery_requester",
 reviewer:"apex_test_recovery_reviewer",
});

export function createEphemeralOperatorRecovery({env=process.env,runPsql}={}){
 if(env.CI!=="true"||env.GITHUB_ACTIONS!=="true"||
    env.APEX_BTCPAY_EPHEMERAL!=="true"||
    env.APEX_BTCPAY_TEST_NETWORK!=="regtest"||
    env.PGHOST!=="localhost"||env.PGPORT!=="5432"||
    env.PGDATABASE!=="apex_test"||
    !env.RUNNER_TEMP?.startsWith("/home/runner/work/_temp")||
    typeof env.APEX_BTCPAY_TEST_RECOVERY_REQUESTER_PASSWORD!=="string"||
    !env.APEX_BTCPAY_TEST_RECOVERY_REQUESTER_PASSWORD||
    typeof env.APEX_BTCPAY_TEST_RECOVERY_REVIEWER_PASSWORD!=="string"||
    !env.APEX_BTCPAY_TEST_RECOVERY_REVIEWER_PASSWORD||
    env.APEX_BTCPAY_TEST_RECOVERY_REQUESTER_PASSWORD===
      env.APEX_BTCPAY_TEST_RECOVERY_REVIEWER_PASSWORD)
   throw Error("STOP: independently authenticated disposable recovery roles required");

 const launch=runPsql|| (async(role,script,args)=>{
   const password=role==="requester"?
      env.APEX_BTCPAY_TEST_RECOVERY_REQUESTER_PASSWORD:
      env.APEX_BTCPAY_TEST_RECOVERY_REVIEWER_PASSWORD;
   const {stdout}=await execAsync("psql",args,{
     env:{...env,PGUSER:roles[role],PGPASSWORD:password},
     encoding:"utf8",timeout:15000,maxBuffer:16*1024,
     stdio:["ignore","pipe","pipe"],
   });
   return stdout.trim();
 });
 async function sql(role,script,params){
   if(!Object.hasOwn(roles,role)||!Object.hasOwn(scripts,script))
     throw Error("Invalid private recovery SQL operation");
   const args=["-X","-q","-At","-v","ON_ERROR_STOP=1"];
   for(const [name,value] of Object.entries(params)){
     if(!/^[a-z][a-z0-9_]*$/.test(name)||typeof value!=="string"||
        !safe.test(value) && !uuid.test(value) && !digest.test(value))
       throw Error("Invalid recovery evidence SQL parameter");
     args.push("-v",name+"="+value);
   }
   args.push(scripts[script]);
   try{return String(await launch(role,script,args)).trim();}
   catch{throw Error("Authenticated operator recovery operation denied");}
 }
 async function reconcile({intentId,invoiceId,requesterDigest,reviewerDigest}={}){
   if(!uuid.test(intentId||"")||!safe.test(invoiceId||"")||
      !digest.test(requesterDigest||"")||!digest.test(reviewerDigest||""))
     throw Error("Invalid disposable verified provider evidence");
   const requestId=await sql("requester","request",{
     intent_id:intentId,invoice_id:invoiceId,evidence_sha256:requesterDigest,
   });
   if(!uuid.test(requestId))
      throw Error("Recovery request not durably committed");
   const result=await sql("reviewer","approve",{
     request_id:requestId,evidence_sha256:reviewerDigest,
   });
   if(result!=="reconciled_without_checkout_or_retry")
      throw Error("Independent review did not complete");
   return Object.freeze({
     requestId,independentOperatorReview:true,
     checkoutReleaseAllowed:false,providerRetryAllowed:false,
     fulfillmentAllowed:false,payoutActivationAllowed:false,
   });
 }
 return Object.freeze({reconcile,sql});
}
