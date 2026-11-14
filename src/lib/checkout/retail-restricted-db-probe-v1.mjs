/**
 * Read-only restricted checkout connectivity check.
 *
 * A production operator may run this with server-only environment secrets.
 * It never enables the order gate, writes order/stock data, reads delivery,
 * or logs credentials or private DB error details. Not callable by customers.
 *
 * This checks the application connection and the NOINHERIT -> executor switch,
 * with a BEGIN READ ONLY transaction that is always rolled back.
 */
const fail=()=>new Error("Restricted checkout connection could not be verified");

const appRole="apex_retail_checkout_app";
const executorRole="apex_retail_checkout_executor";

export async function verifyRestrictedRetailConnectionV1(pool){
 if(!pool||typeof pool.connect!=="function")throw fail();
 let client;
 let inTransaction=false;
 try{
  client=await pool.connect();
  if(!client||typeof client.query!=="function"||
   typeof client.release!=="function")throw fail();
  const first=await client.query(`
   select current_user as role_name,
     current_database() as database_name,
     pg_has_role(current_user,'apex_retail_checkout_executor','MEMBER')
       as may_set_executor,
     pg_has_role(current_user,'apex_retail_checkout_executor','USAGE')
       as inherits_executor,
     has_table_privilege(current_user,'public.inventory_items','UPDATE')
       as may_update_inventory,
     has_table_privilege(current_user,'apex_internal.retail_order_holds','SELECT')
       as may_read_private_orders,
     (select rolcanlogin and not rolsuper and not rolbypassrls
        and not rolinherit from pg_roles where rolname=current_user)
       as restricted_login
  `);
  if(first?.rows?.length!==1)throw fail();
  const initial=first.rows[0];
  if(initial.role_name!==appRole||initial.database_name!=="postgres"||
    initial.may_set_executor!==true||
    initial.inherits_executor!==false||
    initial.may_update_inventory!==false||
    initial.may_read_private_orders!==false||
    initial.restricted_login!==true)throw fail();

  await client.query("BEGIN READ ONLY");
  inTransaction=true;
  await client.query("SET LOCAL ROLE apex_retail_checkout_executor");
  const check=await client.query(`
    select current_user as role_name,
      has_table_privilege(current_user,'public.inventory_items','UPDATE')
        as may_update_inventory,
      has_table_privilege(current_user,'apex_internal.retail_order_holds','SELECT')
        as may_read_private_orders,
      has_function_privilege(current_user,
        'apex_internal.checkout_worker_reserve_retail_hold(uuid,uuid,text,jsonb,text,text,bigint)',
        'EXECUTE') as may_execute_restricted_reserve
  `);
  if(check?.rows?.length!==1)throw fail();
  const state=check.rows[0];
  if(state.role_name!==executorRole||
   state.may_update_inventory!==false||
   state.may_read_private_orders!==false||
   state.may_execute_restricted_reserve!==true)throw fail();
  await client.query("ROLLBACK");
  inTransaction=false;
  return Object.freeze({
   connected:true,
   database:"postgres",
   applicationRole:appRole,
   scopedRoleSwitchVerified:true,
   privateTableAccessDenied:true,
   orderWritesPerformed:false,
  });
 }catch{
  throw fail();
 }finally{
  if(inTransaction&&client){
   try{await client.query("ROLLBACK");}catch{}
  }
  if(client){
   try{client.release();}catch{}
  }
 }
}
