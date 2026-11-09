// Deterministic supplier-scoped chat. Caller verifies fresh Supabase identity
// and owner/manager membership. No external AI, mutations or public release.
import {answerApexKnowledge} from "./apex-knowledge.mjs";

const STOP=new Set(["please","i","want","to","the","a","all","my","me","product","products","item","items","listing","listings","show","find","review","let","can","you","publish","unpublish","request","remove","set","with","price","prices","for","how","do","we","what","is","are","currently","status","stock","inventory","sku","catalog","supplier","draft","drafts","in","on","and","at","of"]);
const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supplierCatalogIntent(message){
 if(typeof message!=="string"||message.length>300||!message.trim())return "invalid";
 const q=message.toLowerCase().trim();
 if(/\b(unpublish|unlist|remove (?:from )?(?:the )?(?:catalog|storefront)|disable listing|withdraw publish)\b/.test(q))return "unpublish";
 if(/\b(publish|list (?:the |my )?product|make (?:the |my )?product(?:s)? visible|request listing)\b/.test(q))return "publish";
 if(/\b(show|find|search|review|list|look up|check|stock|inventory|price|prices|sku|catalog|products?|drafts?|status|available)\b/.test(q))return "review";
 return "help";
}
export function answerSupplierCatalogMessage(message,products=[]){
 const knowledge=answerApexKnowledge(message);
 if(knowledge&&knowledge.intent==="medical")return {...knowledge,source:"apex-supplier-code-v1"};
 const intent=supplierCatalogIntent(message);
 if(intent==="invalid")return {answer:"Please enter a short question.",items:[],source:"apex-supplier-code-v1"};
 if(intent==="help"){
  if(knowledge)return {...knowledge,source:"apex-supplier-code-v1"};
  return {answer:"I can review your own saved product names, listed prices, stock status, and publication requests. Try ‘show my products’, ‘find [name]’, or ‘publish [name]’. Every publication request needs your confirmation and separate storefront eligibility checks.",items:[],link:"/supplier/catalog/bulk",source:"apex-supplier-code-v1"};
 }
 const rows=Array.isArray(products)?products.filter(x=>x&&typeof x==="object"&&UUID.test(x.id)&&
  typeof x.name==="string"&&typeof x.sku==="string"&&Number.isSafeInteger(x.priceCents)&&x.priceCents>=0&&
  x.currency==="USD"&&typeof x.active==="boolean"&&typeof x.requested==="boolean"&&
  typeof x.productUpdatedAt==="string"&&
  (x.controlChangedAt===null||typeof x.controlChangedAt==="string")).slice(0,100):[];
 const q=message.toLowerCase().replace(/[^a-z0-9\s-]/g," ");
 const words=q.split(/\s+/).filter(w=>w.length>1&&!STOP.has(w));
 const match=words.length?rows.filter(p=>words.every(w=>p.name.toLowerCase().includes(w)||
  p.sku.toLowerCase().includes(w)||(typeof p.category==="string"&&p.category.toLowerCase().includes(w)))):rows;
 const chosen=intent==="unpublish"?match.filter(p=>p.requested):match;
 console.log("TEMP SUPPLIER SELECT DEBUG",{intent,productLength:products.length,validRows:rows.length,words,match:match.length});
 if(!chosen.length)return {answer:intent==="unpublish"
  ?"No matching products currently have an active supplier publication request. Try the exact saved name or open your Products workspace."
  :"No matching saved product found in your authorized store. Try a shorter name, SKU, or category.",
  items:[],link:"/supplier/catalog/bulk",source:"apex-supplier-code-v1"};
 const items=chosen.slice(0,4).map(p=>{
  const held=p.adminGate==="hold"||p.adminGate==="review_required"||p.republishBlocked===true;
  const action=intent==="publish"&&!p.requested&&p.active&&!held?"publish":
   intent==="unpublish"&&p.requested?"unpublish":null;
  return {id:p.id,name:p.name,sku:p.sku,price:money(p.priceCents),
   availability:p.active?(p.availableStock===null?"Stock unverified":p.availableStock>0?"Stock recorded":"Sold out"):"Inactive draft",
   href:"/supplier/catalog/preview/"+p.id,
   requested:p.requested,held,action,productUpdatedAt:p.productUpdatedAt,
   controlChangedAt:p.controlChangedAt};
 });
 const info=intent==="publish"?"Choose a saved product below and confirm its publication request. This does not make it publicly available: product and supplier release checks remain in force.":
  intent==="unpublish"?"Choose a product to withdraw its publication request. Confirm the change below; it does not modify checkout or historical orders.":
  "Here are your saved products from the signed-in supplier workspace. These records are private; ‘Requested’ is not the same as publicly published.";
 return {answer:info+(chosen.length>4?" Showing 4 of "+chosen.length+" matching products; narrow your search or open Products for the rest.":""),
  items,link:"/supplier/catalog/bulk",source:"apex-supplier-code-v1"};
}
