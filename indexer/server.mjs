import "dotenv/config";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, encodeAbiParameters, fallback, formatUnits, http, isAddress, keccak256, stringToHex, webSocket } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcPredictionMarketV2Abi, arcPredictionMarketV3Abi, arcPredictionMarketV4Abi } from "./arcPredictionMarketAbi.mjs";
import { arcPredictionMarketV5Abi } from "./arcPredictionMarketV5Abi.mjs";
import {
  circleWalletsEnabled,
  circleAppId,
  circleStartSession,
  circleListWallets,
  circleContractChallenge,
  circleLatestTx,
  circleEmailLoginToken,
  circleSocialLoginToken,
  circleInitWalletByToken,
  circleWalletsByToken
} from "./circleWallets.mjs";
import { scoreEvidenceSearchResult } from "./evidenceSearchPolicy.mjs";
import {
  NUMERIC_COMPARATORS,
  compareObservedValue,
  numericOracleIntegrityIssueFromParts,
  parseNumericValue,
  priceConditionFromParts,
  significantTargetMismatch,
  yesConditionTextFromRule
} from "./oracleRuleUtils.mjs";
import { evaluateSimpleSportsMarket, gatherEspnScoreboardEvidence, gatherEspnScoreboardSnapshot } from "./sportsAdapters.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "aurapredict-index.json");

const CONTRACT_ADDRESS = String(
  process.env.AURA_INDEXER_CONTRACT_ADDRESS ||
    process.env.PREDICTION_MARKET_ADDRESS ||
    process.env.VITE_PREDICTION_MARKET_ADDRESS ||
    process.env.VITE_AURAPREDICT_V5_ADDRESS ||
    ""
).trim();
const RPC_URLS = (
  process.env.AURA_INDEXER_RPC_URLS ||
  process.env.ARC_RPC_URL ||
  "https://rpc.testnet.arc.network"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const PORT = Number(process.env.PORT || process.env.AURA_INDEXER_PORT || 8787);
const HOST = process.env.AURA_INDEXER_HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const PUBLIC_API_BASE_URL = String(process.env.AURA_PUBLIC_API_BASE_URL || "https://api.aurapredict.xyz").replace(/\/+$/, "");
const PUBLIC_APP_BASE_URL = String(process.env.AURA_PUBLIC_APP_BASE_URL || "https://app.aurapredict.xyz").replace(/\/+$/, "");
const POLL_MS = Number(process.env.AURA_INDEXER_POLL_MS || 60_000);
const WS_URLS = (
  process.env.AURA_INDEXER_WS_URLS ||
  process.env.AURA_INDEXER_WS_URL ||
  process.env.ARC_WS_URL ||
  "wss://rpc.testnet.arc.network"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const REALTIME_SYNC_ENABLED = String(process.env.AURA_INDEXER_WS_ENABLED || "1").trim() !== "0";
const REALTIME_SYNC_DEBOUNCE_MS = Math.max(100, Number(process.env.AURA_INDEXER_WS_DEBOUNCE_MS || 750) || 750);
const START_BLOCK = BigInt(process.env.START_BLOCK || process.env.AURA_INDEXER_START_BLOCK || process.env.VITE_AURAPREDICT_V5_DEPLOYMENT_BLOCK || 0);
const CHUNK_SIZE = BigInt(process.env.AURA_INDEXER_CHUNK_SIZE || 100);
const READ_RETRY_COUNT = Math.max(0, Number(process.env.AURA_INDEXER_READ_RETRIES || 3) || 3);
const READ_RETRY_BASE_MS = Math.max(100, Number(process.env.AURA_INDEXER_READ_RETRY_BASE_MS || 350) || 350);
const MARKET_READ_CONCURRENCY = Math.max(1, Number(process.env.AURA_INDEXER_MARKET_READ_CONCURRENCY || 8) || 8);
const MARKET_READ_FAIL_SOFT = String(process.env.AURA_INDEXER_MARKET_READ_FAIL_SOFT || "1").trim() !== "0";
const AI_PROVIDER = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
const AI_FALLBACK_PROVIDER = String(process.env.AI_FALLBACK_PROVIDER || "").trim().toLowerCase();
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_API_KEYS = String(process.env.GEMINI_API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, "");
const AI_MODEL = String(process.env.AI_MODEL || "gemini-2.5-flash").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const GROQ_API_KEY = String(process.env.GROQ_API_KEY || "").trim();
const GROQ_API_KEYS = String(process.env.GROQ_API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const GROQ_BASE_URL = String(process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").trim().replace(/\/$/, "");
const GROQ_MODEL = String(process.env.GROQ_MODEL || "llama-3.3-70b-versatile").trim();
const RESOLUTION_ADMIN_TOKEN = String(process.env.AURA_RESOLUTION_ADMIN_TOKEN || "").trim();
// Re-reading every market's on-chain state each poll is the dominant RPC cost.
// Events keep markets fresh between full reconciles, so throttle the full read.
const CONTRACT_REFRESH_MS = Math.max(0, Number(process.env.AURA_INDEXER_CONTRACT_REFRESH_MS || 600_000) || 0);
let lastContractRefresh = 0;
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
const AUTO_FINALIZE = String(process.env.AURA_AUTO_FINALIZE || "").trim() === "1";
const ORACLE_HTTP_TIMEOUT_MS = Number(process.env.AURA_ORACLE_HTTP_TIMEOUT_MS || 8_000);
const AUTO_EVIDENCE_ENABLED = String(process.env.AURA_AUTO_EVIDENCE_ENABLED || "1").trim() !== "0";
const AUTO_EVIDENCE_TIMEOUT_MS = Number(process.env.AURA_AUTO_EVIDENCE_TIMEOUT_MS || 6_000);
const AUTO_EVIDENCE_MAX_SOURCES = Number(process.env.AURA_AUTO_EVIDENCE_MAX_SOURCES || 3);
const AUTO_EVIDENCE_MAX_ITEMS = Number(process.env.AURA_AUTO_EVIDENCE_MAX_ITEMS || 80);
const AUTO_EVIDENCE_MAX_ROWS = Math.max(10, Number(process.env.AURA_AUTO_EVIDENCE_MAX_ROWS || 16) || 16);
const AUTO_EVIDENCE_SEARCH_ENABLED = String(process.env.AURA_AUTO_EVIDENCE_SEARCH_ENABLED || "1").trim() !== "0";
const AUTO_EVIDENCE_SEARCH_PROVIDER = String(process.env.AURA_AUTO_EVIDENCE_SEARCH_PROVIDER || "").trim().toLowerCase();
const AUTO_EVIDENCE_SEARCH_MAX_RESULTS = Math.max(
  0,
  Math.min(8, Number(process.env.AURA_AUTO_EVIDENCE_SEARCH_MAX_RESULTS || 4) || 4)
);
const AUTO_EVIDENCE_SEARCH_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.AURA_AUTO_EVIDENCE_SEARCH_TIMEOUT_MS || 7_000) || 7_000
);
const BRAVE_SEARCH_API_KEY = String(process.env.BRAVE_SEARCH_API_KEY || "").trim();
const TAVILY_API_KEYS = String(process.env.TAVILY_API_KEYS || process.env.TAVILY_API_KEY || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const SERPAPI_API_KEY = String(process.env.SERPAPI_API_KEY || "").trim();
const ORACLE_AUTO_PROPOSE = String(process.env.AURA_ORACLE_AUTO_PROPOSE || "").trim() === "1";
const ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE = Number(process.env.AURA_ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE || 78);
const ORACLE_AUTO_PROPOSE_ADAPTERS = new Set(
  String(
    process.env.AURA_ORACLE_AUTO_PROPOSE_ADAPTERS ||
      "crypto-price,stock-yahoo-chart,macro-yahoo-chart,macro-bls-release,macro-fed-rate,macro-eia-inventory,status-health,status-page,liquidity-rule"
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
const V5_EVENT_NAMES = [
  "MarketDraftSubmitted",
  "MarketApproved",
  "MarketCreated",
  "PositionTaken",
  "MarketResultProposed",
  "AuthorityReviewRequested",
  "MarketDisputed",
  "MarketReported",
  "ReportResolved",
  "MarketCanceled",
  "MarketFinalized",
  "Claimed",
  "ClaimedBatch",
  "WithdrawalCredited",
  "WithdrawalCompleted"
];
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
const V5_MARKET_STATE = {
  Draft: 0,
  Live: 1,
  Proposed: 2,
  Disputed: 3,
  Finalized: 4,
  Canceled: 5,
  Rejected: 6
};
const V5_NO_OUTCOME = 65535;

function legacyOutcomeToV5(outcome) {
  if (Number(outcome) === Outcome.Yes) return 0;
  if (Number(outcome) === Outcome.No) return 1;
  return V5_NO_OUTCOME;
}

function v5OutcomeToLegacy(outcomeId) {
  if (Number(outcomeId) === 0) return Outcome.Yes;
  if (Number(outcomeId) === 1) return Outcome.No;
  if (Number(outcomeId) === V5_NO_OUTCOME) return Outcome.Canceled;
  return Outcome.Unresolved;
}

function v5StateToOutcome(state, finalOutcome) {
  if (Number(state) === V5_MARKET_STATE.Finalized) return v5OutcomeToLegacy(finalOutcome);
  if (Number(state) === V5_MARKET_STATE.Canceled || Number(state) === V5_MARKET_STATE.Rejected) return Outcome.Canceled;
  return Outcome.Unresolved;
}

const client = createPublicClient({
  chain: ARC_CHAIN,
  transport: fallback(RPC_URLS.map((url) => http(url, { retryCount: 1, retryDelay: 250, timeout: 10_000 })), {
    rank: false,
    retryCount: 2,
    retryDelay: 500
  })
});
const eventRpcUrl = String(process.env.AURA_INDEXER_EVENT_RPC_URL || RPC_URLS[0] || "").trim();
const eventClient = createPublicClient({
  chain: ARC_CHAIN,
  transport: http(eventRpcUrl, { retryCount: 1, retryDelay: 250, timeout: 15_000 })
});
const realtimeClient =
  REALTIME_SYNC_ENABLED && WS_URLS.length > 0
    ? createPublicClient({
        chain: ARC_CHAIN,
        transport: webSocket(WS_URLS[0], { retryCount: 3, retryDelay: 1_000, timeout: 10_000 })
      })
    : null;
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
const GROQ_RATE_LIMIT_COOLDOWN_MS = Number(process.env.GROQ_RATE_LIMIT_COOLDOWN_MS || 60_000);
const groqKeyState = {
  cursor: 0,
  cooldownUntilByKey: new Map()
};
const tavilyKeyState = {
  cursor: 0
};
let realtimeUnwatch = null;
let realtimeReconnectTimer = null;
let realtimeReconnectAttempt = 0;

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
    indexer: {
      mode: REALTIME_SYNC_ENABLED && WS_URLS.length > 0 ? "websocket+polling" : "polling",
      pollMs: POLL_MS,
      wsEnabled: REALTIME_SYNC_ENABLED && WS_URLS.length > 0,
      wsUrl: WS_URLS[0] || "",
      wsStatus: REALTIME_SYNC_ENABLED && WS_URLS.length > 0 ? "starting" : "disabled",
      wsLastBlock: "0",
      wsLastEventAt: null,
      wsLastError: "",
      lastSyncReason: "startup",
      lastSyncStartedAt: null,
      lastSyncTargetBlock: "0",
      lastSyncError: "",
      lastSyncErrorAt: null
    },
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
      usernames: {},
      follows: {},
      comments: {},
      evidence: {},
      reports: {},
      notifications: {}
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
      activityReconciliation: {
        ok: true,
        mismatchCount: 0,
        checkedMarkets: 0,
        sample: []
      },
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
let scheduledSyncTimer = null;
const blockTimestampCache = new Map();
let tradeIndexCache = {
  version: "",
  sorted: [],
  byUser: new Map(),
  byMarket: new Map()
};

function tradeIndexVersion() {
  const last = state.trades[state.trades.length - 1];
  return `${state.trades.length}:${last?.id || ""}:${last?.timestamp || 0}`;
}

function tradeIndexes() {
  const version = tradeIndexVersion();
  if (tradeIndexCache.version === version) return tradeIndexCache;

  const sorted = state.trades.slice().sort((a, b) => b.timestamp - a.timestamp);
  const byUser = new Map();
  const byMarket = new Map();
  for (const trade of sorted) {
    const userKey = String(trade.user || "").toLowerCase();
    if (userKey) {
      const rows = byUser.get(userKey) ?? [];
      rows.push(trade);
      byUser.set(userKey, rows);
    }
    const marketRows = byMarket.get(trade.marketId) ?? [];
    marketRows.push(trade);
    byMarket.set(trade.marketId, marketRows);
  }

  tradeIndexCache = { version, sorted, byUser, byMarket };
  return tradeIndexCache;
}

function tradesForUser(address) {
  if (!address || !isAddress(address)) return [];
  return tradeIndexes().byUser.get(address.toLowerCase()) ?? [];
}

function tradesForMarket(marketId) {
  return tradeIndexes().byMarket.get(marketId) ?? [];
}

function indexerRuntimeState() {
  state.indexer ??= emptyState().indexer;
  state.indexer.mode = REALTIME_SYNC_ENABLED && WS_URLS.length > 0 ? "websocket+polling" : "polling";
  state.indexer.pollMs = POLL_MS;
  state.indexer.wsEnabled = REALTIME_SYNC_ENABLED && WS_URLS.length > 0;
  state.indexer.wsUrl = WS_URLS[0] || "";
  return state.indexer;
}

function scheduleSync(reason, delayMs = 0) {
  const runtime = indexerRuntimeState();
  runtime.lastSyncReason = reason;
  if (scheduledSyncTimer) return;
  scheduledSyncTimer = setTimeout(() => {
    scheduledSyncTimer = null;
    syncOnce().catch((error) => console.error(`[indexer] ${reason} sync failed:`, error));
  }, Math.max(0, delayMs));
}

function syncErrorMessage(error) {
  if (!error) return "Unknown sync error.";
  const message = error instanceof Error ? error.message : String(error);
  const details = typeof error === "object" && error && "details" in error ? String(error.details || "") : "";
  const url = typeof error === "object" && error && "url" in error ? String(error.url || "") : "";
  return [message, details, url].filter(Boolean).join(" | ").slice(0, 1000);
}

function recomputeTraderCounts() {
  const traderSets = {};
  for (const trade of state.trades) {
    const key = String(trade.marketId);
    if (!traderSets[key]) traderSets[key] = new Set();
    traderSets[key].add(trade.user);
  }
  for (const [id, market] of Object.entries(state.markets)) {
    market.traderCount = traderSets[id]?.size ?? 0;
  }
}

async function loadState() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const saved = JSON.parse(raw);
    if (saved.contractAddress?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
      state = { ...emptyState(), ...saved };
      recomputeTraderCounts();
      indexerRuntimeState();
      // Clear stale "unsupported" oracle proposals so the sweep re-evaluates them after code updates.
      const unsupportedKeys = Object.keys(state.oracleProposals || {}).filter(
        (k) => String(state.oracleProposals[k]?.status || "") === "unsupported"
      );
      if (unsupportedKeys.length > 0) {
        for (const k of unsupportedKeys) delete state.oracleProposals[k];
        console.log(`[indexer] Cleared ${unsupportedKeys.length} stale "unsupported" oracle proposals on startup.`);
      }
      // Backfill V5 markets missing closeTime
      if (isV5Contract()) {
        const missing = Object.values(state.markets).filter((m) => !m.closeTime || m.closeTime === 0);
        if (missing.length > 0) {
          console.log(`[indexer] Backfilling ${missing.length} V5 markets missing closeTime...`);
          for (const m of missing) {
            try {
              const data = await readMarketData(m.id);
              Object.assign(m, data, { id: m.id });
            } catch (e) {
              console.warn(`[indexer] Backfill market ${m.id} failed: ${e?.message}`);
            }
          }
          await saveState();
          console.log("[indexer] Backfill complete.");
        }
      }
    }
  } catch {
    state = emptyState();
  }
}

let saveChain = Promise.resolve();

async function writeStateAtomic() {
  await mkdir(DATA_DIR, { recursive: true });
  // Atomic write: serialize to a temp file, then rename over the target.
  // rename() is atomic on POSIX, so a crash mid-write can never leave a
  // half-written (corrupt) data file — loadState always sees a complete file.
  const tmp = `${DATA_FILE}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tmp, DATA_FILE);
}

async function saveState() {
  // Serialize concurrent saves so two writers never clash on the temp file.
  saveChain = saveChain.then(writeStateAtomic, writeStateAtomic).catch((error) => {
    console.error("[indexer] saveState failed:", error instanceof Error ? error.message : String(error));
  });
  return saveChain;
}

async function getBlockTimestamp(blockNumber) {
  if (!blockNumber) return 0;
  const key = blockNumber.toString();
  if (!blockTimestampCache.has(key)) {
    const block = await eventClient.getBlock({ blockNumber });
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
      isDraft: false,
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
    if (isV5Contract()) {
      market.creator = args.creator ?? market.creator;
      market.settlementToken = args.token ?? market.settlementToken;
      market.createdAt = timestamp || market.createdAt;
      market.createdTxHash = txHash;
      market.updatedTxHash = txHash;
      return;
    }
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
        blockNumber: String(log.blockNumber ?? ""),
        logIndex
      });
    }
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "PositionTaken") {
    const marketId = Number(args.marketId ?? 0n);
    const market = ensureMarket(marketId);
    const outcomeId = Number(args.outcomeId ?? V5_NO_OUTCOME);
    const amount = toBigint(args.amount);
    if (outcomeId === 0) market.yesPool = toAmount(toBigint(market.yesPool) + amount);
    if (outcomeId === 1) market.noPool = toAmount(toBigint(market.noPool) + amount);
    market.updatedTxHash = txHash;

    const id = `${txHash}-${logIndex}`;
    if (!state.trades.some((trade) => trade.id === id)) {
      const trader = args.user ?? ZERO_ADDRESS;
      const isNewTrader = !state.trades.some((t) => t.marketId === marketId && t.user === trader);
      if (isNewTrader) market.traderCount = (market.traderCount || 0) + 1;
      state.trades.push({
        id,
        marketId,
        user: trader,
        side: v5OutcomeToLegacy(outcomeId),
        outcomeId,
        amount: toAmount(amount),
        yesPool: market.yesPool,
        noPool: market.noPool,
        timestamp,
        txHash,
        blockNumber: String(log.blockNumber ?? ""),
        logIndex
      });
    }
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "MarketResultProposed") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    const proposedOutcome = isV5Contract()
      ? v5OutcomeToLegacy(Number(args.outcomeId ?? V5_NO_OUTCOME))
      : Number(args.outcome ?? Outcome.Unresolved);
    market.proposedOutcome = proposedOutcome;
    market.proposedAt = timestamp;
    market.disputeDeadline = toNumber(args.disputeDeadline) || timestamp + Number(market.termsDisputeWindow || state.disputeWindow || 0);
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
        blockNumber: String(log.blockNumber ?? ""),
        logIndex
      });
    }
    return;
  }

  if (eventName === "MarketDraftSubmitted") {
    const marketId = Number(args.marketId ?? 0n);
    const market = ensureMarket(marketId);
    market.creator = args.creator ?? market.creator;
    market.settlementToken = args.token ?? market.settlementToken;
    market.createdAt = timestamp || market.createdAt;
    market.isDraft = true;
    market.createdTxHash = txHash;
    market.updatedTxHash = txHash;
    return;
  }

  if (eventName === "MarketApproved") {
    const marketId = Number(args.marketId ?? 0n);
    const market = ensureMarket(marketId);
    market.isDraft = false;
    market.updatedTxHash = txHash;
    // Fetch full market data to populate closeTime, resolutionTime, question, etc.
    try {
      const data = await readMarketData(marketId);
      Object.assign(market, data, { id: marketId, isDraft: false, updatedTxHash: txHash });
    } catch (err) {
      console.warn(`[indexer] MarketApproved: failed to enrich market ${marketId}: ${err?.message}`);
    }
    return;
  }

  if (eventName === "MarketCanceled") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.outcome = Outcome.Canceled;
    market.isDraft = false;
    market.resolvedAt = timestamp;
    market.updatedTxHash = txHash;
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }

  if (eventName === "MarketFinalized") {
    const market = ensureMarket(Number(args.marketId ?? 0n));
    market.outcome = v5OutcomeToLegacy(Number(args.outcomeId ?? V5_NO_OUTCOME));
    market.isDraft = false;
    market.resolvedAt = timestamp;
    market.updatedTxHash = txHash;
    addSnapshot(market, timestamp, txHash, logIndex);
    return;
  }
}

function isV3Contract() {
  return state.contractVersion === "AURAPREDICT_V3";
}

function isV4Contract() {
  return state.contractVersion === "AURAPREDICT_V4";
}

function isV5Contract() {
  return state.contractVersion === "AURAPREDICT_V5";
}

function isStablecoinContract() {
  return isV3Contract() || isV4Contract() || isV5Contract();
}

function currentContractAbi() {
  if (isV5Contract()) return arcPredictionMarketV5Abi;
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
  if (functionName === "proposeOutcome") return "proposeOutcome(uint256,uint16,bytes32,bytes32,uint16,uint16,uint16,bytes32)";
  if (functionName === "proposeCancel") return "proposeCancel(uint256,bytes32,bytes32)";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactErrorMessage(error) {
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

function isRetryableReadError(error) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return [
    "fetch failed",
    "timeout",
    "time-out",
    "daily request limit",
    "rate limit",
    "too many requests",
    "429",
    "500",
    "502",
    "503",
    "504",
    "bad gateway",
    "socket",
    "connection",
    "rpc request failed",
    "http request failed",
    "transaction creation failed",
    "block range extends beyond current head block",
    "temporarily unavailable"
  ].some((needle) => message.includes(needle));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function detectContractVersion() {
  let lastError;
  for (let attempt = 0; attempt <= READ_RETRY_COUNT; attempt += 1) {
    try {
      const contractVersion = await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: arcPredictionMarketV2Abi,
        functionName: "CONTRACT_VERSION"
      });
      state.contractVersion = String(contractVersion || "unknown");
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= READ_RETRY_COUNT || !isRetryableReadError(error)) break;
      await sleep(READ_RETRY_BASE_MS * (attempt + 1));
    }
  }
  if (lastError && isRetryableReadError(lastError)) throw lastError;
  state.contractVersion = "legacy";
}

async function readContract(functionName, args = []) {
  let lastError;
  for (let attempt = 0; attempt <= READ_RETRY_COUNT; attempt += 1) {
    try {
      return await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: currentContractAbi(),
        functionName,
        args
      });
    } catch (error) {
      lastError = error;
      if (attempt >= READ_RETRY_COUNT || !isRetryableReadError(error)) throw error;
      await sleep(READ_RETRY_BASE_MS * (attempt + 1));
    }
  }
  throw lastError;
}

async function readMarketData(id) {
  if (isV5Contract()) {
    const [summary, v5, pools] = await Promise.all([
      readContract("getMarket", [BigInt(id)]),
      readContract("getMarketV5", [BigInt(id)]),
      readContract("getOutcomePools", [BigInt(id)])
    ]);
    const asset = await readContract("assetConfigs", [summary[7]]);
    const stateValue = Number(summary[2]);
    const proposedOutcomeId = Number(v5[7]);
    const finalOutcomeId = Number(v5[8]);
    const proposedAt = Number(v5[12] || 0n);
    const termsDisputeWindow = Number(v5[13] || 0n);
    const termsProposalGracePeriod = Number(v5[14] || 0n);
    return {
      question: summary[0],
      category: summary[1],
      settlementToken: summary[7],
      settlementSymbol: String(asset[1] || "USDC"),
      settlementDecimals: Number(asset[2] || V3_SETTLEMENT_DECIMALS),
      closeTime: Number(summary[3]),
      resolutionTime: Number(summary[4]),
      creator: summary[6],
      resolver: v5[3],
      authority: v5[4],
      resolutionMode: Number(v5[1]),
      metadataHash: v5[9],
      metadataURI: summary[9],
      fallbackSourceURI: "",
      resolutionRule: summary[10],
      resolutionAdapter: v5[5],
      termsProtocolFeeBps: Number(asset[9] || 0n),
      termsCreatorBond: toAmount(asset[4]),
      termsDisputeBond: toAmount(asset[6]),
      termsDisputeWindow,
      termsDisputeGracePeriod: termsProposalGracePeriod,
      termsProposalGracePeriod,
      yesPool: toAmount(pools[0] ?? 0n),
      noPool: toAmount(pools[1] ?? 0n),
      traderCount: Number(state.markets[String(id)]?.traderCount || 0),
      proposedOutcome:
        stateValue === V5_MARKET_STATE.Proposed || stateValue === V5_MARKET_STATE.Disputed
          ? v5OutcomeToLegacy(proposedOutcomeId)
          : Outcome.Unresolved,
      proposedAt,
      disputeDeadline: proposedAt > 0 ? proposedAt + termsDisputeWindow : 0,
      authorityReviewRequired: Boolean(v5[15]),
      disputed: Boolean(v5[16]),
      disputer: v5[17],
      isDraft: stateValue === V5_MARKET_STATE.Draft,
      outcome: v5StateToOutcome(stateValue, finalOutcomeId)
    };
  }

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
    if (isV4Contract() || isV5Contract()) {
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

  const marketIds = Array.from({ length: state.marketCount }, (_, id) => id);
  const markets = await mapWithConcurrency(
    marketIds,
    MARKET_READ_CONCURRENCY,
    async (id) => {
      const existing = state.markets[String(id)];
      const current = ensureMarket(id);
      try {
        const data = await readMarketData(id);
        return {
          ...current,
          id,
          ...data
        };
      } catch (error) {
        if (MARKET_READ_FAIL_SOFT && existing?.question && existing.createdAt) {
          console.warn(`[indexer] market ${id} read failed; keeping cached row: ${compactErrorMessage(error)}`);
          return current;
        }
        throw error;
      }
    }
  );

  state.markets = Object.fromEntries(markets.map((market) => [String(market.id), market]));
  if (isStablecoinContract()) {
    const tokens = [...new Set(markets.map((market) => market.settlementToken).filter((token) => token && token !== ZERO_ADDRESS))];
    const assets = new Map();
    await mapWithConcurrency(
      tokens,
      Math.min(MARKET_READ_CONCURRENCY, 4),
      async (token) => {
        try {
          const config = await readContract("assetConfigs", [token]);
          assets.set(token.toLowerCase(), {
            symbol: String(config[1] || "TOKEN"),
            decimals: Number(config[2] || 6)
          });
        } catch (error) {
          if (!MARKET_READ_FAIL_SOFT) throw error;
          console.warn(`[indexer] asset config ${token} read failed; keeping market asset fallback: ${compactErrorMessage(error)}`);
        }
      }
    );
    for (const market of Object.values(state.markets)) {
      const asset = assets.get(String(market.settlementToken).toLowerCase());
      market.settlementSymbol = asset?.symbol || market.settlementSymbol || "TOKEN";
      market.settlementDecimals = asset?.decimals ?? market.settlementDecimals ?? 6;
    }
  }
}

function activityReconciliationSummary(markets = Object.values(state.markets)) {
  const byMarket = new Map();
  for (const trade of state.trades || []) {
    const id = String(Number(trade.marketId || 0));
    const row = byMarket.get(id) || { yes: 0n, no: 0n, tradeCount: 0 };
    const amount = toBigint(trade.amount);
    if (Number(trade.side) === Outcome.Yes) row.yes += amount;
    if (Number(trade.side) === Outcome.No) row.no += amount;
    row.tradeCount += 1;
    byMarket.set(id, row);
  }

  const mismatches = [];
  for (const market of markets) {
    const id = String(Number(market.id || 0));
    const expectedYes = toBigint(market.yesPool);
    const expectedNo = toBigint(market.noPool);
    const observed = byMarket.get(id) || { yes: 0n, no: 0n, tradeCount: 0 };
    const yesDelta = expectedYes - observed.yes;
    const noDelta = expectedNo - observed.no;
    if (yesDelta !== 0n || noDelta !== 0n) {
      mismatches.push({
        marketId: Number(market.id),
        question: market.question || `Market #${market.id}`,
        expectedYes: expectedYes.toString(),
        indexedYes: observed.yes.toString(),
        yesDelta: yesDelta.toString(),
        expectedNo: expectedNo.toString(),
        indexedNo: observed.no.toString(),
        noDelta: noDelta.toString(),
        tradeCount: observed.tradeCount,
        settlementSymbol: market.settlementSymbol || "USDC",
        settlementDecimals: marketAssetDecimals(market)
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatchCount: mismatches.length,
    checkedMarkets: markets.length,
    sample: mismatches
      .sort((a, b) => {
        const aMagnitude = toBigint(a.yesDelta) ** 2n + toBigint(a.noDelta) ** 2n;
        const bMagnitude = toBigint(b.yesDelta) ** 2n + toBigint(b.noDelta) ** 2n;
        return bMagnitude > aMagnitude ? 1 : bMagnitude < aMagnitude ? -1 : 0;
      })
      .slice(0, 12)
  };
}

function computeStats() {
  const markets = Object.values(state.markets).filter((m) => !m.isDraft);
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
    activityReconciliation: activityReconciliationSummary(markets),
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
      usernames: {},
      follows: {},
      comments: {},
      evidence: {},
      notifications: {}
    };
  }
  state.social.profiles ??= {};
  state.social.usernames ??= {};
  state.social.follows ??= {};
  state.social.comments ??= {};
  state.social.evidence ??= {};
  state.social.reports ??= {};
  state.social.notifications ??= {};
  rebuildUsernameIndex(state.social);
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

function normalizeUsername(value) {
  return cleanText(value, 24)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanUsername(value) {
  const normalized = normalizeUsername(value).slice(0, 20);
  if (normalized.length < 2) return "";
  return normalized;
}

function rebuildUsernameIndex(social) {
  const next = {};
  for (const [address, profile] of Object.entries(social.profiles ?? {})) {
    const key = cleanAddress(profile?.address || address)?.toLowerCase();
    const username = cleanUsername(profile?.name);
    if (!key || !username) continue;
    if (!next[username]) next[username] = key;
  }
  social.usernames = next;
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

const MARKET_REPORT_STATUSES = new Set(["open", "dismissed", "flagged", "resolved"]);

function cleanReportStatus(value) {
  const status = cleanText(value, 32).toLowerCase();
  return MARKET_REPORT_STATUSES.has(status) ? status : "";
}

const SOCIAL_NOTIFICATION_TYPES = new Set([
  "resolve",
  "finalize",
  "owner-review",
  "dispute-review",
  "stale-review",
  "proposal",
  "dispute-resolved",
  "report",
  "flag",
  "claim",
  "result"
]);

function cleanNotificationRow(row, wallet) {
  if (!row || typeof row !== "object") return null;
  const type = cleanText(row.type, 40);
  if (!SOCIAL_NOTIFICATION_TYPES.has(type)) return null;
  const key = cleanText(row.key, 180);
  if (!key) return null;
  const createdAt = Number(row.createdAt);
  const marketId = Number(row.marketId);
  const claimedAt = Number(row.claimedAt);
  const notification = {
    key,
    wallet: wallet.toLowerCase(),
    type,
    label: cleanText(row.label, 48) || "Notification",
    title: cleanText(row.title, 180) || "Market update",
    detail: cleanText(row.detail, 320),
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? Math.floor(createdAt) : Math.floor(Date.now() / 1000)
  };
  if (Number.isInteger(marketId) && marketId >= 0) notification.marketId = marketId;
  if (Number.isFinite(claimedAt) && claimedAt > 0) notification.claimedAt = Math.floor(claimedAt);
  return notification;
}

function mergeNotificationRows(currentRows, incomingRows, wallet, limit = 500) {
  const rows = [...incomingRows, ...(Array.isArray(currentRows) ? currentRows : [])]
    .map((row) => cleanNotificationRow(row, wallet))
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
  const seen = new Set();
  const merged = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged;
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
    agent: {
      name: "Aura Oracle Agent",
      network: "Arc Testnet",
      chainId: state.chainId || CHAIN_ID,
      contractAddress: CONTRACT_ADDRESS,
      apiBaseUrl: PUBLIC_API_BASE_URL,
      manifestUrl: `${PUBLIC_API_BASE_URL}/api/agent`,
      mcpToolsUrl: `${PUBLIC_API_BASE_URL}/api/agent/mcp`,
      signerMode: RESOLVER_SIGNER_MODE,
      circleAgentWallet: CIRCLE_AGENT_WALLET_ADDRESS || ""
    },
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
    safeguards: [
      "Read-only agent endpoints do not move funds.",
      "Oracle proposals are decision support unless an authorized signer explicitly proposes onchain.",
      "Funded markets still keep dispute and authority-review paths open.",
      "Low-confidence, stale, conflicting, or rule-mismatched evidence is routed to manual review."
    ],
    policy:
      "Experimental testnet reputation. Score combines coverage, confidence, final-match accuracy, reversal rate, and evidence depth. The 78% auto-propose gate still needs backtesting before mainnet.",
    updatedAt: state.updatedAt || nowIso()
  };
}

function hotAiMarkets(limit = 8) {
  return Object.values(state.markets)
    .filter((market) => !market.isDraft && outcomeValue(market.outcome) === Outcome.Unresolved)
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

function agentMarketSummary(market) {
  const pools = marketPools(market);
  const resolutionTime = marketResolutionTime(market);
  const proposal = oracleState()[String(market.id)] || null;
  const receipt = publicOracleReceiptForMarket(market.id);
  const sourceUrls = [
    ...(marketSourceUrls(market) || []),
    ...(Array.isArray(proposal?.sourceUrls) ? proposal.sourceUrls : []),
    ...(Array.isArray(receipt?.sourceUrls) ? receipt.sourceUrls : [])
  ]
    .map(cleanUrl)
    .filter(Boolean);
  const uniqueSourceUrls = [...new Set(sourceUrls)];
  const oracleOutcome = oracleDecisionValue(proposal);
  const aiOutcome = outcomeValue(receipt?.ai?.outcome);
  const status =
    outcomeValue(market.outcome) !== Outcome.Unresolved
      ? "finalized"
      : Number(market.proposedAt || 0) > 0
        ? "proposed"
        : Number(market.closeTime || 0) <= Math.floor(Date.now() / 1000)
          ? "awaiting_resolution"
          : "live";

  return {
    id: market.id,
    appUrl: `${PUBLIC_APP_BASE_URL}/?market=${encodeURIComponent(String(market.id))}`,
    question: market.question,
    category: market.category || "Other",
    status,
    closeTime: Number(market.closeTime || 0),
    resolutionTime,
    settlement: {
      token: market.settlementToken || "",
      symbol: market.settlementSymbol || "USDC",
      decimals: marketAssetDecimals(market)
    },
    pools: {
      yes: String(market.yesPool || "0"),
      no: String(market.noPool || "0"),
      total: pools.total.toString()
    },
    participants: Number(market.traderCount || 0),
    outcome: outcomeName(outcomeValue(market.outcome)),
    proposedOutcome: outcomeName(outcomeValue(market.proposedOutcome)),
    proposedAt: Number(market.proposedAt || 0),
    disputeDeadline: Number(market.disputeDeadline || 0),
    disputed: Boolean(market.disputed),
    authorityReviewRequired: Boolean(market.authorityReviewRequired),
    sourceUrls: uniqueSourceUrls.slice(0, 8),
    oracle: proposal
      ? {
          status: proposal.status || "",
          adapter: proposal.adapter || "",
          outcome: outcomeName(oracleOutcome),
          confidence: Number(proposal.confidence || 0),
          observedValue: proposal.observedValue || "",
          summary: proposal.summary || "",
          generatedAt: proposal.generatedAt || ""
        }
      : null,
    ai: receipt
      ? {
          status: receipt.status || "",
          outcome: outcomeName(aiOutcome),
          confidence: Number(receipt.ai?.confidence || 0),
          summary: receipt.evidence?.[0]?.notes || ""
        }
      : null
  };
}

function agentActionPreview(marketId) {
  const market = state.markets[String(marketId)];
  if (!market) return null;
  const now = Math.floor(Date.now() / 1000);
  const resolutionTime = marketResolutionTime(market);
  const finalOutcome = outcomeValue(market.outcome);
  const proposedOutcome = outcomeValue(market.proposedOutcome);
  const proposal = oracleState()[String(marketId)] || null;
  const receipt = publicOracleReceiptForMarket(marketId);
  const aiOutcome = outcomeValue(receipt?.ai?.outcome);
  const oracleOutcome = oracleDecisionValue(proposal);
  const pools = marketPools(market);
  const reports = socialState().reports[String(marketId)] ?? [];
  const openReports = reports.filter((report) => report.status === "open").length;
  const checks = [];
  if (openReports > 0) checks.push(`${openReports} open market report${openReports === 1 ? "" : "s"} require owner review.`);
  if (pools.yesPool === 0n || pools.noPool === 0n) checks.push("One side has no funded pool; YES/NO settlement may need cancel/refund review.");
  if (aiOutcome !== Outcome.Unresolved && oracleOutcome !== Outcome.Unresolved && aiOutcome !== oracleOutcome) {
    checks.push(`Aura AI (${outcomeName(aiOutcome)}) conflicts with Oracle (${outcomeName(oracleOutcome)}).`);
  }
  if (Number(market.authorityReviewRequired || 0) > 0 || Boolean(market.disputed)) {
    checks.push("Authority review or formal dispute is active.");
  }

  let action = "monitor";
  let label = "Monitor market";
  let rationale = "Trading or resolution window has not reached the next actionable step.";
  let risk = "low";

  if (finalOutcome !== Outcome.Unresolved) {
    action = "no_action";
    label = "Finalized";
    rationale = `Market is finalized as ${outcomeName(finalOutcome)}. Users can claim/refund according to contract state.`;
  } else if (openReports > 0) {
    action = "owner_review";
    label = "Needs owner review";
    rationale = "User reports are open. Review rule/source/timing before proposing or finalizing.";
    risk = "high";
  } else if (market.disputed || market.authorityReviewRequired) {
    action = "authority_review";
    label = "Authority review";
    rationale = "A dispute or authority review flag blocks normal finalization.";
    risk = "high";
  } else if (Number(market.proposedAt || 0) > 0 && Number(market.disputeDeadline || 0) > 0 && now >= Number(market.disputeDeadline || 0)) {
    action = "finalize_proposed";
    label = "Finalize proposed result";
    rationale = `The dispute window has passed with proposed outcome ${outcomeName(proposedOutcome)}.`;
    risk = checks.length > 0 ? "medium" : "low";
  } else if (Number(market.proposedAt || 0) > 0) {
    action = "wait_dispute_window";
    label = "Wait dispute window";
    rationale = `Proposed outcome ${outcomeName(proposedOutcome)} is still inside the dispute window.`;
    risk = "low";
  } else if (now >= resolutionTime && (pools.yesPool === 0n || pools.noPool === 0n)) {
    action = "cancel_or_manual_review";
    label = "Cancel/refund review";
    rationale = "Resolution time has passed, but one outcome side has no pool.";
    risk = "high";
  } else if (now >= resolutionTime && (oracleOutcome !== Outcome.Unresolved || aiOutcome !== Outcome.Unresolved)) {
    action = "propose_result";
    label = "Propose result after evidence review";
    rationale = `Evidence exists: Oracle ${outcomeName(oracleOutcome)}, Aura AI ${outcomeName(aiOutcome)}.`;
    risk = checks.length > 0 ? "medium" : "low";
  } else if (now >= resolutionTime) {
    action = "run_ai_oracle";
    label = "Run Aura/Oracle review";
    rationale = "Resolution time has passed but no usable AI or Oracle decision is saved yet.";
    risk = "medium";
  }

  return {
    marketId,
    question: market.question,
    appUrl: `${PUBLIC_APP_BASE_URL}/?market=${encodeURIComponent(String(marketId))}`,
    action,
    label,
    rationale,
    risk,
    safety: {
      mode: "read-only",
      canWrite: false,
      note: "This preview never submits onchain transactions. Wallet or admin-authorized flows must perform final actions."
    },
    timing: {
      now,
      closeTime: Number(market.closeTime || 0),
      resolutionTime,
      proposedAt: Number(market.proposedAt || 0),
      disputeDeadline: Number(market.disputeDeadline || 0)
    },
    state: {
      finalOutcome: outcomeName(finalOutcome),
      proposedOutcome: outcomeName(proposedOutcome),
      disputed: Boolean(market.disputed),
      authorityReviewRequired: Boolean(market.authorityReviewRequired),
      openReports,
      pools: {
        yes: String(market.yesPool || "0"),
        no: String(market.noPool || "0"),
        total: pools.total.toString()
      }
    },
    evidence: {
      aiOutcome: outcomeName(aiOutcome),
      aiConfidence: Number(receipt?.ai?.confidence || 0),
      oracleOutcome: outcomeName(oracleOutcome),
      oracleConfidence: Number(proposal?.confidence || 0),
      oracleAdapter: proposal?.adapter || ""
    },
    checks,
    updatedAt: state.updatedAt || nowIso()
  };
}

function agentManifest() {
  return {
    name: "AuraPredict Agent API",
    version: "2026-06-15",
    network: "Arc Testnet",
    chainId: state.chainId || CHAIN_ID,
    contractAddress: CONTRACT_ADDRESS,
    appUrl: PUBLIC_APP_BASE_URL,
    apiBaseUrl: PUBLIC_API_BASE_URL,
    description:
      "Read-only market, evidence, oracle receipt, and reputation API for AI agents building around AuraPredict on Arc.",
    safety: {
      mode: "read-only by default",
      writeActions: "Onchain actions still require a connected wallet or admin-authorized resolver endpoint.",
      warning:
        "Agent responses are decision support only. Final settlement follows the market contract, evidence, dispute windows, and authority review."
    },
    endpoints: {
      health: `${PUBLIC_API_BASE_URL}/health`,
      markets: `${PUBLIC_API_BASE_URL}/api/agent/markets`,
      marketDetail: `${PUBLIC_API_BASE_URL}/api/agent/markets/{marketId}`,
      actionPreview: `${PUBLIC_API_BASE_URL}/api/agent/markets/{marketId}/action-preview`,
      mcpTools: `${PUBLIC_API_BASE_URL}/api/agent/mcp`,
      oracleReputation: `${PUBLIC_API_BASE_URL}/api/oracle-reputation`,
      oracleReceipt: `${PUBLIC_API_BASE_URL}/api/oracle-receipts/{marketId}`,
      hotMarkets: `${PUBLIC_API_BASE_URL}/api/ai/hot-markets`
    },
    tools: [
      {
        name: "aurapredict.list_markets",
        description: "List AuraPredict markets with status, pools, source URLs, and current oracle/AI hints.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
            status: { type: "string", enum: ["all", "live", "awaiting_resolution", "proposed", "finalized"] },
            category: { type: "string" }
          }
        }
      },
      {
        name: "aurapredict.get_market",
        description: "Read a market detail package with snapshots, trades, public oracle receipt, and social evidence.",
        inputSchema: {
          type: "object",
          required: ["marketId"],
          properties: {
            marketId: { type: "integer", minimum: 0 }
          }
        }
      },
      {
        name: "aurapredict.preview_market_action",
        description: "Read the next safe offchain/onchain workflow recommendation for a market without executing writes.",
        inputSchema: {
          type: "object",
          required: ["marketId"],
          properties: {
            marketId: { type: "integer", minimum: 0 }
          }
        }
      },
      {
        name: "aurapredict.get_oracle_reputation",
        description: "Read Aura Oracle Agent coverage, accuracy, confidence, adapter usage, and recent receipts.",
        inputSchema: { type: "object", properties: {} }
      }
    ],
    updatedAt: state.updatedAt || nowIso()
  };
}

function agentMcpTools() {
  const manifest = agentManifest();
  return {
    protocol: "mcp-compatible-http",
    name: manifest.name,
    apiBaseUrl: PUBLIC_API_BASE_URL,
    tools: manifest.tools.map((tool) => ({
      ...tool,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true
      }
    })),
    examples: [
      {
        tool: "aurapredict.list_markets",
        http: "GET /api/agent/markets?limit=20&status=live"
      },
      {
        tool: "aurapredict.get_market",
        http: "GET /api/agent/markets/89"
      },
      {
        tool: "aurapredict.preview_market_action",
        http: "GET /api/agent/markets/89/action-preview"
      },
      {
        tool: "aurapredict.get_oracle_reputation",
        http: "GET /api/oracle-reputation"
      }
    ],
    updatedAt: state.updatedAt || nowIso()
  };
}

function filterAgentMarkets(url) {
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 30)));
  const statusFilter = String(url.searchParams.get("status") || "all").trim().toLowerCase();
  const categoryFilter = String(url.searchParams.get("category") || "").trim().toLowerCase();
  return Object.values(state.markets)
    .filter((m) => !m.isDraft)
    .map(agentMarketSummary)
    .filter((market) => statusFilter === "all" || market.status === statusFilter)
    .filter((market) => !categoryFilter || String(market.category || "").toLowerCase() === categoryFilter)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
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

function isSportsScheduleMarket(market) {
  const text = oracleTextForMarket(market);
  return (
    /\b(mlb|major league baseball|nba|nfl|nhl|espn|soccer|football|sports?)\b/.test(text) &&
    /\b(schedule|scheduled|fixtures?|games?|matches?|scores?|final)\b/.test(text)
  );
}

function sourceRouterNoMatchCanSupportNo(market, sourceUrl) {
  if (isSportsScheduleMarket(market)) return false;
  const text = oracleTextForMarket(market);
  const sourceText = `${sourceUrl || ""} ${hostnameFor(sourceUrl)}`.toLowerCase();
  if (/\b(mlb|nba|nfl|nhl|espn)\b/.test(sourceText) && /\b(schedule|games|fixtures?|scores?)\b/.test(`${sourceText} ${text}`)) {
    return false;
  }
  return /\b(blog|post|article|news|publish|announcement|announce)\b/.test(text);
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
  if (!sourceRouterNoMatchCanSupportNo(market, sourceUrl)) {
    return autoEvidenceRow(
      market,
      sourceUrl,
      "Objective source scan: inconclusive source scan",
      `Aura Source Router scanned ${sourceUrl} before AI review. ${noMatchFinding} This source type can be dynamic or API-backed, so this is not proof of a negative result. Use a structured adapter, official API, or manual evidence before proposing YES/NO.`,
      "HTML/link scan was inconclusive; do not infer NO from this row."
    );
  }
  return autoEvidenceRow(
    market,
    sourceUrl,
    "Objective source scan: no matching item found",
    `Aura Source Router scanned ${sourceUrl} before AI review. ${noMatchFinding} The resolution deadline is ${deadlineIso}. For by-deadline publish/announce/blog/news markets on static source pages, this supports NO unless a user provides a qualifying source item.`,
    noMatchFinding
  );
}

function isSportsLikeMarket(market) {
  const text = oracleTextForMarket(market);
  return (
    String(market?.category || "").toLowerCase() === "sports" ||
    /\b(fifa|world cup|uefa|soccer|football|nba|nfl|mlb|nhl|match|fixture|score|standings?|group stage|winner)\b/.test(text)
  );
}

function evidenceSearchProviderConfig() {
  const providers = [
    { id: "brave", label: "Brave Search", key: BRAVE_SEARCH_API_KEY, keyCount: BRAVE_SEARCH_API_KEY ? 1 : 0 },
    { id: "tavily", label: "Tavily", key: TAVILY_API_KEYS[0] || "", keyCount: TAVILY_API_KEYS.length },
    { id: "serpapi", label: "SerpAPI", key: SERPAPI_API_KEY, keyCount: SERPAPI_API_KEY ? 1 : 0 }
  ];
  if (AUTO_EVIDENCE_SEARCH_PROVIDER) {
    return providers.find((provider) => provider.id === AUTO_EVIDENCE_SEARCH_PROVIDER && provider.key) || null;
  }
  return providers.find((provider) => provider.key) || null;
}

function tavilyApiKeyForAttempt(attempt) {
  if (TAVILY_API_KEYS.length === 0) return { key: "", index: -1 };
  const index = (tavilyKeyState.cursor + attempt) % TAVILY_API_KEYS.length;
  return { key: TAVILY_API_KEYS[index], index };
}

function advanceTavilyCursor(index) {
  if (TAVILY_API_KEYS.length === 0 || index < 0) return;
  tavilyKeyState.cursor = (index + 1) % TAVILY_API_KEYS.length;
}

function addEvidenceSearchQuery(rows, value) {
  const query = cleanText(value, 260);
  if (query && !rows.includes(query)) rows.push(query);
}

function evidenceSearchQueriesForMarket(market) {
  const question = cleanText(market?.question, 220);
  const rule = cleanText(stripRuleMetadata(market?.resolutionRule || market?.resolutionCriteria || ""), 360);
  const hosts = evidenceSourceUrlsForMarket(market)
    .map((url) => hostnameFor(url))
    .filter(Boolean);
  const rows = [];
  const base = question || rule;
  if (!base) return rows;

  addEvidenceSearchQuery(rows, `${base} official result`);
  if (rule && rule !== question) addEvidenceSearchQuery(rows, `${question} ${rule} official source`);

  if (isSportsLikeMarket(market)) {
    addEvidenceSearchQuery(rows, `${question} final score official result`);
    addEvidenceSearchQuery(rows, `${question} FIFA ESPN Olympics result`);
  }
  if (/\b(cpi|ppi|inflation|jobs report|nonfarm|fomc|fed|bls|bea|treasury|gdp)\b/.test(oracleTextForMarket(market))) {
    addEvidenceSearchQuery(rows, `${question} official economic release`);
  }
  if (/\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|token|price|binance|coingecko|coinmarketcap)\b/.test(oracleTextForMarket(market))) {
    addEvidenceSearchQuery(rows, `${question} official market data source`);
  }

  for (const host of hosts.slice(0, 4)) {
    addEvidenceSearchQuery(rows, `site:${host} ${base} result`);
  }

  return rows.slice(0, 6);
}

function normalizeEvidenceSearchResult(provider, query, value) {
  const title = cleanText(value?.title || value?.name || "", 180);
  const url = cleanUrl(value?.url || value?.link || value?.href || "");
  const snippet = cleanText(value?.snippet || value?.description || value?.content || value?.body || "", 700);
  if (!url && !snippet) return null;
  return {
    provider,
    query,
    title: title || hostnameFor(url) || "Search result",
    url,
    snippet
  };
}

async function searchBraveEvidence(query, count) {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(10, Math.max(1, count))),
    search_lang: "en",
    country: "US",
    safesearch: "moderate",
    text_decorations: "false"
  });
  const { response, body } = await fetchJsonWithTimeout(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    timeoutMs: AUTO_EVIDENCE_SEARCH_TIMEOUT_MS,
    headers: {
      "x-subscription-token": BRAVE_SEARCH_API_KEY
    }
  });
  if (!response.ok || typeof body !== "object" || body === null) {
    throw new Error(`Brave Search returned HTTP ${response.status}.`);
  }
  return (Array.isArray(body?.web?.results) ? body.web.results : [])
    .map((row) => normalizeEvidenceSearchResult("Brave Search", query, row))
    .filter(Boolean);
}

async function searchTavilyEvidence(query, count) {
  if (TAVILY_API_KEYS.length === 0) throw new Error("Tavily is not configured. Set TAVILY_API_KEY or TAVILY_API_KEYS.");

  let lastError = null;
  for (let attempt = 0; attempt < TAVILY_API_KEYS.length; attempt += 1) {
    const { key, index } = tavilyApiKeyForAttempt(attempt);
    if (!key) continue;

    const { response, body } = await fetchJsonWithTimeout("https://api.tavily.com/search", {
      method: "POST",
      timeoutMs: AUTO_EVIDENCE_SEARCH_TIMEOUT_MS,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        include_answer: false,
        max_results: Math.min(10, Math.max(1, count))
      })
    });

    if (response.ok && typeof body === "object" && body !== null) {
      advanceTavilyCursor(index);
      return (Array.isArray(body?.results) ? body.results : [])
        .map((row) => normalizeEvidenceSearchResult("Tavily", query, row))
        .filter(Boolean);
    }

    const message = typeof body === "object" && body !== null
      ? cleanText(body?.error || body?.detail || body?.message || JSON.stringify(body), 200)
      : cleanText(body, 200);
    lastError = new Error(`Tavily key ${index + 1}/${TAVILY_API_KEYS.length} returned HTTP ${response.status}${message ? `: ${message}` : ""}.`);

    if (![401, 403, 408, 409, 425, 429, 500, 502, 503, 504].includes(response.status)) break;
  }

  throw lastError || new Error("Tavily search failed.");
}

async function searchSerpApiEvidence(query, count) {
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: SERPAPI_API_KEY,
    num: String(Math.min(10, Math.max(1, count)))
  });
  const { response, body } = await fetchJsonWithTimeout(`https://serpapi.com/search.json?${params}`, {
    timeoutMs: AUTO_EVIDENCE_SEARCH_TIMEOUT_MS
  });
  if (!response.ok || typeof body !== "object" || body === null) {
    throw new Error(`SerpAPI returned HTTP ${response.status}.`);
  }
  return (Array.isArray(body?.organic_results) ? body.organic_results : [])
    .map((row) => normalizeEvidenceSearchResult("SerpAPI", query, row))
    .filter(Boolean);
}

async function runEvidenceSearch(provider, query, count) {
  if (provider.id === "brave") return searchBraveEvidence(query, count);
  if (provider.id === "tavily") return searchTavilyEvidence(query, count);
  if (provider.id === "serpapi") return searchSerpApiEvidence(query, count);
  return [];
}

async function gatherSearchEvidenceRows(market) {
  if (!AUTO_EVIDENCE_SEARCH_ENABLED || AUTO_EVIDENCE_SEARCH_MAX_RESULTS <= 0) return [];
  const provider = evidenceSearchProviderConfig();
  if (!provider) return [];

  const rows = [];
  const seen = new Set();
  let lastError = null;
  const sourceHosts = evidenceSourceUrlsForMarket(market)
    .map((url) => hostnameFor(url))
    .filter(Boolean);
  const candidateLimit = Math.max(AUTO_EVIDENCE_SEARCH_MAX_RESULTS, AUTO_EVIDENCE_SEARCH_MAX_RESULTS * 3);
  for (const query of evidenceSearchQueriesForMarket(market)) {
    try {
      const results = await runEvidenceSearch(provider, query, AUTO_EVIDENCE_SEARCH_MAX_RESULTS);
      for (const result of results) {
        const key = `${result.url || ""}|${normalizeMarketText(result.title || result.snippet || "")}`;
        if (!key.trim() || seen.has(key)) continue;
        seen.add(key);
        rows.push({
          ...result,
          score: scoreEvidenceSearchResult(market, result, sourceHosts)
        });
        if (rows.length >= candidateLimit) break;
      }
    } catch (error) {
      lastError = error;
    }
    if (rows.length >= candidateLimit) break;
  }

  if (rows.length === 0 && lastError) {
    return [
      autoEvidenceRow(
        market,
        "",
        "Objective web search: unavailable",
        `${provider.label} was configured for Aura evidence search, but the request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}.`,
        "Web evidence search failed; use source scans or manual evidence."
      )
    ];
  }

  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, AUTO_EVIDENCE_SEARCH_MAX_RESULTS)
    .map((result) =>
    autoEvidenceRow(
      market,
      result.url,
      `Objective web search: candidate evidence from ${result.provider}`,
      `${result.provider} query "${result.query}" returned "${result.title}"${result.url ? ` at ${result.url}` : ""}. Evidence rank ${result.score}. Snippet: ${result.snippet || "No snippet returned."} Treat this as candidate evidence: it must directly match the market rule, timestamp, and official-source policy before supporting YES or NO.`,
      result.snippet || result.title
    )
  );
}

async function gatherStructuredScheduleEvidenceRows(market) {
  const rows = [];
  const mlbConfig = detectMlbScheduleOracleMarket(market);
  if (mlbConfig) {
    try {
      const summary = await fetchMlbScheduleSummary(mlbConfig);
      const outcome = summary.count >= mlbConfig.threshold ? "YES" : "NO";
      const sample = summary.sample.length > 0 ? ` Sample games: ${summary.sample.join(" / ")}.` : "";
      rows.push(
        autoEvidenceRow(
          market,
          summary.apiUrl,
          "Objective source scan: structured MLB schedule count",
          `MLB Stats API reported ${summary.count} ${mlbConfig.regularOnly ? "regular season " : ""}game(s) for ${mlbConfig.date}. The market threshold is at least ${mlbConfig.threshold}. This supports ${outcome}.${sample}`,
          `${summary.count} game(s) counted; threshold ${mlbConfig.threshold}; ${outcome}.`
        )
      );
    } catch (error) {
      rows.push(
        autoEvidenceRow(
          market,
          mlbConfig.sourceUrl,
          "Objective source scan: MLB schedule API needs review",
          `Aura could not complete the structured MLB schedule check for ${mlbConfig.date}: ${error instanceof Error ? error.message : String(error)}. Do not infer YES or NO from a generic page scrape.`,
          "Structured schedule check failed; manual review required."
        )
      );
    }
  }

  const espnRows = await gatherEspnScoreboardEvidence(market, {
    timeoutMs: AUTO_EVIDENCE_SEARCH_TIMEOUT_MS || ORACLE_HTTP_TIMEOUT_MS,
    maxEvents: 8
  });
  for (const row of espnRows) {
    rows.push(autoEvidenceRow(market, row.url, row.title, row.notes, row.finding));
  }
  return rows;
}

async function gatherAutomaticEvidenceRows(market) {
  if (!AUTO_EVIDENCE_ENABLED || !market || !isContentDeadlineMarket(market)) return [];
  const now = Math.floor(Date.now() / 1000);
  const resolutionTime = marketResolutionTime(market);
  if (!resolutionTime || now < resolutionTime) return [];

  const structuredScheduleRows = await gatherStructuredScheduleEvidenceRows(market);
  if (structuredScheduleRows.length > 0) return structuredScheduleRows;

  const urls = evidenceSourceUrlsForMarket(market);
  const rows = [];
  if (urls.length === 0) {
    rows.push(
      autoEvidenceRow(
        market,
        "",
        "Objective source scan: no source URL configured",
        "Aura Source Router could not find a primary, fallback, or inferred source URL. Add an official source link before relying on Aura for this market.",
        "No source URL was available for automatic evidence collection."
      )
    );
    return [...rows, ...(await gatherSearchEvidenceRows(market))].slice(0, AUTO_EVIDENCE_MAX_ROWS);
  }

  for (const sourceUrl of urls) {
    const row = await scanSourceForEvidence(market, sourceUrl);
    rows.push(row);
    if (/qualifying item found/i.test(row.title || "")) break;
  }
  const hasQualifyingSource = rows.some((row) => /qualifying item found/i.test(row.title || ""));
  const searchRows = hasQualifyingSource ? [] : await gatherSearchEvidenceRows(market);
  return [...rows, ...searchRows].slice(0, AUTO_EVIDENCE_MAX_ROWS);
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

function oracleYesTextForMarket(market) {
  const structuredRule = structuredRuleForMarket(market);
  const rule = stripRuleMetadata(market?.resolutionRule);
  return [
    market?.question,
    market?.category,
    market?.metadataURI,
    market?.fallbackSourceURI,
    yesConditionTextFromRule(rule, rule),
    structuredRule ? JSON.stringify(structuredRule) : ""
  ]
    .map((value) => String(value || ""))
    .join(" ")
    .toLowerCase();
}

function priceConditionForMarket(market, structuredRule) {
  return priceConditionFromParts({
    rule: stripRuleMetadata(market?.resolutionRule),
    question: market?.question,
    category: market?.category,
    structuredRule
  });
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
    const condition = priceConditionForMarket(market, structuredRule);
    if (asset && condition) {
      return { ...asset, comparator: condition.comparator, target: condition.target, structuredRule };
    }
  }
  const text = oracleTextForMarket(market);
  const hasPriceContext =
    /\b(price|spot|traded?|trade|close|closing|open|usd|usdt|btc\/usd|eth\/usd|btc\/usdt|eth\/usdt|reach(?:es)?)\b/i.test(text) ||
    /\/usd[t]?\b/i.test(text) ||
    /\$\s*[0-9][0-9,]*/.test(text);
  if (!hasPriceContext) return null;
  const asset = CRYPTO_ORACLE_ASSETS.find((candidate) => candidate.names.some((name) => hasExactMarketTerm(text, name)));
  const condition = priceConditionForMarket(market, null);
  if (!asset || !condition) return null;
  return { ...asset, comparator: condition.comparator, target: condition.target };
}

const MACRO_ORACLE_ASSETS = [
  { symbol: "GOLD", names: ["gold", "xau", "gc=f"], yahoo: "GC=F", label: "Gold futures", unit: "USD/oz" },
  { symbol: "DXY", names: ["dxy", "dollar index", "us dollar index"], yahoo: "DX-Y.NYB", label: "US Dollar Index", unit: "index points" }
];

function detectMacroOracleMarket(market) {
  const structuredRule = structuredRuleForMarket(market);
  if (structuredRule?.kind === "macro-price") {
    const asset = MACRO_ORACLE_ASSETS.find((candidate) => candidate.symbol === String(structuredRule.asset || "").toUpperCase());
    const condition = priceConditionForMarket(market, structuredRule);
    if (asset && condition) {
      return { ...asset, comparator: condition.comparator, target: condition.target, structuredRule };
    }
  }
  const text = oracleTextForMarket(market);
  const asset = MACRO_ORACLE_ASSETS.find((candidate) => candidate.names.some((name) => hasExactMarketTerm(text, name)));
  const condition = priceConditionForMarket(market, null);
  if (!asset || !condition) return null;
  return { ...asset, comparator: condition.comparator, target: condition.target };
}

const BLS_RELEASE_CONFIGS = [
  {
    id: "cpi",
    label: "BLS CPI release",
    url: "https://www.bls.gov/news.release/cpi.nr0.htm",
    sourcePattern: /\/news\.release\/cpi\.nr0\.htm/i,
    textPattern: /\b(?:cpi|consumer price index|all items)\b/i
  },
  {
    id: "ppi",
    label: "BLS PPI release",
    url: "https://www.bls.gov/news.release/ppi.nr0.htm",
    sourcePattern: /\/news\.release\/ppi\.nr0\.htm/i,
    textPattern: /\b(?:ppi|producer price index|final demand)\b/i
  }
];

function releaseMonthYearFromText(text) {
  const match = String(text || "").match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
  if (!match) return null;
  return { month: match[1].toLowerCase().slice(0, 3), year: match[2] };
}

function detectBlsReleaseOracleMarket(market) {
  const text = oracleTextForMarket(market);
  const sourceUrls = marketSourceUrls(market);
  const config =
    BLS_RELEASE_CONFIGS.find((candidate) => sourceUrls.some((url) => candidate.sourcePattern.test(url))) ||
    BLS_RELEASE_CONFIGS.find((candidate) => candidate.textPattern.test(text));
  if (!config) return null;
  const condition = priceConditionForMarket(market, structuredRuleForMarket(market));
  if (!condition) return null;
  return {
    ...config,
    comparator: condition.comparator,
    target: condition.target,
    targetMonthYear: releaseMonthYearFromText(`${stripRuleMetadata(market?.resolutionRule)} ${market?.question || ""}`)
  };
}

// === FED RATE ORACLE (FRED DFEDTARU) ===

const FED_RATE_FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU";

function detectFedRateOracleMarket(market) {
  const text = oracleTextForMarket(market);
  if (!/\b(federal\s+funds|fed\s+rate|fomc|target\s+rate|upper\s+bound)\b/i.test(text)) return null;
  const condition = priceConditionForMarket(market, structuredRuleForMarket(market));
  if (!condition) return null;
  return { comparator: condition.comparator, target: condition.target };
}

async function buildFedRateOracleProposal(market, config) {
  const proposal = baseOracleProposal(market, "macro-fed-rate");
  proposal.comparator = config.comparator;
  proposal.targetValue = String(config.target);
  proposal.sourceUrls = ["https://www.federalreserve.gov/monetarypolicy/openmarket.htm", FED_RATE_FRED_URL];

  const resolutionTime = marketResolutionTime(market);
  const now = Math.floor(Date.now() / 1000);
  if (now < resolutionTime) {
    proposal.status = "not_ready";
    proposal.summary = "Oracle cannot evaluate this Fed rate market before the resolution timestamp.";
    return finalizeOracleProposal(proposal);
  }

  try {
    const response = await fetchTextWithTimeout(FED_RATE_FRED_URL);
    if (!response.ok || !response.text) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = `FRED DFEDTARU returned HTTP ${response.status}. Use manual review.`;
      return finalizeOracleProposal(proposal);
    }

    const lines = response.text.trim().split("\n").filter((line) => line && !line.startsWith("DATE"));
    if (lines.length === 0) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = "FRED DFEDTARU CSV returned no data rows.";
      return finalizeOracleProposal(proposal);
    }

    const lastLine = lines[lines.length - 1];
    const [dateStr, valueStr] = lastLine.split(",");
    const observed = Number(valueStr?.trim());
    if (!Number.isFinite(observed)) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = "FRED DFEDTARU CSV could not be parsed.";
      return finalizeOracleProposal(proposal);
    }

    const dataDate = Date.parse(String(dateStr || "").trim());
    if (!Number.isFinite(dataDate) || resolutionTime * 1000 - dataDate > 45 * 24 * 60 * 60 * 1000) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = `FRED data as of ${dateStr} may be stale for this market's resolution time. Use manual review.`;
      return finalizeOracleProposal(proposal);
    }

    const matched = compareObservedValue(observed, config.comparator, config.target);
    proposal.outcome = matched ? "YES" : "NO";
    proposal.confidence = 88;
    proposal.observedValue = `Fed funds upper bound ${observed}% (FRED as of ${dateStr})`;
    proposal.observedAt = nowIso();
    proposal.summary = `FRED DFEDTARU reported federal funds upper bound at ${observed}% as of ${dateStr}. Rule target is ${config.comparator.toUpperCase()} ${config.target}%.`;
    proposal.checks = [
      "Used FRED DFEDTARU (upper bound of Fed funds target range).",
      "Data freshness verified within 45 days of resolution time."
    ];
    return finalizeOracleProposal(proposal);
  } catch (error) {
    proposal.status = "needs_review";
    proposal.confidence = 0;
    proposal.summary = `Fed rate oracle failed: ${error instanceof Error ? error.message : String(error)}.`;
    return finalizeOracleProposal(proposal);
  }
}

// === EIA CRUDE OIL INVENTORY ORACLE ===

function detectEiaInventoryOracleMarket(market) {
  const text = oracleTextForMarket(market);
  if (!/\b(eia|energy information administration)\b/i.test(text)) return null;
  if (!/\b(crude oil|petroleum|inventory|inventories|barrels)\b/i.test(text)) return null;
  if (!/\b(draw|build|change|million barrels|mmbbl)\b/i.test(text)) return null;
  const condition = priceConditionForMarket(market, structuredRuleForMarket(market));
  if (!condition) return null;
  return { comparator: condition.comparator, target: condition.target };
}

async function buildEiaInventoryOracleProposal(market, config) {
  const proposal = baseOracleProposal(market, "macro-eia-inventory");
  proposal.comparator = config.comparator;
  proposal.targetValue = String(config.target);
  proposal.sourceUrls = ["https://www.eia.gov/petroleum/supply/weekly/", "https://www.eia.gov/dnav/pet/hist/WCRSTUS1w.htm"];

  const resolutionTime = marketResolutionTime(market);
  const now = Math.floor(Date.now() / 1000);
  if (now < resolutionTime) {
    proposal.status = "not_ready";
    proposal.summary = "Oracle cannot evaluate this EIA inventory market before the resolution timestamp.";
    return finalizeOracleProposal(proposal);
  }

  try {
    const response = await fetchTextWithTimeout("https://www.eia.gov/dnav/pet/hist/WCRSTUS1w.htm");
    if (!response.ok || !response.text) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = `EIA crude oil inventory page returned HTTP ${response.status}. Use manual review.`;
      return finalizeOracleProposal(proposal);
    }

    const plain = stripHtml(response.text).replace(/\s+/g, " ");
    const rows = [];
    const rowPattern = /(\d{4}-\d{2}-\d{2})\s+([\d,]+(?:\.\d+)?)/g;
    let match;
    while ((match = rowPattern.exec(plain)) !== null) {
      const val = Number(match[2].replace(/,/g, ""));
      if (Number.isFinite(val) && val > 100) {
        rows.push({ date: match[1], value: val });
      }
    }

    if (rows.length < 2) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = "EIA crude oil inventory page could not be parsed for weekly values. Use manual review.";
      return finalizeOracleProposal(proposal);
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));
    const latest = rows[0];
    const previous = rows[1];
    const change = latest.value - previous.value;
    const drawMb = -change;

    const matched = compareObservedValue(drawMb, config.comparator, config.target);
    proposal.outcome = matched ? "YES" : "NO";
    proposal.confidence = 72;
    proposal.observedValue = `EIA crude inventory change: ${change >= 0 ? "+" : ""}${change.toFixed(1)}M bbl (draw: ${drawMb.toFixed(1)}M bbl) week of ${latest.date}`;
    proposal.observedAt = nowIso();
    proposal.summary = `EIA weekly crude oil inventory changed ${change >= 0 ? "+" : ""}${change.toFixed(1)}M bbl (${previous.value.toFixed(1)} → ${latest.value.toFixed(1)}). Draw of ${drawMb.toFixed(1)}M bbl vs rule ${config.comparator.toUpperCase()} ${config.target}M bbl.`;
    proposal.checks = [
      "Scraped EIA WCRSTUS1 (U.S. commercial crude oil stocks) from eia.gov.",
      "Computed week-over-week inventory change. Positive draw = inventory decrease.",
      "Confidence capped at 72; verify with official EIA WPSR PDF before settlement."
    ];
    return finalizeOracleProposal(proposal);
  } catch (error) {
    proposal.status = "needs_review";
    proposal.confidence = 0;
    proposal.summary = `EIA inventory oracle failed: ${error instanceof Error ? error.message : String(error)}.`;
    return finalizeOracleProposal(proposal);
  }
}

const STOCK_ORACLE_ASSETS = [
  { symbol: "TSLA", names: ["tsla", "tesla"], yahoo: "TSLA", label: "Tesla (TSLA)" },
  { symbol: "NVDA", names: ["nvda", "nvidia"], yahoo: "NVDA", label: "NVIDIA (NVDA)" },
  { symbol: "AAPL", names: ["aapl", "apple"], yahoo: "AAPL", label: "Apple (AAPL)" },
  { symbol: "MSFT", names: ["msft", "microsoft"], yahoo: "MSFT", label: "Microsoft (MSFT)" },
  { symbol: "GOOGL", names: ["googl", "google", "alphabet"], yahoo: "GOOGL", label: "Alphabet (GOOGL)" },
  { symbol: "AMZN", names: ["amzn", "amazon"], yahoo: "AMZN", label: "Amazon (AMZN)" },
  { symbol: "META", names: ["meta", "facebook"], yahoo: "META", label: "Meta (META)" },
  { symbol: "MSTR", names: ["mstr", "microstrategy", "strategy"], yahoo: "MSTR", label: "MicroStrategy (MSTR)" },
  { symbol: "AMD", names: ["amd", "advanced micro devices"], yahoo: "AMD", label: "AMD (AMD)" },
  { symbol: "COIN", names: ["coin", "coinbase"], yahoo: "COIN", label: "Coinbase (COIN)" },
  { symbol: "PLTR", names: ["pltr", "palantir"], yahoo: "PLTR", label: "Palantir (PLTR)" },
  { symbol: "NFLX", names: ["nflx", "netflix"], yahoo: "NFLX", label: "Netflix (NFLX)" },
  { symbol: "HOOD", names: ["hood", "robinhood"], yahoo: "HOOD", label: "Robinhood (HOOD)" }
];

const STOCK_TICKER_BLOCKLIST = new Set([
  "AI",
  "API",
  "CPI",
  "ETF",
  "NO",
  "USD",
  "USDC",
  "UTC",
  "YES"
]);

function normalizeStockTicker(value) {
  const ticker = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  if (!ticker || ticker.length > 8 || STOCK_TICKER_BLOCKLIST.has(ticker)) return "";
  return ticker;
}

function stockTickerFromYahooUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split("/").map((part) => decodeURIComponent(part)).filter(Boolean);
    if (host.includes("finance.yahoo.com")) {
      const quoteIndex = parts.findIndex((part) => part.toLowerCase() === "quote");
      if (quoteIndex >= 0) return normalizeStockTicker(parts[quoteIndex + 1]);
    }
    if (host.includes("query1.finance.yahoo.com") || host.includes("query2.finance.yahoo.com")) {
      const chartIndex = parts.findIndex((part) => part.toLowerCase() === "chart");
      if (chartIndex >= 0) return normalizeStockTicker(parts[chartIndex + 1]);
    }
  } catch {
    return "";
  }
  return "";
}

function stockAssetFromTicker(ticker) {
  const symbol = normalizeStockTicker(ticker);
  if (!symbol) return null;
  const known = STOCK_ORACLE_ASSETS.find((asset) => asset.symbol === symbol || asset.yahoo.toUpperCase() === symbol);
  return known || { symbol, names: [symbol.toLowerCase()], yahoo: symbol, label: `${symbol} stock` };
}

function stockAssetFromText(rawText) {
  const text = String(rawText || "");
  const known = STOCK_ORACLE_ASSETS.find((asset) => asset.names.some((name) => hasExactMarketTerm(text.toLowerCase(), name)));
  if (known) return known;

  const parenthetical = text.match(/\(([A-Z][A-Z0-9.-]{0,7})\)/);
  if (parenthetical) return stockAssetFromTicker(parenthetical[1]);

  const explicitTicker =
    text.match(/\b([A-Z][A-Z0-9.-]{0,7})\s+(?:stock|shares?|equity)\b/) ||
    text.match(/\b(?:ticker|symbol)\s*[:=]?\s*([A-Z][A-Z0-9.-]{0,7})\b/);
  if (explicitTicker) return stockAssetFromTicker(explicitTicker[1]);
  return null;
}

function isStockOracleText(text) {
  return /\b(?:stock|shares?|equity|official closing price|market close|yahoo finance|finance\.yahoo|nasdaq|nyse|tesla|apple|nvidia|microsoft|microstrategy|coinbase|palantir)\b/i.test(
    String(text || "")
  );
}

function detectStockOracleMarket(market) {
  const structuredRule = structuredRuleForMarket(market);
  const sourceUrls = marketSourceUrls(market);
  const sourceTicker = sourceUrls.map(stockTickerFromYahooUrl).find(Boolean);
  const text = [
    market?.question,
    market?.category,
    market?.metadataURI,
    market?.fallbackSourceURI,
    stripRuleMetadata(market?.resolutionRule)
  ]
    .map((value) => String(value || ""))
    .join(" ");
  const structuredAsset =
    structuredRule?.kind === "stock-price" || structuredRule?.kind === "equity-price"
      ? stockAssetFromTicker(structuredRule.asset)
      : null;
  const asset = structuredAsset || stockAssetFromTicker(sourceTicker) || (isStockOracleText(text) ? stockAssetFromText(text) : null);
  const condition = priceConditionForMarket(market, structuredRule);
  if (!asset || !condition) return null;
  const date = extractScheduleDate(`${stripRuleMetadata(market?.resolutionRule)} ${market?.question || ""}`, marketResolutionTime(market));
  return { ...asset, comparator: condition.comparator, target: condition.target, date, structuredRule };
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

const MONTH_NUMBER_BY_NAME = new Map([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12]
]);

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function isoDateFromParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y}-${padDatePart(m)}-${padDatePart(d)}`;
}

function isoDateFromUtcSeconds(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  const date = new Date(value * 1000);
  return isoDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function extractScheduleDate(text, fallbackSeconds = 0) {
  const raw = String(text || "");
  const iso = /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/.exec(raw);
  if (iso) return isoDateFromParts(iso[1], iso[2], iso[3]);

  const monthDate = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+([0-3]?\d)(?:st|nd|rd|th)?(?:,\s*|\s+)(20\d{2})\b/i.exec(raw);
  if (monthDate) {
    const month = MONTH_NUMBER_BY_NAME.get(monthDate[1].toLowerCase().replace(/\.$/, ""));
    return isoDateFromParts(monthDate[3], month, monthDate[2]);
  }

  const fallbackDate = isoDateFromUtcSeconds(fallbackSeconds);
  if (!fallbackDate) return "";
  const fallbackYear = Number(fallbackDate.slice(0, 4));
  const monthDay = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+([0-3]?\d)(?:st|nd|rd|th)?\b/i.exec(raw);
  if (monthDay) {
    const month = MONTH_NUMBER_BY_NAME.get(monthDay[1].toLowerCase().replace(/\.$/, ""));
    return isoDateFromParts(fallbackYear, month, monthDay[2]);
  }
  return fallbackDate;
}

function parseSmallNumberWord(value) {
  const normalized = String(value || "").toLowerCase();
  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20
  };
  return words[normalized] || null;
}

function extractGameThreshold(text) {
  const value = String(text || "").toLowerCase().replace(/\s+/g, " ");
  const numericPatterns = [
    /\bat least\s+(\d+)\s+(?:scheduled\s+)?(?:mlb\s+)?(?:regular season\s+)?games?\b/i,
    /\b(\d+)\s+or\s+more\s+(?:scheduled\s+)?(?:mlb\s+)?(?:regular season\s+)?games?\b/i,
    /\blist(?:s|ed)?\s+(?:at\s+least\s+)?(\d+)\s+(?:scheduled\s+)?(?:mlb\s+)?(?:regular season\s+)?games?\b/i,
    /\b>=\s*(\d+)\s+games?\b/i
  ];
  for (const pattern of numericPatterns) {
    const match = value.match(pattern);
    const parsed = Number(match?.[1]);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  const wordPatterns = [
    /\bat least\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:scheduled\s+)?(?:mlb\s+)?(?:regular season\s+)?games?\b/i,
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+or\s+more\s+(?:scheduled\s+)?(?:mlb\s+)?(?:regular season\s+)?games?\b/i
  ];
  for (const pattern of wordPatterns) {
    const match = value.match(pattern);
    const parsed = parseSmallNumberWord(match?.[1]);
    if (parsed) return parsed;
  }

  if (/\bat least one\s+(?:scheduled\s+)?(?:mlb\s+)?(?:regular season\s+)?game\b/i.test(value)) return 1;
  return null;
}

function detectMlbScheduleOracleMarket(market) {
  const text = oracleTextForMarket(market);
  if (!/\b(mlb|major league baseball)\b/.test(text)) return null;
  if (!/\b(schedule|scheduled|games?|list|regular season)\b/.test(text)) return null;
  const threshold = extractGameThreshold(text);
  if (!threshold) return null;
  const resolutionTime = marketResolutionTime(market);
  const date = extractScheduleDate(text, resolutionTime);
  if (!date) return null;
  return {
    league: "MLB",
    date,
    threshold,
    regularOnly: /\bregular season\b/.test(text),
    sourceUrl: "https://www.mlb.com/schedule"
  };
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const { timeoutMs = ORACLE_HTTP_TIMEOUT_MS, ...fetchOptions } = options;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "AuraPredictOracle/1.0",
        ...(fetchOptions.headers || {})
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

async function fetchMlbScheduleSummary(config) {
  const apiUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(config.date)}`;
  const { response, body } = await fetchJsonWithTimeout(apiUrl);
  if (!response.ok || typeof body !== "object" || body === null) {
    throw new Error(`MLB schedule API returned HTTP ${response.status}.`);
  }

  const dates = Array.isArray(body.dates) ? body.dates : [];
  const games = dates.flatMap((row) => (Array.isArray(row?.games) ? row.games : []));
  const filteredGames = config.regularOnly
    ? games.filter((game) => !game?.gameType || String(game.gameType).toUpperCase() === "R")
    : games;
  const sample = filteredGames.slice(0, 5).map((game) => {
    const away = cleanText(game?.teams?.away?.team?.name || "Away", 80);
    const home = cleanText(game?.teams?.home?.team?.name || "Home", 80);
    const status = cleanText(game?.status?.detailedState || game?.status?.abstractGameState || "", 40);
    return `${away} @ ${home}${status ? ` (${status})` : ""}`;
  });

  return {
    apiUrl,
    count: filteredGames.length,
    totalGames: Number(body.totalGames || filteredGames.length),
    sample
  };
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

function markOracleProposalNeedsReview(proposal, reason) {
  const safetyReason = cleanText(reason || "Oracle proposal did not pass deterministic safety checks.", 260);
  proposal.status = "needs_review";
  proposal.outcome = "NEEDS_REVIEW";
  proposal.outcomeValue = Outcome.Unresolved;
  proposal.confidence = Math.min(Number(proposal.confidence || 0), 20);
  proposal.checks = [
    `Safety guard: ${safetyReason}`,
    ...(Array.isArray(proposal.checks) ? proposal.checks : [])
  ].slice(0, 8);
  proposal.summary = cleanText(
    [proposal.summary, `Safety guard: ${safetyReason}`].filter(Boolean).join(" "),
    700
  );
  return proposal;
}

function proposalOutcome(proposal) {
  return outcomeName(proposal?.outcome || proposal?.outcomeValue);
}

function numericOracleIntegrityIssue(proposal, market) {
  return numericOracleIntegrityIssueFromParts({
    rule: stripRuleMetadata(market?.resolutionRule),
    question: market?.question,
    category: market?.category,
    structuredRule: structuredRuleForMarket(market),
    proposalComparator: proposal.comparator,
    proposalTargetValue: proposal.targetValue,
    observedValue: proposal.observedValue,
    actualOutcome: proposalOutcome(proposal)
  });
}

function scheduleCountOracleIntegrityIssue(proposal) {
  const observed = parseNumericValue(proposal.observedValue);
  const target = parseNumericValue(proposal.targetValue);
  if (observed === null || target === null) {
    return "Schedule oracle proposal is missing a parseable observed count or threshold.";
  }
  const expected = observed >= target ? "YES" : "NO";
  const actual = proposalOutcome(proposal);
  if (actual !== expected) {
    return `Schedule oracle outcome ${actual} conflicts with observed count ${observed} >= ${target}; expected ${expected}.`;
  }
  return "";
}

function healthOracleIntegrityIssue(proposal, market) {
  const text = oracleYesTextForMarket(market);
  const hasPositiveHealthIntent = /\b(ok\s*[:=]?\s*true|return\s+ok|http\s+ok|status\s+ok|2xx|200|available|reachable|online|operational)\b/i.test(text);
  const hasNegativeHealthIntent = /\b(down|offline|unreachable|unavailable|fail(?:ed|ing)?|error response|not reachable|not return|cannot be reached|outage)\b/i.test(text);
  if (hasNegativeHealthIntent && !hasPositiveHealthIntent) {
    return "Negative health-status wording requires manual review because the health adapter only proves positive availability.";
  }
  if (!hasPositiveHealthIntent) {
    return "Health adapter requires an explicit positive status condition such as ok=true, HTTP 200, online, or reachable.";
  }

  const statusMatch = String(proposal.observedValue || "").match(/http\s+(\d+)/i);
  const status = parseNumericValue(statusMatch?.[1]);
  const okMatch = String(proposal.observedValue || "").match(/\bok=(true|false)\b/i);
  const jsonOk = okMatch ? okMatch[1].toLowerCase() === "true" : null;
  const httpOk = status !== null && status >= 200 && status < 300;
  const wantsOkTrue = /ok["'\s:=]*true|ok\s+true|return\s+ok/i.test(text);
  const expected = wantsOkTrue ? httpOk && jsonOk === true : httpOk;
  const actual = proposalOutcome(proposal);
  if ((expected ? "YES" : "NO") !== actual) {
    return `Health oracle outcome ${actual} conflicts with observed ${proposal.observedValue || "status"}; expected ${expected ? "YES" : "NO"}.`;
  }
  return "";
}

function statusPageOracleIntegrityIssue(proposal, market) {
  const text = oracleYesTextForMarket(market);
  const hasNegatedStatusIntent =
    /\b(no|without|avoid|avoids|free of|resolved|none|normal|stable|operational)\b.{0,60}\b(incident|outage|downtime|degraded|down)\b/i.test(text) ||
    /\b(incident|outage|downtime|degraded|down)\b.{0,60}\b(no|without|resolved|none|normal|stable|operational)\b/i.test(text);
  const hasActiveIncidentIntent =
    /\b(active|ongoing|unresolved|major|current)\b.{0,70}\b(incident|outage|downtime|degraded|down)\b/i.test(text) ||
    /\b(incident|outage|downtime|degraded|down)\b.{0,70}\b(active|ongoing|unresolved|major|current)\b/i.test(text);
  if (hasNegatedStatusIntent || !hasActiveIncidentIntent) {
    return "Status-page adapter only auto-resolves active incident markets; negated or historical uptime wording needs manual review.";
  }

  const observed = parseNumericValue(proposal.observedValue);
  if (observed === null) return "Status-page oracle proposal has no parseable incident count.";
  const expected = observed > 0 ? "YES" : "NO";
  const actual = proposalOutcome(proposal);
  if (actual !== expected) {
    return `Status-page oracle outcome ${actual} conflicts with observed active incident count ${observed}; expected ${expected}.`;
  }
  return "";
}

function sportsScoreboardOracleIntegrityIssue(proposal) {
  const text = `${proposal.summary || ""} ${proposal.observedValue || ""} ${(proposal.checks || []).join(" ")}`;
  if (!/\b(matched one completed scoreboard row|completed scoreboard row)\b/i.test(text)) {
    return "Sports scoreboard oracle must match exactly one completed structured scoreboard row before proposing YES or NO.";
  }
  if (!/\b(final|\[final\]|ft|full time|completed)\b/i.test(text)) {
    return "Sports scoreboard oracle outcome is missing final/completed status evidence.";
  }
  return "";
}

function oracleProposalIntegrityIssue(proposal, market) {
  if (!proposal || !market) return "Market or proposal is missing.";
  if (!["ready", "proposed"].includes(String(proposal.status || ""))) return "";
  if (!["YES", "NO"].includes(proposalOutcome(proposal))) return "";

  const adapter = String(proposal.adapter || "");
  if (adapter === "crypto-price" || adapter === "stock-yahoo-chart" || adapter === "macro-yahoo-chart" || adapter === "macro-bls-release") {
    return numericOracleIntegrityIssue(proposal, market);
  }
  if (adapter === "mlb-schedule") return scheduleCountOracleIntegrityIssue(proposal);
  if (adapter === "sports-scoreboard") return sportsScoreboardOracleIntegrityIssue(proposal);
  if (adapter === "status-health") return healthOracleIntegrityIssue(proposal, market);
  if (adapter === "status-page") return statusPageOracleIntegrityIssue(proposal, market);
  return "";
}

function finalizeOracleProposal(proposal) {
  const outcome = outcomeName(proposal.outcome);
  proposal.outcome = outcome === "INSUFFICIENT_EVIDENCE" ? "NEEDS_REVIEW" : outcome;
  proposal.outcomeValue = outcomeValue(proposal.outcome);
  proposal.status = proposal.outcomeValue === Outcome.Unresolved ? proposal.status || "needs_review" : "ready";
  const safetyIssue = oracleProposalIntegrityIssue(proposal, state.markets[String(proposal.marketId)]);
  if (safetyIssue) markOracleProposalNeedsReview(proposal, safetyIssue);
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
        proposal.observedValue = `${config.symbol}/USDT close ${observed}`;
        proposal.observedAt = new Date(Number(row[0])).toISOString();

        // Dual-source cross-check: verify with CoinGecko historical price
        let crossCheckNote = "";
        try {
          const cgDate = new Date(resolutionTime * 1000);
          const cgDateStr = `${String(cgDate.getUTCDate()).padStart(2, "0")}-${String(cgDate.getUTCMonth() + 1).padStart(2, "0")}-${cgDate.getUTCFullYear()}`;
          const cgUrl = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(config.coingecko)}/history?date=${cgDateStr}&localization=false`;
          const { response: cgRes, body: cgBody } = await fetchJsonWithTimeout(cgUrl, { timeoutMs: 5000 });
          const cgPrice = Number(cgBody?.market_data?.current_price?.usd);
          if (cgRes.ok && Number.isFinite(cgPrice) && cgPrice > 0) {
            const deviation = Math.abs(observed - cgPrice) / cgPrice;
            if (deviation <= 0.005) {
              proposal.confidence = 96;
              crossCheckNote = `CoinGecko historical confirmed: ${cgPrice} (deviation ${(deviation * 100).toFixed(2)}%).`;
            } else if (deviation <= 0.02) {
              proposal.confidence = 85;
              crossCheckNote = `CoinGecko historical ${cgPrice} differs ${(deviation * 100).toFixed(2)}% from Binance — within tolerance.`;
            } else {
              proposal.confidence = 60;
              crossCheckNote = `CoinGecko historical ${cgPrice} differs ${(deviation * 100).toFixed(2)}% from Binance — sources disagree, use manual review.`;
            }
          } else {
            proposal.confidence = 92;
            crossCheckNote = "CoinGecko historical cross-check unavailable; using Binance only.";
          }
        } catch {
          proposal.confidence = 92;
          crossCheckNote = "CoinGecko cross-check failed; using Binance only.";
        }

        proposal.summary = `${config.symbol}/USDT Binance 1-minute close was ${observed}. Rule target is ${config.comparator.toUpperCase()} ${config.target}. ${crossCheckNote}`;
        proposal.checks = [
          "Binance 1-minute kline matched the requested resolution minute.",
          crossCheckNote,
          "If the market requires another source, review manually before final settlement."
        ].filter(Boolean);
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

function parseBlsReleaseObservedValue(config, htmlText) {
  const plain = stripHtml(htmlText).replace(/\s+/g, " ").trim();
  if (!plain) return null;

  if (config.id === "cpi") {
    const direct =
      plain.match(/\ball items index (?:rose|increased) (-?\d+(?:\.\d+)?) percent over the 12 months ending (?:in )?([A-Za-z]+)\b/i) ||
      plain.match(/\bover the 12 months ending (?:in )?([A-Za-z]+),? the all items index (?:rose|increased) (-?\d+(?:\.\d+)?) percent\b/i);
    if (direct) {
      const monthFirst = Number.isNaN(Number(direct[1]));
      return {
        value: Number(monthFirst ? direct[2] : direct[1]),
        month: String(monthFirst ? direct[1] : direct[2]).toLowerCase().slice(0, 3),
        label: "CPI all items 12-month percent change"
      };
    }
  }

  if (config.id === "ppi") {
    const up = plain.match(/\bfinal demand (?:rose|increased|advanced) (-?\d+(?:\.\d+)?) percent in ([A-Za-z]+)\b/i);
    if (up) {
      return {
        value: Number(up[1]),
        month: String(up[2]).toLowerCase().slice(0, 3),
        label: "PPI final demand monthly percent change"
      };
    }
    const down = plain.match(/\bfinal demand (?:fell|declined|decreased) (-?\d+(?:\.\d+)?) percent in ([A-Za-z]+)\b/i);
    if (down) {
      return {
        value: -Number(down[1]),
        month: String(down[2]).toLowerCase().slice(0, 3),
        label: "PPI final demand monthly percent change"
      };
    }
    const unchanged = plain.match(/\bfinal demand (?:was )?unchanged in ([A-Za-z]+)\b/i);
    if (unchanged) {
      return {
        value: 0,
        month: String(unchanged[1]).toLowerCase().slice(0, 3),
        label: "PPI final demand monthly percent change"
      };
    }
  }

  return null;
}

async function buildBlsReleaseOracleProposal(market, config) {
  const proposal = baseOracleProposal(market, "macro-bls-release");
  proposal.comparator = config.comparator;
  proposal.targetValue = String(config.target);
  proposal.sourceUrls = [config.url];

  const resolutionTime = marketResolutionTime(market);
  const now = Math.floor(Date.now() / 1000);
  if (now < resolutionTime) {
    proposal.status = "not_ready";
    proposal.summary = "Oracle cannot evaluate this BLS release market before the resolution timestamp.";
    return finalizeOracleProposal(proposal);
  }

  try {
    const response = await fetchTextWithTimeout(config.url);
    if (!response.ok || !response.text) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = `${config.label} returned HTTP ${response.status}. Use manual review.`;
      proposal.checks = ["Do not infer NO from an unavailable official release page."];
      return finalizeOracleProposal(proposal);
    }

    const plain = stripHtml(response.text).replace(/\s+/g, " ");
    const observed = parseBlsReleaseObservedValue(config, response.text);
    if (!observed || !Number.isFinite(observed.value)) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = `${config.label} was reachable but Aura could not parse the required CPI/PPI value from the official release text.`;
      proposal.checks = ["Use BLS release tables/manual review before proposing YES or NO."];
      return finalizeOracleProposal(proposal);
    }

    if (config.targetMonthYear?.month && observed.month && config.targetMonthYear.month !== observed.month) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = `${config.label} parsed ${observed.label} for ${observed.month.toUpperCase()}, but the market asks for ${config.targetMonthYear.month.toUpperCase()} ${config.targetMonthYear.year}.`;
      proposal.checks = ["Do not reuse a different release month for this market."];
      return finalizeOracleProposal(proposal);
    }

    if (config.targetMonthYear?.year && !plain.includes(config.targetMonthYear.year)) {
      proposal.status = "needs_review";
      proposal.confidence = 0;
      proposal.summary = `${config.label} did not clearly expose the market year ${config.targetMonthYear.year} in the fetched release text.`;
      proposal.checks = ["Use the official archived release or BLS table matching the requested year."];
      return finalizeOracleProposal(proposal);
    }

    const matched = compareObservedValue(observed.value, config.comparator, config.target);
    proposal.outcome = matched ? "YES" : "NO";
    proposal.confidence = 84;
    proposal.observedValue = `${observed.label}: ${observed.value}%`;
    proposal.observedAt = nowIso();
    proposal.summary = `${config.label} reported ${observed.observedLabel || observed.label} at ${observed.value}%. Rule target is ${config.comparator.toUpperCase()} ${config.target}.`;
    proposal.checks = ["Used BLS official release HTML.", "Parsed the numeric percent from the release text and compared it with the market rule."];
    return finalizeOracleProposal(proposal);
  } catch (error) {
    proposal.status = "needs_review";
    proposal.confidence = 0;
    proposal.summary = `${config.label} check failed: ${error instanceof Error ? error.message : String(error)}.`;
    proposal.checks = ["Use BLS official release/manual review before proposing YES or NO."];
    return finalizeOracleProposal(proposal);
  }
}

function utcStartSecondsForIsoDate(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  const seconds = Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0) / 1000);
  return Number.isFinite(seconds) ? seconds : 0;
}

function weekdayForIsoDate(isoDate) {
  const start = utcStartSecondsForIsoDate(isoDate);
  if (!start) return -1;
  return new Date(start * 1000).getUTCDay();
}

async function buildStockYahooProposal(market, config) {
  const proposal = baseOracleProposal(market, "stock-yahoo-chart");
  proposal.comparator = config.comparator;
  proposal.targetValue = String(config.target);
  proposal.sourceUrls = [
    `https://finance.yahoo.com/quote/${encodeURIComponent(config.yahoo)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.yahoo)}`
  ];

  const resolutionTime = marketResolutionTime(market);
  const now = Math.floor(Date.now() / 1000);
  if (now < resolutionTime) {
    proposal.status = "not_ready";
    proposal.summary = "Oracle cannot evaluate this stock market before the resolution timestamp.";
    return finalizeOracleProposal(proposal);
  }

  const date = config.date || isoDateFromUtcSeconds(resolutionTime);
  const dayStart = utcStartSecondsForIsoDate(date);
  if (!date || !dayStart) {
    proposal.status = "needs_review";
    proposal.confidence = 0;
    proposal.summary = "Stock oracle could not determine the exact trading date from the market rule.";
    proposal.checks = ["Add an explicit YYYY-MM-DD or Month Day, Year date to stock close markets."];
    return finalizeOracleProposal(proposal);
  }

  const weekday = weekdayForIsoDate(date);
  if (weekday === 0 || weekday === 6) {
    proposal.status = "needs_review";
    proposal.confidence = 0;
    proposal.summary = `${config.label} market resolves on ${date}, which is a weekend. Manual review or Cancel is required according to the rule.`;
    proposal.checks = ["Yahoo daily bars are expected only for exchange trading days.", "Do not infer NO from a missing weekend trading bar."];
    return finalizeOracleProposal(proposal);
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.yahoo)}?period1=${dayStart}&period2=${dayStart + 3 * 24 * 60 * 60}&interval=1d`;
  proposal.sourceUrls = [...proposal.sourceUrls, yahooUrl];
  try {
    const { response, body } = await fetchJsonWithTimeout(yahooUrl);
    const result = body?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    let matchedIndex = -1;
    timestamps.forEach((timestamp, index) => {
      const close = Number(closes[index]);
      const timestampDate = isoDateFromUtcSeconds(Number(timestamp));
      if (timestampDate === date && Number.isFinite(close)) matchedIndex = index;
    });

    if (response.ok && matchedIndex >= 0) {
      const observed = Number(closes[matchedIndex]);
      const matched = compareObservedValue(observed, config.comparator, config.target);
      proposal.outcome = matched ? "YES" : "NO";
      proposal.confidence = 94;
      proposal.observedValue = `${config.symbol} close ${observed}`;
      proposal.observedAt = new Date(Number(timestamps[matchedIndex]) * 1000).toISOString();
      proposal.summary = `${config.label} Yahoo daily close for ${date} was ${observed}. Rule target is ${config.comparator.toUpperCase()} ${config.target}.`;
      proposal.checks = [
        "Yahoo daily chart returned a bar matching the exact rule date.",
        "The observed close is compared only against the YES branch comparator and target."
      ];
      return finalizeOracleProposal(proposal);
    }

    proposal.checks.push(`Yahoo chart returned no daily close row for ${config.symbol} on ${date}.`);
  } catch (error) {
    proposal.checks.push(`Yahoo stock chart lookup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  proposal.status = "needs_review";
  proposal.confidence = 0;
  proposal.summary = `${config.label} daily close for ${date} was not available from Yahoo with an exact matching trading-day bar. Manual review is required.`;
  proposal.checks = [
    ...proposal.checks,
    "Do not auto-resolve YES/NO from a missing or shifted stock market bar.",
    "If the date was a market holiday or the source has no official close, follow the market's Cancel/manual rule."
  ].slice(0, 8);
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

async function buildMlbScheduleOracleProposal(market, config) {
  const proposal = baseOracleProposal(market, "mlb-schedule");
  proposal.sourceUrls = [config.sourceUrl, `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(config.date)}`];
  proposal.comparator = "gte";
  proposal.targetValue = String(config.threshold);

  try {
    const summary = await fetchMlbScheduleSummary(config);
    const matched = summary.count >= config.threshold;
    proposal.outcome = matched ? "YES" : "NO";
    proposal.confidence = 96;
    proposal.observedValue = `${summary.count} ${config.regularOnly ? "regular season " : ""}MLB game(s) listed for ${config.date}`;
    proposal.observedAt = nowIso();
    proposal.summary = `MLB Stats API listed ${summary.count} ${config.regularOnly ? "regular season " : ""}game(s) for ${config.date}. Rule target is at least ${config.threshold}.`;
    proposal.checks = [
      "Used MLB Stats API instead of a generic HTML page scrape.",
      summary.sample.length > 0 ? `Sample games: ${summary.sample.join(" / ")}` : "No game rows were returned for this date."
    ];
    return finalizeOracleProposal(proposal);
  } catch (error) {
    proposal.status = "needs_review";
    proposal.confidence = 0;
    proposal.summary = `MLB schedule adapter could not verify ${config.date}: ${error instanceof Error ? error.message : String(error)}. Use official source evidence and authority review.`;
    proposal.checks = ["Do not infer NO from a dynamic schedule page that did not expose parseable HTML items."];
    return finalizeOracleProposal(proposal);
  }
}

async function buildSportsScoreboardOracleProposal(market) {
  const snapshots = await gatherEspnScoreboardSnapshot(market, {
    timeoutMs: AUTO_EVIDENCE_SEARCH_TIMEOUT_MS || ORACLE_HTTP_TIMEOUT_MS,
    maxEvents: 8
  });
  const evidenceRows = snapshots.map((row) => ({
    url: row.apiUrl,
    title: `Objective source scan: ESPN ${row.profile?.label || "Sports"} scoreboard`,
    notes: row.notes,
    finding: row.finding
  }));
  if (evidenceRows.length === 0) {
    return buildUnsupportedOracleProposal(
      market,
      "sports-manual",
      "No structured sports adapter matched this market. Use the official league/source link and authority review."
    );
  }

  const proposal = baseOracleProposal(market, "sports-scoreboard");
  const simpleEvaluation = evaluateSimpleSportsMarket(market, snapshots);
  if (simpleEvaluation) {
    proposal.outcome = simpleEvaluation.outcome;
    proposal.confidence = simpleEvaluation.confidence;
    proposal.observedValue = simpleEvaluation.observedValue;
    proposal.observedAt = nowIso();
    proposal.sourceUrls = [...new Set(evidenceRows.map((row) => row.url).filter(Boolean))];
    proposal.summary = simpleEvaluation.summary;
    proposal.checks = simpleEvaluation.checks;
    return finalizeOracleProposal(proposal);
  }

  proposal.status = "needs_review";
  proposal.confidence = 45;
  proposal.sourceUrls = [...new Set(evidenceRows.map((row) => row.url).filter(Boolean))];
  proposal.summary = "Structured sports scoreboard evidence was found, but this market still needs AI/authority review to compare the rows against the exact rule, timestamp, and official-source policy.";
  proposal.checks = evidenceRows
    .map((row) => cleanText(row.finding || row.notes, 220))
    .filter(Boolean)
    .slice(0, 6);
  if (proposal.checks.length === 0) {
    proposal.checks = ["Structured scoreboard adapter returned rows, but no concise finding could be extracted."];
  }
  return finalizeOracleProposal(proposal);
}

async function buildUnsupportedOracleProposal(market, adapter, summary) {
  const proposal = baseOracleProposal(market, adapter);
  proposal.status = "unsupported";
  proposal.confidence = 0;
  proposal.summary = summary;
  proposal.checks = ["Use Aura Agent and authority/committee review for this market type."];
  return finalizeOracleProposal(proposal);
}

function oracleProposalNeedsRuleRefresh(proposal, market) {
  if (!proposal || !market) return false;
  if (!["crypto-price", "stock-yahoo-chart", "macro-yahoo-chart"].includes(String(proposal.adapter || ""))) return false;
  const condition = priceConditionForMarket(market, structuredRuleForMarket(market));
  if (!condition) return false;
  const proposalComparator = String(proposal.comparator || "");
  const proposalTarget = parseNumericValue(proposal.targetValue);
  if (!NUMERIC_COMPARATORS.has(proposalComparator) || proposalTarget === null) return true;
  return proposalComparator !== condition.comparator || significantTargetMismatch(proposalTarget, condition.target);
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

  const blsReleaseConfig = detectBlsReleaseOracleMarket(market);
  if (blsReleaseConfig) return buildBlsReleaseOracleProposal(market, blsReleaseConfig);

  const fedRateConfig = detectFedRateOracleMarket(market);
  if (fedRateConfig) return buildFedRateOracleProposal(market, fedRateConfig);

  const eiaInventoryConfig = detectEiaInventoryOracleMarket(market);
  if (eiaInventoryConfig) return buildEiaInventoryOracleProposal(market, eiaInventoryConfig);

  const cryptoConfig = detectCryptoOracleMarket(market);
  if (cryptoConfig) return buildCryptoOracleProposal(market, cryptoConfig);

  const stockConfig = detectStockOracleMarket(market);
  if (stockConfig) return buildStockYahooProposal(market, stockConfig);

  const macroConfig = detectMacroOracleMarket(market);
  if (macroConfig) return buildMacroOracleProposal(market, macroConfig);

  const statusConfig = detectStatusOracleMarket(market);
  if (statusConfig) return buildStatusPageOracleProposal(market, statusConfig);

  const mlbScheduleConfig = detectMlbScheduleOracleMarket(market);
  if (mlbScheduleConfig) return buildMlbScheduleOracleProposal(market, mlbScheduleConfig);

  if (String(market.category || "").toLowerCase() === "sports") {
    return buildSportsScoreboardOracleProposal(market);
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

  const integrityIssue = oracleProposalIntegrityIssue(proposal, market);
  if (integrityIssue) return { ok: false, reason: `Oracle safety guard blocked auto-propose: ${integrityIssue}` };

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
  const functionName = isV5Contract()
    ? outcome === Outcome.Canceled
      ? "proposeCancel"
      : "proposeOutcome"
    : isStablecoinContract() && noLiquidity && outcome === Outcome.Canceled
      ? "cancelEmptyMarket"
      : outcome === Outcome.Canceled
        ? "cancel"
        : "resolve";
  const args = isV5Contract()
    ? functionName === "proposeCancel"
      ? [BigInt(proposal.marketId), evidenceHash, receiptHash]
      : [
          BigInt(proposal.marketId),
          legacyOutcomeToV5(outcome),
          evidenceHash,
          receiptHash,
          V5_NO_OUTCOME,
          legacyOutcomeToV5(outcome),
          Math.max(0, Math.min(10_000, Math.round(Number(proposal.confidence || 0) * 100))),
          keccak256(stringToHex(String(proposal.adapter || "oracle")))
        ]
    : isV4Contract() || isV3Contract()
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
      if (oracleProposalNeedsRuleRefresh(proposal, market)) return true;
      if (proposal.autoProposeError) return false;
      return ["not_ready", "ready", "error"].includes(String(proposal.status || ""));
    })
    .slice(0, 5);

  for (const market of candidates) {
    try {
      const existing = oracleState()[String(market.id)];
      const proposal =
        existing &&
        existing.status === "ready" &&
        outcomeValue(existing.outcome || existing.outcomeValue) !== Outcome.Unresolved &&
        !oracleProposalNeedsRuleRefresh(existing, market)
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

function marketHasOpenReport(marketId) {
  const reports = socialState().reports[String(marketId)] ?? [];
  return reports.some((report) => report.status === "open");
}

async function runAutoFinalizeSweep() {
  // finalize(uint256) is the V5 signature; older contracts use a different path.
  if (!isV5Contract() || !hasResolverSigner()) return;
  const now = Math.floor(Date.now() / 1000);
  const candidates = Object.values(state.markets)
    .filter((market) => market.outcome === Outcome.Unresolved)
    .filter((market) => Number(market.proposedAt || 0) > 0)
    .filter((market) => !market.disputed)
    .filter((market) => !market.authorityReviewRequired)
    .filter((market) => !marketHasOpenReport(market.id))
    .filter((market) => Number(market.disputeDeadline || 0) > 0 && now >= Number(market.disputeDeadline))
    .slice(0, 5);

  for (const market of candidates) {
    try {
      const txHash = await writeResolverContract("finalize", [BigInt(market.id)]);
      market.autoFinalizedAt = nowIso();
      market.autoFinalizedTx = txHash;
      console.log(`[auto-finalize] market ${market.id} finalized tx=${txHash}`);
      await saveState();
    } catch (error) {
      console.error(`[auto-finalize] market ${market.id} error:`, error instanceof Error ? error.message : String(error));
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

function configuredGroqKeys() {
  const unique = new Set();
  for (const key of GROQ_API_KEYS) unique.add(key);
  if (GROQ_API_KEY) unique.add(GROQ_API_KEY);
  return [...unique];
}

function nextGroqKey() {
  const keys = configuredGroqKeys();
  if (keys.length === 0) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const index = (groqKeyState.cursor + attempt) % keys.length;
    const key = keys[index];
    const cooldownUntil = groqKeyState.cooldownUntilByKey.get(key) || 0;
    if (cooldownUntil <= now) {
      groqKeyState.cursor = (index + 1) % keys.length;
      return key;
    }
  }
  const fallbackIndex = groqKeyState.cursor % keys.length;
  groqKeyState.cursor = (fallbackIndex + 1) % keys.length;
  return keys[fallbackIndex];
}

class AiProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AiProviderError";
    this.provider = options.provider || "unknown";
    this.status = options.status || 0;
    this.retryable = Boolean(options.retryable);
    this.retryAfterMs = Number(options.retryAfterMs) || 0;
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

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
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

// Multi-turn chat completion for the Aura AI assistant. Groq is tried first
// (independent GROQ_API_KEY), then the OpenAI-compatible config as a fallback.
// Both speak the OpenAI chat-completions shape, so one helper covers both.
async function callOpenAiCompatibleChat({ apiKey, baseUrl, model, messages, provider = "groq" }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Chat request failed with status ${response.status}.`;
    const retryAfterHeader = Number(response.headers.get("retry-after"));
    throw new AiProviderError(message, {
      provider,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      retryAfterMs: Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : 0
    });
  }
  const text = body?.choices?.[0]?.message?.content || "";
  return { json: extractJsonObject(text), model };
}

// Try each configured Groq key in turn. Groq rate limits are per-key, so on a
// 429 we put that key on a short cooldown and immediately try the next one.
async function callGroqChat(messages) {
  const keys = configuredGroqKeys();
  if (keys.length === 0) {
    throw new AiProviderError("Groq is not configured. Set GROQ_API_KEY or GROQ_API_KEYS.", {
      provider: "groq",
      retryable: false
    });
  }
  let lastError = null;
  for (let i = 0; i < keys.length; i += 1) {
    const key = nextGroqKey();
    if (!key) break;
    try {
      return await callOpenAiCompatibleChat({ apiKey: key, baseUrl: GROQ_BASE_URL, model: GROQ_MODEL, messages, provider: "groq" });
    } catch (error) {
      lastError = error;
      if (error instanceof AiProviderError && error.status === 429) {
        groqKeyState.cooldownUntilByKey.set(key, Date.now() + GROQ_RATE_LIMIT_COOLDOWN_MS);
      }
      // Only keep cycling keys on transient errors; a hard error (bad request,
      // auth) would fail on every key, so surface it right away.
      const retryable = error instanceof AiProviderError ? error.retryable : false;
      if (!retryable) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// Flatten an OpenAI-style messages array into Gemini's (systemInstruction,
// prompt) shape so the assistant chat can fall back to Gemini, which has its
// own multi-key rotation and is resilient to single-key rate limits.
async function callGeminiChat(messages) {
  const systemInstruction = messages.find((m) => m.role === "system")?.content || "";
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
    .join("\n");
  const result = await callGeminiJson(systemInstruction, turns);
  return { json: result.json, model: result.model };
}

const ASSISTANT_MAX_RETRY_WAIT_MS = 3500;

async function callAssistantChat(messages) {
  // Provider order: Groq (fast) → Gemini (multi-key, rate-limit resilient) →
  // OpenAI. Each provider gets one retry on a transient (429/5xx) error.
  const attempts = [];
  if (configuredGroqKeys().length > 0) {
    attempts.push({ provider: "groq", run: () => callGroqChat(messages) });
  }
  if (configuredGeminiKeys().length > 0) {
    attempts.push({ provider: "gemini", run: () => callGeminiChat(messages) });
  }
  if (OPENAI_API_KEY) {
    attempts.push({
      provider: "openai",
      run: () => callOpenAiCompatibleChat({ apiKey: OPENAI_API_KEY, baseUrl: OPENAI_BASE_URL, model: OPENAI_MODEL, messages, provider: "openai" })
    });
  }
  if (attempts.length === 0) {
    throw new Error("Aura AI assistant is not configured. Set GROQ_API_KEY/GROQ_API_KEYS (recommended), GEMINI_API_KEY, or OPENAI_API_KEY.");
  }

  let lastError = null;
  for (const attempt of attempts) {
    for (let tryNo = 0; tryNo < 2; tryNo += 1) {
      try {
        const result = await attempt.run();
        return { ...result, provider: attempt.provider };
      } catch (error) {
        lastError = error;
        const retryable = error instanceof AiProviderError ? error.retryable : false;
        // Retry the same provider once on a transient error, honoring
        // retry-after (capped) so a brief Groq rate-limit self-heals.
        if (retryable && tryNo === 0) {
          const waitMs = Math.min(error.retryAfterMs || 600, ASSISTANT_MAX_RETRY_WAIT_MS);
          console.warn(`[assistant] ${attempt.provider} transient error (${error.status || "?"}); retrying in ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }
        console.warn(`[assistant] ${attempt.provider} failed: ${error instanceof Error ? error.message : String(error)}`);
        break; // move to next provider
      }
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
      '  "resolutionCriteria": "Exact YES/NO/Cancel rule. Must include: (1) the measured value or event, (2) the exact threshold or condition, (3) the exact UTC deadline (YYYY-MM-DD HH:MM UTC), (4) the official source URL to check. Example: \'YES if BTC price on Binance (https://www.binance.com/en/trade/BTC_USDT) reaches $100,000 at any point before 2026-06-20 00:00 UTC. NO otherwise. CANCEL if Binance is unavailable.\'",',
      '  "sources": ["https://exact-page-url.com/specific-path", "https://second-source.com/specific-path"],',
      '  "clarityScore": 0-100,',
      '  "duplicateRisk": "LOW|MEDIUM|HIGH",',
      '  "riskFlags": ["short issue labels"],',
      '  "creatorNote": "one short warning or guidance sentence"',
      "}",
      "Use UTC. Avoid subjective criteria. If the market is ambiguous, rewrite it to be measurable.",
      "If the user idea contains an explicit date or deadline, preserve that date in question, closeTime, and resolutionCriteria. Do not replace it with Preferred close time unless the user provided no date.",
      "For sports tournament winner/champion questions, set closeTime to the official final match date or tournament end date, not the short Preferred close time. For the 2026 FIFA World Cup, the final is on 2026-07-19; use that as the resolution date unless the user asks a different World Cup market.",
      "For sports fixtures or 'next match' questions, do not assume a team participates or has a next match in that competition. If the fixture is not known from the user-provided text/source context, rewrite creatorNote and riskFlags to require official fixture verification before launch.",
      "For sports group-stage, standings, qualification, or team-participation questions, require an official competition page or fixture/standings source. Do not infer group membership or schedule from memory.",
      "If a sports tournament winner/champion question has no explicit deadline and you cannot identify the final/end date from reliable context, set riskFlags to include 'official final date required' and do not use the short Preferred close time as the final deadline.",
      "For stock market questions, avoid creating an official closing-price rule on a weekend or market holiday. If the requested date is not a trading day, keep the user's date visible and add riskFlags including 'non-trading day'. Do not silently replace the date.",
      "For sources: ALWAYS provide full https:// URLs, never source names alone. Use the most specific page possible — for crypto use the exact coin/pair page (e.g. https://coinmarketcap.com/currencies/bitcoin/ or https://www.binance.com/en/trade/BTC_USDT), for stocks use the exact quote page (e.g. https://finance.yahoo.com/quote/TSLA/), for sports use the official fixture or standings page, for macro use the exact data release page (e.g. https://www.bls.gov/news.release/cpi.nr0.htm). Never use a homepage-only URL like https://coinmarketcap.com or https://www.coingecko.com with no path. If the specific page URL is unknown, add 'source URL required' to riskFlags.",
      "Only set duplicateRisk MEDIUM or HIGH when a similar market has the same concrete subject/entity and substantially overlapping outcome window.",
      "Do not raise duplicateRisk just because two markets share a metric such as 10K users, active addresses, volume, or the same category.",
      "Broad-scope markets such as 'any Arc dApp' are not duplicates of a named project market unless the named project already satisfies the same exact broad market outcome."
    ].join("\n")
  };
}

function normalizeDraftCategory(value, fallback = "Other") {
  const category = cleanText(value, 40);
  const allowed = new Set(["Crypto", "Macro", "Sports", "Politics", "Arc", "AI", "Other"]);
  if (allowed.has(category)) return category;
  const normalized = category.toLowerCase();
  if (normalized.includes("crypto")) return "Crypto";
  if (normalized.includes("sport") || normalized.includes("football") || normalized.includes("soccer")) return "Sports";
  if (normalized.includes("macro") || normalized.includes("stock") || normalized.includes("finance")) return "Macro";
  if (normalized.includes("politic") || normalized.includes("election")) return "Politics";
  if (normalized.includes("arc")) return "Arc";
  if (normalized.includes("ai")) return "AI";
  return allowed.has(fallback) ? fallback : "Other";
}

function normalizeDraftCloseTime(value) {
  const raw = cleanText(value, 80);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (match) return `${match[1]}T${match[2]}`;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 16);
  return "";
}

function defaultDraftSources(category, idea) {
  const text = `${category} ${idea}`.toLowerCase();
  if (category === "Crypto") {
    if (text.includes("btc") || text.includes("bitcoin")) return ["https://www.binance.com/en/trade/BTC_USDT", "https://coinmarketcap.com/currencies/bitcoin/"];
    if (text.includes("eth") || text.includes("ethereum")) return ["https://www.binance.com/en/trade/ETH_USDT", "https://coinmarketcap.com/currencies/ethereum/"];
    if (text.includes("sol") || text.includes("solana")) return ["https://www.binance.com/en/trade/SOL_USDT", "https://coinmarketcap.com/currencies/solana/"];
    return ["https://www.binance.com/en/markets", "https://coinmarketcap.com/"];
  }
  if (category === "Sports") return ["https://www.fifa.com/", "https://www.espn.com/"];
  if (category === "Macro") return ["https://fred.stlouisfed.org/", "https://www.bls.gov/"];
  if (category === "Politics") return ["Official election authority or government source", "Major wire-service result page"];
  if (category === "Arc") return ["https://docs.arc.network/", "https://testnet.arcscan.app/"];
  if (category === "AI") return ["Official company blog or status page", "Primary product announcement page"];
  return ["Official primary source URL required"];
}

function normalizeMarketDraft(rawDraft, body, similarMarkets, options = {}) {
  const idea = cleanText(body.idea || body.question, 900);
  const fallbackCategory = normalizeDraftCategory(body.category, "Other");
  const category = normalizeDraftCategory(rawDraft?.category, fallbackCategory);
  const closeTime = normalizeDraftCloseTime(rawDraft?.closeTime) || normalizeDraftCloseTime(body.closeTime);
  const question = cleanText(rawDraft?.question, 180) || idea;
  const rawSources = Array.isArray(rawDraft?.sources) ? rawDraft.sources : [];
  const sources = rawSources.map((source) => cleanText(source, 180)).filter(Boolean).slice(0, 5);
  const riskFlags = Array.isArray(rawDraft?.riskFlags)
    ? rawDraft.riskFlags.map((flag) => cleanText(flag, 80)).filter(Boolean).slice(0, 8)
    : [];
  if (options.fallbackReason) riskFlags.unshift("AI provider fallback");
  if (sources.length === 0) riskFlags.push("source verification required");

  const resolutionCriteria =
    cleanText(rawDraft?.resolutionCriteria, 1200) ||
    `Resolve YES if the official primary source confirms the event described in the question by ${closeTime || "the configured resolution time"}. Resolve NO if the condition is not met by that time. Resolve CANCEL only if the official source is unavailable, contradictory, or the market cannot be fairly resolved.`;

  return {
    question,
    category,
    closeTime,
    resolutionCriteria,
    sources: sources.length ? sources : defaultDraftSources(category, idea),
    clarityScore: Math.max(0, Math.min(100, Number(rawDraft?.clarityScore || (options.fallbackReason ? 62 : 75)))),
    duplicateRisk: ["LOW", "MEDIUM", "HIGH"].includes(rawDraft?.duplicateRisk)
      ? rawDraft.duplicateRisk
      : duplicateRiskFor(similarMarkets),
    similarMarkets,
    riskFlags,
    creatorNote:
      cleanText(rawDraft?.creatorNote, 220) ||
      (options.fallbackReason
        ? "Aura provider is currently unavailable, so this is a conservative fallback draft. Review source, date, and rule before launch."
        : "Review source, date, and rule before launch.")
  };
}

function resolutionPrompt(body) {
  const marketId = Number(body.marketId);
  const market = Number.isInteger(marketId) ? state.markets[String(marketId)] : null;
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 12) : [];
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
    "If evidence includes a structured sports schedule count from an official league API, compare the observed count against the market threshold and use that result.",
    "If evidence includes Objective web search rows, treat them as candidate sources. Use them only when the snippet/URL directly match the rule, event, timestamp, and official-source policy.",
    "For sports schedules, fixtures, scores, or dynamic app pages, a generic no-match HTML/link scan is inconclusive. Do not infer NO from that row; use structured count evidence or return INSUFFICIENT_EVIDENCE.",
    "Never say a sports match, event, or release has not occurred solely because Aura's source scanner failed to parse a dynamic page. Say the automated evidence could not verify it unless another evidence row proves YES or NO.",
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
    "If the evidence contains a structured schedule count from an official league API, compare the count against the market threshold and use that result.",
    "If the evidence contains Objective web search candidate rows, use them only when the URL/snippet directly matches the market rule, event, timestamp, and official-source policy. Prefer official league, government, exchange, or primary publisher sources over generic snippets.",
    "If the evidence contains an Objective source scan row, treat it as Aura's source router result. A qualifying item found supports YES. A no matching item found row supports NO only for static by-deadline publish, announce, blog, or news pages when the row explicitly says it supports NO.",
    "For sports schedule, fixture, scores, or dynamic app pages, a generic no-match HTML/link scan is inconclusive. Never infer NO from that row; return INSUFFICIENT_EVIDENCE unless a structured adapter/API or user evidence proves the count/result.",
    "If an Objective source scan says inconclusive source scan, schedule API needs review, or structured schedule check failed, return INSUFFICIENT_EVIDENCE unless another evidence row proves YES or NO.",
    "If an Objective source scan says matching items need timestamp review, do not invent a timestamp. Prefer INSUFFICIENT_EVIDENCE unless another evidence row proves the required time window.",
    "If an Objective source scan says no source URL is configured, return INSUFFICIENT_EVIDENCE and ask for an official source link.",
    "Never claim an event has not happened solely because a dynamic page scan was inconclusive. If the scanner cannot verify it and no other evidence proves the outcome, say the automated evidence could not verify the result.",
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
  const evidenceRows = [...oracleEvidenceRowsForMarket(marketId), ...automaticEvidenceRows, ...suppliedEvidenceRows].slice(0, AUTO_EVIDENCE_MAX_ROWS);
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

  const reviews = await Promise.all(
    roles.map(async (role) => {
      const review = await callAiJson(systemInstruction, resolutionReviewerPrompt(market, evidenceRows, role));
      return { ...review.json, provider: review.provider, model: review.model };
    })
  );

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
  const functionName = isV5Contract()
    ? receipt.proposedOutcomeValue === Outcome.Canceled
      ? "proposeCancel"
      : "proposeOutcome"
    : isStablecoinContract() && noLiquidity
      ? "cancelEmptyMarket"
      : isV4Contract() && isSignature(receipt.attestation) && receipt.proposedOutcomeValue !== Outcome.Canceled
        ? "resolveWithAiAttestation"
        : receipt.proposedOutcomeValue === Outcome.Canceled
          ? "cancel"
          : "resolve";
  const args = isV5Contract()
    ? functionName === "proposeCancel"
      ? [BigInt(receipt.marketId), evidenceHash, receiptHash]
      : [
          BigInt(receipt.marketId),
          legacyOutcomeToV5(receipt.proposedOutcomeValue),
          evidenceHash,
          receiptHash,
          legacyOutcomeToV5(receipt.proposedOutcomeValue),
          V5_NO_OUTCOME,
          0,
          ZERO_HASH
        ]
    : isV4Contract()
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
  const abi = currentContractAbi();
  const eventNames = new Set(
    isV5Contract() ? V5_EVENT_NAMES : isV4Contract() ? V4_EVENT_NAMES : isV3Contract() ? V3_EVENT_NAMES : V2_EVENT_NAMES
  );
  // One getLogs per chunk for all events at once. Per-event queries multiply the
  // request count (~1 per event name), which falls behind on free-tier RPCs that
  // cap the block range to a small window. viem decodes and tags each log's eventName.
  const allEvents = await eventClient.getContractEvents({
    address: CONTRACT_ADDRESS,
    abi,
    fromBlock,
    toBlock
  });
  const logs = allEvents.filter((log) => eventNames.has(log.eventName));

  logs.sort((a, b) => {
    const blockOrder = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
    if (blockOrder !== 0) return blockOrder;
    return Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
  });

  for (const log of logs) {
    await processEvent(log.eventName, log);
  }
}

async function reconcileActivityFromEvents(options = {}) {
  await detectContractVersion();
  const latestBlock = await eventClient.getBlockNumber();
  const deploymentStart = await resolveStartBlock(latestBlock);
  const requestedFrom = toBigint(options.fromBlock);
  const requestedTo = toBigint(options.toBlock);
  const fromBlock = requestedFrom > 0n ? requestedFrom : deploymentStart;
  const toBlock = requestedTo > 0n && requestedTo < latestBlock ? requestedTo : latestBlock;

  if (fromBlock > toBlock) {
    throw new Error(`Invalid reconcile range: fromBlock ${fromBlock} is after toBlock ${toBlock}.`);
  }

  const before = activityReconciliationSummary();
  let scannedRanges = 0;
  let current = fromBlock;
  while (current <= toBlock) {
    const end = current + CHUNK_SIZE - 1n > toBlock ? toBlock : current + CHUNK_SIZE - 1n;
    await syncRange(current, end);
    current = end + 1n;
    scannedRanges += 1;
  }

  if (toBigint(state.lastIndexedBlock) < toBlock) {
    state.lastIndexedBlock = toBlock.toString();
  }
  await refreshContractState();
  computeStats();
  state.updatedAt = nowIso();
  await saveState();
  return {
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    scannedRanges,
    before,
    after: state.stats.activityReconciliation
  };
}

async function hasContractCode(blockNumber) {
  const code = await eventClient.getCode({ address: CONTRACT_ADDRESS, blockNumber });
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
    const runtime = indexerRuntimeState();
    runtime.lastSyncStartedAt = nowIso();
    runtime.lastSyncError = "";
    if (!CONTRACT_ADDRESS || !isAddress(CONTRACT_ADDRESS)) {
      throw new Error("Missing AURA_INDEXER_CONTRACT_ADDRESS or VITE_PREDICTION_MARKET_ADDRESS.");
    }

    try {
      const latestBlock = await eventClient.getBlockNumber();
      runtime.lastSyncTargetBlock = latestBlock.toString();
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

      // Full on-chain reconcile is throttled (events keep state fresh between).
      if (!lastContractRefresh || Date.now() - lastContractRefresh >= CONTRACT_REFRESH_MS) {
        await refreshContractState();
        lastContractRefresh = Date.now();
      }
      computeStats();
      if (ORACLE_AUTO_RUN) {
        await runAutoOracleSweep();
      }
      if (RESOLUTION_AUTO_RUN) {
        await runAutoResolutionSweep();
      }
      if (AUTO_FINALIZE) {
        await runAutoFinalizeSweep();
      }
      runtime.lastSyncedAt = nowIso();
      runtime.lastSyncError = "";
      runtime.lastSyncErrorAt = null;
      state.updatedAt = nowIso();
      await saveState();
      return state;
    } catch (error) {
      runtime.lastSyncError = syncErrorMessage(error);
      runtime.lastSyncErrorAt = nowIso();
      await saveState().catch(() => {});
      throw error;
    }
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
      const evidenceSearchProvider = evidenceSearchProviderConfig();
      json(res, 200, {
        ok: Boolean(CONTRACT_ADDRESS && isAddress(CONTRACT_ADDRESS)),
        contractAddress: CONTRACT_ADDRESS,
        chainId: state.chainId,
        updatedAt: state.updatedAt,
        lastIndexedBlock: state.lastIndexedBlock,
        marketCount: state.marketCount,
        indexer: indexerRuntimeState(),
        features: {
          socialReports: true,
          socialNotifications: true,
          oracleReceipts: true,
          evidenceSearch: {
            enabled: AUTO_EVIDENCE_SEARCH_ENABLED,
            configured: Boolean(evidenceSearchProvider),
            provider: evidenceSearchProvider?.id || "",
            keyCount: evidenceSearchProvider?.keyCount || 0
          },
          realtimeSync: Boolean(realtimeClient)
        }
      });
      return;
    }

    if (url.pathname === "/api/sync") {
      void syncOnce();
      json(res, 202, { ok: true, status: "sync started" });
      return;
    }

    if (url.pathname === "/api/agent" || url.pathname === "/.well-known/aurapredict-agent.json") {
      if (req.method !== "GET") return notFound(res);
      json(res, 200, agentManifest());
      return;
    }

    if (url.pathname === "/api/agent/mcp" || url.pathname === "/.well-known/aurapredict-mcp.json") {
      if (req.method !== "GET") return notFound(res);
      json(res, 200, agentMcpTools());
      return;
    }

    if (segments[0] === "api" && segments[1] === "agent" && segments[2] === "markets" && !segments[3]) {
      if (req.method !== "GET") return notFound(res);
      json(res, 200, {
        markets: filterAgentMarkets(url),
        total: state.marketCount,
        updatedAt: state.updatedAt || nowIso()
      });
      return;
    }

    if (
      segments[0] === "api" &&
      segments[1] === "agent" &&
      segments[2] === "markets" &&
      segments[3] &&
      segments[4] === "action-preview"
    ) {
      if (req.method !== "GET") return notFound(res);
      const marketId = Number(segments[3]);
      const preview = Number.isInteger(marketId) ? agentActionPreview(marketId) : null;
      if (!preview) return notFound(res);
      json(res, 200, { preview, updatedAt: state.updatedAt || nowIso() });
      return;
    }

    if (segments[0] === "api" && segments[1] === "agent" && segments[2] === "markets" && segments[3]) {
      if (req.method !== "GET") return notFound(res);
      const marketId = Number(segments[3]);
      const market = Number.isInteger(marketId) ? state.markets[String(marketId)] : null;
      if (!market) return notFound(res);
      const social = socialState();
      const snapshots = state.snapshots
        .filter((snapshot) => snapshot.marketId === marketId)
        .sort((a, b) => a.timestamp - b.timestamp);
      json(res, 200, {
        market: agentMarketSummary(market),
        insight: aiInsightForMarket(market),
        receipt: publicOracleReceiptForMarket(marketId),
        oracleProposal: oracleState()[String(marketId)] || null,
        social: {
          evidence: social.evidence[String(marketId)] ?? [],
          comments: (social.comments[String(marketId)] ?? []).slice(-20),
          reports: social.reports[String(marketId)] ?? []
        },
        snapshots,
        trades: tradesForMarket(marketId).slice(0, 200),
        updatedAt: state.updatedAt || nowIso()
      });
      return;
    }

    if (url.pathname === "/api/admin/reconcile") {
      if (req.method !== "POST") return notFound(res);
      if (!adminAuthorized(req)) return json(res, 401, { error: "Unauthorized." });
      const body = await readRequestBody(req);
      const result = await reconcileActivityFromEvents({
        fromBlock: body.fromBlock || url.searchParams.get("fromBlock"),
        toBlock: body.toBlock || url.searchParams.get("toBlock")
      });
      json(res, 200, { ok: true, ...result, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === "/api/wallet/circle/config") {
      json(res, 200, { enabled: circleWalletsEnabled(), appId: circleAppId() });
      return;
    }

    if (url.pathname === "/api/wallet/circle/login/email-otp") {
      if (req.method !== "POST") return notFound(res);
      if (!circleWalletsEnabled()) return json(res, 503, { error: "Circle wallets are not configured." });
      const body = await readRequestBody(req);
      const deviceId = cleanText(body.deviceId, 128);
      const email = cleanText(body.email, 160);
      if (!deviceId || !email || !email.includes("@")) return json(res, 400, { error: "Missing deviceId or valid email." });
      try {
        json(res, 200, await circleEmailLoginToken({ deviceId, email }));
      } catch (error) {
        console.error("[circle] email-otp error:", error instanceof Error ? error.message : String(error));
        json(res, 502, { error: "Could not start email login." });
      }
      return;
    }

    if (url.pathname === "/api/wallet/circle/login/social") {
      if (req.method !== "POST") return notFound(res);
      if (!circleWalletsEnabled()) return json(res, 503, { error: "Circle wallets are not configured." });
      const body = await readRequestBody(req);
      const deviceId = cleanText(body.deviceId, 128);
      if (!deviceId) return json(res, 400, { error: "Missing deviceId." });
      try {
        json(res, 200, await circleSocialLoginToken({ deviceId }));
      } catch (error) {
        console.error("[circle] social-login error:", error instanceof Error ? error.message : String(error));
        json(res, 502, { error: "Could not start social login." });
      }
      return;
    }

    if (url.pathname === "/api/wallet/circle/init-wallet") {
      if (req.method !== "POST") return notFound(res);
      if (!circleWalletsEnabled()) return json(res, 503, { error: "Circle wallets are not configured." });
      const body = await readRequestBody(req);
      const userToken = cleanText(body.userToken, 4096);
      if (!userToken) return json(res, 400, { error: "Missing userToken." });
      try {
        json(res, 200, await circleInitWalletByToken(userToken));
      } catch (error) {
        console.error("[circle] init-wallet error:", error instanceof Error ? error.message : String(error));
        json(res, 502, { error: "Could not initialize the wallet." });
      }
      return;
    }

    if (url.pathname === "/api/wallet/circle/wallets-by-token") {
      if (req.method !== "POST") return notFound(res);
      if (!circleWalletsEnabled()) return json(res, 503, { error: "Circle wallets are not configured." });
      const body = await readRequestBody(req);
      const userToken = cleanText(body.userToken, 4096);
      if (!userToken) return json(res, 400, { error: "Missing userToken." });
      try {
        json(res, 200, { wallets: await circleWalletsByToken(userToken) });
      } catch (error) {
        console.error("[circle] wallets-by-token error:", error instanceof Error ? error.message : String(error));
        json(res, 502, { error: "Could not list wallets." });
      }
      return;
    }

    if (url.pathname === "/api/wallet/circle/session") {
      if (req.method !== "POST") return notFound(res);
      if (!circleWalletsEnabled()) return json(res, 503, { error: "Circle wallets are not configured." });
      const body = await readRequestBody(req);
      const userId = cleanText(body.userId, 128);
      if (!userId || userId.length < 5) return json(res, 400, { error: "userId must be at least 5 characters." });
      try {
        const session = await circleStartSession(userId);
        json(res, 200, session);
      } catch (error) {
        console.error("[circle] session error:", error instanceof Error ? error.message : String(error));
        json(res, 502, { error: "Could not start Circle wallet session." });
      }
      return;
    }

    if (url.pathname === "/api/wallet/circle/wallets") {
      if (!circleWalletsEnabled()) return json(res, 503, { error: "Circle wallets are not configured." });
      const userId = cleanText(url.searchParams.get("userId") || "", 128);
      if (!userId || userId.length < 5) return json(res, 400, { error: "userId must be at least 5 characters." });
      try {
        const wallets = await circleListWallets(userId);
        json(res, 200, { wallets });
      } catch (error) {
        console.error("[circle] wallets error:", error instanceof Error ? error.message : String(error));
        json(res, 502, { error: "Could not list Circle wallets." });
      }
      return;
    }

    if (url.pathname === "/api/wallet/circle/tx-status") {
      if (!circleWalletsEnabled()) return json(res, 503, { error: "Circle wallets are not configured." });
      // Accept GET (legacy PIN flow: userId in query) or POST (verified login: userToken in body).
      const body = req.method === "POST" ? await readRequestBody(req) : {};
      const userId = cleanText(body.userId || url.searchParams.get("userId") || "", 128);
      const userToken = cleanText(body.userToken || "", 4096);
      const walletId = cleanText(body.walletId || url.searchParams.get("walletId") || "", 128);
      if ((!userId && !userToken) || !walletId) return json(res, 400, { error: "Missing userToken/userId or walletId." });
      try {
        const tx = await circleLatestTx({ userId, userToken, walletId });
        json(res, 200, tx || { id: "", state: "", txHash: "" });
      } catch (error) {
        console.error("[circle] tx-status error:", error instanceof Error ? error.message : String(error));
        json(res, 502, { error: "Could not read Circle transaction status." });
      }
      return;
    }

    if (url.pathname === "/api/wallet/circle/contract-execute") {
      if (req.method !== "POST") return notFound(res);
      if (!circleWalletsEnabled()) return json(res, 503, { error: "Circle wallets are not configured." });
      const body = await readRequestBody(req);
      const userId = cleanText(body.userId, 128);
      const userToken = cleanText(body.userToken, 4096);
      const walletId = cleanText(body.walletId, 128);
      const contractAddress = cleanText(body.contractAddress, 64);
      const abiFunctionSignature = cleanText(body.abiFunctionSignature, 256);
      const abiParameters = Array.isArray(body.abiParameters) ? body.abiParameters.slice(0, 16) : [];
      if ((!userId && !userToken) || !walletId || !contractAddress || !abiFunctionSignature) {
        return json(res, 400, { error: "Missing userToken/userId, walletId, contractAddress, or abiFunctionSignature." });
      }
      // Only allow the prediction-market contract and the Arc settlement tokens
      // (USDC ERC-20, EURC). The PIN gate already protects funds, but this keeps
      // the endpoint from signing arbitrary contracts.
      const allowed = new Set([
        CONTRACT_ADDRESS.toLowerCase(),
        "0x3600000000000000000000000000000000000000",
        "0x89b50855aa3be2f677cd6303cec089b5f319d72a"
      ]);
      if (!allowed.has(contractAddress.toLowerCase())) {
        return json(res, 403, { error: "Contract address is not allowed." });
      }
      try {
        const result = await circleContractChallenge({ userId, userToken, walletId, contractAddress, abiFunctionSignature, abiParameters });
        json(res, 200, result);
      } catch (error) {
        console.error("[circle] contract-execute error:", error instanceof Error ? error.message : String(error));
        json(res, 502, { error: "Could not create Circle contract challenge." });
      }
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
      const limit = Math.max(1, Math.min(50_000, Number(url.searchParams.get("limit") || 50)));
      const user = String(url.searchParams.get("user") || "").trim().toLowerCase();
      const rows = user && isAddress(user) ? tradesForUser(user) : tradeIndexes().sorted;
      json(res, 200, { activities: rows.slice(0, limit) });
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
        let draft = null;
        let fallbackReason = "";
        try {
          draft = await callAiJson(systemInstruction, prompt);
        } catch (error) {
          fallbackReason = error instanceof Error ? error.message : String(error);
        }
        const normalizedDraft = normalizeMarketDraft(draft?.json, body, similarMarkets, { fallbackReason });
        json(res, 200, {
          draft: normalizedDraft,
          provider: draft?.provider || "local-fallback",
          model: draft?.model || "deterministic-draft",
          fallbackReason,
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
        if (storedMarket && (isV4Contract() || isV5Contract())) {
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

    if (segments[0] === "api" && segments[1] === "assistant" && segments[2] === "chat") {
      if (req.method !== "POST") return notFound(res);
      const body = await readRequestBody(req);
      const rawMessages = Array.isArray(body.messages) ? body.messages : [];
      const history = rawMessages
        .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
        .slice(-12)
        .map((message) => ({ role: message.role, content: cleanText(message.content, 2000) }));
      if (history.length === 0 || history[history.length - 1].role !== "user") {
        return json(res, 400, { error: "Send a user message to Aura AI." });
      }

      const rawMarkets = Array.isArray(body.markets) ? body.markets.slice(0, 400) : [];
      const allMarkets = rawMarkets
        .map((market) => ({
          id: Number(market.id),
          question: cleanText(market.question, 140),
          category: cleanText(market.category, 40),
          status: cleanText(market.status, 20),
          yesPercent: Number(market.yesPercent) || 0,
          noPercent: Number(market.noPercent) || 0,
          closeIso: cleanText(market.closeIso, 40),
          outcome: cleanText(market.outcome, 16),
          claimable: market.claimable === true,
          // Per-user position on this market (USDC). Present only when the
          // connected wallet has staked / has a claimable payout here.
          ...(Number(market.myYes) > 0 ? { myYes: Number(market.myYes) } : {}),
          ...(Number(market.myNo) > 0 ? { myNo: Number(market.myNo) } : {}),
          ...(Number(market.myPayout) > 0 ? { myPayout: Number(market.myPayout) } : {})
        }))
        .filter((market) => Number.isInteger(market.id));

      // Connected wallet + aggregate account stats (computed client-side over
      // ALL of the user's markets, so counts stay correct even though only a
      // slice of markets fits in the model context below).
      const account = typeof body.account === "string" ? cleanText(body.account, 64) : "";
      const rawStats = body.userStats && typeof body.userStats === "object" ? body.userStats : null;
      const userStats = rawStats
        ? {
            wallet: cleanText(rawStats.wallet, 64) || account,
            participatedMarkets: Number(rawStats.participatedMarkets) || 0,
            createdMarkets: Number(rawStats.createdMarkets) || 0,
            claimableMarkets: Number(rawStats.claimableMarkets) || 0,
            totalClaimableUsdc: Number(rawStats.totalClaimableUsdc) || 0,
            participatedMarketIds: Array.isArray(rawStats.participatedMarketIds)
              ? rawStats.participatedMarketIds.map(Number).filter(Number.isInteger).slice(0, 200)
              : [],
            createdMarketIds: Array.isArray(rawStats.createdMarketIds)
              ? rawStats.createdMarketIds.map(Number).filter(Number.isInteger).slice(0, 200)
              : []
          }
        : null;

      // Groq free tier caps tokens-per-minute, so we cannot send every market.
      // Rank by relevance to the user's latest message, then keep a small slice.
      // Markets the user named by id, plus claimable ones, are always included.
      const MAX_CONTEXT_MARKETS = 30;
      const ASSISTANT_STOPWORDS = new Set([
        "the", "and", "for", "bet", "usd", "usdc", "market", "markets", "will", "yes", "place",
        "claim", "win", "winnings", "with", "that", "this", "what", "which", "are", "can", "you",
        "aura", "much", "how", "does", "did", "any", "all", "out", "now", "today", "live"
      ]);
      const lastUserText = String(history[history.length - 1].content || "").toLowerCase();
      const terms = [...new Set(lastUserText.split(/[^a-z0-9]+/).filter((word) => word.length > 2))].filter(
        (word) => !ASSISTANT_STOPWORDS.has(word)
      );
      const mentionedIds = new Set((lastUserText.match(/\d+/g) || []).map(Number));
      const scoreMarket = (market) => {
        const haystack = `${market.question} ${market.category}`.toLowerCase();
        return terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
      };

      let marketContext = allMarkets;
      if (allMarkets.length > MAX_CONTEXT_MARKETS) {
        const ranked = [...allMarkets]
          .map((market) => ({ market, score: scoreMarket(market) }))
          .sort((a, b) => b.score - a.score || (a.market.status === "live" ? -1 : 1));
        const myMarketIds = new Set([
          ...(userStats?.participatedMarketIds || []),
          ...(userStats?.createdMarketIds || [])
        ]);
        const chosen = new Map();
        for (const market of allMarkets) {
          if (chosen.size >= MAX_CONTEXT_MARKETS) break;
          if (mentionedIds.has(market.id) || market.claimable || market.myYes || market.myNo || myMarketIds.has(market.id)) {
            chosen.set(market.id, market);
          }
        }
        for (const { market } of ranked) {
          if (chosen.size >= MAX_CONTEXT_MARKETS) break;
          chosen.set(market.id, market);
        }
        marketContext = [...chosen.values()];
      }

      const systemInstruction = [
        "You are Aura AI, the in-app assistant for AuraPredict, a prediction market dapp on Arc Testnet.",
        "You help the user find markets, place bets, check resolution status (AI and Oracle), and claim winnings or refunds.",
        "CRITICAL: You never execute anything yourself. You only propose actions; the user must click the button and sign in their wallet.",
        "LANGUAGE: Detect the language of the user's latest message and write the entire 'reply' field in that same language. If the user writes Vietnamese, reply in Vietnamese; if English, reply in English; and so on.",
        "You are given a JSON list of markets (each with id, question, category, status, yesPercent, noPercent, closeIso, outcome, claimable).",
        "Only reference markets from that list. NEVER invent a market id. If nothing matches the user's intent, say so and ask a clarifying question.",
        "When the user wants to bet, find the best-matching market and propose a 'bet' action with the correct side (YES/NO) and amount they mentioned. If amount is missing, ask for it or omit the amount.",
        "When the user wants to claim, propose a 'claim' action. To open/inspect a market, propose a 'view' action.",
        "CLAIM RULE: If the user asks about claiming, winnings, rewards, payouts, prizes or refunds in ANY language (e.g. Vietnamese 'phần thưởng', 'tiền thắng', 'nhận thưởng', 'rút'), and the markets list contains one or more markets with claimable=true, you MUST propose a 'claim' action for each claimable market and list them. Do NOT ask the user for a market id when claimable markets already exist. Only if there are zero claimable markets, tell them they have nothing to claim right now.",
        "Respond with STRICT JSON only, shape: {\"reply\": string, \"actions\": [{\"type\": \"bet\"|\"claim\"|\"view\", \"marketId\": number, \"side\"?: \"YES\"|\"NO\", \"amount\"?: string, \"label\": string}]}.",
        "Keep 'reply' concise and friendly. 'label' is short button text in the user's language. Provide actions only when you are confident about the market id; otherwise return an empty actions array.",
        "ACCOUNT QUESTIONS: Some markets include the connected user's own position fields: myYes (USDC staked on YES), myNo (USDC staked on NO), myPayout (claimable USDC). A separate userStats object gives wallet-wide totals: participatedMarkets (count the user has bet on), createdMarkets (count the user created), claimableMarkets, totalClaimableUsdc, participatedMarketIds, createdMarketIds.",
        "When the user asks about THEIR account in any language (how many markets they joined/created, whether they participated in market N, their positions, their winnings), answer using userStats and the myYes/myNo/myPayout fields. To check participation in a specific market id, look at participatedMarketIds (and createdMarketIds for creation). If userStats is null or the user is not connected, tell them to connect their wallet first.",
        userStats
          ? `Connected wallet: ${account || userStats.wallet}. userStats: ${JSON.stringify(userStats)}`
          : "The user has NOT connected a wallet, so no account/position data is available.",
        `Markets JSON: ${JSON.stringify(marketContext)}`
      ].join("\n");

      let chat = null;
      let fallbackReason = "";
      try {
        chat = await callAssistantChat([{ role: "system", content: systemInstruction }, ...history]);
      } catch (error) {
        fallbackReason = error instanceof Error ? error.message : String(error);
        console.error(`[assistant] all providers failed: ${fallbackReason}`);
      }

      const marketIds = new Set(marketContext.map((market) => market.id));
      const parsed = chat?.json && typeof chat.json === "object" ? chat.json : {};
      const reply = typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : fallbackReason
          ? "Aura AI is temporarily unavailable. Please try again shortly."
          : "I could not understand that. Could you rephrase?";
      const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
        .map((action) => {
          const type = ["bet", "claim", "view"].includes(action?.type) ? action.type : null;
          const marketId = Number(action?.marketId);
          if (!type || !marketIds.has(marketId)) return null;
          const side = action?.side === "YES" ? "YES" : action?.side === "NO" ? "NO" : undefined;
          if (type === "bet" && !side) return null;
          const amount = action?.amount !== undefined && action?.amount !== null ? String(action.amount).replace(/[^0-9.]/g, "") : undefined;
          return {
            type,
            marketId,
            ...(side ? { side } : {}),
            ...(amount ? { amount } : {}),
            label: cleanText(action?.label, 60) || (type === "bet" ? `${side} bet` : type === "claim" ? "Claim" : "View market")
          };
        })
        .filter(Boolean)
        .slice(0, 4);

      json(res, 200, {
        reply,
        actions,
        provider: chat?.provider || "unavailable",
        model: chat?.model || "",
        fallbackReason,
        updatedAt: nowIso()
      });
      return;
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
        let proposal = oracleState()[String(marketId)] ?? null;
        const market = state.markets[String(marketId)];
        const shouldClear = proposal && market && oracleProposalNeedsRuleRefresh(proposal, market);
        if (shouldClear) {
          delete oracleState()[String(marketId)];
          await saveState();
          proposal = null;
        }
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
          reports: social.reports[marketId] ?? [],
          updatedAt: state.updatedAt
        });
        return;
      }

      if (req.method === "GET" && segments[2] === "reports") {
        const reports = Object.values(social.reports ?? {})
          .flat()
          .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
          .slice(0, 200);
        json(res, 200, { reports, updatedAt: state.updatedAt });
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

      if (req.method === "POST" && segments[2] === "markets" && segments[3] && segments[4] === "reports" && segments[5]) {
        const marketId = Number(segments[3]);
        if (!Number.isInteger(marketId) || marketId < 0) return json(res, 400, { error: "Invalid market id." });
        const reportId = decodeURIComponent(String(segments[5] || ""));
        const rows = Array.isArray(social.reports[String(marketId)]) ? social.reports[String(marketId)] : [];
        const index = rows.findIndex((row) => row.id === reportId);
        if (index < 0) return json(res, 404, { error: "Report not found." });
        const body = await readRequestBody(req);
        const status = cleanReportStatus(body.status);
        if (!status || status === "open") return json(res, 400, { error: "Invalid report status." });
        const reviewer = cleanAddress(body.reviewer) || cleanText(body.reviewer, 90) || "Owner";
        const ownerNote = cleanText(body.ownerNote, 280);
        const updated = {
          ...rows[index],
          status,
          ownerNote,
          resolvedBy: reviewer,
          resolvedAt: nowIso()
        };
        const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? updated : row));
        social.reports[String(marketId)] = nextRows;
        await saveState();
        json(res, 200, { report: updated, reports: nextRows, updatedAt: state.updatedAt || nowIso() });
        return;
      }

      if (req.method === "POST" && segments[2] === "markets" && segments[3] && segments[4] === "reports") {
        const marketId = Number(segments[3]);
        if (!Number.isInteger(marketId) || marketId < 0) return json(res, 400, { error: "Invalid market id." });
        const body = await readRequestBody(req);
        const reason = cleanText(body.reason, 520);
        const sourceUrl = cleanUrl(body.url);
        if (reason.length < 8) return json(res, 400, { error: "Report reason is too short." });
        if (body.url && !sourceUrl) return json(res, 400, { error: "Report URL must be http or https." });
        const report = {
          id: `${marketId}-${Date.now()}`,
          marketId,
          reporter: cleanAddress(body.reporter) || "Guest",
          reason,
          url: sourceUrl,
          status: "open",
          createdAt: nowIso(),
          ownerNote: "",
          resolvedBy: "",
          resolvedAt: ""
        };
        appendSocialRow(social.reports, String(marketId), report, 40);
        await saveState();
        json(res, 201, { report, reports: social.reports[String(marketId)] });
        return;
      }

      if (req.method === "GET" && segments[2] === "profiles" && segments[3] && segments[4] === "notifications") {
        const address = cleanAddress(segments[3]);
        if (!address) return json(res, 400, { error: "Invalid address." });
        const key = address.toLowerCase();
        json(res, 200, {
          notifications: social.notifications[key] ?? [],
          updatedAt: state.updatedAt
        });
        return;
      }

      if (req.method === "POST" && segments[2] === "profiles" && segments[3] && segments[4] === "notifications") {
        const address = cleanAddress(segments[3]);
        if (!address) return json(res, 400, { error: "Invalid address." });
        const body = await readRequestBody(req);
        const key = address.toLowerCase();
        const incoming = Array.isArray(body.notifications)
          ? body.notifications
          : Array.isArray(body.items)
            ? body.items
            : body.notification
              ? [body.notification]
              : [];
        social.notifications[key] = mergeNotificationRows(social.notifications[key], incoming, address, 500);
        await saveState();
        json(res, 200, { notifications: social.notifications[key], updatedAt: state.updatedAt });
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

      if (req.method === "GET" && segments[2] === "profiles" && segments[3] && !segments[4]) {
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

      if (req.method === "POST" && segments[2] === "profiles" && segments[3] && !segments[4]) {
        const address = cleanAddress(segments[3]);
        if (!address) return json(res, 400, { error: "Invalid address." });
        const body = await readRequestBody(req);
        const key = address.toLowerCase();
        const current = social.profiles[key] ?? { address, joinedAt: nowIso() };
        const requestedName = typeof body.name === "string" ? body.name : current.name || "";
        const nextName = cleanUsername(requestedName);
        if (requestedName.trim() && !nextName) {
          return json(res, 400, {
            code: "INVALID_USERNAME",
            error: "Username must use 2-20 characters: a-z, 0-9, or underscore."
          });
        }

        const previousName = cleanUsername(current.name);
        if (nextName) {
          const existingAddress = social.usernames[nextName];
          if (existingAddress && existingAddress !== key) {
            return json(res, 409, {
              code: "USERNAME_TAKEN",
              error: "Username already taken.",
              username: nextName
            });
          }
        }
        if (previousName && social.usernames[previousName] === key && previousName !== nextName) {
          delete social.usernames[previousName];
        }
        if (nextName) social.usernames[nextName] = key;

        social.profiles[key] = {
          ...current,
          address,
          name: nextName,
          isPublic: body.isPublic !== false,
          updatedAt: nowIso()
        };
        await saveState();
        json(res, 200, { profile: social.profiles[key] });
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

    if (url.pathname === "/api/admin/draft-markets") {
      if (!adminAuthorized(req)) return json(res, 401, { error: "Unauthorized." });
      const drafts = Object.values(state.markets).filter((m) => m.isDraft).sort((a, b) => b.id - a.id);
      json(res, 200, { markets: drafts, total: drafts.length, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === "/api/markets/drafts") {
      const drafts = Object.values(state.markets).filter((m) => m.isDraft).sort((a, b) => b.id - a.id);
      json(res, 200, { markets: drafts, total: drafts.length, updatedAt: state.updatedAt });
      return;
    }

    if (url.pathname === "/api/markets") {
      const limit = Number(url.searchParams.get("limit") || 0);
      const markets = Object.values(state.markets).filter((m) => !m.isDraft).sort((a, b) => b.id - a.id);
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
      const trades = tradesForMarket(marketId);
      json(res, 200, { market, snapshots, trades, updatedAt: state.updatedAt });
      return;
    }

    if (segments[0] === "api" && segments[1] === "users" && segments[2]) {
      const address = segments[2].toLowerCase();
      const row = buildLeaderboard(0).find((item) => item.address.toLowerCase() === address);
      const trades = tradesForUser(address);
      const createdMarkets = Object.values(state.markets).filter((market) => market.creator.toLowerCase() === address);
      json(res, 200, { user: row ?? null, trades, createdMarkets, updatedAt: state.updatedAt });
      return;
    }

    notFound(res);
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

function scheduleRealtimeReconnect(reason) {
  if (!realtimeClient || realtimeReconnectTimer) return;
  const runtime = indexerRuntimeState();
  realtimeReconnectAttempt += 1;
  const delayMs = Math.min(60_000, 2_000 * realtimeReconnectAttempt);
  runtime.wsStatus = "reconnecting";
  runtime.wsLastError = reason || runtime.wsLastError || "WebSocket disconnected.";
  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    startRealtimeSync();
  }, delayMs);
}

function stopRealtimeWatcher() {
  if (!realtimeUnwatch) return;
  try {
    realtimeUnwatch();
  } catch {
    // best-effort cleanup; the polling loop remains authoritative
  }
  realtimeUnwatch = null;
}

function startRealtimeSync() {
  const runtime = indexerRuntimeState();
  if (!realtimeClient) {
    runtime.wsStatus = "disabled";
    return;
  }

  try {
    stopRealtimeWatcher();
    let unwatch = null;
    unwatch = realtimeClient.watchBlockNumber({
      emitOnBegin: false,
      onBlockNumber(blockNumber) {
        const runtimeState = indexerRuntimeState();
        realtimeReconnectAttempt = 0;
        runtimeState.wsStatus = "connected";
        runtimeState.wsLastBlock = blockNumber.toString();
        runtimeState.wsLastEventAt = nowIso();
        runtimeState.wsLastError = "";
        if (toBigint(state.lastIndexedBlock) < blockNumber) {
          scheduleSync("websocket-block", REALTIME_SYNC_DEBOUNCE_MS);
        }
      },
      onError(error) {
        const runtimeState = indexerRuntimeState();
        const message = error instanceof Error ? error.message : String(error);
        runtimeState.wsStatus = "error";
        runtimeState.wsLastError = message;
        console.error("[indexer] websocket block watcher failed:", error);
        try {
          unwatch?.();
        } catch {
          // ignore watcher cleanup errors; reconnect will replace it
        }
        if (realtimeUnwatch === unwatch) realtimeUnwatch = null;
        scheduleRealtimeReconnect(message);
      }
    });
    realtimeUnwatch = unwatch;
    runtime.wsStatus = "connected";
    console.log(`[indexer] websocket sync enabled via ${WS_URLS[0]}`);
    return unwatch;
  } catch (error) {
    stopRealtimeWatcher();
    runtime.wsStatus = "error";
    runtime.wsLastError = error instanceof Error ? error.message : String(error);
    console.error("[indexer] websocket sync could not start:", error);
    scheduleRealtimeReconnect(runtime.wsLastError);
  }
}

async function main() {
  await loadState();

  if (process.argv.includes("--once")) {
    await syncOnce();
    console.log(`[indexer] synced ${state.marketCount} markets at block ${state.lastIndexedBlock}`);
    return;
  }

  const server = createServer(route);
  server.listen(PORT, HOST, () => {
    console.log(`[indexer] AuraPredict indexer listening on http://${HOST}:${PORT}`);
  });

  startRealtimeSync();
  scheduleSync("startup");

  setInterval(() => {
    scheduleSync("polling");
  }, POLL_MS);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
