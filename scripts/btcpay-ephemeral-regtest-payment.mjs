/**
 * TEST-ONLY Bitcoin Core RPC funding for a synthetic BTCPay invoice.
 * Uses worthless regtest coins on official upstream Docker dependencies.
 * No secrets or wallet output are returned or logged.
 */
import { execFileSync } from "node:child_process";
import { isAbsolute, join } from "node:path";

const btcAmount=/^(0|[1-9]\d?)(?:\.\d{1,8})?$/;

export function assertRegtestPaymentInput(input) {
  if(!input || input.testOnly!==true || input.network!=="regtest" ||
      typeof input.upstreamRoot!=="string" || !isAbsolute(input.upstreamRoot)) {
    throw Error("STOP: explicit local-only regtest context required");
  }
  if(typeof input.destination!=="string" ||
      !/^bcrt1[ac-hj-np-z02-9]{12,100}$/i.test(input.destination)) {
    throw Error("STOP: destination must be a regtest bech32 address");
  }
  if(typeof input.amount!=="string" || !btcAmount.test(input.amount)) {
    throw Error("STOP: invalid exact Bitcoin payment decimal");
  }
  const [whole,fraction=""]=input.amount.split(".");
  const sats=BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,"0"));
  if(sats<1000n || sats>100000000n) {
    throw Error("STOP: outside disposable regtest payment test amount");
  }
  return sats;
}

export async function fundEphemeralInvoice(input, {
  exec=execFileSync,
}={}) {
  assertRegtestPaymentInput(input);
  const compose=join(input.upstreamRoot,"BTCPayServer.Tests","docker-compose.yml");
  const run=(args)=>{
    let output;
    try {
      output=String(exec("docker",[
        "compose","-f",compose,"exec","-T","bitcoind",
        "bitcoin-cli","-datadir=/data","-regtest",...args
      ],{
        cwd:input.upstreamRoot,encoding:"utf8",timeout:60000,
        stdio:["ignore","pipe","pipe"],maxBuffer:1024*1024
      })).trim();
    } catch {
      throw Error("Local disposable Bitcoin RPC operation failed");
    }
    try{return JSON.parse(output);}catch{return output;}
  };
  // Before creating any wallet, mining or transfer, verify the actual chain.
  const chain=run(["getblockchaininfo"]);
  if(chain?.chain!=="regtest")
    throw Error("STOP: connected Bitcoin Core is not on regtest");
  const check=run(["validateaddress",input.destination]);
  if(check?.isvalid!==true)
    throw Error("STOP: invoice destination is invalid on actual regtest chain");
  const walletName="apex_ephemeral_ci_sender";
  run(["createwallet",walletName]);
  const miningAddr=run(["-rpcwallet="+walletName,"getnewaddress","","bech32"]);
  if(typeof miningAddr!=="string" || !miningAddr.startsWith("bcrt1"))
    throw Error("STOP: miner wallet address is not regtest");
  run(["generatetoaddress","101",miningAddr]);
  const txid=run(["-rpcwallet="+walletName,"sendtoaddress",
    input.destination,input.amount]);
  if(typeof txid!=="string"||!/^[a-f0-9]{64}$/i.test(txid))
    throw Error("Synthetic regtest wallet payment was not submitted");
  // Extra blocks allow on-chain settlement policies to confirm.
  run(["generatetoaddress","6",miningAddr]);
  return Object.freeze({
    network:"regtest",localTransactionCreated:true,blocksGenerated:107,
    // Neither tx id nor address is needed for CI pass/fail, keep logs minimal.
    transactionIdVerified:true,productionReady:false
  });
}
