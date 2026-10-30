"use server";
import { redirect } from "next/navigation";
import { createSupplierServerClient } from "@/lib/supabase/server";

export type AccountSignInState = { error: string };
export async function signInAccount(_prev: AccountSignInState, form: FormData): Promise<AccountSignInState> {
  const email = form.get("email"), password = form.get("password");
  if (typeof email !== "string" || email.length > 254 || !email.includes("@") ||
      typeof password !== "string" || !password || password.length > 4096) {
    return { error: "Unable to sign in with those credentials." };
  }
  const client = await createSupplierServerClient();
  if (!client) return { error: "Account sign-in is not configured." };
  const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (signInError) return { error: "Unable to sign in with those credentials." };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
    await client.auth.signOut();
    return { error: "This account is not yet verified for sign-in." };
  }
  redirect("/account");
}
