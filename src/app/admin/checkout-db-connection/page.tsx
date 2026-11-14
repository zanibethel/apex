import "server-only";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {probeProductionRetailConnectionV1}
 from "@/lib/checkout/retail-production-db-readiness-v1.mjs";

export const dynamic="force-dynamic";
export const revalidate=0;
export const runtime="nodejs";
export const maxDuration=20;
export const metadata={
 title:"Database Connection Check | Apex Admin",
 robots:{index:false,follow:false},
};
const noStore="Read-only checkout connection verification. No customer orders, inventory reservations or payment requests can be created here.";

// Rendering this page is the operator action. A network probe is performed
// ONLY after the server has verified platform-admin Supabase auth. It uses the
// production credentials directly in the Vercel server runtime, never the
// browser or a Vercel sandbox that lacks project secrets.
export default async function CheckoutDatabaseConnectionPage(){
 const authClient=await createSupplierServerClient();
 if(!authClient)redirect("/admin/sign-in");
 const {data,error}=await authClient.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))
  redirect("/admin/sign-in");

 // The imported server-only module owns credentials and releases the
 // actual PostgreSQL client before returning an opaque Boolean.
 const verified=await probeProductionRetailConnectionV1(process.env);

 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link className="back" href="/admin/checkout-integration">← Checkout integration</Link>
  <p className="eyebrow">APEX / ADMIN / DATABASE CONNECTIVITY</p>
  <h1>Restricted checkout connection</h1>
  <p className="lead">{noStore}</p>
  <section className="supplier-panel" aria-label="Read-only connection results">
   <h2>{verified?"Connection verified":"Connection not verified"}</h2>
   <p role="status" className="notice">
    {verified?
     "Apex's deployed Vercel server authenticated as the restricted database role using verified TLS.":
     "The private read-only test could not complete. Checkout stays disabled. Check the production database credential, role permissions and CA configuration."}
   </p>
   <ul className="supplier-stores">
    <li><span>PostgreSQL connection</span><strong>{verified?"Verified":"Not verified"}</strong></li>
    <li><span>Restricted login identity</span><strong>{verified?"Verified":"Not verified"}</strong></li>
    <li><span>Transaction-local executor permission</span><strong>{verified?"Verified":"Not verified"}</strong></li>
    <li><span>Direct order and stock table permissions</span><strong>{verified?"Denied":"Not verified"}</strong></li>
    <li><span>Order, stock or payment writes by this check</span><strong>None</strong></li>
    <li><span>Customer checkout</span><strong>Still disabled</strong></li>
   </ul>
  </section>
  <div className="actions">
   <Link className="button secondary" href="/admin/checkout-db-connection">
    Run read-only check again
   </Link>
   <Link className="button secondary" href="/admin/checkout-integration">
    Return to integration
   </Link>
  </div>
  <p className="notice">This page does not expose database credentials, key material, customer
   delivery details or underlying PostgreSQL errors. A passing connection
   test is not a paid-order or checkout-readiness approval.</p>
 </main>;
}
