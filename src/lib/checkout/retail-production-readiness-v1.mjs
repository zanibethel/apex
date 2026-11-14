/**
 * Read-only release acknowledgment checks. These values are NOT independent
 * evidence of the provider settings: the operator must verify WAF, Auth, and
 * private PostgreSQL jobs outside the application before setting them.
 * All checks are default OFF and contain no secrets or customer data.
 */
import {isRetailNonpayableSubmissionEnabledV1}
 from "./retail-nonpayable-route-release-v1.mjs";

export const CHECKS_V1=Object.freeze([
 Object.freeze({id:"waf",label:"WAF IP rate limit",
  key:"APEX_RETAIL_WAF_IP_RULE_REVIEWED",
  value:"nonpayable-post-ip-20-in-10m-v1",
  help:"Verify applied Vercel WAF POST-only path rule, 20 requests per IP per 10 minutes, 429. Inspect traffic evidence and rollback."}),
 Object.freeze({id:"auth",label:"Customer Auth and signup review",
  key:"APEX_RETAIL_CUSTOMER_AUTH_REVIEWED",
  value:"confirmed-invite-policy-v1",
  help:"Confirm hosted email verification, invitation/signup policy, account recovery and Auth abuse protection settings."}),
 Object.freeze({id:"privacy",label:"Encrypted delivery retention review",
  key:"APEX_RETAIL_DELIVERY_RETENTION_REVIEWED",
  value:"terminal-1h-purge-v1",
  help:"Verify approved private cleanup migration, one-hour terminal retention, restricted DELETE grants and cron monitoring."}),
 Object.freeze({id:"expiry",label:"Unpaid hold expiration review",
  key:"APEX_RETAIL_HOLD_EXPIRY_REVIEWED",
  value:"pgcron-expiry-monitored-v1",
  help:"Verify pg_cron execution, idempotent stock release, backlog monitoring and failure alerting using isolated fixtures."}),
]);
export function evaluateRetailProductionReadinessV1(env){
 const data=env&&typeof env==="object"&&!Array.isArray(env)?env:{};
 const checks=CHECKS_V1.map(v=>Object.freeze({
  id:v.id,label:v.label,passed:data[v.key]===v.value,help:v.help,
 }));
 const reviewed=checks.every(c=>c.passed);
 const requested=isRetailNonpayableSubmissionEnabledV1(data);
 return Object.freeze({
  checks:Object.freeze(checks),reviewed,requested,routeEligible:reviewed&&requested,
  missing:checks.filter(c=>!c.passed).length,
 });
}
export function isRetailProductionReviewApprovedV1(env){
 return evaluateRetailProductionReadinessV1(env).reviewed;
}
