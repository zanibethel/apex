/**
 * Server-only checkout PostgreSQL runtime. This creates a real node-postgres
 * pool for a previously verified Supabase connection URL, and pairs the
 * already-tested one-connection transaction with independently verified
 * customer identity. NEVER import from client components or API checkout
 * until admission, guest identity, origin/CSRF and abuse controls are complete.
 */
import pg from "pg";
import {createRetailCheckoutServerPoolV1}
 from "./retail-db-server-config-v1.mjs";
import {createRetailPostgresTransactionV1}
 from "./retail-postgres-transaction-v1.mjs";
import {verifyPrivateRetailCustomerSessionV1}
 from "./verified-customer-session-v1.mjs";
import {preparePrivateRetailHoldWithDeliveryV1}
 from "./private-retail-hold-coordinator-v1.mjs";

const invalid=()=>new Error("Retail checkout runtime unavailable");
export function createRetailPostgresRuntimeV1(env){
 const configured=createRetailCheckoutServerPoolV1(env,pg.Pool);
 const withTransaction=createRetailPostgresTransactionV1({
  pool:configured.pool,
 });
 return Object.freeze({
  async prepareTrustedOrder(raw,{authClient,trustedStoreId}={}){
   if(typeof trustedStoreId!=="string"||!authClient)throw invalid();
   const verifiedSession=await verifyPrivateRetailCustomerSessionV1(authClient);
   return preparePrivateRetailHoldWithDeliveryV1(raw,{
    trustedStoreId,
    verifiedSession,
    fingerprintKey:configured.fingerprintKey,
    deliveryKey:configured.deliveryKey,
    deliveryKeyReference:configured.deliveryKeyReference,
    withTransaction,
   });
  },
  async close(){await configured.pool.end();},
 });
}
