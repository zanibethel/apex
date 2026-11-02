import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("scripts/btcpay-ephemeral-prism-forwarding.mjs","utf8");
const workflow=readFileSync(".github/workflows/btcpay-upstream-regtest.yml","utf8");
const rls=readFileSync(".github/workflows/payout-rls.yml","utf8");

test("actual Prism regtest calls scoped GET-only provider inventory after independent wallets",()=>{
  assert.match(source,/readRegtestGreenfieldInventory/);
  assert.match(source,/btcpay\\.store\\.canviewinvoices:/);
  assert.match(source,/btcpay\\.store\\.canviewpayouts:/);
  assert.match(source,/permissions\\.length/);
  assert.match(source,/await verifyReadOnlyProviderInventory\\(basic,p,invoice\\.id,walletProof\\)/);
  assert.match(source,/x\\.destination===w\\.destination && sats\\(x\\.payoutAmount\\)===w\\.amount/);
  assert.match(source,/read-only-greenfield-inventory-confirmed/);
  assert.match(workflow,/APEX_BTCPAY_TEST_NETWORK: regtest/);
  assert.match(workflow,/APEX_BTCPAY_EPHEMERAL: "true"/);
});

test("recovery events stay disposable, immutable, and hold never releases via workflow",()=>{
  assert.match(rls,/apex_btcpay_test_sync_recovery_audit_REVIEW_ONLY\\.sql/);
  assert.match(rls,/btcpay-sync-recovery-audit\\.sql/);
  const sql=readFileSync("database/sql/apex_btcpay_test_sync_recovery_audit_REVIEW_ONLY.sql","utf8");
  assert.match(sql,/create trigger btcpay_test_recovery_events_immutable/);
  assert.match(sql,/blocked_incident_after_change/);
  assert.match(sql,/review_only_candidate_checkout_stays_held/);
  assert.doesNotMatch(sql,/update public\\.payout_rules set status\\s*=\\s*'active'/i);
  assert.doesNotMatch(sql,/delete from public\\.btcpay_test_split_sync_holds/i);
});
