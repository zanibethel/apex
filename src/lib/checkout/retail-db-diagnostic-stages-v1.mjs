/**
 * A deliberately non-sensitive, read-only diagnostic state machine.
 * No raw SQL, connection string, password, CA, server error or customer data
 * is returned. Caller supplies a production pool and the existing audited
 * permission verifier; this helper performs no order or payment operations.
 */
const PHASES=new Set(["configuration","postgres_connection","permission_checks","connection_verified","pool_cleanup"]);

export async function runRestrictedRetailDiagnosticStagesV1(createPool,verifyPermissions){
 let stage="configuration";
 let pool;
 let result=null;
 try{
  pool=await createPool();
  if(!pool||typeof pool.connect!=="function"||typeof pool.end!=="function")
   throw new Error("invalid pool");
  stage="postgres_connection";
  let client;
  try{
   client=await pool.connect();
   if(!client||typeof client.query!=="function"||
     typeof client.release!=="function")throw new Error("invalid client");
   // A harmless query verifies actual TCP/TLS and database authentication.
   const ping=await client.query("SELECT 1 AS reachable");
   if(ping?.rows?.[0]?.reachable!==1)throw new Error("invalid read-only ping");
  }finally{
   if(client)client.release();
  }
  stage="permission_checks";
  const verified=await verifyPermissions(pool);
  if(verified?.connected!==true||
   verified?.scopedRoleSwitchVerified!==true||
   verified?.privateTableAccessDenied!==true||
   verified?.orderWritesPerformed!==false)
   throw new Error("private role check not verified");
  result={verified:true,stage:"connection_verified"};
 }catch{
  result={verified:false,stage};
 }finally{
  if(pool&&typeof pool.end==="function"){
   try{await pool.end();}
   catch{result={verified:false,stage:"pool_cleanup"};}
  }
 }
 if(!result||!PHASES.has(result.stage))
  return Object.freeze({verified:false,stage:"configuration"});
 return Object.freeze(result);
}
