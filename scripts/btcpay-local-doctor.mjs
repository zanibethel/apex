import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {isAbsolute,join,resolve} from "node:path";
// Operator-only read-only local BTCPay development checks. Never starts services.
const env = x => Array.isArray(x)
  ? Object.fromEntries(x.map(v=>{const i=v.indexOf("=");if(i<1)throw Error("Bad Compose env");return [v.slice(0,i),v.slice(i+1)];}))
  : x || {};
export function inspectBTCPayLocalConfig(compose, launch) {
  const s=compose?.services, p=launch?.profiles;
  if(!s?.bitcoind||!s?.nbxplorer||!s?.postgres||!p)
    throw Error("Official Bitcoin dev services or launch profiles are missing");
  if(env(s.bitcoind.environment).BITCOIN_NETWORK!=="regtest" ||
     env(s.nbxplorer.environment).NBXPLORER_NETWORK!=="regtest" ||
     env(s.nbxplorer.environment).NBXPLORER_CHAINS!=="btc")
    throw Error("STOP: dev chain must be Bitcoin-only regtest");
  for(const [name,service] of Object.entries(s)) for(const port of service.ports||[]) {
    if(!port || typeof port!=="object" || !["127.0.0.1","::1"].includes(port.host_ip))
      throw Error("STOP: public port in upstream dev service "+name);
  }
  for(const name of ["Bitcoin","Bitcoin-HTTPS"])
    if(p[name]?.environmentVariables?.BTCPAY_NETWORK!=="regtest")
      throw Error("STOP: BTCPay launch profile is not regtest");
  const url=new URL(p["Bitcoin-HTTPS"].applicationUrl);
  if(url.protocol!=="https:"||url.hostname!=="localhost"||url.username||url.password||url.search||url.hash)
    throw Error("STOP: expected loopback-only HTTPS launch");
  return Object.freeze({localDevConfigVerified:true,localUrl:url.href,
    bitcoinChainIndependentlyVerified:false,btcpayRunning:false,
    prismForwardingVerified:false,productionReady:false});
}
export function runBTCPayLocalDoctor(sourceDir,{read=readFileSync,exec=execFileSync}={}) {
  if(typeof sourceDir!=="string"||!isAbsolute(sourceDir))
    throw Error("Provide absolute local clone path for the BTCPay Server source");
  const root=resolve(sourceDir);
  const call=(bin,args)=>{
    try {return String(exec(bin,args,{cwd:root,encoding:"utf8",timeout:15000,
      stdio:["ignore","pipe","pipe"],maxBuffer:2*1024*1024})).trim();}
    catch{throw Error("Missing or failed development prerequisite: "+bin);}
  };
  if(!/\bv?2\.\d+/.test(call("docker",["compose","version"])))
    throw Error("Docker Compose v2 or later is required");
  if(!/^1\d\./.test(call("dotnet",["--version"])))
    throw Error(".NET SDK 10 or later is required for upstream BTCPay development");
  const file=join(root,"BTCPayServer.Tests","docker-compose.yml");
  const profiles=join(root,"BTCPayServer","Properties","launchSettings.json");
  let compose,launch;
  try {
    read(file,"utf8");
    compose=JSON.parse(call("docker",["compose","-f",file,"config","--format","json"]));
    launch=JSON.parse(read(profiles,"utf8"));
  }catch{throw Error("Could not validate upstream BTCPay source/configuration");}
  return inspectBTCPayLocalConfig(compose,launch);
}
if(process.argv[1]?.endsWith("btcpay-local-doctor.mjs")){
  try {process.stdout.write(JSON.stringify(runBTCPayLocalDoctor(process.argv[2]),null,2)+"\n");}
  catch(e){process.stderr.write(e.message+"\n");process.exitCode=1;}
}
