// Onchain CARE button logger for OnchainHistory
// Contract: 0xB331328F506f2D35125e367A190e914B1b6830cF (Base Mainnet)
// Function: logAction(bytes32 action, bytes data)
// Selector: 0x2d9bc1fb

const CONTRACT = "0xB331328F506f2D35125e367A190e914B1b6830cF";
const BASE_MAINNET = "0x2105";
const SELECTOR = "0x2d9bc1fb";

function toBytes32FromAscii(str) {
  const enc = new TextEncoder().encode(str);
  if (enc.length > 32) throw new Error("action too long for bytes32");
  const out = new Uint8Array(32);
  out.set(enc, 0); // left-aligned, right-padded with zeros
  return "0x" + Array.from(out).map(b => b.toString(16).padStart(2, "0")).join("");
}

function pad32(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return h.padStart(64, "0");
}

function encodeLogAction(actionStr, dataHex = "0x") {
  const a32 = toBytes32FromAscii(actionStr);
  const data = (dataHex && dataHex !== "0x") ? (dataHex.startsWith("0x") ? dataHex.slice(2) : dataHex) : "";
  // ABI for (bytes32, bytes):
  // selector
  // bytes32 action
  // offset to bytes data = 0x40
  // bytes length + bytes data (padded)
  const head_action = pad32(a32);
  const head_offset = pad32("0x40");
  const len = pad32("0x" + (data.length / 2).toString(16));
  const paddedData = data.padEnd(Math.ceil(data.length / 64) * 64, "0");
  return SELECTOR + head_action + head_offset + len + paddedData;
}

async function ensureBaseChain() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId === BASE_MAINNET) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_MAINNET }]
    });
  } catch (e) {
    // Let caller handle
    throw new Error("Please switch to Base Mainnet (0x2105) to log onchain actions.");
  }
}

export async function sendCareTx(actionStr) {
  if (!window.ethereum) throw new Error("No wallet provider found.");
  const [from] = await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureBaseChain();

  const data = encodeLogAction(actionStr, "0x");

  // Prefer ERC-5792 sendCalls if available; fallback to eth_sendTransaction
  try {
    const req = {
      version: "2.0.0",
      from,
      chainId: BASE_MAINNET,
      atomicRequired: true,
      calls: [{
        to: CONTRACT,
        value: "0x0",
        data
      }],
      capabilities: {}
    };
    return await window.ethereum.request({ method: "wallet_sendCalls", params: [req] });
  } catch (e) {
    // Fallback: normal tx
    return await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from,
        to: CONTRACT,
        value: "0x0",
        data
      }]
    });
  }
}
