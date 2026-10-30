import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account | Apex", robots: { index: false, follow: false } };

export default async function AccountHome() {
  const client = await createSupplierServerClient();
  if (!client) redirect("/login");
  const { data, error } = await client.auth.getUser();
  const user = data.user;
  if (error || !user || user.is_anonymous || !user.email_confirmed_at) redirect("/login");
  if (isVerifiedPlatformAdmin(user)) redirect("/admin");
  // Customers must never be promoted just by an email match or client metadata.
  const membership = await client.from("supplier_memberships").select("supplier_id").limit(1);
  if (!membership.error && membership.data?.length) redirect("/supplier");
  redirect("/account/profile");
}
