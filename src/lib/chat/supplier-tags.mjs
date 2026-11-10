import {parseProductTags,sameProductTags} from "../catalog/product-tags.mjs";
// Propose supplier tag changes without writing; the authenticated route owns CAS and mutations.
const norm=value=>String(value??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function parseTagRequest(message){
 if(typeof message!=="string"||message.length>300)return null;
 const q=message.trim();
 let m=q.match(/^(?:set|replace|update)\s+tags?\s+(?:for|on)\s+(.+?)\s+(?:to|as)\s+(.+)$/i);
 if(m)return {kind:"set",product:m[1].trim(),input:m[2].trim()};
 m=q.match(/^add\s+tags?\s+(.+?)\s+to\s+(.+)$/i);
 if(m)return {kind:"add",product:m[2].trim(),input:m[1].trim()};
 m=q.match(/^remove\s+tags?\s+(.+?)\s+from\s+(.+)$/i);
 if(m)return {kind:"remove",product:m[2].trim(),input:m[1].trim()};
 m=q.match(/^(?:clear|remove all)\s+tags?\s+(?:for|on|from)\s+(.+)$/i);
 if(m)return {kind:"clear",product:m[1].trim(),input:""};
 return null;
}
export function proposeSupplierTags(message,products=[]){
 const request=parseTagRequest(message);
 if(!request)return null;
 const items=Array.isArray(products)?products.filter(p=>p&&typeof p.name==="string"&&typeof p.sku==="string"&&
  typeof p.productUpdatedAt==="string"&&Array.isArray(p.tags)):[];
 const chosen=items.filter(p=>norm(p.name)===norm(request.product)||norm(p.sku)===norm(request.product));
 if(chosen.length!==1)return {answer:chosen.length?"More than one product matched; use its unique SKU.":
  "I couldn't find that exact saved product. Use its full name or SKU to change tags.",
  items:[],source:"apex-supplier-code-v1"};
 const product=chosen[0];
 if(product.published)return {answer:"Use the authorized Products editor to change an already-released product.",items:[],source:"apex-supplier-code-v1"};
 const proposed=parseProductTags(request.input);
 if(!proposed.ok)return {answer:proposed.error,items:[],source:"apex-supplier-code-v1"};
 let next=[];
 if(request.kind==="clear")next=[];
 if(request.kind==="set")next=proposed.tags;
 if(request.kind==="add"){
  const appended=parseProductTags([...product.tags,...proposed.tags]);
  if(!appended.ok)return {answer:appended.error,items:[],source:"apex-supplier-code-v1"};
  next=appended.tags;
 }
 if(request.kind==="remove"){
  next=product.tags.filter(tag=>!proposed.tags.includes(tag));
 }
 if(sameProductTags(product.tags,next))return {answer:"Those are already the saved tags for "+product.name+". No changes needed.",items:[],source:"apex-supplier-code-v1"};
 return {answer:"Review the proposed discovery tags for "+product.name+". These help shoppers find your product after it is approved for public display. Confirm before saving; this does not publish the item or enable checkout.",
  items:[{id:product.id,name:product.name,sku:product.sku,price:new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(product.priceCents/100),
   availability:product.active?"Private catalog":"Inactive draft",href:"/supplier/catalog/preview/"+product.id,
   requested:product.requested,held:product.held,action:"edit_tags",tags:product.tags,
   tagExpected:product.tags,tagTarget:next,productUpdatedAt:product.productUpdatedAt,
   controlChangedAt:product.controlChangedAt??null}],
  link:"/supplier/catalog/bulk",source:"apex-supplier-code-v1"};
}
