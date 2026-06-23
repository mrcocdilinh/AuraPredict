// x402 client for paying AuraGate agent APIs on Arc.
// AuraGate returns 402 with a base64 "payment-required" challenge using Circle's
// "GatewayWalletBatched" scheme; we sign it with the agent wallet via Circle's
// @circle-fin/x402-batching client, then retry with the X-PAYMENT header.
import { privateKeyToAccount } from "viem/accounts";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";

const AGENT_PRIVATE_KEY = String(process.env.AURA_AGENT_PRIVATE_KEY || "").trim();

let cachedAccount = null;
function agentAccount() {
  if (!AGENT_PRIVATE_KEY) throw new Error("AURA_AGENT_PRIVATE_KEY is not configured.");
  if (!cachedAccount) {
    const key = AGENT_PRIVATE_KEY.startsWith("0x") ? AGENT_PRIVATE_KEY : `0x${AGENT_PRIVATE_KEY}`;
    cachedAccount = privateKeyToAccount(key);
  }
  return cachedAccount;
}

export function x402Enabled() {
  return Boolean(AGENT_PRIVATE_KEY);
}

export function agentAddress() {
  try {
    return agentAccount().address;
  } catch {
    return "";
  }
}

function decodeChallenge(res) {
  const raw = res.headers.get("payment-required") || res.headers.get("PAYMENT-REQUIRED");
  if (!raw) throw new Error("AuraGate did not return a payment-required challenge.");
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
}

// GET an x402-protected URL, paying with the agent wallet if challenged.
// Returns { data, receiptId, settlementTx, network } on success.
export async function x402GetJson(url, timeoutMs = 12_000) {
  const first = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (first.status !== 402) {
    if (!first.ok) throw new Error(`AuraGate request failed: ${first.status}`);
    return { data: await first.json(), receiptId: "", settlementTx: "", network: "" };
  }

  const challenge = decodeChallenge(first);
  const requirements = (challenge.accepts || [])[0];
  if (!requirements) throw new Error("AuraGate challenge had no payment options.");

  const scheme = new BatchEvmScheme(agentAccount());
  const { x402Version, payload } = await scheme.createPaymentPayload(challenge.x402Version || 2, requirements);
  const xPayment = Buffer.from(
    JSON.stringify({ x402Version, scheme: requirements.scheme, network: requirements.network, payload })
  ).toString("base64");

  const paid = await fetch(url, {
    headers: { "x-payment": xPayment, "x-payer": agentAccount().address },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!paid.ok) {
    const body = await paid.text().catch(() => "");
    throw new Error(`AuraGate paid request failed: ${paid.status} ${body.slice(0, 200)}`);
  }
  return {
    data: await paid.json(),
    receiptId: paid.headers.get("x-receipt-id") || "",
    settlementTx: paid.headers.get("x-settlement-tx") || "",
    network: paid.headers.get("x-payment-network") || ""
  };
}
