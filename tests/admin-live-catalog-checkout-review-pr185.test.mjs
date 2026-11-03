import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const page=read("src/app/admin/checkout-review/page.tsx");
const component=read("src/app/admin/checkout-review/checkout-catalog-review.tsx");
const tile=read("src/components/catalog/offer-tile.tsx");
const preview=read("src/app/admin/storefront-preview/page.tsx");

test("real-catalog checkout review is admin-only and uses normal Supabase RLS",()=>{
 assert.match(page,/createSupplierServerClient/);
 assert.match(page,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(page,/redirect\("\/admin\/sign-in"\)/);
 assert.match(page,/\.eq\("store_id",STORE_ID\)/);
 assert.match(page,/\.eq\("is_published",false\)/);
 assert.match(page,/createSignedUrl\(p\.image_path!,120\)/);
 assert.match(page,/Number\.isSafeInteger/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.doesNotMatch(page,/service_role|createServiceRoleClient|SUPABASE_SERVICE_ROLE/);
 assert.doesNotMatch(page,/\.update\(|\.insert\(|\.upsert\(|\.delete\(|\.rpc\(/);
});
test("customer details stay in React state and never create orders or provider invoices",()=>{
 assert.match(component,/products:ReviewProduct\[\]/);
 assert.match(component,/product\.priceCents\*quantity/);
 assert.match(component,/compareAtCents/);
 assert.match(component,/Sold Out · 0 available/);
 assert.match(component,/useState<"details"\|"payment">/);
 assert.match(component,/reviewDetails\(details\)/);
 assert.match(component,/Payment unavailable/);
 assert.match(component,/disabled>/);
 assert.doesNotMatch(component,/fetch\(|\.rpc\(|createInvoice|paymentConfirmed|router\.push|localStorage|sessionStorage/);
 assert.doesNotMatch(component,/Simulate payment|DEMO_ITEMS|demo-cart|Fictional Bitcoin/);
});
test("private product tiles show a concise description and compare-at reference without false discount",()=>{
 assert.match(tile,/shortPrivateCatalogDescription/);
 assert.match(tile,/Full description/);
 assert.match(tile,/compareAtCents>priceCents/);
 assert.match(tile,/Compare at/);
 assert.doesNotMatch(tile,/50% OFF|DISCOUNT GUARANTEED|was-price/);
 assert.match(preview,/href="\/admin\/checkout-review"/);
});
