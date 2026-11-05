import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readBoundedProviderJsonText}
 from "../src/lib/btcpay/bounded-json-read-v1.mjs";
import {probePrivateGreenfieldStore}
 from "../src/lib/btcpay/private-greenfield-status.mjs";

const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const key="synthetic-readonly-key-not-for-external-use";
const rawBindings=JSON.stringify([{
 apexStoreId:store,providerUrl:"https://payments.example.org",
 providerStoreId:"example-store",keyEnv:"APEX_BTCPAY_KEY_TEST",
}]);
const base={apexStoreId:store,rawBindings,
 env:{APEX_BTCPAY_KEY_TEST:key}};
const valid=JSON.stringify({
 id:"example-store",name:"Synthetic Private Store",defaultCurrency:"USD",
});

test("bounded Greenfield body accepts ordinary streamed JSON, including split UTF-8",async()=>{
 const body=new ReadableStream({start(controller){
  const bytes=new TextEncoder().encode(valid);
  controller.enqueue(bytes.slice(0,5));
  controller.enqueue(bytes.slice(5));
  controller.close();
 }});
 const response=new Response(body,{
  headers:{"Content-Type":"application/json; charset=utf-8"},
 });
 assert.equal(await readBoundedProviderJsonText(response),valid);
 const received=await probePrivateGreenfieldStore({...base,
  fetchImpl:async()=>new Response(valid,{
   status:200,headers:{"Content-Type":"application/json"},
  }),
 });
 assert.equal(received.status,"store_verified");
 assert.equal(received.defaultCurrency,"USD");
 assert.equal(JSON.stringify(received).includes(key),false);
});

test("streamed oversized response is denied before text() materialization",async()=>{
 let textCalled=false;
 const response=new Response(new ReadableStream({start(controller){
  controller.enqueue(new TextEncoder().encode("x".repeat(16001)));
  controller.close();
 }}),{headers:{"Content-Type":"application/json"}});
 response.text=async()=>{textCalled=true;throw Error("full body read forbidden");};
 assert.equal(await readBoundedProviderJsonText(response),null);
 assert.equal(textCalled,false);
 const provider=await probePrivateGreenfieldStore({...base,
  fetchImpl:async()=>new Response("x".repeat(16001),{
   status:200,headers:{"Content-Type":"application/json"},
  }),
 });
 assert.equal(provider.status,"invalid_response");
});

test("oversized advertised content-length is denied before reading any body",async()=>{
 let reads=0;
 const response={
  headers:{get(name){
   if(name==="content-length")return "16001";
   if(name==="content-type")return "application/json";
   return null;
  }},
  text:async()=>{reads++;return valid;},
 };
 assert.equal(await readBoundedProviderJsonText(response),null);
 assert.equal(reads,0);
});

test("invalid media type, malformed UTF-8 and broken streams fail closed",async()=>{
 assert.equal(await readBoundedProviderJsonText(
  new Response(valid,{headers:{"Content-Type":"text/html"}})),null);
 const badUtf8=new ReadableStream({start(controller){
  controller.enqueue(new Uint8Array([0xff,0xfe]));
  controller.close();
 }});
 assert.equal(await readBoundedProviderJsonText(
  new Response(badUtf8,{headers:{"Content-Type":"application/json"}})),null);
 const broken=new ReadableStream({pull(){throw Error("secret connection error");}});
 assert.equal(await readBoundedProviderJsonText(new Response(broken)),null);
});

test("mock compatibility still enforces UTF-8 BYTE bounds",async()=>{
 assert.equal(await readBoundedProviderJsonText({text:async()=>valid}),valid);
 assert.equal(await readBoundedProviderJsonText({
  text:async()=>"é".repeat(8100),
 }),null);
 assert.equal(await readBoundedProviderJsonText({
  headers:{get:()=>null},body:null,text:async()=>valid,
 }),null);
});

test("read-only probe never grants payment rights or emits provider payloads",()=>{
 const probe=readFileSync("src/lib/btcpay/private-greenfield-status.mjs","utf8");
 const guard=readFileSync("src/lib/btcpay/bounded-json-read-v1.mjs","utf8");
 assert.match(probe,/readBoundedProviderJsonText\(response\)/);
 assert.doesNotMatch(probe,/response\.text\(\)/);
 assert.match(probe,/method:"GET"/);
 assert.match(probe,/redirect:"error"/);
 assert.doesNotMatch(probe,/method:"POST"|createInvoice|createPayout/);
 assert.doesNotMatch(guard,/console\.|\.insert\(|\.update\(|method:"POST"/);
});
