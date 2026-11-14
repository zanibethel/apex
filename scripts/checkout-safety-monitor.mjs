import pg from "pg";
const { Client } = pg;
const names = [
  ["apex-retail-unpaid-holds-expire-v1", "* * * * *", 10],
  ["apex-retail-delivery-purge-v1", "*/5 * * * *", 15],
];
export function assess(rows, now = new Date()) {
  const alerts = [];
  if (Number(rows.gate_rows) !== 1 || Number(rows.enabled_gates) !== 0) alerts.push("private order gate state unexpected");
  if (Number(rows.overdue_holds) > 0) alerts.push("overdue unpaid holds: " + rows.overdue_holds);
  if (Number(rows.stale_envelopes) > 0) alerts.push("retained terminal delivery envelopes: " + rows.stale_envelopes);
  for (const [name, schedule, maxMinutes] of names) {
    const jobs = rows.jobs.filter(j => j.jobname === name);
    if (jobs.length !== 1 || !jobs[0].active || jobs[0].schedule !== schedule || jobs[0].username !== "postgres") {
      alerts.push(name + ": missing, inactive, wrong schedule or owner");
      continue;
    }
    const j = jobs[0];
    if (!j.last_success || (now - new Date(j.last_success)) / 60000 > maxMinutes) alerts.push(name + ": success stale or absent");
    if (Number(j.recent_failures) > 0) alerts.push(name + ": recent unsuccessful runs: " + j.recent_failures);
  }
  return alerts;
}
async function main() {
  const observed = new Date();
  const connectionString = process.env.APEX_MONITOR_DATABASE_URL;
  if (!connectionString) throw Error("Monitoring access unavailable");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000, statement_timeout: 12000, query_timeout: 15000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const { rows: [row] } = await client.query("select apex_internal.checkout_monitor_snapshot_v1() as snapshot");
    if (!row || !row.snapshot || !Array.isArray(row.snapshot.jobs)) throw Error("Invalid aggregate snapshot");
    const { gate_rows, enabled_gates, overdue_holds, stale_envelopes, jobs } = row.snapshot;
    await client.query("ROLLBACK");
    const alerts = assess({gate_rows, enabled_gates, overdue_holds, stale_envelopes, jobs}, observed);
    if (alerts.length) {
      process.stderr.write("APEX CHECKOUT SAFETY INCIDENT " + observed.toISOString() + "\n" + alerts.join("\n") + "\n" +
        "Aggregate counts: overdue=" + overdue_holds + ", stale_delivery=" + stale_envelopes + "\n");
      process.exitCode = 1;
    }
  } finally { await client.end(); }
}
if (process.argv[1]?.endsWith("checkout-safety-monitor.mjs")) {
  main().catch(() => { process.stderr.write("APEX MONITORING ACCESS UNAVAILABLE " + new Date().toISOString() + "\n"); process.exitCode = 1; });
}
