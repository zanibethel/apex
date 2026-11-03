import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (name) => readFileSync(join(root, name), "utf8");

test("navigation points to a real catalog route", () => {
  assert.ok(existsSync(join(root, "src/app/catalog/page.tsx")));
  assert.match(read("src/app/page.tsx"), /href="\/catalog"/);
});
test("preview is visibly non-transactional", () => {
  assert.match(read("src/app/page.tsx"), /Checkout is currently unavailable/);
  assert.match(read("src/app/catalog/page.tsx"), /Checkout is currently unavailable/);
  assert.doesNotMatch(read("src/app/page.tsx"),/href="\/checkout/);
  assert.match(read("src/app/catalog/page.tsx"),/internalCheckoutPreview&&<section/);
  assert.match(read("src/app/checkout/preview/page.tsx"),/isVerifiedPlatformAdmin\(data\.user\)/);
  assert.ok(existsSync(join(root,"src/app/checkout/preview/page.tsx")));
  assert.match(read("src/app/layout.tsx"), /index: false/);
});
test("runtime configuration does not include production wallet integrations", () => {
  assert.match(read(".env.example"), /NEXT_PUBLIC_APP_MODE=demo/);
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.private, true);
  assert.ok(!Object.keys(pkg.dependencies).some((key) => /wallet|btcpay|prism/i.test(key)));
});
