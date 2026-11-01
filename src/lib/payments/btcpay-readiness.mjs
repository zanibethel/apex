/**
 * Non-transactional BTCPay test-store connectivity check.
 * No invoice creation, checkout, database writes, wallet access, or payouts.
 * A successful store read DOES NOT attest the remote Bitcoin network.
 */
const safeStoreId = /^[A-Za-z0-9_-]{1,100}$/;

export function validateBTCPayReadinessConfig(config) {
  if (!config || config.testMode !== true ||
      !["regtest", "testnet"].includes(config.expectedNetwork)) {
    throw new Error("BTCPay preflight requires an explicit non-mainnet test mode.");
  }
  if (typeof config.storeId !== "string" || !safeStoreId.test(config.storeId) ||
      typeof config.apiKey !== "string" || config.apiKey.length < 12 ||
      /\s/.test(config.apiKey)) {
    throw new Error("BTCPay preflight store ID or read-only API key is missing.");
  }

  let base;
  try { base = new URL(config.serverUrl); }
  catch { throw new Error("BTCPay preflight requires a valid HTTPS server URL."); }

  if (base.protocol !== "https:" || !base.hostname ||
      base.username || base.password || base.search || base.hash ||
      base.pathname !== "/") {
    throw new Error("BTCPay preflight requires a credential-free HTTPS origin.");
  }
  return base;
}

export async function checkBTCPayTestStore(config, { fetchImpl = fetch } = {}) {
  const base = validateBTCPayReadinessConfig(config);
  const endpoint = new URL(
    "/api/v1/stores/" + encodeURIComponent(config.storeId), base,
  );
  const response = await fetchImpl(endpoint.href, {
    method: "GET",
    headers: {
      Authorization: "token " + config.apiKey,
      Accept: "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });

  if (!response || response.ok !== true) {
    const status = Number.isSafeInteger(response?.status) ? response.status : 0;
    // Never relay upstream response bodies, request headers, or secret material.
    throw new Error("BTCPay test-store read failed (HTTP " + status + ").");
  }

  let store;
  try { store = await response.json(); }
  catch { throw new Error("BTCPay test-store read returned invalid JSON."); }

  if (!store || store.id !== config.storeId) {
    throw new Error("BTCPay test-store identity did not match.");
  }

  // A Greenfield store lookup is NOT proof of Bitcoin Core's chain selection.
  // Operator must run bitcoin-cli.sh getblockchaininfo on the remote VPS.
  return Object.freeze({
    testStoreReadVerified: true,
    remoteBitcoinNetworkVerified: false,
    expectedNetwork: config.expectedNetwork,
    nextRequiredCheck: "Run bitcoin-cli.sh getblockchaininfo on the BTCPay VPS and verify chain.",
  });
}
