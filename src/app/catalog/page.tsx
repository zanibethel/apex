import Link from "next/link";
import {readPublishedCatalog} from "@/lib/supabase/public-catalog";
import {readApprovedSoldOutCatalog} from "@/lib/supabase/approved-sold-out-catalog";
import {ApprovedSoldOutShelf} from "./approved-sold-out-shelf";
import {DemoCatalogShelf} from "./demo-catalog-shelf";

export const dynamic="force-dynamic";
export const metadata={title:"Catalog Preview | Apex",robots:{index:false,follow:false}};

export default async function CatalogPreview(){
 // Existing public catalog read is preserved for connection verification only.
 // It is NOT a sale-authorization decision and its rows are never rendered.
 const [connection,approved]=await Promise.all([
  readPublishedCatalog(),readApprovedSoldOutCatalog(),
 ]);
 return <main className="container catalog apex-branded-catalog">
  <Link className="back" href="/">← Home</Link>
  <p className="eyebrow">APEX ANABOLICS / CATALOG PREVIEW</p>
  <h1>DISCOVER THE<br/><em>APEX STANDARD.</em></h1>
  <p className="lead">Public catalog preview. Released items will appear as
   Sold Out until separate authorization and checkout systems are approved.</p>
  <ApprovedSoldOutShelf result={approved}/>
  {process.env.APEX_CHECKOUT_MODE==="demo"&&<DemoCatalogShelf/>}
  {connection.state!=="connected"&&<p className="notice" role="status">
   {connection.state==="unconfigured"
    ?"Standalone UI preview — the read-only catalog connection is not configured."
    :"Public catalog connection is temporarily unavailable. Private products are not displayed."}
  </p>}
  <div className="actions">
   <Link className="button secondary" href="/checkout/preview">
    Explore fictional checkout demo</Link>
  </div>
  <p className="notice">No checkout, ordering or live inventory is enabled.
   The separate cart demonstration uses fictional products, simulated statuses
   and never creates an order or Bitcoin invoice. Inventory updates do not
   automatically grant product or payment authorization.</p>
 </main>;
}
