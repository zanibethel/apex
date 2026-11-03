import Link from "next/link";
import {notFound} from "next/navigation";
import {readPublishedCatalog} from "@/lib/supabase/public-catalog";
import {readApprovedSoldOutCatalog} from "@/lib/supabase/approved-sold-out-catalog";
import {ApprovedSoldOutShelf} from "./approved-sold-out-shelf";

export const dynamic="force-dynamic";
export const metadata={title:"Products | Apex Anabolics",robots:{index:false,follow:false}};

export default async function Catalog({searchParams}:{searchParams:Promise<{page?:string}>}){
 const query=await searchParams;
 const raw=typeof query.page==="string"?query.page:"1";
 if(!/^[1-9][0-9]{0,2}$/.test(raw)||Number(raw)>417)notFound();
 const page=Number(raw);
 // Check existing public API connectivity, but only render independently
 // released and non-purchasable metadata from the approved catalog projection.
 const [connection,approved]=await Promise.all([
  readPublishedCatalog(),readApprovedSoldOutCatalog(page),
 ]);
 return <main className="container catalog apex-branded-catalog">
  <Link className="back" href="/">← Home</Link>
  <p className="eyebrow">APEX ANABOLICS / PRODUCTS</p>
  <h1>DISCOVER THE<br/><em>APEX STANDARD.</em></h1>
  <p className="lead">Explore product information, compare listed prices,
   and check availability. Ordering is currently unavailable.</p>
  <ApprovedSoldOutShelf result={approved}/>
  {connection.state!=="connected"&&<p className="notice" role="status">
   The catalog connection is temporarily unavailable. Product availability
   cannot be confirmed.
  </p>}
  <p className="notice">Checkout is currently unavailable. Products remain
   unorderable until storefront and payment availability are confirmed.</p>
 </main>;
}
