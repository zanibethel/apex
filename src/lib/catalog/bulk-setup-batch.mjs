// Private draft editor only. Stage local changes for explicit Save selected.
// This does NOT call Supabase, set listing intent, bypass admin holds or approve
// product publication. All existing fields are preserved except the one chosen.
const rowKey=/^[A-Za-z0-9_-]{1,80}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function stageSelectedBulkSetup(rows,selectedKeys,change,categoryIds=[]){
 const fail=reason=>({ok:false,reason,rows,changedKeys:[],selected:0});
 if(!Array.isArray(rows)||rows.length>250||!Array.isArray(selectedKeys)||
    selectedKeys.length<1||selectedKeys.length>250||
    !selectedKeys.every(k=>typeof k==="string"&&rowKey.test(k))||
    new Set(selectedKeys).size!==selectedKeys.length||
    !Array.isArray(categoryIds))return fail("Choose valid products.");
 const allKeys=new Set();
 for(const row of rows){
  if(!row||typeof row!=="object"||typeof row.key!=="string"||
     !rowKey.test(row.key)||allKeys.has(row.key))return fail("Product list is inconsistent.");
  allKeys.add(row.key);
 }
 const keys=new Set(selectedKeys);
 if(selectedKeys.some(k=>!allKeys.has(k)))return fail("Selected products changed. Refresh before continuing.");
 if(!change||typeof change!=="object"||
   !["fill-missing-category","mark-active"].includes(change.kind))
  return fail("Choose a supported setup change.");
 if(change.kind==="fill-missing-category"&&
   (!uuid.test(change.categoryId??"")||
    !categoryIds.includes(change.categoryId)))
  return fail("Choose a category available in this supplier store.");
 const changedKeys=[];
 const staged=rows.map(row=>{
  if(!keys.has(row.key))return row;
  if(change.kind==="fill-missing-category"){
   // Never overwrite a reviewed or previously assigned category.
   if(typeof row.categoryId!=="string"||row.categoryId.trim()!=="")
    return row;
   changedKeys.push(row.key);
   return {...row,categoryId:change.categoryId,needsSave:true};
  }
  if(row.isActive!==false)return row;
  changedKeys.push(row.key);
  return {...row,isActive:true,needsSave:true};
 });
 return {ok:true,reason:null,rows:staged,changedKeys,selected:keys.size};
}
