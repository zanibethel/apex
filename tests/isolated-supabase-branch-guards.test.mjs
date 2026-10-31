import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {
  PRODUCTION_APEX_REF,assertIsolatedApexTarget,
} from "../scripts/isolated-apex-target.mjs";

const safeRef="abcdefghijklmnopqrst";
const valid={
  APEX_TEST_EXECUTION:"isolated-fixture-only",
  APEX_TEST_SUPABASE_REF:safeRef,
  APEX_TEST_SUPABASE_URL:"https://"+safeRef+".supabase.co",
  APEX_TEST_SUPABASE_PUBLISHABLE_KEY:"test-only",
  APEX_TEST_SUPABASE_SERVICE_ROLE_KEY:"test-only-admin",
};

test("QA fixture refuses production URL even if it is explicitly opted in",()=>{
  assert.throws(()=>assertIsolatedApexTarget({
    ...valid,APEX_TEST_SUPABASE_REF:PRODUCTION_APEX_REF,
    APEX_TEST_SUPABASE_URL:"https://"+PRODUCTION_APEX_REF+".supabase.co",
  }),/production/);
});
test("QA fixture refuses arbitrary URLs, missing opt-in and missing credentials",()=>{
  assert.throws(()=>assertIsolatedApexTarget({...valid,
    APEX_TEST_SUPABASE_URL:"https://example.com"}),/exactly match/);
  assert.throws(()=>assertIsolatedApexTarget({...valid,
    APEX_TEST_EXECUTION:""}),/opt-in/);
  assert.throws(()=>assertIsolatedApexTarget({...valid,
    APEX_TEST_SUPABASE_SERVICE_ROLE_KEY:""}),/keys/);
  assert.throws(()=>assertIsolatedApexTarget({...valid,
    APEX_TEST_SUPABASE_REF:"short"}),/reference/);
});
test("separately named branch target passes preflight without performing any I/O",()=>{
  assert.deepEqual(assertIsolatedApexTarget(valid),{
    ref:safeRef,url:valid.APEX_TEST_SUPABASE_URL,
    publishableKey:"test-only",adminKey:"test-only-admin",
  });
});
test("hosted smoke script is syntax checked, offline and not in normal CI",()=>{
  const syntax=spawnSync(process.execPath,[
    "--check","scripts/isolated-supabase-image-smoke.mjs",
  ],{encoding:"utf8"});
  assert.equal(syntax.status,0,syntax.stderr);
  const script=readFileSync("scripts/isolated-supabase-image-smoke.mjs","utf8");
  const ci=readFileSync(".github/workflows/ci.yml","utf8");
  assert.match(script,/assertIsolatedApexTarget\(\)/);
  assert.match(script,/createSignedUploadUrl/);
  assert.match(script,/uploadToSignedUrl/);
  assert.match(script,/createSignedUrl/);
  assert.match(script,/auth\.admin\.createUser/);
  assert.match(script,/auth\.signInWithPassword/);
  assert.match(script,/email_confirm:true/);
  assert.match(script,/example\.invalid/);
  assert.doesNotMatch(ci,/isolated-supabase-image-smoke/);
});
