/**
 * One-time operator-run READ-ONLY production connectivity check.
 * Requires the four existing server-only retail secrets, CA PEM, and a
 * dedicated restricted app login URL in the local process environment.
 * Never exposes credentials, queries orders, enables commerce, or writes.
 */
import {createRetailCheckoutServerPoolV1}
 from "../src/lib/checkout/retail-db-server-config-v1.mjs";
import {verifyRestrictedRetailConnectionV1}
 from "../src/lib/checkout/retail-restricted-db-probe-v1.mjs";
import pg from "pg";

let pool;
try{
 const configured=createRetailCheckoutServerPoolV1(process.env,pg.Pool);
 pool=configured.pool;
 const result=await verifyRestrictedRetailConnectionV1(pool);
 process.stdout.write(JSON.stringify(result)+"\n");
}catch{
 process.stderr.write("Restricted checkout read-only connection verification failed. No checkout change was made.\n");
 process.exitCode=1;
}finally{
 if(pool)try{await pool.end();}catch{process.exitCode=1;}
}
