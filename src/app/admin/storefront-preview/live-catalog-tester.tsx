"use client";

import {useMemo,useState,type FormEvent} from "react";
import {OfferTile} from "@/components/catalog/offer-tile";
import {answerPrivateCatalogPreview} from "@/lib/catalog/private-catalog-test.mjs";
import "./live-catalog-tester.css";

export type PrivateTestProduct={
 id:string;name:string;sku:string;description:string|null;category:string;
 priceCents:number;compareAtCents:number|null;currency:string;active:boolean;
 published:boolean;availableStock:number|null;imageUrl?:string;
};
type AnswerItem={id:string;name:string;price:string;availability:string};
type Answer={answer:string;items:AnswerItem[]};

export function LiveCatalogTester({products}:{products:PrivateTestProduct[]}){
 const [query,setQuery]=useState("");
 const [category,setCategory]=useState("");
 const [activity,setActivity]=useState("all");
 const [question,setQuestion]=useState("");
 const [response,setResponse]=useState<Answer|null>(null);
 const categories=useMemo(()=>[...new Set(products.map(p=>p.category))].sort(),[products]);
 const filtered=useMemo(()=>products.filter(p=>
   (!category||p.category===category)&&
   (activity==="all"||(activity==="active"?p.active:!p.active))&&
   (!query.trim()||[p.name,p.sku,p.category,p.description??""]
     .some(value=>value.toLowerCase().includes(query.trim().toLowerCase())))
 ),[products,query,category,activity]);
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const text=question.trim();
  if(!text)return;
  const result=answerPrivateCatalogPreview(text,products) as Answer;
  setResponse(result);
 }
 return <>
  <section className="apex-live-test-panel" aria-label="Test private catalog and chat">
   <p className="eyebrow">PRIVATE LIVE-SITE TEST</p>
   <h2>Try product questions — no AI calls</h2>
   <p>Test real saved names, categories and listed prices without publishing anything. This is an authenticated admin-only view; no customer sees these draft products.</p>
   <form onSubmit={submit} className="apex-live-test-chat-form">
    <label htmlFor="apex-live-test-question">Ask about a saved product</label>
    <div>
     <input id="apex-live-test-question" type="text" maxLength={300}
       placeholder="e.g. Show me products or ask a name" value={question}
       onChange={event=>setQuestion(event.target.value)}/>
     <button type="submit" disabled={!question.trim()}>Ask</button>
    </div>
   </form>
   {response&&<div className="apex-live-test-reply" role="status" aria-live="polite">
    <p>{response.answer}</p>
    {response.items?.length>0&&<ul>{response.items.map(item=><li key={item.id}>
      <strong>{item.name}</strong>
      <span>{item.price} · {item.availability}</span>
    </li>)}</ul>}
   </div>}
  </section>
  <section className="apex-live-test-panel" aria-label="Filter private saved products">
   <p className="eyebrow">CUSTOMER-STYLE CARD PREVIEW · PRIVATE</p>
   <h2>Browse all saved products</h2>
   <div className="apex-live-test-filters">
    <label>Search products
     <input type="search" maxLength={100} value={query} placeholder="Name, SKU, description"
       onChange={event=>setQuery(event.target.value)}/></label>
    <label>Category
     <select value={category} onChange={event=>setCategory(event.target.value)}>
      <option value="">All categories</option>
      {categories.map(name=><option key={name} value={name}>{name}</option>)}
     </select></label>
    <label>Product status
     <select value={activity} onChange={event=>setActivity(event.target.value)}>
      <option value="all">All drafts and records</option>
      <option value="active">Active records</option>
      <option value="inactive">Inactive records</option>
     </select></label>
   </div>
   <p role="status" aria-live="polite">Showing {filtered.length} of {products.length} saved products. All are private until independently released.</p>
  </section>
  {filtered.length===0?<p className="notice">No saved products match those filters.</p>:
   <div className="apex-offer-gallery">
    {filtered.map(product=><div className="apex-offer-gallery-item" key={product.id}>
      <OfferTile name={product.name} sku={product.sku}
       description={product.description} category={product.category}
       priceCents={product.priceCents} compareAtCents={product.compareAtCents}
       imageUrl={product.imageUrl} currency={product.currency}
       availableStock={product.availableStock??undefined}/>
      <div className="apex-offer-gallery-meta">
       <p className="notice"><strong>PRIVATE TEST RECORD</strong> · {product.active?"Active":"Inactive"} · {product.published?"Supplier publish intent":"Not published"}</p>
       <p className="notice">Not for purchase · Checkout unavailable</p>
      </div>
    </div>)}
   </div>}
 </>;
}
