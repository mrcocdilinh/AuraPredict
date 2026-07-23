import "dotenv/config";
import { ethers } from "ethers";

if (process.argv.includes("--help")) {
  console.log(`Prepare a safe ownership/authority migration (dry-run by default).

Required environment:
  AURA_MIGRATION_TARGET=<Circle wallet or multisig address>
  AURA_MIGRATE_AUTHORITY=1 and/or AURA_MIGRATE_OWNER=1
  AURA_INDEXER_CONTRACT_ADDRESS=<deployed contract>

Execution:
  npm run migrate:authority
  npm run migrate:authority -- --execute

OWNER_PRIVATE_KEY is required only with --execute. The hardened contract uses
two-step ownership, so the target must call acceptOwnership() separately.`);
  process.exit(0);
}

const rpcUrl = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const contractAddress = String(
  process.env.AURA_INDEXER_CONTRACT_ADDRESS ||
    process.env.PREDICTION_MARKET_ADDRESS ||
    process.env.VITE_PREDICTION_MARKET_ADDRESS ||
    ""
).trim();
const target = String(process.env.AURA_MIGRATION_TARGET || "").trim();
const execute = process.argv.includes("--execute");
const migrateAuthority = String(process.env.AURA_MIGRATE_AUTHORITY || "") === "1";
const migrateOwner = String(process.env.AURA_MIGRATE_OWNER || "") === "1";
const privateKey = String(process.env.OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY || "").trim();

if (!ethers.isAddress(contractAddress)) throw new Error("Set a valid prediction-market contract address.");
if (!ethers.isAddress(target) || target === ethers.ZeroAddress) throw new Error("Set a valid AURA_MIGRATION_TARGET.");
if (!migrateAuthority && !migrateOwner) {
  throw new Error("Set AURA_MIGRATE_AUTHORITY=1 and/or AURA_MIGRATE_OWNER=1.");
}
if (execute && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("--execute requires OWNER_PRIVATE_KEY.");
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const signer = execute ? new ethers.Wallet(privateKey, provider) : provider;
const contract = new ethers.Contract(
  contractAddress,
  [
    "function owner() view returns (address)",
    "function resolutionAuthority() view returns (address)",
    "function pendingOwner() view returns (address)",
    "function setResolutionAuthority(address)",
    "function transferOwnership(address)"
  ],
  signer
);
const owner = await contract.owner();
const authority = await contract.resolutionAuthority();
let supportsTwoStepOwnership = true;
let pendingOwner = ethers.ZeroAddress;
try {
  pendingOwner = await contract.pendingOwner();
} catch {
  supportsTwoStepOwnership = false;
}

console.log(JSON.stringify({
  execute,
  contract: contractAddress,
  owner,
  authority,
  target,
  pendingOwner,
  supportsTwoStepOwnership,
  migrateAuthority,
  migrateOwner
}, null, 2));

if (!execute) {
  console.log("Dry run only. Re-run with --execute after verifying the target is a Circle wallet or multisig you control.");
  process.exit(0);
}
if (signer.address.toLowerCase() !== owner.toLowerCase()) {
  throw new Error(`Signer ${signer.address} is not contract owner ${owner}.`);
}
if (migrateOwner && !supportsTwoStepOwnership) {
  throw new Error("This deployment has immediate one-step ownership transfer. Refusing unsafe migration; deploy the hardened contract first.");
}
if (migrateAuthority && authority.toLowerCase() !== target.toLowerCase()) {
  const receipt = await (await contract.setResolutionAuthority(target)).wait();
  console.log(`Resolution authority updated: ${receipt.hash}`);
}
if (migrateOwner && owner.toLowerCase() !== target.toLowerCase()) {
  const receipt = await (await contract.transferOwnership(target)).wait();
  console.log(`Ownership transfer proposed: ${receipt.hash}`);
  console.log("The target wallet must call acceptOwnership() in a separate transaction.");
}
