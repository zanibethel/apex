import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {privateReleaseDisplay} from "@/lib/catalog/private-release-decision.mjs";
import {evaluatePrivateCheckoutReadiness} from "@/lib/checkout/private-cart-readiness.mjs";
import {readPrivateCheckoutSnapshot} from "@/lib/checkout/private-product-stock-snapshot.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"Checkout Admission Readiness | Apex",
 robots:{index:false,follow:false},
};
const BATCH_SIZE=8;
const LIMIT=40;

export default async function CheckoutReadinessAdmin(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:identity,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(identity.user))redirect("/admin/sign-in");

 // Separate server-side rollout gate: the review-only RPC is not applied
 // to hosted Supabase by this PR. Missing flag => no snapshot reads.
 const stockReadbackEnabled=process.env.APEX_PRIVATE_STOCK_READBACK==="enabled";
 const {data:controls,error}=await client.from("supplier_listing_controls")
   .select("store_id,product_id,product_name,product_sku,admin_gate,supplier_wants_listing,changed_at")
   .order("changed_at",{ascending:false}).limit(LIMIT);
 type Item=NonNullable<typeof controls>[number];
 const results:{item:Item;release:unknown;snapshot:unknown}[]=[];
 if(!error&&controls){
  for(let index=0;index<controls.length;index+=BATCH_SIZE){
   const batch=controls.slice(index,index+BATCH_SIZE);
   const reads=await Promise.all(batch.map(async item=>{
    const [releaseRead,snapshotRead]=await Promise.all([
     client.rpc("get_private_release_readiness",{
      p_store_id:item.store_id,p_product_id:item.product_id,
     }),
     stockReadbackEnabled
      ?client.rpc("get_private_checkout_product_snapshot",{
        p_store_id:item.store_id,p_product_id:item.product_id,
       }):Promise.resolve({data:null,error:null}),
    ]);
    return {item,release:releaseRead.error?null:releaseRead.data,
     snapshot:snapshotRead.error?null:snapshotRead.data};
   }));
   results.push(...reads);
  }
 }
 const checkoutMode=process.env.APEX_CHECKOUT_MODE==="demo"?"demo":"disabled";
 return <main className="container supplier-shell apex-branded-dashboard" style={{minWidth:0}}>
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN ONLY / CHECKOUT PREPARATION</p>
  <h1 style={{fontSize:"clamp(2rem, 6vw, 3.2rem)"}}>Cart admission readiness</h1>
  <p className="notice"><strong>Real checkout is disabled.</strong> This read-only view evaluates
   private listing prerequisites and, when explicitly enabled, private admin-only
   price/stock observations. It cannot make products purchasable, publish
   merchandise, create orders, or connect to Bitcoin.</p>
  <section className="supplier-panel" style={{maxWidth:"none",marginBottom:22}}>
   <h2>Payment and storefront gates</h2>
   <p><strong>Current checkout UI:</strong> {checkoutMode==="demo"?"Fictional interactive demo only":"Disabled"}</p>
   <p><strong>Public product checkout:</strong> Blocked</p>
   <p><strong>Order creation:</strong> Blocked</p>
   <p><strong>BTCPay invoice creation:</strong> Blocked</p>
   <p className="notice">Supplier publish intent is not public listing permission.
    Seller/product authorization, admin holds, private stock, merchant approval,
    shipping and server-calculated prices must be independently verified
    before any future transactional cart release.</p>
  </section>
  <section aria-labelledby="cart-readiness-products">
   <h2 id="cart-readiness-products">Private listing candidates</h2>
   <p className="notice">Most recently updated {LIMIT} listing-control records, checked
    through the existing authenticated, server-side private release RPC.
    Unavailable or unknown decisions fail closed. The optional price/stock snapshot
    requires its separate reviewed database rollout and server flag; it is not a
    public price or inventory feed.</p>
   {error?<p role="status" className="notice">Private listing controls unavailable.
     No products can be admitted for checkout.</p>
    :results.length===0?<p className="notice">No supplier listing candidates
     currently available for admission review.</p>
    :<div className="apex-product-grid">
     {results.map(({item,release,snapshot})=>{
      const admission=evaluatePrivateCheckoutReadiness(release,checkoutMode);
      const display=privateReleaseDisplay(release);
      const stock=readPrivateCheckoutSnapshot(snapshot,item.store_id,item.product_id);
      return <article key={item.store_id+":"+item.product_id} className="apex-product-card">
       <div className="apex-product-card-head">
        <span className="eyebrow">CHECKOUT BLOCKED</span>
        <h3>{item.product_name||"Private product"}</h3>
       </div>
       <p className="notice">SKU: {item.product_sku||"Not assigned"} ·
        Admin gate: {item.admin_gate==="hold"?"Hold":
          item.admin_gate==="review_required"?"Review required":"No active hold"}</p>
       <p className="notice"><strong>Current release assessment:</strong> {display.label}</p>
       <p>{display.description}</p>
       <p className="notice"><strong>Private price observation:</strong>{" "}
        {stockReadbackEnabled?stock.priceLabel:"Awaiting approved snapshot rollout"}
        {" · "}<strong>Available stock:</strong>{" "}
        {stockReadbackEnabled&&stock.observed&&stock.availableUnits!==null
          ?stock.availableUnits:"Not verified"}</p>
       <p className="notice">Admin inspection only. Even a verified private snapshot
        cannot generate a customer quote, reserve inventory, or permit a payment.</p>
       <details className="apex-card-editor">
        <summary>View pre-checks (not purchase permission)</summary>
        <ul className="supplier-stores">
         {admission.checks.map(check=><li key={check.key}>
          <span>{check.label}</span><strong>{check.state==="passed"?"Privately checked":
             check.state==="blocked"?"Not satisfied":"Not verified"}</strong>
         </li>)}
        </ul>
        <p className="notice">No live checkout activation can be performed on this page.
         Product, shipping and tax prices are not returned to customers.</p>
       </details>
       <Link className="button secondary" href="/admin/listing-controls">
        Review admin listing controls
       </Link>
      </article>;
     })}
    </div>}
  </section>
  <p className="notice">Only the existing fictional sample catalog may enter the
   demo shopping cart. An approval in this panel never changes that restriction.</p>
 </main>;
}
