import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { MultiSplitPreview } from "./preview";
import { SaveSplitDraft } from "./save-draft";

export const dynamic = "force-dynamic";
export const metadata = { title: "Multi-recipient Split Preview | Apex", robots: { index: false, follow: false } };

export default async function MultiSplitConfigurationPage() {
  const client = await createSupplierServerClient();
  if (!client) redirect("/admin/sign-in");
  const { data, error } = await client.auth.getUser();
  if (error || !isVerifiedPlatformAdmin(data.user)) redirect("/admin/sign-in");
  const [recipientResult, storeResult, supplierResult, productResult] = await Promise.all([
    client.from("payout_recipients").select("id,display_name,recipient_type,status").eq("status","active").order("display_name").limit(250),
    client.from("stores").select("id,display_name").order("display_name").limit(250),
    client.from("suppliers").select("id,display_name").order("display_name").limit(250),
    client.from("products").select("id,name,sku").order("name").limit(250),
  ]);
  return <main className="container supplier-shell" style={{minWidth:0,overflowWrap:"anywhere"}}>
    <Link className="back" href="/admin/splits">← Payout split proposals</Link>
    <p className="eyebrow">APEX / ADMIN / PAYMENTS</p>
    <h1 style={{fontSize:"clamp(2rem, 8vw, 3.5rem)"}}>Multi-recipient split preview</h1>
    <p className="notice">Planning mode only. No Bitcoin processor or live transfers are connected here.</p>
    <p><Link href="/admin/recipients">Manage payout recipients →</Link></p>
    <MultiSplitPreview />
    {recipientResult.error && <p className="notice">Recipient directory is unavailable.</p>}
    {storeResult.error && <p className="notice">Storefront directory is unavailable.</p>}
    {supplierResult.error && <p className="notice">Supplier directory is unavailable.</p>}
    {productResult.error && <p className="notice">Product directory is unavailable.</p>}
    <SaveSplitDraft enabled={process.env.APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED === "true" && !recipientResult.error && !storeResult.error && !supplierResult.error && !productResult.error} recipients={recipientResult.data ?? []} stores={storeResult.data ?? []} suppliers={supplierResult.data ?? []} products={productResult.data ?? []} />
  </main>;
}
