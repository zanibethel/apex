import { NextResponse } from "next/server";
import { readPublishedCatalog } from "@/lib/supabase/public-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await readPublishedCatalog();
  return NextResponse.json(
    {
      service: "apex-catalog",
      state: result.state,
      mode: "demo",
      writesEnabled: false,
    },
    {
      status: result.state === "connected" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
