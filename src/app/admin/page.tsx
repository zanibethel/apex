import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const client = await createSupplierServerClient();
  if (!client) return <main><h1>Unavailable</h1></main>;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || !isVerifiedPlatformAdmin(data.user)) redirect("/admin/sign-in");
  return <main className="container supplier-shell"><p className="eyebrow">APEX / PLATFORM ADMIN</p><h1>Apex control room</h1><p>Authorized read-only preview</p><section className="supplier-panel"><h2>Account management</h2><p>View registered logins and prepare administrator-approved invitations.</p><Link className="button secondary" href="/admin/users">Open user directory</Link> <Link className="button secondary" href="/account/profile">My profile</Link></section></main>;
}
