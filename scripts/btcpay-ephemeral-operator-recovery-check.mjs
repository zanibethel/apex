#!/usr/bin/env node
/**
 * PR #174: disposable PostgreSQL + synthetic READBACK. Actual provider
 * readback and crash are separately exercised in upstream Bitcoin regtest.
 */
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createHash} from "node:crypto";
import {createEphemeralOperatorRecovery} from "./btcpay-ephemeral-operator-recovery.mjs";

const execAsync=promisify(execFile);
const env={...process.env,PGDATABASE:"apex_test"};
const scope="39000000-0000-0000-0000-000000000002";
const result=await execAsync("psql",[
 "-X","-At","-v","ON_ERROR_STOP=1","-c",
 "select id from public.btcpay_test_provider_post_intents where scope_id='"+
 scope+"'::uuid",
],{env,encoding:"utf8",timeout:12000});
const intentId=result.stdout.trim();
assert.match(intentId,/^[0-9a-f-]{36}$/i);

const op=createEphemeralOperatorRecovery({env});
const evidence=createHash("sha256").update(JSON.stringify({
  testOnly:true,intentId,scope,invoiceId:"synthetic_recovered_timeout_invoice",
  orderRef:"worker-timeout-order-1",amountSats:"10000",
  network:"regtest",providerReadback:"simulated-by-ci-test",
})).digest("hex");
const mismatch="f".repeat(64)===evidence?"e".repeat(64):"f".repeat(64);
const requestId=await op.sql("requester","request",{
 intent_id:intentId,invoice_id:"synthetic_recovered_timeout_invoice",
 evidence_sha256:evidence,
});
assert.match(requestId,/^[0-9a-f-]{36}$/i);
await assert.rejects(op.sql("requester","approve",{
  request_id:requestId,evidence_sha256:evidence,
}),/operator recovery operation denied/);
await assert.rejects(op.sql("reviewer","approve",{
  request_id:requestId,evidence_sha256:mismatch,
}),/operator recovery operation denied/);
const confirmed=await op.sql("reviewer","approve",{
  request_id:requestId,evidence_sha256:evidence,
});
assert.equal(confirmed,"reconciled_without_checkout_or_retry");
await assert.rejects(op.sql("reviewer","approve",{
  request_id:requestId,evidence_sha256:evidence,
}),/operator recovery operation denied/);
const verification=[
 "select case when",
 "(select count(*) from public.btcpay_test_operator_recovery_approvals",
 " where request_id='"+requestId+"'::uuid)=1",
 "and (select count(*) from public.btcpay_test_provider_post_observations",
 " where intent_id='"+intentId+"'::uuid and kind='invoice_seen_by_readback'",
 " and provider_invoice_id='synthetic_recovered_timeout_invoice')=1",
 "and (select status from public.btcpay_test_checkout_resume_permits where",
 " scope_id='"+scope+"'::uuid)='consumed'",
 "and (select status from public.btcpay_test_split_sync_holds where",
 " scope_id='"+scope+"'::uuid)='held'",
 "and (select status from public.payout_rules where",
 " scope_id='"+scope+"'::uuid)='draft'",
 "and not exists(select 1 from public.btcpay_test_invoices",
 " where apex_store_id='"+scope+"'::uuid)",
 "then 'verified' else 'denied' end",
].join(" ");
const check=await execAsync("psql",[
 "-X","-At","-v","ON_ERROR_STOP=1","-c",verification,
],{env,encoding:"utf8",timeout:12000});
assert.equal(check.stdout.trim(),"verified");
process.stdout.write(JSON.stringify({
 syntheticRecoveryVerified:true,independentDbLogins:true,
 mismatchDenied:true,replayDenied:true,checkoutHeld:true,productionReady:false,
})+"\n");
