"use server";
import { revalidatePath } from "next/cache";
import { createSupplierServerClient } from "@/lib/supabase/server";
import type { AccountDetails } from "@/lib/account/profile-fields";

export type DetailsState = { ok: boolean; message: string };

export async function saveOwnDetails(_previous: DetailsState, form: FormData): Promise<DetailsState> {
  const limits: Record<keyof AccountDetails, number> = {
    first_name: 80, last_name: 80, phone: 30, address_line1: 180,
    address_line2: 180, city: 100, region: 100, postal_code: 24, country_code: 2,
  };
  const values = {} as AccountDetails;
  for (const [field, max] of Object.entries(limits) as [keyof AccountDetails, number][]) {
    const raw = form.get(field);
    if (typeof raw !== "string" || raw.length > max + 12 ||
        /[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, message: "Check the contact fields and try again." };
    const value = raw.trim();
    if (value.length > max) return { ok: false, message: "A profile field is too long." };
    values[field] = value || null;
  }
  if (values.phone && !/^[0-9+().\s-]{3,30}$/.test(values.phone)) {
    return { ok: false, message: "Enter a valid phone number or leave it blank." };
  }
  if (values.country_code && !/^[A-Za-z]{2}$/.test(values.country_code)) {
    return { ok: false, message: "Use a two-letter country code." };
  }
  if (values.country_code) values.country_code = values.country_code.toUpperCase();

  const client = await createSupplierServerClient();
  if (!client) return { ok: false, message: "Profile editing is not configured here." };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
    return { ok: false, message: "Sign in to a verified account first." };
  }
  // The user ID is supplied ONLY by verified Auth. RLS also enforces user_id = auth.uid().
  const result = await client.from("account_profiles")
    .upsert({ user_id: data.user.id, ...values }, { onConflict: "user_id" });
  if (result.error) return { ok: false, message: "Profile changes could not be saved. Please try again later." };
  revalidatePath("/account/profile");
  return { ok: true, message: "Your contact details were saved." };
}
