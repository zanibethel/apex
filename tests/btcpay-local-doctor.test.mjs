import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectBTCPayLocalConfig,runBTCPayLocalDoctor,
} from "../scripts/btcpay-local-doctor.mjs";

const compose = {
  services: {
    bitcoind: {environment:{BITCOIN_NETWORK:"regtest"},
      ports:[{host_ip:"127.0.0.1",target:43782,published:"43782"}]},
    nbxplorer:{environment:{NBXPLORER_NETWORK:"regtest",NBXPLORER_CHAINS:"btc"},
      ports:[{host_ip:"127.0.0.1",target:32838,published:"32838"}]},
    postgres:{ports:[{host_ip:"127.0.0.1",target:5432,published:"39372"}]},
    dev:{},
  },
};
const launch={profiles:{
  Bitcoin:{environmentVariables:{BTCPAY_NETWORK:"regtest"},applicationUrl:"http://localhost:14142/"},
  "Bitcoin-HTTPS":{environmentVariables:{BTCPAY_NETWORK:"regtest"},
    applicationUrl:"https://localhost:14142/"},
}};
test("local preflight verifies only config, never claims chain/live/payment readiness",()=>{
  const out=inspectBTCPayLocalConfig(compose,launch);
  assert.equal(out.localUrl,"https://localhost:14142/");
  assert.equal(out.localDevConfigVerified,true);
  assert.equal(out.bitcoinChainIndependentlyVerified,false);
  assert.equal(out.btcpayRunning,false);
  assert.equal(out.prismForwardingVerified,false);
  assert.equal(out.productionReady,false);
  assert.equal(Object.isFrozen(out),true);
});
test("any mainnet or different chain fails closed",()=>{
  for(const b of [
    {...compose,services:{...compose.services,bitcoind:{
      ...compose.services.bitcoind,environment:{BITCOIN_NETWORK:"mainnet"}}}},
    {...compose,services:{...compose.services,nbxplorer:{
      ...compose.services.nbxplorer,environment:{NBXPLORER_NETWORK:"testnet",NBXPLORER_CHAINS:"btc"}}}},
    {...compose,services:{...compose.services,nbxplorer:{
      ...compose.services.nbxplorer,environment:{NBXPLORER_NETWORK:"regtest",NBXPLORER_CHAINS:"btc,ltc"}}}},
  ]) assert.throws(()=>inspectBTCPayLocalConfig(b,launch),/regtest/);
  assert.throws(()=>inspectBTCPayLocalConfig(compose,{
    profiles:{...launch.profiles,"Bitcoin-HTTPS":{
      ...launch.profiles["Bitcoin-HTTPS"],
      environmentVariables:{BTCPAY_NETWORK:"mainnet"}}}}),/regtest/);
});
test("rejects public Compose RPC and any accidental public service",()=>{
  for(const host of [undefined,"","0.0.0.0","::"]) {
    const modified=structuredClone(compose);
    modified.services.postgres.ports=[{host_ip:host,target:5432,published:"5432"}];
    assert.throws(()=>inspectBTCPayLocalConfig(modified,launch),/public port/);
  }
  const modified=structuredClone(compose);
  modified.services.dev.ports=["14142:14142"];
  assert.throws(()=>inspectBTCPayLocalConfig(modified,launch),/public port/);
});
test("rejects missing services or an externally hosted local HTTPS profile",()=>{
  assert.throws(()=>inspectBTCPayLocalConfig({services:{}},launch));
  const bad=structuredClone(launch);
  bad.profiles["Bitcoin-HTTPS"].applicationUrl="https://example.com/";
  assert.throws(()=>inspectBTCPayLocalConfig(compose,bad),/loopback/);
});
test("doctor invokes only read-only tools and parses normalized upstream config",()=>{
  const calls=[];
  const fakeExec=(program,args)=>{
    calls.push({program,args});
    if(program==="dotnet")return "10.0.100";
    if(args[1]==="version")return "Docker Compose version v2.40.0";
    if(args.includes("config"))return JSON.stringify(compose);
    throw Error("unexpected command");
  };
  const fakeRead=(path)=>{
    if(path.endsWith("launchSettings.json"))return JSON.stringify(launch);
    if(path.endsWith("docker-compose.yml"))return "upstream fixture";
    throw Error("unexpected path");
  };
  const result=runBTCPayLocalDoctor("/synthetic/btcpayserver",{exec:fakeExec,read:fakeRead});
  assert.equal(result.localDevConfigVerified,true);
  assert.equal(calls.length,3);
  for(const {program,args} of calls){
    assert.ok(["dotnet","docker"].includes(program));
    assert.ok(!args.some(x=>["up","down","exec","run","start","stop","rm","build"].includes(x)));
  }
});
test("doctor supports Docker Compose v5 on current hosted GitHub runners",()=>{
  const exec=(program,args)=>{
    if(program==="dotnet")return "10.0.403";
    if(args[1]==="version")return "Docker Compose version v5.1.3";
    if(args.includes("config"))return JSON.stringify(compose);
    throw Error("unexpected tool");
  };
  const read=(path)=>path.endsWith("launchSettings.json")
    ?JSON.stringify(launch):"upstream compose";
  assert.equal(runBTCPayLocalDoctor("/synthetic/btcpayserver",{exec,read}).localDevConfigVerified,true);
});
test("doctor needs a real source path, Compose v2 and .NET 10 before config parsing",()=>{
  assert.throws(()=>runBTCPayLocalDoctor("relative/path"),/absolute/);
  const exec=(program,args)=>{
    if(program==="docker"&&args[1]==="version")return "Docker Compose version v1.29.0";
    return "10.0.1";
  };
  assert.throws(()=>runBTCPayLocalDoctor("/synthetic",{exec}),/v2/);
  assert.throws(()=>runBTCPayLocalDoctor("/synthetic",{exec:(p)=>p==="docker"?"Docker Compose version v2.5.0":"9.0.1"}),/SDK 10/);
});
