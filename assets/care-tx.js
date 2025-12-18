import { sdk } from "https://esm.sh/@farcaster/miniapp-sdk";
import { Attribution } from "https://esm.sh/ox/erc8021";

/**
 * Contract you deployed (user-provided)
 */
const CARE_CONTRACT = "0xB331328F506f2D35125e367A190e914B1b6830cF";

/**
 * Base Mainnet chainId (hex)
 */
const BASE_MAINNET = "0x2105";

/**
 * Builder code + attribution suffix (kept consistent with existing app.js)
 * If you change BUILDER_CODE in app.js, also update it here.
 */
const BUILDER_CODE = "bc_f1gvbp72";
const dataSuffix = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

/**
 * We call: interact(uint8)
 * selector = keccak256("interact(uint8)")[:4] = 0xeb8a7454
 *
 * action mapping:
 *  0 = feed
 *  1 = pet
 *  2 = clean
 */
const INTERACT_SELECTOR = "0xeb8a7454";

function actionToUint8(action) {
  if (action === "feed") return 0;
  if (action === "pet") return 1;
  return 2;
}

async function getEth() {
  // Prefer Farcaster Mini App provider
  try {
    const eth = await sdk.wallet.getEthereumProvider();
    if (eth) return eth;
  } catch (_) {}
  // Fallback if available (still safe)
  return typeof window !== "undefined" ? window.ethereum : null;
}

async function ensureBaseMainnet(eth) {
  const chainId = await eth.request({ method: "eth_chainId", params: [] });
  if (chainId === BASE_MAINNET) return;

  // Try switching to Base mainnet
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_MAINNET }],
    });
  } catch (e) {
    // Let caller decide how to message; we throw a clean error
    const msg = (e && (e.message || e.toString())) || "Failed to switch chain";
    throw new Error(msg);
  }
}

function encodeInteractUint8(actionUint8) {
  // 4-byte selector + 32-byte padded uint8
  const arg = actionUint8.toString(16).padStart(64, "0");
  return INTERACT_SELECTOR + arg;
}

/**
 * Fire-and-forget onchain call triggered by CARE buttons.
 * This function is intentionally isolated so the rest of the game logic remains untouched.
 */
export async function sendCareTx(action) {
  const eth = await getEth();
  if (!eth) throw new Error("No Ethereum provider found");

  await ensureBaseMainnet(eth);

  const accounts = await eth.request({ method: "eth_requestAccounts", params: [] });
  const from = accounts && accounts[0];
  if (!from) throw new Error("No account connected");

  const actionUint8 = actionToUint8(action);
  const data = encodeInteractUint8(actionUint8);

  // Prefer ERC-5792 if supported
  const req = {
    version: "2.0.0",
    from,
    chainId: BASE_MAINNET,
    atomicRequired: true,
    calls: [
      {
        to: CARE_CONTRACT,
        value: "0x0",
        data,
      },
    ],
    capabilities: {
      dataSuffix,
    },
  };

  try {
    return await eth.request({ method: "wallet_sendCalls", params: [req] });
  } catch (e) {
    // If wallet_sendCalls isn't supported, fall back to eth_sendTransaction
    const msg = (e && (e.message || e.toString())) || "";
    const unsupported =
      msg.toLowerCase().includes("wallet_sendcalls") ||
      msg.toLowerCase().includes("method not found") ||
      msg.toLowerCase().includes("does not exist");

    if (!unsupported) throw e;

    return await eth.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: CARE_CONTRACT,
          value: "0x0",
          data,
        },
      ],
    });
  }
}
