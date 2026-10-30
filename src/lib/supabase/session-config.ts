// Apex-only, demo-only configuration; never use a privileged key.
const APEX_ORIGIN = "https://fhqpkpztercadcxspdkg.supabase.co";
export function getSupplierAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.NEXT_PUBLIC_APP_MODE !== "demo") return null;
  if (url !== APEX_ORIGIN || !key?.startsWith("sb_publishable_")) return null;
  return { url, key };
}
