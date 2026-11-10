// Deterministic supplier-scoped chat. Caller verifies fresh Supabase identity
// and owner/manager membership. No external AI, mutations or public release.
import {answerApexKnowledge} from "./apex-knowledge.mjs";
import {proposeSupplierEdit} from "./supplier-edit.mjs";

const STOP=new Set(["please","i","want","to","the","a","all","my","me","product","products","item","items","listing","listings","show","find","review","let","can","you","publish","unpublish","request","remove","set","with","price","prices","for","how","do","we","what","is","are","currently","status","stock","inventory","sku","catalog","supplier","draft","drafts","in","on","and","at","of"]);
const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supplierCatalogIntent(message){
 if(typeof message!=="string"||message.length>300||!message.trim())return "invalid";
 const q=message.toLowerCase().trim();
 if(/\b(csv|spreadsheet|bulk file)\b/.test(q)){
  if(/\b(download|get|give|send|need|provide|template|sample|blank|example)\b/.test(q)&&
     !/\b(import|upload|submit)\b/.test(q))return "csv_template";
  return "csv_import";
 }
 if(/\b(import|upload)\b.{0,45}\b(products|items|listings)\b|\bbulk upload\b/.test(q))return "csv_import";
 if(/\b(add|create|new|upload|enter)\b.{0,45}\b(product|products|listing|listings|item|items)\b|\b(product|listing)\b.{0,20}\b(add|create|new)\b/.test(q))return "create";
 if(/\b(unpublish|unlist|remove (?:from )?(?:the )?(?:catalog|storefront)|disable listing|withdraw publish)\b/.test(q))return "unpublish";
 if(/\b(publish|list (?:the |my )?product|make (?:the |my )?product(?:s)? visible|request listing)\b/.test(q))return "publish";
 if(/\b(show|find|search|review|list|look up|check|stock|inventory|price|prices|sku|catalog|products?|drafts?|status|available)\b/.test(q))return "review";
 return "help";
}
export function answerSupplierCatalogMessage(message,products=[]){
 const knowledge=answerApexKnowledge(message);
 if(knowledge&&knowledge.intent==="medical")return {...knowledge,source:"apex-supplier-code-v1"};
 const edit=proposeSupplierEdit(message,products);
 if(edit)return edit;
 const intent=supplierCatalogIntent(message);
 if(intent==="invalid")return {answer:"Please enter a short question.",items:[],source:"apex-supplier-code-v1"};
 if(intent==="csv_template")return {
  answer:"Here is the reusable Apex product CSV template. Download and fill in SKU, title and price; optional columns cover description, category, cost and active status. Upload the completed file through chat or the Products CSV editor. Importing never publishes or charges customers.",
  items:[],tool:"csv_template",source:"apex-supplier-code-v1",
 };
 if(intent==="csv_import")return {
  answer:"Choose your CSV file below. I'll validate the rows, check SKUs against your existing private catalog and show a preview before any save. Confirm to add products in batches. For updating existing items, use the full Products CSV editor. Publishing is a separate supplier action with release checks.",
  items:[],tool:"csv_import",source:"apex-supplier-code-v1",
 };
 if(intent==="create")return {answer:"Open the new-product form to save a product to your own supplier catalog. Enter its name and price, save, then add or reuse an image and set stock. It will appear immediately in your signed-in storefront preview. BTCPay setup is not required for product creation. Public sale eligibility and checkout remain separate.",items:[],link:"/supplier/catalog/bulk?new=1#apex-product-workspace",source:"apex-supplier-code-v1"};
 if(intent==="help"){
  if(knowledge)return {...knowledge,source:"apex-supplier-code-v1"};
  return {answer:"I can review products, confirm price and stock changes, publish ordinary retail products to the checkout-disabled public showcase, or upload CSV. Try ‘show my products’, ‘publish [name]’, ‘CSV template’, or ‘upload CSV’. Non-retail listings remain separately gated.",items:[],link:"/supplier/catalog/bulk",source:"apex-supplier-code-v1"};
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
   requested:p.requested,held,action,retailShowcase:p.retailShowcase===true,productUpdatedAt:p.productUpdatedAt,
   controlChangedAt:p.controlChangedAt};
 });
 const info=intent==="publish"?"Choose a saved product and confirm its listing. Eligible ordinary retail items appear on the public showcase when enabled—even at zero stock—with checkout disabled. All other products remain under separate release checks.":
  intent==="unpublish"?"Choose a product to withdraw its publication request. Confirm the change below; it does not modify checkout or historical orders.":
  "Here are the saved supplier products. Ordinary retail items can be displayed on the public, checkout-disabled showcase when the supplier has enabled them; other drafts remain private.";
 return {answer:info+(chosen.length>4?" Showing 4 of "+chosen.length+" matching products; narrow your search or open Products for the rest.":""),
  items,link:"/supplier/catalog/bulk",source:"apex-supplier-code-v1"};
}
