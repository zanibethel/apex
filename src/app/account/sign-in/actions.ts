"use server";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";
import { isVerifiedPlatformAdmin } from "@/lib/auth/admin-access";

export type AccountSignInState = { error: string };
export async function signInAccount(_previous: AccountSignInState, form: FormData): Promise<AccountSignInState> {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || email.length > 254 || !email.includes("@") ||
      typeof password !== "string" || !password || password.length > 4096) {
    return { error: "Unable to sign in with those credentials." };
  }
  const client = await createSupplierServerClient();
  if (!client) return { error: "Account sign-in is unavailable." };
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: "Unable to sign in with those credentials." };
  const { data, error: userError } = await client.auth.getUser();
  if (userError || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
    await client.auth.signOut();
    return { error: "Unable to verify this account." };
  }
  if (isVerifiedPlatformAdmin(data.user)) redirect("/admin");
  // Membership is read under the authenticated user's RLS; never trust email alone.
  const { data: memberships, error: membershipError } = await client
    .from("supplier_memberships").select("supplier_id").limit(1);
  if (membershipError) {
    await client.auth.signOut();
    return { error: "Unable to verify account permissions. Please try again." };
  }
  if (memberships?.length) redirect("/supplier");
  redirect("/account/profile");
}
