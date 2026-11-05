import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";

export const dynamic="force-dynamic";
export const metadata={
 title:"Cumulative Held-Order CSV | Apex Supplier",
 robots:{index:false,follow:false},
};

export default async function CumulativeHeldCsvPage(){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier/reports">← Supplier reports</Link>
  <p className="eyebrow">APEX / SUPPLIER / RECORD EXPORT</p>
  <h1>Cumulative held-order CSV</h1>
  <p className="lead">Download a read-only report of existing original
   held-order metadata for each storefront you are authorized to manage.
   Every export starts from the oldest available history through its
   latest original recorded order, not merely the latest reporting day.</p>
  {workspace.stores.map(store=><section className="supplier-panel"
   key={store.id} style={{maxWidth:"none",marginBottom:18}}>
   <h2>{store.display_name}</h2>
   <p className="notice">Each original order ID appears once in this
    download. Repeated IDs across later downloads refer to the same
    original record, not a new order. No data is uploaded or changed.</p>
   <div className="actions">
    <a className="button secondary"
     href={"/api/supplier/held-order-export?store="+encodeURIComponent(store.id)}>
     Download cumulative CSV
    </a>
   </div>
  </section>)}
  <p className="notice">The CSV includes original order IDs, original
   purchase dates, recorded historical status, export timestamp and
   held-record indicators only. It omits purchased item details,
   recipient addresses, customer contacts, prices, payment details,
   labels, and tracking. All records remain held, not authorized
   for payment or shipment.</p>
  <p className="notice">The current read-only source supports at most
   1,025 records per storefront. If an export cannot be verified as
   complete and duplicate-free, no CSV is downloaded. No report
   archive or CSV re-upload is enabled in this release.</p>
 </main>;
}
