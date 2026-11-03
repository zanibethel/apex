import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const crash=readFileSync("scripts/btcpay-ephemeral-regtest-crash-recovery.mjs","utf8");
const live=readFileSync("scripts/btcpay-ephemeral-trusted-live-greenfield.mjs","utf8");
const entry=readFileSync("scripts/btcpay-ephemeral-greenfield.mjs","utf8");

test("post-commit crash injection has strict CI/regtest and localhost boundaries",()=>{
  for(const part of [
    'env.CI!=="true"','env.GITHUB_ACTIONS!=="true"',
    'env.APEX_BTCPAY_EPHEMERAL!=="true"',
    'env.APEX_BTCPAY_TEST_NETWORK!=="regtest"',
    'env.PGDATABASE!=="apex_test"',
    'const ORIGIN="http://127.0.0.1:14142"',
    'process.exit(79)',
    'DISPOSABLE_POST_COMMITTED_CRASH_INJECTED',
  ]) assert.ok(crash.includes(part),"Missing sandbox boundary: "+part);
});
test("crash recovery requires provider readback, durable evidence and no retry",()=>{
  assert.ok(crash.includes("btcpay-real-provider-crash-intent.sql"));
  assert.ok(crash.includes("btcpay-real-provider-crash-final.sql"));
  assert.ok(crash.includes("btcpay-worker-observe.sql"));
  assert.ok(crash.includes('assert.equal(unexpectedHttpCalls,0'));
  assert.ok(crash.includes('assert.equal(finalList.length,1)'));
  assert.ok(live.includes("runEphemeralCrashRecovery"));
  assert.ok(entry.includes("postCommitCrashRecoveryVerified:true"));
});
test("test harness stays out of customer and supplier production routes",()=>{
  for(const file of [
    "src/app/page.tsx","src/app/catalog/page.tsx",
    "src/app/supplier/operations/actions.ts",
  ]) assert.ok(!readFileSync(file,"utf8").includes("btcpay-ephemeral-regtest-crash-recovery"));
});
