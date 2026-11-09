// Private admin-only preview responder. The caller must have already verified
// the admin session and RLS-scoped product read. This module has no network
// calls, AI providers, mutations, or public-release effects.
import {answerApexKnowledge} from "../chat/apex-knowledge.mjs";

const TOKEN_SKIP=new Set(["the","what","are","is","do","you","have","show","find","me","your","a","an","all","products","product","listings","listing","items","item","with","price","prices","much","how","does","cost","for","please","see","some","any","from","catalog","in","on","and","at","apex","i","want","looking","available","availability","stock","compare","by","can","get","tell","about","of","to"]);
const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(v/100);
const valid=rows=>Array.isArray(rows)?rows.filter(p=>p&&typeof p==="object"&&typeof p.id==="string"&&
 /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(p.id)&&typeof p.name==="string"&&
 Number.isSafeInteger(p.priceCents)&&p.priceCents>=0&&p.currency==="USD"&&
 typeof p.category==="string"&&typeof p.active==="boolean"&&
 (p.availableStock===null||Number.isSafeInteger(p.availableStock))).slice(0,100):[];

export function answerPrivateCatalogPreview(message,products=[]){
 if(typeof message!=="string"||!message.trim()||message.length>300)
  return {answer:"Enter a short question.",items:[],intent:"invalid"};
 // Safety and site policies remain code-only; private product data is never
 // routed to CoOperative or any other external AI service.
 const knowledge=answerApexKnowledge(message);
 if(knowledge&&!["public-products","public-stock","pricing-policy"].includes(knowledge.intent))
  return {...knowledge,items:[]};
 const rows=valid(products);
 if(rows.length===0)return {intent:"preview-empty",answer:"No saved products are available in this authorized preview.",items:[]};
 const words=message.toLowerCase().replace(/[^a-z0-9\s-]/g," ").split(/\s+/)
  .filter(w=>w.length>1&&!TOKEN_SKIP.has(w));
 const found=words.length?rows.filter(p=>words.every(w=>
  p.name.toLowerCase().includes(w)||p.category.toLowerCase().includes(w)||
  (typeof p.sku==="string"&&p.sku.toLowerCase().includes(w)))):rows;
 if(found.length===0)return {intent:"preview-no-match",answer:"No saved product matches that wording. Try a shorter product name or category. This preview does not invent listings.",items:[]};
 const items=found.slice(0,4).map(p=>({
  id:p.id,name:p.name,price:money(p.priceCents),
  availability:p.active?(p.availableStock!==null&&p.availableStock<=0?"No recorded available stock":"Active draft"):"Inactive draft",
 }));
 return {intent:"private-preview",answer:"Private live-site test: these are saved Apex product records, not publicly approved listings. Checkout and ordering are disabled.",items};
}
