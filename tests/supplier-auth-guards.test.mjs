import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

test("protected workspace requires verified Auth user and RLS-visible membership", () => {
  assert.ok(existsSync(join(process.cwd(), "src/proxy.ts")));
  const page = read("src/app/supplier/page.tsx");
  assert.match(page, /auth\.getUser\(\)/);
  assert.match(page, /supplier_memberships/);
  assert.match(page, /redirect\("\/supplier\/sign-in"\)/);
  assert.doesNotMatch(page, /getSession\(\)|service_role|user_metadata/);
});
test("login is invitation-only and a missing membership revokes session", () => {
  const actions = read("src/app/supplier/sign-in/actions.ts");
  assert.match(actions, /signInWithPassword/);
  assert.match(actions, /supplier_memberships/);
  assert.match(actions, /auth\.signOut\(\)/);
  assert.doesNotMatch(actions, /signUp\(|auth\.admin\.|service_role|\.insert\(|\.update\(/);
});
test("Next 16 proxy validates claims and protects cache headers", () => {
  assert.match(read("src/lib/supabase/supplier-proxy.ts"), /getClaims\(\)/);
  assert.match(read("src/lib/supabase/supplier-proxy.ts"), /Cache-Control/);
  assert.match(read("src/proxy.ts"), /matcher: \["\/supplier\/:path\*", "\/admin\/:path\*"\]/);
});
test("auth config fails closed for other projects, environments and secret keys", () => {
  const config = read("src/lib/supabase/session-config.ts");
  assert.match(config, /fhqpkpztercadcxspdkg\.supabase\.co/);
  assert.match(config, /APP_MODE !== "demo"/);
  assert.match(config, /startsWith\("sb_publishable_"\)/);
  assert.doesNotMatch(config, /service_role|SUPABASE_SECRET/i);
});
test("runtime dependency versions are exact pins", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies["@supabase/ssr"], "0.12.7");
  assert.equal(pkg.dependencies["@supabase/supabase-js"], "2.118.0");
});

test("package lock and CI install from pinned dependencies", () => {
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.packages[""].dependencies["@supabase/ssr"], "0.12.7");
  assert.equal(lock.packages[""].dependencies["@supabase/supabase-js"], "2.118.0");
  assert.match(read(".github/workflows/ci.yml"), /npm ci --no-audit --no-fund/);
});
