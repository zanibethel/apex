import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in | Apex", robots: { index: false, follow: false } };
export default async function LoginPage() {
  const client = await createSupplierServerClient();
  const auth = client ? await client.auth.getUser() : null;
  if (!auth?.error && auth?.data.user && !auth.data.user.is_anonymous && auth.data.user.email_confirmed_at) {
    redirect("/account");
  }
  return <main className="container supplier-shell">
    <Link href="/" className="back">← Apex home</Link>
    <section className="supplier-panel">
      <p className="eyebrow">APEX / ACCOUNT</p>
      <h1>Log in.</h1>
      <p className="lead">One login for customers and approved staff. Your verified account permissions determine which workspace opens.</p>
      <LoginForm />
      <p className="notice">New customer registration will open after account-verification and abuse-prevention checks. Existing accounts can sign in now.</p>
    </section>
  </main>;
}
