import "dotenv/config";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, encodeAbiParameters, fallback, formatUnits, http, isAddress, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcPredictionMarketV2Abi, arcPredictionMarketV3Abi, arcPredictionMarketV4Abi } from "./arcPredictionMarketAbi.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "aurapredict-index.json");

const ACTIVE_V3_CONTRACT_ADDRESS = "0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd";
const ACTIVE_V3_DEPLOYMENT_BLOCK = 44074836n;
const ACTIVE_V4_CONTRACT_ADDRESS = "0x3c853AE2eC705B453c9657569b6335e762631536";
const ACTIVE_V4_DEPLOYMENT_BLOCK = 44083985n;
const CONTRACT_ADDRESS = ACTIVE_V4_CONTRACT_ADDRESS;
const RPC_URLS = (
  process.env.AURA_INDEXER_RPC_URLS ||
  process.env.ARC_RPC_URL ||
  "https://rpc.testnet.arc.network,https://rpc.drpc.testnet.arc.network,https://rpc.quicknode.testnet.arc.network"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const PORT = Number(process.env.PORT || process.env.AURA_INDEXER_PORT || 8787);
const HOST = process.env.AURA_INDEXER_HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const POLL_MS = Number(process.env.AURA_INDEXER_POLL_MS || 12_000);
const START_BLOCK = ACTIVE_V4_DEPLOYMENT_BLOCK;
const CHUNK_SIZE = BigInt(process.env.AURA_INDEXER_CHUNK_SIZE || 9_000);
const AI_PROVIDER = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
const AI_FALLBACK_PROVIDER = String(process.env.AI_FALLBACK_PROVIDER || "").trim().toLowerCase();
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_API_KEYS = String(process.env.GEMINI_API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const AI_MODEL = String(process.env.AI_MODEL || "gemini-2.5-flash").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const RESOLUTION_ADMIN_TOKEN = String(process.env.AURA_RESOLUTION_ADMIN_TOKEN || "").trim();
const RESOLUTION_AUTO_RUN = String(process.env.AURA_RESOLUTION_AUTO_RUN || "").trim() === "1";
const RESOLUTION_AUTO_PROPOSE = String(process.env.AURA_RESOLUTION_AUTO_PROPOSE || "").trim() === "1";
const RESOLVER_PRIVATE_KEY = String(process.env.AURA_RESOLVER_PRIVATE_KEY || "").trim();
const RESOLVER_SIGNER_MODE = String(process.env.AURA_RESOLVER_SIGNER_MODE || "private-key").trim().toLowerCase();
const CIRCLE_AGENT_WALLET_ADDRESS = String(process.env.AURA_CIRCLE_AGENT_WALLET_ADDRESS || "").trim();
const CIRCLE_CLI_PATH = String(process.env.AURA_CIRCLE_CLI_PATH || "circle").trim();
const CIRCLE_AGENT_CHAIN = String(process.env.AURA_CIRCLE_AGENT_CHAIN || "ARC-TESTNET").trim();
const CIRCLE_EXECUTE_TIMEOUT_MS = Math.max(1_000, Number(process.env.AURA_CIRCLE_EXECUTE_TIMEOUT_MS || 60_000) || 60_000);
const CIRCLE_WALLET_ADDRESS_FLAG = String(process.env.AURA_CIRCLE_WALLET_ADDRESS_FLAG || "--address").trim();
const AI_ATTESTATION_PRIVATE_KEY = String(process.env.AURA_ATTESTATION_PRIVATE_KEY || "").trim();
const RESOLUTION_MIN_CONFIDENCE = Number(process.env.AURA_RESOLUTION_MIN_CONFIDENCE || 72);
const RESOLUTION_CONSENSUS_COUNT = Number(process.env.AURA_RESOLUTION_CONSENSUS_COUNT || 2);
const ORACLE_AUTO_RUN = String(process.env.AURA_ORACLE_AUTO_RUN || "1").trim() !== "0";
const ORACLE_HTTP_TIMEOUT_MS = Number(process.env.AURA_ORACLE_HTTP_TIMEOUT_MS || 8_000);
const AUTO_EVIDENCE_ENABLED = String(process.env.AURA_AUTO_EVIDENCE_ENABLED || "1").trim() !== "0";
const AUTO_EVIDENCE_TIMEOUT_MS = Number(process.env.AURA_AUTO_EVIDENCE_TIMEOUT_MS || 6_000);
const AUTO_EVIDENCE_MAX_SOURCES = Number(process.env.AURA_AUTO_EVIDENCE_MAX_SOURCES || 3);
const AUTO_EVIDENCE_MAX_ITEMS = Number(process.env.AURA_AUTO_EVIDENCE_MAX_ITEMS || 80);
const ORACLE_AUTO_PROPOSE = String(process.env.AURA_ORACLE_AUTO_PROPOSE || "").trim() === "1";
const ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE = Number(process.env.AURA_ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE || 78);
const ORACLE_AUTO_PROPOSE_ADAPTERS = new Set(
  String(
    process.env.AURA_ORACLE_AUTO_PROPOSE_ADAPTERS ||
      "crypto-price,macro-yahoo-chart,status-health,status-page,liquidity-rule"
  )
    .split(",")
    .map((adapter) => adapter.trim())
    .filter(Boolean)
);
const USDC_DECIMALS = 18;
const V3_SETTLEMENT_DECIMALS = 6;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const AURA_RULE_JSON_PREFIX = "AURA_RULE_JSON:";
const CIRCLE_SIGNER_MODES = new Set(["circle", "circle-cli", "agent-wallet", "circle-agent-wallet"]);
const PRIVATE_KEY_SIGNER_MODES = new Set(["", "private-key", "wallet-private-key"]);
const ARC_CHAIN = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: RPC_URLS }
  }
};
const V2_EVENT_NAMES = [
  "MarketCreated",
  "BetPlaced",
  "MarketResultProposed",
  "MarketResultProposer",
  "MarketDisputed",
  "MarketResolved",
  "DisputeFinalized",
  "DisputeCanceledByTimeout",
  "MarketCreationFeeCollected",
  "Claimed"
];
const V3_EVENT_NAMES = [
  "MarketCreated",
  "BetPlaced",
  "MarketResultProposed",
  "AuthorityReviewRequested",
  "MarketDisputed",
  "MarketResolved",
  "DisputeFinalized",
  "DisputeCanceledByTimeout",
  "EmptyMarketCanceled",
  "MarketCreationFeeCollected",
  "Claimed"
];
const V4_EVENT_NAMES = [...V3_EVENT_NAMES, "UnproposedMarketCanceled"];
const legacyGetMarketAbi = [
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: [
      { type: "string", name: "question" },
      { type: "string", name: "category" },
      { type: "uint256", name: "closeTime" },
      { type: "address", name: "creator" },
      { type: "address", name: "resolver" },
      { type: "uint256", name: "yesPool" },
      { type: "uint256", name: "noPool" },
      { type: "uint256", name: "traderCount" },
      { type: "uint8", name: "outcome" }
    ]
  }
];

const Outcome = {
  Unresolved: 0,
  Yes: 1,
  No: 2,
  Canceled: 3
};

const client = createPublicClient({
  chain: ARC_CHAIN,
  transport: fallback(RPC_URLS.map((url) => http(url, { retryCount: 1, retryDelay: 250, timeout: 10_000 })), {
    rank: false,
    retryCount: 2,
    retryDelay: 500
  })
});
const circleAgentWalletAddress = isAddress(CIRCLE_AGENT_WALLET_ADDRESS) ? CIRCLE_AGENT_WALLET_ADDRESS : "";
const resolverAccount = RESOLVER_PRIVATE_KEY ? privateKeyToAccount(RESOLVER_PRIVATE_KEY) : null;
const resolverSignerAddress = resolverUsesCircleWallet() ? circleAgentWalletAddress : resolverAccount?.address || "";
const attestationAccount = AI_ATTESTATION_PRIVATE_KEY ? privateKeyToAccount(AI_ATTESTATION_PRIVATE_KEY) : null;
const walletClient = resolverAccount && !resolverUsesCircleWallet()
  ? createWalletClient({
      account: resolverAccount,
      chain: ARC_CHAIN,
      transport: http(RPC_URLS[0], { retryCount: 1, retryDelay: 250, timeout: 15_000 })
    })
  : null;
const GEMINI_RATE_LIMIT_COOLDOWN_MS = Number(process.env.GEMINI_RATE_LIMIT_COOLDOWN_MS || 120_000);
const geminiKeyState = {
  cursor: 0,
  cooldownUntilByKey: new Map()
};

function nowIso() {
  return new Date().toISOString();
}

function toBigint(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.max(0, Math.floor(value)));
  if (typeof value === "string" && value.trim()) return BigInt(value);
  return 0n;
}

function toAmount(value) {
  return toBigint(value).toString();
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

function compareBigint(a, b) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function percent(value, total) {
  if (total === 0n) return 50;
  return Number((value * 10000n) / total) / 100;
}

function auraPointsFor(volume, wonMarkets, resolvedMarkets, createdMarkets, pnl, decimals = USDC_DECIMALS) {
  const participationScore = 25;
  const volumeScore = Number(formatUnits(volume, decimals)) * 10;
  const pnlScore = Math.max(0, Number(formatUnits(pnl, decimals)) * 12);
  const winRate = resolvedMarkets > 0 ? (wonMarkets / resolvedMarkets) * 100 : 0;

  return Math.max(
    0,
    Math.round(
      participationScore +
        volumeScore +
        pnlScore +
        wonMarkets * 90 +
        resolvedMarkets * 18 +
        createdMarkets * 35 +
        winRate * 4
    )
  );
}

function emptyState() {
  return {
    version: 1,
    contractAddress: CONTRACT_ADDRESS,
    chainId: 5042002,
    deploymentBlock: START_BLOCK > 0n ? START_BLOCK.toString() : "0",
    lastIndexedBlock: START_BLOCK > 0n ? (START_BLOCK - 1n).toString() : "0",
    updatedAt: null,
    owner: ZERO_ADDRESS,
    contractVersion: "unknown",
    resolutionAuthority: ZERO_ADDRESS,
    minStake: "0",
    creatorBond: "0",
    disputeBond: "0",
    disputeWindow: 0,
    disputeGracePeriod: 0,
    proposalGracePeriod: 0,
    aiAttestationSigner: ZERO_ADDRESS,
    protocolFeeBps: 0,
    marketCreationFee: "0",
    accumulatedProtocolFees: "0",
    marketCount: 0,
    markets: {},
    trades: [],
    claims: [],
    snapshots: [],
    social: {
      profiles: {},
      follows: {},
      comments: {},
      evidence: {}
    },
    resolutions: {},
    oracleProposals: {},
    stats: {
      totalMarkets: 0,
      indexedMarkets: 0,
      liveMarkets: 0,
      endedMarkets: 0,
      pendingMarkets: 0,
      totalVolume: "0",
      liveLiquidity: "0",
      averageMarketVolume: "0",
      participantEntries: 0,
      knownPlayers: 0,
      settlementSymbols: ["USDC"],
      hasMixedSettlementAssets: false,
      assetBreakdown: [
        {
          symbol: "USDC",
          decimals: 6,
          marketCount: 0,
          liveMarkets: 0,
          endedMarkets: 0,
          pendingMarkets: 0,
          participantEntries: 0,
          totalVolume: "0",
          liveLiquidity: "0",
          averageMarketVolume: "0"
        }
      ]
    }
  };
}

let state = emptyState();
let syncPromise = null;
const blockTimestampCache = new Map();

async function loadState() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const saved = JSON.parse(raw);
    if (saved.contractAddress?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
      state = { ...emptyState(), ...saved };
    }
  } catch {
    state = emptyState();
  }
}

async function saveState() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function getBlockTimestamp(blockNumber) {
  if (!blockNumber) return 0;
  const key = blockNumber.toString();
  if (!blockTimestampCache.has(key)) {
    const block = await client.getBlock({ blockNumber });
    blockTimestampCache.set(key, Number(block.timestamp));
  }
  return blockTimestampCache.get(key) ?? 0;
}

function ensureMarket(marketId) {
  const id = String(marketId);
  if (!state.markets[id]) {
    state.markets[id] = {
      id: Number(marketId),
      question: `Market #${marketId}`,
      category: "Other",
      createdAt: 0,
      closeTime: 0,
      resolutionTime: 0,
      settlementToken: ZERO_ADDRESS,
      settlementSymbol: "USDC",
      settlementDecimals: USDC_DECIMALS,
      creator: ZERO_ADDRESS,
      resolver: ZERO_ADDRESS,
      authority: ZERO_ADDRESS,
      resolutionMode: 0,
      metadataHash: ZERO_HASH,
      metadataURI: "",
      fallbackSourceURI: "",
      resolutionRule: "",
      resolutionAdapter: ZERO_ADDRESS,
      termsProtocolFeeBps: 0,
      termsCreatorBond: "0",
      termsDisputeBond: "0",
      termsDisputeWindow: 0,
      termsDisputeGracePeriod: 0,
      termsProposalGracePeriod: 0,
      yesPool: "0",
      noPool: "0",
      traderCount: 0,
      proposedOutcome: Outcome.Unresolved,
      proposedAt: 0,
      disputeDeadline: 0,
      proposedBy: ZERO_ADDRESS,
      proposalEvidenceHash: ZERO_HASH,
      aiReceiptHash: ZERO_HASH,
      authorityReviewRequired: false,
      disputed: false,
      disputer: ZERO_ADDRESS,
      outcome: Outcome.Unresolved,
      resolvedAt: 0,
      createdTxHash: "",
      updatedTxHash: ""
    };
  }
  return state.markets[id];
}

function addSnapshot(market, timestamp, txHash, logIndex) {
  const yesPool = toBigint(market.yesPool);
  const noPool = toBigint(market.noPool);
  const total = yesPool + noPool;
  const id = `${market.id}-${timestamp}-${logIndex}`;
  if (state.snapshots.some((snapshot) => snapshot.id === id)) return;
  state.snapshots.push({
    id,
    marketId: market.id,
    timestamp,
    yesPercent: percent(yesPool, total),
    noPercent: 100 - percent(yesPool, total),
    yesPool: market.yesPool,
    noPool: market.noPool,
    txHash
  });
}

async function processEvent(eventName, log) {
  const timestamp = await getBlockTimestamp(log.blockNumber);
  const args = log.args ?? {};
  const txHash = log.transactionHash ?? "";
  const logIndex = Number(log.logIndex ?? 0);

  if (eventName === "MarketCreated") {
    const marketId = Number(args.marketId ?? 0n);
    const market = ensureMarket(marketId);
    market.question = String(args.question ?? market.question);
    market.category = String(args.category ?? market.category ?? "Other");
    market.closeTime = toNumber(args.closeTime);
    if (isStablecoinContract()) {
      market.resolutionTime = toNumber(args.resolutionTime);
      market.settlementToken = args.settlementToken ?? market.settlementToken;
      market.authority = args.authority ?? market.authority;
      market.resolutionMode = Number(args.resolutionMode ?? 0);
      market.metadataHash = args.metadataHash ?? ZERO_HASH;
      market.metadataURI = String(args.metadataURI ?? "");
      if (isV4Contract()) {
        market.resolutionAdapter = args.resolutionAdapter ?? ZERO_ADDRESS;
        market.fallbackSourceURI = String(args.fallbackSourceURI ?? "");
        market.resolutionRule = String(args.resolutionRule ?? "");
      }
    } else {
      market.resolutionTime = market.closeTime;
    }
    market.creator = args.creator ?? market.creator;
    market.resolver = args.resolver ?? market.resolver;
    market.createdAt = timestamp || market.createdAt;
    market.createdTxHash = txHash;
    market.updatedTxHash = txHash;
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "BetPlaced") {
    const marketId = Number(args.marketId ?? 0n);
    const market = ensureMarket(marketId);
    market.yesPool = toAmount(args.yesPool);
    market.noPool = toAmount(args.noPool);
    market.updatedTxHash = txHash;

    const id = `${txHash}-${logIndex}`;
    if (!state.trades.some((trade) => trade.id === id)) {
      state.trades.push({
        id,
        marketId,
        user: args.user ?? ZERO_ADDRESS,
        side: Number(args.side ?? 0),
        amount: toAmount(args.amount),
        yesPool: market.yesPool,
        noPool: market.noPool,
        timestamp,
        txHash,
        logIndex
      });
    }
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "MarketResultProposed") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.proposedOutcome = Number(args.outcome ?? Outcome.Unresolved);
    market.proposedAt = timestamp;
    market.disputeDeadline = toNumber(args.disputeDeadline);
    if (isStablecoinContract()) {
      market.proposedBy = args.proposer ?? ZERO_ADDRESS;
      market.proposalEvidenceHash = args.evidenceHash ?? ZERO_HASH;
      market.aiReceiptHash = args.aiReceiptHash ?? ZERO_HASH;
      market.authorityReviewRequired = Boolean(args.authorityReviewRequired);
    }
    market.updatedTxHash = txHash;
    return;
  }

  if (eventName === "MarketResultProposer") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.proposedBy = args.proposer ?? ZERO_ADDRESS;
    market.updatedTxHash = txHash;
    return;
  }

  if (eventName === "MarketDisputed") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.disputed = true;
    market.disputer = args.disputer ?? ZERO_ADDRESS;
    market.updatedTxHash = txHash;
    return;
  }

  if (eventName === "AuthorityReviewRequested") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.authorityReviewRequired = true;
    market.updatedTxHash = txHash;
    return;
  }

  if (eventName === "MarketResolved") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.outcome = Number(args.outcome ?? Outcome.Unresolved);
    market.resolvedAt = timestamp;
    market.updatedTxHash = txHash;
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "DisputeFinalized") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.outcome = Number(args.finalOutcome ?? Outcome.Unresolved);
    market.resolvedAt = timestamp;
    market.updatedTxHash = txHash;
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "DisputeCanceledByTimeout") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.outcome = Outcome.Canceled;
    market.resolvedAt = timestamp;
    market.updatedTxHash = txHash;
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "EmptyMarketCanceled") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.outcome = Outcome.Canceled;
    market.resolvedAt = timestamp;
    market.updatedTxHash = txHash;
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "UnproposedMarketCanceled") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.outcome = Outcome.Canceled;
    market.resolvedAt = timestamp;
    market.updatedTxHash = txHash;
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "MarketCreationFeeCollected") {
    state.accumulatedProtocolFees = toAmount(toBigint(state.accumulatedProtocolFees) + toBigint(args.fee));
    return;
  }

  if (eventName === "Claimed") {
    const id = `${txHash}-${logIndex}`;
    if (!state.claims.some((claim) => claim.id === id)) {
      state.claims.push({
        id,
        marketId: Number(args.marketId ?? 0n),
        user: args.user ?? ZERO_ADDRESS,
        payout: toAmount(args.payout),
        timestamp,
        txHash,
        logIndex
      });
    }
  }
}

function isV3Contract() {
  return state.contractVersion === "AURAPREDICT_V3";
}

function isV4Contract() {
  return state.contractVersion === "AURAPREDICT_V4";
}

function isStablecoinContract() {
  return isV3Contract() || isV4Contract();
}

function currentContractAbi() {
  if (isV4Contract()) return arcPredictionMarketV4Abi;
  return isV3Contract() ? arcPredictionMarketV3Abi : arcPredictionMarketV2Abi;
}

function resolverUsesCircleWallet() {
  return CIRCLE_SIGNER_MODES.has(RESOLVER_SIGNER_MODE);
}

function resolverSignerModeIsValid() {
  return resolverUsesCircleWallet() || PRIVATE_KEY_SIGNER_MODES.has(RESOLVER_SIGNER_MODE);
}

function resolverMissingReason() {
  if (!resolverSignerModeIsValid()) return "AURA_RESOLVER_SIGNER_MODE must be private-key or circle-cli.";
  if (resolverUsesCircleWallet()) {
    if (!CIRCLE_AGENT_WALLET_ADDRESS) return "AURA_CIRCLE_AGENT_WALLET_ADDRESS is not configured.";
    if (!circleAgentWalletAddress) return "AURA_CIRCLE_AGENT_WALLET_ADDRESS is not a valid EVM address.";
    if (!CIRCLE_CLI_PATH) return "AURA_CIRCLE_CLI_PATH is not configured.";
    if (!CIRCLE_WALLET_ADDRESS_FLAG) return "AURA_CIRCLE_WALLET_ADDRESS_FLAG is not configured.";
    return "Circle Agent Wallet signer is not configured.";
  }
  return "AURA_RESOLVER_PRIVATE_KEY is not configured.";
}

function hasResolverSigner() {
  if (!resolverSignerModeIsValid()) return false;
  if (resolverUsesCircleWallet()) return Boolean(circleAgentWalletAddress && CIRCLE_CLI_PATH && CIRCLE_WALLET_ADDRESS_FLAG);
  return Boolean(walletClient && resolverAccount);
}

function circleCliArg(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return String(value);
  return String(value);
}

function circleFunctionSignature(functionName) {
  if (functionName === "cancelEmptyMarket") return "cancelEmptyMarket(uint256)";
  if (functionName === "resolveWithAiAttestation") return "resolveWithAiAttestation(uint256,uint8,bytes32,bytes32,uint8,bytes)";
  if (functionName === "cancel") return isStablecoinContract() ? "cancel(uint256,bytes32,bytes32)" : "cancel(uint256)";
  if (functionName === "resolve") return isStablecoinContract() ? "resolve(uint256,uint8,bytes32,bytes32)" : "resolve(uint256,uint8)";
  return "";
}

function compactCliOutput(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 800);
}

function extractCircleTxHash(stdout, stderr) {
  const raw = `${stdout || ""}\n${stderr || ""}`;
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      const txHash = parsed?.data?.txHash || parsed?.txHash || parsed?.transactionHash;
      if (typeof txHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(txHash)) return txHash;
    }
  } catch {
    // Fall back to regex parsing below because some CLI versions include extra text around JSON.
  }
  const matches = raw.match(/0x[a-fA-F0-9]{64}/g) || [];
  return matches.length > 0 ? matches[matches.length - 1] : "";
}

async function runCircleWalletExecute(functionName, args) {
  const signature = circleFunctionSignature(functionName);
  if (!signature) throw new Error(`Circle Agent Wallet cannot execute unsupported function ${functionName}.`);
  if (!hasResolverSigner()) throw new Error(resolverMissingReason());

  const cliArgs = [
    "wallet",
    "execute",
    signature,
    ...args.map(circleCliArg),
    "--contract",
    CONTRACT_ADDRESS,
    CIRCLE_WALLET_ADDRESS_FLAG,
    circleAgentWalletAddress,
    "--chain",
    CIRCLE_AGENT_CHAIN,
    "--output",
    "json"
  ];

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout;
    const child = spawn(CIRCLE_CLI_PATH, cliArgs, {
      env: process.env,
      windowsHide: true
    });

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };

    timeout = setTimeout(() => {
      child.kill();
      finish(new Error(`Circle CLI timed out after ${CIRCLE_EXECUTE_TIMEOUT_MS}ms.`));
    }, CIRCLE_EXECUTE_TIMEOUT_MS);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish(new Error(`Circle CLI failed to start: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(`Circle CLI exited with code ${code}: ${compactCliOutput(stderr || stdout)}`));
        return;
      }
      const txHash = extractCircleTxHash(stdout, stderr);
      if (!txHash) {
        finish(new Error(`Circle CLI did not return a transaction hash: ${compactCliOutput(stdout || stderr)}`));
        return;
      }
      finish(null, txHash);
    });
  });
}

async function writeResolverContract(functionName, args) {
  if (resolverUsesCircleWallet()) return runCircleWalletExecute(functionName, args);
  if (!walletClient) throw new Error(resolverMissingReason());
  return walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: currentContractAbi(),
    functionName,
    args
  });
}

async function detectContractVersion() {
  try {
    const contractVersion = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: arcPredictionMarketV2Abi,
      functionName: "CONTRACT_VERSION"
    });
    state.contractVersion = String(contractVersion || "unknown");
  } catch {
    state.contractVersion = "legacy";
  }
}

async function readContract(functionName, args = []) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    abi: currentContractAbi(),
    functionName,
    args
  });
}

async function readMarketData(id) {
  if (isStablecoinContract()) {
    const data = await readContract("getMarket", [BigInt(id)]);
    const terms = isV4Contract() ? await readContract("getMarketTerms", [BigInt(id)]) : null;
    const policy = isV4Contract() ? await readContract("getMarketPolicy", [BigInt(id)]) : null;
    return {
      question: data[0],
      category: data[1],
      settlementToken: data[2],
      closeTime: Number(data[3]),
      resolutionTime: Number(data[4]),
      creator: data[5],
      resolver: data[6],
      authority: data[7],
      resolutionMode: Number(data[8]),
      metadataHash: data[9],
      metadataURI: data[10],
      fallbackSourceURI: terms?.[2] ?? "",
      resolutionRule: terms?.[3] ?? "",
      resolutionAdapter: policy?.[0] ?? ZERO_ADDRESS,
      termsProtocolFeeBps: Number(data[11]),
      termsCreatorBond: toAmount(data[12]),
      termsDisputeBond: toAmount(data[13]),
      termsDisputeWindow: Number(data[14]),
      yesPool: toAmount(data[15]),
      noPool: toAmount(data[16]),
      traderCount: Number(data[17]),
      proposedOutcome: Number(data[18]),
      proposedAt: Number(data[19]),
      disputeDeadline: Number(data[20]),
      authorityReviewRequired: Boolean(data[21]),
      disputed: Boolean(data[22]),
      disputer: data[23],
      outcome: Number(data[24]),
      termsDisputeGracePeriod: Number(data[25]),
      termsProposalGracePeriod: policy ? Number(policy[2]) : 0
    };
  }

  try {
    const data = await readContract("getMarket", [BigInt(id)]);
    return {
      question: data[0],
      category: data[1],
      closeTime: Number(data[2]),
      resolutionTime: Number(data[2]),
      creator: data[3],
      resolver: data[4],
      yesPool: toAmount(data[5]),
      noPool: toAmount(data[6]),
      traderCount: Number(data[7]),
      proposedOutcome: Number(data[8]),
      proposedAt: Number(data[9]),
      disputeDeadline: Number(data[10]),
      disputed: Boolean(data[11]),
      disputer: data[12],
      outcome: Number(data[13])
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("valid boolean") && !message.includes("decode") && !message.includes("returned data")) {
      throw error;
    }

    const data = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: legacyGetMarketAbi,
      functionName: "getMarket",
      args: [BigInt(id)]
    });

    return {
      question: data[0],
      category: data[1],
      closeTime: Number(data[2]),
      resolutionTime: Number(data[2]),
      creator: data[3],
      resolver: data[4],
      yesPool: toAmount(data[5]),
      noPool: toAmount(data[6]),
      traderCount: Number(data[7]),
      proposedOutcome: Outcome.Unresolved,
      proposedAt: 0,
      disputeDeadline: 0,
      disputed: false,
      disputer: ZERO_ADDRESS,
      outcome: Number(data[8])
    };
  }
}

async function refreshContractState() {
  await detectContractVersion();
  const [count, owner, minStake] = await Promise.all([
    readContract("marketCount"),
    readContract("owner"),
    readContract("minStake")
  ]);
  state.marketCount = Number(count);
  state.owner = owner;
  state.minStake = toAmount(minStake);

  try {
    const [creatorBond, disputeBond, disputeWindow, protocolFeeBps, accumulatedProtocolFees] = await Promise.all([
      readContract("creatorBond"),
      readContract("disputeBond"),
      readContract("disputeWindow"),
      readContract("protocolFeeBps"),
      readContract("accumulatedProtocolFees")
    ]);
    state.creatorBond = toAmount(creatorBond);
    state.disputeBond = toAmount(disputeBond);
    state.disputeWindow = Number(disputeWindow);
    state.protocolFeeBps = Number(protocolFeeBps);
    state.accumulatedProtocolFees = toAmount(accumulatedProtocolFees);
  } catch {
    state.creatorBond = "0";
    state.disputeBond = "0";
    state.disputeWindow = 0;
    state.protocolFeeBps = 0;
    state.accumulatedProtocolFees = "0";
  }

  try {
    const [contractVersion, resolutionAuthority, disputeGracePeriod, marketCreationFee] = await Promise.all([
      readContract("CONTRACT_VERSION"),
      readContract("resolutionAuthority"),
      readContract("disputeGracePeriod"),
      readContract("marketCreationFee")
    ]);
    state.contractVersion = String(contractVersion || "unknown");
    state.resolutionAuthority = resolutionAuthority || state.owner;
    state.disputeGracePeriod = Number(disputeGracePeriod);
    state.marketCreationFee = toAmount(marketCreationFee);
    if (isV4Contract()) {
      const [proposalGracePeriod, aiAttestationSigner] = await Promise.all([
        readContract("proposalGracePeriod"),
        readContract("aiAttestationSigner")
      ]);
      state.proposalGracePeriod = Number(proposalGracePeriod);
      state.aiAttestationSigner = aiAttestationSigner;
    } else {
      state.proposalGracePeriod = 0;
      state.aiAttestationSigner = ZERO_ADDRESS;
    }
  } catch {
    state.contractVersion = state.creatorBond === "0" ? "legacy" : "dispute";
    state.resolutionAuthority = state.owner;
    state.disputeGracePeriod = 0;
    state.marketCreationFee = "0";
  }

  const markets = await Promise.all(
    Array.from({ length: state.marketCount }, async (_, id) => {
      const data = await readMarketData(id);
      const current = ensureMarket(id);
      return {
        ...current,
        id,
        ...data
      };
    })
  );

  state.markets = Object.fromEntries(markets.map((market) => [String(market.id), market]));
  if (isStablecoinContract()) {
    const tokens = [...new Set(markets.map((market) => market.settlementToken).filter((token) => token && token !== ZERO_ADDRESS))];
    const assets = new Map();
    await Promise.all(
      tokens.map(async (token) => {
        const config = await readContract("assetConfigs", [token]);
        assets.set(token.toLowerCase(), {
          symbol: String(config[1] || "TOKEN"),
          decimals: Number(config[2] || 6)
        });
      })
    );
    for (const market of Object.values(state.markets)) {
      const asset = assets.get(String(market.settlementToken).toLowerCase());
      market.settlementSymbol = asset?.symbol || "TOKEN";
      market.settlementDecimals = asset?.decimals ?? 6;
    }
  }
}

function computeStats() {
  const markets = Object.values(state.markets);
  const now = Math.floor(Date.now() / 1000);
  const totalVolume = markets.reduce((sum, market) => sum + toBigint(market.yesPool) + toBigint(market.noPool), 0n);
  const settlementSymbols = [...new Set(markets.map((market) => String(market.settlementSymbol || "USDC")))];
  const liveMarkets = markets.filter((market) => market.outcome === Outcome.Unresolved && market.closeTime > now);
  const endedMarkets = markets.filter((market) => market.outcome !== Outcome.Unresolved);
  const pendingMarkets = markets.filter((market) => market.outcome === Outcome.Unresolved && market.closeTime <= now);
  const assetRows = new Map();
  const users = new Set();

  for (const market of markets) {
    if (market.creator) users.add(market.creator.toLowerCase());
    const token = String(market.settlementToken || market.settlementSymbol || "USDC").toLowerCase();
    const symbol = String(market.settlementSymbol || "USDC");
    const decimals = Number(market.settlementDecimals || 6);
    const volume = toBigint(market.yesPool) + toBigint(market.noPool);
    const row = assetRows.get(token) || {
      token: market.settlementToken,
      symbol,
      decimals,
      marketCount: 0,
      liveMarkets: 0,
      endedMarkets: 0,
      pendingMarkets: 0,
      participantEntries: 0,
      totalVolume: 0n,
      liveLiquidity: 0n,
      averageMarketVolume: 0n
    };
    row.marketCount += 1;
    row.participantEntries += Number(market.traderCount || 0);
    row.totalVolume += volume;
    if (market.outcome === Outcome.Unresolved && market.closeTime > now) {
      row.liveMarkets += 1;
      row.liveLiquidity += volume;
    } else if (market.outcome === Outcome.Unresolved && market.closeTime <= now) {
      row.pendingMarkets += 1;
    } else {
      row.endedMarkets += 1;
    }
    row.averageMarketVolume = row.marketCount > 0 ? row.totalVolume / BigInt(row.marketCount) : 0n;
    assetRows.set(token, row);
  }
  for (const trade of state.trades) {
    if (trade.user) users.add(trade.user.toLowerCase());
  }
  for (const claim of state.claims) {
    if (claim.user) users.add(claim.user.toLowerCase());
  }

  state.stats = {
    totalMarkets: state.marketCount,
    indexedMarkets: markets.length,
    liveMarkets: liveMarkets.length,
    endedMarkets: endedMarkets.length,
    pendingMarkets: pendingMarkets.length,
    totalVolume: totalVolume.toString(),
    liveLiquidity: liveMarkets
      .reduce((sum, market) => sum + toBigint(market.yesPool) + toBigint(market.noPool), 0n)
      .toString(),
    averageMarketVolume: markets.length > 0 ? (totalVolume / BigInt(markets.length)).toString() : "0",
    participantEntries: markets.reduce((sum, market) => sum + Number(market.traderCount || 0), 0),
    knownPlayers: users.size,
    settlementSymbols,
    hasMixedSettlementAssets: settlementSymbols.length > 1,
    assetBreakdown: [...assetRows.values()]
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((row) => ({
        ...row,
        totalVolume: row.totalVolume.toString(),
        liveLiquidity: row.liveLiquidity.toString(),
        averageMarketVolume: row.averageMarketVolume.toString()
      }))
  };
}

function buildLeaderboard(periodStart = 0) {
  const rows = new Map();
  const positions = new Map();
  const marketsById = new Map(Object.values(state.markets).map((market) => [market.id, market]));
  const pointsDecimals = isStablecoinContract() ? V3_SETTLEMENT_DECIMALS : USDC_DECIMALS;

  const getRow = (address) => {
    const key = address.toLowerCase();
    if (!rows.has(key)) {
      rows.set(key, {
        address,
        volume: 0n,
        stake: 0n,
        payout: 0n,
        pnl: 0n,
        wonMarkets: 0,
        resolvedMarkets: 0,
        winRate: 0,
        auraPoints: 0,
        createdMarkets: 0
      });
    }
    return rows.get(key);
  };

  for (const market of marketsById.values()) {
    if (market.creator && (!periodStart || market.createdAt >= periodStart)) {
      getRow(market.creator).createdMarkets += 1;
    }
  }

  for (const trade of state.trades) {
    if (periodStart && trade.timestamp < periodStart) continue;
    const row = getRow(trade.user);
    const amount = toBigint(trade.amount);
    row.volume += amount;
    row.stake += amount;
    const key = `${trade.user.toLowerCase()}:${trade.marketId}`;
    const current = positions.get(key) ?? {
      user: trade.user,
      marketId: trade.marketId,
      yes: 0n,
      no: 0n
    };
    if (trade.side === Outcome.Yes) current.yes += amount;
    if (trade.side === Outcome.No) current.no += amount;
    positions.set(key, current);
  }

  for (const position of positions.values()) {
    const market = marketsById.get(position.marketId);
    if (!market || market.outcome === Outcome.Unresolved) continue;
    const row = getRow(position.user);
    const stake = position.yes + position.no;
    let payout = 0n;

    if (market.outcome === Outcome.Canceled) {
      payout = stake;
    } else {
      const winningStake = market.outcome === Outcome.Yes ? position.yes : position.no;
      const winningPool = market.outcome === Outcome.Yes ? toBigint(market.yesPool) : toBigint(market.noPool);
      const totalPool = toBigint(market.yesPool) + toBigint(market.noPool);
      if (winningStake > 0n && winningPool > 0n) {
        const grossPayout = (winningStake * totalPool) / winningPool;
        const profit = grossPayout > stake ? grossPayout - stake : 0n;
        const fee = (profit * BigInt(market.termsProtocolFeeBps ?? state.protocolFeeBps ?? 0)) / 10000n;
        payout = grossPayout - fee;
      }
    }

    row.payout += payout;
    row.pnl += payout - stake;
    row.resolvedMarkets += 1;
    if (market.outcome !== Outcome.Canceled && payout > 0n) row.wonMarkets += 1;
  }

  return [...rows.values()].map((row) => {
    const winRate = row.resolvedMarkets > 0 ? (row.wonMarkets / row.resolvedMarkets) * 100 : 0;
    return {
      ...row,
      volume: row.volume.toString(),
      stake: row.stake.toString(),
      payout: row.payout.toString(),
      pnl: row.pnl.toString(),
      winRate,
      auraPoints: auraPointsFor(row.volume, row.wonMarkets, row.resolvedMarkets, row.createdMarkets, row.pnl, pointsDecimals)
    };
  });
}

function sortLeaderboard(rows, metric = "volume") {
  return rows.sort((a, b) => {
    if (metric === "winRate") return b.winRate - a.winRate || b.auraPoints - a.auraPoints;
    if (metric === "pnl") return compareBigint(toBigint(b.pnl), toBigint(a.pnl)) || b.auraPoints - a.auraPoints;
    if (metric === "auraPoints") return b.auraPoints - a.auraPoints || compareBigint(toBigint(b.volume), toBigint(a.volume));
    return compareBigint(toBigint(b.volume), toBigint(a.volume)) || b.auraPoints - a.auraPoints;
  });
}

function socialState() {
  if (!state.social) {
    state.social = {
      profiles: {},
      follows: {},
      comments: {},
      evidence: {}
    };
  }
  state.social.profiles ??= {};
  state.social.follows ??= {};
  state.social.comments ??= {};
  state.social.evidence ??= {};
  return state.social;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function cleanText(value, maxLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanAddress(value) {
  const address = String(value ?? "").trim();
  return isAddress(address) ? address : "";
}

function cleanUrl(value) {
  const url = String(value ?? "").trim().slice(0, 500);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function appendSocialRow(collection, key, row, limit) {
  const rows = Array.isArray(collection[key]) ? collection[key] : [];
  collection[key] = [row, ...rows.filter((item) => item.id !== row.id)].slice(0, limit);
}

function resolutionState() {
  state.resolutions ??= {};
  return state.resolutions;
}

function oracleState() {
  state.oracleProposals ??= {};
  return state.oracleProposals;
}

function adminAuthorized(req) {
  if (!RESOLUTION_ADMIN_TOKEN) return false;
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : String(req.headers["x-aura-admin-token"] || "");
  return token === RESOLUTION_ADMIN_TOKEN;
}

function outcomeName(outcome) {
  if (outcome === Outcome.Yes || outcome === "YES") return "YES";
  if (outcome === Outcome.No || outcome === "NO") return "NO";
  if (outcome === Outcome.Canceled || outcome === "CANCEL" || outcome === "CANCELED") return "CANCEL";
  return "INSUFFICIENT_EVIDENCE";
}

function outcomeValue(outcome) {
  const normalized = outcomeName(outcome);
  if (normalized === "YES") return Outcome.Yes;
  if (normalized === "NO") return Outcome.No;
  if (normalized === "CANCEL") return Outcome.Canceled;
  return Outcome.Unresolved;
}

function pct(value, total) {
  if (total <= 0n) return 50;
  return Math.round(Number((value * 10_000n) / total)) / 100;
}

function confidenceBand(score) {
  const value = Number(score || 0);
  if (value >= 80) return "High";
  if (value >= 60) return "Medium";
  if (value > 0) return "Low";
  return "Market-only";
}

function marketPools(market) {
  const yesPool = toBigint(market?.yesPool);
  const noPool = toBigint(market?.noPool);
  const total = yesPool + noPool;
  return {
    yesPool,
    noPool,
    total,
    yesPercent: pct(yesPool, total),
    noPercent: pct(noPool, total)
  };
}

function receiptDecisionValue(receipt) {
  if (!receipt) return Outcome.Unresolved;
  if (typeof receipt.proposedOutcomeValue === "number") return outcomeValue(receipt.proposedOutcomeValue);
  return outcomeValue(receipt.consensus?.outcome || receipt.proposedOutcome);
}

function oracleDecisionValue(proposal) {
  if (!proposal) return Outcome.Unresolved;
  if (typeof proposal.outcomeValue === "number") return outcomeValue(proposal.outcomeValue);
  return outcomeValue(proposal.outcome);
}

function clampPercent(value) {
  return Math.max(1, Math.min(99, Math.round(Number(value || 0))));
}

function probabilityFromDecision(decision, confidence, fallback) {
  const score = Number(confidence || 0);
  if (decision === Outcome.Yes) return clampPercent(score || Math.max(fallback, 55));
  if (decision === Outcome.No) return clampPercent(100 - (score || Math.max(100 - fallback, 55)));
  return clampPercent(fallback);
}

function sourceUrlsFromReceipt(receipt) {
  const rows = [];
  for (const item of Array.isArray(receipt?.evidence) ? receipt.evidence : []) {
    const url = cleanUrl(item?.url);
    if (url && !rows.includes(url)) rows.push(url);
  }
  for (const review of Array.isArray(receipt?.reviews) ? receipt.reviews : []) {
    for (const item of Array.isArray(review?.keyEvidence) ? review.keyEvidence : []) {
      const url = cleanUrl(item?.url);
      if (url && !rows.includes(url)) rows.push(url);
    }
  }
  return rows;
}

function aiInsightForMarket(market) {
  const receipt = resolutionState()[String(market.id)] || null;
  const proposal = oracleState()[String(market.id)] || null;
  const pools = marketPools(market);
  const receiptDecision = receiptDecisionValue(receipt);
  const oracleDecision = oracleDecisionValue(proposal);
  const receiptConfidence = Number(receipt?.consensus?.confidence || 0);
  const oracleConfidence = Number(proposal?.confidence || 0);
  const decision = receiptDecision !== Outcome.Unresolved ? receiptDecision : oracleDecision;
  const confidence = receiptDecision !== Outcome.Unresolved ? receiptConfidence : oracleConfidence;
  const estimatedYesProbability = probabilityFromDecision(decision, confidence, pools.yesPercent);
  const edge = Math.round((estimatedYesProbability - pools.yesPercent) * 10) / 10;
  const edgeSide = Math.abs(edge) < 8 ? "balanced" : edge > 0 ? "YES" : "NO";
  const lowLiquidity = pools.total < 5_000_000n;
  const oneSided = pools.yesPool === 0n || pools.noPool === 0n;
  const sourceUrls = [
    ...sourceUrlsFromReceipt(receipt),
    ...(Array.isArray(proposal?.sourceUrls) ? proposal.sourceUrls.map(cleanUrl).filter(Boolean) : []),
    ...marketSourceUrls(market)
  ].filter((url, index, rows) => url && rows.indexOf(url) === index).slice(0, 6);
  const riskFlags = [
    lowLiquidity ? "Low liquidity can make the market price noisy." : "",
    oneSided ? "One-sided pool may require Cancel/Refund instead of YES/NO." : "",
    !receipt ? "No saved Aura resolution receipt yet." : "",
    !proposal ? "No objective Oracle proposal yet." : "",
    Number(market.resolutionTime || market.closeTime || 0) > Math.floor(Date.now() / 1000)
      ? "Resolution time has not passed yet."
      : "",
    market.disputed ? "A dispute is open." : "",
    market.authorityReviewRequired ? "Authority review is required." : ""
  ].filter(Boolean);
  const basis =
    receiptDecision !== Outcome.Unresolved
      ? "Aura AI receipt"
      : oracleDecision !== Outcome.Unresolved
        ? "Objective Oracle proposal"
        : "Market price baseline";
  const summary =
    basis === "Market price baseline"
      ? "Aura has no saved AI or Oracle result yet, so the insight starts from current YES/NO market pricing."
      : `${basis} currently points to ${outcomeName(decision)} with ${confidence || 0}% confidence.`;

  return {
    marketId: market.id,
    question: market.question,
    category: market.category || "Other",
    status: market.outcome !== Outcome.Unresolved ? "finalized" : Number(market.proposedAt || 0) > 0 ? "proposed" : "open",
    marketYesPrice: pools.yesPercent,
    marketNoPrice: pools.noPercent,
    estimatedYesProbability,
    edge,
    edgeSide,
    confidence: confidence || 0,
    confidenceBand: confidenceBand(confidence),
    basis,
    summary,
    riskFlags,
    sourceUrls,
    receiptHash: receipt?.receiptHash || "",
    oracleDataHash: proposal?.dataHash || "",
    txHash: receipt?.txHash || proposal?.txHash || "",
    updatedAt: nowIso()
  };
}

function publicOracleReceiptForMarket(marketId) {
  const market = state.markets[String(marketId)];
  if (!market) return null;
  const receipt = resolutionState()[String(marketId)] || null;
  const proposal = oracleState()[String(marketId)] || null;
  const aiDecision = receiptDecisionValue(receipt);
  const oracleDecision = oracleDecisionValue(proposal);
  const finalDecision = outcomeValue(market.outcome);
  return {
    marketId,
    question: market.question,
    category: market.category || "Other",
    resolutionTime: marketResolutionTime(market),
    status: finalDecision !== Outcome.Unresolved ? "finalized" : market.disputed ? "disputed" : market.proposedAt > 0 ? "proposed" : "awaiting_proposal",
    finalOutcome: outcomeName(finalDecision),
    proposedOutcome: outcomeName(market.proposedOutcome),
    ai: receipt
      ? {
          status: receipt.status || "",
          outcome: outcomeName(aiDecision),
          confidence: Number(receipt.consensus?.confidence || 0),
          agreed: receipt.consensus?.agreed ?? null,
          receiptHash: receipt.receiptHash || "",
          provider: receipt.provider || "",
          model: receipt.model || "",
          generatedAt: receipt.generatedAt || "",
          attestationSigner: receipt.attestationSigner || "",
          txHash: receipt.txHash || ""
        }
      : null,
    oracle: proposal
      ? {
          status: proposal.status || "",
          adapter: proposal.adapter || "",
          outcome: outcomeName(oracleDecision),
          confidence: Number(proposal.confidence || 0),
          observedValue: proposal.observedValue || "",
          observedAt: proposal.observedAt || "",
          dataHash: proposal.dataHash || "",
          txHash: proposal.txHash || "",
          autoProposed: Boolean(proposal.autoProposed),
          summary: proposal.summary || ""
        }
      : null,
    evidence: [
      ...(Array.isArray(receipt?.evidence) ? receipt.evidence : []),
      ...oracleEvidenceRowsForMarket(marketId)
    ].slice(0, 10),
    sourceUrls: [
      ...sourceUrlsFromReceipt(receipt),
      ...(Array.isArray(proposal?.sourceUrls) ? proposal.sourceUrls.map(cleanUrl).filter(Boolean) : []),
      ...marketSourceUrls(market)
    ].filter((url, index, rows) => url && rows.indexOf(url) === index).slice(0, 8),
    dispute: {
      disputed: Boolean(market.disputed),
      authorityReviewRequired: Boolean(market.authorityReviewRequired),
      disputeDeadline: Number(market.disputeDeadline || 0),
      disputer: market.disputer || ZERO_ADDRESS
    },
    hashes: {
      proposalEvidenceHash: market.proposalEvidenceHash || ZERO_HASH,
      aiReceiptHash: market.aiReceiptHash || receipt?.receiptHash || ZERO_HASH,
      oracleDataHash: proposal?.dataHash || ZERO_HASH
    },
    updatedAt: state.updatedAt || nowIso()
  };
}

function oracleReputationSummary() {
  const proposals = Object.values(oracleState());
  const receipts = Object.values(resolutionState());
  const markets = Object.values(state.markets);
  const finalized = markets.filter((market) => outcomeValue(market.outcome) !== Outcome.Unresolved);
  const proposalRows = proposals.filter((proposal) => Number.isInteger(Number(proposal?.marketId)));
  const receiptRows = receipts.filter((receipt) => Number.isInteger(Number(receipt?.marketId)));
  const finalMatches = proposalRows.filter((proposal) => {
    const market = state.markets[String(proposal.marketId)];
    return market && outcomeValue(market.outcome) !== Outcome.Unresolved && oracleDecisionValue(proposal) === outcomeValue(market.outcome);
  }).length;
  const finalMisses = proposalRows.filter((proposal) => {
    const market = state.markets[String(proposal.marketId)];
    return market && outcomeValue(market.outcome) !== Outcome.Unresolved && oracleDecisionValue(proposal) !== Outcome.Unresolved && oracleDecisionValue(proposal) !== outcomeValue(market.outcome);
  }).length;
  const avgOracleConfidence =
    proposalRows.length > 0
      ? Math.round(proposalRows.reduce((sum, proposal) => sum + Number(proposal.confidence || 0), 0) / proposalRows.length)
      : 0;
  const avgAiConfidence =
    receiptRows.length > 0
      ? Math.round(receiptRows.reduce((sum, receipt) => sum + Number(receipt.consensus?.confidence || 0), 0) / receiptRows.length)
      : 0;
  const evidenceRows = proposalRows.reduce(
    (sum, proposal) =>
      sum + (Array.isArray(proposal.sourceUrls) ? proposal.sourceUrls.length : 0) + (Array.isArray(proposal.checks) ? proposal.checks.length : 0),
    0
  );
  const evidenceQuality = proposalRows.length > 0 ? Math.min(100, Math.round((evidenceRows / proposalRows.length) * 18)) : 0;
  const accuracy = finalMatches + finalMisses > 0 ? Math.round((finalMatches / (finalMatches + finalMisses)) * 100) : 0;
  const reversalRate = finalMatches + finalMisses > 0 ? Math.round((finalMisses / (finalMatches + finalMisses)) * 100) : 0;
  const coverage = markets.length > 0 ? Math.round((proposalRows.length / markets.length) * 100) : 0;
  const reputationScore = Math.round(
    Math.min(100, coverage * 0.2 + avgOracleConfidence * 0.22 + avgAiConfidence * 0.16 + evidenceQuality * 0.18 + accuracy * 0.24)
  );
  const adapters = {};
  for (const proposal of proposalRows) {
    const key = proposal.adapter || "unknown";
    adapters[key] = (adapters[key] || 0) + 1;
  }
  const recent = proposalRows
    .slice()
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))
    .slice(0, 8)
    .map((proposal) => {
      const market = state.markets[String(proposal.marketId)];
      return {
        marketId: proposal.marketId,
        question: market?.question || `Market #${proposal.marketId}`,
        adapter: proposal.adapter || "",
        status: proposal.status || "",
        outcome: outcomeName(oracleDecisionValue(proposal)),
        confidence: Number(proposal.confidence || 0),
        txHash: proposal.txHash || "",
        generatedAt: proposal.generatedAt || ""
      };
    });

  return {
    reputationScore,
    tier: reputationScore >= 85 ? "Production candidate" : reputationScore >= 65 ? "Operator ready" : reputationScore >= 40 ? "Needs calibration" : "Early testnet",
    coverage,
    accuracy,
    reversalRate,
    avgOracleConfidence,
    avgAiConfidence,
    evidenceQuality,
    oracleProposals: proposalRows.length,
    aiReceipts: receiptRows.length,
    finalizedMarkets: finalized.length,
    disputedMarkets: markets.filter((market) => market.disputed).length,
    authorityReviewMarkets: markets.filter((market) => market.authorityReviewRequired).length,
    autoProposed: proposalRows.filter((proposal) => proposal.autoProposed).length,
    adapters,
    recent,
    policy:
      "Experimental testnet reputation. Score combines coverage, confidence, final-match accuracy, reversal rate, and evidence depth. The 78% auto-propose gate still needs backtesting before mainnet.",
    updatedAt: state.updatedAt || nowIso()
  };
}

function hotAiMarkets(limit = 8) {
  return Object.values(state.markets)
    .filter((market) => outcomeValue(market.outcome) === Outcome.Unresolved)
    .map((market) => ({ market, insight: aiInsightForMarket(market), volume: marketPools(market).total }))
    .sort((a, b) => (b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : Number(b.market.id) - Number(a.market.id)))
    .slice(0, limit)
    .map(({ market, insight }) => ({
      market: {
        id: market.id,
        question: market.question,
        category: market.category || "Other",
        closeTime: market.closeTime,
        resolutionTime: marketResolutionTime(market),
        settlementSymbol: market.settlementSymbol || "USDC",
        traderCount: market.traderCount,
        yesPool: market.yesPool,
        noPool: market.noPool
      },
      insight
    }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function embedMarketHtml(market) {
  const insight = aiInsightForMarket(market);
  const appUrl = `https://app.aurapredict.xyz/?market=${encodeURIComponent(String(market.id))}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AuraPredict Market #${escapeHtml(market.id)}</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#070c18;color:#eef6ff}
    body{margin:0;padding:16px;background:#070c18}
    .card{border:1px solid #25415d;border-radius:10px;background:linear-gradient(135deg,#0d1730,#071221);box-shadow:0 18px 48px rgba(0,0,0,.35);padding:16px;max-width:520px}
    .label{color:#18d7ff;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
    h1{font-size:20px;line-height:1.2;margin:8px 0 14px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .cell{border:1px solid #223752;border-radius:8px;background:#0a1020;padding:10px}
    .cell span{display:block;color:#91a5bf;font-size:11px;font-weight:800;text-transform:uppercase}
    .cell strong{display:block;margin-top:4px;font-size:16px}
    p{color:#aab8cf;font-size:13px;line-height:1.45}
    a{display:inline-flex;margin-top:12px;min-height:40px;align-items:center;border-radius:8px;background:#18d7ff;color:#06111e;font-weight:900;padding:0 14px;text-decoration:none}
  </style>
</head>
<body>
  <article class="card">
    <span class="label">AuraPredict market #${escapeHtml(market.id)} on Arc</span>
    <h1>${escapeHtml(market.question)}</h1>
    <div class="grid">
      <div class="cell"><span>Market YES</span><strong>${escapeHtml(insight.marketYesPrice)}%</strong></div>
      <div class="cell"><span>AI estimate</span><strong>${escapeHtml(insight.estimatedYesProbability)}%</strong></div>
      <div class="cell"><span>Edge</span><strong>${escapeHtml(insight.edgeSide)}</strong></div>
    </div>
    <p>${escapeHtml(insight.summary)}</p>
    <a href="${appUrl}" target="_blank" rel="noreferrer">Open on AuraPredict</a>
  </article>
</body>
</html>`;
}

function isBytes32(value) {
  return /^0x[a-fA-F0-9]{64}$/.test(String(value || ""));
}

function isSignature(value) {
  return /^0x[a-fA-F0-9]{130}$/.test(String(value || ""));
}

function marketResolutionTime(market) {
  return Number(market?.resolutionTime || market?.closeTime || 0);
}

function marketAssetDecimals(market) {
  return Number(market?.settlementDecimals ?? USDC_DECIMALS);
}

function receiptHashFor(receipt) {
  const { receiptHash, txHash, status, error, ...decisionPayload } = receipt;
  return keccak256(stringToHex(JSON.stringify(decisionPayload)));
}

function tokenizeMarketText(value) {
  const stopWords = new Set([
    "will",
    "the",
    "and",
    "or",
    "yes",
    "no",
    "for",
    "with",
    "from",
    "this",
    "that",
    "any",
    "before",
    "after",
    "market",
    "markets",
    "reach",
    "reaches",
    "record",
    "records"
  ]);
  return String(value || "")
    .toLowerCase()
    .replace(/[$,]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function textSimilarity(a, b) {
  const left = new Set(tokenizeMarketText(a));
  const right = new Set(tokenizeMarketText(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function normalizeMarketText(value) {
  return String(value || "").toLowerCase().replace(/[$,]/g, "").replace(/\s+/g, " ").trim();
}

function extractMarketEntities(value) {
  const normalized = normalizeMarketText(value);
  const entities = new Set();
  const knownEntities = [
    "aurapredict",
    "arc",
    "solana",
    "ethereum",
    "bitcoin",
    "circle",
    "usdc",
    "fifa",
    "openai",
    "gemini"
  ];
  for (const entity of knownEntities) {
    if (normalized.includes(entity)) entities.add(entity);
  }

  const capitalized = String(value || "").match(/\b[A-Z][A-Za-z0-9]*(?:[ -][A-Z][A-Za-z0-9]*){0,3}\b/g) || [];
  for (const item of capitalized) {
    const cleaned = item.toLowerCase().trim();
    if (cleaned.length > 2 && !["will", "yes", "no", "utc"].includes(cleaned)) entities.add(cleaned);
  }
  return entities;
}

function isBroadScopeMarket(value) {
  const normalized = normalizeMarketText(value);
  return /\b(any|all|one of|at least one)\b/.test(normalized) && /\b(dapp|app|project|protocol|team|market)\b/.test(normalized);
}

function hasSameConcreteEntity(left, right) {
  const leftEntities = extractMarketEntities(left);
  const rightEntities = extractMarketEntities(right);
  for (const entity of leftEntities) {
    if (rightEntities.has(entity)) return true;
  }
  return false;
}

function sharedMetricOnly(left, right) {
  const leftText = normalizeMarketText(left);
  const rightText = normalizeMarketText(right);
  const metricWords = ["user", "users", "wallet", "wallets", "address", "addresses", "volume", "tvl", "trader", "traders"];
  const sharesMetric = metricWords.some((word) => leftText.includes(word) && rightText.includes(word));
  const leftNumbers = new Set(leftText.match(/\b\d+(?:k|m|b)?\b/g) || []);
  const rightNumbers = new Set(rightText.match(/\b\d+(?:k|m|b)?\b/g) || []);
  const sharesNumber = [...leftNumbers].some((number) => rightNumbers.has(number));
  return sharesMetric || sharesNumber;
}

function subjectSpecificity(value) {
  const normalized = normalizeMarketText(value);
  if (isBroadScopeMarket(value)) return 0;
  let score = 0;
  if (extractMarketEntities(value).size > 0) score += 2;
  if (/\b(official|specific|named|this)\b/.test(normalized)) score += 1;
  if (/\b(any|all|one of|at least one|ecosystem|sector|category)\b/.test(normalized)) score -= 2;
  return score;
}

function marketOverlapSignals(left, right) {
  const sameEntity = hasSameConcreteEntity(left, right);
  const broadScopeMismatch = isBroadScopeMarket(left) !== isBroadScopeMarket(right);
  const metricOnly = sharedMetricOnly(left, right) && !sameEntity;
  const specificityGap = Math.abs(subjectSpecificity(left) - subjectSpecificity(right));
  return { sameEntity, broadScopeMismatch, metricOnly, specificityGap };
}

function findSimilarMarkets(idea, category) {
  const normalizedCategory = String(category || "").toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  return Object.values(state.markets)
    .map((market) => {
      const baseScore = textSimilarity(idea, market.question);
      const { sameEntity, broadScopeMismatch, metricOnly, specificityGap } = marketOverlapSignals(idea, market.question);
      const categoryBonus =
        normalizedCategory && normalizedCategory !== "other" && String(market.category || "").toLowerCase() === normalizedCategory
          ? sameEntity
            ? 0.1
            : 0.04
          : 0;
      const liveBonus = market.outcome === Outcome.Unresolved && Number(market.closeTime) > now ? 0.08 : 0;
      const entityBonus = sameEntity ? 0.22 : 0;
      const mismatchPenalty = broadScopeMismatch ? 0.2 : 0;
      const metricOnlyPenalty = metricOnly ? 0.16 : 0;
      const specificityPenalty = specificityGap >= 2 && !sameEntity ? 0.12 : 0;
      const similarity = Math.max(
        0,
        Math.min(1, baseScore + categoryBonus + liveBonus + entityBonus - mismatchPenalty - metricOnlyPenalty - specificityPenalty)
      );
      return {
        id: market.id,
        question: market.question,
        category: market.category || "Other",
        closeTime: market.closeTime,
        volume: (toBigint(market.yesPool) + toBigint(market.noPool)).toString(),
        traderCount: market.traderCount,
        similarity: Math.round(similarity * 100),
        reason:
          similarity >= 0.72
            ? "Likely duplicate: same concrete subject and overlapping outcome."
            : sameEntity
              ? "Same concrete subject, but review deadline and criteria."
              : "Related theme or metric only; not a duplicate by itself."
      };
    })
    .filter((market) => market.similarity >= 28)
    .sort((a, b) => b.similarity - a.similarity || b.id - a.id)
    .slice(0, 5);
}

function duplicateRiskFor(similarMarkets) {
  const top = similarMarkets[0]?.similarity ?? 0;
  if (top >= 72) return "HIGH";
  if (top >= 48) return "MEDIUM";
  return "LOW";
}

function extractUrlsFromText(value) {
  return (String(value || "").match(/https?:\/\/[^\s"'<>),]+/gi) || [])
    .map((url) => cleanUrl(url))
    .filter(Boolean);
}

function marketSourceUrls(market) {
  const structuredRule = structuredRuleForMarket(market);
  return [
    cleanUrl(market?.metadataURI),
    cleanUrl(market?.fallbackSourceURI),
    cleanUrl(structuredRule?.primarySource),
    cleanUrl(structuredRule?.fallbackSource),
    ...extractUrlsFromText(market?.question),
    ...extractUrlsFromText(market?.resolutionRule)
  ].filter((url, index, rows) => url && rows.indexOf(url) === index);
}

function hostnameFor(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function inferSourceUrlsForMarket(market) {
  const text = oracleTextForMarket(market);
  const rows = [];
  const add = (url) => {
    const cleaned = cleanUrl(url);
    if (cleaned && !rows.includes(cleaned)) rows.push(cleaned);
  };

  if (text.includes("circle") && /\b(blog|post|publish|news|article)\b/.test(text)) {
    add("https://www.circle.com/blog");
    add("https://www.circle.com/newsroom");
  }
  if (text.includes("arc") && /\b(blog|post|publish|news|article|blueprint)\b/.test(text)) {
    add("https://www.arc.io/blog");
  }
  if (text.includes("openai") && /\b(blog|post|publish|news|release|announce)\b/.test(text)) {
    add("https://openai.com/news/");
  }
  if (text.includes("github") && text.includes("status")) {
    add("https://www.githubstatus.com/");
  }
  if (text.includes("openai") && text.includes("status")) {
    add("https://status.openai.com/");
  }
  if (text.includes("circle") && text.includes("status")) {
    add("https://status.circle.com/");
  }
  if (text.includes("coinbase") && text.includes("status")) {
    add("https://status.coinbase.com/");
  }
  if (text.includes("cloudflare") && text.includes("status")) {
    add("https://www.cloudflarestatus.com/");
  }
  if (text.includes("espn") && /\b(soccer|football|fixture|fixtures|schedule|match)\b/.test(text)) {
    add("https://www.espn.com/soccer/fixtures");
  }
  if (/\bnba\b/.test(text) && /\b(score|scores|game|games|schedule|fixture|final)\b/.test(text)) {
    add("https://www.nba.com/games");
    add("https://www.espn.com/nba/schedule");
  }
  if (/\bnfl\b|\bsuper bowl\b/.test(text) && /\b(score|scores|game|games|schedule|fixture|final)\b/.test(text)) {
    add("https://www.espn.com/nfl/schedule");
  }
  if (/\bmlb\b/.test(text) && /\b(score|scores|game|games|schedule|fixture|final)\b/.test(text)) {
    add("https://www.mlb.com/schedule");
  }
  if (/\bnhl\b/.test(text) && /\b(score|scores|game|games|schedule|fixture|final)\b/.test(text)) {
    add("https://www.nhl.com/schedule");
  }
  if (/\bwhite house\b|\bdonald trump\b|\bpresident\b/.test(text) && /\bannounce|statement|declare|press|ceasefire|executive\b/.test(text)) {
    add("https://www.whitehouse.gov/briefing-room/");
  }
  if (/\bcongress\b|\bsenate\b|\bhouse of representatives\b/.test(text) && /\bvote|bill|pass|approve|hearing\b/.test(text)) {
    add("https://www.congress.gov/");
  }

  return rows;
}

function evidenceSourceUrlsForMarket(market) {
  const explicit = marketSourceUrls(market);
  const inferred = inferSourceUrlsForMarket(market);
  return [...explicit, ...inferred]
    .map((url) => cleanUrl(url))
    .filter((url, index, rows) => url && rows.indexOf(url) === index)
    .slice(0, AUTO_EVIDENCE_MAX_SOURCES);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCharCode(Number.parseInt(number, 10)));
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function absoluteUrl(value, baseUrl) {
  const raw = decodeHtmlEntities(String(value || "").trim());
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("javascript:")) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractTag(block, tag) {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(String(block || ""));
  return match ? stripHtml(match[1]) : "";
}

function extractTagRaw(block, tag) {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(String(block || ""));
  return match ? String(match[0]) : "";
}

function parseDateMs(value) {
  const raw = stripHtml(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceFeedCandidates(sourceUrl) {
  const candidates = [sourceUrl];
  try {
    const parsed = new URL(sourceUrl);
    const origin = parsed.origin;
    const path = parsed.pathname.replace(/\/$/, "");
    if (!/\b(feed|rss|atom|sitemap)\b|\.xml$/i.test(path)) {
      if (path && path !== "/") candidates.push(`${origin}${path}/feed`);
      candidates.push(`${origin}/feed`, `${origin}/rss`, `${origin}/rss.xml`, `${origin}/atom.xml`, `${origin}/sitemap.xml`);
    }
  } catch {
    // Ignore malformed URLs after cleanUrl already filtered them.
  }
  return candidates.filter((url, index, rows) => rows.indexOf(url) === index).slice(0, 5);
}

async function fetchTextWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTO_EVIDENCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
        "user-agent": "AuraPredictEvidenceBot/1.0"
      },
      redirect: "follow",
      signal: controller.signal
    });
    const text = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      contentType: String(response.headers.get("content-type") || ""),
      text: text.slice(0, 900_000)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeedItems(text, baseUrl) {
  const rows = [];
  const blocks = [
    ...String(text || "").matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...String(text || "").matchAll(/<entry\b[\s\S]*?<\/entry>/gi)
  ].map((match) => match[0]);
  for (const block of blocks) {
    const rawLink = extractTagRaw(block, "link");
    const hrefMatch = /href=["']([^"']+)["']/i.exec(rawLink);
    const link = absoluteUrl(hrefMatch?.[1] || extractTag(block, "link") || extractTag(block, "id"), baseUrl);
    const title = cleanText(extractTag(block, "title") || extractTag(block, "name") || link, 180);
    const dateMs =
      parseDateMs(extractTag(block, "pubDate")) ||
      parseDateMs(extractTag(block, "published")) ||
      parseDateMs(extractTag(block, "updated")) ||
      parseDateMs(extractTag(block, "lastBuildDate"));
    if (title || link) rows.push({ title, url: link, publishedAt: dateMs, source: "feed" });
  }
  return rows;
}

function parseSitemapItems(text, baseUrl) {
  const rows = [];
  const blocks = [...String(text || "").matchAll(/<url\b[\s\S]*?<\/url>/gi)].map((match) => match[0]);
  for (const block of blocks) {
    const link = absoluteUrl(extractTag(block, "loc"), baseUrl);
    if (!link) continue;
    const pathTitle = link
      .replace(/^https?:\/\/[^/]+\//i, "")
      .replace(/[?#].*$/, "")
      .split("/")
      .filter(Boolean)
      .pop() || link;
    rows.push({
      title: cleanText(pathTitle.replace(/[-_]+/g, " "), 180),
      url: link,
      publishedAt: parseDateMs(extractTag(block, "lastmod")),
      source: "sitemap"
    });
  }
  return rows;
}

function collectJsonLdItems(value, rows = []) {
  if (!value || rows.length >= AUTO_EVIDENCE_MAX_ITEMS) return rows;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdItems(item, rows);
    return rows;
  }
  if (typeof value !== "object") return rows;
  const type = Array.isArray(value["@type"]) ? value["@type"].join(" ") : String(value["@type"] || "");
  const title = cleanText(value.headline || value.name || value.title, 180);
  const url = cleanUrl(value.url || value.mainEntityOfPage?.["@id"] || value.mainEntityOfPage?.url || "");
  const publishedAt = parseDateMs(value.datePublished || value.dateModified || value.uploadDate || value.dateCreated);
  if ((title || url) && /\b(article|blogposting|newsarticle|creativework|webpage)\b/i.test(type || title)) {
    rows.push({ title: title || url, url, publishedAt, source: "json-ld" });
  }
  if (value["@graph"]) collectJsonLdItems(value["@graph"], rows);
  if (value.itemListElement) collectJsonLdItems(value.itemListElement, rows);
  return rows;
}

function parseHtmlItems(text, baseUrl) {
  const rows = [];
  const html = String(text || "");
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts.slice(0, 20)) {
    try {
      collectJsonLdItems(JSON.parse(decodeHtmlEntities(script[1])), rows);
    } catch {
      // Ignore invalid JSON-LD fragments.
    }
  }

  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const anchor of anchors.slice(0, 1200)) {
    const url = absoluteUrl(anchor[1], baseUrl);
    const title = cleanText(stripHtml(anchor[2]), 180);
    if (!url || !title || title.length < 4) continue;
    rows.push({ title, url, publishedAt: null, source: "html" });
    if (rows.length >= AUTO_EVIDENCE_MAX_ITEMS) break;
  }
  return rows;
}

function marketEvidenceKeywords(market) {
  const text = `${market?.question || ""} ${stripRuleMetadata(market?.resolutionRule || "")}`;
  const generic = new Set([
    "will",
    "this",
    "that",
    "test",
    "market",
    "resolution",
    "time",
    "before",
    "after",
    "publish",
    "published",
    "post",
    "blog",
    "article",
    "news",
    "announce",
    "announcement",
    "scheduled",
    "show",
    "least",
    "higher",
    "lower",
    "price",
    "spot",
    "utc",
    "yes",
    "won"
  ]);
  return tokenizeMarketText(text).filter((token, index, rows) => !generic.has(token) && rows.indexOf(token) === index).slice(0, 12);
}

function isContentDeadlineMarket(market) {
  const text = oracleTextForMarket(market);
  if (looksLikeDeadlineEventQuestion(text)) return true;
  return /\b(blog|post|article|news|publish|announcement|announce|fixtures?|schedule|match)\b/.test(text);
}

function itemMatchesMarketEvidence(item, market, sourceUrl) {
  const marketText = oracleTextForMarket(market);
  const host = hostnameFor(sourceUrl);
  const itemText = normalizeMarketText(`${item.title || ""} ${item.url || ""}`);
  const keywords = marketEvidenceKeywords(market);

  if (/\b(blog|post|article|news|publish)\b/.test(marketText) && /\b(blog|news)\b|\/blog|\/news/.test(`${sourceUrl} ${item.url || ""}`.toLowerCase())) {
    const entityKeywords = keywords.filter((token) => host.includes(token) || ["circle", "arc", "openai", "aurapredict"].includes(token));
    return entityKeywords.length === 0 || entityKeywords.some((token) => itemText.includes(token) || host.includes(token));
  }

  if (/\b(fixtures?|schedule|match)\b/.test(marketText) && /\b(fixture|schedule|match|soccer|football|espn)\b/.test(itemText)) {
    return true;
  }

  if (keywords.length === 0) return false;
  const matched = keywords.filter((token) => itemText.includes(token));
  return matched.length >= Math.min(2, keywords.length);
}

function itemWithinMarketWindow(item, market) {
  const deadlineMs = marketResolutionTime(market) * 1000;
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) return false;
  const startMs = Math.max(0, Number(market?.createdAt || 0) * 1000 || deadlineMs - 7 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(item.publishedAt) || !item.publishedAt) {
    return false;
  }
  return item.publishedAt >= startMs - 60_000 && item.publishedAt <= deadlineMs + 60_000;
}

function dedupeEvidenceItems(rows) {
  const seen = new Set();
  return rows.filter((item) => {
    const key = `${item.url || ""}|${normalizeMarketText(item.title || "")}`;
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function autoEvidenceRow(market, sourceUrl, title, notes, finding) {
  return {
    id: `auto-source-${market.id}-${hostnameFor(sourceUrl) || "source"}-${Date.now()}`,
    marketId: market.id,
    title,
    url: sourceUrl,
    notes,
    finding,
    createdAt: nowIso()
  };
}

async function scanSourceForEvidence(market, sourceUrl) {
  const deadline = marketResolutionTime(market);
  const deadlineIso = deadline > 0 ? new Date(deadline * 1000).toISOString() : "unknown";
  const candidates = sourceFeedCandidates(sourceUrl);
  const fetched = [];
  const parsedItems = [];

  for (const candidate of candidates) {
    try {
      const result = await fetchTextWithTimeout(candidate);
      fetched.push(`${hostnameFor(result.url) || hostnameFor(candidate)}:${result.status}`);
      if (!result.ok && result.status !== 404) continue;
      const content = result.text || "";
      const items = [
        ...parseFeedItems(content, result.url),
        ...parseSitemapItems(content, result.url),
        ...parseHtmlItems(content, result.url)
      ];
      parsedItems.push(...items);
      if (parsedItems.length >= AUTO_EVIDENCE_MAX_ITEMS) break;
    } catch (error) {
      fetched.push(`${hostnameFor(candidate) || "source"}:${error instanceof Error ? error.message : "fetch failed"}`);
    }
  }

  const items = dedupeEvidenceItems(parsedItems).slice(0, AUTO_EVIDENCE_MAX_ITEMS);
  const matching = items.filter((item) => itemMatchesMarketEvidence(item, market, sourceUrl));
  const timedMatch = matching.find((item) => itemWithinMarketWindow(item, market));
  if (timedMatch) {
    const itemDate = timedMatch.publishedAt ? new Date(timedMatch.publishedAt).toISOString() : "unknown time";
    return autoEvidenceRow(
      market,
      timedMatch.url || sourceUrl,
      "Objective source scan: qualifying item found",
      `Aura Source Router scanned ${sourceUrl} and found a matching item before the resolution deadline ${deadlineIso}: "${timedMatch.title}" at ${itemDate}. This supports YES unless the market rule excludes this source or item.`,
      `Matched ${timedMatch.title} at ${itemDate}.`
    );
  }

  if (matching.length > 0) {
    const sample = matching
      .slice(0, 3)
      .map((item) => `${item.title}${item.publishedAt ? ` (${new Date(item.publishedAt).toISOString()})` : ""}`)
      .join(" / ");
    return autoEvidenceRow(
      market,
      matching[0].url || sourceUrl,
      "Objective source scan: matching items need timestamp review",
      `Aura Source Router scanned ${sourceUrl}. Matching items were found, but no parsed timestamp was inside the required window ending ${deadlineIso}. Review manually before a final YES/NO: ${sample}.`,
      `Found ${matching.length} possible matching item(s), but timestamp proof is incomplete.`
    );
  }

  const noMatchFinding = items.length > 0
    ? `No matching item was parsed among ${items.length} source item(s).`
    : "The source was reachable but did not expose parseable feed, sitemap, JSON-LD, or link items.";
  return autoEvidenceRow(
    market,
    sourceUrl,
    "Objective source scan: no matching item found",
    `Aura Source Router scanned ${sourceUrl} before AI review. ${noMatchFinding} The resolution deadline is ${deadlineIso}. For by-deadline publish/announce/schedule markets, this supports NO unless a user provides a qualifying source item.`,
    noMatchFinding
  );
}

async function gatherAutomaticEvidenceRows(market) {
  if (!AUTO_EVIDENCE_ENABLED || !market || !isContentDeadlineMarket(market)) return [];
  const now = Math.floor(Date.now() / 1000);
  const resolutionTime = marketResolutionTime(market);
  if (!resolutionTime || now < resolutionTime) return [];

  const urls = evidenceSourceUrlsForMarket(market);
  if (urls.length === 0) {
    return [
      autoEvidenceRow(
        market,
        "",
        "Objective source scan: no source URL configured",
        "Aura Source Router could not find a primary, fallback, or inferred source URL. Add an official source link before relying on Aura for this market.",
        "No source URL was available for automatic evidence collection."
      )
    ];
  }

  const rows = [];
  for (const sourceUrl of urls) {
    const row = await scanSourceForEvidence(market, sourceUrl);
    rows.push(row);
    if (/qualifying item found/i.test(row.title || "")) break;
  }
  return rows.slice(0, AUTO_EVIDENCE_MAX_SOURCES);
}

function stripRuleMetadata(value) {
  return String(value || "")
    .replace(new RegExp(`\\n*${AURA_RULE_JSON_PREFIX}[\\s\\S]*$`), "")
    .trim();
}

function structuredRuleForMarket(market) {
  const rule = String(market?.resolutionRule || "");
  const index = rule.indexOf(AURA_RULE_JSON_PREFIX);
  if (index < 0) return null;
  const raw = rule.slice(index + AURA_RULE_JSON_PREFIX.length).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Number(parsed.version || 0) !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function oracleTextForMarket(market) {
  const structuredRule = structuredRuleForMarket(market);
  return [
    market?.question,
    market?.category,
    market?.metadataURI,
    market?.fallbackSourceURI,
    stripRuleMetadata(market?.resolutionRule),
    structuredRule ? JSON.stringify(structuredRule) : ""
  ]
    .map((value) => String(value || ""))
    .join(" ")
    .toLowerCase();
}

function parseNumericValue(value) {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function detectComparatorTarget(text) {
  const value = String(text || "").toLowerCase().replace(/\s+/g, " ");
  const patterns = [
    { comparator: "gte", regex: /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|usdc|points?|index|per ounce)?\s*(?:or higher|or above|or more|or greater)/i },
    { comparator: "lte", regex: /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|usdc|points?|index|per ounce)?\s*(?:or lower|or below|or less)/i },
    { comparator: "gte", regex: /(?:at\s+or\s+above|at\s+least|above|higher than|greater than|>=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "lte", regex: /(?:at\s+or\s+below|at\s+most|below|lower than|less than|<=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "eq", regex: /(?:exactly|equal(?:s)?|=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i }
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern.regex);
    const target = parseNumericValue(match?.[1]);
    if (target !== null) return { comparator: pattern.comparator, target };
  }

  return null;
}

function compareObservedValue(observed, comparator, target) {
  if (comparator === "gte") return observed >= target;
  if (comparator === "lte") return observed <= target;
  if (comparator === "eq") return Math.abs(observed - target) < 0.000001;
  return false;
}

function sourceHostLabel(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExactMarketTerm(text, term) {
  const normalizedTerm = String(term || "").toLowerCase().trim();
  if (!normalizedTerm) return false;
  if (/^[a-z0-9]+$/.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, "i").test(text);
  }
  return text.includes(normalizedTerm);
}

const CRYPTO_ORACLE_ASSETS = [
  { symbol: "BTC", names: ["btc", "bitcoin"], binance: "BTCUSDT", coingecko: "bitcoin" },
  { symbol: "ETH", names: ["eth", "ethereum"], binance: "ETHUSDT", coingecko: "ethereum" },
  { symbol: "SOL", names: ["sol", "solana"], binance: "SOLUSDT", coingecko: "solana" },
  { symbol: "BNB", names: ["bnb", "binance coin"], binance: "BNBUSDT", coingecko: "binancecoin" },
  { symbol: "XRP", names: ["xrp", "ripple"], binance: "XRPUSDT", coingecko: "ripple" },
  { symbol: "ADA", names: ["ada", "cardano"], binance: "ADAUSDT", coingecko: "cardano" },
  { symbol: "DOGE", names: ["doge", "dogecoin"], binance: "DOGEUSDT", coingecko: "dogecoin" },
  { symbol: "AVAX", names: ["avax", "avalanche"], binance: "AVAXUSDT", coingecko: "avalanche-2" },
  { symbol: "LINK", names: ["link", "chainlink"], binance: "LINKUSDT", coingecko: "chainlink" }
];

function detectCryptoOracleMarket(market) {
  const structuredRule = structuredRuleForMarket(market);
  if (structuredRule?.kind === "crypto-price") {
    const asset = CRYPTO_ORACLE_ASSETS.find((candidate) => candidate.symbol === String(structuredRule.asset || "").toUpperCase());
    const target = parseNumericValue(structuredRule.target);
    const comparator = String(structuredRule.comparator || "");
    if (asset && target !== null && ["gte", "lte", "eq"].includes(comparator)) {
      return { ...asset, comparator, target, structuredRule };
    }
  }
  const text = oracleTextForMarket(market);
  const hasPriceContext =
    /\b(price|spot|traded?|trade|close|closing|open|usd|usdt|btc\/usd|eth\/usd|btc\/usdt|eth\/usdt)\b/i.test(text) ||
    /\/usd[t]?\b/i.test(text);
  if (!hasPriceContext) return null;
  const asset = CRYPTO_ORACLE_ASSETS.find((candidate) => candidate.names.some((name) => hasExactMarketTerm(text, name)));
  const condition = detectComparatorTarget(text);
  if (!asset || !condition) return null;
  return { ...asset, ...condition };
}

const MACRO_ORACLE_ASSETS = [
  { symbol: "GOLD", names: ["gold", "xau", "gc=f"], yahoo: "GC=F", label: "Gold futures", unit: "USD/oz" },
  { symbol: "DXY", names: ["dxy", "dollar index", "us dollar index"], yahoo: "DX-Y.NYB", label: "US Dollar Index", unit: "index points" }
];

function detectMacroOracleMarket(market) {
  const structuredRule = structuredRuleForMarket(market);
  if (structuredRule?.kind === "macro-price") {
    const asset = MACRO_ORACLE_ASSETS.find((candidate) => candidate.symbol === String(structuredRule.asset || "").toUpperCase());
    const target = parseNumericValue(structuredRule.target);
    const comparator = String(structuredRule.comparator || "");
    if (asset && target !== null && ["gte", "lte", "eq"].includes(comparator)) {
      return { ...asset, comparator, target, structuredRule };
    }
  }
  const text = oracleTextForMarket(market);
  const asset = MACRO_ORACLE_ASSETS.find((candidate) => candidate.names.some((name) => hasExactMarketTerm(text, name)));
  const condition = detectComparatorTarget(text);
  if (!asset || !condition) return null;
  return { ...asset, ...condition };
}

function detectHealthOracleMarket(market) {
  const structuredRule = structuredRuleForMarket(market);
  if (structuredRule?.kind === "status-health" && cleanUrl(structuredRule.primarySource)) {
    return { url: cleanUrl(structuredRule.primarySource), structuredRule };
  }
  const text = oracleTextForMarket(market);
  const urls = marketSourceUrls(market);
  const explicitHealthUrl = urls.find((url) => /\/health(?:\?|$|\/)/i.test(url)) || urls.find((url) => /api\./i.test(url));
  if (explicitHealthUrl) return { url: explicitHealthUrl };
  if (text.includes("aurapredict") && text.includes("health")) return { url: "https://api.aurapredict.xyz/health" };
  return null;
}

function detectStatusOracleMarket(market) {
  const text = oracleTextForMarket(market);
  if (text.includes("github") && text.includes("status")) {
    return {
      provider: "GitHub Status",
      url: "https://www.githubstatus.com/api/v2/summary.json",
      sourceUrl: "https://www.githubstatus.com/",
      supportsHistorical: false
    };
  }
  if (text.includes("openai") && text.includes("status")) {
    return {
      provider: "OpenAI Status",
      url: "https://status.openai.com/api/v2/summary.json",
      sourceUrl: "https://status.openai.com/",
      supportsHistorical: false
    };
  }
  return null;
}

function hasByDeadlineLanguage(text) {
  return /\b(by|before|no later than|within)\b/i.test(String(text || ""));
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ORACLE_HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "AuraPredictOracle/1.0",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const contentType = String(response.headers.get("content-type") || "");
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function baseOracleProposal(market, adapter) {
  return {
    id: `${market.id}-${adapter}-${Date.now()}`,
    version: 1,
    marketId: market.id,
    adapter,
    status: "needs_review",
    outcome: "NEEDS_REVIEW",
    outcomeValue: Outcome.Unresolved,
    confidence: 0,
    observedValue: "",
    comparator: "",
    targetValue: "",
    observedAt: nowIso(),
    sourceUrls: marketSourceUrls(market),
    summary: "",
    checks: [],
    generatedAt: nowIso(),
    dataHash: ZERO_HASH
  };
}

function finalizeOracleProposal(proposal) {
  const outcome = outcomeName(proposal.outcome);
  proposal.outcome = outcome === "INSUFFICIENT_EVIDENCE" ? "NEEDS_REVIEW" : outcome;
  proposal.outcomeValue = outcomeValue(proposal.outcome);
  proposal.status = proposal.outcomeValue === Outcome.Unresolved ? proposal.status || "needs_review" : "ready";
  proposal.dataHash = receiptHashFor(proposal);
  oracleState()[String(proposal.marketId)] = proposal;
  return proposal;
}

async function buildCancelOracleProposal(market) {
  const proposal = baseOracleProposal(market, "liquidity-rule");
  const yesPool = toBigint(market.yesPool);
  const noPool = toBigint(market.noPool);
  proposal.outcome = "CANCEL";
  proposal.confidence = 100;
  proposal.observedValue = `YES pool ${formatUnits(yesPool, marketAssetDecimals(market))} / NO pool ${formatUnits(noPool, marketAssetDecimals(market))} ${market.settlementSymbol || "USDC"}`;
  proposal.summary =
    yesPool === 0n && noPool === 0n
      ? "No positions were placed. The fair contract path is Cancel to release the creator bond."
      : "Only one outcome has funded positions. YES/NO settlement is disabled; use Cancel to refund the funded side.";
  proposal.checks = ["YES/NO resolution requires funded positions on both outcomes.", "Cancel/refund avoids awarding a side with no opposing pool."];
  return finalizeOracleProposal(proposal);
}

async function buildCryptoOracleProposal(market, config) {
  const proposal = baseOracleProposal(market, "crypto-price");
  proposal.comparator = config.comparator;
  proposal.targetValue = String(config.target);
  proposal.sourceUrls = [
    `https://www.binance.com/en/trade/${config.binance.replace("USDT", "_USDT")}`,
    `https://api.binance.com/api/v3/klines?symbol=${config.binance}&interval=1m`,
    `https://www.coingecko.com/en/coins/${config.coingecko}`
  ];

  const resolutionTime = marketResolutionTime(market);
  const now = Math.floor(Date.now() / 1000);
  if (now < resolutionTime) {
    proposal.status = "not_ready";
    proposal.summary = "Oracle cannot evaluate this market before the resolution timestamp.";
    return finalizeOracleProposal(proposal);
  }

  const startMs = resolutionTime * 1000;
  const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(config.binance)}&interval=1m&startTime=${startMs}&endTime=${startMs + 60_000}&limit=1`;
  try {
    const { response, body } = await fetchJsonWithTimeout(binanceUrl);
    if (response.ok && Array.isArray(body) && body[0]) {
      const row = body[0];
      const observed = Number(row[4]);
      if (Number.isFinite(observed)) {
        const matched = compareObservedValue(observed, config.comparator, config.target);
        proposal.outcome = matched ? "YES" : "NO";
        proposal.confidence = 92;
        proposal.observedValue = `${config.symbol}/USDT close ${observed}`;
        proposal.observedAt = new Date(Number(row[0])).toISOString();
        proposal.summary = `${config.symbol}/USDT Binance 1-minute close was ${observed}. Rule target is ${config.comparator.toUpperCase()} ${config.target}.`;
        proposal.checks = ["Binance 1-minute kline matched the requested resolution minute.", "If the market requires another source, review manually before final settlement."];
        return finalizeOracleProposal(proposal);
      }
    }
  } catch (error) {
    proposal.checks.push(`Binance lookup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (Math.abs(now - resolutionTime) <= 10 * 60) {
    try {
      const coinGeckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(config.coingecko)}&vs_currencies=usd`;
      const { response, body } = await fetchJsonWithTimeout(coinGeckoUrl);
      const observed = Number(body?.[config.coingecko]?.usd);
      if (response.ok && Number.isFinite(observed)) {
        const matched = compareObservedValue(observed, config.comparator, config.target);
        proposal.outcome = matched ? "YES" : "NO";
        proposal.confidence = 65;
        proposal.observedValue = `${config.symbol}/USD current ${observed}`;
        proposal.observedAt = nowIso();
        proposal.summary = `Binance minute data was unavailable, so the oracle used a near-time CoinGecko spot price of ${observed}.`;
        proposal.checks.push("CoinGecko simple price is near-time, not exact-minute historical data.");
        return finalizeOracleProposal(proposal);
      }
    } catch (error) {
      proposal.checks.push(`CoinGecko fallback failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  proposal.status = "needs_review";
  proposal.summary = "Oracle could not retrieve an exact price for the requested timestamp. Send this market to manual review.";
  return finalizeOracleProposal(proposal);
}

async function buildMacroOracleProposal(market, config) {
  const proposal = baseOracleProposal(market, "macro-yahoo-chart");
  proposal.comparator = config.comparator;
  proposal.targetValue = String(config.target);
  proposal.sourceUrls = [`https://finance.yahoo.com/quote/${encodeURIComponent(config.yahoo)}`];

  const resolutionTime = marketResolutionTime(market);
  const now = Math.floor(Date.now() / 1000);
  if (now < resolutionTime) {
    proposal.status = "not_ready";
    proposal.summary = "Oracle cannot evaluate this market before the resolution timestamp.";
    return finalizeOracleProposal(proposal);
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.yahoo)}?period1=${Math.max(0, resolutionTime - 600)}&period2=${resolutionTime + 900}&interval=1m`;
  try {
    const { response, body } = await fetchJsonWithTimeout(yahooUrl);
    const result = body?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    timestamps.forEach((timestamp, index) => {
      const price = Number(closes[index]);
      const distance = Math.abs(Number(timestamp) - resolutionTime);
      if (Number.isFinite(price) && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (response.ok && bestIndex >= 0 && bestDistance <= 15 * 60) {
      const observed = Number(closes[bestIndex]);
      const matched = compareObservedValue(observed, config.comparator, config.target);
      proposal.outcome = matched ? "YES" : "NO";
      proposal.confidence = bestDistance <= 90 ? 78 : 68;
      proposal.observedValue = `${config.label} ${observed} ${config.unit}`;
      proposal.observedAt = new Date(Number(timestamps[bestIndex]) * 1000).toISOString();
      proposal.summary = `${config.label} was ${observed} ${config.unit} near the requested timestamp. Rule target is ${config.comparator.toUpperCase()} ${config.target}.`;
      proposal.checks = ["Yahoo chart data is used as an offchain proposal source.", "Review manually if the market specified a different primary source."];
      return finalizeOracleProposal(proposal);
    }
  } catch (error) {
    proposal.checks.push(`Yahoo chart lookup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  proposal.status = "needs_review";
  proposal.summary = `${config.label} data was not available with enough timestamp precision. Manual review is required.`;
  return finalizeOracleProposal(proposal);
}

async function buildHealthOracleProposal(market, config) {
  const proposal = baseOracleProposal(market, "status-health");
  proposal.sourceUrls = [config.url];
  const text = oracleTextForMarket(market);

  try {
    const { response, body } = await fetchJsonWithTimeout(config.url);
    const wantsOkTrue = /ok["'\s:]*true|ok\s+true|return\s+ok/i.test(text);
    const wantsHttpOk = /200|http\s+ok|status\s+ok/i.test(text);
    const jsonOk = typeof body === "object" && body !== null && body.ok === true;
    const matched = wantsOkTrue ? response.ok && jsonOk : wantsHttpOk ? response.ok : response.ok && (jsonOk || !wantsOkTrue);
    proposal.outcome = matched ? "YES" : "NO";
    proposal.confidence = wantsOkTrue || wantsHttpOk ? 96 : 88;
    proposal.observedValue = `HTTP ${response.status}${typeof body === "object" && body !== null ? `, ok=${String(body.ok)}` : ""}`;
    proposal.observedAt = nowIso();
    proposal.summary = `${sourceHostLabel(config.url)} returned ${proposal.observedValue}.`;
    proposal.checks = ["Health/API status can be checked automatically.", "If the rule requires a historical window, review the endpoint logs manually."];
    return finalizeOracleProposal(proposal);
  } catch (error) {
    proposal.status = "needs_review";
    proposal.summary = `Oracle could not reach ${config.url}: ${error instanceof Error ? error.message : String(error)}`;
    return finalizeOracleProposal(proposal);
  }
}

async function buildStatusPageOracleProposal(market, config) {
  const proposal = baseOracleProposal(market, "status-page");
  proposal.sourceUrls = [config.sourceUrl, config.url];
  const text = oracleTextForMarket(market);

  try {
    const { response, body } = await fetchJsonWithTimeout(config.url);
    const incidents = Array.isArray(body?.incidents) ? body.incidents : [];
    const activeMajor = incidents.filter((incident) => String(incident.impact || "").toLowerCase() === "major" && String(incident.status || "").toLowerCase() !== "resolved");
    if (hasByDeadlineLanguage(text) && !text.includes("currently")) {
      proposal.status = "needs_review";
      proposal.confidence = 40;
      proposal.observedValue = `${incidents.length} current/recent incident rows`;
      proposal.summary = `${config.provider} summary API does not provide a complete historical by-deadline record. Use this as a lead, not final proof.`;
      proposal.checks = activeMajor.map((incident) => `${incident.name || "Incident"} (${incident.status || "unknown"})`).slice(0, 4);
      return finalizeOracleProposal(proposal);
    }

    proposal.outcome = activeMajor.length > 0 ? "YES" : "NO";
    proposal.confidence = response.ok ? 86 : 55;
    proposal.observedValue = `${activeMajor.length} active major incident(s)`;
    proposal.observedAt = nowIso();
    proposal.summary = `${config.provider} currently reports ${proposal.observedValue}.`;
    proposal.checks = activeMajor.map((incident) => `${incident.name || "Incident"} (${incident.status || "unknown"})`).slice(0, 4);
    if (proposal.checks.length === 0) proposal.checks = ["No active major incident found in the public status summary."];
    return finalizeOracleProposal(proposal);
  } catch (error) {
    proposal.status = "needs_review";
    proposal.summary = `Oracle could not read ${config.provider}: ${error instanceof Error ? error.message : String(error)}`;
    return finalizeOracleProposal(proposal);
  }
}

async function buildUnsupportedOracleProposal(market, adapter, summary) {
  const proposal = baseOracleProposal(market, adapter);
  proposal.status = "unsupported";
  proposal.confidence = 0;
  proposal.summary = summary;
  proposal.checks = ["Use Aura Agent and authority/committee review for this market type."];
  return finalizeOracleProposal(proposal);
}

function oracleEvidenceRowsForMarket(marketId) {
  const proposal = oracleState()[String(marketId)];
  if (!proposal || !["ready", "proposed"].includes(String(proposal.status || ""))) return [];
  const outcome = outcomeName(proposal.outcome || proposal.outcomeValue);
  if (!["YES", "NO", "CANCEL"].includes(outcome)) return [];
  const sourceUrls = Array.isArray(proposal.sourceUrls) ? proposal.sourceUrls.filter(Boolean) : [];
  const notes = [
    `Objective Oracle adapter ${proposal.adapter || "unknown"} returned ${outcome}.`,
    proposal.summary,
    proposal.observedValue ? `Observed value: ${proposal.observedValue}.` : "",
    proposal.comparator && proposal.targetValue
      ? `Rule check: observed value must be ${String(proposal.comparator).toUpperCase()} ${proposal.targetValue}; oracle outcome is ${outcome}.`
      : "",
    typeof proposal.confidence === "number" ? `Oracle confidence: ${proposal.confidence}%.` : "",
    Array.isArray(proposal.checks) && proposal.checks.length > 0 ? `Checks: ${proposal.checks.join(" / ")}` : "",
    proposal.dataHash && proposal.dataHash !== ZERO_HASH ? `Data hash: ${proposal.dataHash}.` : ""
  ].filter(Boolean).join(" ");
  return [
    {
      id: `oracle-${proposal.id || marketId}`,
      marketId,
      title: `Objective Oracle proposal: ${outcome}`,
      url: sourceUrls[0] || "",
      notes,
      createdAt: proposal.generatedAt || nowIso()
    }
  ];
}

async function buildOracleProposal(marketId, options = {}) {
  const market = state.markets[String(marketId)];
  if (!market) throw new Error("Market not found.");
  const now = Math.floor(Date.now() / 1000);
  if (market.outcome !== Outcome.Unresolved && !options.force) {
    return buildUnsupportedOracleProposal(market, "read-only", "Market is already finalized. Oracle proposal is read-only.");
  }
  if (marketResolutionTime(market) > now && !options.force) {
    const proposal = baseOracleProposal(market, "not-ready");
    proposal.status = "not_ready";
    proposal.summary = "Oracle proposal is available after the market resolution time.";
    return finalizeOracleProposal(proposal);
  }
  if (toBigint(market.yesPool) === 0n || toBigint(market.noPool) === 0n) {
    return buildCancelOracleProposal(market);
  }

  const healthConfig = detectHealthOracleMarket(market);
  if (healthConfig) return buildHealthOracleProposal(market, healthConfig);

  const cryptoConfig = detectCryptoOracleMarket(market);
  if (cryptoConfig) return buildCryptoOracleProposal(market, cryptoConfig);

  const macroConfig = detectMacroOracleMarket(market);
  if (macroConfig) return buildMacroOracleProposal(market, macroConfig);

  const statusConfig = detectStatusOracleMarket(market);
  if (statusConfig) return buildStatusPageOracleProposal(market, statusConfig);

  if (String(market.category || "").toLowerCase() === "sports") {
    return buildUnsupportedOracleProposal(
      market,
      "sports-manual",
      "Sports adapter is not enabled yet. Use the official league/source link and authority review."
    );
  }

  return buildUnsupportedOracleProposal(
    market,
    "manual-review",
    "No deterministic oracle adapter matched this market. Use Aura Agent, evidence, and authority/committee review."
  );
}

function signerCanProposeMarket(market) {
  if (!hasResolverSigner()) return { ok: false, reason: resolverMissingReason() };
  const signer = resolverSignerAddress.toLowerCase();
  const owner = String(state.owner || "").toLowerCase();
  const marketAuthority = String(market.authority || "").toLowerCase();
  const resolver = String(market.resolver || "").toLowerCase();
  const adapter = String(market.resolutionAdapter || "").toLowerCase();
  const isAuthority = signer === owner || (marketAuthority && marketAuthority !== ZERO_ADDRESS.toLowerCase() && signer === marketAuthority);
  const mode = Number(market.resolutionMode || 0);

  if (mode === 3) {
    if (isAuthority || (adapter && adapter !== ZERO_ADDRESS.toLowerCase() && signer === adapter)) return { ok: true };
    return { ok: false, reason: "Resolver signer is not the market authority or configured adapter." };
  }

  if (mode === 2) {
    if (isAuthority) return { ok: true };
    return { ok: false, reason: "This market requires authority-only resolution." };
  }

  if (signer === resolver || isAuthority) return { ok: true };
  return { ok: false, reason: "Resolver signer is not the market resolver or authority." };
}

function oracleAutoProposeDecision(proposal, market) {
  if (!ORACLE_AUTO_PROPOSE) return { ok: false, reason: "AURA_ORACLE_AUTO_PROPOSE is not enabled." };
  if (!hasResolverSigner()) return { ok: false, reason: resolverMissingReason() };
  if (!proposal || proposal.status !== "ready") return { ok: false, reason: "Oracle proposal is not ready." };
  if (!market) return { ok: false, reason: "Market not found." };
  if (market.outcome !== Outcome.Unresolved) return { ok: false, reason: "Market is already finalized." };
  if (Number(market.proposedAt || 0) > 0) return { ok: false, reason: "Market already has a proposal." };
  if (marketResolutionTime(market) > Math.floor(Date.now() / 1000)) return { ok: false, reason: "Resolution time has not passed." };
  if (!ORACLE_AUTO_PROPOSE_ADAPTERS.has(String(proposal.adapter || ""))) {
    return { ok: false, reason: `Oracle adapter ${proposal.adapter || "unknown"} is not enabled for auto-propose.` };
  }

  const outcome = outcomeValue(proposal.outcome || proposal.outcomeValue);
  if (outcome === Outcome.Unresolved) return { ok: false, reason: "Oracle outcome is unresolved." };
  const confidence = Number(proposal.confidence || 0);
  if (!Number.isFinite(confidence) || confidence < ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE) {
    return { ok: false, reason: `Oracle confidence ${confidence}% is below ${ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE}%.` };
  }

  const yesPool = toBigint(market.yesPool);
  const noPool = toBigint(market.noPool);
  if ((outcome === Outcome.Yes || outcome === Outcome.No) && (yesPool === 0n || noPool === 0n)) {
    return { ok: false, reason: "YES/NO auto-propose requires funded positions on both outcomes." };
  }
  if (outcome === Outcome.Canceled && proposal.adapter !== "liquidity-rule") {
    return { ok: false, reason: "Only liquidity-rule can auto-propose Cancel." };
  }

  const signerCheck = signerCanProposeMarket(market);
  if (!signerCheck.ok) return signerCheck;
  return { ok: true };
}

async function proposeOracleOnchain(proposal) {
  const market = state.markets[String(proposal?.marketId)];
  const decision = oracleAutoProposeDecision(proposal, market);
  if (!decision.ok) {
    if (proposal) {
      proposal.autoProposeSkipped = decision.reason;
      oracleState()[String(proposal.marketId)] = proposal;
      await saveState();
    }
    return { skipped: decision.reason };
  }

  const outcome = outcomeValue(proposal.outcome || proposal.outcomeValue);
  const yesPool = toBigint(market.yesPool);
  const noPool = toBigint(market.noPool);
  const noLiquidity = yesPool === 0n && noPool === 0n;
  const receiptHash = isBytes32(proposal.dataHash) ? proposal.dataHash : ZERO_HASH;
  const evidenceRows = oracleEvidenceRowsForMarket(proposal.marketId);
  const evidenceHash = keccak256(stringToHex(JSON.stringify(evidenceRows.length > 0 ? evidenceRows : [proposal])));
  const functionName =
    isStablecoinContract() && noLiquidity && outcome === Outcome.Canceled
      ? "cancelEmptyMarket"
      : outcome === Outcome.Canceled
        ? "cancel"
        : "resolve";
  const args = isV4Contract() || isV3Contract()
    ? functionName === "cancelEmptyMarket"
      ? [BigInt(proposal.marketId)]
      : functionName === "cancel"
        ? [BigInt(proposal.marketId), evidenceHash, receiptHash]
        : [BigInt(proposal.marketId), outcome, evidenceHash, receiptHash]
    : functionName === "cancel"
      ? [BigInt(proposal.marketId)]
      : [BigInt(proposal.marketId), outcome];

  try {
    const txHash = await writeResolverContract(functionName, args);
    proposal.txHash = txHash;
    proposal.status = "proposed";
    proposal.autoProposed = true;
    proposal.autoProposedAt = nowIso();
    proposal.autoProposedBy = resolverSignerAddress;
    proposal.autoProposeSkipped = "";
    proposal.onchainFunction = functionName;
    const proposedAt = Math.floor(Date.now() / 1000);
    market.proposedOutcome = outcome;
    market.proposedAt = proposedAt;
    market.proposedBy = resolverSignerAddress;
    market.proposalEvidenceHash = evidenceHash;
    market.aiReceiptHash = receiptHash;
    market.disputeDeadline = functionName === "cancelEmptyMarket" ? 0 : proposedAt + Number(market.termsDisputeWindow || state.disputeWindow || 0);
    market.updatedTxHash = txHash;
    oracleState()[String(proposal.marketId)] = proposal;
    await saveState();
    return { txHash, functionName };
  } catch (error) {
    proposal.autoProposeSkipped = "";
    proposal.autoProposeError = error instanceof Error ? error.message : String(error);
    proposal.autoProposeFailedAt = nowIso();
    oracleState()[String(proposal.marketId)] = proposal;
    await saveState();
    return { error: proposal.autoProposeError };
  }
}

async function runAutoOracleSweep() {
  const now = Math.floor(Date.now() / 1000);
  const candidates = Object.values(state.markets)
    .filter((market) => market.outcome === Outcome.Unresolved)
    .filter((market) => marketResolutionTime(market) > 0 && marketResolutionTime(market) <= now)
    .filter((market) => Number(market.proposedAt || 0) === 0)
    .filter((market) => {
      const proposal = oracleState()[String(market.id)];
      if (!proposal) return true;
      if (proposal.autoProposeError) return false;
      return ["not_ready", "ready", "error"].includes(String(proposal.status || ""));
    })
    .slice(0, 5);

  for (const market of candidates) {
    try {
      const existing = oracleState()[String(market.id)];
      const proposal =
        existing && existing.status === "ready" && outcomeValue(existing.outcome || existing.outcomeValue) !== Outcome.Unresolved
          ? existing
          : await buildOracleProposal(market.id);
      await proposeOracleOnchain(proposal);
    } catch (error) {
      oracleState()[String(market.id)] = {
        ...(oracleState()[String(market.id)] || {}),
        marketId: market.id,
        adapter: "error",
        status: "error",
        outcome: "NEEDS_REVIEW",
        outcomeValue: Outcome.Unresolved,
        confidence: 0,
        generatedAt: nowIso(),
        summary: error instanceof Error ? error.message : String(error),
        sourceUrls: marketSourceUrls(market),
        checks: []
      };
    }
  }
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("AI returned an empty response.");
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response did not contain JSON.");
    return JSON.parse(match[0]);
  }
}

function configuredGeminiKeys() {
  const unique = new Set();
  for (const key of GEMINI_API_KEYS) unique.add(key);
  if (GEMINI_API_KEY) unique.add(GEMINI_API_KEY);
  return [...unique];
}

function nextGeminiKey() {
  const keys = configuredGeminiKeys();
  if (keys.length === 0) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const index = (geminiKeyState.cursor + attempt) % keys.length;
    const key = keys[index];
    const cooldownUntil = geminiKeyState.cooldownUntilByKey.get(key) || 0;
    if (cooldownUntil <= now) {
      geminiKeyState.cursor = (index + 1) % keys.length;
      return key;
    }
  }
  const fallbackIndex = geminiKeyState.cursor % keys.length;
  geminiKeyState.cursor = (fallbackIndex + 1) % keys.length;
  return keys[fallbackIndex];
}

class AiProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AiProviderError";
    this.provider = options.provider || "unknown";
    this.status = options.status || 0;
    this.retryable = Boolean(options.retryable);
  }
}

function configuredProviders() {
  const providers = [];
  const hasGemini = configuredGeminiKeys().length > 0;
  const requested = AI_PROVIDER || (hasGemini ? "gemini" : OPENAI_API_KEY ? "openai" : "");
  const fallback = AI_FALLBACK_PROVIDER;
  if (requested) providers.push(requested);
  if (fallback && fallback !== requested) providers.push(fallback);
  if (providers.length === 1 && providers[0] === "gemini" && OPENAI_API_KEY) providers.push("openai");
  return providers;
}

function providerModel(provider) {
  if (provider === "openai") return OPENAI_MODEL;
  return AI_MODEL;
}

async function callGeminiJson(systemInstruction, prompt) {
  const apiKey = nextGeminiKey();
  if (!apiKey) {
    throw new AiProviderError("Gemini is not configured. Set GEMINI_API_KEY or GEMINI_API_KEYS.", {
      provider: "gemini",
      retryable: false
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(AI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      geminiKeyState.cooldownUntilByKey.set(apiKey, Date.now() + GEMINI_RATE_LIMIT_COOLDOWN_MS);
    }
    throw new AiProviderError(body?.error?.message || `Gemini request failed with status ${response.status}.`, {
      provider: "gemini",
      status: response.status,
      retryable: response.status === 429 || response.status >= 500
    });
  }

  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  return {
    json: extractJsonObject(text),
    provider: "gemini",
    model: AI_MODEL
  };
}

async function callOpenAiJson(systemInstruction, prompt) {
  if (!OPENAI_API_KEY) {
    throw new AiProviderError("OpenAI is not configured. Set OPENAI_API_KEY.", {
      provider: "openai",
      retryable: false
    });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `OpenAI request failed with status ${response.status}.`;
    throw new AiProviderError(message, {
      provider: "openai",
      status: response.status,
      retryable: response.status === 429 || response.status >= 500
    });
  }

  const text = body?.choices?.[0]?.message?.content || "";
  return {
    json: extractJsonObject(text),
    provider: "openai",
    model: OPENAI_MODEL
  };
}

async function callAiJson(systemInstruction, prompt) {
  const providers = configuredProviders();
  if (providers.length === 0) {
    throw new Error(
      "Aura Agent is not configured. Set AI_PROVIDER=gemini with GEMINI_API_KEY or GEMINI_API_KEYS, or AI_PROVIDER=openai with OPENAI_API_KEY."
    );
  }

  let lastError = null;
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    try {
      if (provider === "gemini") return await callGeminiJson(systemInstruction, prompt);
      if (provider === "openai") return await callOpenAiJson(systemInstruction, prompt);
      throw new AiProviderError(`Unsupported AI provider: ${provider}`, { provider, retryable: false });
    } catch (error) {
      lastError = error;
      const retryable = error instanceof AiProviderError ? error.retryable : false;
      if (!retryable || index === providers.length - 1) continue;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function marketDraftPrompt(body) {
  const idea = cleanText(body.idea || body.question, 900);
  const category = cleanText(body.category, 40) || "Other";
  const closeTime = cleanText(body.closeTime, 80);
  const similarMarkets = findSimilarMarkets(idea, category);
  const now = nowIso();
  return {
    idea,
    similarMarkets,
    prompt: [
      `Current UTC time: ${now}`,
      `User market idea: ${idea}`,
      `Preferred category: ${category}`,
      `Preferred close time: ${closeTime || "not provided"}`,
      `Similar active/recent markets prefiltered by indexer: ${JSON.stringify(similarMarkets)}`,
      "Return JSON only with:",
      "{",
      '  "question": "clear binary question, 8-160 chars",',
      '  "category": "Crypto|Macro|Sports|Politics|Arc|AI|Other",',
      '  "closeTime": "YYYY-MM-DDTHH:mm",',
      '  "resolutionCriteria": "specific rules for YES/NO/Cancel",',
      '  "sources": ["credible source name or URL", "..."],',
      '  "clarityScore": 0-100,',
      '  "duplicateRisk": "LOW|MEDIUM|HIGH",',
      '  "riskFlags": ["short issue labels"],',
      '  "creatorNote": "one short warning or guidance sentence"',
      "}",
      "Use UTC. Avoid subjective criteria. If the market is ambiguous, rewrite it to be measurable.",
      "Only set duplicateRisk MEDIUM or HIGH when a similar market has the same concrete subject/entity and substantially overlapping outcome window.",
      "Do not raise duplicateRisk just because two markets share a metric such as 10K users, active addresses, volume, or the same category.",
      "Broad-scope markets such as 'any Arc dApp' are not duplicates of a named project market unless the named project already satisfies the same exact broad market outcome."
    ].join("\n")
  };
}

function resolutionPrompt(body) {
  const marketId = Number(body.marketId);
  const market = Number.isInteger(marketId) ? state.markets[String(marketId)] : null;
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 8) : [];
  const criteria = cleanText(body.resolutionCriteria, 1000);
  const question = cleanText(body.question || market?.question, 260);
  return [
    `Current UTC time: ${nowIso()}`,
    `Market id: ${Number.isInteger(marketId) ? marketId : "unknown"}`,
    `Question: ${question}`,
    `Category: ${cleanText(body.category || market?.category, 40)}`,
    `Trading close unix: ${body.closeTime || market?.closeTime || "unknown"}`,
    `Resolution time unix: ${body.resolutionTime || marketResolutionTime(market) || "unknown"}`,
    `Resolution criteria: ${criteria || "not provided"}`,
    `Current pools: YES ${market?.yesPool || "unknown"} / NO ${market?.noPool || "unknown"}`,
    `Evidence JSON: ${JSON.stringify(evidence)}`,
    "Return JSON only with:",
    "{",
    '  "suggestedOutcome": "YES|NO|CANCEL|INSUFFICIENT_EVIDENCE",',
    '  "confidence": 0-100,',
    '  "summary": "short evidence-based explanation",',
    '  "evidence": [{"title":"...", "url":"...", "finding":"..."}],',
    '  "disputeRisks": ["..."],',
    '  "resolverAction": "what the creator/admin should do next"',
    "}",
    "Do not invent facts.",
    "For deadline questions phrased like 'Will X ... by time T?', if current time is already past T and there is no credible evidence that X happened, lean NO (low/medium confidence) instead of INSUFFICIENT_EVIDENCE.",
    "Use INSUFFICIENT_EVIDENCE only when rules are ambiguous, time has not passed, or evidence quality is too weak/conflicting."
  ].join("\n");
}

function resolutionReviewerPrompt(market, evidenceRows, role) {
  const structuredRule = structuredRuleForMarket(market);
  const evidence = evidenceRows.map((item) => ({
    title: cleanText(item.title, 120),
    url: cleanUrl(item.url),
    notes: cleanText(item.notes || item.finding, 700),
    createdAt: item.createdAt
  }));
  const criteria = cleanText(stripRuleMetadata(market.resolutionRule || market.resolutionCriteria || ""), 1000);
  return [
    `Current UTC time: ${nowIso()}`,
    `Reviewer role: ${role}`,
    `Market id: ${market.id}`,
    `Question: ${cleanText(market.question, 260)}`,
    `Category: ${cleanText(market.category, 40)}`,
    `Trading close unix: ${market.closeTime}`,
    `Resolution time unix: ${marketResolutionTime(market)}`,
    `Resolution criteria: ${criteria || "not provided"}`,
    `Structured resolution rule JSON: ${structuredRule ? JSON.stringify(structuredRule) : "not provided"}`,
    `Current pools: YES ${formatUnits(toBigint(market.yesPool), marketAssetDecimals(market))} ${market.settlementSymbol || "USDC"} / NO ${formatUnits(toBigint(market.noPool), marketAssetDecimals(market))} ${market.settlementSymbol || "USDC"}`,
    `Evidence JSON: ${JSON.stringify(evidence)}`,
    "Return JSON only with:",
    "{",
    '  "outcome": "YES|NO|CANCEL|INSUFFICIENT_EVIDENCE",',
    '  "confidence": 0-100,',
    '  "reasoning": "short evidence-based explanation",',
    '  "keyEvidence": [{"title":"...", "url":"...", "finding":"..."}],',
    '  "risks": ["specific dispute or ambiguity risk"]',
    "}",
    "Use only the supplied evidence, structured resolution rule, and public facts that can be verified from URLs in the evidence list.",
    "If the evidence contains an Objective Oracle proposal with YES, NO, or CANCEL, treat it as a deterministic source check unless it conflicts with the market's primary source, timestamp, or rule.",
    "If the evidence contains an Objective source scan row, treat it as Aura's source router result. A qualifying item found supports YES; a no matching item found row supports NO for by-deadline publish, announce, blog, news, fixture, or schedule markets unless stronger contrary evidence is supplied.",
    "If an Objective source scan says matching items need timestamp review, do not invent a timestamp. Prefer INSUFFICIENT_EVIDENCE unless another evidence row proves the required time window.",
    "If an Objective source scan says no source URL is configured, return INSUFFICIENT_EVIDENCE and ask for an official source link.",
    "For numeric threshold markets, compare the observed value against the structured comparator and target. If the observed value is clearly above or below the target, return YES or NO; do not return INSUFFICIENT_EVIDENCE just because the result is unfavorable to YES.",
    "For health/status endpoint markets, an observed ok/major-incident value from the configured URL is enough to return YES or NO according to the rule.",
    "For deadline questions phrased like 'Will X ... by time T?', if T has passed and there is no credible evidence that X happened, prefer NO (with lower confidence) over INSUFFICIENT_EVIDENCE.",
    "If the evidence is not enough to decide confidently, return INSUFFICIENT_EVIDENCE.",
    "For price/date markets, require the source to match the metric and time window exactly."
  ].join("\n");
}

function looksLikeDeadlineEventQuestion(text) {
  const value = String(text || "").toLowerCase();
  if (!value.startsWith("will ")) return false;
  if (!/\bby\b|\bbefore\b|\bno later than\b/.test(value)) return false;
  return /\bannounce\b|\bdeclare\b|\blaunch\b|\brelease\b|\bhappen\b|\boccur\b|\bpublish\b|\bconfirm\b/.test(value);
}

function hasEvidenceContent(evidenceRows) {
  if (!Array.isArray(evidenceRows)) return false;
  return evidenceRows.some((item) => {
    if (isSetupEvidenceRow(item)) return false;
    return cleanText(item?.title, 160) || cleanUrl(item?.url) || cleanText(item?.notes || item?.finding, 300);
  });
}

function isSetupEvidenceRow(item) {
  const title = cleanText(item?.title, 160).toLowerCase();
  const notes = cleanText(item?.notes || item?.finding, 700).toLowerCase();
  const setupTitle = title === "resolution source" || title === "fallback source";
  const setupNote =
    notes.includes("use only if primary source is unavailable") ||
    (notes.includes("yes") && notes.includes("no") && notes.includes("cancel")) ||
    notes.includes("at exactly") ||
    notes.includes("resolution rule");
  return setupTitle || setupNote;
}

function normalizeResolutionReportWithHeuristic(body, reportJson) {
  const normalized = { ...(reportJson || {}) };
  const outcome = outcomeName(normalized.suggestedOutcome);
  if (outcome !== "INSUFFICIENT_EVIDENCE") return normalized;

  const closeTime = Number(body?.resolutionTime || body?.closeTime || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(closeTime) || closeTime <= 0 || now < closeTime) return normalized;

  const question = cleanText(body?.question, 300);
  const criteria = cleanText(body?.resolutionCriteria, 1000);
  const marketText = `${question} ${criteria}`.trim();
  if (!looksLikeDeadlineEventQuestion(marketText)) return normalized;

  const evidenceRows = Array.isArray(body?.evidence) ? body.evidence : [];
  if (hasEvidenceContent(evidenceRows)) return normalized;

  normalized.suggestedOutcome = "NO";
  normalized.confidence = Math.max(55, Math.min(70, Number(normalized.confidence || 0) || 0));
  normalized.summary =
    "Deadline has passed and no credible evidence was provided that the event happened. Based on 'by-time' rule semantics, the suggested outcome is NO.";
  normalized.disputeRisks = [
    "Low evidence depth: attach at least 1-2 reputable links proving no qualifying announcement was found by deadline."
  ];
  normalized.resolverAction =
    "Propose NO, then attach reputable source links (for example Reuters/AP/official account pages) showing no qualifying announcement by the deadline.";
  return normalized;
}

function consensusFromReviews(reviews) {
  const valid = reviews
    .map((review) => ({
      ...review,
      outcome: outcomeName(review.outcome || review.suggestedOutcome),
      confidence: Number(review.confidence || 0)
    }))
    .filter((review) => review.outcome !== "INSUFFICIENT_EVIDENCE");
  const counts = new Map();
  for (const review of valid) counts.set(review.outcome, (counts.get(review.outcome) || 0) + 1);
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!winner) return { outcome: "INSUFFICIENT_EVIDENCE", confidence: 0, agreed: 0, approved: false };
  const agreedReviews = valid.filter((review) => review.outcome === winner[0]);
  const confidence = Math.round(agreedReviews.reduce((sum, review) => sum + review.confidence, 0) / agreedReviews.length);
  return {
    outcome: winner[0],
    confidence,
    agreed: winner[1],
    approved: winner[1] >= RESOLUTION_CONSENSUS_COUNT && confidence >= RESOLUTION_MIN_CONFIDENCE
  };
}

async function attachSignedAuraAttestation(receipt) {
  if (!isV4Contract() || !attestationAccount || receipt.status !== "ready") return receipt;
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(receipt.receiptHash || ""))) return receipt;
  const suggestedOutcome = Number(receipt.proposedOutcomeValue || Outcome.Unresolved);
  if (![Outcome.Yes, Outcome.No, Outcome.Canceled].includes(suggestedOutcome)) return receipt;
  const payload = keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "bytes32" }
      ],
      [CONTRACT_ADDRESS, BigInt(ARC_CHAIN.id), BigInt(receipt.marketId), suggestedOutcome, receipt.receiptHash]
    )
  );
  receipt.attestationSigner = attestationAccount.address;
  receipt.attestation = await attestationAccount.signMessage({ message: { raw: payload } });
  return receipt;
}

async function buildResolutionReceipt(marketId, options = {}) {
  const market = state.markets[String(marketId)];
  if (!market) throw new Error("Market not found.");
  const now = Math.floor(Date.now() / 1000);
  if (marketResolutionTime(market) > now && !options.force) throw new Error("Market is not ready for resolution.");
  if (market.outcome !== Outcome.Unresolved && !options.force) throw new Error("Market is already resolved.");
  if (market.proposedAt > 0 && !options.force) throw new Error("Market already has a proposed outcome.");

  const social = socialState();
  const suppliedEvidenceRows = Array.isArray(options.evidence) && options.evidence.length > 0
    ? options.evidence.slice(0, 10)
    : (social.evidence[String(marketId)] || []).slice(0, 10);
  const automaticEvidenceRows = await gatherAutomaticEvidenceRows(market);
  const evidenceRows = [...oracleEvidenceRowsForMarket(marketId), ...automaticEvidenceRows, ...suppliedEvidenceRows].slice(0, 10);
  const roles = [
    "strict fact checker",
    "skeptical dispute reviewer",
    "market rules interpreter"
  ];
  const systemInstruction = [
    "You are one reviewer in AuraPredict's AI resolution committee.",
    "You do not control settlement by yourself.",
    "You must be conservative, cite evidence, and return INSUFFICIENT_EVIDENCE when facts are unclear.",
    "Return compact JSON only."
  ].join(" ");

  const reviews = [];
  for (const role of roles) {
    const review = await callAiJson(systemInstruction, resolutionReviewerPrompt(market, evidenceRows, role));
    reviews.push({
      ...review.json,
      provider: review.provider,
      model: review.model
    });
  }

  const consensus = consensusFromReviews(reviews);
  const reviewProviderSummary = Array.from(new Set(reviews.map((review) => `${review.provider}:${review.model}`))).join(", ");
  const receipt = {
    id: `${marketId}-${Date.now()}`,
    version: 1,
    marketId,
    question: market.question,
    category: market.category,
    closeTime: market.closeTime,
    resolutionTime: marketResolutionTime(market),
    generatedAt: nowIso(),
    provider: reviewProviderSummary || configuredProviders().join(","),
    model: providerModel(configuredProviders()[0] || "gemini"),
    minConfidence: RESOLUTION_MIN_CONFIDENCE,
    consensusCount: RESOLUTION_CONSENSUS_COUNT,
    consensus,
    reviews,
    evidence: evidenceRows,
    proposedOutcome: consensus.approved ? consensus.outcome : "INSUFFICIENT_EVIDENCE",
    proposedOutcomeValue: consensus.approved ? outcomeValue(consensus.outcome) : Outcome.Unresolved,
    status: consensus.approved ? "ready" : "needs_review",
    txHash: "",
    error: ""
  };
  receipt.receiptHash = receiptHashFor(receipt);
  await attachSignedAuraAttestation(receipt);
  resolutionState()[String(marketId)] = receipt;
  await saveState();
  return receipt;
}

async function proposeResolutionOnchain(receipt) {
  if (!RESOLUTION_AUTO_PROPOSE) return { skipped: "AURA_RESOLUTION_AUTO_PROPOSE is not enabled." };
  if (!hasResolverSigner()) return { skipped: resolverMissingReason() };
  if (receipt.status !== "ready" || receipt.proposedOutcomeValue === Outcome.Unresolved) {
    return { skipped: "Receipt is not approved for on-chain proposal." };
  }

  const market = state.markets[String(receipt.marketId)];
  if (!market) throw new Error("Market not found.");
  const signerCheck = signerCanProposeMarket(market);
  if (!signerCheck.ok) throw new Error(signerCheck.reason);

  const noLiquidity = toBigint(market.yesPool) === 0n && toBigint(market.noPool) === 0n;
  const receiptHash = isBytes32(receipt.receiptHash) ? receipt.receiptHash : ZERO_HASH;
  const evidenceHash = keccak256(stringToHex(JSON.stringify(receipt.evidence || [])));
  const functionName =
    isStablecoinContract() && noLiquidity
      ? "cancelEmptyMarket"
      : isV4Contract() && isSignature(receipt.attestation) && receipt.proposedOutcomeValue !== Outcome.Canceled
        ? "resolveWithAiAttestation"
      : receipt.proposedOutcomeValue === Outcome.Canceled
        ? "cancel"
        : "resolve";
  const args = isV4Contract()
    ? functionName === "cancelEmptyMarket"
      ? [BigInt(receipt.marketId)]
      : functionName === "resolveWithAiAttestation"
        ? [
            BigInt(receipt.marketId),
            receipt.proposedOutcomeValue,
            evidenceHash,
            receiptHash,
            receipt.proposedOutcomeValue,
            receipt.attestation
          ]
        : functionName === "cancel"
          ? [BigInt(receipt.marketId), evidenceHash, receiptHash]
          : [BigInt(receipt.marketId), receipt.proposedOutcomeValue, evidenceHash, receiptHash]
    : isV3Contract()
    ? functionName === "cancelEmptyMarket"
      ? [BigInt(receipt.marketId)]
      : functionName === "cancel"
        ? [BigInt(receipt.marketId), evidenceHash, receiptHash]
        : [BigInt(receipt.marketId), receipt.proposedOutcomeValue, evidenceHash, receiptHash]
    : functionName === "cancel"
      ? [BigInt(receipt.marketId)]
      : [BigInt(receipt.marketId), receipt.proposedOutcomeValue];
  const txHash = await writeResolverContract(functionName, args);
  receipt.txHash = txHash;
  receipt.status = "proposed";
  resolutionState()[String(receipt.marketId)] = receipt;
  await saveState();
  return { txHash };
}

async function runAutoResolutionSweep() {
  const now = Math.floor(Date.now() / 1000);
  const candidates = Object.values(state.markets)
    .filter((market) => market.outcome === Outcome.Unresolved)
    .filter((market) => marketResolutionTime(market) > 0 && marketResolutionTime(market) <= now)
    .filter((market) => Number(market.proposedAt || 0) === 0)
    .filter((market) => !state.resolutions?.[String(market.id)])
    .slice(0, 3);

  for (const market of candidates) {
    try {
      const receipt = await buildResolutionReceipt(market.id);
      await proposeResolutionOnchain(receipt);
    } catch (error) {
      resolutionState()[String(market.id)] = {
        ...(resolutionState()[String(market.id)] || {}),
        marketId: market.id,
        status: "error",
        generatedAt: nowIso(),
        error: error instanceof Error ? error.message : String(error)
      };
      await saveState();
    }
  }
}

async function syncRange(fromBlock, toBlock) {
  const logs = [];
  const abi = currentContractAbi();
  const eventNames = isV4Contract() ? V4_EVENT_NAMES : isV3Contract() ? V3_EVENT_NAMES : V2_EVENT_NAMES;
  for (const eventName of eventNames) {
    const eventLogs = await client.getContractEvents({
      address: CONTRACT_ADDRESS,
      abi,
      eventName,
      fromBlock,
      toBlock
    });
    logs.push(...eventLogs.map((log) => ({ ...log, eventName })));
  }

  logs.sort((a, b) => {
    const blockOrder = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
    if (blockOrder !== 0) return blockOrder;
    return Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
  });

  for (const log of logs) {
    await processEvent(log.eventName, log);
  }
}

async function hasContractCode(blockNumber) {
  const code = await client.getCode({ address: CONTRACT_ADDRESS, blockNumber });
  return Boolean(code && code !== "0x");
}

async function resolveStartBlock(latestBlock) {
  if (START_BLOCK > 0n) return START_BLOCK;
  if (toBigint(state.deploymentBlock) > 0n) return toBigint(state.deploymentBlock);
  if (!(await hasContractCode(latestBlock))) {
    throw new Error(`No contract code found at ${CONTRACT_ADDRESS} on Arc Testnet.`);
  }

  let low = 0n;
  let high = latestBlock;
  while (low < high) {
    const mid = (low + high) / 2n;
    if (await hasContractCode(mid)) high = mid;
    else low = mid + 1n;
  }

  state.deploymentBlock = low.toString();
  if (state.lastIndexedBlock === "0" && low > 0n) state.lastIndexedBlock = (low - 1n).toString();
  return low;
}

async function syncOnce() {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    if (!CONTRACT_ADDRESS || !isAddress(CONTRACT_ADDRESS)) {
      throw new Error("Missing AURA_INDEXER_CONTRACT_ADDRESS or VITE_PREDICTION_MARKET_ADDRESS.");
    }

    const latestBlock = await client.getBlockNumber();
    const startBlock = await resolveStartBlock(latestBlock);
    await detectContractVersion();
    let fromBlock = toBigint(state.lastIndexedBlock) > 0n ? toBigint(state.lastIndexedBlock) + 1n : startBlock;

    if (fromBlock <= latestBlock) {
      while (fromBlock <= latestBlock) {
        const toBlock = fromBlock + CHUNK_SIZE - 1n > latestBlock ? latestBlock : fromBlock + CHUNK_SIZE - 1n;
        await syncRange(fromBlock, toBlock);
        state.lastIndexedBlock = toBlock.toString();
        fromBlock = toBlock + 1n;
      }
    }

    await refreshContractState();
    computeStats();
    if (ORACLE_AUTO_RUN) {
      await runAutoOracleSweep();
    }
    if (RESOLUTION_AUTO_RUN) {
      await runAutoResolutionSweep();
    }
    state.updatedAt = nowIso();
    await saveState();
    return state;
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

function periodStartFor(value) {
  const now = Math.floor(Date.now() / 1000);
  if (value === "day" || value === "24h") return now - 24 * 60 * 60;
  if (value === "7d" || value === "week") return now - 7 * 24 * 60 * 60;
  if (value === "30d" || value === "month") return now - 30 * 24 * 60 * 60;
  return 0;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-aura-admin-token"
  });
  res.end(body);
}

function html(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-aura-admin-token"
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: "Not found" });
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-aura-admin-token"
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (url.pathname === "/" || url.pathname === "/health") {
      json(res, 200, {
        ok: Boolean(CONTRACT_ADDRESS && isAddress(CONTRACT_ADDRESS)),
        contractAddress: CONTRACT_ADDRESS,
        chainId: state.chainId,
        updatedAt: state.updatedAt,
        lastIndexedBlock: state.lastIndexedBlock,
        marketCount: state.marketCount
      });
      return;
    }

    if (url.pathname === "/api/sync") {
      void syncOnce();
      json(res, 202, { ok: true, status: "sync started" });
      return;
    }

    if (url.pathname === "/api/stats") {
      json(res, 200, {
        stats: state.stats,
        contract: {
          version: state.contractVersion,
          owner: state.owner,
          resolutionAuthority: state.resolutionAuthority,
          creatorBond: state.creatorBond,
          disputeBond: state.disputeBond,
          disputeWindow: state.disputeWindow,
          disputeGracePeriod: state.disputeGracePeriod,
          proposalGracePeriod: state.proposalGracePeriod,
          aiAttestationSigner: state.aiAttestationSigner,
          protocolFeeBps: state.protocolFeeBps,
          marketCreationFee: state.marketCreationFee,
          accumulatedProtocolFees: state.accumulatedProtocolFees
        },
        updatedAt: state.updatedAt,
        lastIndexedBlock: state.lastIndexedBlock
      });
      return;
    }

    if (url.pathname === "/api/activity") {
      const limit = Number(url.searchParams.get("limit") || 50);
      json(res, 200, { activities: state.trades.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, limit) });
      return;
    }

    if (segments[0] === "api" && segments[1] === "ai") {
      if (req.method === "GET" && segments[2] === "hot-markets") {
        const limit = Math.max(1, Math.min(24, Number(url.searchParams.get("limit") || 8)));
        json(res, 200, { markets: hotAiMarkets(limit), updatedAt: state.updatedAt || nowIso() });
        return;
      }

      if (req.method !== "POST") return notFound(res);
      const body = await readRequestBody(req);
      const systemInstruction = [
        "You are Aura Agent, an AI assistant for an Arc Testnet prediction market dapp.",
        "You help create clear binary markets and draft evidence-based resolution reports.",
        "You are not an oracle. You must avoid fabricating facts and must flag insufficient evidence.",
        "Always return valid compact JSON only."
      ].join(" ");

      if (segments[2] === "market-draft") {
        const { idea, similarMarkets, prompt } = marketDraftPrompt(body);
        if (idea.length < 4) return json(res, 400, { error: "Market idea is too short." });
        const draft = await callAiJson(systemInstruction, prompt);
        json(res, 200, {
          draft: {
            ...draft.json,
            duplicateRisk: draft.json?.duplicateRisk || duplicateRiskFor(similarMarkets),
            similarMarkets
          },
          provider: draft.provider,
          model: draft.model,
          updatedAt: nowIso()
        });
        return;
      }

      if (segments[2] === "resolution-report") {
        const marketId = Number(body.marketId);
        const storedMarket = Number.isInteger(marketId) ? state.markets[String(marketId)] : null;
        if (storedMarket && storedMarket.outcome !== Outcome.Unresolved) {
          json(res, 409, { error: "Market is finalized. Saved Aura analysis is read-only; new AI reviews are disabled." });
          return;
        }
        if (storedMarket && isV4Contract()) {
          const receipt = await buildResolutionReceipt(marketId, {
            force: false,
            evidence: Array.isArray(body.evidence) ? body.evidence : undefined
          });
          const leadingReview = receipt.reviews?.[0] || {};
          const report = {
            suggestedOutcome: receipt.consensus?.outcome || receipt.proposedOutcome,
            confidence: receipt.consensus?.confidence || 0,
            summary:
              leadingReview.reasoning ||
              "Aura reviewers could not provide a sufficient evidence-based recommendation.",
            evidence: receipt.evidence || [],
            disputeRisks: (receipt.reviews || []).flatMap((review) => review.risks || []).slice(0, 4),
            resolverAction:
              receipt.status === "ready"
                ? `Review the receipt and propose ${receipt.consensus.outcome}.`
                : "Add stronger evidence or send the result to authority review."
          };
          json(res, 200, { report, receipt, provider: receipt.provider, model: receipt.model, updatedAt: nowIso() });
          return;
        }
        const report = await callAiJson(systemInstruction, resolutionPrompt(body));
        const normalizedReport = normalizeResolutionReportWithHeuristic(body, report.json);
        json(res, 200, { report: normalizedReport, provider: report.provider, model: report.model, updatedAt: nowIso() });
        return;
      }

      return notFound(res);
    }

    if (segments[0] === "api" && segments[1] === "oracle-reputation") {
      if (req.method !== "GET") return notFound(res);
      json(res, 200, { reputation: oracleReputationSummary(), updatedAt: state.updatedAt || nowIso() });
      return;
    }

    if (segments[0] === "api" && segments[1] === "oracle-receipts" && segments[2]) {
      if (req.method !== "GET") return notFound(res);
      const marketId = Number(segments[2]);
      if (!Number.isInteger(marketId) || marketId < 0) return json(res, 400, { error: "Invalid market id." });
      const receipt = publicOracleReceiptForMarket(marketId);
      if (!receipt) return notFound(res);
      json(res, 200, { receipt, updatedAt: state.updatedAt || nowIso() });
      return;
    }

    if (segments[0] === "api" && segments[1] === "embed" && segments[2] === "market" && segments[3]) {
      if (req.method !== "GET") return notFound(res);
      const marketId = Number(segments[3]);
      const market = state.markets[String(marketId)];
      if (!market) return notFound(res);
      html(res, 200, embedMarketHtml(market));
      return;
    }

    if (segments[0] === "api" && segments[1] === "resolutions") {
      const marketId = Number(segments[2]);
      if (!Number.isInteger(marketId) || marketId < 0) return json(res, 400, { error: "Invalid market id." });

      if (req.method === "GET" && segments.length === 3) {
        const receipt = resolutionState()[String(marketId)] ?? null;
        json(res, 200, { receipt, updatedAt: state.updatedAt });
        return;
      }

      if (req.method === "POST" && segments[3] === "run") {
        if (!adminAuthorized(req)) return json(res, 401, { error: "Unauthorized." });
        const body = await readRequestBody(req);
        const receipt = await buildResolutionReceipt(marketId, {
          force: body.force === true,
          evidence: Array.isArray(body.evidence) ? body.evidence : undefined
        });
        const proposal = body.propose === true ? await proposeResolutionOnchain(receipt) : { skipped: "Proposal not requested." };
        json(res, 200, { receipt, proposal, updatedAt: nowIso() });
        return;
      }

      notFound(res);
      return;
    }

    if (segments[0] === "api" && segments[1] === "oracles") {
      const marketId = Number(segments[2]);
      if (!Number.isInteger(marketId) || marketId < 0) return json(res, 400, { error: "Invalid market id." });

      if (req.method === "GET" && segments.length === 3) {
        const proposal = oracleState()[String(marketId)] ?? null;
        json(res, 200, { proposal, updatedAt: state.updatedAt });
        return;
      }

      if (req.method === "POST" && segments[3] === "run") {
        const body = await readRequestBody(req);
        const force = body.force === true && adminAuthorized(req);
        const proposal = await buildOracleProposal(marketId, { force });
        const onchain =
          body.propose === true
            ? adminAuthorized(req)
              ? await proposeOracleOnchain(proposal)
              : { skipped: "Unauthorized." }
            : { skipped: "Proposal not requested." };
        await saveState();
        json(res, body.propose === true && onchain.skipped === "Unauthorized." ? 401 : 200, { proposal, onchain, updatedAt: nowIso() });
        return;
      }

      notFound(res);
      return;
    }

    if (segments[0] === "api" && segments[1] === "social") {
      const social = socialState();

      if (req.method === "GET" && segments[2] === "markets" && segments[3]) {
        const marketId = String(Number(segments[3]));
        json(res, 200, {
          comments: social.comments[marketId] ?? [],
          evidence: social.evidence[marketId] ?? [],
          updatedAt: state.updatedAt
        });
        return;
      }

      if (req.method === "POST" && segments[2] === "markets" && segments[3] && segments[4] === "comments") {
        const marketId = Number(segments[3]);
        if (!Number.isInteger(marketId) || marketId < 0) return json(res, 400, { error: "Invalid market id." });
        const body = await readRequestBody(req);
        const text = cleanText(body.text, 420);
        if (text.length < 2) return json(res, 400, { error: "Comment is too short." });
        const author = cleanAddress(body.author) || "Guest";
        const comment = {
          id: `${marketId}-${Date.now()}`,
          marketId,
          author,
          text,
          createdAt: nowIso()
        };
        appendSocialRow(social.comments, String(marketId), comment, 80);
        await saveState();
        json(res, 201, { comment, comments: social.comments[String(marketId)] });
        return;
      }

      if (req.method === "POST" && segments[2] === "markets" && segments[3] && segments[4] === "evidence") {
        const marketId = Number(segments[3]);
        if (!Number.isInteger(marketId) || marketId < 0) return json(res, 400, { error: "Invalid market id." });
        const body = await readRequestBody(req);
        const title = cleanText(body.title, 90) || "Evidence";
        const notes = cleanText(body.notes, 520);
        const sourceUrl = cleanUrl(body.url);
        if (!title && !notes && !sourceUrl) return json(res, 400, { error: "Evidence is empty." });
        if (body.url && !sourceUrl) return json(res, 400, { error: "Evidence URL must be http or https." });
        const evidence = {
          id: `${marketId}-${Date.now()}`,
          marketId,
          title,
          url: sourceUrl,
          notes,
          addedBy: cleanAddress(body.addedBy) || "Guest",
          createdAt: nowIso()
        };
        appendSocialRow(social.evidence, String(marketId), evidence, 40);
        await saveState();
        json(res, 201, { evidence, evidenceRows: social.evidence[String(marketId)] });
        return;
      }

      if (req.method === "GET" && segments[2] === "profiles" && segments[3]) {
        const address = cleanAddress(segments[3]);
        if (!address) return json(res, 400, { error: "Invalid address." });
        const key = address.toLowerCase();
        json(res, 200, {
          profile: social.profiles[key] ?? null,
          follows: social.follows[key] ?? [],
          updatedAt: state.updatedAt
        });
        return;
      }

      if (req.method === "POST" && segments[2] === "profiles" && segments[3]) {
        const address = cleanAddress(segments[3]);
        if (!address) return json(res, 400, { error: "Invalid address." });
        const body = await readRequestBody(req);
        const key = address.toLowerCase();
        const current = social.profiles[key] ?? { address, joinedAt: nowIso() };
        social.profiles[key] = {
          ...current,
          address,
          name: cleanText(body.name, 24),
          isPublic: body.isPublic !== false,
          updatedAt: nowIso()
        };
        await saveState();
        json(res, 200, { profile: social.profiles[key] });
        return;
      }

      if (req.method === "POST" && segments[2] === "profiles" && segments[3] && segments[4] === "follows") {
        const address = cleanAddress(segments[3]);
        const creator = cleanAddress((await readRequestBody(req)).creator);
        if (!address || !creator) return json(res, 400, { error: "Invalid address." });
        const key = address.toLowerCase();
        const creatorKey = creator.toLowerCase();
        const rows = new Set(social.follows[key] ?? []);
        const nextFollowing = !rows.has(creatorKey);
        if (nextFollowing) rows.add(creatorKey);
        else rows.delete(creatorKey);
        social.follows[key] = [...rows];
        await saveState();
        json(res, 200, { following: nextFollowing, follows: social.follows[key] });
        return;
      }

      notFound(res);
      return;
    }

    if (url.pathname === "/api/leaderboard") {
      const period = url.searchParams.get("period") || "all";
      const metric = url.searchParams.get("metric") || "volume";
      const limit = Number(url.searchParams.get("limit") || 100);
      const rows = sortLeaderboard(buildLeaderboard(periodStartFor(period)), metric).slice(0, limit);
      json(res, 200, { rows, period, metric, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === "/api/markets") {
      const limit = Number(url.searchParams.get("limit") || 0);
      const markets = Object.values(state.markets).sort((a, b) => b.id - a.id);
      json(res, 200, { markets: limit > 0 ? markets.slice(0, limit) : markets, total: state.marketCount, updatedAt: state.updatedAt });
      return;
    }

    if (segments[0] === "api" && segments[1] === "markets" && segments[2] && segments[3] === "ai-insight") {
      const marketId = Number(segments[2]);
      const market = state.markets[String(marketId)];
      if (!market) return notFound(res);
      json(res, 200, { insight: aiInsightForMarket(market), updatedAt: state.updatedAt || nowIso() });
      return;
    }

    if (segments[0] === "api" && segments[1] === "markets" && segments[2]) {
      const marketId = Number(segments[2]);
      const market = state.markets[String(marketId)];
      if (!market) return notFound(res);
      const snapshots = state.snapshots
        .filter((snapshot) => snapshot.marketId === marketId)
        .sort((a, b) => a.timestamp - b.timestamp);
      const trades = state.trades
        .filter((trade) => trade.marketId === marketId)
        .sort((a, b) => b.timestamp - a.timestamp);
      json(res, 200, { market, snapshots, trades, updatedAt: state.updatedAt });
      return;
    }

    if (segments[0] === "api" && segments[1] === "users" && segments[2]) {
      const address = segments[2].toLowerCase();
      const row = buildLeaderboard(0).find((item) => item.address.toLowerCase() === address);
      const trades = state.trades.filter((trade) => trade.user.toLowerCase() === address).sort((a, b) => b.timestamp - a.timestamp);
      const createdMarkets = Object.values(state.markets).filter((market) => market.creator.toLowerCase() === address);
      json(res, 200, { user: row ?? null, trades, createdMarkets, updatedAt: state.updatedAt });
      return;
    }

    notFound(res);
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function main() {
  await loadState();
  try {
    await syncOnce();
  } catch (error) {
    if (process.argv.includes("--once")) throw error;
    console.error("[indexer] initial sync failed:", error);
  }

  if (process.argv.includes("--once")) {
    console.log(`[indexer] synced ${state.marketCount} markets at block ${state.lastIndexedBlock}`);
    return;
  }

  const server = createServer(route);
  server.listen(PORT, HOST, () => {
    console.log(`[indexer] AuraPredict indexer listening on http://${HOST}:${PORT}`);
  });

  setInterval(() => {
    syncOnce().catch((error) => console.error("[indexer] sync failed:", error));
  }, POLL_MS);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
