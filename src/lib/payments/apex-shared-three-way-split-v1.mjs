/**
 * Apex's single-BTCPay-store three-way allocation policy (planning only).
 *
 * All percentages are basis points of the SAME gross allocation base:
 * platform fixed at 1000 bps (10%), Lily + Tierra sum to 9000 bps (90%).
 * Recipients are explicit internal IDs; none are wallet destinations.
 * Never execute a payment from this helper. No provider credentials or PII.
 */
import { allocateSats } from "./allocation-engine.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXACT=(o,keys)=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&
 Object.keys(o).length===keys.length&&keys.every(key=>Object.hasOwn(o,key));
const PLATFORM_BPS=1000;
const SUPPLIERS_BPS=9000;

export function buildApexSharedThreeWayDraftV1({
 storeId,recipientIds,lilyBasisPoints=4500,
}={}) {
 if(!UUID.test(storeId??"")||
    !EXACT(recipientIds,["apex","lily","tierra"])||
    !Object.values(recipientIds).every(v=>typeof v==="string"&&UUID.test(v))||
    new Set(Object.values(recipientIds).map(v=>v.toLowerCase())).size!==3||
    !Number.isSafeInteger(lilyBasisPoints)||
    lilyBasisPoints<=0||lilyBasisPoints>=SUPPLIERS_BPS)
  throw Error("Invalid shared-store three-way draft");
 const allocations=[
  {role:"apex",recipient_id:recipientIds.apex,basis_points:PLATFORM_BPS},
  {role:"lily",recipient_id:recipientIds.lily,basis_points:lilyBasisPoints},
  {role:"tierra",recipient_id:recipientIds.tierra,basis_points:SUPPLIERS_BPS-lilyBasisPoints},
 ];
 return Object.freeze({
  template:"apex_shared_three_way_v1",
  scope_type:"storefront",scope_id:storeId,
  platform_basis_points:PLATFORM_BPS,
  supplier_pool_basis_points:SUPPLIERS_BPS,
  allocations:Object.freeze(allocations.map(x=>Object.freeze(x))),
  draft_only:true,canActivate:false,canPay:false,canShip:false,
 });
}

/**
 * Review-only versioned order entitlement. No real BTC, no Prism interaction.
 * The input is a previously approved *test fixture*, not an admin draft.
 */
export function snapshotApexSharedThreeWayRegtestV1({
 draft,version,orderReference,amountSats,testOnly,network,
}={}) {
 if(testOnly!==true||network!=="regtest"||!draft||
    draft.template!=="apex_shared_three_way_v1"||
    draft.draft_only!==true||draft.canPay!==false||
    !Array.isArray(draft.allocations)||draft.allocations.length!==3||
    !Number.isSafeInteger(version)||version<1||
    typeof orderReference!=="string"||
    !/^[A-Za-z0-9_-]{1,100}$/.test(orderReference)||
    typeof amountSats!=="bigint"||
    amountSats<1000n||amountSats>100000000n)
  throw Error("Synthetic regtest split snapshot denied");
 const normalized=buildApexSharedThreeWayDraftV1({
  storeId:draft.scope_id,
  recipientIds:Object.fromEntries(draft.allocations.map(x=>[x.role,x.recipient_id])),
  lilyBasisPoints:draft.allocations[1].basis_points,
 });
 if(draft.allocations.some((r,i)=>
    r.role!==normalized.allocations[i].role||
    r.basis_points!==normalized.allocations[i].basis_points||
    r.recipient_id!==normalized.allocations[i].recipient_id))
  throw Error("Modified split allocation not permitted");
 const result=allocateSats(amountSats.toString(),normalized.allocations.map(x=>({
  recipientId:x.recipient_id,basisPoints:x.basis_points,
 })));
 return Object.freeze({
  network:"regtest",testOnly:true,orderReference,
  ruleVersion:version,scopeId:normalized.scope_id,
  grossSats:result.totalSats,
  allocations:Object.freeze(result.allocations.map((r,i)=>Object.freeze({
   role:normalized.allocations[i].role,recipientId:r.recipientId,
   basisPoints:r.basisPoints,entitlementSats:r.amountSats,
  }))),
  feeBasis:"gross_fixture_only",feeAccountingVerified:false,
  prismForwardingVerified:false,productionReady:false,
  canCreatePayout:false,canShip:false,
 });
}
