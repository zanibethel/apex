#!/usr/bin/env node
// Manual operator-only preflight. No payment or wallet mutations.
import { checkBTCPayTestStore } from "../src/lib/payments/btcpay-readiness.mjs";

const config = {
  testMode: process.env.APEX_BTCPAY_TEST_MODE === "true",
  expectedNetwork: process.env.APEX_BTCPAY_TEST_NETWORK,
  serverUrl: process.env.APEX_BTCPAY_TEST_URL,
  storeId: process.env.APEX_BTCPAY_TEST_STORE_ID,
  apiKey: process.env.APEX_BTCPAY_TEST_READONLY_API_KEY,
};

try {
  const outcome = await checkBTCPayTestStore(config);
  process.stdout.write(JSON.stringify(outcome, null, 2) + "\n");
} catch {
  // Suppress underlying transport errors: some include target URLs or headers.
  process.stderr.write("BTCPay read-only test-store preflight failed. Check host, TLS, configuration and API permissions locally.\n");
  process.exitCode = 1;
}
