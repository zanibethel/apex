import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const loader = read("src/lib/supabase/public-catalog.ts");

test("public loader is pinned to Apex and performs only GET reads", () => {
  assert.match(loader, /fhqpkpztercadcxspdkg\.supabase\.co/);
  assert.match(loader, /method: "GET"/);
  assert.match(loader, /cache: "no-store"/);
  assert.match(loader, /is_published", "eq\.true"/);
  assert.doesNotMatch(loader, /service_role|SUPABASE_SECRET|\.insert\(|\.update\(|\.delete\(/);
});
test("health endpoint reports no writes and hides raw provider results", () => {
  const health = read("src/app/api/catalog-health/route.ts");
  assert.match(health, /writesEnabled: false/);
  assert.match(health, /Cache-Control/);
  assert.doesNotMatch(health, /publishableKey|apiKey|apikey|products:|console\.log/);
});
test("preview stays nontransactional and environment sample has no keys", () => {
  const catalog = read("src/app/catalog/page.tsx");
  const env = read(".env.example");
  assert.match(catalog, /No checkout, ordering or live inventory/);
  assert.match(env, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
  assert.doesNotMatch(env, /sb_publishable_[A-Za-z0-9]+/);
  assert.doesNotMatch(env, /SERVICE_ROLE|SUPABASE_SECRET/);
});
