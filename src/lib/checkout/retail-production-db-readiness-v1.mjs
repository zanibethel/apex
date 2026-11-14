/**
 * Server-only production PostgreSQL staged read-only diagnostics.
 * Caller must verify platform-admin Supabase session BEFORE invoking.
 * The result is a safe stage enum, never a secret or raw connection error.
 */
import "server-only";
import pg from "pg";
import {createRetailCheckoutServerPoolV1}
 from "./retail-db-server-config-v1.mjs";
import {verifyRestrictedRetailConnectionV1}
 from "./retail-restricted-db-probe-v1.mjs";
import {runRestrictedRetailDiagnosticStagesV1}
 from "./retail-db-diagnostic-stages-v1.mjs";

export async function checkProductionRetailConnectionV1(env){
 return runRestrictedRetailDiagnosticStagesV1(
  ()=>createRetailCheckoutServerPoolV1(env,pg.Pool).pool,
  verifyRestrictedRetailConnectionV1
 );
}

// Compatibility for any existing private caller. Only a verified result
// counts as success; never coerce an incomplete or failed stage to true.
export async function probeProductionRetailConnectionV1(env){
 const result=await checkProductionRetailConnectionV1(env);
 return result.verified===true;
}
