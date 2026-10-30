"use server";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";

export type SignInState = { error: string };
export async function signInSupplier(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || email.length > 254 || !email.includes("@")
      || typeof password !== "string" || !password || password.length > 4096) {
    return { error: "Unable to sign in with those credentials." };
  }

  const client = await createSupplierServerClient();
  if (!client) return { error: "Supplier sign-in is not configured in this environment." };
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: "Unable to sign in with those credentials." };

  const { data: verified, error: authError } = await client.auth.getUser();
  if (authError || !verified.user || verified.user.is_anonymous) {
    await client.auth.signOut();
    return { error: "Unable to verify this account." };
  }

  // RLS owns authorization; a valid login does not grant supplier membership.
  const { data: memberships, error: membershipError } = await client
    .from("supplier_memberships").select("supplier_id").limit(1);
  if (membershipError || !memberships?.length) {
    await client.auth.signOut();
    return { error: "This account has not been assigned to a supplier." };
  }
  redirect("/supplier");
}
