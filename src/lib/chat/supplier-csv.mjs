// Validated, non-AI CSV staging for the authenticated supplier chat.
// Uses the exact existing supplier import CSV contract; never edits existing
// products, publishes listings, or calls a payment service.
import {parseProductCsv} from "../catalog/product-csv.mjs";
import {parseProductTags} from "../catalog/product-tags.mjs";

export const SUPPLIER_CHAT_CSV_BATCH_SIZE=20;
const SKU=/^[A-Z0-9][A-Z0-9._-]{0,59}$/;

export function validateSupplierChatCsv(source,categories=[]){
 const result=parseProductCsv(source);
 const errors=[...result.errors];
 if(!result.rows.length&&!errors.length)errors.push("Add at least one product row to your CSV.");
 const categoriesByName=new Map((Array.isArray(categories)?categories:[])
  .filter(x=>x&&typeof x.id==="string"&&typeof x.name==="string")
  .map(x=>[x.name.trim().toLowerCase(),x.id]));
 const seen=new Set();
 const rows=[];
 for(let i=0;i<result.rows.length;i++){
  const raw=result.rows[i];
  const sku=String(raw.sku??"").trim().toUpperCase();
  const category=String(raw.category??"").trim();
  const tagResult=parseProductTags(raw.tags??"");
  if(!tagResult.ok)errors.push("Line "+(Number(raw.line)||i+2)+": "+tagResult.error);
  const line=Number(raw.line)||i+2;
  if(raw.product_id)errors.push("Line "+line+": existing product IDs cannot be updated through chat. Use the Products CSV editor.");
  if(!SKU.test(sku))errors.push("Line "+line+": enter a unique SKU to prevent repeat-import duplicates.");
  if(SKU.test(sku)&&seen.has(sku))errors.push("Line "+line+": duplicate SKU "+sku+" in this CSV.");
  seen.add(sku);
  if(category&&!categoriesByName.has(category.toLowerCase()))
   errors.push("Line "+line+": category '"+category+"' is not in your supplier store. Create that category first.");
  rows.push({
   key:"csv-line-"+line,name:raw.title,sku,description:raw.description??"",
   price:raw.price,comparePrice:raw.compare_at_price??"",
   sourceCost:raw.source_cost??"",tags:tagResult.tags,categoryId:category?categoriesByName.get(category.toLowerCase())??"": "",
   isActive:!raw.active||["yes","true","1"].includes(raw.active.toLowerCase()),
  });
 }
 return {ok:errors.length===0,errors:errors.slice(0,30),rows:errors.length?[]:rows};
}

export function planSupplierChatCsv(rows,existingProducts){
 const existing=new Map((Array.isArray(existingProducts)?existingProducts:[])
  .filter(p=>typeof p?.sku==="string")
  .map(p=>[p.sku.toUpperCase(),p]));
 const creates=[],skipped=[],conflicts=[];
 for(const row of rows){
  const match=existing.get(row.sku.toUpperCase());
  if(!match){creates.push(row);continue;}
  const existingCents=Number(match.price_cents);
  const incomingCents=Math.round(Number(row.price)*100);
  if(match.name.trim()===row.name.trim()&&existingCents===incomingCents){
   skipped.push({sku:row.sku,name:row.name,reason:"Already saved. No duplicate created."});
  }else conflicts.push({sku:row.sku,name:row.name,reason:
   "SKU already exists with different details; use the Products CSV editor to update it."});
 }
 return {creates,skipped,conflicts};
}
