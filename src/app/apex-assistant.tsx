"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {SupplierChatCsvTools} from "./supplier/catalog/chat-csv-tools";
import "./apex-assistant.css";

type Action="publish"|"unpublish"|"edit_price"|"edit_stock"|"edit_tags";
type Item={
 id?:string;name:string;price:string;availability:string;href:string;
 sku?:string;requested?:boolean;held?:boolean;retailShowcase?:boolean;action?:Action|null;
 editTarget?:number;editExpected?:number;
 tags?:string[];tagExpected?:string[];tagTarget?:string[];
 productUpdatedAt?:string;controlChangedAt?:string|null;
};
type Message={id:number;from:"user"|"assistant";text:string;items?:Item[];link?:string;tool?:"csv_template"|"csv_import"};
const safeLink=(value:unknown):value is string=>
 typeof value==="string"&&(
  ["/catalog","/supplier","/account/sign-in","/supplier/orders","/cart","/supplier/catalog/bulk","/supplier/catalog/bulk?new=1#apex-product-workspace"].includes(value)||
  /^\/supplier\/catalog\/preview\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
 );
const linkLabel=(link:string)=>link==="/supplier/catalog/bulk?new=1#apex-product-workspace"?"Add a product":
 link==="/supplier/catalog/bulk"?"Manage products":
 link==="/supplier"?"Open supplier workspace":link==="/account/sign-in"?"Account sign in":
 link==="/supplier/orders"?"Supplier orders":link==="/cart"?"View cart":"Browse catalog";

export function ApexAssistant({supplierCanManage=false}:{supplierCanManage?:boolean}){
 const [open,setOpen]=useState(false);
 const [draft,setDraft]=useState("");
 const [sending,setSending]=useState(false);
 const [pending,setPending]=useState<{item:Item;action:Action}|null>(null);
 const [messages,setMessages]=useState<Message[]>([
  {id:0,from:"assistant",text:supplierCanManage
   ?"Supplier catalog assistant ready. Review products, update tags or prices and stock with confirmation, publish eligible retail listings without checkout, add products, or upload CSV."
   :"Hi! Ask for products by name, description, tags, price, or category. No purchases or catalog changes here."},
 ]);
 function append(message:Message){
  setMessages(current=>[...current.slice(-19),message]);
 }
 async function sendQuestion(raw:string){
  const message=raw.trim().slice(0,300);
  if(!message||sending)return;
  setDraft("");
  setPending(null);
  setSending(true);
  const id=Date.now();
  append({id,from:"user",text:message});
  try{
   const response=await fetch(supplierCanManage?"/api/assistant/supplier":"/api/assistant",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(supplierCanManage?{operation:"ask",message}:{message}),cache:"no-store",
   });
   const data:unknown=await response.json();
   if(!response.ok){
    const error=data&&typeof data==="object"&&(data as {error?:unknown}).error;
    throw new Error(typeof error==="string"?error:"The assistant is busy right now. Please try again.");
   }
   if(!data||typeof data!=="object"||typeof (data as {answer?:unknown}).answer!=="string")
    throw new Error("The assistant couldn't respond. Please try again.");
   const result=data as {answer:string;items?:Item[];link?:string;tool?:string};
   append({
    id:id+1,from:"assistant",text:result.answer.slice(0,1200),
    items:Array.isArray(result.items)?result.items.slice(0,4):[],
    link:safeLink(result.link)?result.link:undefined,
    tool:supplierCanManage&&(result.tool==="csv_template"||result.tool==="csv_import")?result.tool:undefined,
   });
  }catch(error){
   append({id:id+1,from:"assistant",text:error instanceof Error?error.message:"The assistant is currently unavailable."});
  }finally{setSending(false);}
 }
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  void sendQuestion(draft);
 }
 async function confirm(){
  if(!pending||!supplierCanManage||sending)return;
  const {item,action}=pending;
  if(!item.id||!item.productUpdatedAt)return;
  const editing=action==="edit_price"||action==="edit_stock";
  const tagEditing=action==="edit_tags";
  if(editing&&(!Number.isSafeInteger(item.editTarget)||!Number.isSafeInteger(item.editExpected)))return;
  if(tagEditing&&(!Array.isArray(item.tagExpected)||!Array.isArray(item.tagTarget)))return;
  if(!editing&&!tagEditing&&typeof item.requested!=="boolean")return;
  setSending(true);
  setPending(null);
  try{
   const response=await fetch("/api/assistant/supplier",{
    method:"POST",headers:{"Content-Type":"application/json"},
    cache:"no-store",
    body:JSON.stringify(tagEditing?{
     operation:"confirm_tags",productId:item.id,expectedProductUpdatedAt:item.productUpdatedAt,
     expectedTags:item.tagExpected,targetTags:item.tagTarget,
    }:editing?{
     operation:"confirm_edit",editKind:action==="edit_price"?"price":"stock",
     productId:item.id,expectedProductUpdatedAt:item.productUpdatedAt,
     expectedValue:item.editExpected,targetValue:item.editTarget,
    }:{
     operation:"confirm",action,productId:item.id,
     expectedRequested:item.requested,
     productUpdatedAt:item.productUpdatedAt,
     controlChangedAt:item.controlChangedAt??null,
    }),
   });
   const data:unknown=await response.json();
   if(!response.ok){
    const error=data&&typeof data==="object"&&(data as {error?:unknown}).error;
    throw new Error(typeof error==="string"?error:"Publication request was not saved.");
   }
   if(!data||typeof data!=="object"||(data as {ok?:unknown}).ok!==true||
     typeof (data as {answer?:unknown}).answer!=="string")
    throw new Error("Could not verify the publication response. Check the Products workspace.");
   const answer=(data as {answer:string}).answer;
   const publicVisible=(data as {public?:unknown}).public===true;
   const id=Date.now();
   setMessages(current=>[
    ...current.slice(-19).map(m=>({...m,items:m.items?.map(i=>i.id===item.id?{
      ...i,action:null,
      requested:(editing||tagEditing)?i.requested:action==="publish",
      tags:tagEditing?item.tagTarget:i.tags,
      price:action==="edit_price"&&item.editTarget!==undefined?
       new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(item.editTarget/100):i.price,
      availability:action==="edit_stock"&&item.editTarget!==undefined?
       item.editTarget===0?"Sold out":"Stock recorded":i.availability,
    }:i)})),
    {id,from:"assistant",text:answer.slice(0,1200),link:publicVisible?"/catalog":"/supplier/catalog/bulk"},
   ]);
  }catch(error){
   append({id:Date.now(),from:"assistant",text:error instanceof Error?error.message:"Could not save request."});
  }finally{setSending(false);}
 }
 return <section className="apex-assistant" aria-label="Apex assistant">
  {open&&<div className="apex-assistant-panel" role="region" aria-label="Apex chat messages">
   <div className="apex-assistant-head">
    <div><strong>{supplierCanManage?"Supplier Catalog Assistant":"Apex Assistant"}</strong><small>Powered by CoOperative Chat</small></div>
    <button type="button" onClick={()=>{setOpen(false);setPending(null);}} aria-label="Close assistant">×</button>
   </div>
   <div className="apex-assistant-thread" role="log" aria-live="polite" aria-relevant="additions text">
    {messages.map((message,index)=><div key={index} className={"apex-assistant-message "+message.from}>
     <p>{message.text}</p>
     {message.items?.map(item=><div key={item.href} className="apex-assistant-item">
      {safeLink(item.href)?<Link href={item.href}>{item.name}</Link>:<strong>{item.name}</strong>}
      <span>{item.sku?"SKU "+item.sku+" · ":""}{item.price} · {item.availability}</span>
      {supplierCanManage&&item.tags&&item.tags.length>0&&<small>Tags: {item.tags.join(", ")}</small>}
      {supplierCanManage&&item.id&&<small>{item.held?"Admin review/hold applies · ":""}
        {item.retailShowcase
        ?(item.requested?"Retail showcase selected · Checkout disabled":"Retail showcase eligible · Not listed")
        :item.requested?"Supplier publication requested · Not public":"Private saved product · Not public"}</small>}
      {supplierCanManage&&item.action&&!pending&&<button
       type="button" className="apex-assistant-item-action" disabled={sending}
       onClick={()=>setPending({item,action:item.action!})}>
       {item.action==="publish"?(item.retailShowcase?"Review public listing":"Review publish request"):
        item.action==="unpublish"?"Review unpublish request":"Review change"}
      </button>}
     </div>)}
     {supplierCanManage&&message.tool&&<SupplierChatCsvTools uploadEnabled={message.tool==="csv_import"}/>}
     {message.link&&<Link className="apex-assistant-more" href={message.link}>
      {linkLabel(message.link)} →
     </Link>}
    </div>)}
    {pending&&<div className="apex-assistant-confirm" role="group" aria-label="Confirm supplier listing request">
     <strong>{pending.action==="publish"?(pending.item.retailShowcase?"Publish retail listing":"Request publication"):
      pending.action==="unpublish"?"Withdraw publication request":
      pending.action==="edit_price"?"Confirm price change":
      pending.action==="edit_tags"?"Confirm discovery tags":"Confirm stock change"}?</strong>
     <p>{pending.item.name}</p>
     <p>{pending.action==="publish"
      ?(pending.item.retailShowcase
       ?"This makes the neutral retail product visible on the public Apex showcase, even if sold out. Checkout and payments remain unavailable. Admin holds still override it."
       :"This saves the supplier's preference only. The product will NOT become publicly visible until separate release checks pass.")
      :pending.action==="unpublish"
      ?"This withdraws the supplier request. Public release is not controlled by this chat."
      :pending.action==="edit_tags"
      ?"Existing tags: "+(pending.item.tagExpected?.join(", ")||"none")+" → New tags: "+
       (pending.item.tagTarget?.join(", ")||"none")+
       ". Only eligible public products are searchable by these tags. Checkout remains disabled."
      :"Current "+(pending.action==="edit_price"?"price":"on-hand stock")+": "+
       (pending.action==="edit_price"?"$"+((pending.item.editExpected??0)/100).toFixed(2):String(pending.item.editExpected))+
       " → "+(pending.action==="edit_price"?"$"+((pending.item.editTarget??0)/100).toFixed(2):String(pending.item.editTarget))+
       ". Your supplier product will be updated after confirmation. This does not publish it or enable payments."}</p>
     <div>
      <button type="button" disabled={sending} onClick={confirm}>{sending?"Saving…":"Confirm request"}</button>
      <button type="button" disabled={sending} onClick={()=>setPending(null)}>Cancel</button>
     </div>
    </div>}
    {sending&&<p className="apex-assistant-thinking" role="status">Checking your request…</p>}
   </div>
   <div className="apex-assistant-prompts" aria-label="Try a chat question">
    {(supplierCanManage?["Show my products","Show products tagged working out","CSV template"]:
      ["Show workout T-shirts","Products under $30","What is in stock?"]).map(prompt=><button
       type="button" key={prompt} disabled={sending} onClick={()=>{void sendQuestion(prompt);}}>{prompt}</button>)}
   </div>
   {supplierCanManage&&<div className="apex-assistant-csv-shortcut">
    <button type="button" disabled={sending} onClick={()=>append({id:Date.now(),from:"assistant",text:"CSV import tools are ready. Download a template or select a completed CSV to preview before saving private supplier drafts.",tool:"csv_import"})}>CSV upload / template</button>
   </div>}
   <form onSubmit={submit} className="apex-assistant-form">
    <label htmlFor="apex-assistant-input" className="apex-assistant-sr">Ask Apex a question</label>
    <input id="apex-assistant-input" value={draft} maxLength={300} disabled={sending}
     placeholder={supplierCanManage?"Ask about products, publishing or CSV…":"Ask about products or the site…"}
     onChange={event=>setDraft(event.target.value)}/>
    <button type="submit" disabled={!draft.trim()||sending} aria-label="Send message">↑</button>
   </form>
   <p className="apex-assistant-foot">{supplierCanManage
    ?"Supplier-only · Changes require confirmation · Retail display only; checkout disabled"
    :"Public catalog only · Avoid entering personal details"}</p>
  </div>}
  <button type="button" className="apex-assistant-toggle"
   aria-expanded={open} aria-label={open?"Close Apex assistant":"Open Apex assistant"}
   onClick={()=>setOpen(value=>!value)}>{open?"×":"Chat"}</button>
 </section>;
}
