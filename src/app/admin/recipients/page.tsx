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
 return <main className="container supplier-shell" style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link className="back" href="/admin/splits/configure">← Split configuration</Link>
  <p className="eyebrow">APEX / ADMIN / PAYOUTS</p>
  <h1 style={{fontSize:"clamp(2rem, 8vw, 3.5rem)"}}>Payout recipients</h1>
  <p className="notice">Manage payout recipient labels and active status. No wallet addresses, account access, or transfers are configured here.</p>
  {error && <p role="alert">Recipient directory unavailable until the reviewed payout migrations are installed.</p>}
  <p className="notice">Setup checklist: create a Platform recipient, create a Supplier recipient, then mark each Active when ready to include them in a draft. Recipient records do not link wallets or grant supplier access.</p>
  <section className="supplier-panel" style={{maxWidth:"100%",minWidth:0,marginBottom:24}}>
   <h2>Add recipient</h2><RecipientForm enabled={enabled} />
  </section>
  <h2>Existing recipients ({recipients?.length ?? 0})</h2>
  <p><Link href="/admin/splits/configure">← Return to draft allocations</Link></p>
  {!recipients?.length && <p>No recipient records available. Add a platform or supplier recipient above when editing is enabled.</p>}
  {recipients?.map(r=><section key={r.id} className="supplier-panel" style={{marginBottom:20,maxWidth:"100%",minWidth:0}}>
    <h3 style={{overflowWrap:"anywhere"}}>{r.display_name}</h3>
    <p className="notice">{r.recipient_type} · {r.status}</p>
    <RecipientForm recipient={r} enabled={enabled} />
  </section>)}
 </main>;
}
