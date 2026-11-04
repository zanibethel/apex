"use client";

import {useActionState,useState} from "react";
import {inspectPrivateOrderAdmission,type OrderAdmissionReviewState} from "./actions";
import "./order-admission.css";

type Product={id:string;name:string;sku:string};
type Item={product_id:string;quantity:number};
const START:OrderAdmissionReviewState={ok:false,message:"",selectionKey:"",review:null};
const USD=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const money=(cents:number)=>USD.format(cents/100);
const names:Record<string,string>={
 supplier_requested:"Supplier requested listing",
 admin_clear:"No administrative hold",
 identity_clear:"Supplier identity check",
 content_review_clear:"Content review cleared",
 product_setup_complete:"Product setup complete",
 supplier_authorized:"Supplier authorization",
 product_authorized:"Product authorization",
 public_release_enabled:"Public release permission",
};

export function OrderAdmissionWorkspace({products}:{products:Product[]}){
 const [items,setItems]=useState<Item[]>([]);
 const [candidate,setCandidate]=useState(products[0]?.id??"");
 const [boxSize,setBoxSize]=useState<"small"|"medium">("small");
 const [enteredCode,setEnteredCode]=useState("");
 const [state,action,pending]=useActionState(inspectPrivateOrderAdmission,START);
 const code=enteredCode.trim().toUpperCase();
 const fingerprint=JSON.stringify({items,boxSize,code});
 const review=state.selectionKey===fingerprint?state.review:null;
 const add=()=>{
  if(items.length>=8||!products.some(p=>p.id===candidate)||
   items.some(p=>p.product_id===candidate))return;
  setItems(current=>[...current,{product_id:candidate,quantity:1}]);
 };
 const updateQty=(id:string,quantity:number)=>{
  if(!Number.isInteger(quantity)||quantity<1||quantity>10)return;
  setItems(current=>current.map(row=>row.product_id===id?
   {...row,quantity}:row));
 };
 const count=items.reduce((sum,row)=>sum+row.quantity,0);
 return <section className="apex-admission-workspace" aria-labelledby="apex-admission-title">
  <h2 id="apex-admission-title">Review a multi-product order</h2>
  <p className="notice">Select actual saved catalog products. Current prices, stock,
   authorization controls and USPS charges are checked on the server.
   The result is an internal readiness assessment, not an order or inventory hold.</p>
  <div className="apex-admission-select">
   <label htmlFor="admission-candidate">Add product
    <select id="admission-candidate" value={candidate}
     onChange={e=>setCandidate(e.target.value)}>
     {products.map(p=><option key={p.id} value={p.id}>
      {p.name} · {p.sku}
     </option>)}
    </select>
   </label>
   <button type="button" className="button secondary" onClick={add}
    disabled={items.length>=8||!candidate||
     items.some(p=>p.product_id===candidate)}>Add product</button>
  </div>
  {items.length===0?<p className="notice">Choose products to begin the order-readiness review.</p>:
   <div className="apex-admission-lines">
    <h3>{items.length} distinct products · {count} units</h3>
    {items.map(row=>{
     const product=products.find(p=>p.id===row.product_id);
     return <div className="apex-admission-line" key={row.product_id}>
      <strong>{product?.name??"Catalog product"}</strong>
      <div className="apex-admission-quantity">
       <label htmlFor={"admission-quantity-"+row.product_id}>Qty</label>
       <input id={"admission-quantity-"+row.product_id} type="number"
        min={1} max={10} step={1} value={row.quantity}
        onChange={e=>updateQty(row.product_id,Number(e.target.value))}/>
       <button type="button" onClick={()=>
        setItems(current=>current.filter(item=>item.product_id!==row.product_id))}>
        Remove
       </button>
      </div>
     </div>;
    })}
   </div>}
  <form action={action} className="apex-admission-form">
   <input type="hidden" name="items" value={JSON.stringify(items)}/>
   <fieldset>
    <legend>USPS shipping method</legend>
    <label><input type="radio" name="boxSize" value="small"
     checked={boxSize==="small"} onChange={()=>setBoxSize("small")}/>
     Padded Flat Rate Envelope</label>
    <label><input type="radio" name="boxSize" value="medium"
     checked={boxSize==="medium"} onChange={()=>setBoxSize("medium")}/>
     Medium Flat Rate Box</label>
   </fieldset>
   <label htmlFor="admission-code">Discount code (optional)
    <input id="admission-code" type="text" name="code" maxLength={24}
     autoComplete="off" autoCapitalize="characters"
     placeholder="Code" value={enteredCode}
     onChange={e=>setEnteredCode(e.target.value)}/>
   </label>
   <button type="submit" className="button primary"
    disabled={!items.length||pending||count>50}>
    {pending?"Checking saved records…":"Check order readiness"}
   </button>
  </form>
  {state.message&&!review&&state.selectionKey===""?
   <p role="alert" className="notice">{state.message}</p>:null}
  {review&&<section aria-live="polite" className="apex-admission-results">
   <h3>Current database assessment</h3>
   <p role="status">{state.message}</p>
   <div className="apex-admission-status-grid">
    <p><strong>{review.allStockVerified?"Verified":"Not available"}</strong>
     <span>Stock for requested quantities</span></p>
    <p><strong>{review.allPrereqsMet?"Verified":"Incomplete"}</strong>
     <span>Product and supplier release prerequisites</span></p>
    <p><strong>Blocked</strong><span>Order submission and payment</span></p>
   </div>
   {review.items.map(item=><article className="apex-admission-result-line" key={item.productId}>
    <h4>{item.name} · {item.sku}</h4>
    <p>Quantity {item.quantity} · Available units:{" "}
     {item.availableUnits===null?"Unverified":item.availableUnits}</p>
    <p>Saved price:{" "}{item.unitPriceCents===null?"Unavailable":money(item.unitPriceCents)}
     {" · "}Line subtotal:{" "}
     {item.lineTotalCents===null?"Unavailable":money(item.lineTotalCents)}</p>
    <p>Stock: {item.stockSufficient?"Sufficient at check":"Insufficient or unverified"}</p>
    <details>
     <summary>Release requirements</summary>
     <ul>{item.checks.map(check=><li key={check.key}>
      {names[check.key]??check.key}:{" "}
      <strong>{check.passed?"Checked":"Not satisfied"}</strong>
     </li>)}</ul>
    </details>
   </article>)}
   {review.totals?<dl className="apex-admission-totals">
    <div><dt>Merchandise</dt><dd>{money(review.totals.merchandiseSubtotalCents)}</dd></div>
    <div><dt>Discount</dt><dd>−{money(review.totals.merchandiseDiscountCents)}</dd></div>
    <div><dt>USPS {review.totals.shippingBoxSize==="small"?
     "Padded Envelope":"Medium Box"}</dt>
     <dd>{review.totals.shippingCents===0?
      "Free":money(review.totals.shippingCents)}</dd></div>
    <div className="apex-admission-total"><dt>Calculated total</dt>
     <dd>{money(review.totals.totalCents)}</dd></div>
   </dl>:<p className="notice">A complete total cannot be calculated until all
    saved product prices have been verified.</p>}
   <p className="notice"><strong>Order is not submitted.</strong> Inventory locks
    end when the database check completes. Any future purchase must be
    rechecked and reserved in a separate, authorized transaction.</p>
  </section>}
 </section>;
}
