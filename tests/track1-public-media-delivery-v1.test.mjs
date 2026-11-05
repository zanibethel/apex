import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parsePublicMediaVersionV1,resolvePublicMediaDeliveryV1}
 from "../src/lib/catalog/public-media-delivery-v1.mjs";

const store="20000000-0000-4000-8000-000000000003";
const productId="40000000-0000-4000-8000-000000000099";
const submission="80000000-0000-4000-8000-000000000004";
const evidenceId="80000000-0000-4000-8000-000000000005";
const versionId="80000000-0000-4000-8000-000000000006";
const source=store+"/"+productId+"/00000000-0000-4000-8000-000000000010.png";
const digest="a".repeat(64);
const assetKey="media/v1/"+store+"/"+productId+"/"+versionId+"/"+digest+".png";
const version=Object.freeze({schemaVersion:1,versionId,
 storeId:store,productId,submissionId:submission,evidenceEventId:evidenceId,
 sourceImagePath:source,sha256:digest,assetKey});
const good=()=>({
 version,product:{id:productId,store_id:store,image_path:source,
  category_id:"60000000-0000-4000-8000-000000000007",
  is_active:true,is_published:false,currency:"USD"},
 review:{store_id:store,product_id:productId,submission_id:submission,
  status:"approved_internal",snapshot:{image_path:source}},
 evidence:{id:evidenceId,store_id:store,product_id:productId,
  submission_id:submission,image_path:source,review_status:"evidence_recorded",
  identity_reference:"product specific evidence 1234",
  rights_reference:"licensed image evidence 5678"},
 latestEvidenceId:evidenceId,
 store:{id:store,supplier_id:"30000000-0000-4000-8000-000000000008",is_public:false},
 category:{id:"60000000-0000-4000-8000-000000000007",
  store_id:store,is_published:true},
 listing:{store_id:store,product_id:productId,supplier_wants_listing:true,
  admin_gate:"clear",republish_approval_required:false,republish_approved:false},
 supplierAuthorization:{supplier_id:"30000000-0000-4000-8000-000000000008",
  current:true},
 productAuthorization:{store_id:store,product_id:productId,current:true},
 globalReleaseEnabled:true,mediaDeliveryEnabled:true,
 identityHoldActive:false,revokedVersionIds:[],
});

test("v1 asset keys bind version, exact store/product, 64-byte digest and extension",()=>{
 const parsed=parsePublicMediaVersionV1(version);
 assert.deepEqual(parsed,version);
 assert.ok(Object.isFrozen(parsed));
 assert.equal(parsed.assetKey,assetKey);
 const bad=[
  {...version,schemaVersion:2},
  {...version,versionId:"bad"},
  {...version,sha256:"c".repeat(63)},
  {...version,sha256:"A".repeat(64)},
  {...version,assetKey:"https://evil.example/media.png"},
  {...version,assetKey:"../"+assetKey},
  {...version,assetKey:assetKey.replace("/v1/","/v2/")},
  {...version,sourceImagePath:source.replace(".png",".svg")},
  {...version,sourceImagePath:"apex-draft-product-images/"+source},
  {...version,sourceImagePath:"https://cdn.example/"+source},
  {...version,sourceImagePath:source.replace(productId,"40000000-0000-4000-8000-000000000010")},
  {...version,assetKey:assetKey.replace(".png",".webp")},
  {...version,extra:true},
  {...version,sourceImagePath:"../../secret"},
  null,undefined,[],{},
 ];
 for(const candidate of bad)
  assert.equal(parsePublicMediaVersionV1(candidate),null,
   "Reject untrusted asset version "+JSON.stringify(candidate));
});

test("complete independently trusted review can yield ONLY immutable public asset metadata",()=>{
 const result=resolvePublicMediaDeliveryV1(good());
 assert.equal(result.state,"ready");
 assert.equal(result.canDisplayPublicly,true);
 assert.equal(result.canCreateOrder,false);
 assert.equal(result.canPay,false);
 assert.deepEqual(result.asset,{
  schemaVersion:1,versionId,productId,assetKey,sha256:digest,
 });
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.asset));
 const shown=JSON.stringify(result);
 for(const privateValue of [source,"identity_reference","rights_reference",
  "supplier_id","store_id","submission_id","evidence_event_id",
  "sourceImagePath","private_media_evidence_events"]){
  assert.ok(!shown.includes(privateValue),"Private field leaked: "+privateValue);
 }
});

test("every release, media evidence and revocation transition removes public media",()=>{
 const cases=[
  ["release disabled",{globalReleaseEnabled:false}],
  ["media disabled",{mediaDeliveryEnabled:false}],
  ["identity hold",{identityHoldActive:true}],
  ["identity hold unverified",{identityHoldActive:null}],
  ["explicit revoked version",{revokedVersionIds:[versionId]}],
  ["revocation list unavailable",{revokedVersionIds:null}],
  ["release absent",{supplierAuthorization:null}],
  ["product approval absent",{productAuthorization:null}],
  ["latest evidence event absent",{latestEvidenceId:null}],
  ["latest evidence superseded",{latestEvidenceId:"80000000-0000-4000-8000-000000000011"}],
  ["review absent",{review:null}],
  ["product absent",{product:null}],
  ["store absent",{store:null}],
  ["category absent",{category:null}],
  ["listing absent",{listing:null}],
  ["version absent",{version:null}],
 ];
 for(const [name,changes] of cases){
  const result=resolvePublicMediaDeliveryV1({...good(),...changes});
  assert.equal(result.state,"unavailable",name);
  assert.equal(result.asset,null,name);
  assert.equal(result.canDisplayPublicly,false,name);
  assert.equal(result.canCreateOrder,false,name);
  assert.equal(result.canPay,false,name);
 }
 for(const raw of [null,false,[],0,"bad"])
  assert.equal(resolvePublicMediaDeliveryV1(raw).state,"unavailable");
});

test("product changes, publication status, review staleness or evidence mismatch deny old version",()=>{
 const cases=[
  ["image edit",{product:{...good().product,image_path:"changed/path.png"}}],
  ["category edit",{product:{...good().product,category_id:"60000000-0000-4000-8000-000000000010"}}],
  ["product unverified",{product:{...good().product,is_active:false}}],
  ["base published",{product:{...good().product,is_published:true}}],
  ["wrong store",{store:{...good().store,id:"20000000-0000-4000-8000-000000000014"}}],
  ["public base store",{store:{...good().store,is_public:true}}],
  ["unpublished category",{category:{...good().category,is_published:false}}],
  ["category foreign store",{category:{...good().category,store_id:"20000000-0000-4000-8000-000000000014"}}],
  ["unpublished switch",{listing:{...good().listing,supplier_wants_listing:false}}],
  ["admin hold",{listing:{...good().listing,admin_gate:"hold"}}],
  ["republish required",{listing:{...good().listing,republish_approval_required:true}}],
  ["internal review pending",{review:{...good().review,status:"pending_review"}}],
  ["content changed",{review:{...good().review,snapshot:{image_path:"changed/path.png"}}}],
  ["new submission",{review:{...good().review,submission_id:"80000000-0000-4000-8000-000000000019"}}],
  ["evidence correction",{evidence:{...good().evidence,review_status:"needs_correction"}}],
  ["wrong photo evidence",{evidence:{...good().evidence,image_path:"changed/path.png"}}],
  ["evidence rights absent",{evidence:{...good().evidence,rights_reference:""}}],
  ["evidence identity absent",{evidence:{...good().evidence,identity_reference:""}}],
  ["supplier approval expired",{supplierAuthorization:{...good().supplierAuthorization,current:false}}],
  ["product approval revoked",{productAuthorization:{...good().productAuthorization,current:false}}],
  ["cross-product approval",{productAuthorization:{...good().productAuthorization,product_id:"40000000-0000-4000-8000-000000000016"}}],
 ];
 for(const [name,changes] of cases){
  const result=resolvePublicMediaDeliveryV1({...good(),...changes});
  assert.equal(result.state,"unavailable",name);
  assert.equal(result.asset,null,name);
 }
});

test("gated public image proxy never discloses private paths or keys",()=>{
 const route=readFileSync("src/app/api/catalog/media/v1/[productId]/route.ts","utf8");
 assert.match(route,/status:404/);
 assert.match(route,/Cache-Control.*no-store/);
 assert.match(route,/state:"unavailable"/);
 assert.match(route,/redirect:"manual"/);
 assert.match(route,/cache:"no-store"/);
 assert.match(route,/\\/functions\\/v1\\/apex-media-v1\\/asset\\//);
 assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY|createSignedUrl|createPublicUrl|sourceImagePath|assetKey|setCookie/);
});
