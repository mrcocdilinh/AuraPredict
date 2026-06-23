// x402 client for paying AuraGate agent APIs on Arc, via Circle's Gateway
// batching scheme. The agent's USDC must first be deposited into the Gateway
// balance (one-time), then pay() settles per-call against that balance.
import { GatewayClient } from "@circle-fin/x402-batching/client";

const AGENT_PRIVATE_KEY = String(process.env.AURA_AGENT_PRIVATE_KEY || "").trim();
const X402_CHAIN = String(process.env.AURA_X402_CHAIN || "arcTestnet").trim();

let gateway = null;
function client() {
  if (!AGENT_PRIVATE_KEY) throw new Error("AURA_AGENT_PRIVATE_KEY is not configured.");
  if (!gateway) {
    const key = AGENT_PRIVATE_KEY.startsWith("0x") ? AGENT_PRIVATE_KEY : `0x${AGENT_PRIVATE_KEY}`;
    gateway = new GatewayClient({ chain: X402_CHAIN, privateKey: key });
  }
  return gateway;
}

export function x402Enabled() {
  return Boolean(AGENT_PRIVATE_KEY);
}

export function agentAddress() {
  try {
    return client().account.address;
  } catch {
    return "";
  }
}

// Pay an x402 AuraGate endpoint and return its JSON data plus settlement refs.
export async function x402GetJson(url) {
  const response = await client().pay(url);
  return {
    data: response?.data ?? response,
    receiptId: response?.receiptId || "",
    settlementTx: response?.settlementTx || ""
  };
}

// One-time: move USDC from the wallet into the Gateway balance pay() draws from.
export async function x402Deposit(amount) {
  return client().deposit(String(amount));
}

export async function x402Balances() {
  return client().getBalances();
}
