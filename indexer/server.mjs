import "dotenv/config";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, fallback, formatUnits, http, isAddress, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcPredictionMarketAbi } from "./arcPredictionMarketAbi.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "aurapredict-index.json");

const CONTRACT_ADDRESS = (
  process.env.AURA_INDEXER_CONTRACT_ADDRESS ||
  process.env.VITE_PREDICTION_MARKET_ADDRESS ||
  ""
).trim();
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
const START_BLOCK = BigInt(process.env.AURA_INDEXER_START_BLOCK || 0);
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
const RESOLUTION_MIN_CONFIDENCE = Number(process.env.AURA_RESOLUTION_MIN_CONFIDENCE || 72);
const RESOLUTION_CONSENSUS_COUNT = Number(process.env.AURA_RESOLUTION_CONSENSUS_COUNT || 2);
const USDC_DECIMALS = 18;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ARC_CHAIN = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: RPC_URLS }
  }
};
const EVENT_NAMES = [
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
const resolverAccount = RESOLVER_PRIVATE_KEY ? privateKeyToAccount(RESOLVER_PRIVATE_KEY) : null;
const walletClient = resolverAccount
  ? createWalletClient({
      account: resolverAccount,
      chain: ARC_CHAIN,
      transport: http(RPC_URLS[0], { retryCount: 1, retryDelay: 250, timeout: 15_000 })
    })
  : null;
const writeMarketAbi = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint256", name: "marketId" },
      { type: "uint8", name: "outcome" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: []
  },
  {
    type: "function",
    name: "finalize",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "marketId" }],
    outputs: []
  }
];
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

function auraPointsFor(volume, wonMarkets, resolvedMarkets, createdMarkets, pnl) {
  const participationScore = 25;
  const volumeScore = Number(formatUnits(volume, USDC_DECIMALS)) * 10;
  const pnlScore = Math.max(0, Number(formatUnits(pnl, USDC_DECIMALS)) * 12);
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
      knownPlayers: 0
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
      creator: ZERO_ADDRESS,
      resolver: ZERO_ADDRESS,
      yesPool: "0",
      noPool: "0",
      traderCount: 0,
      proposedOutcome: Outcome.Unresolved,
      proposedAt: 0,
      disputeDeadline: 0,
      proposedBy: ZERO_ADDRESS,
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

async function readContract(functionName, args = []) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    abi: arcPredictionMarketAbi,
    functionName,
    args
  });
}

async function readMarketData(id) {
  try {
    const data = await readContract("getMarket", [BigInt(id)]);
    return {
      question: data[0],
      category: data[1],
      closeTime: Number(data[2]),
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
}

function computeStats() {
  const markets = Object.values(state.markets);
  const now = Math.floor(Date.now() / 1000);
  const totalVolume = markets.reduce((sum, market) => sum + toBigint(market.yesPool) + toBigint(market.noPool), 0n);
  const liveMarkets = markets.filter((market) => market.outcome === Outcome.Unresolved && market.closeTime > now);
  const endedMarkets = markets.filter((market) => market.outcome !== Outcome.Unresolved);
  const pendingMarkets = markets.filter((market) => market.outcome === Outcome.Unresolved && market.closeTime <= now);
  const users = new Set();

  for (const market of markets) {
    if (market.creator) users.add(market.creator.toLowerCase());
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
    knownPlayers: users.size
  };
}

function buildLeaderboard(periodStart = 0) {
  const rows = new Map();
  const positions = new Map();
  const marketsById = new Map(Object.values(state.markets).map((market) => [market.id, market]));

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
        const fee = (profit * BigInt(state.protocolFeeBps || 0)) / 10000n;
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
      auraPoints: auraPointsFor(row.volume, row.wonMarkets, row.resolvedMarkets, row.createdMarkets, row.pnl)
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
    `Close time unix: ${body.closeTime || market?.closeTime || "unknown"}`,
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
  const evidence = evidenceRows.map((item) => ({
    title: cleanText(item.title, 120),
    url: cleanUrl(item.url),
    notes: cleanText(item.notes || item.finding, 700),
    createdAt: item.createdAt
  }));
  const criteria = cleanText(market.resolutionCriteria || "", 1000);
  return [
    `Current UTC time: ${nowIso()}`,
    `Reviewer role: ${role}`,
    `Market id: ${market.id}`,
    `Question: ${cleanText(market.question, 260)}`,
    `Category: ${cleanText(market.category, 40)}`,
    `Close time unix: ${market.closeTime}`,
    `Resolution criteria: ${criteria || "not provided"}`,
    `Current pools: YES ${formatUnits(toBigint(market.yesPool), USDC_DECIMALS)} USDC / NO ${formatUnits(toBigint(market.noPool), USDC_DECIMALS)} USDC`,
    `Evidence JSON: ${JSON.stringify(evidence)}`,
    "Return JSON only with:",
    "{",
    '  "outcome": "YES|NO|CANCEL|INSUFFICIENT_EVIDENCE",',
    '  "confidence": 0-100,',
    '  "reasoning": "short evidence-based explanation",',
    '  "keyEvidence": [{"title":"...", "url":"...", "finding":"..."}],',
    '  "risks": ["specific dispute or ambiguity risk"]',
    "}",
    "Use only the supplied evidence and public facts that can be verified from URLs in the evidence list.",
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
  return evidenceRows.some((item) =>
    cleanText(item?.title, 160) || cleanUrl(item?.url) || cleanText(item?.notes || item?.finding, 300)
  );
}

function normalizeResolutionReportWithHeuristic(body, reportJson) {
  const normalized = { ...(reportJson || {}) };
  const outcome = outcomeName(normalized.suggestedOutcome);
  if (outcome !== "INSUFFICIENT_EVIDENCE") return normalized;

  const closeTime = Number(body?.closeTime || 0);
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

async function buildResolutionReceipt(marketId, options = {}) {
  const market = state.markets[String(marketId)];
  if (!market) throw new Error("Market not found.");
  const now = Math.floor(Date.now() / 1000);
  if (market.closeTime > now && !options.force) throw new Error("Market is still open.");
  if (market.outcome !== Outcome.Unresolved && !options.force) throw new Error("Market is already resolved.");
  if (market.proposedAt > 0 && !options.force) throw new Error("Market already has a proposed outcome.");

  const social = socialState();
  const evidenceRows = Array.isArray(options.evidence) && options.evidence.length > 0
    ? options.evidence.slice(0, 10)
    : (social.evidence[String(marketId)] || []).slice(0, 10);
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
  resolutionState()[String(marketId)] = receipt;
  await saveState();
  return receipt;
}

async function proposeResolutionOnchain(receipt) {
  if (!RESOLUTION_AUTO_PROPOSE) return { skipped: "AURA_RESOLUTION_AUTO_PROPOSE is not enabled." };
  if (!walletClient || !resolverAccount) return { skipped: "AURA_RESOLVER_PRIVATE_KEY is not configured." };
  if (receipt.status !== "ready" || receipt.proposedOutcomeValue === Outcome.Unresolved) {
    return { skipped: "Receipt is not approved for on-chain proposal." };
  }

  const market = state.markets[String(receipt.marketId)];
  if (!market) throw new Error("Market not found.");
  const resolver = String(market.resolver || "").toLowerCase();
  const owner = String(state.owner || "").toLowerCase();
  const authority = String(state.resolutionAuthority || "").toLowerCase();
  const signer = resolverAccount.address.toLowerCase();
  if (signer !== resolver && signer !== owner && signer !== authority) {
    throw new Error("Resolver key is not the market resolver, contract owner, or resolution authority.");
  }

  const functionName = receipt.proposedOutcomeValue === Outcome.Canceled ? "cancel" : "resolve";
  const args = functionName === "cancel" ? [BigInt(receipt.marketId)] : [BigInt(receipt.marketId), receipt.proposedOutcomeValue];
  const txHash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: writeMarketAbi,
    functionName,
    args
  });
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
    .filter((market) => Number(market.closeTime || 0) > 0 && Number(market.closeTime) <= now)
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
  for (const eventName of EVENT_NAMES) {
    const eventLogs = await client.getContractEvents({
      address: CONTRACT_ADDRESS,
      abi: arcPredictionMarketAbi,
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
    "access-control-allow-headers": "content-type"
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
      "access-control-allow-headers": "content-type"
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
        const report = await callAiJson(systemInstruction, resolutionPrompt(body));
        const normalizedReport = normalizeResolutionReportWithHeuristic(body, report.json);
        json(res, 200, { report: normalizedReport, provider: report.provider, model: report.model, updatedAt: nowIso() });
        return;
      }

      return notFound(res);
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
