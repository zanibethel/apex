/**
 * Issue #217 — defensive parser for supplier-scoped synthetic delivery
 * status. There is no actual provider dispatch, regardless of status text.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const STATES=new Set(['not_prepared','prepared','simulated_accepted',
 'simulated_delivered','simulated_failed']);
const EXACT=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function parseSupplierReviewEmailStatus(value,storeId,reportDay){
 if(!UUID.test(storeId??'')||
  !/^\d{4}-\d{2}-\d{2}$/.test(reportDay??'')||
  !EXACT(value,['schema_version','store_id','report_day',
   'state','attempt_count','attachment_available_in_dashboard',
   'transport_mode','real_provider_accepted','real_inbox_delivered',
   'mail_sent','shipping_modified'])||
  value.schema_version!==1||value.store_id!==storeId||
  value.report_day!==reportDay||!STATES.has(value.state)||
  !Number.isInteger(value.attempt_count)||
  value.attempt_count<0||value.attempt_count>5||
  (value.state==='not_prepared'&&value.attempt_count!==0)||
  (value.state!=='not_prepared'&&value.attempt_count<1)||
  value.attachment_available_in_dashboard!==true||
  value.transport_mode!=='synthetic_only'||
  value.real_provider_accepted!==false||
  value.real_inbox_delivered!==false||
  value.mail_sent!==false||value.shipping_modified!==false)
  return null;
 return Object.freeze({
  storeId,reportDay,state:value.state,
  attempts:value.attempt_count,
  simulatedOnly:true,actualMessageSent:false,
  providerAcceptanceVerified:false,inboxDeliveryVerified:false,
 });
}
