// Manual test: make one real x402-paid call to AuraGate and print the result.
// Usage (on the VPS, with AURA_AGENT_PRIVATE_KEY in env):
//   node scripts/test_x402.mjs
import "dotenv/config";
import { x402GetJson, agentAddress, x402Enabled } from "../indexer/x402Client.mjs";

const url = process.env.X402_TEST_URL || "https://auragate.app/api/premium/oracle-check?coins=bitcoin";

if (!x402Enabled()) {
  console.error("AURA_AGENT_PRIVATE_KEY is not set.");
  process.exit(1);
}

console.log("Agent address:", agentAddress());
console.log("Calling:", url);
try {
  const result = await x402GetJson(url);
  console.log("OK — data:", JSON.stringify(result.data).slice(0, 400));
  console.log("receiptId:", result.receiptId || "(none)");
  console.log("settlementTx:", result.settlementTx || "(none)");
  console.log("network:", result.network || "(none)");
} catch (error) {
  console.error("FAILED:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
