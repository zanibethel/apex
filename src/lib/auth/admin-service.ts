import "server-only";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_APEX_URL = "https://fhqpkpztercadcxspdkg.supabase.co";

// A privileged client is only constructed inside server-side administrator routes.
// The secret is never required for the public website or browser bundles.
export function createApexAuthAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (process.env.NEXT_PUBLIC_APP_MODE !== "demo") return null;
  if (url !== EXPECTED_APEX_URL || !secret?.startsWith("sb_secret_")) return null;

  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function areApexInvitationsEnabled() {
  return process.env.APEX_AUTH_INVITES_ENABLED === "true" && !!createApexAuthAdminClient();
}
