/**
 * Server-only PostgreSQL runtime for the separately gated NONPAYABLE endpoint.
 * Never import into a client component, and never use service_role credentials.
 * The caller owns pool shutdown in finally, including failed admissions.
 */
import "server-only";
import pg from "pg";
import {createRetailCheckoutServerPoolV1}
 from "./retail-db-server-config-v1.mjs";
import {createRetailPostgresAdmissionDependenciesV1}
 from "./retail-postgres-admission-dependencies-v1.mjs";

export function createNonpayableRetailProductionRuntimeV1(env){
 const configuration=createRetailCheckoutServerPoolV1(env,pg.Pool);
 const dependencies=createRetailPostgresAdmissionDependenciesV1({
  pool:configuration.pool,
 });
 return Object.freeze({
  pool:configuration.pool,dependencies,
  fingerprintKey:configuration.fingerprintKey,
  deliveryKey:configuration.deliveryKey,
  deliveryKeyReference:configuration.deliveryKeyReference,
 });
}
