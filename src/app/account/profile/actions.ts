"use server";

import { createSupplierServerClient } from "@/lib/supabase/server";

export type PasswordChangeResult = { ok: boolean; message: string };
const genericFailure = "Password change failed. Check your current password and try again.";

export async function changeOwnPassword(
  _previous: PasswordChangeResult,
  form: FormData,
): Promise<PasswordChangeResult> {
  const current = form.get("currentPassword");
  const next = form.get("newPassword");
  const confirmation = form.get("confirmPassword");
  const nonce = form.get("nonce");

  if (typeof current !== "string" || typeof next !== "string" ||
      typeof confirmation !== "string" || typeof nonce !== "string" ||
      current.length < 1 || current.length > 128 ||
      next.length < 12 || next.length > 128 || next !== confirmation || next === current ||
      (nonce.length > 0 && !/^\d{6}$/.test(nonce))) {
    return { ok: false, message: "Enter a different password of 12-128 characters, confirm it, and supply your current password." };
  }

  const client = await createSupplierServerClient();
  if (!client) return { ok: false, message: genericFailure };

  // The Auth server, not client metadata or an email form field, determines identity.
  const { data: identity, error: identityError } = await client.auth.getUser();
  const original = identity.user;
  if (identityError || !original || original.is_anonymous ||
      !original.email || !original.email_confirmed_at) {
    return { ok: false, message: "Sign in with a verified Apex account first." };
  }

  // Prove knowledge of the current password regardless of provider settings.
  const { data: checked, error: checkError } = await client.auth.signInWithPassword({
    email: original.email, password: current,
  });
  if (checkError || !checked.user || checked.user.id !== original.id) {
    return { ok: false, message: genericFailure };
  }

  // A password edit can target only the reverified, signed-in user.
  const { data: reverified, error: reverifyError } = await client.auth.getUser();
  if (reverifyError || reverified.user?.id !== original.id) {
    await client.auth.signOut();
    return { ok: false, message: genericFailure };
  }

  const { error } = await client.auth.updateUser({
    password: next,
    current_password: current,
    ...(nonce ? { nonce } : {}),
  });

  if (error) {
    return { ok: false, message: "Password not changed. Verify the current password and, if required, provide your email verification code." };
  }

  // Revoke the active session and all other Supabase sessions.
  const { error: signOutError } = await client.auth.signOut({ scope: "global" });
  return signOutError
    ? { ok: true, message: "Password updated, but we could not confirm all sessions were revoked. Sign out on your devices and sign in again." }
    : { ok: true, message: "Your Apex password was changed. Sign in again using the new password." };
}

export type SecurityCodeState = { ok: boolean; message: string };

export async function requestPasswordCode(
  _previous: SecurityCodeState,
): Promise<SecurityCodeState> {
  const client = await createSupplierServerClient();
  if (!client) return { ok: false, message: "Security code delivery is unavailable." };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
    return { ok: false, message: "Sign in with a verified Apex account first." };
  }
  // Explicit opt-in from the signed-in user's profile. Supabase enforces its OTP rate limits.
  const { error: sendError } = await client.auth.reauthenticate();
  if (sendError) {
    return { ok: false, message: "Unable to send a code. Email delivery may not be configured." };
  }
  return { ok: true, message: "A security code was requested for your Apex account email." };
}
