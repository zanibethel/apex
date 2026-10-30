import test from "node:test";
import assert from "node:assert/strict";
import {allocateSats,selectRule} from "../src/lib/payments/allocation-engine.mjs";
test("three recipients and exact sum",()=>{
 const result=allocateSats("2000000",[{recipientId:"apex",basisPoints:1000},{recipientId:"lily",basisPoints:5000},{recipientId:"tierra",basisPoints:4000}]);
 assert.deepEqual(result.allocations.map(x=>x.amountSats),["200000","1000000","800000"]);
});
test("deterministic rounding and no missing satoshis",()=>{
 const r=allocateSats("1",[{recipientId:"a",basisPoints:3333},{recipientId:"b",basisPoints:3333},{recipientId:"c",basisPoints:3334}]);
 assert.deepEqual(r.allocations.map(x=>x.amountSats),["0","0","1"]);
});
test("rejects invalid allocations",()=>{
 assert.throws(()=>allocateSats("100",[{recipientId:"a",basisPoints:9000}]));
 assert.throws(()=>allocateSats("100",[{recipientId:"a",basisPoints:5000},{recipientId:"a",basisPoints:5000}]));
 assert.throws(()=>allocateSats("1.5",[{recipientId:"a",basisPoints:10000}]));
});
test("selects product before supplier before storefront",()=>{
 const common={status:"active",effectiveFrom:"2026-01-01T00:00:00Z"};
 const rules=[{...common,id:1,scopeType:"storefront",scopeId:"shop"},{...common,id:2,scopeType:"supplier",scopeId:"supplier"},{...common,id:3,scopeType:"product",scopeId:"product"}];
 const ctx={storefrontId:"shop",supplierId:"supplier",productId:"product",at:"2026-10-30T00:00:00Z"};
 assert.equal(selectRule(rules,ctx).id,3);
 assert.equal(selectRule(rules.slice(0,2),ctx).id,2);
 assert.throws(()=>selectRule([],ctx));
});
test("overlapping same-scope rules fail closed",()=>{
 const rule={status:"active",scopeType:"storefront",scopeId:"shop",effectiveFrom:"2026-01-01T00:00:00Z"};
 assert.throws(()=>selectRule([{...rule,id:1},{...rule,id:2}],{storefrontId:"shop",at:"2026-10-30T00:00:00Z"}));
});
