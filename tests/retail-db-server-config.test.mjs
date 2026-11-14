import test from "node:test";
import assert from "node:assert/strict";
import {rootCertificates} from "node:tls";
import {validateRetailCheckoutServerConfigV1,createRetailCheckoutServerPoolV1}
 from "../src/lib/checkout/retail-db-server-config-v1.mjs";
const ID="fhqpkpztercadcxspdkg";
const HOST="aws-0-us-east-1.pooler.supabase.com"; // Verified from the Apex Supabase Connect panel.
const base={
 APEX_RETAIL_DB_URL:"postgresql://apex_retail_checkout_app."+ID+":not-a-real-password@"+HOST+":6543/postgres",
 APEX_RETAIL_FINGERPRINT_KEY:"ab".repeat(32),
 APEX_RETAIL_DELIVERY_KEY_HEX:"ef".repeat(32),
 APEX_RETAIL_DELIVERY_KEY_REF:"2026_11_v1",
 // Valid public CA fixture for parser testing only; NOT the Supabase production CA.
 APEX_RETAIL_DB_CA_PEM:rootCertificates[0],
};
test("validates only the scoped custom role, TLS and protected encryption keys",()=>{
 const v=validateRetailCheckoutServerConfigV1(base);
 assert.equal(v.max,2);
 assert.equal(v.ssl.rejectUnauthorized,true);
 assert.equal(v.ssl.ca,rootCertificates[0]);
 assert.equal(v.deliveryKey.length,32);
 assert.equal(v.deliveryKeyReference,"2026_11_v1");
 class Pool{
  constructor(options){this.options=options;}
  async connect(){return null;}
 }
 const p=createRetailCheckoutServerPoolV1(base,Pool);
 assert.equal(p.pool.options.max,2);
 assert.equal("fingerprintKey" in p.pool.options,false);
 assert.equal("deliveryKey" in p.pool.options,false);
 assert.equal(p.fingerprintKey,base.APEX_RETAIL_FINGERPRINT_KEY);
 assert.equal(p.deliveryKey.equals(Buffer.from("ef".repeat(32),"hex")),true);
});
test("rejects all admin, unverified pooler, other project and weak TLS settings",()=>{
 const overrides=[
  {APEX_RETAIL_DB_URL:"postgresql://postgres:"+encodeURIComponent("password")+"@"+HOST+":6543/postgres"},
  {APEX_RETAIL_DB_URL:"postgresql://apex_retail_checkout_app.otherref:pw@"+HOST+":6543/postgres"},
  {APEX_RETAIL_DB_URL:"postgresql://apex_retail_checkout_app."+ID+":pw@evil.example.com:6543/postgres"},
  {APEX_RETAIL_DB_URL:"postgresql://apex_retail_checkout_app."+ID+":pw@"+HOST+":443/postgres"},
  {APEX_RETAIL_DB_URL:"postgresql://apex_retail_checkout_app."+ID+":pw@"+HOST+":6543/postgres?sslmode=disable"},
  {APEX_RETAIL_DB_URL:"postgresql://apex_retail_checkout_app."+ID+":pw@"+HOST+":6543/postgres#fragment"},
  {APEX_RETAIL_DB_URL:"postgresql://apex_retail_checkout_app:"+encodeURIComponent("x")+"@db.other.supabase.co:5432/postgres"},
  {APEX_RETAIL_FINGERPRINT_KEY:"guessable"},
  {APEX_RETAIL_DELIVERY_KEY_HEX:"ff"},
  {APEX_RETAIL_DELIVERY_KEY_REF:"!invalid"},
  {APEX_RETAIL_DB_CA_PEM:""},
  {APEX_RETAIL_DB_CA_PEM:"-----BEGIN CERTIFICATE-----garbage-----END CERTIFICATE-----"},
  {APEX_RETAIL_DB_URL:"postgresql://apex_retail_checkout_app."+ID+":pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres"},
 ];
 for(const override of overrides){
  assert.throws(()=>validateRetailCheckoutServerConfigV1({...base,...override}),
   /Retail database configuration unavailable/,
   JSON.stringify(override).replace(/password|pw/g,"[redacted]"));
 }
});
test("accepts only explicit correct direct TLS identity, not a derived pooler host",()=>{
 const valid="postgresql://apex_retail_checkout_app:dummy@db."+ID+".supabase.co:5432/postgres";
 assert.ok(validateRetailCheckoutServerConfigV1({...base,APEX_RETAIL_DB_URL:valid}));
 assert.throws(()=>validateRetailCheckoutServerConfigV1({
  ...base,APEX_RETAIL_DB_URL:valid.replace(":5432",":6543"),
 }),/Retail database configuration unavailable/);
});
