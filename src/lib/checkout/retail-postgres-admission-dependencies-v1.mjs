/**
 * Private server-only collaborators for the nonpayable hold coordinator.
 *
 * An existing restricted `pg.Pool` is supplied by the trusted server runtime.
 * No hostname, service-role JWT or password is accepted from the browser.
 * Both calls are transaction-scoped SET LOCAL ROLE operations. No table grants.
 *
 * The budget is an atomic one-row-per-subject PostgreSQL upsert. It is
 * independent of serverless-instance memory and survives app restarts.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION="nonpayable_retail_order_v1";
const fail=()=>new Error("Retail admission dependency unavailable");
const goodUuid=v=>typeof v==="string"&&UUID.test(v)&&
 v.toLowerCase()!=="00000000-0000-0000-0000-000000000000";
const goodItems=items=>{
 if(!Array.isArray(items)||items.length<1||items.length>8)return false;
 const ids=new Set();let units=0;
 for(const entry of items){
  if(!entry||typeof entry!=="object"||Array.isArray(entry)||
   Object.keys(entry).length!==2||
   !goodUuid(entry.product_id)||ids.has(entry.product_id.toLowerCase())||
   !Number.isInteger(entry.quantity)||entry.quantity<1||
   entry.quantity>10)return false;
  ids.add(entry.product_id.toLowerCase());
  units+=entry.quantity;
  if(units>50)return false;
 }
 return true;
};

async function runAsExecutor(pool,readonly,statement,parameters){
 let client;
 let transaction=false;
 try{
  client=await pool.connect();
  if(!client||typeof client.query!=="function"||
   typeof client.release!=="function")throw fail();
  await client.query(readonly?"BEGIN READ ONLY":"BEGIN");
  transaction=true;
  await client.query("SET LOCAL ROLE apex_retail_checkout_executor");
  await client.query("SET LOCAL statement_timeout = '6s'");
  await client.query("SET LOCAL lock_timeout = '2s'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout = '6s'");
  const result=await client.query(statement,parameters);
  if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
   throw fail();
  const value=result.rows[0].payload;
  await client.query("COMMIT");
  transaction=false;
  return value;
 }catch{
  if(transaction&&client){
   try{await client.query("ROLLBACK");}catch{}
  }
  // Do not expose underlying PostgreSQL errors or supplied identifiers.
  throw fail();
 }finally{
  if(client){
   try{client.release();}catch{}
  }
 }
}

/**
 * These exact callback signatures plug into the existing private controller.
 * The returned data are whitelisted primitives only; never expose raw
 * worker RPC results to a browser or log untrusted products/subjects.
 */
export function createRetailPostgresAdmissionDependenciesV1({pool}={}){
 if(!pool||typeof pool.connect!=="function")throw fail();
 const consumeDurableAdmissionBudget=async ({subjectId,operation}={})=>{
  if(!goodUuid(subjectId)||operation!==OPERATION)throw fail();
  const value=await runAsExecutor(pool,false,
   "select apex_internal.checkout_worker_consume_retail_budget_v1($1::uuid,$2::text) as payload",
   [subjectId.toLowerCase(),OPERATION]);
  if(typeof value!=="boolean")throw fail();
  return Object.freeze({allowed:value,durable:true});
 };
 const resolveTrustedRetailStore=async ({items,subjectId}={})=>{
  if(!goodUuid(subjectId)||!goodItems(items))throw fail();
  const value=await runAsExecutor(pool,true,
   "select apex_internal.checkout_worker_resolve_retail_store_v1($1::jsonb) as payload",
   [JSON.stringify(items)]);
  if(!value||typeof value!=="object"||Array.isArray(value)||
   typeof value.verified!=="boolean")throw fail();
  if(value.verified!==true)return Object.freeze({verified:false});
  if(!goodUuid(value.storeId))throw fail();
  return Object.freeze({verified:true,storeId:value.storeId.toLowerCase()});
 };
 return Object.freeze({consumeDurableAdmissionBudget,resolveTrustedRetailStore});
}
