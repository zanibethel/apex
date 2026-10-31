const labels={
 submitted:"Submitted for internal review",
 resubmitted:"Resubmitted after changes",
 changes_requested:"Changes requested by admin",
 approved_internal:"Approved internally",
 review_invalidated:"Review invalidated after an edit",
};
export function reviewEventLabel(eventType) {
 return labels[eventType]??"Review activity";
}
export function reviewEventActorLabel(eventType,actorId) {
 if(eventType==="review_invalidated")return actorId?"Product editor":"System update";
 if(eventType==="submitted"||eventType==="resubmitted")return "Supplier";
 if(eventType==="changes_requested"||eventType==="approved_internal")return "Platform admin";
 return "Review activity";
}
export function reviewHistoryKey(storeId,productId) {
 return String(storeId)+":"+String(productId);
}
// Input is already a server-scoped, RLS-protected, newest-first result.
// Group by BOTH store and product ID to avoid mixing similarly named SKUs
// across independent suppliers. Never use a product name as an identity.
export function groupReviewHistory(events,perProductLimit=20) {
 const groups=new Map();
 if(!Array.isArray(events))return groups;
 for(const event of events){
   if(!event||!event.store_id||!event.product_id)continue;
   const key=reviewHistoryKey(event.store_id,event.product_id);
   const existing=groups.get(key)??[];
   if(existing.length<perProductLimit)existing.push(event);
   groups.set(key,existing);
 }
 return groups;
}
