/**
 * Exact-match, local-only catalog taxonomy review.
 * No product/category mutation, publication, authorization or checkout.
 * A supplier must explicitly stage AND save with existing authenticated RPC.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assessReviewedTaxonomy(rows,proposal,categories,storeId,expectedStoreId){
 const failure=(error)=>Object.freeze({
  ready:false,error,missingCategories:[],conflicts:[],unmatched:[],
  proposals:0,alreadyAssigned:0,held:0,extras:0,changes:[],
 });
 if(!UUID.test(storeId||"")||storeId!==expectedStoreId)
  return failure("This taxonomy applies only to the original Apex catalog.");
 if(!Array.isArray(rows)||rows.length>250||!Array.isArray(proposal)||
    proposal.length!==63||!Array.isArray(categories))
  return failure("The complete product or category list cannot be verified.");
 // Newly added, still-unsaved cards may coexist with the reviewed catalog.
 // Verify their unique draft keys, then exclude only those cards from the
 // 63-saved-product match. Never silently skip a row that claims to be saved.
 const byId=new Map(),seenKeys=new Set();
 for(const row of rows){
  if(!row||!UUID.test(row.key||"")||seenKeys.has(row.key))
   return failure("Product keys are incomplete or duplicated.");
  seenKeys.add(row.key);
  if(row.id===undefined||row.id===null||row.id===""){
   if(row.needsSave!==true)
    return failure("Unsaved product identity could not be verified.");
   continue;
  }
  if(!UUID.test(row.id)||row.id!==row.key||byId.has(row.id))
   return failure("Saved product identities are incomplete or duplicated.");
  byId.set(row.id,row);
 }
 const byName=new Map();
 for(const c of categories){
  if(!c||!UUID.test(c.id||"")||typeof c.name!=="string"||
   byName.has(c.name))
   return failure("Store category identities are unavailable or duplicated.");
  byName.set(c.name,c.id);
 }
 const seen=new Set(),changes=[],conflicts=[],unmatched=[],missing=new Set();
 let alreadyAssigned=0,held=0,proposals=0;
 for(const item of proposal){
  if(!item||!UUID.test(item.id||"")||seen.has(item.id)||
     typeof item.sku!=="string"||typeof item.name!=="string"||
     !["Keep existing","Suggested","Review identity",
       "Review composition","Review evidence","Review strength"].includes(item.status))
   return failure("The reviewed taxonomy document is inconsistent.");
  seen.add(item.id);
  // Count the immutable proposal independently of the mutable product row.
  // Changed titles/SKUs must remain visible as unmatched rather than
  // disappearing behind an unexpected-count error.
  if(item.category===null){
   if(!item.status.startsWith("Review"))
    return failure("Uncategorized review requirements are not verified.");
   held++;
  }else{
   if(typeof item.category!=="string"||!item.category.trim()||
      item.status.startsWith("Review"))
    return failure("A review-held item was unexpectedly categorized.");
   proposals++;
  }
  const row=byId.get(item.id);
  if(!row||row.sku!==item.sku||row.name!==item.name){
   unmatched.push(item.name);
   continue;
  }
  if(item.category===null)continue;
  const targetId=byName.get(item.category);
  if(!targetId){missing.add(item.category);continue;}
  if(row.categoryId===targetId){
   alreadyAssigned++;
   continue;
  }
  if(typeof row.categoryId!=="string"||row.categoryId.trim()!==""){
   conflicts.push(item.name);
   continue;
  }
  changes.push(Object.freeze({key:row.key,id:row.id,sku:row.sku,
   categoryId:targetId,categoryName:item.category,name:row.name}));
 }
 if(proposals!==50||held!==13||seen.size!==63)
  return failure("Unexpected product counts in reviewed taxonomy.");
 const missingCategories=[...missing].sort();
 const ready=!unmatched.length&&!missingCategories.length&&!conflicts.length&&
   changes.length>0;
 return Object.freeze({
  ready,error:unmatched.length?"Product details changed: review the updated catalog.":
   conflicts.length?"Existing category assignments differ from the reviewed plan.":
   missingCategories.length?"Create the missing categories in Admin first.":null,
  missingCategories,conflicts,unmatched,proposals,alreadyAssigned,held,
  extras:rows.filter(row=>!seen.has(row.id)).length,
  changes:Object.freeze(changes),
 });
}

export function stageReviewedTaxonomy(rows,assessment){
 if(!Array.isArray(rows)||!assessment?.ready||
    !Array.isArray(assessment.changes)||assessment.changes.length===0)
  return {ok:false,rows,changedKeys:[],reason:assessment?.error??"No verified assignments to stage."};
 const byKey=new Map(assessment.changes.map(c=>[c.key,c]));
 if(byKey.size!==assessment.changes.length)
  return {ok:false,rows,changedKeys:[],reason:"The staged product list contains duplicate keys."};
 for(const c of assessment.changes){
  const row=rows.find(r=>r?.key===c.key);
  if(!row||row.id!==c.id||row.sku!==c.sku||
     row.categoryId!==""||row.name!==c.name)
   return {ok:false,rows,changedKeys:[],reason:"Product details changed; refresh the mapping."};
 }
 return {
  ok:true,
  rows:rows.map(r=>byKey.has(r.key)?{
    ...r,categoryId:byKey.get(r.key).categoryId,needsSave:true,
   }:r),
  changedKeys:[...byKey.keys()],
  reason:null,
 };
}
