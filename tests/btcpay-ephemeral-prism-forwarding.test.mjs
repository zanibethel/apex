import test from "node:test";
import assert from "node:assert/strict";
import { payoutSettings } from "../scripts/btcpay-ephemeral-prism-forwarding.mjs";
const addresses={
 supplier:"bcrt1q"+"q".repeat(38),
 platform:"bcrt1q"+"p".repeat(38),
};
test("Prism on-chain settings follow two distinct synthetic admin rule versions",()=>{
 for(const [supplier,version] of [[9000,1],[8500,2]]){
   const {settings,frozen}=payoutSettings({supplier,version},addresses);
   assert.equal(settings.Enabled,true);
   assert.equal(settings.Reserve,2);
   assert.equal(settings.Splits.length,1);
   assert.equal(settings.Splits[0].Source,"*CHAIN");
   assert.deepEqual(settings.Splits[0].Destinations.map(d=>d.Percentage),
     [supplier/100,(10000-supplier)/100]);
   assert.deepEqual(Object.values(settings.Destinations).map(d=>d.PayoutMethodId),
     ["BTC-CHAIN","BTC-CHAIN"]);
   assert.equal(frozen.rule.version,version);
   assert.equal(frozen.pending.reduce((a,b)=>a+b.entitlementSats,0n),10000000n);
   assert.equal(frozen.productionReady,false);
 }
});
test("Prism test configuration refuses mainnet destinations and malformed percentages",()=>{
 assert.throws(()=>payoutSettings({supplier:9000,version:1},{
   supplier:"bc1q"+"q".repeat(38),platform:addresses.platform,
 }));
 for(const supplier of [9000.5,-1,10001,NaN])
   assert.throws(()=>payoutSettings({supplier,version:1},addresses));
 assert.throws(()=>payoutSettings({supplier:9000,version:0},addresses));
});
