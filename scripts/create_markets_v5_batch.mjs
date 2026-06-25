import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ARC_CHAIN_ID = 5042002;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const CONTRACT_ABI = [
  "function CONTRACT_VERSION() view returns (string)",
  "function defaultSettlementToken() view returns (address)",
  "function marketCount() view returns (uint256)",
  "function assetConfigs(address) view returns (bool enabled,string symbol,uint8 decimals,uint256 minStake,uint256 creatorBond,uint256 resolverBond,uint256 disputeBond,uint256 reportBond,uint256 marketCreationFee,uint256 protocolFeeBps,uint256 creatorFeeBps)",
  "function createMultiOutcomeMarket((string question,string category,string sourceUrl,string resolutionRule,string metadataURI,address token,address adapter,uint256 closeTime,uint256 resolutionTime,uint8 mode,uint16 outcomeCount,bytes32 outcomeLabelsHash,bytes32 sourceHash,bytes32 ruleHash) input) returns (uint256)",
  "function submitMarketDraft((string question,string category,string sourceUrl,string resolutionRule,string metadataURI,address token,address adapter,uint256 closeTime,uint256 resolutionTime,uint8 mode,uint16 outcomeCount,bytes32 outcomeLabelsHash,bytes32 sourceHash,bytes32 ruleHash) input) returns (uint256)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
];

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith("--"));
const dryRun = process.env.DRY_RUN === "1" || args.includes("--dry-run");
const validateOnly = args.includes("--validate-only");
const forceYes = process.env.CONFIRM_CREATE_MARKETS === "1" || args.includes("--yes");
const submitDraft = process.env.SUBMIT_DRAFT === "1" || args.includes("--draft");
const startIndex = Math.max(0, Number(process.env.START_INDEX || 0));
const limit = Number.isFinite(Number(process.env.LIMIT)) && Number(process.env.LIMIT) > 0
  ? Number(process.env.LIMIT)
  : Infinity;

if (!inputPath) {
  throw new Error("Usage: node .local-aura-tools/create_markets_v5_batch.mjs scripts/create_markets_v5_150.json [--dry-run] [--yes] [--draft]");
}

const rpcUrl = process.env.AURA_MARKET_RPC_URL || process.env.ARC_RPC_URL || process.env.RPC_URL || "https://rpc.testnet.arc.network";
const contractAddress =
  process.env.AURA_INDEXER_CONTRACT_ADDRESS ||
  process.env.PREDICTION_MARKET_ADDRESS ||
  process.env.VITE_AURAPREDICT_V5_ADDRESS ||
  process.env.VITE_PREDICTION_MARKET_ADDRESS;
const privateKey = process.env.AURA_MARKET_CREATOR_PK || process.env.PRIVATE_KEY;

if (!validateOnly && (!contractAddress || !ethers.isAddress(contractAddress))) {
  throw new Error("Set AURA_INDEXER_CONTRACT_ADDRESS or PREDICTION_MARKET_ADDRESS to the AuraOn V5 contract address.");
}
if (!validateOnly && (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey))) {
  throw new Error("Set AURA_MARKET_CREATOR_PK to a 0x-prefixed private key.");
}

const json = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
if (!Array.isArray(json)) throw new Error("Market file must be a JSON array.");

const toUnix = (value, label) => {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${label} is not a valid UTC date: ${value}`);
  return Math.floor(ms / 1000);
};

const normalizeMarket = (market, index) => {
  const question = String(market.question || "").trim();
  const category = String(market.category || "").trim();
  const sourceUrl = String(market.sourceUrl || market.resolutionSource || "").trim();
  const fallbackSource = String(market.fallbackSource || "").trim();
  const resolutionRule = String(market.resolutionRule || "").trim();
  const closeTime = toUnix(market.closeTimeUtc, `market[${index}].closeTimeUtc`);
  const resolutionTime = toUnix(market.resolutionTimeUtc, `market[${index}].resolutionTimeUtc`);
  const outcomeLabels = Array.isArray(market.outcomeLabels) && market.outcomeLabels.length >= 2
    ? market.outcomeLabels.map((label) => String(label).trim()).filter(Boolean)
    : ["YES", "NO"];

  if (!question) throw new Error(`market[${index}] missing question`);
  if (!category) throw new Error(`market[${index}] missing category`);
  if (!/^https?:\/\//i.test(sourceUrl)) throw new Error(`market[${index}] source URL must be http(s): ${question}`);
  if (fallbackSource && !/^https?:\/\//i.test(fallbackSource)) throw new Error(`market[${index}] fallback URL must be http(s): ${question}`);
  if (!resolutionRule || resolutionRule.length < 80) throw new Error(`market[${index}] resolutionRule is too short: ${question}`);
  if (resolutionTime < closeTime) throw new Error(`market[${index}] resolutionTime is before closeTime: ${question}`);
  if (outcomeLabels.length < 2 || outcomeLabels.length > 20) throw new Error(`market[${index}] outcomeLabels must contain 2..20 labels.`);

  const token = market.settlementToken || process.env.SETTLEMENT_TOKEN || process.env.USDC_ADDRESS;
  const mode = Number(market.resolutionMode ?? market.mode ?? 2);
  const adapter = market.resolutionAdapter || market.adapter || ZERO_ADDRESS;
  const metadataURI = market.metadataURI || sourceUrl;
  const fullRule = fallbackSource && !resolutionRule.includes(fallbackSource)
    ? `${resolutionRule} Fallback source: ${fallbackSource}.`
    : resolutionRule;

  return {
    question,
    category,
    sourceUrl,
    resolutionRule: fullRule,
    metadataURI,
    token,
    adapter,
    closeTime,
    resolutionTime,
    mode,
    outcomeCount: outcomeLabels.length,
    outcomeLabelsHash: ethers.keccak256(ethers.toUtf8Bytes(outcomeLabels.join("|"))),
    sourceHash: ethers.keccak256(ethers.toUtf8Bytes(sourceUrl)),
    ruleHash: ethers.keccak256(ethers.toUtf8Bytes(fullRule)),
  };
};

const selected = json.slice(startIndex, startIndex + limit).map((market, offset) => normalizeMarket(market, startIndex + offset));
const duplicateQuestions = new Set();
for (const market of selected) {
  const key = market.question.toLowerCase();
  if (duplicateQuestions.has(key)) throw new Error(`Duplicate question: ${market.question}`);
  duplicateQuestions.add(key);
}

if (validateOnly) {
  const categories = selected.reduce((acc, market) => {
    acc[market.category] = (acc[market.category] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ ok: true, markets: selected.length, categories }, null, 2));
  process.exit(0);
}

const provider = new ethers.JsonRpcProvider(rpcUrl, ARC_CHAIN_ID);
const wallet = new ethers.Wallet(privateKey, provider);
const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, wallet);

console.log("AuraOn V5 batch market creator");
console.log(`Contract: ${contractAddress}`);
console.log(`Wallet: ${wallet.address}`);
console.log(`Markets: ${selected.length} / ${json.length}`);
console.log(`Mode: ${dryRun ? "dry-run" : submitDraft ? "submit-draft" : "create"}`);

const version = await contract.CONTRACT_VERSION();
if (!String(version).includes("V5")) {
  throw new Error(`Contract version is ${version}; expected AuraOn V5.`);
}
console.log(`Contract version: ${version}`);

let settlementToken = selected.find((market) => market.token)?.token;
if (!settlementToken) settlementToken = await contract.defaultSettlementToken();
if (!settlementToken || !ethers.isAddress(settlementToken)) {
  throw new Error("No valid settlement token. Set SETTLEMENT_TOKEN or configure defaultSettlementToken in V5.");
}

for (const market of selected) {
  if (!market.token) market.token = settlementToken;
  if (market.token.toLowerCase() !== settlementToken.toLowerCase()) {
    throw new Error("This batch script currently supports one settlement token per run.");
  }
}

const assetConfig = await contract.assetConfigs(settlementToken);
if (!assetConfig.enabled) throw new Error(`Settlement token is not enabled in V5: ${settlementToken}`);
const erc20 = new ethers.Contract(settlementToken, ERC20_ABI, wallet);
const symbol = await erc20.symbol().catch(() => "TOKEN");
const decimals = await erc20.decimals().catch(() => Number(assetConfig.decimals || 6));
const perMarketCost = BigInt(assetConfig.creatorBond || assetConfig[4] || 0n) + BigInt(assetConfig.marketCreationFee || assetConfig[8] || 0n);
const required = perMarketCost * BigInt(selected.length);
const balance = await erc20.balanceOf(wallet.address);
const allowance = await erc20.allowance(wallet.address, contractAddress);

console.log(`Settlement token: ${symbol} ${settlementToken}`);
console.log(`Required escrow/fee: ${ethers.formatUnits(required, decimals)} ${symbol}`);
console.log(`Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
console.log(`Allowance: ${ethers.formatUnits(allowance, decimals)} ${symbol}`);

if (balance < required) throw new Error(`Not enough ${symbol}. Need ${ethers.formatUnits(required, decimals)}.`);
if (!dryRun && allowance < required) {
  if (!forceYes) throw new Error("Approval required. Re-run with CONFIRM_CREATE_MARKETS=1 or --yes to approve/send.");
  const approveTx = await erc20.approve(contractAddress, required);
  console.log(`approve tx: ${approveTx.hash}`);
  await approveTx.wait();
}

if (dryRun) {
  selected.forEach((market, i) => {
    console.log(`[dry-run ${startIndex + i}] ${market.category} | ${market.question}`);
  });
  process.exit(0);
}

if (!forceYes) {
  throw new Error("Set CONFIRM_CREATE_MARKETS=1 or pass --yes before sending transactions.");
}

const outputDir = path.resolve(".local-aura-tools", "runs");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `create_markets_v5_${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);

for (let i = 0; i < selected.length; i += 1) {
  const market = selected[i];
  const method = submitDraft ? "submitMarketDraft" : "createMultiOutcomeMarket";
  console.log(`[${startIndex + i}] ${method}: ${market.question}`);
  const tx = await contract[method](market);
  const receipt = await tx.wait();
  const row = { index: startIndex + i, question: market.question, category: market.category, txHash: receipt.hash };
  fs.appendFileSync(outputPath, `${JSON.stringify(row)}\n`);
  console.log(`  tx: ${receipt.hash}`);
}

console.log(`Done. Output: ${outputPath}`);
