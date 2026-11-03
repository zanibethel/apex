// Strict validation of a privileged, database-authenticated overview RPC.
// Never treat a category's is_published flag as product-specific approval.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAdminCategories(input){
 if(!Array.isArray(input)||input.length>150)return null;
 const seen=new Set();
 const rows=[];
 for(const r of input){
  if(!r||typeof r!=="object"||Array.isArray(r)||
   !UUID.test(r.store_id)||!UUID.test(r.category_id)||
   typeof r.store_name!=="string"||!r.store_name.trim()||
   typeof r.category_name!=="string"||!r.category_name.trim()||
   typeof r.is_published!=="boolean"||
   !Number.isSafeInteger(r.product_count)||r.product_count<0||
   !Number.isSafeInteger(r.active_count)||r.active_count<0||
   r.active_count>r.product_count)return null;
  const key=r.store_id+":"+r.category_id;
  if(seen.has(key))return null;
  seen.add(key);
  rows.push(Object.freeze({
   storeId:r.store_id,categoryId:r.category_id,
   storeName:r.store_name,categoryName:r.category_name,
   published:r.is_published,productCount:r.product_count,
   activeCount:r.active_count,
  }));
 }
 return Object.freeze(rows);
}
export function categoryPublicationSummary(rows){
 if(!Array.isArray(rows))return Object.freeze({
  available:false,total:null,published:null,unpublished:null,products:null,
 });
 return Object.freeze({
  available:true,total:rows.length,
  published:rows.filter(r=>r.published).length,
  unpublished:rows.filter(r=>!r.published).length,
  products:rows.reduce((sum,r)=>sum+r.productCount,0),
 });
}
