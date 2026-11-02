import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("scripts/btcpay-ephemeral-prism-forwarding.mjs","utf8");
const workflow=readFileSync(".github/workflows/btcpay-upstream-regtest.yml","utf8");
const rls=readFileSync(".github/workflows/payout-rls.yml","utf8");

test("actual Prism regtest calls scoped GET-only provider inventory after independent wallets",()=>{
  assert.ok(source.includes("readRegtestGreenfieldInventory"));
  assert.ok(source.includes("btcpay.store.canviewinvoices:"));
  assert.ok(source.includes("btcpay.store.canviewpayouts:"));
  assert.match(source,/permissions\.length/);
  assert.ok(source.includes("await verifyReadOnlyProviderInventory(basic,p,invoice.id,walletProof)"));
  assert.ok(source.includes("x.destination===w.destination && sats(x.payoutAmount)===w.amount"));
  assert.ok(source.includes("read-only-greenfield-inventory-confirmed"));
  assert.ok(workflow.includes("APEX_BTCPAY_TEST_NETWORK: regtest"));
  assert.ok(workflow.includes('APEX_BTCPAY_EPHEMERAL: "true"'));
});

test("recovery events stay disposable, immutable, and hold never releases via workflow",()=>{
  assert.ok(rls.includes("apex_btcpay_test_sync_recovery_audit_REVIEW_ONLY.sql"));
  assert.ok(rls.includes("btcpay-sync-recovery-audit.sql"));
  const sql=readFileSync("database/sql/apex_btcpay_test_sync_recovery_audit_REVIEW_ONLY.sql","utf8");
  assert.ok(sql.includes("create trigger btcpay_test_recovery_events_immutable"));
  assert.ok(sql.includes("blocked_incident_after_change"));
  assert.ok(sql.includes("review_only_candidate_checkout_stays_held"));
  assert.doesNotMatch(sql,/update public\.payout_rules set status\s*=\s*'active'/i);
  assert.doesNotMatch(sql,/delete from public\.btcpay_test_split_sync_holds/i);
});
