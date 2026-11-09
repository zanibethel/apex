"use client";
import {useState} from "react";
import {OfferTile} from "@/components/catalog/offer-tile";
import {MARKETPLACE_DEMO_FIXTURES} from "@/lib/catalog/marketplace-demo-fixtures.mjs";
import {initialShowroomState,showroomCartSummary} from "@/lib/catalog/supplier-showroom-preview.mjs";
import {computeDemoTotals,makeDemoOrder,advanceDemoOrder} from "@/lib/catalog/marketplace-demo-order.mjs";
import "./marketplace-demo-journey.css";

type DemoItem={
 id:string;name:string;sku:string;description:string|null;category:string;
 priceCents:number;compareAtCents:number|null;currency:string;active:boolean;
 initialInStock:boolean;trackingEnabled:boolean;imageUrl?:string;
};
type PreviewState=Record<string,{visible:boolean;inStock:boolean}>;
type Buyer={name:string;email:string;address:string;city:string;region:string;postalCode:string};
type OrderLine={id:string;name:string;sku:string;quantity:number;unitPriceCents:number;lineTotalCents:number};
type DemoEvent={event:string;at:string};
type DemoOrder={
 id:string;createdAt:string;kind:"isolated_ui_simulation_v1";customer:Buyer;
 items:OrderLine[];subtotalCents:number;discountCents:number;shippingCents:number;
 totalCents:number;shippingMethod:string;codeApplied:string|null;
 paymentState:string;fulfillmentState:string;trackingReference:string|null;
 events:DemoEvent[];
};
type DemoTotals={ok:boolean;error?:string;count?:number;subtotalCents?:number;discountCents?:number;shippingCents?:number;totalCents?:number};
type DemoResult={ok:boolean;error?:string;order?:DemoOrder};
type Action="simulate_payment"|"start_packing"|"mark_shipped"|"mark_delivered";
const fixtureRows=MARKETPLACE_DEMO_FIXTURES as unknown as DemoItem[];
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const initialBuyer:Buyer={
 name:"Demo Customer",email:"demo@example.invalid",
 address:"123 Example Avenue",city:"Exampleville",region:"XX",postalCode:"00000",
};
const labels:Record<Action,string>={
 simulate_payment:"Record simulated payment",
 start_packing:"Begin packing (simulated)",
 mark_shipped:"Mark shipped (simulated)",
 mark_delivered:"Mark delivered (simulated)",
};
const legalSteps:Action[]=["simulate_payment","start_packing","mark_shipped","mark_delivered"];

export function MarketplaceDemoJourney(){
 const [visibility,setVisibility]=useState<PreviewState>(()=>initialShowroomState(fixtureRows) as PreviewState);
 const [cart,setCart]=useState<Record<string,number>>({});
 const [stage,setStage]=useState<"catalog"|"checkout"|"order">("catalog");
 const [buyer,setBuyer]=useState<Buyer>(initialBuyer);
 const [shipping,setShipping]=useState<"standard"|"priority">("standard");
 const [promo,setPromo]=useState("");
 const [order,setOrder]=useState<DemoOrder|null>(null);
 const [notice,setNotice]=useState("");
 const summary=showroomCartSummary(fixtureRows,visibility,cart);
 const totals=computeDemoTotals(fixtureRows,visibility,cart,shipping,promo) as DemoTotals;
 function changePreview(id:string,property:"visible"|"inStock",checked:boolean){
  setVisibility(current=>({...current,[id]:{
   ...current[id],visible:property==="visible"?checked:current[id]?.visible??false,
   inStock:property==="inStock"?checked:current[id]?.inStock??false,
  }}));
  if(!checked)setCart(current=>{const next={...current};delete next[id];return next;});
 }
 function add(id:string){
  if(!visibility[id]?.visible||!visibility[id]?.inStock||order)return;
  setCart(current=>({...current,[id]:Math.min(10,(current[id]??0)+1)}));
  setNotice("");
 }
 function reset(){
  setVisibility(initialShowroomState(fixtureRows) as PreviewState);
  setCart({});setStage("catalog");setBuyer(initialBuyer);
  setShipping("standard");setPromo("");setOrder(null);setNotice("");
 }
 function place(){
  if(order)return;
  const result=makeDemoOrder({
   products:fixtureRows,visibility,cart,shippingMethod:shipping,promo,customer:buyer,
   orderId:"DEMO-"+crypto.randomUUID(),at:new Date().toISOString(),
  }) as DemoResult;
  if(!result.ok||!result.order){setNotice(result.error??"Could not create simulated order.");return;}
  setOrder(result.order);setStage("order");
  setNotice("Simulated order recorded in this browser session only. No real order or payment was created.");
 }
 function advance(action:Action){
  if(!order)return;
  const result=advanceDemoOrder(order,action,new Date().toISOString()) as DemoResult;
  if(!result.ok||!result.order){setNotice(result.error??"This demo transition is not available.");return;}
  setOrder(result.order);
  setNotice("Demo status changed locally. No payment, shipment or email was triggered.");
 }
 const currentStep=order?.fulfillmentState==="delivered"?4:
  order?.fulfillmentState==="shipped"?3:
  order?.fulfillmentState==="packing"?2:
  order?.paymentState==="simulated_paid"?1:0;
 function changeBuyer(field:keyof Buyer,text:string){setBuyer(current=>({...current,[field]:text.slice(0,150)}));}
 const canPay=Boolean(order&&order.paymentState==="not_processed");
 const canPack=Boolean(order&&order.paymentState==="simulated_paid"&&order.fulfillmentState==="not_started");
 const canShip=Boolean(order&&order.fulfillmentState==="packing");
 const canDeliver=Boolean(order&&order.fulfillmentState==="shipped");
 return <section className="apex-demo-journey" aria-label="Fictional end-to-end marketplace rehearsal">
  <div className="apex-demo-journey-header">
   <p className="eyebrow">PRIVATE MARKETPLACE REHEARSAL · FICTIONAL DATA ONLY</p>
   <h2>Test the full storefront experience</h2>
   <p>Use imaginary accessories to practice buyer and supplier screens. This is a self-contained UI simulation: <strong>no real merchandise, no orders, no payments, no shipping, and no customer information is transmitted.</strong> It never displays these sample listings on the public catalog.</p>
  </div>
  <div className="apex-demo-stepper" aria-label="Demo journey">
   <span className={stage==="catalog"?"current":""}>1. Product selection</span>
   <span className={stage==="checkout"?"current":""}>2. Checkout layout</span>
   <span className={stage==="order"?"current":""}>3. Receipt & supplier operations</span>
  </div>
  {stage!=="order"&&<>
   <div className="apex-demo-layout">
    <div>
     <h3>Fictional sample catalog</h3>
     <p className="notice">Toggle these demonstration products independently from saved supplier records. Nothing persists after a refresh.</p>
     <div className="apex-demo-fixture-grid">
      {fixtureRows.map(p=><article className="apex-demo-fixture" key={p.id}>
       <div className="apex-demo-fixture-controls">
        <label><input type="checkbox" checked={visibility[p.id]?.visible??false}
          onChange={e=>changePreview(p.id,"visible",e.target.checked)}/> Show sample</label>
        <label><input type="checkbox" checked={visibility[p.id]?.inStock??false}
          onChange={e=>changePreview(p.id,"inStock",e.target.checked)}/> In stock</label>
       </div>
       {visibility[p.id]?.visible?<div className="apex-demo-fixture-body">
        <OfferTile name={p.name} sku={p.sku} description={p.description}
         category={p.category} priceCents={p.priceCents}
         compareAtCents={null} currency="USD" availableStock={visibility[p.id]?.inStock?1:0}/>
        <div className="apex-demo-fixture-action">
         <strong>{visibility[p.id]?.inStock?"Sample: In stock":"Sample: Sold out"}</strong>
         <button type="button" disabled={!visibility[p.id]?.inStock||(cart[p.id]??0)>=10}
          onClick={()=>add(p.id)}>{visibility[p.id]?.inStock?"Add to demo cart":"Sold out"}</button>
        </div>
       </div>:<p className="apex-demo-hidden">Hidden from buyer view · {p.name}</p>}
      </article>)}
     </div>
    </div>
    <aside className="apex-demo-checkout-card">
     <h3>Demo cart</h3>
     {summary.items.length===0?<p>No fictional samples added yet.</p>:<ul>
      {summary.items.map(i=><li key={i.id}>
       <span>{i.name} × {i.quantity}</span>
       <span>{money(i.priceCents*i.quantity)}</span>
       <button type="button" aria-label={"Remove "+i.name} onClick={()=>setCart(current=>{
        const next={...current};delete next[i.id];return next;
       })}>Remove</button>
      </li>)}
     </ul>}
     <p><strong>Subtotal: {money(summary.subtotalCents)}</strong></p>
     <p className="apex-demo-small">No charge is possible from this page.</p>
     {stage==="catalog"&&<button type="button" disabled={!summary.count}
      onClick={()=>{setStage("checkout");setNotice("");}}>Continue to simulated checkout</button>}
     {stage==="checkout"&&<button type="button" onClick={()=>setStage("catalog")}>Back to catalog</button>}
    </aside>
   </div>
   {stage==="checkout"&&<section className="apex-demo-checkout-form" aria-label="Simulated checkout">
    <h3>Checkout form rehearsal</h3>
    <p className="notice">Fictional data is prefilled. Do not enter real contact, payment or delivery details; this page does not store or transmit them.</p>
    <div className="apex-demo-input-grid">
     {([
      ["name","Customer name"],["email","Email"],["address","Delivery address"],
      ["city","City"],["region","State / region"],["postalCode","Postal code"],
     ] as [keyof Buyer,string][]).map(([field,label])=><label key={field}>
      {label}<input type="text" value={buyer[field]} maxLength={150}
       onChange={e=>changeBuyer(field,e.target.value)}/>
     </label>)}
     <label>Simulated shipping
      <select value={shipping} onChange={e=>setShipping(e.target.value as "standard"|"priority")}>
       <option value="standard">Standard — $5.99 (sample)</option>
       <option value="priority">Priority — $11.99 (sample)</option>
      </select>
     </label>
     <label>Demo promo code
      <input type="text" value={promo} maxLength={20} onChange={e=>setPromo(e.target.value)}
       placeholder="DEMO10"/>
     </label>
    </div>
    {totals.ok&&<div className="apex-demo-totals">
     <p>Items: {money(totals.subtotalCents??0)}</p>
     <p>Sample discount: −{money(totals.discountCents??0)}</p>
     <p>Sample shipping: {money(totals.shippingCents??0)}</p>
     <strong>Simulated total: {money(totals.totalCents??0)}</strong>
     <small>Free simulated shipping at $200 after discounts. No real taxes, charges or orders.</small>
    </div>}
    <button type="button" disabled={!totals.ok} onClick={place}>
     Place demo order (no payment)
    </button>
   </section>}
  </>}
  {stage==="order"&&order&&<div className="apex-demo-order">
   <div className="apex-demo-receipt" role="status">
    <p className="eyebrow">SIMULATED RECEIPT — NOT A PURCHASE</p>
    <h3>{order.id}</h3>
    <p>Created {new Date(order.createdAt).toLocaleString("en-US")}</p>
    <p>Customer: {order.customer.name} · {order.customer.email}</p>
    <p>Demo destination: {order.customer.city}, {order.customer.region}</p>
    <ul>{order.items.map(i=><li key={i.id}>{i.quantity} × {i.name} ({i.sku}) — {money(i.lineTotalCents)}</li>)}</ul>
    <p>Subtotal: {money(order.subtotalCents)} · Discount: {money(order.discountCents)} · Shipping: {money(order.shippingCents)}</p>
    <strong>Test total: {money(order.totalCents)}</strong>
    <p>Payment status: {order.paymentState.replaceAll("_"," ")}</p>
    <p>Fulfillment: {order.fulfillmentState.replaceAll("_"," ")}</p>
    {order.trackingReference&&<p>Illustrative tracking reference: {order.trackingReference}</p>}
    <p className="apex-demo-small">This receipt is not valid evidence of payment, a sale, shipment or delivery.</p>
   </div>
   <section className="apex-demo-fulfillment" aria-label="Supplier fulfillment rehearsal">
    <p className="eyebrow">SUPPLIER VIEW · TEST DATA</p>
    <h3>Process a demo order</h3>
    <p>Perform each simulated step in sequence. The buttons never contact BTCPay, USPS, email services or real order tables.</p>
    <p>Workflow progress: {currentStep} of 4 steps</p>
    <div className="apex-demo-operations">
     {legalSteps.map((action,index)=><button type="button" key={action}
      disabled={index===0?!canPay:index===1?!canPack:index===2?!canShip:!canDeliver}
      onClick={()=>advance(action)}>{index+1}. {labels[action]}</button>)}
    </div>
    <h4>Local event history</h4>
    <ol>{order.events.map((event,index)=><li key={index}>
     {event.event.replaceAll("_"," ")} · {new Date(event.at).toLocaleTimeString("en-US")}
    </li>)}</ol>
    <a className="apex-demo-export" download={"demo-order-"+order.id+".json"}
     href={"data:application/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(order,null,2))}>
     Export fictional order JSON
    </a>
    <p className="apex-demo-small">Export contains only the data from this local fictional test. It is not a live order report.</p>
   </section>
  </div>}
  {notice&&<p className="apex-demo-notice" role="status">{notice}</p>}
  <div className="apex-demo-footer">
   <button type="button" onClick={reset}>Reset entire demo workflow</button>
   <span>Strict demo isolation · No third-party network calls · No public product releases</span>
  </div>
 </section>;
}
