/**
 * Real SQL transaction adapter for private retail holds.
 *
 * Inject a server-owned PostgreSQL Pool with connect()/query()/release().
 * The adapter does not create a pool, read secrets, or expose a web endpoint.
 * Never pass a Supabase REST client here: four independent REST calls are NOT
 * one transaction. The client must use a dedicated least-privilege DB identity
 * authorized only to execute the three scoped private worker wrappers.
 * No table-level grants or public/private API-role privileges are required. Customer checkout remains HTTP 503.
 *
 * No payload, SQL parameters or returned PII may be logged.
 */
const problem=()=>new Error("Retail transaction unavailable");
const field=(row)=>{
 if(!row||typeof row!=="object"||Array.isArray(row)||
  !Object.hasOwn(row,"payload")||row.payload===null||
  typeof row.payload!=="object"||Array.isArray(row.payload))
  throw problem();
 return row.payload;
};
const assertClient=client=>client&&typeof client.query==="function"&&
 typeof client.release==="function";
const assertPool=pool=>pool&&typeof pool.connect==="function";
const rows=async(client,text,params)=>{
 const result=await client.query(text,params);
 if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
  throw problem();
 return field(result.rows[0]);
};

/**
 * Only the tx argument delivered to the callback can issue the four steps.
 * A failed step rolls back order, immutable lines, inventory and delivery.
 */
export function createRetailPostgresTransactionV1({pool}={}){
 if(!assertPool(pool))throw problem();
 return async function withTransaction(work){
  if(typeof work!=="function")throw problem();
  const client=await pool.connect();
  if(!assertClient(client))throw problem();
  let began=false;
  try{
   await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
   began=true;
   // Constant statements. No browser-controlled SQL identifiers or strings.
   await client.query("SET LOCAL statement_timeout = '8s'");
   await client.query("SET LOCAL lock_timeout = '3s'");
   await client.query("SET LOCAL idle_in_transaction_session_timeout = '8s'");
   const tx=Object.freeze({
    quoteSource:({items,code})=>rows(client,
     "select public.get_public_retail_cart_quote_source($1::jsonb,$2::text) as payload",
     [JSON.stringify(items),code]),
    reserve:({storeId,requestId,requestFingerprint,items,
      code,boxSize,expectedTotalCents})=>rows(client,
     "select apex_internal.checkout_worker_reserve_retail_hold($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::text,$7::bigint) as payload",
     [storeId,requestId,requestFingerprint,JSON.stringify(items),
      code,boxSize,expectedTotalCents]),
    attachDelivery:({storeId,orderId,keyReference,nonce,ciphertext,
      authTag})=>rows(client,
     "select apex_internal.checkout_worker_attach_retail_delivery($1::uuid,$2::uuid,$3::text,$4::bytea,$5::bytea,$6::bytea) as payload",
     [storeId,orderId,keyReference,nonce,ciphertext,authTag]),
    receipt:({storeId,orderId})=>rows(client,
     "select apex_internal.checkout_worker_get_retail_receipt($1::uuid,$2::uuid) as payload",
     [storeId,orderId]),
   });
   const value=await work(tx);
   await client.query("COMMIT");
   began=false;
   return value;
  }catch{
   if(began){
    try{await client.query("ROLLBACK");}catch{}
   }
   // Do not return/log underlying DB details (or PII) to callers.
   throw problem();
  }finally{
   client.release();
  }
 };
}
