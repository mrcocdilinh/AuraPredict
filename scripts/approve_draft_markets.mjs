/**
 * Approve all draft markets on AuraOn V5.
 *
 * Usage:
 *   OWNER_PRIVATE_KEY=0x... node scripts/approve_draft_markets.mjs [--dry-run]
 *
 * Env vars (can also use .env):
 *   OWNER_PRIVATE_KEY          — 0x-prefixed owner private key (required)
 *   PREDICTION_MARKET_ADDRESS  — V5 contract address (falls back to VITE_* vars in .env)
 *   RPC_URL                    — Arc Testnet RPC (default: https://rpc.testnet.arc.network)
 */

import process from "node:process";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ARC_CHAIN_ID = 5042002;
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_ARC_RPC_URL ||
  "https://rpc.testnet.arc.network";

const CONTRACT_ADDRESS =
  process.env.PREDICTION_MARKET_ADDRESS ||
  process.env.AURA_INDEXER_CONTRACT_ADDRESS ||
  process.env.VITE_AURAPREDICT_V5_ADDRESS ||
  process.env.VITE_PREDICTION_MARKET_ADDRESS;

const PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const VALID_KEY = PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
const SCAN_ONLY = DRY_RUN && !VALID_KEY;

// V5 market state enum (must match contract)
const MARKET_STATE_DRAFT = 0;

const ABI = [
  "function CONTRACT_VERSION() view returns (string)",
  "function owner() view returns (address)",
  "function marketCount() view returns (uint256)",
  "function getMarket(uint256 marketId) view returns (string question, string category, uint8 state, uint256 closeTime, uint256 resolutionTime, bool authorityReviewRequired, address creator, address token, uint8 resolutionMode, string metadataURI, string resolutionRule)",
  "function approveMarket(uint256 marketId)",
];

// --- Validation ---

if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
  console.error("ERROR: Set PREDICTION_MARKET_ADDRESS to the V5 contract address.");
  process.exit(1);
}
if (!SCAN_ONLY && !VALID_KEY) {
  console.error("ERROR: Set OWNER_PRIVATE_KEY=0x<64 hex chars>. (For scan only, run with --dry-run and no key.)");
  process.exit(1);
}

// --- Setup ---

const provider = new ethers.JsonRpcProvider(RPC_URL, ARC_CHAIN_ID);
const signer = SCAN_ONLY ? provider : new ethers.Wallet(VALID_KEY ? PRIVATE_KEY : "", provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

console.log("=== AuraOn V5 — Bulk Draft Approver ===");
console.log(`RPC:      ${RPC_URL}`);
console.log(`Contract: ${CONTRACT_ADDRESS}`);
if (!SCAN_ONLY) console.log(`Wallet:   ${signer.address}`);
console.log(`Mode:     ${DRY_RUN ? "DRY RUN (no txs sent)" : "LIVE"}`);
console.log("");

// Verify version and ownership
const version = await contract.CONTRACT_VERSION().catch(() => "unknown");
if (!String(version).includes("V5")) {
  console.error(`ERROR: Contract version is "${version}", expected AuraOn V5.`);
  process.exit(1);
}

const owner = await contract.owner();
if (!SCAN_ONLY) {
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error(`ERROR: Connected wallet ${signer.address} is not the contract owner (${owner}).`);
    process.exit(1);
  }
  console.log(`Owner verified: ${owner}`);
} else {
  console.log(`Contract owner: ${owner} (scan-only mode, no key required)`);
}

// --- Scan for draft markets ---

const totalCount = Number(await contract.marketCount());
console.log(`Scanning ${totalCount} markets for draft state...\n`);

const draftMarketIds = [];

for (let id = 0; id < totalCount; id++) {
  try {
    const market = await contract.getMarket(id);
    const state = Number(market.state ?? market[2]);
    if (state === MARKET_STATE_DRAFT) {
      const question = market.question ?? market[0];
      draftMarketIds.push(id);
      console.log(`  [DRAFT] #${id} — ${question}`);
    }
  } catch (err) {
    console.warn(`  [WARN] Failed to read market #${id}: ${err.message}`);
  }
}

console.log(`\nFound ${draftMarketIds.length} draft market(s).`);

if (draftMarketIds.length === 0) {
  console.log("Nothing to approve.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log("\nDry-run complete. Re-run without --dry-run to approve.");
  process.exit(0);
}

// --- Approve ---

console.log("\nApproving...\n");
let approved = 0;
let failed = 0;

for (const id of draftMarketIds) {
  try {
    console.log(`  Approving #${id}...`);
    const tx = await contract.approveMarket(id);
    const receipt = await tx.wait();
    console.log(`  ✓ #${id} approved — tx: ${receipt.hash}`);
    approved++;
  } catch (err) {
    console.error(`  ✗ #${id} failed: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone. Approved: ${approved}  Failed: ${failed}`);
