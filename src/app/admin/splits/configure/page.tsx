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
  const { data: recipients, error: recipientError } = await client.from("payout_recipients").select("id,display_name,recipient_type,status").eq("status","active").order("display_name").limit(250);
  return <main className="container supplier-shell">
    <Link className="back" href="/admin/splits">← Payout split proposals</Link>
    <p className="eyebrow">APEX / ADMIN / PAYMENTS</p>
    <h1>Multi-recipient split preview</h1>
    <p className="notice">Planning mode only. Changes are not saved, published, or sent to a Bitcoin processor.</p>
    <p><Link href="/admin/recipients">Manage payout recipients →</Link></p>
    <MultiSplitPreview />
    {recipientError && <p className="notice">Recipient directory is unavailable until the payout schema is installed.</p>}
    <SaveSplitDraft enabled={process.env.APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED === "true" && !recipientError} recipients={recipients ?? []} />
  </main>;
}
