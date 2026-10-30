import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { RecipientForm } from "./form";
export const dynamic="force-dynamic";
export const metadata={title:"Payout Recipients | Apex",robots:{index:false,follow:false}};
export default async function RecipientDirectory() {
 const client=await createSupplierServerClient();
 if(!client) redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError || !isVerifiedPlatformAdmin(auth.user)) redirect("/admin/sign-in");
 const {data:recipients,error}=await client.from("payout_recipients").select("id,display_name,recipient_type,status").order("display_name").limit(250);
 const enabled=process.env.APEX_RECIPIENT_ADMIN_WRITES_ENABLED==="true" && !error;
 return <main className="container supplier-shell">
  <Link className="back" href="/admin/splits/configure">← Split configuration</Link>
  <p className="eyebrow">APEX / ADMIN / PAYOUTS</p><h1>Payout recipients</h1>
  <p className="notice">Manage payout recipient labels and active status. This does not assign wallet addresses, account access, or trigger transfers.</p>
  {error && <p role="alert">Recipient directory unavailable until the reviewed payout migrations are installed.</p>}
  <h2>Add recipient</h2><RecipientForm enabled={enabled} />
  <h2>Existing recipients</h2>
  {!recipients?.length && <p>No recipient records available.</p>}
  {recipients?.map(r=><section key={r.id} className="supplier-panel" style={{marginBottom:20}}>
    <h3>{r.display_name} — {r.recipient_type} ({r.status})</h3>
    <RecipientForm recipient={r} enabled={enabled} />
  </section>)}
 </main>;
}
