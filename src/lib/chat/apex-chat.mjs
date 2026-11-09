import {answerApexKnowledge} from "./apex-knowledge.mjs";
// CoOperative's zero-model, read-only Apex storefront assistant.
// Accept ONLY the public Apex catalog projection. No writes, private context, or AI providers.
const SAFE_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const common=new Set(["categories","category","show","browse","all","what","are","is","the","a","an","of","for","me","your","you","do","have","show","find","can","i","please","tell","about","price","prices","cost","costs","much","how","product","products","item","items","available","availability","stock","in","on","and","with","from","apex","catalog","list","looking"]);
const money=c=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
function validItems(items){
 if(!Array.isArray(items))return [];
 return items.filter(x=>x&&typeof x==="object"&&SAFE_UUID.test(x.id)&&typeof x.name==="string"&&x.name.length>0&&x.name.length<=120&&Number.isSafeInteger(x.priceCents)&&x.priceCents>0&&x.priceCents<=999999999&&x.currency==="USD"&&["sold_out","in_stock"].includes(x.availability)).slice(0,72);
}
export function answerApexEmbed(message,products=[],catalogState="unavailable"){
 if(typeof message!=="string"||!message.trim()||message.length>300)return {answer:"Please send a short text question.",items:[]};
 const knowledge=answerApexKnowledge(message);
 if(knowledge)return knowledge;
 const q=message.toLowerCase().trim().replace(/\s+/g," ");
 if(catalogState!=="connected")
  return {intent:"catalog-unavailable",answer:"I can answer general site questions, but the approved public catalog is not available right now. I cannot verify a specific listing or price.",items:[],link:"/catalog"};
 const items=validItems(products);
 if(items.length===0)return {intent:"catalog-empty",answer:"No publicly approved listings are available for me to show. Supplier drafts and unreleased items are private.",items:[],link:"/catalog"};
 const normalized=q.replace(/[^a-z0-9 -]/g," ");
 const words=normalized.split(/\s+/).filter(w=>w.length>1&&!common.has(w));
 const matching=words.length ? items.filter(x=>{
  const name=x.name.toLowerCase();
  const category=(typeof x.categoryName==="string"?x.categoryName:"").toLowerCase();
  return words.every(w=>name.includes(w)||category.includes(w));
 }) : items;
 if(matching.length===0)return {intent:"catalog-no-match",answer:"I couldn't verify a matching item in the currently loaded public catalog. Try a shorter name, SKU or category, or browse the full catalog. I won't invent a listing.",items:[],link:"/catalog"};
 const visible=matching.slice(0,4).map(x=>({
  name:x.name,price:money(x.priceCents),
  availability:x.availability==="in_stock"?"In stock (checkout unavailable)":"Currently unavailable",
  href:"/catalog/product/"+x.id
 }));
 return {intent:"catalog-search",answer:words.length?"Here are matching publicly approved listings. Listed prices and stock status come from Apex's approved catalog:":"Here are a few publicly approved listings. For more options, browse the catalog:",items:visible,link:"/catalog"};
}
