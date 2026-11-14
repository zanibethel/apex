import { test } from "node:test";
import assert from "node:assert/strict";
import { assess } from "../scripts/checkout-safety-monitor.mjs";
const now = new Date("2026-11-14T22:00:00Z");
const healthy = () => ({gate_rows:1,enabled_gates:0,overdue_holds:0,stale_envelopes:0,jobs:[
 {jobname:"apex-retail-unpaid-holds-expire-v1",schedule:"* * * * *",active:true,username:"postgres",last_success:"2026-11-14T21:59:00Z",recent_failures:0},
 {jobname:"apex-retail-delivery-purge-v1",schedule:"*/5 * * * *",active:true,username:"postgres",last_success:"2026-11-14T21:55:00Z",recent_failures:0}
]});
test("healthy checks are silent",()=>assert.deepEqual(assess(healthy(),now),[]));
test("gate, overdue and retention trigger incidents",()=>{const v=healthy();v.enabled_gates=1;v.overdue_holds=2;v.stale_envelopes=3;assert.equal(assess(v,now).length,3)});
test("missing purge is an incident",()=>{const v=healthy();v.jobs.pop();assert.equal(assess(v,now).length,1)});
test("wrong owner and schedule are incidents",()=>{const v=healthy();v.jobs[0].username="other";v.jobs[1].schedule="* * * * *";assert.equal(assess(v,now).length,2)});
test("stale successes and failures are incidents",()=>{const v=healthy();v.jobs[0].last_success="2026-11-14T21:45:00Z";v.jobs[1].recent_failures=1;assert.equal(assess(v,now).length,2)});
