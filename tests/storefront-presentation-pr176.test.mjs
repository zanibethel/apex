import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");

test("public storefront shows normal catalog navigation, no test-payment promotion",()=>{
 const home=read("src/app/page.tsx");
 const catalog=read("src/app/catalog/page.tsx");
 const layout=read("src/app/layout.tsx");
 const menu=read("src/app/account-menu.tsx");
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 for(const publicView of [home,catalog,layout,menu,shelf]){
  assert.doesNotMatch(publicView,/concept preview|working concept|fake payment|fictitious|fictional checkout/i);
 }
 assert.match(home,/Browse the catalog/);
 assert.match(home,/Checkout is currently unavailable/);
 assert.match(catalog,/readApprovedSoldOutCatalog\(page\)/);
 assert.match(catalog,/internalCheckoutPreview&&<section/);
 assert.match(catalog,/<DemoCatalogShelf\/>/);
 assert.match(catalog,/isVerifiedPlatformAdmin\(identity\.user\)/);
 assert.doesNotMatch(home+menu,/href="\/checkout\/preview"/);
 assert.doesNotMatch(layout,/DEMO ONLY/);
 assert.match(layout,/admin&&process\.env\.APEX_CHECKOUT_MODE==="demo"/);
 assert.match(shelf,/type="button" disabled/);
 assert.match(shelf,/No products available right now/);
});
test("retired checkout route is admin-only and never exposes simulated payments",()=>{
 const route=read("src/app/checkout/preview/page.tsx");
 assert.match(route,/redirect\("\/admin\/checkout-review"\)/);
 assert.doesNotMatch(route,/CheckoutPreview|APEX_CHECKOUT_MODE/);
 assert.match(route,/createSupplierServerClient\(\)/);
 assert.match(route,/auth\.getUser\(\)/);
 assert.match(route,/isVerifiedPlatformAdmin\(data\.user\)/);
 assert.match(route,/if\(error\|\|!isVerifiedPlatformAdmin\(data\.user\)\)notFound\(\)/);
 assert.doesNotMatch(route,/service_role|\.insert\(|\.update\(|createInvoice/);
});
test("admin can inspect actual product cards with existing signed-in Supabase RLS",()=>{
 const page=read("src/app/admin/storefront-preview/page.tsx");
 const dash=read("src/app/admin/page.tsx");
 assert.match(page,/createSupplierServerClient\(\)/);
 assert.match(page,/auth\.getUser\(\)/);
 assert.match(page,/isVerifiedPlatformAdmin\(auth\.user\)/);
 assert.match(page,/from\("products"\)/);
 assert.match(page,/from\("inventory_items"\)/);
 assert.match(page,/from\("categories"\)/);
 assert.match(page,/createSignedUrl\(product\.image_path!,90\)/);
 assert.match(page,/<OfferTile/);
 assert.match(page,/limit\(LIMIT\)/);
 assert.match(dash,/href: "\/admin\/storefront-preview"/);
 assert.doesNotMatch(page,/service_role|createPublicUrl|\.insert\(|\.update\(|\.delete\(|\.upsert\(|createInvoice|createPayout/);
 assert.match(page,/Checkout remains unavailable/);
});
test("Publish/Unpublish control does not falsely grant release or override admin holds",()=>{
 const control=read("src/app/supplier/catalog/listing-control-form.tsx");
 const rpc=read("src/app/supplier/catalog/listing-actions.ts");
 const helper=read("src/lib/catalog/supplier-storefront-visibility.mjs");
 const gate=read("src/lib/supabase/approved-sold-out-catalog.ts");
 assert.match(control,/publishLabel="Publish"/);
 assert.match(control,/>Unpublish<\/button>/);
 assert.match(control,/The public listing becomes visible only when its release checks are satisfied/);
 assert.match(rpc,/set_supplier_listing_intent/);
 assert.match(helper,/control\?\.adminGate==="hold"/);
 assert.match(helper,/releaseDecision\.effective_public===true/);
 assert.match(gate,/APEX_PUBLIC_SOLD_OUT_CATALOG!=="enabled"/);
 assert.doesNotMatch(control+rpc,/\.update\(\{is_published|\.update\(\{is_public|createPublicUrl/);
});
