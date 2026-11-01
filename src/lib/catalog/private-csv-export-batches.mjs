// Export only products with persisted IDs. The importer accepts at most
// 100 rows per CSV, so never create an export that cannot be imported again.
// Batches retain the editor's current order and values (which may be unsaved).
export const PRIVATE_PRODUCT_CSV_EXPORT_BATCH_SIZE=100;

export function privateProductCsvExportBatches(rows){
 const saved=Array.isArray(rows)?rows.filter(row=>Boolean(row?.id)):[];
 const batches=[];
 for(let i=0;i<saved.length;i+=PRIVATE_PRODUCT_CSV_EXPORT_BATCH_SIZE){
  const items=saved.slice(i,i+PRIVATE_PRODUCT_CSV_EXPORT_BATCH_SIZE);
  const start=i+1,end=i+items.length;
  const filename=saved.length<=PRIVATE_PRODUCT_CSV_EXPORT_BATCH_SIZE
   ?"apex-private-products.csv"
   :`apex-private-products-${String(start).padStart(3,"0")}-${String(end).padStart(3,"0")}.csv`;
  batches.push({start,end,filename,rows:items});
 }
 return batches;
}
