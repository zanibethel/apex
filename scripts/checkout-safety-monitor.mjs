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
    const { rows: [counts] } = await client.query(`
      select
       (select count(*)::int from apex_internal.retail_order_engine_gate) as gate_rows,
       (select count(*)::int from apex_internal.retail_order_engine_gate where enabled) as enabled_gates,
       (select count(*)::int from apex_internal.retail_order_holds where state='held_no_payment' and expires_at < now()-interval '3 minutes') as overdue_holds,
       (select count(*)::int from apex_internal.retail_order_delivery_envelopes e join apex_internal.retail_order_holds h on h.id=e.order_id and h.store_id=e.store_id where h.state in ('cancelled_no_payment','expired_no_payment') and h.ended_at < now()-interval '75 minutes') as stale_envelopes
    `);
    const { rows: jobs } = await client.query(`
      select j.jobname, j.schedule, j.active, j.username,
       max(d.end_time) filter(where d.status='succeeded') as last_success,
       count(d.runid) filter(where d.status is distinct from 'succeeded' and d.start_time >= now()-interval '30 minutes')::int as recent_failures
      from cron.job j left join cron.job_run_details d on d.jobid=j.jobid
      where j.jobname=any($1::text[])
      group by j.jobid,j.jobname,j.schedule,j.active,j.username
    `, [names.map(n=>n[0])]);
    await client.query("ROLLBACK");
    const alerts = assess({...counts, jobs}, observed);
    if (alerts.length) {
      process.stderr.write("APEX CHECKOUT SAFETY INCIDENT " + observed.toISOString() + "\n" + alerts.join("\n") + "\n" +
        "Aggregate counts: overdue=" + counts.overdue_holds + ", stale_delivery=" + counts.stale_envelopes + "\n");
      process.exitCode = 1;
    }
  } finally { await client.end(); }
}
if (process.argv[1]?.endsWith("checkout-safety-monitor.mjs")) {
  main().catch(() => { process.stderr.write("APEX MONITORING ACCESS UNAVAILABLE " + new Date().toISOString() + "\n"); process.exitCode = 1; });
}
