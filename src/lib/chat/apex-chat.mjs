import {answerApexKnowledge} from "./apex-knowledge.mjs";
// Code-first search over already-approved public listings only; never use private drafts.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ignored=new Set(["categories","category","show","browse","all","what","are","is","the","a","an","of","for","me","your","you","do","have","find","can","i","please","tell","about","price","prices","cost","costs","much","how","product","products","item","items","available","availability","stock","in","on","and","with","from","apex","catalog","list","looking","any","something","related","suitable","some","kind","types","type","want","need","like","that","these","those","sell","recommend","recommendations","options","under","below","less","than","up","to","dollars","dollar","cheapest","lowest","expensive","most","highest","showing"]);
const money=value=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value/100);
function normalize(value){
 return String(value??"").toLowerCase().replace(/\bt[\s-]?shirts?\b/g,"tshirt")
  .replace(/\bworkouts?\b/g,"working out").replace(/\btees?\b/g,"tshirt")
  .replace(/\bshirts?\b/g,"tshirt")
  .replace(/\bmen['’]?s\b/g,"men").replace(/\bwomen['’]?s\b/g,"women")
  .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
function matchesWord(haystack,word){
 return normalize(haystack).split(" ").some(part=>part===word||(word.length>=4&&part.startsWith(word)));
}
function approvedItems(items){
 if(!Array.isArray(items))return [];
 return items.filter(x=>x&&typeof x==="object"&&UUID.test(x.id)&&
  typeof x.name==="string"&&x.name.length>0&&x.name.length<=120&&
  Number.isSafeInteger(x.priceCents)&&x.priceCents>0&&x.priceCents<=999999999&&
  x.currency==="USD"&&["sold_out","in_stock"].includes(x.availability)&&
  (x.description===undefined||typeof x.description==="string")&&
  (x.tags===undefined||(Array.isArray(x.tags)&&x.tags.length<=12&&
    x.tags.every(t=>typeof t==="string"&&t.length>0&&t.length<=40)))).slice(0,240);
}
export function answerApexEmbed(message,products=[],catalogState="unavailable"){
 if(typeof message!=="string"||!message.trim()||message.length>300)
  return {answer:"Please send a short text question.",items:[]};
 const knowledge=answerApexKnowledge(message);
 if(knowledge)return knowledge;
 if(catalogState!=="connected")
  return {intent:"catalog-unavailable",answer:"I can answer general site questions, but the approved public catalog is not available right now. I cannot verify a specific listing or price.",items:[],link:"/catalog"};
 const items=approvedItems(products);
 if(!items.length)return {intent:"catalog-empty",answer:"No publicly approved listings are available for me to show. Supplier drafts and unreleased items are private.",items:[],link:"/catalog"};
 const query=normalize(message);
 const budget=query.match(/\b(?:under|below|less than|up to)\s*\$?\s*(\d{1,7})(?:\s+dollars?)?\b/);
 const budgetCents=budget?Number(budget[1])*100:null;
 const inStock=/\b(?:in stock|ready to ship)\b/.test(query);
 const lowPrice=/\b(?:cheapest|lowest price|least expensive|low cost)\b/.test(query);
 const highPrice=/\b(?:most expensive|highest price)\b/.test(query);
 const cleaned=query.replace(/\b(?:under|below|less than|up to)\s*\$?\s*\d{1,7}(?:\s+dollars?)?\b/g,"")
  .replace(/\b(?:in stock|ready to ship)\b/g,"");
 const words=cleaned.split(" ").filter(w=>w.length>1&&!ignored.has(w));
 const results=items.map((item,index)=>{
  const tags=Array.isArray(item.tags)?item.tags:[];
  const wordScore=word=>{
   if(tags.some(t=>matchesWord(t,word)))return 9;
   if(matchesWord(item.name,word))return 7;
   if(matchesWord(item.categoryName,word))return 4;
   if(matchesWord(item.description,word))return 2;
   return 0;
  };
  const scores=words.map(wordScore);
  return {item,index,score:scores.reduce((a,b)=>a+b,0),matches:scores.every(x=>x>0)};
 }).filter(row=>row.matches&&(!inStock||row.item.availability==="in_stock")&&
  (budgetCents===null||row.item.priceCents<budgetCents));
 if(!results.length)return {intent:"catalog-no-match",answer:"I couldn't verify a matching publicly listed product. Try a different phrase, broader category, or price range. I won't invent a listing.",items:[],link:"/catalog"};
 results.sort((a,b)=>lowPrice?a.item.priceCents-b.item.priceCents||b.score-a.score:
  highPrice?b.item.priceCents-a.item.priceCents||b.score-a.score:
  b.score-a.score||a.index-b.index);
 const visible=results.slice(0,4).map(({item})=>({
  name:item.name,price:money(item.priceCents),
  availability:item.availability==="in_stock"?"In stock (checkout unavailable)":"Currently unavailable",
  href:"/catalog/product/"+item.id
 }));
 return {intent:"catalog-search",answer:words.length?
  "I found publicly listed products matching your search across titles, descriptions, categories or tags:":
  "Here are publicly listed products matching your filters. Checkout remains unavailable.",
  items:visible,link:"/catalog"};
}
