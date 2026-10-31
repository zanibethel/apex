import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { ProfileForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Profile | Apex", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const client = await createSupplierServerClient();
  if (!client) return <main className="container supplier-shell"><h1>Profile unavailable</h1></main>;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at)
    redirect("/account/sign-in");

  return <main className="container supplier-shell">
    <Link href={data.user.app_metadata?.apex_role === "platform_admin" ? "/admin" : "/account/profile"} className="back">← Workspace</Link>
    <p className="eyebrow">APEX / MY PROFILE</p>
    <h1>Account settings</h1>
    <section className="supplier-panel">
      <h2>Profile</h2>
      <p>Email: {data.user.email}</p>
      <p>Access: {data.user.app_metadata?.apex_role === "platform_admin" ? "Administrator" : "Member"}</p>
    </section>
    <div style={{height:24}}/>
    <ProfileForm />
  </main>;
}
