/**
 * Server-only production PostgreSQL connection/read-only role probe.
 * This helper must never be imported by public API handlers, browser modules,
 * or unauthenticated pages. Caller verifies platform_admin before invoking.
 * No secrets, SQL details or private database errors are returned.
 */
import "server-only";
import pg from "pg";
import {createRetailCheckoutServerPoolV1}
 from "./retail-db-server-config-v1.mjs";
import {verifyRestrictedRetailConnectionV1}
 from "./retail-restricted-db-probe-v1.mjs";

export async function probeProductionRetailConnectionV1(env){
 let pool;
 let verified=false;
 try{
  const configured=createRetailCheckoutServerPoolV1(env,pg.Pool);
  pool=configured.pool;
  const result=await verifyRestrictedRetailConnectionV1(pool);
  verified=Boolean(result?.connected===true&&
   result?.scopedRoleSwitchVerified===true&&
   result?.privateTableAccessDenied===true&&
   result?.orderWritesPerformed===false);
 }catch{
  verified=false;
 }finally{
  if(pool){
   try{await pool.end();}catch{verified=false;}
  }
 }
 return verified;
}
