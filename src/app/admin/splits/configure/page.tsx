import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";
import { MultiSplitPreview } from "./preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Multi-recipient Split Preview | Apex", robots: { index: false, follow: false } };

export default async function MultiSplitConfigurationPage() {
  const client = await createSupplierServerClient();
  if (!client) redirect("/admin/sign-in");
  const { data, error } = await client.auth.getUser();
  if (error || !isVerifiedPlatformAdmin(data.user)) redirect("/admin/sign-in");
  return <main className="container supplier-shell">
    <Link className="back" href="/admin/splits">← Payout split proposals</Link>
    <p className="eyebrow">APEX / ADMIN / PAYMENTS</p>
    <h1>Multi-recipient split preview</h1>
    <p className="notice">Planning mode only. Changes are not saved, published, or sent to a Bitcoin processor.</p>
    <MultiSplitPreview />
  </main>;
}
