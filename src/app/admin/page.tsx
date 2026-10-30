import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const client = await createSupplierServerClient();
  if (!client) return <main><h1>Unavailable</h1></main>;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || !isVerifiedPlatformAdmin(data.user)) redirect("/admin/sign-in");
  return <main className="container supplier-shell"><h1>Apex control room</h1><p>Read-only preview</p></main>;
}
