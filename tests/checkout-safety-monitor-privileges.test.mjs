import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const aggregate = readFileSync("supabase/migrations/20261114234344_apex_checkout_monitor_aggregate_v1.sql", "utf8");
const login = readFileSync("supabase/migrations/20261114234546_apex_checkout_monitor_login_identity_v1.sql", "utf8");
const worker = readFileSync("scripts/checkout-safety-monitor.mjs", "utf8");
const workflow = readFileSync(".github/workflows/checkout-safety-monitor.yml", "utf8");
test("monitor only exposes private aggregate function", () => {
  assert.match(aggregate, /security definer/i);
  assert.match(aggregate, /set search_path=pg_catalog/i);
  assert.match(aggregate, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(aggregate, /grant execute on function apex_internal\.checkout_monitor_snapshot_v1\(\) to apex_checkout_monitor/i);
  assert.doesNotMatch(aggregate, /grant\s+(?:all|select|insert|update|delete)\s+on\s+table/i);
  assert.doesNotMatch(aggregate, /set\s+enabled\s*=\s*true/i);
});
test("monitor identity has no password or elevated grants", () => {
  assert.match(login, /password null/i);
  assert.match(login, /nosuperuser/i);
  assert.match(login, /nobypassrls/i);
  assert.match(login, /default_transaction_read_only=on/i);
  assert.doesNotMatch(login, /grant\s+(?:all|select|insert|update|delete)\s+on\s+table/i);
});
test("monitor never queries order tables directly from GitHub", () => {
  assert.match(worker, /select apex_internal\.checkout_monitor_snapshot_v1\(\) as snapshot/);
  assert.doesNotMatch(worker, /from apex_internal\.retail_order_holds/i);
  assert.doesNotMatch(worker, /from cron\.job/i);
});
test("monitor alerts are deduplicated and recovery is explicit", () => {
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /if: success\(\)/);
  assert.match(workflow, /existing = open\.find/);
  assert.match(workflow, /state: "closed"/);
  assert.match(workflow, /issues: write/);
});
