// x402 client for paying AuraGate agent APIs on Arc, via Circle's Gateway
// batching scheme. Gateway balance is auto-topped-up from the agent wallet
// before each pay() call — no manual pre-deposit needed.
import { GatewayClient } from "@circle-fin/x402-batching/client";

const AGENT_PRIVATE_KEY = String(process.env.AURA_AGENT_PRIVATE_KEY || "").trim();
const X402_CHAIN = String(process.env.AURA_X402_CHAIN || "arcTestnet").trim();

// Keep at least this much USDC in Gateway; top up to TARGET when below THRESHOLD.
const AUTO_DEPOSIT_THRESHOLD_USDC = 0.01;
const AUTO_DEPOSIT_TARGET_USDC = 0.1;

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

// Auto-deposit from agent wallet into Gateway if balance is below threshold.
async function ensureGatewayBalance() {
  const c = client();
  try {
    const balances = await c.getBalances();
    const gatewayAvailable = parseFloat(balances.gateway.formattedAvailable || "0");
    if (gatewayAvailable >= AUTO_DEPOSIT_THRESHOLD_USDC) return;
    const needed = AUTO_DEPOSIT_TARGET_USDC - gatewayAvailable;
    const walletBalance = parseFloat(balances.wallet.formatted || "0");
    if (walletBalance < needed) {
      console.warn(`[x402] Gateway low (${gatewayAvailable} USDC) but wallet only has ${walletBalance} USDC — skipping auto-deposit`);
      return;
    }
    const depositAmount = needed.toFixed(6);
    console.log(`[x402] Auto-deposit ${depositAmount} USDC into Gateway (gateway was ${gatewayAvailable} USDC)`);
    await c.deposit(depositAmount);
    console.log(`[x402] Auto-deposit complete`);
  } catch (err) {
    // Non-fatal: proceed to pay(); it will surface a meaningful error if balance is truly insufficient.
    console.warn(`[x402] Balance check failed: ${err?.message || err}`);
  }
}

// Pay an x402 AuraGate endpoint and return its JSON data plus settlement refs.
// Auto-tops-up Gateway balance from agent wallet if needed before paying.
export async function x402GetJson(url) {
  await ensureGatewayBalance();
  const response = await client().pay(url);
  return {
    data: response?.data ?? response,
    receiptId: response?.receiptId || "",
    settlementTx: response?.settlementTx || ""
  };
}

// Manual deposit: move USDC from the wallet into the Gateway balance.
export async function x402Deposit(amount) {
  return client().deposit(String(amount));
}

export async function x402Balances() {
  return client().getBalances();
}
