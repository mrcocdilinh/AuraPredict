// Manual test for the AuraGate x402 payment flow.
// Usage (on the VPS, with AURA_AGENT_PRIVATE_KEY in env):
//   node scripts/test_x402.mjs                 # show balances + pay
//   X402_DEPOSIT=0.5 node scripts/test_x402.mjs  # deposit 0.5 USDC into Gateway first, then pay
import "dotenv/config";
import { x402GetJson, x402Deposit, x402Balances, agentAddress, x402Enabled } from "../indexer/x402Client.mjs";

const url = process.env.X402_TEST_URL || "https://auragate.app/api/premium/oracle-check?coins=bitcoin";

if (!x402Enabled()) {
  console.error("AURA_AGENT_PRIVATE_KEY is not set.");
  process.exit(1);
}

console.log("Agent address:", agentAddress());

try {
  console.log("Gateway balances:", JSON.stringify(await x402Balances()));
} catch (error) {
  console.log("getBalances failed:", error instanceof Error ? error.message : String(error));
}

if (process.env.X402_DEPOSIT) {
  try {
    console.log(`Depositing ${process.env.X402_DEPOSIT} USDC into Gateway...`);
    const dep = await x402Deposit(process.env.X402_DEPOSIT);
    console.log("Deposit result:", JSON.stringify(dep, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  } catch (error) {
    console.error("Deposit FAILED:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

console.log("Calling:", url);
try {
  const result = await x402GetJson(url);
  console.log("OK — data:", JSON.stringify(result.data).slice(0, 400));
  console.log("receiptId:", result.receiptId || "(none)");
  console.log("settlementTx:", result.settlementTx || "(none)");
} catch (error) {
  console.error("PAY FAILED:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
