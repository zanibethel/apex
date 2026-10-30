// Server-only, read-only catalog access via Supabase's public Data API.
// No server/service keys, no authenticated user cookies, no writes, no checkout.
export type PublicCatalogProduct = { id: string; name: string; description: string | null };
export type CatalogResult =
  | { state: "connected"; products: PublicCatalogProduct[] }
  | { state: "unconfigured" | "unavailable"; products: [] };

const EXPECTED_APEX_ORIGIN = "https://fhqpkpztercadcxspdkg.supabase.co";

export async function readPublishedCatalog(categoryId?: string): Promise<CatalogResult> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) return { state: "unconfigured", products: [] };

  // Never connect to a different user's Supabase project if env is misconfigured.
  if (projectUrl !== EXPECTED_APEX_ORIGIN || !publishableKey.startsWith("sb_publishable_")) {
    return { state: "unavailable", products: [] };
  }

  try {
    const url = new URL("/rest/v1/products", projectUrl);
    url.searchParams.set("select", "id,name,description");
    url.searchParams.set("is_published", "eq.true");
    if (categoryId && /^[0-9a-f-]{36}$/i.test(categoryId)) url.searchParams.set("category_id", "eq." + categoryId);
    url.searchParams.set("order", "name.asc");
    url.searchParams.set("limit", "24");

    const response = await fetch(url, {
      method: "GET",
      headers: { apikey: publishableKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { state: "unavailable", products: [] };

    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.some((row) =>
      typeof row !== "object" || row === null
      || typeof row.id !== "string" || typeof row.name !== "string"
      || (row.description !== null && typeof row.description !== "string")
    )) return { state: "unavailable", products: [] };

    return {
      state: "connected",
      products: data.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        description: row.description as string | null,
      })),
    };
  } catch {
    // Do not leak API keys, response bodies or provider errors to the UI.
    return { state: "unavailable", products: [] };
  }
}

export type PublishedCategory = { id: string; name: string };
export async function readPublishedCategories(): Promise<PublishedCategory[]> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (projectUrl !== EXPECTED_APEX_ORIGIN || !key?.startsWith("sb_publishable_")) return [];
  try {
    const url = new URL("/rest/v1/categories", projectUrl);
    url.searchParams.set("select", "id,name");
    url.searchParams.set("is_published", "eq.true");
    url.searchParams.set("order", "name.asc");
    url.searchParams.set("limit", "40");
    // Anonymous request plus RLS: members' unpublished categories never enter the public menu.
    const response = await fetch(url, {headers:{apikey:key,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(6000)});
    if (!response.ok) return [];
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.some(row =>
        !row || typeof row !== "object" || typeof row.id !== "string" || typeof row.name !== "string")) return [];
    return rows.map(row => ({id:row.id as string,name:row.name as string}));
  } catch { return []; }
}
