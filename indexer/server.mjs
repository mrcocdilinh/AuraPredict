import "dotenv/config";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, fallback, formatUnits, http, isAddress } from "viem";
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
const PORT = Number(process.env.AURA_INDEXER_PORT || 8787);
const POLL_MS = Number(process.env.AURA_INDEXER_POLL_MS || 12_000);
const START_BLOCK = BigInt(process.env.AURA_INDEXER_START_BLOCK || 0);
const CHUNK_SIZE = BigInt(process.env.AURA_INDEXER_CHUNK_SIZE || 9_000);
const USDC_DECIMALS = 18;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EVENT_NAMES = [
  "MarketCreated",
  "BetPlaced",
  "MarketResultProposed",
  "MarketDisputed",
  "MarketResolved",
  "DisputeFinalized",
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
  transport: fallback(RPC_URLS.map((url) => http(url, { retryCount: 1, retryDelay: 250, timeout: 10_000 })), {
    rank: false,
    retryCount: 2,
    retryDelay: 500
  })
});

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
    minStake: "0",
    creatorBond: "0",
    disputeBond: "0",
    disputeWindow: 0,
    protocolFeeBps: 0,
    accumulatedProtocolFees: "0",
    marketCount: 0,
    markets: {},
    trades: [],
    claims: [],
    snapshots: [],
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
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: "Not found" });
}

function route(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
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
      json(res, 200, { stats: state.stats, updatedAt: state.updatedAt, lastIndexedBlock: state.lastIndexedBlock });
      return;
    }

    if (url.pathname === "/api/activity") {
      const limit = Number(url.searchParams.get("limit") || 50);
      json(res, 200, { activities: state.trades.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, limit) });
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
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[indexer] AuraPredict indexer listening on http://127.0.0.1:${PORT}`);
  });

  setInterval(() => {
    syncOnce().catch((error) => console.error("[indexer] sync failed:", error));
  }, POLL_MS);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
