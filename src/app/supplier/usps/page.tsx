import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {parseSupplierUspsReadiness} from "@/lib/supplier/daily-order-report.mjs";

export const dynamic="force-dynamic";
export const metadata={
 title:"USPS Fulfillment | Apex Supplier",robots:{index:false,follow:false},
};
const labels:Record<string,string>={
 not_connected:"USPS account not connected",
 pending_authorization:"USPS authorization pending",
 verified:"USPS authorization recorded",
};

export default async function SupplierUSPS(){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const results=await Promise.all(w.stores.map(async store=>{
  const request=await w.client.rpc("get_supplier_usps_readiness",{
   p_store_id:store.id,
  });
  return {store,readiness:request.error?null:
   parseSupplierUspsReadiness(request.data,store.id)};
 }));
 return <main className="container supplier-shell" style={{minWidth:0}}>
  <Link className="back" href="/supplier">← Supplier dashboard</Link>
  <p className="eyebrow">APEX / SUPPLIER / FULFILLMENT</p>
  <h1>USPS fulfillment</h1>
  <p className="lead">Each supplier pays USPS directly through their own
   authorized account. Apex will associate eligible purchased labels and
   tracking with the corresponding order once purchasing is enabled.</p>
  {results.map(({store,readiness})=><section key={store.id}
   className="supplier-panel" style={{maxWidth:"none",margin:"20px 0",minWidth:0}}>
   <h2>{store.display_name}</h2>
   {!readiness?<p role="alert">USPS connection status unavailable.
    No label purchase is possible.</p>:<>
    <p><strong>Account:</strong> {labels[readiness.status]}</p>
    <p><strong>Postage paid by:</strong> Supplier&apos;s own USPS payment account</p>
    <p><strong>Label purchases:</strong> Not enabled</p>
    <p><strong>Automatic tracking:</strong> Not enabled</p>
   </>}
   <p className="notice">To authorize live label purchasing, the supplier
    needs a USPS Business account, USPS Ship enrollment, an eligible payment
    account, and USPS Labels API approval. Connecting an account must use
    the USPS merchant authorization workflow. Never enter USPS passwords,
    API secrets, or payment information into product notes or Apex forms.</p>
   <div className="actions">
    <a className="button secondary"
     href="https://developers.usps.com/getting-started" target="_blank"
     rel="noopener noreferrer">USPS account setup</a>
    <Link className="button secondary" href="/supplier/shipping">Shipping rules</Link>
   </div>
  </section>)}
  <section className="supplier-panel" style={{maxWidth:"none",minWidth:0}}>
   <h2>Shipping workflow</h2>
   <p>For paid, eligible orders, Apex will show the assigned shipment, selected
    USPS packaging, and the customer&apos;s delivery details. The supplier will
    review the package and explicitly approve the postage amount before
    purchasing a label.</p>
   <p className="notice">Label purchasing, order-to-tracking assignment and
    customer shipment notifications stay unavailable until the supplier
    account is authorized and real order processing is enabled. No labels
    or postage charges have been created here.</p>
  </section>
  <div className="actions">
   <Link className="button primary" href="/supplier/reports/daily">Daily order reports</Link>
   <Link className="button secondary" href="/supplier">Supplier dashboard</Link>
  </div>
 </main>;
}
