import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  fallback,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hash,
  type TransactionReceipt
} from "viem";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARC_CHAIN_ID_NUMBER,
  ARC_CHAIN_ID_DECIMAL,
  ARC_RPC_URL,
  ARC_EXPLORER_URL,
  ARC_NATIVE_USDC_DECIMALS,
  ARC_RPC_URLS,
  arcTestnet,
  arcTestnetParams
} from "./arc";
import { arcPredictionMarketV3Abi, arcPredictionMarketV4Abi, settlementTokenAbi } from "./contracts/arcPredictionMarketAbi";
import { arcPredictionMarketV2Abi as arcPredictionMarketAbi } from "./contracts/arcPredictionMarketV2Abi";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  disconnect?: () => Promise<void> | void;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon?: string;
    rdns?: string;
  };
  provider: EthereumProvider;
};

type LifiSwapRoute = Awaited<ReturnType<(typeof import("@lifi/sdk"))["getRoutes"]>>["routes"][number];
type StablecoinSwapDirection = "USDC_TO_EURC" | "EURC_TO_USDC";
type StablecoinSwapPair = {
  fromToken: Address;
  fromSymbol: string;
  toToken: Address;
  toSymbol: string;
  decimals: number;
};
type AppKitSwapQuote = {
  provider: "arc-app-kit";
  amountIn: string;
  estimatedAmountOut: string;
  minimumAmountOut: string;
  pairKey: string;
  slippageBps: number;
};
type LifiStablecoinSwapQuote = {
  provider: "lifi";
  route: LifiSwapRoute;
};
type StablecoinSwapQuote = AppKitSwapQuote | LifiStablecoinSwapQuote;
type SwapProviderState = "idle" | "ok" | "fail" | "skipped";
type SwapProviderHealth = {
  circle: SwapProviderState;
  lifi: SwapProviderState;
  circleMessage?: string;
  lifiMessage?: string;
};

const SWAP_TOLERANCE_OPTIONS = [50, 100, 300, 500] as const;
const DEFAULT_SWAP_TOLERANCE_BPS = 300;
const SWAP_QUOTE_MAX_AGE_MS = 30_000;
const LIFI_QUOTE_ENDPOINT = "https://li.quest/v1/quote";
const LIFI_PROBE_AMOUNTS = [1_000n, 10_000n, 100_000n, 1_000_000n, 5_000_000n, 10_000_000n];
const AURA_RULE_JSON_PREFIX = "AURA_RULE_JSON:";

function stablecoinSwapPairKey(pair: StablecoinSwapPair) {
  return `${pair.fromToken.toLowerCase()}:${pair.toToken.toLowerCase()}`;
}

function formatSwapTolerance(bps: number) {
  return `${bps / 100}%`;
}

function providerHealthLabel(state: SwapProviderState) {
  if (state === "ok") return "OK";
  if (state === "fail") return "Failed";
  if (state === "skipped") return "Skipped";
  return "Idle";
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type MarketView = {
  id: number;
  question: string;
  category: string;
  createdAt: number;
  closeTime: number;
  resolutionTime?: number;
  settlementToken?: string;
  settlementSymbol?: string;
  settlementDecimals?: number;
  authority?: string;
  resolutionMode?: number;
  metadataHash?: string;
  metadataURI?: string;
  fallbackSourceURI?: string;
  resolutionRule?: string;
  resolutionAdapter?: string;
  termsProtocolFeeBps?: number;
  termsCreatorBond?: bigint;
  termsDisputeBond?: bigint;
  termsDisputeWindow?: number;
  termsDisputeGracePeriod?: number;
  termsProposalGracePeriod?: number;
  authorityReviewRequired?: boolean;
  creator: string;
  resolver: string;
  yesPool: bigint;
  noPool: bigint;
  traderCount: number;
  proposedOutcome: Outcome;
  proposedAt: number;
  disputeDeadline: number;
  disputed: boolean;
  disputer: string;
  outcome: Outcome;
  yesPosition: bigint;
  noPosition: bigint;
  claimed: boolean;
  potentialPayout: bigint;
};

type MarketContractVersion = "unknown" | "legacy" | "dispute" | "v2" | "v3" | "v4";

type ActivityItem = {
  id: string;
  user: string;
  marketId: number;
  question: string;
  side: Outcome;
  amount: bigint;
  timestamp: number;
  txHash?: Hash | string;
};

type AppView = "markets" | "ended" | "leaderboard" | "profile" | "collection" | "market" | "security" | "notifications" | "owner";
type LeaderboardMetric = "volume" | "winRate" | "pnl" | "auraPoints";
type LeaderboardPeriod = "day" | "7d" | "30d" | "all";
type MarketSectionKey = "fresh" | "hot" | "closing" | "live";
type ThemeMode = "dark" | "light";
type MarketViewMode = "grid" | "list";
type ChartWindowKey = "1h" | "6h" | "1d" | "1w" | "1m" | "all";
type MarketSortKey = "created" | "ending" | "volume" | "participants" | "yes" | "no";
type SortDirection = "asc" | "desc";

type LeaderboardRow = {
  address: string;
  volume: bigint;
  stake: bigint;
  payout: bigint;
  pnl: bigint;
  wonMarkets: number;
  resolvedMarkets: number;
  winRate: number;
  auraPoints: number;
  createdMarkets: number;
};

type UserRegistry = Record<string, { address: string; joinedAt: string }>;

type ProjectStats = {
  totalMarkets: number;
  indexedMarkets: number;
  liveMarkets: number;
  endedMarkets: number;
  pendingMarkets: number;
  totalVolume: bigint;
  liveLiquidity: bigint;
  averageMarketVolume: bigint;
  participantEntries: number;
  knownPlayers: number;
  settlementSymbols?: string[];
  hasMixedSettlementAssets?: boolean;
  assetBreakdown?: AssetStats[];
};

type AssetStats = {
  token?: string;
  symbol: string;
  decimals: number;
  marketCount: number;
  liveMarkets: number;
  endedMarkets: number;
  pendingMarkets: number;
  participantEntries: number;
  totalVolume: bigint;
  liveLiquidity: bigint;
  averageMarketVolume: bigint;
};

type MarketComment = {
  id: string;
  marketId: number;
  author: string;
  text: string;
  createdAt: string;
};

type MarketEvidence = {
  id: string;
  marketId: number;
  title: string;
  url: string;
  notes: string;
  addedBy: string;
  createdAt: string;
};

type EvidenceDraft = {
  title: string;
  url: string;
  notes: string;
};

type CreateFormState = {
  question: string;
  category: string;
  closeTime: string;
  resolutionTime: string;
  settlementToken: string;
  resolutionMode: "0" | "1" | "2";
  resolutionSource: string;
  resolutionRule: string;
  fallbackSource: string;
};

type StructuredResolutionRule = {
  version: 1;
  kind: "crypto-price" | "macro-price" | "status-health" | "status-page" | "sports-fixture" | "manual-review";
  asset?: string;
  metric?: string;
  comparator?: "gte" | "lte" | "eq";
  target?: string;
  closeTimeUtc?: string;
  resolutionTimeUtc?: string;
  primarySource?: string;
  fallbackSource?: string;
};

type MismatchConfirmState = {
  marketId: number;
  outcome: Outcome;
  aiSuggestedOutcome: Outcome.Yes | Outcome.No;
};

type SocialMarketResponse = {
  comments?: MarketComment[];
  evidence?: MarketEvidence[];
};

type SocialProfileResponse = {
  profile?: {
    address: string;
    name?: string;
    isPublic?: boolean;
    joinedAt?: string;
  } | null;
  follows?: string[];
};

type AiMarketDraft = {
  question?: string;
  category?: string;
  closeTime?: string;
  resolutionCriteria?: string;
  sources?: string[];
  clarityScore?: number;
  duplicateRisk?: "LOW" | "MEDIUM" | "HIGH";
  similarMarkets?: Array<{
    id: number;
    question: string;
    category: string;
    closeTime: number;
    volume: string;
    traderCount: number;
    similarity: number;
    reason: string;
  }>;
  riskFlags?: string[];
  creatorNote?: string;
};

type AiResolutionReport = {
  suggestedOutcome?: string;
  confidence?: number;
  summary?: string;
  evidence?: Array<{ title?: string; url?: string; finding?: string }>;
  disputeRisks?: string[];
  resolverAction?: string;
};

type AiResolutionReceipt = {
  id?: string;
  marketId: number;
  generatedAt?: string;
  provider?: string;
  model?: string;
  receiptHash?: string;
  attestation?: string;
  attestationSigner?: string;
  status?: string;
  proposedOutcome?: string;
  proposedOutcomeValue?: number;
  txHash?: string;
  error?: string;
  consensus?: {
    outcome?: string;
    confidence?: number;
    agreed?: number;
    approved?: boolean;
  };
  reviews?: Array<{
    outcome?: string;
    confidence?: number;
    reasoning?: string;
    risks?: string[];
    keyEvidence?: Array<{ title?: string; url?: string; finding?: string }>;
  }>;
  evidence?: MarketEvidence[];
};

type OracleProposal = {
  id?: string;
  marketId: number;
  adapter?: string;
  status?: string;
  outcome?: string;
  outcomeValue?: number;
  confidence?: number;
  observedValue?: string;
  comparator?: string;
  targetValue?: string;
  observedAt?: string;
  sourceUrls?: string[];
  summary?: string;
  checks?: string[];
  generatedAt?: string;
  dataHash?: string;
  txHash?: string;
  autoProposed?: boolean;
  autoProposedAt?: string;
  autoProposeSkipped?: string;
  autoProposeError?: string;
  onchainFunction?: string;
};

type ResolutionReceiptResponse = {
  receipt?: AiResolutionReceipt | null;
};

type OracleProposalResponse = {
  proposal?: OracleProposal | null;
};

type AuraBreakdown = {
  items: Array<{ label: string; detail: string; value: number }>;
  total: number;
  winRate: number;
};

type IndexedMarket = Omit<
  MarketView,
  "yesPool" | "noPool" | "yesPosition" | "noPosition" | "claimed" | "potentialPayout"
> & {
  yesPool: string;
  noPool: string;
  yesPosition?: string;
  noPosition?: string;
  claimed?: boolean;
  potentialPayout?: string;
};

type IndexedActivity = Omit<ActivityItem, "amount" | "side"> & {
  amount: string;
  side: number;
};

type IndexedAssetStats = Omit<AssetStats, "totalVolume" | "liveLiquidity" | "averageMarketVolume"> & {
  totalVolume: string;
  liveLiquidity: string;
  averageMarketVolume: string;
};

type IndexedProjectStats = Omit<ProjectStats, "totalVolume" | "liveLiquidity" | "averageMarketVolume" | "assetBreakdown"> & {
  totalVolume: string;
  liveLiquidity: string;
  averageMarketVolume: string;
  assetBreakdown?: IndexedAssetStats[];
};

type IndexedSnapshot = {
  markets: MarketView[];
  activities: ActivityItem[];
  stats: ProjectStats | null;
  total: number;
};

type LandingHealth = {
  ok: boolean;
  updatedAt?: string | null;
  lastIndexedBlock?: string;
  marketCount?: number;
};

type ContractEventRow = {
  args: {
    marketId?: bigint;
    user?: Address;
    side?: number;
    amount?: bigint;
  };
  blockNumber?: bigint | null;
  transactionHash?: Hash;
  logIndex?: number;
};

enum Outcome {
  Unresolved = 0,
  Yes = 1,
  No = 2,
  Canceled = 3
}

const ACTIVE_V3_CONTRACT_ADDRESS = "0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd";
const ACTIVE_V3_DEPLOYMENT_BLOCK = "44074836";
const ACTIVE_V4_CONTRACT_ADDRESS = "0x3c853AE2eC705B453c9657569b6335e762631536";
const ACTIVE_V4_DEPLOYMENT_BLOCK = "44083985";
const ACTIVE_V3_EURC_TOKEN_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const PRIMARY_CONTRACT_ADDRESS = ACTIVE_V4_CONTRACT_ADDRESS;
const PRIMARY_DEPLOYMENT_BLOCK = ACTIVE_V4_DEPLOYMENT_BLOCK;
const REQUESTED_DEPLOYMENT =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("deployment") : null;
const VIEWING_V3_ARCHIVE =
  REQUESTED_DEPLOYMENT === "v3" &&
  PRIMARY_CONTRACT_ADDRESS.toLowerCase() !== ACTIVE_V3_CONTRACT_ADDRESS.toLowerCase();
const CONTRACT_ADDRESS = VIEWING_V3_ARCHIVE ? ACTIVE_V3_CONTRACT_ADDRESS : PRIMARY_CONTRACT_ADDRESS;
const EURC_TOKEN_ADDRESS = ACTIVE_V3_EURC_TOKEN_ADDRESS;
const V3_STABLECOIN_DECIMALS = 6;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const CATEGORIES = ["All", "Crypto", "Macro", "Sports", "Politics", "Arc", "AI", "Other"];
const SECTION_LIMIT = 6;
const COLLECTION_PAGE_SIZE = 12;
const PROFILE_PAGE_SIZE = 10;
const LEADERBOARD_LIMIT = 100;
const MARKET_INITIAL_LOAD = 9999;
const MARKET_LOAD_STEP = 24;
const MARKET_LOAD_CONCURRENCY = 4;
const EVENT_LOAD_CONCURRENCY = 2;
const RPC_RETRY_ATTEMPTS = 2;
const RPC_RETRY_DELAY_MS = 450;
const RPC_CALL_STAGGER_MS = 40;
const CHART_LEFT = 8;
const CHART_RIGHT = 92;
const CHART_TOP = 8;
const CHART_BOTTOM = 54;
const CHART_HEIGHT = CHART_BOTTOM - CHART_TOP;
const WALLET_CONNECTED_KEY = "aurapredict.walletConnected";
const WALLET_DISCONNECTED_KEY = "aurapredict.walletDisconnected";
const WALLETCONNECT_PROJECT_ID = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "").trim();
const CIRCLE_APP_KIT_KEY = String(import.meta.env.VITE_CIRCLE_APP_KIT_KEY || "").trim();
const DISMISSED_RESULT_KEY = "aurapredict.dismissedResultNotices";
const THEME_KEY = "aurapredict.theme";
const PROFILE_NAMES_KEY = "aurapredict.profileNames";
const PROFILE_JOINED_KEY = "aurapredict.profileJoined";
const PROFILE_PUBLIC_KEY = "aurapredict.profilePublic";
const USER_REGISTRY_KEY = "aurapredict.userRegistry";
const MARKET_CACHE_KEY = "aurapredict.marketCache";
const FOLLOWED_CREATORS_KEY = "aurapredict.followedCreators";
const MARKET_COMMENTS_KEY = "aurapredict.marketComments";
const MARKET_EVIDENCE_KEY = "aurapredict.marketEvidence";
const ONBOARDING_DISMISSED_KEY = "aurapredict.onboardingDismissed";
const MARKET_QUERY_KEY = "market";
const PROFILE_QUERY_KEY = "profile";
const PROFILE_NAME_QUERY_KEY = "name";
const LANDING_HOSTS = new Set(["aurapredict.xyz", "www.aurapredict.xyz"]);
const APP_URL = "https://app.aurapredict.xyz";
const DOCS_URL = "https://docs.aurapredict.xyz";
const ARC_FAUCET_URL = "https://faucet.circle.com";
const X_URL = "https://x.com/AuraPredict";
const DISCORD_URL = "https://discord.gg/3wTYhdsr";
const DEMO_VIDEO_URL = "https://www.youtube.com/watch?v=tdYqpAIG82s";
const DEMO_EMBED_URL = "https://www.youtube.com/embed/tdYqpAIG82s";
const CURRENT_APP_URL =
  typeof window !== "undefined" ? `${window.location.host}${window.location.pathname}${window.location.search}` : "app.aurapredict.xyz";
const WALLET_DEEP_LINKS = [
  {
    name: "MetaMask",
    detail: "Open AuraPredict inside MetaMask mobile browser",
    url: `https://metamask.app.link/dapp/${CURRENT_APP_URL}`
  },
  {
    name: "Rabby",
    detail: "Open AuraPredict inside Rabby mobile browser",
    url: `https://rabby.io/dapp?url=${encodeURIComponent(`https://${CURRENT_APP_URL}`)}`
  },
  {
    name: "Rainbow",
    detail: "Open AuraPredict in Rainbow browser",
    url: `https://rnbwapp.com/wc?uri=${encodeURIComponent(`https://${CURRENT_APP_URL}`)}`
  },
  {
    name: "OKX Wallet",
    detail: "Open with OKX wallet browser",
    url: `okx://wallet/dapp/details?dappUrl=${encodeURIComponent(`https://${CURRENT_APP_URL}`)}`
  },
  {
    name: "Zerion",
    detail: "Open with Zerion mobile wallet",
    url: `https://link.zerion.io/dapp/${CURRENT_APP_URL}`
  }
];
const INDEXER_URL = String(
  import.meta.env.VITE_AURA_INDEXER_URL ||
    (import.meta.env.DEV ? "http://127.0.0.1:8787" : "https://api.aurapredict.xyz")
).replace(/\/$/, "");
const EVENT_START_BLOCK = BigInt(VIEWING_V3_ARCHIVE ? ACTIVE_V3_DEPLOYMENT_BLOCK : PRIMARY_DEPLOYMENT_BLOCK);
const EVENT_LOG_CHUNK_SIZE = 9_000n;
const CATEGORY_META: Record<string, { label: string; className: string }> = {
  All: { label: "All", className: "category-all" },
  Crypto: { label: "Crypto", className: "category-crypto" },
  Macro: { label: "Macro", className: "category-macro" },
  Sports: { label: "Sports", className: "category-sports" },
  Politics: { label: "Politics", className: "category-politics" },
  Arc: { label: "Arc", className: "category-arc" },
  AI: { label: "AI", className: "category-ai" },
  Other: { label: "Other", className: "category-other" }
};
const CATEGORY_SET = new Set(CATEGORIES.filter((category) => category !== "All"));
const MARKET_IMAGE_CATEGORIES = ["crypto", "sports", "politics", "macro", "ai", "arc", "other"] as const;
const MARKET_IMAGE_COUNT = 6;
const LEADERBOARD_PERIODS: Array<{ value: LeaderboardPeriod; label: string; seconds: number | null }> = [
  { value: "day", label: "24H", seconds: 24 * 60 * 60 },
  { value: "7d", label: "7D", seconds: 7 * 24 * 60 * 60 },
  { value: "30d", label: "1M", seconds: 30 * 24 * 60 * 60 },
  { value: "all", label: "All", seconds: null }
];
const LEADERBOARD_METRICS: Array<{ value: LeaderboardMetric; label: string }> = [
  { value: "volume", label: "Volume" },
  { value: "winRate", label: "Win rate" },
  { value: "pnl", label: "PNL" },
  { value: "auraPoints", label: "Aura points" }
];
const REPUTATION_TIERS = [
  { value: "bronze", label: "Bronze", min: 0 },
  { value: "silver", label: "Silver", min: 1000 },
  { value: "gold", label: "Gold", min: 2500 },
  { value: "diamond", label: "Diamond", min: 5000 }
] as const;
const CHART_WINDOWS: Array<{ value: ChartWindowKey; label: string; seconds: number | null }> = [
  { value: "1h", label: "1H", seconds: 60 * 60 },
  { value: "6h", label: "6H", seconds: 6 * 60 * 60 },
  { value: "1d", label: "1D", seconds: 24 * 60 * 60 },
  { value: "1w", label: "1W", seconds: 7 * 24 * 60 * 60 },
  { value: "1m", label: "1M", seconds: 30 * 24 * 60 * 60 },
  { value: "all", label: "ALL", seconds: null }
];
const MARKET_SORT_OPTIONS: Array<{ value: MarketSortKey; label: string }> = [
  { value: "created", label: "Created time" },
  { value: "ending", label: "Ending time" },
  { value: "volume", label: "Volume" },
  { value: "participants", label: "Participants" },
  { value: "yes", label: "YES %" },
  { value: "no", label: "NO %" }
];

type CachedMarketView = Omit<
  MarketView,
  "yesPool" | "noPool" | "yesPosition" | "noPosition" | "potentialPayout" | "termsCreatorBond" | "termsDisputeBond"
> & {
  yesPool: string;
  noPool: string;
  termsCreatorBond?: string;
  termsDisputeBond?: string;
};

function getInjectedProvider(provider?: EthereumProvider | null) {
  const injected = provider ?? window.ethereum;
  if (!injected) {
    throw new Error("Open AuraPredict inside a wallet browser such as Zerion, MetaMask, Rabby, or OKX.");
  }
  return injected;
}

function getPublicClient() {
  const envRpc = String(import.meta.env.VITE_ARC_RPC_URL || "").trim();
  const rpcUrls = [envRpc, ...ARC_RPC_URLS].filter(
    (url, index, list): url is string => Boolean(url) && list.indexOf(url) === index
  );

  return createPublicClient({
    chain: arcTestnet,
    transport: fallback(
      rpcUrls.map((url) => http(url, { retryCount: 1, retryDelay: 250, timeout: 10_000 })),
      { rank: false, retryCount: 2, retryDelay: 500 }
    )
  });
}

function getWalletClient(provider?: EthereumProvider | null) {
  return createWalletClient({
    chain: arcTestnet,
    transport: custom(getInjectedProvider(provider) as never)
  });
}

let walletConnectProviderPromise: Promise<EthereumProvider> | null = null;

async function getWalletConnectProvider() {
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error("WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID in Vercel to connect from mobile Chrome.");
  }

  const { EthereumProvider: WalletConnectEthereumProvider } = await import("@walletconnect/ethereum-provider");

  walletConnectProviderPromise ??= WalletConnectEthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    optionalChains: [ARC_CHAIN_ID_NUMBER],
    showQrModal: true,
    rpcMap: {
      [String(ARC_CHAIN_ID_NUMBER)]: ARC_RPC_URL
    },
    metadata: {
      name: "AuraPredict",
      description: "Prediction markets on Arc Testnet",
      url: typeof window !== "undefined" ? window.location.origin : "https://app.aurapredict.xyz",
      icons: [typeof window !== "undefined" ? `${window.location.origin}/aurapredict-logo.png` : "https://app.aurapredict.xyz/aurapredict-logo.png"]
    },
    methods: [
      "eth_requestAccounts",
      "eth_accounts",
      "eth_sendTransaction",
      "personal_sign",
      "eth_signTypedData",
      "eth_signTypedData_v4",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain"
    ],
    events: ["accountsChanged", "chainChanged", "disconnect", "connect"]
  }) as Promise<EthereumProvider>;

  return walletConnectProviderPromise;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readJsonStorage<T>(key: string, fallback: T) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readCachedMarkets() {
  try {
    const rows = JSON.parse(window.localStorage.getItem(MARKET_CACHE_KEY) || "[]") as CachedMarketView[];
    return rows
      .map((market) => ({
        ...market,
        yesPool: BigInt(market.yesPool || "0"),
        noPool: BigInt(market.noPool || "0"),
        yesPosition: 0n,
        noPosition: 0n,
        claimed: false,
        potentialPayout: 0n,
        termsCreatorBond: market.termsCreatorBond !== undefined ? BigInt(market.termsCreatorBond || "0") : undefined,
        termsDisputeBond: market.termsDisputeBond !== undefined ? BigInt(market.termsDisputeBond || "0") : undefined
      }))
      .filter((market) => Number.isInteger(market.id));
  } catch {
    return [];
  }
}

function writeCachedMarkets(markets: MarketView[]) {
  try {
    const cachedRows: CachedMarketView[] = markets.slice(0, 120).map((market) => ({
      id: market.id,
      question: market.question,
      category: market.category,
      createdAt: market.createdAt,
      closeTime: market.closeTime,
      resolutionTime: market.resolutionTime,
      settlementToken: market.settlementToken,
      settlementSymbol: market.settlementSymbol,
      settlementDecimals: market.settlementDecimals,
      authority: market.authority,
      resolutionMode: market.resolutionMode,
      metadataHash: market.metadataHash,
      metadataURI: market.metadataURI,
      termsProtocolFeeBps: market.termsProtocolFeeBps,
      termsCreatorBond: market.termsCreatorBond?.toString(),
      termsDisputeBond: market.termsDisputeBond?.toString(),
      termsDisputeWindow: market.termsDisputeWindow,
      termsDisputeGracePeriod: market.termsDisputeGracePeriod,
      authorityReviewRequired: market.authorityReviewRequired,
      creator: market.creator,
      resolver: market.resolver,
      yesPool: market.yesPool.toString(),
      noPool: market.noPool.toString(),
      traderCount: market.traderCount,
      proposedOutcome: market.proposedOutcome,
      proposedAt: market.proposedAt,
      disputeDeadline: market.disputeDeadline,
      disputed: market.disputed,
      disputer: market.disputer,
      outcome: market.outcome,
      claimed: false
    }));
    window.localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(cachedRows));
  } catch {
    // Cache is a best-effort UX optimization.
  }
}

function indexedMarketToView(market: IndexedMarket): MarketView {
  const normalizedCategory = normalizeCategory(market.category);
  return {
    ...market,
    category: normalizedCategory,
    createdAt: Number(market.createdAt || 0),
    closeTime: Number(market.closeTime || 0),
    resolutionTime: Number(market.resolutionTime || market.closeTime || 0),
    settlementDecimals: Number(market.settlementDecimals ?? ARC_NATIVE_USDC_DECIMALS),
    termsCreatorBond: market.termsCreatorBond !== undefined ? BigInt(String(market.termsCreatorBond || "0")) : undefined,
    termsDisputeBond: market.termsDisputeBond !== undefined ? BigInt(String(market.termsDisputeBond || "0")) : undefined,
    termsDisputeGracePeriod: market.termsDisputeGracePeriod !== undefined ? Number(market.termsDisputeGracePeriod) : undefined,
    yesPool: BigInt(market.yesPool || "0"),
    noPool: BigInt(market.noPool || "0"),
    traderCount: Number(market.traderCount || 0),
    proposedOutcome: Number(market.proposedOutcome || 0) as Outcome,
    proposedAt: Number(market.proposedAt || 0),
    disputeDeadline: Number(market.disputeDeadline || 0),
    disputed: Boolean(market.disputed),
    outcome: Number(market.outcome || 0) as Outcome,
    yesPosition: BigInt(market.yesPosition || "0"),
    noPosition: BigInt(market.noPosition || "0"),
    claimed: false,
    potentialPayout: BigInt(market.potentialPayout || "0")
  };
}

function normalizeCategory(category?: string) {
  const value = String(category || "").trim();
  if (!value) return "Other";
  return CATEGORY_SET.has(value) ? value : "Other";
}

function indexedStatsToProjectStats(stats: IndexedProjectStats): ProjectStats {
  return {
    ...stats,
    totalVolume: BigInt(stats.totalVolume || "0"),
    liveLiquidity: BigInt(stats.liveLiquidity || "0"),
    averageMarketVolume: BigInt(stats.averageMarketVolume || "0"),
    assetBreakdown: (stats.assetBreakdown || []).map((asset) => ({
      ...asset,
      totalVolume: BigInt(asset.totalVolume || "0"),
      liveLiquidity: BigInt(asset.liveLiquidity || "0"),
      averageMarketVolume: BigInt(asset.averageMarketVolume || "0")
    }))
  };
}

function indexedActivityToItem(activity: IndexedActivity, marketsById: Map<number, MarketView>): ActivityItem {
  return {
    ...activity,
    question: activity.question || marketsById.get(activity.marketId)?.question || `Market #${activity.marketId}`,
    side: Number(activity.side || 0) as Outcome,
    amount: BigInt(activity.amount || "0")
  };
}

function mergeMarketState(incoming: MarketView, current?: MarketView) {
  if (!current) return incoming;
  const shouldPreserveLocalProposal =
    current.outcome === Outcome.Unresolved &&
    incoming.outcome === Outcome.Unresolved &&
    current.proposedAt > incoming.proposedAt;
  const shouldPreserveLocalResolution =
    current.outcome !== Outcome.Unresolved && incoming.outcome === Outcome.Unresolved;

  return {
    ...incoming,
    ...(shouldPreserveLocalProposal || shouldPreserveLocalResolution
      ? {
          proposedOutcome: current.proposedOutcome,
          proposedAt: current.proposedAt,
          disputeDeadline: current.disputeDeadline,
          disputed: current.disputed,
          disputer: current.disputer,
          outcome: current.outcome
        }
      : {}),
    yesPosition: current.yesPosition,
    noPosition: current.noPosition,
    claimed: current.claimed,
    potentialPayout: current.potentialPayout
  };
}

function mergeMarketRows(incomingRows: MarketView[], currentRows: MarketView[], totalMarketCount: number) {
  const incomingIds = new Set(incomingRows.map((market) => market.id));
  const currentById = new Map(currentRows.map((market) => [market.id, market]));
  const mergedRows = incomingRows.map((market) => mergeMarketState(market, currentById.get(market.id)));
  const localOnlyRows = currentRows.filter((market) => !incomingIds.has(market.id) && market.id < totalMarketCount);
  return [...mergedRows, ...localOnlyRows].sort((a, b) => b.id - a.id);
}

async function fetchIndexerJson<T>(path: string): Promise<T | null> {
  if (!INDEXER_URL || VIEWING_V3_ARCHIVE) return null;
  const [route, query = ""] = path.split("?");
  const urls = [
    `${INDEXER_URL}${path}`,
    `${INDEXER_URL}${route}.json${query ? `?${query}` : ""}`
  ];
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    for (const url of urls) {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (response.ok) return (await response.json()) as T;
    }
    return null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function postIndexerJson<T>(path: string, payload: unknown): Promise<T | null> {
  if (!INDEXER_URL || INDEXER_URL.includes("github.io") || VIEWING_V3_ARCHIVE) return null;
  try {
    const response = await fetch(`${INDEXER_URL}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function loadIndexedSnapshot(): Promise<IndexedSnapshot | null> {
  const [marketsResponse, activityResponse, statsResponse] = await Promise.all([
    fetchIndexerJson<{ markets: IndexedMarket[]; total: number }>("/api/markets"),
    fetchIndexerJson<{ activities: IndexedActivity[] }>("/api/activity?limit=2000"),
    fetchIndexerJson<{ stats: IndexedProjectStats }>("/api/stats")
  ]);

  if (!marketsResponse?.markets?.length) return null;

  const markets = marketsResponse.markets.map(indexedMarketToView).sort((a, b) => b.id - a.id);
  const marketsById = new Map(markets.map((market) => [market.id, market]));
  const activities = (activityResponse?.activities ?? [])
    .map((activity) => indexedActivityToItem(activity, marketsById))
    .sort((a, b) => b.timestamp - a.timestamp);

  return {
    markets,
    activities,
    stats: statsResponse?.stats ? indexedStatsToProjectStats(statsResponse.stats) : null,
    total: marketsResponse.total || markets.length
  };
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function compactAccountLabel(label: string) {
  const trimmed = label.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatUsdc(value: bigint, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const formatted = Number(formatUnits(value, decimals));
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: formatted < 1 && formatted > 0 ? 4 : 2,
    maximumFractionDigits: 6
  }).format(formatted);
}

function formatStatUsdc(value: bigint, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const formatted = Number(formatUnits(value, decimals));
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(formatted);
}

function formatSignedUsdc(value: bigint, decimals = ARC_NATIVE_USDC_DECIMALS) {
  if (value === 0n) return "0.00";
  const sign = value < 0n ? "-" : "+";
  const absolute = value < 0n ? -value : value;
  return `${sign}${formatUsdc(absolute, decimals)}`;
}

function formatUsdcInput(value: bigint, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const raw = formatUnits(value, decimals);
  return raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
}

function transactionUrl(hash: Hash) {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

function maybeTransactionUrl(hash?: string) {
  return hash && /^0x[a-fA-F0-9]{64}$/.test(hash) ? `${ARC_EXPLORER_URL}/tx/${hash}` : "";
}

function compactErrorMessage(error: unknown) {
  const raw = errorMessage(error);
  const firstLine = raw.split("\n").find(Boolean) || raw;
  const lower = raw.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("user denied")) return "Transaction rejected in wallet.";
  if (lower.includes("insufficient funds")) return "Insufficient wallet balance for this transaction. Check USDC for gas and the selected market token.";
  if (lower.includes("insufficientamountout") || lower.includes("0xe52970aa")) {
    return "Swap rate moved below the minimum receive amount. Nothing was exchanged. Get a fresh quote or select a higher price tolerance.";
  }
  if (lower.includes("transferfailed")) {
    return "Token transfer failed. Check the selected token balance and allowance before trying again.";
  }
  if (lower.includes("execution reverted")) {
    return "Transaction reverted by the contract. Check market status, amount, wallet permission, or open the transaction on Arcscan.";
  }
  if (lower.includes("contract interaction failed")) {
    return "Contract interaction failed. Check wallet balance, market status, contract address, or open the transaction details in your wallet.";
  }
  return firstLine.length > 220 ? `${firstLine.slice(0, 220)}...` : firstLine;
}

function lifiQuoteUrl(pair: StablecoinSwapPair, amount: bigint, account: string, slippage: number) {
  const params = new URLSearchParams({
    fromChain: String(ARC_CHAIN_ID_NUMBER),
    toChain: String(ARC_CHAIN_ID_NUMBER),
    fromToken: pair.fromToken,
    toToken: pair.toToken,
    fromAmount: amount.toString(),
    fromAddress: account,
    toAddress: account,
    slippage: String(slippage)
  });
  return `${LIFI_QUOTE_ENDPOINT}?${params.toString()}`;
}

function hasLifiQuote(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return Boolean(record.transactionRequest || record.estimate || record.toAmount);
}

function firstLifiFailureMessage(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  if (typeof record.message === "string" && record.message) return record.message;
  const errors = record.errors;
  if (!errors || typeof errors !== "object") return "";
  const failed = (errors as Record<string, unknown>).failed;
  if (!Array.isArray(failed)) return "";
  for (const item of failed) {
    if (!item || typeof item !== "object") continue;
    const itemRecord = item as Record<string, unknown>;
    const subpaths = itemRecord.subpaths;
    if (!subpaths || typeof subpaths !== "object") continue;
    for (const attempts of Object.values(subpaths as Record<string, unknown>)) {
      if (!Array.isArray(attempts)) continue;
      for (const attempt of attempts) {
        if (!attempt || typeof attempt !== "object") continue;
        const message = (attempt as Record<string, unknown>).message;
        if (typeof message === "string" && message) return message;
      }
    }
  }
  return "";
}

async function fetchLifiQuoteJson(pair: StablecoinSwapPair, amount: bigint, account: string, slippage: number) {
  const response = await fetch(lifiQuoteUrl(pair, amount, account, slippage));
  return (await response.json()) as unknown;
}

async function lifiRouteDiagnostic(pair: StablecoinSwapPair, requestedAmount: bigint, account: string, slippage: number) {
  try {
    const requested = await fetchLifiQuoteJson(pair, requestedAmount, account, slippage);
    if (hasLifiQuote(requested)) return "";
    const directFailure = firstLifiFailureMessage(requested);
    let largestWorkingProbe = 0n;
    for (const probeAmount of LIFI_PROBE_AMOUNTS) {
      if (probeAmount >= requestedAmount) continue;
      const probe = await fetchLifiQuoteJson(pair, probeAmount, account, slippage);
      if (hasLifiQuote(probe)) largestWorkingProbe = probeAmount;
    }
    if (largestWorkingProbe > 0n) {
      return `LI.FI has only shallow ${pair.fromSymbol} to ${pair.toSymbol} liquidity on Arc Testnet right now. Try ${formatUsdcInput(
        largestWorkingProbe,
        pair.decimals
      )} ${pair.fromSymbol} or less, or wait for LI.FI liquidity to recover.`;
    }
    if (pair.fromSymbol === "EURC" && pair.toSymbol === "USDC") {
      return "LI.FI currently has no EURC to USDC route on Arc Testnet. This is a LI.FI/liquidity limitation, not an AuraPredict market issue. Use USDC directly or try again later.";
    }
    if (directFailure.toLowerCase().includes("liquidity")) {
      return `LI.FI does not have enough ${pair.fromSymbol} to ${pair.toSymbol} liquidity on Arc Testnet for this amount. Try a much smaller amount or try again later.`;
    }
    return directFailure
      ? `LI.FI could not quote this ${pair.fromSymbol} to ${pair.toSymbol} swap on Arc Testnet: ${directFailure}`
      : `LI.FI could not quote ${pair.fromSymbol} to ${pair.toSymbol} on Arc Testnet right now. Try again later.`;
  } catch {
    return `LI.FI quote diagnostics are unavailable, and no ${pair.fromSymbol} to ${pair.toSymbol} route was returned. Try again later.`;
  }
}

function swapAmountToDecimalString(amount: bigint, decimals: number) {
  return formatUnits(amount, decimals);
}

function swapQuoteEstimatedAmount(quote: StablecoinSwapQuote, pair: StablecoinSwapPair) {
  return quote.provider === "lifi" ? BigInt(quote.route.toAmount) : parseUsdcInput(quote.estimatedAmountOut, pair.decimals);
}

function swapQuoteMinimumAmount(quote: StablecoinSwapQuote, pair: StablecoinSwapPair) {
  return quote.provider === "lifi" ? BigInt(quote.route.toAmountMin) : parseUsdcInput(quote.minimumAmountOut, pair.decimals);
}

function swapQuoteGasCost(quote: StablecoinSwapQuote) {
  return quote.provider === "lifi" ? quote.route.gasCostUSD || "" : "";
}

function swapQuoteProviderLabel(quote?: StablecoinSwapQuote | null) {
  if (!quote) return CIRCLE_APP_KIT_KEY ? "Circle App Kit, fallback LI.FI" : "LI.FI";
  return quote.provider === "arc-app-kit" ? "Circle App Kit" : "LI.FI";
}

async function createArcAppKitSwapRuntime(provider: EthereumProvider) {
  const [{ AppKit, Blockchain }, { createViemAdapterFromProvider }] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2")
  ]);
  const adapter = await createViemAdapterFromProvider({ provider: provider as never });
  return { kit: new AppKit(), Blockchain, adapter };
}

async function estimateArcAppKitSwap(
  provider: EthereumProvider,
  pair: StablecoinSwapPair,
  requestedAmount: bigint,
  toleranceBps: number
): Promise<AppKitSwapQuote> {
  if (!CIRCLE_APP_KIT_KEY) throw new Error("Circle App Kit key is not configured.");
  const { kit, Blockchain, adapter } = await createArcAppKitSwapRuntime(provider);
  const amountIn = swapAmountToDecimalString(requestedAmount, pair.decimals);
  const estimate = await kit.estimateSwap({
    from: { adapter, chain: Blockchain.Arc_Testnet },
    tokenIn: pair.fromSymbol,
    tokenOut: pair.toSymbol,
    amountIn,
    config: {
      kitKey: CIRCLE_APP_KIT_KEY,
      slippageBps: toleranceBps
    }
  } as never);
  return {
    provider: "arc-app-kit",
    amountIn,
    estimatedAmountOut: estimate.estimatedOutput.amount,
    minimumAmountOut: estimate.stopLimit.amount,
    pairKey: stablecoinSwapPairKey(pair),
    slippageBps: toleranceBps
  };
}

async function executeArcAppKitSwap(provider: EthereumProvider, pair: StablecoinSwapPair, quote: AppKitSwapQuote) {
  if (!CIRCLE_APP_KIT_KEY) throw new Error("Circle App Kit key is not configured.");
  const { kit, Blockchain, adapter } = await createArcAppKitSwapRuntime(provider);
  return kit.swap({
    from: { adapter, chain: Blockchain.Arc_Testnet },
    tokenIn: pair.fromSymbol,
    tokenOut: pair.toSymbol,
    amountIn: quote.amountIn,
    config: {
      kitKey: CIRCLE_APP_KIT_KEY,
      slippageBps: quote.slippageBps,
      stopLimit: quote.minimumAmountOut
    }
  } as never);
}

function parseUsdcInput(value: string, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const normalized = value.trim().replace(/,/g, ".");
  if (!normalized || Number(normalized) <= 0) return 0n;
  try {
    return parseUnits(normalized, decimals);
  } catch {
    return 0n;
  }
}

function normalizeReferenceUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const cleaned = trimmed.replace(/^[\s"'`[(]+|[\s"'`)\].,;:!?]+$/g, "");
  const normalizedToken = cleaned.toLowerCase();
  if (normalizedToken === "e.g" || normalizedToken === "eg" || normalizedToken === "i.e" || normalizedToken === "ie") {
    return "";
  }
  const markdownLink = cleaned.match(/\((https?:\/\/[^\s)]+)\)/i);
  if (markdownLink?.[1]) return markdownLink[1];
  const directLink = cleaned.match(/https?:\/\/[^\s)\]]+/i);
  if (directLink?.[0]) return directLink[0];
  const domainMatch = cleaned.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[^\s)]*)?/i);
  if (domainMatch) return `https://${domainMatch[1]}${domainMatch[2] || ""}`;

  const lower = cleaned.toLowerCase();
  if (lower.includes("coingecko")) return "https://www.coingecko.com";
  if (lower.includes("coinmarketcap")) return "https://coinmarketcap.com";
  if (lower.includes("tradingview")) return "https://www.tradingview.com";
  if (lower.includes("binance")) return "https://www.binance.com";
  if (lower.includes("coinbase")) return "https://www.coinbase.com";
  if (lower.includes("kraken")) return "https://www.kraken.com";
  if (lower.includes("reuters")) return "https://www.reuters.com";
  if (lower.includes("associated press") || lower === "ap" || lower.includes(" ap ")) return "https://apnews.com";
  if (lower.includes("bbc")) return "https://www.bbc.com/news";
  if (lower.includes("cnn")) return "https://www.cnn.com";
  if (lower.includes("bloomberg")) return "https://www.bloomberg.com";
  if (lower.includes("wsj") || lower.includes("wall street journal")) return "https://www.wsj.com";
  if (lower.includes("new york times") || lower === "nyt") return "https://www.nytimes.com";
  if (lower.includes("financial times") || lower === "ft") return "https://www.ft.com";
  if (lower.includes("washington post")) return "https://www.washingtonpost.com";
  if (lower.includes("al jazeera")) return "https://www.aljazeera.com";
  if (lower.includes("axios")) return "https://www.axios.com";
  if (lower.includes("politico")) return "https://www.politico.com";
  if (lower.includes("abc news")) return "https://abcnews.go.com";
  if (lower.includes("cbs news")) return "https://www.cbsnews.com";
  if (lower.includes("nbc news")) return "https://www.nbcnews.com";
  if (lower.includes("fox news")) return "https://www.foxnews.com";
  if (lower.includes("the guardian") || lower === "guardian") return "https://www.theguardian.com";
  if (lower === "npr" || lower.includes("national public radio")) return "https://www.npr.org";
  if (lower.includes("coindesk")) return "https://www.coindesk.com";
  if (lower.includes("cointelegraph")) return "https://cointelegraph.com";
  if (lower.includes("federal reserve") || lower === "fed") return "https://www.federalreserve.gov";
  if (lower.includes("bls") || lower.includes("bureau of labor statistics")) return "https://www.bls.gov";
  if (lower.includes("sec")) return "https://www.sec.gov";
  if (lower.includes("fec")) return "https://www.fec.gov";
  if (lower.includes("congress.gov")) return "https://www.congress.gov";
  if (lower.includes("govtrack")) return "https://www.govtrack.us";
  if (lower.includes("ecb")) return "https://www.ecb.europa.eu";
  return cleaned;
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) return false;
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = new Set([
      "e.g",
      "i.e",
      "example.com",
      "example.net",
      "example.org",
      "localhost",
      "invalid",
      "test"
    ]);
    if (blockedHosts.has(host)) return false;
    if (/^[a-z]\.[a-z]$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function stripRuleMetadata(value: string) {
  return String(value || "")
    .replace(new RegExp(`\\n*${AURA_RULE_JSON_PREFIX}[\\s\\S]*$`), "")
    .trim();
}

function structuredRuleFromText(value?: string): StructuredResolutionRule | null {
  const text = String(value || "");
  const index = text.indexOf(AURA_RULE_JSON_PREFIX);
  if (index < 0) return null;
  const raw = text.slice(index + AURA_RULE_JSON_PREFIX.length).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StructuredResolutionRule;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function parseComparatorTarget(value: string): Pick<StructuredResolutionRule, "comparator" | "target"> {
  const text = String(value || "").toLowerCase().replace(/\s+/g, " ");
  const patterns: Array<{ comparator: "gte" | "lte" | "eq"; regex: RegExp }> = [
    { comparator: "gte", regex: /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|usdc|points?|index|per ounce)?\s*(?:or higher|or above|or more|or greater)/i },
    { comparator: "lte", regex: /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|usdc|points?|index|per ounce)?\s*(?:or lower|or below|or less)/i },
    { comparator: "gte", regex: /(?:at\s+or\s+above|at\s+least|above|higher than|greater than|>=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "lte", regex: /(?:at\s+or\s+below|at\s+most|below|lower than|less than|<=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "eq", regex: /(?:exactly|equal(?:s)?|=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i }
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    const target = match?.[1]?.replace(/,/g, "");
    if (target) return { comparator: pattern.comparator, target };
  }
  return {};
}

function inferRuleKindAndAsset(category: string, text: string): Pick<StructuredResolutionRule, "kind" | "asset" | "metric"> {
  const value = `${category} ${text}`.toLowerCase();
  if (/\/health(?:\?|$|\/)|\bhealth endpoint\b|\bok true\b|\bapi status\b/.test(value)) {
    return { kind: "status-health", metric: "http_health" };
  }
  if (/\bgithub status\b|\bopenai status\b|\bstatus page\b/.test(value)) {
    return { kind: "status-page", metric: "service_status" };
  }
  if (/\bfootball\b|\bsoccer\b|\bnba\b|\bnfl\b|\bmlb\b|\bespn\b|\bfixture\b|\bmatch\b/.test(value)) {
    return { kind: "sports-fixture", metric: "fixture_presence" };
  }
  const cryptoAssets = [
    ["BTC", /\bbtc\b|\bbitcoin\b/],
    ["ETH", /\beth\b|\bethereum\b/],
    ["SOL", /\bsol\b|\bsolana\b/],
    ["BNB", /\bbnb\b/],
    ["XRP", /\bxrp\b/],
    ["ADA", /\bada\b|\bcardano\b/],
    ["DOGE", /\bdoge\b|\bdogecoin\b/],
    ["AVAX", /\bavax\b|\bavalanche\b/],
    ["LINK", /\blink\b|\bchainlink\b/]
  ] as const;
  for (const [asset, regex] of cryptoAssets) {
    if (regex.test(value)) return { kind: "crypto-price", asset, metric: `${asset}/USD spot` };
  }
  if (/\bxau\b|\bgold\b|\bgc=f\b/.test(value)) return { kind: "macro-price", asset: "GOLD", metric: "XAU/USD spot" };
  if (/\bdxy\b|\bdollar index\b|\bus dollar index\b/.test(value)) return { kind: "macro-price", asset: "DXY", metric: "US Dollar Index" };
  return { kind: "manual-review" };
}

function buildStructuredResolutionRule(input: {
  question: string;
  category: string;
  closeTime: string;
  resolutionTime: string;
  resolutionSource: string;
  resolutionRule: string;
  fallbackSource: string;
}): StructuredResolutionRule {
  const ruleText = stripRuleMetadata(input.resolutionRule);
  const kind = inferRuleKindAndAsset(input.category, `${input.question} ${ruleText} ${input.resolutionSource}`);
  return {
    version: 1,
    ...kind,
    ...parseComparatorTarget(`${input.question} ${ruleText}`),
    closeTimeUtc: input.closeTime,
    resolutionTimeUtc: input.resolutionTime || input.closeTime,
    primarySource: input.resolutionSource,
    fallbackSource: input.fallbackSource || undefined
  };
}

function resolutionRuleForContract(input: {
  question: string;
  category: string;
  closeTime: string;
  resolutionTime: string;
  resolutionSource: string;
  resolutionRule: string;
  fallbackSource: string;
}) {
  const humanRule = stripRuleMetadata(input.resolutionRule);
  const metadata = buildStructuredResolutionRule({ ...input, resolutionRule: humanRule });
  return `${humanRule}\n${AURA_RULE_JSON_PREFIX}${JSON.stringify(metadata)}`;
}

function marketVolume(market: MarketView) {
  return market.yesPool + market.noPool;
}

function marketDecimals(market?: Pick<MarketView, "settlementDecimals">) {
  return market?.settlementDecimals ?? ARC_NATIVE_USDC_DECIMALS;
}

function marketSymbol(market?: Pick<MarketView, "settlementSymbol">) {
  return market?.settlementSymbol || "USDC";
}

function formatMarketAmount(value: bigint, market?: Pick<MarketView, "settlementDecimals">) {
  return formatUsdc(value, marketDecimals(market));
}

function assetStatsFromMarkets(
  markets: MarketView[],
  nowSeconds: number,
  defaultToken: string,
  defaultSymbol: string,
  defaultDecimals: number
) {
  const rows = new Map<string, AssetStats>();

  for (const market of markets) {
    const token = (market.settlementToken || defaultToken || market.settlementSymbol || defaultSymbol || "USDC").toLowerCase();
    const symbol = marketSymbol({ settlementSymbol: market.settlementSymbol || defaultSymbol });
    const decimals = marketDecimals({ settlementDecimals: market.settlementDecimals ?? defaultDecimals });
    const volume = marketVolume(market);
    const isLive = market.outcome === Outcome.Unresolved && market.closeTime > nowSeconds;
    const isPending = market.outcome === Outcome.Unresolved && market.closeTime <= nowSeconds;
    const current = rows.get(token) ?? {
      token: isAddress(market.settlementToken || "") ? market.settlementToken : isAddress(defaultToken) ? defaultToken : undefined,
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

    current.marketCount += 1;
    current.participantEntries += market.traderCount;
    current.totalVolume += volume;
    if (isLive) {
      current.liveMarkets += 1;
      current.liveLiquidity += volume;
    } else if (isPending) {
      current.pendingMarkets += 1;
    } else {
      current.endedMarkets += 1;
    }
    current.averageMarketVolume = current.marketCount > 0 ? current.totalVolume / BigInt(current.marketCount) : 0n;
    rows.set(token, current);
  }

  return [...rows.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function fallbackAssetStatsFromProject(stats: ProjectStats | null, defaultSymbol = "USDC", defaultDecimals = ARC_NATIVE_USDC_DECIMALS) {
  if (!stats) return [];
  if (stats.assetBreakdown && stats.assetBreakdown.length > 0) return stats.assetBreakdown;
  const symbols = stats.settlementSymbols && stats.settlementSymbols.length > 0 ? stats.settlementSymbols : [defaultSymbol];
  if (symbols.length === 1) {
    return [{
      symbol: symbols[0],
      decimals: defaultDecimals,
      marketCount: stats.totalMarkets,
      liveMarkets: stats.liveMarkets,
      endedMarkets: stats.endedMarkets,
      pendingMarkets: stats.pendingMarkets,
      participantEntries: stats.participantEntries,
      totalVolume: stats.totalVolume,
      liveLiquidity: stats.liveLiquidity,
      averageMarketVolume: stats.averageMarketVolume
    }];
  }
  return symbols.map((symbol) => ({
    symbol,
    decimals: defaultDecimals,
    marketCount: 0,
    liveMarkets: 0,
    endedMarkets: 0,
    pendingMarkets: 0,
    participantEntries: 0,
    totalVolume: 0n,
    liveLiquidity: 0n,
    averageMarketVolume: 0n
  }));
}

function formatAssetSummary(assets: AssetStats[], field: "totalVolume" | "liveLiquidity" | "averageMarketVolume") {
  if (assets.length === 0) return "--";
  return assets
    .map((asset) => `${formatUsdc(asset[field], asset.decimals)} ${asset.symbol}`)
    .join(" / ");
}

function resolutionTimeFor(market: Pick<MarketView, "closeTime" | "resolutionTime">) {
  return market.resolutionTime || market.closeTime;
}

function percent(value: bigint, total: bigint) {
  if (total === 0n) return 50;
  return Number((value * 10000n) / total) / 100;
}

function compareBigint(a: bigint, b: bigint) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function betEstimate(market: MarketView, side: Outcome, amount: bigint, feeBps: number) {
  if (amount <= 0n || (side !== Outcome.Yes && side !== Outcome.No)) {
    return { payout: 0n, profit: 0n, pricePercent: side === Outcome.No ? 50 : 50 };
  }

  const sidePool = side === Outcome.Yes ? market.yesPool + amount : market.noPool + amount;
  const totalAfter = marketVolume(market) + amount;
  const grossPayout = sidePool > 0n ? (amount * totalAfter) / sidePool : 0n;
  const profit = grossPayout > amount ? grossPayout - amount : 0n;
  const fee = (profit * BigInt(feeBps)) / 10000n;
  const payout = grossPayout - fee;
  const pricePercent = percent(sidePool, totalAfter);

  return {
    payout,
    profit: payout > amount ? payout - amount : 0n,
    pricePercent
  };
}

function outcomeLabel(outcome: Outcome) {
  if (outcome === Outcome.Yes) return "YES won";
  if (outcome === Outcome.No) return "NO won";
  if (outcome === Outcome.Canceled) return "Canceled";
  return "Live";
}

function closeDate(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value * 1000)) + " UTC";
}

function closeDateLocal(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value * 1000));
}

function chartTimeLabel(value: number, includeDate = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(includeDate ? { month: "short", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value * 1000));
}

function chartAxisLabel(value: number, rangeSeconds: number) {
  if (rangeSeconds >= 2 * 24 * 60 * 60) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "2-digit"
    }).format(new Date(value * 1000));
  }
  return chartTimeLabel(value);
}

function smoothPathFromPoints(points: Array<{ x: number; y: number }>) {
  const cleanedPoints = points.reduce<Array<{ x: number; y: number }>>((acc, point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return acc;
    const nextPoint = { x: point.x, y: point.y };
    const lastPoint = acc[acc.length - 1];
    if (lastPoint && Math.abs(lastPoint.x - nextPoint.x) < 0.05) {
      lastPoint.y = nextPoint.y;
      return acc;
    }
    acc.push(nextPoint);
    return acc;
  }, []);

  if (cleanedPoints.length === 0) return "";
  if (cleanedPoints.length === 1) return `M${cleanedPoints[0].x},${cleanedPoints[0].y}`;

  const coord = (value: number) => Number(value.toFixed(3));
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  let path = `M${coord(cleanedPoints[0].x)},${coord(cleanedPoints[0].y)}`;

  for (let index = 0; index < cleanedPoints.length - 1; index += 1) {
    const p0 = cleanedPoints[Math.max(0, index - 1)];
    const p1 = cleanedPoints[index];
    const p2 = cleanedPoints[index + 1];
    const p3 = cleanedPoints[Math.min(cleanedPoints.length - 1, index + 2)];
    const dx = p2.x - p1.x;
    if (dx <= 0.05) {
      path += ` L${coord(p2.x)},${coord(p2.y)}`;
      continue;
    }

    const smoothing = 0.32;
    const previousSlope = (p2.y - p0.y) / Math.max(0.1, p2.x - p0.x);
    const nextSlope = (p3.y - p1.y) / Math.max(0.1, p3.x - p1.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const cp1x = p1.x + dx * smoothing;
    const cp2x = p2.x - dx * smoothing;
    const cp1y = clamp(p1.y + previousSlope * dx * smoothing, minY, maxY);
    const cp2y = clamp(p2.y - nextSlope * dx * smoothing, minY, maxY);
    path += ` C${coord(cp1x)},${coord(cp1y)} ${coord(cp2x)},${coord(cp2y)} ${coord(p2.x)},${coord(p2.y)}`;
  }

  return path;
}

function parseUtcDateTime(value: string) {
  const normalizedValue = value.trim().replace("T", " ");
  const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})\s([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    throw new Error("Use UTC format YYYY-MM-DD HH:mm (24-hour).");
  }
  const [, y, mo, d, h, mi] = match;
  const timestamp = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0);
  if (Number.isNaN(timestamp)) {
    throw new Error("Enter a valid UTC close time.");
  }
  return BigInt(Math.floor(timestamp / 1000));
}

function parseUtcDateTimeParts(value: string) {
  const normalizedValue = value.trim().replace("T", " ");
  const match = normalizedValue.match(/^(\d{4}-\d{2}-\d{2})\s([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return {
    date: match[1],
    time: `${match[2]}:${match[3]}`
  };
}

function combineUtcDateTimeParts(datePart: string, timePart: string) {
  const date = datePart.trim();
  const time = timePart.trim();
  if (!date || !time) return "";
  return `${date} ${time}`;
}

function parseAuraUtcCloseTimeFromText(value: string) {
  const text = value.trim();
  if (!text) return "";
  const embeddedUtcMatch = text.match(
    /(\d{4}-\d{2}-\d{2})[T\s]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*(UTC|Z)\b/i
  );
  if (embeddedUtcMatch) {
    const [, datePart, hh, mm] = embeddedUtcMatch;
    return combineUtcDateTimeParts(datePart, `${hh}:${mm}`);
  }
  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})[T\s]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*Z/i);
  if (isoMatch) {
    const [, datePart, hh, mm] = isoMatch;
    return combineUtcDateTimeParts(datePart, `${hh}:${mm}`);
  }
  const direct = parseUtcDateTimeParts(text);
  if (direct) return combineUtcDateTimeParts(direct.date, direct.time);

  const namedDateMatch = text.match(
    /(\d{1,2}):(\d{2})\s*(AM|PM)\s+UTC\s+on\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i
  );
  if (!namedDateMatch) return "";
  const [, hhRaw, mmRaw, ampmRaw, monthRaw, dayRaw, yearRaw] = namedDateMatch;
  const monthIndex = new Date(`${monthRaw} 1, 2000`).getMonth();
  if (Number.isNaN(monthIndex)) return "";
  let hour = Number(hhRaw);
  const minute = Number(mmRaw);
  const ampm = ampmRaw.toUpperCase();
  if (ampm === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour < 12) {
    hour += 12;
  }
  const datePart = `${yearRaw}-${String(monthIndex + 1).padStart(2, "0")}-${String(Number(dayRaw)).padStart(2, "0")}`;
  const timePart = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return combineUtcDateTimeParts(datePart, timePart);
}

function parseResolutionReferenceTime(value: string) {
  return parseAuraUtcCloseTimeFromText(value);
}

function parseUtcInputToUnixSeconds(value: string) {
  if (!value) return null;
  try {
    return Number(parseUtcDateTime(value));
  } catch {
    return null;
  }
}

function defaultSourceByContext(category?: string, text?: string) {
  const cat = (category || "").toLowerCase();
  const content = (text || "").toLowerCase();
  if (cat === "crypto" || /\bbtc\b|\beth\b|token|price|usdt|usdc|coin|coingecko|binance|coinbase/.test(content)) {
    return "https://www.coingecko.com";
  }
  if (cat === "sports" || /match|goal|nba|nfl|mlb|fifa|uefa|atp|wta/.test(content)) {
    return "https://www.espn.com";
  }
  if (cat === "politics" || cat === "macro" || /election|president|white house|fed|cpi|inflation|war|government|parliament/.test(content)) {
    return "https://www.reuters.com";
  }
  if (cat === "arc" || /\barc\b|testnet|mainnet|chain/.test(content)) {
    return "https://docs.arc.io";
  }
  return "https://www.reuters.com";
}

function utcDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    " ",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes())
  ].join("");
}

function utcInputFromNow(now: Date, offsetMinutes: number) {
  const timestamp = now.getTime() + Math.max(0, offsetMinutes) * 60 * 1000;
  return utcDateTimeInputValue(new Date(timestamp));
}

function countdownText(closeTime: number, now: Date) {
  let remaining = Math.max(0, closeTime * 1000 - now.getTime());
  if (remaining === 0) return "Ended";

  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;

  const days = Math.floor(remaining / day);
  remaining -= days * day;
  const hours = Math.floor(remaining / hour);
  remaining -= hours * hour;
  const minutes = Math.floor(remaining / minute);

  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  return `${minutes}M`;
}

function durationText(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Not set";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(" ") : `${seconds}s`;
}

function timeAgo(timestamp: number, now: Date) {
  if (timestamp <= 0) return "";
  const elapsed = Math.max(0, Math.floor((now.getTime() - timestamp * 1000) / 1000));
  if (elapsed < 60) return `${elapsed}s ago`;
  const minutes = Math.floor(elapsed / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortQuestion(question: string) {
  return question.length > 70 ? `${question.slice(0, 67)}...` : question;
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function isStablecoinContractVersion(version: MarketContractVersion) {
  return version === "v3" || version === "v4";
}

function hasUserPosition(market: MarketView) {
  return market.yesPosition > 0n || market.noPosition > 0n;
}

function settlementForPosition(market: MarketView, feeBps: number, yesPosition: bigint, noPosition: bigint) {
  const stake = yesPosition + noPosition;
  if (market.outcome === Outcome.Unresolved) {
    return { settled: false, stake, payout: 0n, pnl: 0n, won: false };
  }

  if (market.outcome === Outcome.Canceled) {
    return { settled: true, stake, payout: stake, pnl: 0n, won: false };
  }

  const winningStake = market.outcome === Outcome.Yes ? yesPosition : noPosition;
  const winningPool = market.outcome === Outcome.Yes ? market.yesPool : market.noPool;
  const grossPayout =
    winningStake > 0n && winningPool > 0n ? (winningStake * marketVolume(market)) / winningPool : 0n;
  const profit = grossPayout > winningStake ? grossPayout - winningStake : 0n;
  const fee = (profit * BigInt(feeBps)) / 10000n;
  const payout = grossPayout - fee;

  return {
    settled: true,
    stake,
    payout,
    pnl: payout - stake,
    won: winningStake > 0n
  };
}

function userSettlement(market: MarketView, feeBps: number) {
  return settlementForPosition(market, feeBps, market.yesPosition, market.noPosition);
}

function personalMarketResult(market: MarketView, subject = "You") {
  const stake = market.yesPosition + market.noPosition;
  if (stake === 0n) {
    return { label: "Not participated", className: "neutral" };
  }

  if (market.outcome === Outcome.Unresolved) {
    return { label: "Position open", className: "live" };
  }

  if (market.outcome === Outcome.Canceled) {
    return { label: "Canceled / refund", className: "refund" };
  }

  const winningStake = market.outcome === Outcome.Yes ? market.yesPosition : market.noPosition;
  return winningStake > 0n
    ? { label: `${subject} won`, className: "won" }
    : { label: `${subject} lost`, className: "lost" };
}

function claimStatusFor(market: MarketView, settlement: ReturnType<typeof userSettlement>, isOwnProfile: boolean) {
  if (!settlement.settled) {
    return "Not settled";
  }

  if (settlement.stake === 0n) {
    return "No position";
  }

  if (market.outcome === Outcome.Canceled) {
    if (!isOwnProfile) {
      return "Refund estimate";
    }

    if (market.claimed) {
      return "Refund claimed";
    }

    return market.potentialPayout > 0n ? "Refund ready" : "No refund";
  }

  if (!settlement.won) {
    return "No payout";
  }

  if (!isOwnProfile) {
    return "Estimated";
  }

  if (market.claimed) {
    return "Claimed";
  }

  return market.potentialPayout > 0n ? "Ready to claim" : "Refresh required";
}

function auraPointsFor(
  volume: bigint,
  wonMarkets: number,
  resolvedMarkets: number,
  createdMarkets: number,
  pnl: bigint,
  decimals = ARC_NATIVE_USDC_DECIMALS
) {
  const participationScore = 25;
  const volumeScore = Number(formatUnits(volume, decimals)) * 10;
  const pnlScore = Math.max(0, Number(formatUnits(pnl, decimals)) * 12);
  const winRate = resolvedMarkets > 0 ? (wonMarkets / resolvedMarkets) * 100 : 0;

  return Math.max(
    0,
    Math.round(participationScore + volumeScore + pnlScore + wonMarkets * 90 + resolvedMarkets * 18 + createdMarkets * 35 + winRate * 4)
  );
}

function auraBreakdownFor(
  volume: bigint,
  wonMarkets: number,
  resolvedMarkets: number,
  createdMarkets: number,
  pnl: bigint,
  decimals = ARC_NATIVE_USDC_DECIMALS,
  assetLabel = "USDC"
): AuraBreakdown {
  const volumeUsdc = Number(formatUnits(volume, decimals));
  const pnlUsdc = Number(formatUnits(pnl, decimals));
  const winRate = resolvedMarkets > 0 ? (wonMarkets / resolvedMarkets) * 100 : 0;
  const items = [
    { label: "Participation", detail: "Base score for active profiles", value: 25 },
    { label: "Volume", detail: `${volumeUsdc.toFixed(2)} ${assetLabel} x 10`, value: volumeUsdc * 10 },
    { label: "Positive PNL", detail: `max(${pnlUsdc.toFixed(2)}, 0) x 12`, value: Math.max(0, pnlUsdc * 12) },
    { label: "Winning markets", detail: `${wonMarkets} wins x 90`, value: wonMarkets * 90 },
    { label: "Resolved markets", detail: `${resolvedMarkets} settled x 18`, value: resolvedMarkets * 18 },
    { label: "Created markets", detail: `${createdMarkets} created x 35`, value: createdMarkets * 35 },
    { label: "Accuracy", detail: `${winRate.toFixed(1)}% win rate x 4`, value: winRate * 4 }
  ];

  return {
    items: items.map((item) => ({ ...item, value: Math.round(item.value) })),
    total: auraPointsFor(volume, wonMarkets, resolvedMarkets, createdMarkets, pnl, decimals),
    winRate
  };
}

function reputationTierFor(points: number) {
  return (
    [...REPUTATION_TIERS]
      .reverse()
      .find((tier) => points >= tier.min) ?? REPUTATION_TIERS[0]
  );
}

function reputationBadgesFor(row: LeaderboardRow, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const volumeUsdc = Number(formatUnits(row.volume, decimals));
  const badges: string[] = [];

  if (row.resolvedMarkets >= 3 && row.winRate >= 70) badges.push("Master Forecaster");
  if (volumeUsdc >= 100) badges.push("High Volume");
  if (row.pnl > 0n) badges.push("Positive Edge");
  if (row.createdMarkets >= 3) badges.push("Market Maker");
  if (row.resolvedMarkets >= 5) badges.push("Fast Resolver");
  if (row.auraPoints >= 1000 && badges.length === 0) badges.push("Rising Trader");

  return badges.slice(0, 3);
}

function marketStatus(market: MarketView) {
  if (market.outcome !== Outcome.Unresolved) return outcomeLabel(market.outcome);
  if (market.disputed) return "Disputed";
  if (market.proposedAt > 0) return "Pending finalization";
  if (Date.now() / 1000 >= market.closeTime) return "Awaiting resolve";
  return "Live";
}

function resolveActionHint(market: Pick<MarketView, "yesPool" | "noPool">) {
  const noYesPool = market.yesPool <= 0n;
  const noNoPool = market.noPool <= 0n;
  if (noYesPool && noNoPool) return "No positions were placed. Use Cancel to release the creator bond.";
  if (noYesPool || noNoPool) return "Only one outcome was funded. YES/NO resolution is disabled; use Cancel to refund the funded position.";
  return "";
}

function hasNoLiquidity(market: Pick<MarketView, "yesPool" | "noPool">) {
  return market.yesPool === 0n && market.noPool === 0n;
}

function requiresCancelForLiquidity(market: Pick<MarketView, "yesPool" | "noPool">) {
  return market.yesPool === 0n || market.noPool === 0n;
}

function finalizeWaitingHint(market: Pick<MarketView, "proposedAt" | "outcome" | "disputed" | "disputeDeadline">) {
  if (market.outcome !== Outcome.Unresolved || market.proposedAt === 0 || market.disputed || market.disputeDeadline <= 0) {
    return "";
  }
  const now = Math.floor(Date.now() / 1000);
  if (now >= market.disputeDeadline) {
    return "Finalize is now available.";
  }
  return `Finalize available after ${closeDate(market.disputeDeadline)} (${closeDateLocal(market.disputeDeadline)} local).`;
}

function aiOutcomeFromText(value?: string | null) {
  const outcomeText = String(value || "").trim().toUpperCase();
  if (outcomeText === "YES") return Outcome.Yes;
  if (outcomeText === "NO") return Outcome.No;
  if (outcomeText === "CANCEL" || outcomeText === "CANCELED" || outcomeText === "CANCELLED") return Outcome.Canceled;
  return Outcome.Unresolved;
}

function aiDecisionText(value?: string | null) {
  const outcomeText = String(value || "").trim().toUpperCase();
  if (outcomeText === "YES") return "YES";
  if (outcomeText === "NO") return "NO";
  if (outcomeText === "CANCEL" || outcomeText === "CANCELED" || outcomeText === "CANCELLED") return "CANCEL / REFUND";
  if (outcomeText.includes("INSUFFICIENT")) return "INSUFFICIENT EVIDENCE";
  if (outcomeText === "NEEDS_REVIEW") return "NEEDS REVIEW";
  return "";
}

function aiOutcomeFromReceipt(receipt?: AiResolutionReceipt | null) {
  if (!receipt) return Outcome.Unresolved;
  if (typeof receipt.proposedOutcomeValue === "number") {
    if (receipt.proposedOutcomeValue === Outcome.Yes) return Outcome.Yes;
    if (receipt.proposedOutcomeValue === Outcome.No) return Outcome.No;
    if (receipt.proposedOutcomeValue === Outcome.Canceled) return Outcome.Canceled;
  }
  return aiOutcomeFromText(receipt.consensus?.outcome || receipt.proposedOutcome);
}

function oracleOutcomeFromProposal(proposal?: OracleProposal | null) {
  if (!proposal) return Outcome.Unresolved;
  if (typeof proposal.outcomeValue === "number") {
    if (proposal.outcomeValue === Outcome.Yes) return Outcome.Yes;
    if (proposal.outcomeValue === Outcome.No) return Outcome.No;
    if (proposal.outcomeValue === Outcome.Canceled) return Outcome.Canceled;
  }
  return aiOutcomeFromText(proposal.outcome);
}

function urlHostLabel(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function isUnknownChainError(error: unknown) {
  const code = (error as { code?: number }).code;
  const message = errorMessage(error).toLowerCase();
  return (
    code === 4902 ||
    message.includes("4902") ||
    message.includes("not added") ||
    message.includes("unknown chain") ||
    message.includes("unrecognized chain") ||
    message.includes("try adding") ||
    message.includes("wallet_addethereumchain")
  );
}

function isDuplicateRpcNetworkError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("same rpc endpoint as existing network") ||
    message.includes("already exists") ||
    message.includes("already been added")
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

function walletConnectionErrorMessage(prefix: string, error: unknown) {
  const message = errorMessage(error);
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("same rpc endpoint as existing network")) {
    return `${prefix}: this wallet already has an Arc network saved with a conflicting chain ID. Remove the old Arc network in wallet settings, then reconnect.`;
  }
  if (
    lowerMessage.includes("unrecognized chain") ||
    lowerMessage.includes("unknown chain") ||
    lowerMessage.includes("wallet_addethereumchain") ||
    lowerMessage.includes("not added") ||
    lowerMessage.includes("try adding")
  ) {
    return `${prefix}: Arc Testnet is not added in this wallet. Approve Add network when prompted, then reconnect.`;
  }
  return `${prefix}: ${message}`;
}

function isRateLimitError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("429") || message.includes("too many requests") || message.includes("rate limit");
}

async function withRpcRetry<T>(request: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 0; attempt < RPC_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === RPC_RETRY_ATTEMPTS - 1) {
        throw error;
      }

      const delay = RPC_RETRY_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
        if (RPC_CALL_STAGGER_MS > 0) {
          await sleep(RPC_CALL_STAGGER_MS);
        }
      }
    })
  );

  return results;
}

function updateMarketRoute(marketId: number | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete(PROFILE_QUERY_KEY);
  if (marketId === null) {
    url.searchParams.delete(MARKET_QUERY_KEY);
  } else {
    url.searchParams.set(MARKET_QUERY_KEY, String(marketId));
  }
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function updateProfileRoute(address: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete(MARKET_QUERY_KEY);
  if (address) {
    url.searchParams.set(PROFILE_QUERY_KEY, address);
  } else {
    url.searchParams.delete(PROFILE_QUERY_KEY);
  }
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
}

function marketImageFor(market: Pick<MarketView, "id" | "category">) {
  const rawCategory = (market.category || "Other").toLowerCase();
  const category = MARKET_IMAGE_CATEGORIES.includes(rawCategory as (typeof MARKET_IMAGE_CATEGORIES)[number])
    ? rawCategory
    : "other";
  const index = Math.abs(market.id % MARKET_IMAGE_COUNT) + 1;
  return `/market-images/${category}-${index}.webp`;
}

function marketImageVariant(market: Pick<MarketView, "id">) {
  return `market-image-variant-${Math.abs(market.id % 6)}`;
}

function CategoryIcon({ category }: { category: string }) {
  const key = categoryMeta(category).label;

  if (key === "Crypto") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 20 12 12 21 4 12 12 3Z" />
        <path d="M12 3v18" />
        <path d="M4 12h16" />
      </svg>
    );
  }

  if (key === "Macro") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
        <path d="M3 19h18" />
      </svg>
    );
  }

  if (key === "Sports") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M6.5 8.5c3.6 1.4 7.4 1.4 11 0" />
        <path d="M6.5 15.5c3.6-1.4 7.4-1.4 11 0" />
      </svg>
    );
  }

  if (key === "Politics") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16" />
        <path d="M6 17V9" />
        <path d="M18 17V9" />
        <path d="M12 17V9" />
        <path d="M3 9h18L12 4 3 9Z" />
      </svg>
    );
  }

  if (key === "Arc") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 17c3.1-6.8 12.9-6.8 16 0" />
        <path d="M8 18 12 9l4 9" />
      </svg>
    );
  }

  if (key === "AI") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v5" />
        <path d="M12 16v5" />
        <path d="M3 12h5" />
        <path d="M16 12h5" />
        <path d="M9 9h6v6H9z" />
      </svg>
    );
  }

  if (key === "Other") {
    return (
      <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="18" cy="12" r="2" />
      </svg>
    );
  }

  return (
    <svg className="category-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h6v6H4z" />
      <path d="M14 5h6v6h-6z" />
      <path d="M4 15h6v4H4z" />
      <path d="M14 15h6v4h-6z" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: ThemeMode }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="M4.93 4.93 6.34 6.34" />
        <path d="M17.66 17.66 19.07 19.07" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="M4.93 19.07 6.34 17.66" />
        <path d="M17.66 6.34 19.07 4.93" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.2A8 8 0 0 1 9.8 4 7 7 0 1 0 20 14.2Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function GridViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h5v5H5z" />
      <path d="M14 5h5v5h-5z" />
      <path d="M5 14h5v5H5z" />
      <path d="M14 14h5v5h-5z" />
    </svg>
  );
}

function ListViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  );
}

function LandingPage() {
  const [landingTheme, setLandingTheme] = useState<ThemeMode>(() => {
    try {
      return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [landingStats, setLandingStats] = useState<ProjectStats | null>(null);
  const [landingMarketAssetStats, setLandingMarketAssetStats] = useState<AssetStats[]>([]);
  const [landingHealth, setLandingHealth] = useState<LandingHealth | null>(null);
  const indexerIsRealtime = INDEXER_URL && !INDEXER_URL.includes("github.io");
  const featureCards = [
    {
      title: "YES/NO markets",
      text: "Create binary prediction markets for crypto, macro, sports, politics, Arc, AI, and community events."
    },
    {
      title: "Stablecoin settlement",
      text: "The current contract supports 6-decimal settlement assets by market, including Arc Testnet USDC and EURC, with selected-token balance checks before actions."
    },
    {
      title: "Stablecoin swap access",
      text: "Wallets can request a USDC/EURC quote from a market or profile. Aura tries Circle App Kit first when configured, then falls back to LI.FI liquidity before the wallet signs."
    },
    {
      title: "Onchain market terms",
      text: "Each market's primary source, fallback source, and resolution rule are stored onchain so settlement criteria stay tied to the market."
    },
    {
      title: "Oracle-ready authority",
      text: "The contract supports creator review, required authority review, authority-only resolution, and an adapter-only path for a future oracle or committee."
    },
    {
      title: "Objective oracle proposals",
      text: "The indexer can check objective markets such as crypto prices, macro prices, and health/status endpoints, then show or auto-submit a high-confidence Oracle proposal before final review."
    },
    {
      title: "Policy controls",
      text: "Operational controls can pause new activity, allow approved creators, or block new positions without preventing existing markets from settling."
    },
    {
      title: "Protocol revenue",
      text: "Configurable creation fees and winner-profit fees accrue onchain for the owner to review and withdraw from an owner-only dashboard."
    },
    {
      title: "Profiles and reputation",
      text: "Set a username, share your profile, view USDC/EURC balances, track PNL, win rate, created markets, and prediction history."
    },
    {
      title: "Aura Points",
      text: "A social score for forecasters, combining volume, winning markets, PNL, resolved activity, and market creation."
    },
    {
      title: "Leaderboard",
      text: "Rank traders by volume, win rate, PNL, and Aura Points across 24H, 7D, 1M, and all-time views."
    },
    {
      title: "Social forecasting",
      text: "Follow creators, copy wallet addresses, share to X, embed market links, and study top traders before staking."
    },
    {
      title: "Aura Agent",
      text: "Use AI assistance to draft clearer markets, review duplicate risk, prepare source-based rules, and receive visible result suggestions."
    },
    {
      title: "AI resolution receipts",
      text: "View a suggested YES or NO outcome with confidence, supporting detail, and a settlement report that compares AI, creator proposal, dispute status, and final action."
    },
    {
      title: "Live indexer",
      text: "Read market history, wallet-searchable bet activity, token-specific USDC/EURC stats, and leaderboard data from the live AuraPredict indexer before falling back to Arc RPC."
    }
  ];
  const flow = ["Create a market", "Stake YES or NO", "Track odds", "Resolve result", "Claim payout"];
  const architectureSteps = ["Wallet", "AuraPredict UI", "AuraPredict Indexer", "Arc RPC", "Market Contract", "Arcscan"];
  const settlementSteps = [
    "Trading closes at the published UTC time",
    "Resolution opens only after the rule's event timestamp",
    "Resolver requests or views Aura's YES/NO suggestion and confidence",
    "Resolution actions show a settlement report with AI choice, creator proposal, dispute/review state, pools, and timelines",
    "Resolver can apply the suggestion or propose a different result",
    "Owner receives an alert when resolver and AI disagree",
    "Dispute window stays open",
    "Disputes are routed to owner/resolution authority review",
    "Stale disputes can be canceled to refund users",
    "Final outcome is locked",
    "Winners claim payout"
  ];
  const dataFlow = [
    "The live AuraPredict indexer now powers market history, per-token volume, participants, activity, and leaderboards",
    "Wallet UI shows USDC and EURC balances with copy-address, faucet, and swap access from markets or the user's profile",
    "Market cards are now compact click-through summaries; staking, Aura review, Oracle checks, dispute, finalize, and claim actions happen inside the market page",
    "The app checks selected-token balance and allowance before create, stake, or dispute transactions",
    "Aura Agent drafts clearer markets, checks similar questions, and prepares rules with source links",
    "Oracle proposal checks objective data sources such as Binance, Yahoo chart data, and health/status endpoints without spending AI quota",
    "Objective oracle automation can auto-submit the first onchain proposal for high-confidence markets while keeping dispute and owner review open",
    "After the rule timestamp, Aura displays a suggested outcome and confidence in Resolution actions",
    "A saved AI receipt can be viewed without running a new AI request; Ask or Refresh requests a new review",
    "The settlement report explains what AI suggested, what the resolver proposed, whether a dispute exists, and what the final reviewer should do next",
    "Resolver decisions that differ from Aura and user disputes are flagged for owner/authority review",
    "Owner wallets get a private dashboard for reporting, user activity, protocol fees, and fee withdrawal",
    "Aura analysis remains off-chain; the contract anchors source/rule terms, evidence hashes, and receipt hashes in wallet-signed proposal actions",
    "Wallet actions still sign directly against the Arc contract, with Arcscan as the verification layer"
  ];
  const oracleAdapters = [
    {
      title: "Crypto price",
      text: "BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, and LINK markets can be checked against Binance 1-minute price data, with a near-time CoinGecko fallback when exact data is unavailable."
    },
    {
      title: "Macro chart",
      text: "Gold and US Dollar Index markets can be checked against Yahoo chart data near the market's onchain resolution timestamp."
    },
    {
      title: "Health and status",
      text: "API health checks, JSON ok:true endpoints, and supported public status pages can produce a source-based Oracle suggestion."
    },
    {
      title: "Liquidity safety",
      text: "If YES or NO has no funded positions, Oracle suggests Cancel/Refund instead of awarding a one-sided market."
    },
    {
      title: "No AI quota",
      text: "Oracle proposals use deterministic source checks from the indexer, so they do not consume Gemini/OpenAI quota like Aura Agent reviews."
    },
    {
      title: "Wallet-signed settlement",
      text: "Oracle output can become the first onchain proposal when enabled, but resolver, authority, dispute, and finalization actions still require contract transactions."
    }
  ];
  const roadmapItems = [
    "Add websocket or event streaming for absolute realtime odds and cross-user updates",
    "Harden AI receipt review with better evidence policy, audit logs, and operator dashboards",
    "Persist social identity, comments, follows, evidence, and notifications beyond local browser storage",
    "Configure an oracle or committee authority after its evidence and operating policy are ready"
  ];
  const nextTheme = landingTheme === "dark" ? "light" : "dark";
  const heroMarketCount = landingHealth?.marketCount ?? landingStats?.totalMarkets ?? 0;
  const heroMarketText = heroMarketCount > 0 ? heroMarketCount.toLocaleString("en-US") : "--";
  const landingAssetRows =
    landingStats?.assetBreakdown && landingStats.assetBreakdown.length > 0
      ? landingStats.assetBreakdown
      : landingMarketAssetStats.length > 0
        ? landingMarketAssetStats
        : fallbackAssetStatsFromProject(landingStats);
  const indexedVolumeText = landingStats ? formatAssetSummary(landingAssetRows, "totalVolume") : "--";
  const landingLiveLiquidityText = landingStats ? formatAssetSummary(landingAssetRows, "liveLiquidity") : "--";
  const participantsText = landingStats ? landingStats.participantEntries.toLocaleString("en-US") : "--";
  const knownPlayersText = landingStats ? landingStats.knownPlayers.toLocaleString("en-US") : "--";
  const liveMarketsText = landingStats ? landingStats.liveMarkets.toLocaleString("en-US") : "--";
  const pendingMarketsText = landingStats ? landingStats.pendingMarkets.toLocaleString("en-US") : "--";
  const indexedBlockText = landingHealth?.lastIndexedBlock
    ? Number(landingHealth.lastIndexedBlock).toLocaleString("en-US")
    : "--";
  const updatedText = landingHealth?.updatedAt
    ? `${timeAgo(Math.floor(new Date(landingHealth.updatedAt).getTime() / 1000), new Date())} synced`
    : "syncing";
  const liveMetricCards = [
    {
      value: heroMarketText,
      label: "Markets created"
    },
    {
      value: indexedVolumeText,
      label: "Indexed volume by token"
    },
    {
      value: participantsText,
      label: "Participant entries"
    },
    {
      value: liveMarketsText,
      label: "Live markets"
    }
  ];

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, landingTheme);
  }, [landingTheme]);

  useEffect(() => {
    let canceled = false;
    const loadLandingData = async () => {
      const [statsResponse, healthResponse] = await Promise.all([
        fetchIndexerJson<{ stats: IndexedProjectStats }>("/api/stats"),
        fetchIndexerJson<LandingHealth>("/health")
      ]);
      if (canceled) return;
      if (statsResponse?.stats) {
        const nextStats = indexedStatsToProjectStats(statsResponse.stats);
        setLandingStats(nextStats);
        if (!nextStats.assetBreakdown || nextStats.assetBreakdown.length === 0) {
          const marketResponse = await fetchIndexerJson<{ markets: IndexedMarket[] }>("/api/markets");
          if (!canceled && marketResponse?.markets) {
            setLandingMarketAssetStats(
              assetStatsFromMarkets(
                marketResponse.markets.map(indexedMarketToView),
                Math.floor(Date.now() / 1000),
                "",
                "USDC",
                ARC_NATIVE_USDC_DECIMALS
              )
            );
          }
        } else {
          setLandingMarketAssetStats([]);
        }
      }
      if (healthResponse?.ok) setLandingHealth(healthResponse);
    };
    void loadLandingData();
    const interval = window.setInterval(loadLandingData, 15_000);
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className={`landing-page landing-${landingTheme}`}>
      <AppUpdateNotice />
      <nav className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="AuraPredict home">
          <img src="/aurapredict-logo.png" alt="AuraPredict" />
          <span>AuraPredict</span>
          <span className="arc-brand-chip">
            <img src="/arc-icon-navy-gradient.svg" alt="" />
            Built on Arc
          </span>
        </a>
        <div>
          <a href="#features">Features</a>
          <a href="#oracle">Oracle</a>
          <a href="#how-it-works">How it works</a>
          <a href="#demo">Demo</a>
          <a href={DOCS_URL}>Docs</a>
          <a href={X_URL} target="_blank" rel="noreferrer">
            X
          </a>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">
            Discord
          </a>
          <button
            className="landing-theme-toggle"
            onClick={() => setLandingTheme(nextTheme)}
            type="button"
            aria-label={`Switch to ${nextTheme} mode`}
          >
            <ThemeIcon theme={landingTheme} />
          </button>
          <a className="landing-enter-small" href={APP_URL}>
            Enter Dapp
          </a>
        </div>
      </nav>

      <section className="landing-hero" id="top">
        <div className="landing-hero-copy">
          <div className="landing-network-row">
            <span>AuraPredict</span>
            <span className="landing-arc-powered">
              <img src="/arc-logo-white.svg" alt="Arc" />
              Testnet
            </span>
            <strong>{indexerIsRealtime ? "Network :: Live" : "Network :: Indexed"}</strong>
          </div>
          <p className="landing-kicker">Arc Testnet prediction markets</p>
          <h1>
            <span>{heroMarketText}</span> prediction markets indexed.
          </h1>
          <p>
            Trade YES/NO markets with Arc testnet stablecoins while the live AuraPredict indexer keeps market
            history, volume, participants, leaderboards, comments, evidence, AI resolution receipts, oracle proposals,
            and profile reputation fast enough for public forecasting.
          </p>
          <div className="landing-hero-ledger" aria-label="AuraPredict live indexer metrics">
            <div>
              <span>Total volume by token</span>
              <strong>{indexedVolumeText}</strong>
            </div>
            <div>
              <span>Live liquidity by token</span>
              <strong>{landingLiveLiquidityText}</strong>
            </div>
            <div>
              <span>Participant entries</span>
              <strong>{participantsText}</strong>
            </div>
            <div>
              <span>Known players</span>
              <strong>{knownPlayersText}</strong>
            </div>
          </div>
          <div className="landing-actions">
            <a className="landing-primary" href={APP_URL}>
              Launch the App
            </a>
            <a className="landing-secondary" href={DOCS_URL}>
              Read Docs
            </a>
            <a className="landing-secondary" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
              Watch Demo
            </a>
          </div>
          <div className="landing-proof">
            <span>{indexerIsRealtime ? "AuraPredict indexer live" : "Indexer fallback active"}</span>
            <span className="landing-proof-arc">
              <img src="/arc-icon-white.svg" alt="" />
              Deployed on Arc Testnet
            </span>
            <span>{updatedText}</span>
            <span>{pendingMarketsText} pending resolution</span>
          </div>
        </div>
        <aside className="landing-network-panel" aria-label="Live AuraPredict network metrics">
          <div>
            <span>Live markets</span>
            <strong>{liveMarketsText}</strong>
          </div>
          <div>
            <span>Last indexed block</span>
            <strong>{indexedBlockText}</strong>
          </div>
          <div>
            <span>Awaiting result</span>
            <strong>{pendingMarketsText}</strong>
          </div>
          <div>
            <span>Sync age</span>
            <strong>{updatedText}</strong>
          </div>
          <div className="landing-network-wide">
            <span>Realtime data path</span>
            <strong>AuraPredict indexer to UI to wallet-signed Arc transactions</strong>
          </div>
        </aside>
      </section>

      <section className="landing-strip landing-live-stats" aria-label="AuraPredict live stats">
        {liveMetricCards.map((metric) => (
          <div key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </section>

      <section className="landing-section" id="features">
        <div className="landing-section-head">
          <p className="landing-kicker">Core features</p>
          <h2>Built for people who want their forecasts to compound into reputation.</h2>
          <p>
            The app keeps the trading surface simple while making evidence, profiles, and leaderboard
            performance visible enough for social forecasting. AuraPredict combines onchain YES/NO
            staking, an indexer-backed data layer, AI-assisted market quality checks, AI resolution
            receipts, and objective oracle proposals. The current contract is deployed on Arc Testnet with onchain source/rule terms, structured rule metadata, resolution timing, configurable settlement assets, signed-Aura hooks, and authority/oracle controls.
          </p>
        </div>
        <div className="landing-feature-grid">
          {featureCards.map((feature) => (
            <article key={feature.title}>
              <span />
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="oracle">
        <div className="landing-section-head">
          <p className="landing-kicker">Objective Oracle v1</p>
          <h2>Source-based proposals for markets that can be checked without AI.</h2>
          <p>
            AuraPredict now separates two kinds of help during resolution. Aura Agent is used for reasoning-heavy
            questions and evidence review. Oracle proposal v1 is used when the market can be checked directly against
            objective data sources. It gives reviewers a YES, NO, Cancel, or manual-review signal before they sign a
            contract action. For new markets, the same structured source rule is shared by Aura, Oracle, the resolver,
            and the final reviewer.
          </p>
        </div>
        <div className="landing-feature-grid">
          {oracleAdapters.map((adapter) => (
            <article key={adapter.title}>
              <span />
              <h3>{adapter.title}</h3>
              <p>{adapter.text}</p>
            </article>
          ))}
        </div>
        <div className="docs-note">
          <strong>Settlement boundary</strong>
          <p>
            Oracle proposal v1 does not move funds by itself. The contract still enforces resolution time,
            review/dispute windows, and finalization. The proposal simply gives the signer a clearer source-based
            report before choosing YES, NO, or Cancel.
          </p>
        </div>
      </section>

      <section className="landing-section landing-demo-section" id="demo">
        <div className="landing-section-head">
          <p className="landing-kicker">Demo</p>
          <h2>Preview the dapp flow after the live network stats.</h2>
          <p>
            Watch the AuraPredict walkthrough, then launch the app to create markets, check Aura Agent duplicate
            risk, stake YES/NO, and resolve outcomes on Arc Testnet.
          </p>
        </div>
        <div className="landing-video-card">
          <div className="landing-video-frame">
            <iframe
              src={`${DEMO_EMBED_URL}?rel=0&modestbranding=1`}
              title="AuraPredict demo video"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      <section className="landing-section landing-split" id="how-it-works">
        <div>
          <p className="landing-kicker">How it works</p>
          <h2>From question to payout, every step is transparent.</h2>
          <p>
            A market starts as a clear YES/NO question. Users stake based on their conviction.
            Creation now requires a primary resolution source and an explicit resolution rule.
            After the event timestamp in the resolution rule has passed, the resolver opens the
            market to request or view Aura's visible YES/NO suggestion and confidence. The creator
            or configured authority then proposes the result through a wallet-signed contract action,
            Resolution actions summarize AI choice, creator proposal, dispute status, pools, and deadlines
            before any final reviewer action. Users can dispute during the window, and winners claim directly after finalization.
          </p>
          <a className="landing-primary" href={APP_URL}>
            Launch the App
          </a>
        </div>
        <div className="landing-flow">
          {flow.map((item, index) => (
            <article key={item}>
              <span>{index + 1}</span>
              <strong>{item}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-docs" id="docs">
        <div className="landing-section-head">
          <p className="landing-kicker">Project docs</p>
          <h2>Transparent testnet mechanics without hiding the roadmap.</h2>
          <p>
            AuraPredict is live as an Arc Testnet MVP with its public indexer hosted at api.aurapredict.xyz. The current product
            proves market creation, staking, dispute-aware settlement, profiles, comments, evidence,
            AI resolution receipts, live stats, notifications, and public reputation while wallet
            actions remain fully onchain. Production reads the active Arc Testnet contract through the AuraPredict indexer and wallet transactions remain verifiable on Arcscan.
          </p>
          <div className="landing-docs-actions">
            <a className="landing-primary" href={DOCS_URL}>
              Open Full Docs
            </a>
            <a className="landing-secondary" href="https://github.com/mrcocdilinh/AuraPredict" target="_blank" rel="noreferrer">
              View GitHub
            </a>
          </div>
        </div>

        <div className="docs-summary-grid">
          <article className="docs-card">
            <span className="docs-label">Purpose</span>
            <h3>Make forecasting social on Arc</h3>
            <p>
              Users can create public markets, back YES or NO with the market's testnet stablecoin, track odds, and
              build a visible record through profiles, rankings, PNL, win rate, and Aura Points.
            </p>
          </article>
          <article className="docs-card">
            <span className="docs-label">Current network</span>
            <h3>Arc Testnet first</h3>
            <p>
              The app currently targets Arc Testnet and is designed for testing product flow, market
              mechanics, wallet UX, and community behavior before any mainnet deployment decisions.
            </p>
          </article>
          <article className="docs-card">
            <span className="docs-label">Resolution model</span>
            <h3>AI assisted, contract settled</h3>
            <p>
              Aura displays a suggested outcome with confidence after the rule timestamp, but the
              resolver or configured authority still signs the contract proposal. The settlement report
              shows AI choice, proposed result, dispute status, and final review guidance before users reach finalization.
            </p>
          </article>
          <article className="docs-card">
            <span className="docs-label">AI layer</span>
            <h3>Aura Agent plus receipts</h3>
            <p>
              Aura Agent helps draft questions, score clarity, surface similar markets, summarize
              evidence, and expose resolution receipts that users can inspect without rerunning AI.
              A source router now scans configured links before Aura reviews deadline-style markets.
            </p>
          </article>
        </div>

        <div className="docs-diagram-panel">
          <div>
            <span className="docs-label">System architecture</span>
            <h3>Live indexer, wallet signed</h3>
            <p>
              The public app reads the AuraPredict indexer first for low-latency market state, social data,
              and AI receipts. Wallets still sign transactions against the prediction market contract,
              and Arcscan remains the verification layer.
            </p>
          </div>
          <div className="docs-flow-diagram" aria-label="AuraPredict architecture diagram">
            {architectureSteps.map((step, index) => (
              <div className="docs-flow-step" key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
                {index < architectureSteps.length - 1 && <i />}
              </div>
            ))}
          </div>
        </div>

        <div className="docs-two-column">
          <article className="docs-card docs-large-card">
            <span className="docs-label">Market lifecycle</span>
            <h3>From question to payout</h3>
            <div className="docs-step-list">
              {settlementSteps.map((step, index) => (
                <div key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="docs-card docs-large-card">
            <span className="docs-label">Data loading</span>
            <h3>What the data layer does</h3>
            <div className="docs-step-list">
              {dataFlow.map((step, index) => (
                <div key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="docs-feature-table">
          <article>
            <span>Market creation</span>
            <strong>YES/NO questions with UTC close time, separate resolution time, category labels, required source URL, and required resolution rule.</strong>
          </article>
          <article>
            <span>Market terms</span>
            <strong>Primary source, fallback source, and resolution rule are stored onchain for every new market.</strong>
          </article>
          <article>
            <span>Trading</span>
            <strong>Users stake the market's configured Arc testnet stablecoin, such as USDC or EURC, directly from their wallet. Markets never convert payout currency.</strong>
          </article>
          <article>
            <span>Wallet UX</span>
            <strong>The wallet menu and profile show USDC/EURC balances, copy-address access, faucet shortcut, swap access, and selected-token balance checks before transactions.</strong>
          </article>
          <article>
            <span>Swap access</span>
            <strong>A trader can obtain USDC or EURC through Circle App Kit first when configured, with LI.FI fallback, visible minimum receive, and adjustable tolerance before staking.</strong>
          </article>
          <article>
            <span>Settlement</span>
            <strong>AI receipts can support the result, but finalized outcomes still unlock payouts through the contract.</strong>
          </article>
          <article>
            <span>Settlement report</span>
            <strong>Resolution actions summarize AI suggestion, Oracle suggestion, creator proposal, dispute/review state, YES/NO pools, volume, and timing so final reviewers know what they are signing.</strong>
          </article>
          <article>
            <span>Oracle proposal</span>
            <strong>Objective adapters can fetch crypto price, macro chart, and health/status API data, then display YES/NO/Cancel guidance without spending AI quota.</strong>
          </article>
          <article>
            <span>AI resolution</span>
            <strong>Aura-first flow: the suggested result is visible before proposal, with mismatch alerts and dispute review when needed.</strong>
          </article>
          <article>
            <span>Source router</span>
            <strong>Before Aura reviews publish, announce, blog, news, fixture, and schedule markets, the indexer scans primary/fallback/inferred sources such as official blogs, status pages, sports schedules, and selected government pages, then turns findings into explicit evidence rows.</strong>
          </article>
          <article>
            <span>AI efficiency</span>
            <strong>Saved resolution receipts can be displayed again without rerunning Aura; only Ask or Refresh spends AI quota.</strong>
          </article>
          <article>
            <span>Oracle path</span>
            <strong>The contract includes approved adapter and signed-Aura hooks so future oracle or committee markets do not require another core migration.</strong>
          </article>
          <article>
            <span>Deadline outcomes</span>
            <strong>For a clearly defined event due by a fixed time, Aura may suggest NO after the deadline when reviewed evidence provides no credible confirmation, while displaying its confidence and risk.</strong>
          </article>
          <article>
            <span>Timeout safety</span>
            <strong>Timed-out markets can be canceled and refunded after the proposal grace period when no result is proposed.</strong>
          </article>
          <article>
            <span>Profiles</span>
            <strong>Wallet profile tracks USDC/EURC balances, participation, created markets, PNL, win rate, and claims.</strong>
          </article>
          <article>
            <span>Leaderboard</span>
            <strong>Ranks users by volume, win rate, PNL, and Aura Points.</strong>
          </article>
          <article>
            <span>Admin controls</span>
            <strong>Operational credentials and automation policies stay private; public docs only show user-facing behavior and rules.</strong>
          </article>
          <article>
            <span>Docs domain</span>
            <strong>docs.aurapredict.xyz documents app usage, smart contract behavior, indexer setup, and deployment.</strong>
          </article>
        </div>

        <div className="docs-diagram-panel docs-roadmap-panel">
          <div>
            <span className="docs-label">Roadmap</span>
            <h3>Path toward a production-grade prediction market</h3>
            <p>
              AuraPredict now has a live public indexer, AI market drafting, duplicate-risk checks, comments,
              evidence fields, AI resolution receipts, profile reputation, and leaderboard metrics. The remaining
              gap is production-grade realtime streaming, durable social data, and stronger oracle-backed settlement.
            </p>
          </div>
          <div className="docs-roadmap">
            {roadmapItems.map((item, index) => (
              <article key={item}>
                <span>{`0${index + 1}`}</span>
                <strong>{item}</strong>
              </article>
            ))}
          </div>
        </div>

        <div className="docs-note">
          <strong>Important note</strong>
          <p>
            AuraPredict is currently a testnet dapp. It is not financial advice and the current market
            resolution flow uses AI as an off-chain decision aid, not a trustless oracle. The safest
            near-term design is AI receipt generation plus human proposal, evidence, and user dispute.
          </p>
        </div>
      </section>

      <section className="landing-section landing-dark-panel">
        <div className="landing-section-head">
          <p className="landing-kicker">Why AuraPredict</p>
          <h2>Prediction markets become more powerful when they are social.</h2>
          <p>
            AuraPredict is designed around public forecasting identity. Every trade, market, payout,
            and ranking can help users build a visible prediction track record.
          </p>
        </div>
        <div className="landing-benefit-grid">
          <article>
            <strong>For traders</strong>
            <p>Discover fresh markets, back your view with the market's stablecoin, track positions, and compete on leaderboard metrics.</p>
          </article>
          <article>
            <strong>For creators</strong>
            <p>Launch markets for your community, resolve outcomes, build creator reputation, and grow market volume.</p>
          </article>
          <article>
            <strong>For Arc</strong>
            <p>Create an engaging social finance primitive around information, events, and ecosystem participation.</p>
          </article>
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <p className="landing-kicker">Start predicting</p>
          <h2>Watch the demo, then enter the live Arc Testnet app.</h2>
        </div>
        <div className="landing-actions">
          <a className="landing-secondary" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
            View Demo
          </a>
          <a className="landing-secondary" href={DOCS_URL}>
            Read Docs
          </a>
          <a className="landing-primary" href={APP_URL}>
            Enter Dapp
          </a>
        </div>
      </section>
    </main>
  );
}

function currentBundleSrcFromDocument() {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return script?.src || "";
}

function bundleSrcFromHtml(html: string) {
  const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i);
  if (!match?.[1]) return "";
  return new URL(match[1], window.location.origin).href;
}

function AppUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentBundleSrc = currentBundleSrcFromDocument();
    if (!currentBundleSrc) return;

    let canceled = false;
    const checkForUpdate = async () => {
      try {
        const response = await fetch(`/?_=${Date.now()}`, { cache: "no-store" });
        const html = await response.text();
        const latestBundleSrc = bundleSrcFromHtml(html);
        if (!canceled && latestBundleSrc && latestBundleSrc !== currentBundleSrc) {
          setUpdateAvailable(true);
        }
      } catch {
        // Update checks are best effort; the app should keep working offline or behind flaky RPC/network.
      }
    };

    void checkForUpdate();
    const interval = window.setInterval(checkForUpdate, 60_000);
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="app-update-notice" role="status" aria-live="polite">
      <span>A new AuraPredict version is available.</span>
      <button onClick={() => window.location.reload()} type="button">
        Refresh
      </button>
    </div>
  );
}

export default function App() {
  const isLandingHost = typeof window !== "undefined" && LANDING_HOSTS.has(window.location.hostname.toLowerCase());

  if (isLandingHost) {
    return <LandingPage />;
  }

  const transactionLockRef = useRef(false);
  const silentLoadRef = useRef(false);
  const loadMarketsInFlightRef = useRef(false);
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const walletMenuRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const [account, setAccount] = useState("");
  const [owner, setOwner] = useState("");
  const [contractVersion, setContractVersion] = useState<MarketContractVersion>(VIEWING_V3_ARCHIVE ? "v3" : "unknown");
  const [resolutionAuthority, setResolutionAuthority] = useState("");
  const [defaultSettlementToken, setDefaultSettlementToken] = useState("");
  const [defaultSettlementDecimals, setDefaultSettlementDecimals] = useState(ARC_NATIVE_USDC_DECIMALS);
  const [defaultSettlementSymbol, setDefaultSettlementSymbol] = useState("USDC");
  const [minStake, setMinStake] = useState<bigint>(0n);
  const [creatorBond, setCreatorBond] = useState<bigint>(0n);
  const [disputeBond, setDisputeBond] = useState<bigint>(0n);
  const [disputeWindow, setDisputeWindow] = useState(0);
  const [disputeGracePeriod, setDisputeGracePeriod] = useState(0);
  const [protocolFeeBps, setProtocolFeeBps] = useState(0);
  const [marketCreationFee, setMarketCreationFee] = useState<bigint>(0n);
  const [accumulatedProtocolFees, setAccumulatedProtocolFees] = useState<bigint>(0n);
  const [protocolFeesByToken, setProtocolFeesByToken] = useState<Record<string, bigint>>({});
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [walletTokenBalances, setWalletTokenBalances] = useState<Record<string, bigint>>({});
  const [pendingWithdrawalsByToken, setPendingWithdrawalsByToken] = useState<Record<string, bigint>>({});
  const [markets, setMarkets] = useState<MarketView[]>(() => readCachedMarkets());
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [knownMarketCount, setKnownMarketCount] = useState(() => readCachedMarkets().length);
  const [dataSource, setDataSource] = useState<"cache" | "indexer" | "rpc">("cache");
  const [marketLoadLimit, setMarketLoadLimit] = useState(MARKET_INITIAL_LOAD);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [isArcNetwork, setIsArcNetwork] = useState(true);
  const [walletProviders, setWalletProviders] = useState<Eip6963ProviderDetail[]>([]);
  const [selectedWalletProvider, setSelectedWalletProvider] = useState<EthereumProvider | null>(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastDataRefresh, setLastDataRefresh] = useState<Date | null>(null);
  const [notice, setNoticeText] = useState("");
  const [noticeTxHash, setNoticeTxHash] = useState<Hash | "">("");
  const [transactionPending, setTransactionPending] = useState(false);
  const [pendingMarketActions, setPendingMarketActions] = useState<Record<string, boolean>>({});
  const [stakeInputs, setStakeInputs] = useState<Record<number, string>>({});
  const [selectedTradeSides, setSelectedTradeSides] = useState<Record<number, Outcome.Yes | Outcome.No>>({});
  const [chartViewSides, setChartViewSides] = useState<Record<number, Outcome.Yes | Outcome.No>>({});
  const [swapMarketId, setSwapMarketId] = useState<number | null>(null);
  const [swapAmountInput, setSwapAmountInput] = useState("");
  const [swapQuote, setSwapQuote] = useState<StablecoinSwapQuote | null>(null);
  const [swapQuotePairKey, setSwapQuotePairKey] = useState("");
  const [swapQuoteTime, setSwapQuoteTime] = useState(0);
  const [swapToleranceBps, setSwapToleranceBps] = useState(DEFAULT_SWAP_TOLERANCE_BPS);
  const [swapBusy, setSwapBusy] = useState<"idle" | "quote" | "execute">("idle");
  const [swapProviderHealth, setSwapProviderHealth] = useState<SwapProviderHealth>({ circle: "idle", lifi: "idle" });
  const [profileSwapDirection, setProfileSwapDirection] = useState<StablecoinSwapDirection>("USDC_TO_EURC");
  const [activeCategory, setActiveCategory] = useState("All");
  const [marketViewMode, setMarketViewMode] = useState<MarketViewMode>("grid");
  const [detailChartWindow, setDetailChartWindow] = useState<ChartWindowKey>("all");
  const [chartHoverRatio, setChartHoverRatio] = useState<number | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [view, setView] = useState<AppView>("markets");
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>("volume");
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>("all");
  const [leaderboardCategory, setLeaderboardCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [endedSearchQuery, setEndedSearchQuery] = useState("");
  const [marketWalletSearch, setMarketWalletSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [collectionView, setCollectionView] = useState<MarketSectionKey>("fresh");
  const [collectionSortKey, setCollectionSortKey] = useState<MarketSortKey>("created");
  const [collectionSortDirection, setCollectionSortDirection] = useState<SortDirection>("desc");
  const [collectionSettlementToken, setCollectionSettlementToken] = useState("All");
  const [collectionPage, setCollectionPage] = useState(1);
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [selectedProfileAddress, setSelectedProfileAddress] = useState("");
  const [profileHistoryPage, setProfileHistoryPage] = useState(1);
  const [profileCreatedPage, setProfileCreatedPage] = useState(1);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileNames, setProfileNames] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(PROFILE_NAMES_KEY) || "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [profileJoinedDates, setProfileJoinedDates] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(PROFILE_JOINED_KEY) || "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [profilePublicByAddress, setProfilePublicByAddress] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(PROFILE_PUBLIC_KEY) || "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const [followedCreators, setFollowedCreators] = useState<string[]>(() => readJsonStorage(FOLLOWED_CREATORS_KEY, []));
  const [marketComments, setMarketComments] = useState<Record<string, MarketComment[]>>(() =>
    readJsonStorage(MARKET_COMMENTS_KEY, {})
  );
  const [marketEvidence, setMarketEvidence] = useState<Record<string, MarketEvidence[]>>(() =>
    readJsonStorage(MARKET_EVIDENCE_KEY, {})
  );
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<number, EvidenceDraft>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMarketDraft, setAiMarketDraft] = useState<AiMarketDraft | null>(null);
  const [auraCreateStatus, setAuraCreateStatus] = useState<"idle" | "ready" | "failed">("idle");
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [aiResolutionReports, setAiResolutionReports] = useState<Record<number, AiResolutionReport>>({});
  const [aiResolutionReceipts, setAiResolutionReceipts] = useState<Record<string, AiResolutionReceipt | null>>({});
  const [oracleProposals, setOracleProposals] = useState<Record<string, OracleProposal | null>>({});
  const [oracleBusyByMarket, setOracleBusyByMarket] = useState<Record<number, boolean>>({});
  const [auraResolutionStatusByMarket, setAuraResolutionStatusByMarket] = useState<Record<number, "idle" | "ready" | "failed">>({});
  const [mismatchConfirm, setMismatchConfirm] = useState<MismatchConfirmState | null>(null);
  const [focusResolutionMarketId, setFocusResolutionMarketId] = useState<number | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [userRegistry, setUserRegistry] = useState<UserRegistry>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(USER_REGISTRY_KEY) || "{}") as UserRegistry;
    } catch {
      return {};
    }
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [dismissedResultNotices, setDismissedResultNotices] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(DISMISSED_RESULT_KEY) || "[]") as string[];
    } catch {
      return [];
    }
  });
  const [createForm, setCreateForm] = useState<CreateFormState>({
    question: "",
    category: "Crypto",
    closeTime: "",
    resolutionTime: "",
    settlementToken: "",
    resolutionMode: "0",
    resolutionSource: "",
    resolutionRule: "",
    fallbackSource: ""
  });

  const hasContract = useMemo(() => isAddress(CONTRACT_ADDRESS), []);
  const contractAddress = CONTRACT_ADDRESS as Address;

  const nowSeconds = Math.floor(currentTime.getTime() / 1000);
  const resolutionUnlockByMarketId = useMemo(() => {
    const byId: Record<number, number> = {};
    for (const market of markets) {
      let unlockTime = resolutionTimeFor(market);
      const evidenceRows = marketEvidence[String(market.id)] || [];
      const referenceCandidates = [
        parseResolutionReferenceTime(market.question),
        ...evidenceRows.map((item) => parseResolutionReferenceTime(item.notes || ""))
      ];
      for (const reference of referenceCandidates) {
        const referenceSeconds = parseUtcInputToUnixSeconds(reference || "");
        if (referenceSeconds && referenceSeconds > unlockTime) {
          unlockTime = referenceSeconds;
        }
      }
      byId[market.id] = unlockTime;
    }
    return byId;
  }, [marketEvidence, markets]);
  const resolutionUnlockTime = useCallback(
    (market: Pick<MarketView, "id" | "closeTime" | "resolutionTime">) =>
      isStablecoinContractVersion(contractVersion)
        ? market.resolutionTime || market.closeTime
        : resolutionUnlockByMarketId[market.id] ?? market.closeTime,
    [contractVersion, resolutionUnlockByMarketId]
  );
  const activeMarkets = markets.filter(
    (market) => market.outcome === Outcome.Unresolved && market.closeTime > nowSeconds
  );
  const pendingResolutionMarkets = markets.filter(
    (market) => market.outcome === Outcome.Unresolved && resolutionUnlockTime(market) <= nowSeconds
  );
  const endedMarkets = markets.filter((market) => market.outcome !== Outcome.Unresolved);
  const liveMarkets = activeMarkets.length;
  const loadedScopeCount = markets.length;
  const hasMoreMarkets = knownMarketCount > loadedScopeCount;
  const totalLiquidity = markets.reduce((sum, market) => sum + marketVolume(market), 0n);
  const liveLiquidity = activeMarkets.reduce((sum, market) => sum + marketVolume(market), 0n);
  const localAssetBreakdown = useMemo(
    () => assetStatsFromMarkets(markets, nowSeconds, defaultSettlementToken, defaultSettlementSymbol, defaultSettlementDecimals),
    [defaultSettlementDecimals, defaultSettlementSymbol, defaultSettlementToken, markets, nowSeconds]
  );
  const totalTradeVolume = activities.length > 0
    ? activities.reduce((sum, activity) => sum + activity.amount, 0n)
    : totalLiquidity;
  const uniquePlayerAddresses = new Set<string>();
  for (const activity of activities) uniquePlayerAddresses.add(activity.user.toLowerCase());
  for (const user of Object.values(userRegistry)) uniquePlayerAddresses.add(user.address.toLowerCase());
  for (const market of markets) {
    if (market.creator) uniquePlayerAddresses.add(market.creator.toLowerCase());
  }
  if (account) uniquePlayerAddresses.add(account.toLowerCase());
  const uniquePlayerCount = uniquePlayerAddresses.size;
  const participantEntries = markets.reduce((sum, market) => sum + market.traderCount, 0);
  const averageMarketVolume = markets.length > 0 ? totalTradeVolume / BigInt(markets.length) : 0n;
  const statsSummary = projectStats ?? {
    totalMarkets: knownMarketCount || markets.length,
    indexedMarkets: markets.length,
    liveMarkets,
    endedMarkets: endedMarkets.length,
    pendingMarkets: pendingResolutionMarkets.length,
    totalVolume: totalLiquidity,
    liveLiquidity,
    averageMarketVolume,
    participantEntries,
    knownPlayers: uniquePlayerCount,
    assetBreakdown: localAssetBreakdown
  };
  const statsAssetBreakdown =
    localAssetBreakdown.length > 0
      ? localAssetBreakdown
      : statsSummary.assetBreakdown && statsSummary.assetBreakdown.length > 0
        ? statsSummary.assetBreakdown
        : [];
  const totalVolumeByTokenText = formatAssetSummary(statsAssetBreakdown, "totalVolume");
  const liveLiquidityByTokenText = formatAssetSummary(statsAssetBreakdown, "liveLiquidity");
  const averageMarketByTokenText = formatAssetSummary(statsAssetBreakdown, "averageMarketVolume");
  const aggregateAssetLabel =
    statsAssetBreakdown.length > 1 ? "token units" : statsAssetBreakdown[0]?.symbol || defaultSettlementSymbol;
  const knownSettlementTokens = useMemo(() => {
    const byKey = new Map<string, { token: string; symbol: string; decimals: number }>();
    const addToken = (token: string | undefined, symbol: string, decimals: number) => {
      if (!token || !isAddress(token)) return;
      byKey.set(token.toLowerCase(), { token, symbol, decimals });
    };
    addToken(defaultSettlementToken, defaultSettlementSymbol, defaultSettlementDecimals);
    addToken(EURC_TOKEN_ADDRESS, "EURC", V3_STABLECOIN_DECIMALS);
    for (const asset of statsAssetBreakdown) {
      addToken(asset.token, asset.symbol, asset.decimals);
    }
    for (const market of markets) {
      addToken(market.settlementToken, marketSymbol(market), marketDecimals(market));
    }
    return [...byKey.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [defaultSettlementDecimals, defaultSettlementSymbol, defaultSettlementToken, markets, statsAssetBreakdown]);
  const knownSettlementTokenKey = knownSettlementTokens.map((asset) => asset.token.toLowerCase()).join("|");
  const accountKey = account ? account.toLowerCase() : "";
  const viewedProfileAddress =
    selectedProfileAddress && isAddress(selectedProfileAddress) ? selectedProfileAddress : account;
  const viewedProfileKey = viewedProfileAddress ? viewedProfileAddress.toLowerCase() : "";
  const isOwnProfile = !!account && !!viewedProfileAddress && sameAddress(account, viewedProfileAddress);
  const isProfilePublic = viewedProfileKey ? profilePublicByAddress[viewedProfileKey] !== false : true;
  const profileActivityPositions = useMemo(() => {
    const positions = new Map<number, { yes: bigint; no: bigint }>();
    if (!viewedProfileKey) return positions;

    for (const activity of activities) {
      if (!sameAddress(activity.user, viewedProfileKey)) continue;
      const current = positions.get(activity.marketId) ?? { yes: 0n, no: 0n };
      if (activity.side === Outcome.Yes) current.yes += activity.amount;
      if (activity.side === Outcome.No) current.no += activity.amount;
      positions.set(activity.marketId, current);
    }

    return positions;
  }, [activities, viewedProfileKey]);
  const profileMarkets = viewedProfileAddress
    ? markets
        .map((market) => {
          const activityPosition = profileActivityPositions.get(market.id) ?? { yes: 0n, no: 0n };
          const yesPosition = isOwnProfile ? market.yesPosition : activityPosition.yes;
          const noPosition = isOwnProfile ? market.noPosition : activityPosition.no;
          const settlement = settlementForPosition(market, protocolFeeBps, yesPosition, noPosition);

          return {
            ...market,
            yesPosition,
            noPosition,
            claimed: isOwnProfile ? market.claimed : false,
            potentialPayout: isOwnProfile ? market.potentialPayout : settlement.payout
          };
        })
        .filter((market) => hasUserPosition(market) || sameAddress(market.creator, viewedProfileAddress))
    : [];
  const participatedProfileMarkets = profileMarkets.filter(hasUserPosition);
  const createdProfileMarkets = viewedProfileAddress
    ? profileMarkets.filter((market) => sameAddress(market.creator, viewedProfileAddress))
    : [];
  const profileHistoryPageCount = Math.max(1, Math.ceil(participatedProfileMarkets.length / PROFILE_PAGE_SIZE));
  const safeProfileHistoryPage = Math.min(profileHistoryPage, profileHistoryPageCount);
  const paginatedParticipatedProfileMarkets = participatedProfileMarkets.slice(
    (safeProfileHistoryPage - 1) * PROFILE_PAGE_SIZE,
    safeProfileHistoryPage * PROFILE_PAGE_SIZE
  );
  const profileCreatedPageCount = Math.max(1, Math.ceil(createdProfileMarkets.length / PROFILE_PAGE_SIZE));
  const safeProfileCreatedPage = Math.min(profileCreatedPage, profileCreatedPageCount);
  const paginatedCreatedProfileMarkets = createdProfileMarkets.slice(
    (safeProfileCreatedPage - 1) * PROFILE_PAGE_SIZE,
    safeProfileCreatedPage * PROFILE_PAGE_SIZE
  );
  const profileStake = participatedProfileMarkets.reduce(
    (sum, market) => sum + market.yesPosition + market.noPosition,
    0n
  );
  const claimable = isOwnProfile ? profileMarkets.reduce((sum, market) => sum + market.potentialPayout, 0n) : 0n;
  const createdMarkets = createdProfileMarkets.length;
  const profileDisplayName = viewedProfileAddress
    ? profileNames[viewedProfileKey] || shortAddress(viewedProfileAddress)
    : "Connect wallet";
  const topbarProfileLabel = compactAccountLabel(profileDisplayName);
  const walletUsdcBalance = isAddress(defaultSettlementToken)
    ? walletTokenBalances[defaultSettlementToken.toLowerCase()] ?? walletBalance
    : walletBalance;
  const walletEurcBalance = isAddress(EURC_TOKEN_ADDRESS)
    ? walletTokenBalances[EURC_TOKEN_ADDRESS.toLowerCase()] ?? 0n
    : 0n;
  const displayNameForAddress = useCallback(
    (address: string) => {
      const key = address.toLowerCase();
      return profileNames[key]?.trim() || shortAddress(address);
    },
    [profileNames]
  );
  const profileInitial = profileDisplayName.slice(0, 1).toUpperCase();
  const profileJoinedDate = viewedProfileKey ? profileJoinedDates[viewedProfileKey] : "";
  const profileJoinedLabel = profileJoinedDate
    ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(profileJoinedDate))
    : "New profile";
  const profileSettlements = participatedProfileMarkets
    .map((market) => ({ market, ...userSettlement(market, market.termsProtocolFeeBps ?? protocolFeeBps) }))
    .filter((item) => item.settled);
  const profileResolvedCount = profileSettlements.length;
  const profileWonCount = profileSettlements.filter((item) => item.won).length;
  const profileRealizedStake = profileSettlements.reduce((sum, item) => sum + item.stake, 0n);
  const profileRealizedPayout = profileSettlements.reduce((sum, item) => sum + item.payout, 0n);
  const profilePnl = profileRealizedPayout - profileRealizedStake;
  const profilePnlNumber = Number(formatUnits(profilePnl, defaultSettlementDecimals));
  const profileStakeNumber = Number(formatUnits(profileRealizedStake, defaultSettlementDecimals));
  const profileEdgePercent = profileStakeNumber > 0 ? (profilePnlNumber / profileStakeNumber) * 100 : 0;
  const profileWinRate = profileResolvedCount > 0 ? (profileWonCount / profileResolvedCount) * 100 : 0;
  const profileAuraScore = auraPointsFor(
    profileStake,
    profileWonCount,
    profileResolvedCount,
    createdMarkets,
    profilePnl,
    defaultSettlementDecimals
  );
  const profileWinStreak = [...profileSettlements]
    .sort((a, b) => b.market.closeTime - a.market.closeTime)
    .reduce((streak, item) => (streak.locked ? streak : item.won ? { count: streak.count + 1, locked: false } : { ...streak, locked: true }), {
      count: 0,
      locked: false
    }).count;
  const profileEdgePoints = [...profileSettlements]
    .sort((a, b) => a.market.closeTime - b.market.closeTime)
    .slice(-8)
    .map((item, index, rows) => {
      const market = item.market;
      const totalPool = marketVolume(market);
      const userPrefersYes = market.yesPosition >= market.noPosition;
      const entryPercent = userPrefersYes ? percent(market.yesPool, totalPool) : percent(market.noPool, totalPool);
      const x = rows.length <= 1 ? 50 : 8 + (index / (rows.length - 1)) * 84;
      const y = 52 - Math.min(98, Math.max(2, entryPercent)) * 0.42;
      return { x, y, won: item.won };
    });
  const categoryMatches = (market: MarketView) => {
    if (activeCategory === "All") return true;
    return (market.category || "Other").toLowerCase() === activeCategory.toLowerCase();
  };
  const filteredMarkets = activeMarkets.filter(categoryMatches);
  const normalizedEndedSearch = endedSearchQuery.trim().toLowerCase();
  const filteredEndedMarkets = endedMarkets
    .filter(categoryMatches)
    .filter((market) => {
      if (!normalizedEndedSearch) return true;
      const searchable = [
        market.question,
        market.category || "Other",
        `market ${market.id}`,
        `#${market.id}`,
        market.creator,
        market.resolver,
        outcomeLabel(market.outcome),
        marketStatus(market)
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedEndedSearch);
    });
  const formattedClock = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(currentTime);
  const formattedUtcDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(currentTime);
  const minimumCloseInput = useMemo(
    () => utcDateTimeInputValue(new Date(currentTime.getTime() + 6 * 60 * 1000)),
    [currentTime]
  );
  const minimumCloseParts = useMemo(() => parseUtcDateTimeParts(minimumCloseInput), [minimumCloseInput]);
  const selectedCloseParts = useMemo(() => parseUtcDateTimeParts(createForm.closeTime), [createForm.closeTime]);
  const selectedResolutionParts = useMemo(() => parseUtcDateTimeParts(createForm.resolutionTime), [createForm.resolutionTime]);
  const allFreshMarkets = [...filteredMarkets].sort((a, b) => b.id - a.id);
  const allHottestMarkets = [...filteredMarkets]
    .sort((a, b) => {
      if (b.traderCount !== a.traderCount) return b.traderCount - a.traderCount;
      const bVolume = marketVolume(b);
      const aVolume = marketVolume(a);
      if (bVolume === aVolume) return b.id - a.id;
      return bVolume > aVolume ? 1 : bVolume < aVolume ? -1 : 0;
    });
  const allClosingSoonMarkets = [...filteredMarkets]
    .filter((market) => market.outcome === Outcome.Unresolved)
    .sort((a, b) => {
      if (a.closeTime !== b.closeTime) return a.closeTime - b.closeTime;
      return b.id - a.id;
    });
  const allLiveMarkets = [...filteredMarkets]
    .filter((market) => market.outcome === Outcome.Unresolved && market.closeTime > nowSeconds)
    .sort((a, b) => {
      if (a.closeTime !== b.closeTime) return a.closeTime - b.closeTime;
      return b.id - a.id;
    });
  const heroHotMarkets = [...activeMarkets]
    .sort((a, b) => {
      if (b.traderCount !== a.traderCount) return b.traderCount - a.traderCount;
      const bVolume = marketVolume(b);
      const aVolume = marketVolume(a);
      if (bVolume === aVolume) return b.id - a.id;
      return bVolume > aVolume ? 1 : bVolume < aVolume ? -1 : 0;
    })
    .slice(0, 10);
  const heroHotLoop = heroHotMarkets.length > 0 ? [...heroHotMarkets, ...heroHotMarkets] : [];
  const unfilteredCollectionMarkets =
    collectionView === "hot"
      ? allHottestMarkets
      : collectionView === "closing"
        ? allClosingSoonMarkets
        : collectionView === "live"
          ? allLiveMarkets
        : allFreshMarkets;
  const baseCollectionMarkets = unfilteredCollectionMarkets.filter((market) => {
    if (collectionSettlementToken === "All") return true;
    const settlementToken = market.settlementToken || defaultSettlementToken;
    return isAddress(settlementToken) && sameAddress(settlementToken, collectionSettlementToken);
  });
  const collectionMarkets = [...baseCollectionMarkets].sort((a, b) => {
    let result = 0;
    if (collectionSortKey === "volume") {
      result = compareBigint(marketVolume(a), marketVolume(b));
    } else if (collectionSortKey === "participants") {
      result = a.traderCount - b.traderCount;
    } else if (collectionSortKey === "yes") {
      result = percent(a.yesPool, marketVolume(a)) - percent(b.yesPool, marketVolume(b));
    } else if (collectionSortKey === "no") {
      result = percent(a.noPool, marketVolume(a)) - percent(b.noPool, marketVolume(b));
    } else if (collectionSortKey === "ending") {
      result = a.closeTime - b.closeTime;
    } else {
      result = (a.createdAt || a.id) - (b.createdAt || b.id);
    }

    if (result !== 0) return collectionSortDirection === "asc" ? result : -result;
    return b.id - a.id;
  });
  const collectionPageCount = Math.max(1, Math.ceil(collectionMarkets.length / COLLECTION_PAGE_SIZE));
  const safeCollectionPage = Math.min(collectionPage, collectionPageCount);
  const collectionStartIndex = (safeCollectionPage - 1) * COLLECTION_PAGE_SIZE;
  const paginatedCollectionMarkets = collectionMarkets.slice(
    collectionStartIndex,
    collectionStartIndex + COLLECTION_PAGE_SIZE
  );
  const collectionVisibleStart = collectionMarkets.length === 0 ? 0 : collectionStartIndex + 1;
  const collectionVisibleEnd = Math.min(collectionStartIndex + paginatedCollectionMarkets.length, collectionMarkets.length);
  const collectionTitle =
    collectionView === "hot"
      ? "Hottest markets"
      : collectionView === "closing"
        ? "Closing soon"
        : collectionView === "live"
          ? "Live markets"
          : "Fresh markets";
  const collectionDescription =
    collectionView === "hot"
      ? "All live markets sorted by participants, then volume."
      : collectionView === "closing"
        ? "All live markets sorted by nearest UTC close time."
        : collectionView === "live"
          ? "All currently open markets sorted by nearest UTC close time."
        : "All live markets sorted by newest market first.";
  const homeSectionLimit = marketViewMode === "list" ? 3 : SECTION_LIMIT;
  const freshMarkets = allFreshMarkets.slice(0, homeSectionLimit);
  const hottestMarkets = allHottestMarkets.slice(0, homeSectionLimit);
  const closingSoonMarkets = allClosingSoonMarkets.slice(0, homeSectionLimit);
  const selectedMarket = selectedMarketId === null ? undefined : markets.find((market) => market.id === selectedMarketId);
  const selectedMarketActivities = selectedMarket
    ? activities
        .filter((activity) => activity.marketId === selectedMarket.id)
        .sort((a, b) => a.timestamp - b.timestamp)
    : [];
  const selectedMarketTotal = selectedMarket ? marketVolume(selectedMarket) : 0n;
  const selectedMarketYesPercent = selectedMarket ? percent(selectedMarket.yesPool, selectedMarketTotal) : 50;
  const selectedMarketNoPercent = 100 - selectedMarketYesPercent;
  const activeChartWindow = CHART_WINDOWS.find((item) => item.value === detailChartWindow) ?? CHART_WINDOWS[CHART_WINDOWS.length - 1];
  const detailChartRows = (() => {
    if (!selectedMarket) return [];

    const referenceEnd = Math.max(
      selectedMarket.createdAt || 0,
      Math.min(nowSeconds, selectedMarket.closeTime || nowSeconds)
    );
    const firstActivityTime = selectedMarketActivities[0]?.timestamp || selectedMarket.createdAt || referenceEnd;
    const windowStart = activeChartWindow.seconds
      ? Math.max(selectedMarket.createdAt || firstActivityTime, referenceEnd - activeChartWindow.seconds)
      : Math.min(selectedMarket.createdAt || firstActivityTime, firstActivityTime);
    let yesPool = 0n;
    let noPool = 0n;
    const points: Array<{ timestamp: number; yesPercent: number; noPercent: number }> = [];
    const pushPoint = (timestamp: number) => {
      const total = yesPool + noPool;
      const yes = total > 0n ? percent(yesPool, total) : selectedMarketYesPercent;
      points.push({ timestamp, yesPercent: yes, noPercent: 100 - yes });
    };

    for (const activity of selectedMarketActivities) {
      const timestamp = activity.timestamp || selectedMarket.createdAt || referenceEnd;
      if (timestamp >= windowStart && points.length === 0) {
        pushPoint(windowStart);
      }
      if (activity.side === Outcome.Yes) yesPool += activity.amount;
      if (activity.side === Outcome.No) noPool += activity.amount;
      if (timestamp >= windowStart) pushPoint(timestamp);
    }

    if (points.length === 0) {
      const fallbackStart = activeChartWindow.seconds
        ? Math.max(0, referenceEnd - activeChartWindow.seconds)
        : selectedMarket.createdAt || Math.max(0, referenceEnd - 60 * 60);
      points.push(
        { timestamp: fallbackStart, yesPercent: selectedMarketYesPercent, noPercent: selectedMarketNoPercent },
        { timestamp: referenceEnd, yesPercent: selectedMarketYesPercent, noPercent: selectedMarketNoPercent }
      );
    }

    const compactedPoints = points.reduce<Array<{ timestamp: number; yesPercent: number; noPercent: number }>>((acc, point) => {
      const lastPoint = acc[acc.length - 1];
      if (lastPoint && lastPoint.timestamp === point.timestamp) {
        lastPoint.yesPercent = point.yesPercent;
        lastPoint.noPercent = point.noPercent;
        return acc;
      }
      acc.push({ ...point });
      return acc;
    }, []);
    points.splice(0, points.length, ...compactedPoints);

    const last = points[points.length - 1];
    if (
      points.length > 0 &&
      (Math.abs(last.yesPercent - selectedMarketYesPercent) > 0.1 || Math.abs(last.noPercent - selectedMarketNoPercent) > 0.1)
    ) {
      points.push({
        timestamp: Math.max(referenceEnd, last.timestamp + 60),
        yesPercent: selectedMarketYesPercent,
        noPercent: selectedMarketNoPercent
      });
    }
    if (points.length === 1) {
      points.unshift({
        timestamp: Math.max(0, windowStart),
        yesPercent: points[0].yesPercent,
        noPercent: points[0].noPercent
      });
    }

    const minTime = Math.min(...points.map((point) => point.timestamp));
    const maxTime = Math.max(minTime + 60, ...points.map((point) => point.timestamp));
    return points.map((point) => {
      const x = CHART_LEFT + ((point.timestamp - minTime) / (maxTime - minTime)) * (CHART_RIGHT - CHART_LEFT);
      return {
        ...point,
        x,
        yesY: CHART_BOTTOM - (point.yesPercent / 100) * CHART_HEIGHT,
        noY: CHART_BOTTOM - (point.noPercent / 100) * CHART_HEIGHT
      };
    });
  })();
  const detailChartTicks = (() => {
    if (detailChartRows.length === 0) return [];
    const minTime = detailChartRows[0].timestamp;
    const maxTime = detailChartRows[detailChartRows.length - 1].timestamp;
    const range = Math.max(60, maxTime - minTime);
    const includeDate = range >= 24 * 60 * 60;
    return Array.from({ length: 5 }, (_, index) => {
      const timestamp = Math.round(minTime + (range * index) / 4);
      const x = CHART_LEFT + (index / 4) * (CHART_RIGHT - CHART_LEFT);
      return { x, label: chartTimeLabel(timestamp, includeDate) };
    });
  })();
  const relatedMarkets = selectedMarket
    ? [...markets]
        .filter(
          (market) =>
            market.id !== selectedMarket.id &&
            (market.category || "Other") === (selectedMarket.category || "Other") &&
            market.outcome === Outcome.Unresolved &&
            market.closeTime > nowSeconds
        )
        .map((market) => {
          const selectedTerms = new Set(
            selectedMarket.question
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((term) => term.length > 3)
          );
          const overlap = market.question
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((term) => selectedTerms.has(term)).length;
          return { market, score: 4 + overlap * 3 + Math.min(8, market.traderCount) };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const bVolume = marketVolume(b.market);
          const aVolume = marketVolume(a.market);
          if (bVolume === aVolume) return b.market.id - a.market.id;
          return bVolume > aVolume ? 1 : -1;
        })
        .slice(0, 4)
        .map((item) => item.market)
    : [];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchResults = normalizedSearch
    ? [...markets]
        .filter((market) => {
          const searchable = [
            market.question,
            market.category || "Other",
            `market ${market.id}`,
            `#${market.id}`,
            marketStatus(market)
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(normalizedSearch);
        })
        .sort((a, b) => {
          const aLive = a.outcome === Outcome.Unresolved && a.closeTime > nowSeconds;
          const bLive = b.outcome === Outcome.Unresolved && b.closeTime > nowSeconds;
          if (aLive !== bLive) return aLive ? -1 : 1;
          return b.id - a.id;
        })
        .slice(0, 12)
    : [];
  const tickerSource = activities.slice(0, 24);
  const tickerActivities = tickerSource.length > 0 ? [...tickerSource, ...tickerSource] : [];
  const tickerFallbackMarkets = activeMarkets
    .filter((market) => marketVolume(market) > 0n)
    .sort((a, b) => (marketVolume(b) > marketVolume(a) ? 1 : marketVolume(b) < marketVolume(a) ? -1 : b.id - a.id))
    .slice(0, 12);
  const tickerFallbackLoop = tickerFallbackMarkets.length > 0 ? [...tickerFallbackMarkets, ...tickerFallbackMarkets] : [];
  const resolveNotifications = account
    ? pendingResolutionMarkets.filter(
        (market) =>
          market.proposedAt === 0 &&
          (market.resolutionMode === 2
            ? (!!owner && sameAddress(owner, account)) ||
              (!!market.authority && sameAddress(market.authority, account))
            : sameAddress(market.resolver, account) ||
              (!!owner && sameAddress(owner, account)) ||
              (!!market.authority && sameAddress(market.authority, account)))
      )
    : [];
  const finalizeNotifications = account
    ? pendingResolutionMarkets.filter(
        (market) =>
          market.proposedAt > 0 &&
          !market.disputed &&
          !market.authorityReviewRequired &&
          market.disputeDeadline > 0 &&
          market.disputeDeadline <= nowSeconds &&
          (sameAddress(market.resolver, account) ||
            (!!owner && sameAddress(owner, account)) ||
            (!!(market.authority || resolutionAuthority) && sameAddress(market.authority || resolutionAuthority, account)))
      )
    : [];
  const disputeReviewNotifications =
    account && (owner || resolutionAuthority)
      ? pendingResolutionMarkets.filter(
          (market) =>
            (market.disputed || Boolean(market.authorityReviewRequired)) &&
            !(
              market.disputeDeadline > 0 &&
              (market.termsDisputeGracePeriod ?? disputeGracePeriod) > 0 &&
              market.disputeDeadline + (market.termsDisputeGracePeriod ?? disputeGracePeriod) <= nowSeconds
            ) &&
            ((!!owner && sameAddress(owner, account)) ||
              (!!(market.authority || resolutionAuthority) && sameAddress(market.authority || resolutionAuthority, account)))
        )
      : [];
  const ownerAiMismatchNotifications =
    account && (owner || resolutionAuthority)
      ? pendingResolutionMarkets.filter((market) => {
          if (market.proposedAt <= 0 || market.outcome !== Outcome.Unresolved) return false;
          if (!((!!owner && sameAddress(owner, account)) || (!!(market.authority || resolutionAuthority) && sameAddress(market.authority || resolutionAuthority, account)))) {
            return false;
          }
          const receipt = aiResolutionReceipts[String(market.id)];
          const aiOutcome = aiOutcomeFromReceipt(receipt);
          if (aiOutcome === Outcome.Unresolved || aiOutcome === Outcome.Canceled) return false;
          return (
            market.proposedOutcome !== Outcome.Unresolved &&
            market.proposedOutcome !== Outcome.Canceled &&
            market.proposedOutcome !== aiOutcome
          );
        })
      : [];
  const staleDisputeNotifications = account
    ? pendingResolutionMarkets.filter(
        (market) =>
          (market.disputed || Boolean(market.authorityReviewRequired)) &&
          market.disputeDeadline > 0 &&
          (market.termsDisputeGracePeriod ?? disputeGracePeriod) > 0 &&
          market.disputeDeadline + (market.termsDisputeGracePeriod ?? disputeGracePeriod) <= nowSeconds
      )
    : [];
  const claimNotifications = account && isOwnProfile
    ? profileMarkets.filter(
        (market) => market.outcome !== Outcome.Unresolved && !market.claimed && market.potentialPayout > 0n
      )
    : [];
  const claimableTotal = claimNotifications.reduce((sum, market) => sum + market.potentialPayout, 0n);
  const proposedResultNotifications = account && isOwnProfile
    ? profileMarkets.filter((market) => {
        const key = `${account.toLowerCase()}:proposal:${market.id}:${market.proposedAt}:${market.proposedOutcome}`;
        return (
          hasUserPosition(market) &&
          market.outcome === Outcome.Unresolved &&
          market.proposedAt > 0 &&
          !dismissedResultNotices.includes(key)
        );
      })
    : [];
  const disputeResolvedNotifications = account && isOwnProfile
    ? profileMarkets.filter((market) => {
        const key = `${account.toLowerCase()}:dispute-resolved:${market.id}:${market.outcome}`;
        return (
          hasUserPosition(market) &&
          market.disputed &&
          market.outcome !== Outcome.Unresolved &&
          !dismissedResultNotices.includes(key)
        );
      })
    : [];
  const resultNotifications = account && isOwnProfile
    ? profileMarkets.filter((market) => {
        const key = `${account.toLowerCase()}:result:${market.id}:${market.outcome}`;
        return (
          hasUserPosition(market) &&
          market.outcome !== Outcome.Unresolved &&
          !market.claimed &&
          market.potentialPayout === 0n &&
          !dismissedResultNotices.includes(key)
        );
      })
    : [];
  const canReviewAsOwner =
    !!account &&
    ((!!owner && sameAddress(owner, account)) || (!!resolutionAuthority && sameAddress(resolutionAuthority, account)));
  const isProtocolOwner = !!account && !!owner && sameAddress(account, owner);
  const ownerMismatchHistory = canReviewAsOwner
    ? markets.filter((market) => {
        if (market.proposedAt <= 0 || market.outcome === Outcome.Unresolved) return false;
        const aiReceipt = aiResolutionReceipts[String(market.id)];
        const aiOutcome = aiOutcomeFromReceipt(aiReceipt);
        if (aiOutcome === Outcome.Unresolved || aiOutcome === Outcome.Canceled) return false;
        if (market.proposedOutcome === Outcome.Unresolved || market.proposedOutcome === Outcome.Canceled) return false;
        return market.proposedOutcome !== aiOutcome;
      })
    : [];
  const notificationCount =
    resolveNotifications.length +
    finalizeNotifications.length +
    disputeReviewNotifications.length +
    ownerAiMismatchNotifications.length +
    staleDisputeNotifications.length +
    proposedResultNotifications.length +
    disputeResolvedNotifications.length +
    claimNotifications.length +
    resultNotifications.length;
  const ownerUsageMetrics = {
    totalTrades: activities.length,
    comments: Object.values(marketComments).reduce((sum, rows) => sum + rows.length, 0),
    evidence: Object.values(marketEvidence).reduce((sum, rows) => sum + rows.length, 0),
    publicProfiles: Object.values(profilePublicByAddress).filter((value) => value !== false).length,
    namedProfiles: Object.values(profileNames).filter((name) => name.trim()).length
  };
  const ownerFeeRows = knownSettlementTokens.map((asset) => ({
    ...asset,
    amount:
      protocolFeesByToken[asset.token.toLowerCase()] ??
      (sameAddress(asset.token, defaultSettlementToken) ? accumulatedProtocolFees : 0n)
  }));
  const walletOptions =
    walletProviders.length > 0
      ? walletProviders
      : window.ethereum
        ? [
            {
              info: { uuid: "browser-wallet", name: "Browser Wallet" },
              provider: window.ethereum
            }
          ]
        : [];
  const showMobileWalletLinks = true;
  const recommendedWallets = ["Zerion", "MetaMask", "Rabby Wallet", "OKX Wallet", "Rainbow"];
  const walletConnectReady = Boolean(WALLETCONNECT_PROJECT_ID);
  useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        notificationMenuOpen &&
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(target)
      ) {
        setNotificationMenuOpen(false);
      }
      if (walletMenuOpen && walletMenuRef.current && !walletMenuRef.current.contains(target)) {
        setWalletMenuOpen(false);
      }
      if (themeMenuOpen && themeMenuRef.current && !themeMenuRef.current.contains(target)) {
        setThemeMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [notificationMenuOpen, themeMenuOpen, walletMenuOpen]);
  const leaderboardTimestamp = lastDataRefresh ? Math.floor(lastDataRefresh.getTime() / 1000) : nowSeconds;
  const lastRefreshText = lastDataRefresh
    ? `${lastDataRefresh.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false })} UTC`
    : "Not loaded";
  const indexerSyncText = lastDataRefresh ? timeAgo(Math.floor(lastDataRefresh.getTime() / 1000), currentTime) : "Waiting";
  const boardTitle =
    view === "ended"
      ? "Ended markets"
      : view === "collection"
        ? collectionTitle
        : view === "market"
          ? "Market details"
          : view === "leaderboard"
            ? "Leaderboard"
            : view === "profile"
              ? "Wallet profile"
              : view === "notifications"
                ? "Notifications"
              : view === "owner"
                ? isProtocolOwner ? "Owner dashboard" : "Owner review"
              : view === "security"
                ? "Security and audit"
                : "Live markets";
  const buildPlayerRows = useCallback((periodStart: number, category = "All") => {
    const marketMap = new Map(markets.map((market) => [market.id, market]));
    const marketMatchesCategory = (market?: MarketView) =>
      !market || category === "All" || (market.category || "Other").toLowerCase() === category.toLowerCase();
    const rows = new Map<
      string,
      {
        address: string;
        volume: bigint;
        stake: bigint;
        payout: bigint;
        pnl: bigint;
        wonMarkets: number;
        resolvedMarkets: number;
        createdMarkets: number;
        positions: Map<number, { yes: bigint; no: bigint }>;
      }
    >();
    const appliedUserMarkets = new Set<string>();

    const getRow = (address: string) => {
      const key = address.toLowerCase();
      const row =
        rows.get(key) ??
        {
          address,
          volume: 0n,
          stake: 0n,
          payout: 0n,
          pnl: 0n,
          wonMarkets: 0,
          resolvedMarkets: 0,
          createdMarkets: 0,
          positions: new Map<number, { yes: bigint; no: bigint }>()
        };
      rows.set(key, row);
      return row;
    };

    const addPosition = (address: string, marketId: number, side: Outcome, amount: bigint) => {
      if (amount <= 0n) return;
      const row = getRow(address);
      const position = row.positions.get(marketId) ?? { yes: 0n, no: 0n };

      row.volume += amount;
      row.stake += amount;
      if (side === Outcome.Yes) {
        position.yes += amount;
      } else if (side === Outcome.No) {
        position.no += amount;
      }

      row.positions.set(marketId, position);
    };

    for (const user of Object.values(userRegistry)) {
      getRow(user.address);
    }

    if (account && (!periodStart || Date.now() / 1000 >= periodStart)) {
      getRow(account);
    }

    for (const activity of activities) {
      if (activity.timestamp > 0 && activity.timestamp < periodStart) continue;
      const market = marketMap.get(activity.marketId);
      if (!market) continue;
      if (!marketMatchesCategory(market)) continue;

      addPosition(activity.user, activity.marketId, activity.side, activity.amount);
      appliedUserMarkets.add(`${activity.user.toLowerCase()}:${activity.marketId}`);
    }

    if (account && periodStart === 0) {
      const accountPositionKey = account.toLowerCase();
      for (const market of markets) {
        if (appliedUserMarkets.has(`${accountPositionKey}:${market.id}`)) continue;
        if (!marketMatchesCategory(market)) continue;

        addPosition(account, market.id, Outcome.Yes, market.yesPosition);
        addPosition(account, market.id, Outcome.No, market.noPosition);
      }
    }

    for (const market of markets) {
      if (periodStart > 0 && (market.createdAt === 0 || market.createdAt < periodStart)) continue;
      if (!marketMatchesCategory(market)) continue;
      const creatorRow = getRow(market.creator);
      creatorRow.createdMarkets += 1;
    }

    const output = Array.from(rows.values()).map((row) => {
      for (const [marketId, position] of row.positions) {
        const market = marketMap.get(marketId);
        if (!market) continue;

        const stake = position.yes + position.no;
        if (market.outcome === Outcome.Yes || market.outcome === Outcome.No) {
          const winningStake = market.outcome === Outcome.Yes ? position.yes : position.no;
          const winningPool = market.outcome === Outcome.Yes ? market.yesPool : market.noPool;
          const grossPayout = winningStake > 0n && winningPool > 0n ? (winningStake * marketVolume(market)) / winningPool : 0n;
          const profit = grossPayout > winningStake ? grossPayout - winningStake : 0n;
          const fee = (profit * BigInt(market.termsProtocolFeeBps ?? protocolFeeBps)) / 10000n;
          const payout = grossPayout - fee;
          row.payout += payout;
          row.pnl += payout - stake;
          row.resolvedMarkets += 1;
          if (winningStake > 0n) row.wonMarkets += 1;
        } else if (market.outcome === Outcome.Canceled) {
          row.payout += stake;
          row.resolvedMarkets += 1;
        }
      }

      const winRate = row.resolvedMarkets > 0 ? (row.wonMarkets / row.resolvedMarkets) * 100 : 0;

      return {
        address: row.address,
        volume: row.volume,
        stake: row.stake,
        payout: row.payout,
        pnl: row.pnl,
        wonMarkets: row.wonMarkets,
        resolvedMarkets: row.resolvedMarkets,
        winRate,
        auraPoints: auraPointsFor(row.volume, row.wonMarkets, row.resolvedMarkets, row.createdMarkets, row.pnl, defaultSettlementDecimals),
        createdMarkets: row.createdMarkets
      };
    });

    return output.filter(
      (row) =>
        row.volume > 0n ||
        row.createdMarkets > 0 ||
        row.resolvedMarkets > 0 ||
        (category === "All" && !!userRegistry[row.address.toLowerCase()])
    );
  }, [account, activities, defaultSettlementDecimals, markets, protocolFeeBps, userRegistry]);

  const sortLeaderboardRows = useCallback((rows: LeaderboardRow[], metric: LeaderboardMetric) => {
    return [...rows]
      .sort((left, right) => {
        if (metric === "winRate") {
          if (right.winRate !== left.winRate) return right.winRate - left.winRate;
          return right.volume > left.volume ? 1 : right.volume < left.volume ? -1 : 0;
        }
        if (metric === "auraPoints") {
          if (right.auraPoints !== left.auraPoints) return right.auraPoints - left.auraPoints;
          return right.volume > left.volume ? 1 : right.volume < left.volume ? -1 : 0;
        }
        const rightValue = metric === "volume" ? right.volume : right.pnl;
        const leftValue = metric === "volume" ? left.volume : left.pnl;
        return rightValue > leftValue ? 1 : rightValue < leftValue ? -1 : 0;
      })
      .slice(0, LEADERBOARD_LIMIT);
  }, []);

  const allTimePlayerRows = useMemo(() => buildPlayerRows(0), [buildPlayerRows]);
  const leaderboardRows = useMemo<LeaderboardRow[]>(() => {
    const period = LEADERBOARD_PERIODS.find((item) => item.value === leaderboardPeriod);
    const periodStart = period?.seconds ? leaderboardTimestamp - period.seconds : 0;
    return sortLeaderboardRows(buildPlayerRows(periodStart, leaderboardCategory), leaderboardMetric);
  }, [
    buildPlayerRows,
    leaderboardCategory,
    leaderboardMetric,
    leaderboardPeriod,
    leaderboardTimestamp,
    sortLeaderboardRows
  ]);

  const profileVolumeRows = useMemo(
    () =>
      sortLeaderboardRows(allTimePlayerRows, "volume")
        .map((row) => [row.address.toLowerCase(), row.volume] as const),
    [allTimePlayerRows, sortLeaderboardRows]
  );
  const profileVolumeRank = viewedProfileKey
    ? profileVolumeRows.findIndex(([address]) => address === viewedProfileKey) + 1
    : 0;
  const profileLeaderboardRow = viewedProfileKey
    ? allTimePlayerRows.find((row) => sameAddress(row.address, viewedProfileKey))
    : undefined;
  const displayedProfileVolume = profileLeaderboardRow?.volume ?? profileStake;
  const displayedProfilePnl = profileLeaderboardRow?.pnl ?? profilePnl;
  const displayedProfileResolvedCount = profileLeaderboardRow?.resolvedMarkets ?? profileResolvedCount;
  const displayedProfileWonCount = profileLeaderboardRow?.wonMarkets ?? profileWonCount;
  const displayedProfileWinRate = profileLeaderboardRow?.winRate ?? profileWinRate;
  const displayedProfileAuraScore = profileLeaderboardRow?.auraPoints ?? profileAuraScore;
  const displayedProfileAuraBreakdown = auraBreakdownFor(
    displayedProfileVolume,
    displayedProfileWonCount,
    displayedProfileResolvedCount,
    createdMarkets,
    displayedProfilePnl,
    defaultSettlementDecimals,
    aggregateAssetLabel
  );
  const displayedProfileTier = reputationTierFor(displayedProfileAuraScore);
  const displayedProfileBadgeRow: LeaderboardRow = profileLeaderboardRow ?? {
    address: viewedProfileAddress || account || "0x0000000000000000000000000000000000000000",
    volume: displayedProfileVolume,
    stake: displayedProfileVolume,
    payout: 0n,
    pnl: displayedProfilePnl,
    wonMarkets: displayedProfileWonCount,
    resolvedMarkets: displayedProfileResolvedCount,
    winRate: displayedProfileWinRate,
    auraPoints: displayedProfileAuraScore,
    createdMarkets
  };
  const displayedProfileBadges = reputationBadgesFor(displayedProfileBadgeRow, defaultSettlementDecimals);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => {
      setNoticeText("");
      setNoticeTxHash("");
    }, 6200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(FOLLOWED_CREATORS_KEY, JSON.stringify(followedCreators));
  }, [followedCreators]);

  useEffect(() => {
    window.localStorage.setItem(MARKET_COMMENTS_KEY, JSON.stringify(marketComments));
  }, [marketComments]);

  useEffect(() => {
    window.localStorage.setItem(MARKET_EVIDENCE_KEY, JSON.stringify(marketEvidence));
  }, [marketEvidence]);

  useEffect(() => {
    if (selectedMarketId === null) return;
    let canceled = false;
    fetchIndexerJson<SocialMarketResponse>(`/api/social/markets/${selectedMarketId}`).then((response) => {
      if (canceled || !response) return;
      if (response.comments) {
        setMarketComments((current) => ({ ...current, [String(selectedMarketId)]: response.comments ?? [] }));
      }
      if (response.evidence) {
        setMarketEvidence((current) => ({ ...current, [String(selectedMarketId)]: response.evidence ?? [] }));
      }
    });
    fetchIndexerJson<ResolutionReceiptResponse>(`/api/resolutions/${selectedMarketId}`).then((response) => {
      if (canceled || !response || !("receipt" in response)) return;
      setAiResolutionReceipts((current) => ({ ...current, [String(selectedMarketId)]: response.receipt ?? null }));
    });
    fetchIndexerJson<OracleProposalResponse>(`/api/oracles/${selectedMarketId}`).then((response) => {
      if (canceled || !response || !("proposal" in response)) return;
      setOracleProposals((current) => ({ ...current, [String(selectedMarketId)]: response.proposal ?? null }));
    });
    return () => {
      canceled = true;
    };
  }, [selectedMarketId]);

  useEffect(() => {
    if (!account) return;
    const canReviewAsOwner =
      (!!owner && sameAddress(owner, account)) || (!!resolutionAuthority && sameAddress(resolutionAuthority, account));
    if (!canReviewAsOwner) return;

    const targetMarketIds = markets
      .filter((market) => market.proposedAt > 0)
      .map((market) => market.id)
      .slice(0, 120);
    if (targetMarketIds.length === 0) return;

    let canceled = false;
    Promise.all(
      targetMarketIds.map(async (marketId) => {
        const response = await fetchIndexerJson<ResolutionReceiptResponse>(`/api/resolutions/${marketId}`);
        return { marketId, receipt: response?.receipt ?? null };
      })
    ).then((rows) => {
      if (canceled) return;
      setAiResolutionReceipts((current) => {
        const next = { ...current };
        for (const row of rows) next[String(row.marketId)] = row.receipt;
        return next;
      });
    });

    return () => {
      canceled = true;
    };
  }, [account, markets, owner, resolutionAuthority]);

  useEffect(() => {
    if (!isStablecoinContractVersion(contractVersion) || knownSettlementTokens.length === 0) return;
    let canceled = false;
    Promise.all(
      knownSettlementTokens.map(async (asset) => {
        try {
          const value = await withRpcRetry(() =>
            getPublicClient().readContract({
              address: contractAddress,
              abi: arcPredictionMarketV4Abi,
              functionName: "accumulatedProtocolFeesByToken",
              args: [asset.token as Address]
            })
          );
          return [asset.token.toLowerCase(), value] as const;
        } catch {
          if (sameAddress(asset.token, defaultSettlementToken)) {
            return [asset.token.toLowerCase(), accumulatedProtocolFees] as const;
          }
          return [asset.token.toLowerCase(), 0n] as const;
        }
      })
    ).then((rows) => {
      if (canceled) return;
      const next = Object.fromEntries(rows);
      setProtocolFeesByToken(next);
      if (defaultSettlementToken && isAddress(defaultSettlementToken)) {
        setAccumulatedProtocolFees(next[defaultSettlementToken.toLowerCase()] ?? 0n);
      }
    });
    return () => {
      canceled = true;
    };
  }, [accumulatedProtocolFees, contractAddress, contractVersion, defaultSettlementToken, knownSettlementTokenKey]);

  useEffect(() => {
    if (!viewedProfileAddress || !isAddress(viewedProfileAddress)) return;
    let canceled = false;
    fetchIndexerJson<SocialProfileResponse>(`/api/social/profiles/${viewedProfileAddress}`).then((response) => {
      if (canceled || !response) return;
      const key = viewedProfileAddress.toLowerCase();
      if (response.profile?.name) {
        setProfileNames((current) => ({ ...current, [key]: response.profile?.name ?? current[key] }));
      }
      if (typeof response.profile?.isPublic === "boolean") {
        setProfilePublicByAddress((current) => ({ ...current, [key]: response.profile?.isPublic ?? true }));
      }
      if (response.profile?.joinedAt) {
        setProfileJoinedDates((current) => ({ ...current, [key]: response.profile?.joinedAt ?? current[key] }));
      }
      if (accountKey && key === accountKey && response.follows) {
        setFollowedCreators(response.follows);
      }
    });
    return () => {
      canceled = true;
    };
  }, [accountKey, viewedProfileAddress]);

  useEffect(() => {
    if (view !== "leaderboard" || leaderboardRows.length === 0) return;
    let canceled = false;

    async function loadLeaderboardNames() {
      const rows = await Promise.all(
        leaderboardRows.slice(0, 30).map(async (row) => {
          const response = await fetchIndexerJson<SocialProfileResponse>(`/api/social/profiles/${row.address}`);
          const name = response?.profile?.name?.trim();
          return name ? ([row.address.toLowerCase(), name] as const) : null;
        })
      );
      if (canceled) return;
      const found = rows.filter(Boolean) as Array<readonly [string, string]>;
      if (found.length === 0) return;
      setProfileNames((current) => {
        const next = { ...current };
        let changed = false;
        for (const [address, name] of found) {
          if (next[address] === name) continue;
          next[address] = name;
          changed = true;
        }
        if (changed) window.localStorage.setItem(PROFILE_NAMES_KEY, JSON.stringify(next));
        return changed ? next : current;
      });
    }

    void loadLeaderboardNames();

    return () => {
      canceled = true;
    };
  }, [leaderboardRows, view]);

  useEffect(() => {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, onboardingDismissed ? "true" : "false");
  }, [onboardingDismissed]);

  useEffect(() => {
    if (!accountKey) {
      setProfileNameInput("");
      return;
    }

    setProfileNameInput(profileNames[accountKey] || "");
    setProfileJoinedDates((current) => {
      if (current[accountKey]) return current;
      const next = { ...current, [accountKey]: new Date().toISOString() };
      window.localStorage.setItem(PROFILE_JOINED_KEY, JSON.stringify(next));
      return next;
    });
  }, [accountKey, profileNames]);

  useEffect(() => {
    setProfileHistoryPage(1);
    setProfileCreatedPage(1);
  }, [viewedProfileKey]);

  useEffect(() => {
    const providers = new Map<string, Eip6963ProviderDetail>();
    const addProvider = (detail: Eip6963ProviderDetail) => {
      if (!detail?.provider || !detail.info?.uuid) return;
      providers.set(detail.info.uuid, detail);
      setWalletProviders(Array.from(providers.values()));
    };

    const handleProvider = (event: Event) => {
      addProvider((event as CustomEvent<Eip6963ProviderDetail>).detail);
    };

    window.addEventListener("eip6963:announceProvider", handleProvider as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const legacyProviders = ((window.ethereum as EthereumProvider & { providers?: EthereumProvider[] })?.providers || [])
      .filter(Boolean)
      .map((provider, index) => ({
        info: {
          uuid: `legacy-${index}`,
          name:
            (provider as EthereumProvider & { isZerion?: boolean; isRabby?: boolean; isOkxWallet?: boolean; isMetaMask?: boolean })
              .isZerion
              ? "Zerion"
              : (provider as EthereumProvider & { isRabby?: boolean }).isRabby
                ? "Rabby Wallet"
                : (provider as EthereumProvider & { isOkxWallet?: boolean }).isOkxWallet
                  ? "OKX Wallet"
                  : (provider as EthereumProvider & { isMetaMask?: boolean }).isMetaMask
                    ? "MetaMask"
                    : `Browser Wallet ${index + 1}`
        },
        provider
      }));

    for (const provider of legacyProviders) addProvider(provider);

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleProvider as EventListener);
    };
  }, []);

  const getActiveWalletClient = useCallback(
    (provider?: EthereumProvider | null) => getWalletClient(provider ?? selectedWalletProvider),
    [selectedWalletProvider]
  );

  const setNotice = useCallback((message: string, txHash?: Hash) => {
    setNoticeText(message);
    setNoticeTxHash(txHash || "");
  }, []);

  const switchToArc = useCallback(async (provider?: EthereumProvider | null) => {
    const injected = getInjectedProvider(provider ?? selectedWalletProvider);
    const switchChain = async () => {
      const chainIds = [arcTestnetParams.chainId, arcTestnetParams.chainId.toLowerCase()];
      let lastError: unknown;
      for (const chainId of chainIds) {
        try {
          await injected.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId }]
          });
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    };
    const addChain = async () => {
      const addAttempts = [
        arcTestnetParams,
        { ...arcTestnetParams, chainId: arcTestnetParams.chainId.toLowerCase() },
        ...ARC_RPC_URLS.map((rpcUrl) => ({
          ...arcTestnetParams,
          rpcUrls: [rpcUrl]
        }))
      ];
      let lastError: unknown;
      for (const params of addAttempts) {
        try {
          await injected.request({
            method: "wallet_addEthereumChain",
            params: [params]
          });
          return;
        } catch (error) {
          lastError = error;
          if (isDuplicateRpcNetworkError(error)) continue;
        }
      }
      if (lastError && !isDuplicateRpcNetworkError(lastError)) throw lastError;
    };
    try {
      await switchChain();
    } catch (error) {
      if (!isUnknownChainError(error)) throw error;
      await addChain();
      await switchChain();
    }
    setIsArcNetwork(true);
  }, [selectedWalletProvider]);

  const refreshNetworkState = useCallback(async (provider?: EthereumProvider | null) => {
    try {
      const walletClient = getWalletClient(provider ?? selectedWalletProvider ?? window.ethereum ?? null);
      const chainId = await walletClient.getChainId();
      setIsArcNetwork(BigInt(chainId) === ARC_CHAIN_ID_DECIMAL);
    } catch {
      setIsArcNetwork(false);
    }
  }, [selectedWalletProvider]);

  const ensureArcNetwork = useCallback(async (provider?: EthereumProvider | null) => {
    setSwitchingNetwork(true);
    try {
      await switchToArc(provider);
      await refreshNetworkState(provider);
      setNotice("Arc Testnet network is ready.");
    } catch (error) {
      setNotice(walletConnectionErrorMessage("Network switch failed", error));
    } finally {
      setSwitchingNetwork(false);
    }
  }, [refreshNetworkState, setNotice, switchToArc]);

  const registerUser = useCallback((address: string) => {
    if (!address || !isAddress(address)) return;
    const key = address.toLowerCase();
    setUserRegistry((current) => {
      if (current[key]) return current;
      const next = { ...current, [key]: { address, joinedAt: new Date().toISOString() } };
      window.localStorage.setItem(USER_REGISTRY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const refreshWalletBalance = useCallback(async (address = account) => {
    if (!address || !isAddress(address)) {
      setWalletBalance(0n);
      setWalletTokenBalances({});
      return;
    }

    try {
      const balance =
        isStablecoinContractVersion(contractVersion) && isAddress(defaultSettlementToken)
          ? await withRpcRetry(() => getPublicClient().readContract({
              address: defaultSettlementToken as Address,
              abi: settlementTokenAbi,
              functionName: "balanceOf",
              args: [address as Address]
            }))
          : await withRpcRetry(() => getPublicClient().getBalance({ address: address as Address }));
      setWalletBalance(balance);

      if (isStablecoinContractVersion(contractVersion)) {
        const tokenSet = new Set<string>();
        if (isAddress(defaultSettlementToken)) tokenSet.add(defaultSettlementToken.toLowerCase());
        if (isAddress(EURC_TOKEN_ADDRESS)) tokenSet.add(EURC_TOKEN_ADDRESS.toLowerCase());
        const balances = await Promise.all(
          Array.from(tokenSet).map(async (token) => {
            if (isAddress(defaultSettlementToken) && sameAddress(token, defaultSettlementToken)) {
              return [token, balance] as const;
            }
            const value = await withRpcRetry(() => getPublicClient().readContract({
              address: token as Address,
              abi: settlementTokenAbi,
              functionName: "balanceOf",
              args: [address as Address]
            }));
            return [token, value] as const;
          })
        );
        setWalletTokenBalances(Object.fromEntries(balances));
      } else {
        setWalletTokenBalances({});
      }
    } catch {
      setWalletBalance(0n);
      setWalletTokenBalances({});
    }
  }, [account, contractVersion, defaultSettlementToken]);

  useEffect(() => {
    if (!account) {
      setWalletBalance(0n);
      return;
    }

    registerUser(account);
    void refreshWalletBalance(account);
  }, [account, refreshWalletBalance, registerUser]);

  useEffect(() => {
    if (!isStablecoinContractVersion(contractVersion) || !account || !isAddress(account)) {
      setPendingWithdrawalsByToken({});
      return;
    }
    const tokens = Array.from(
      new Set(
        markets
          .map((market) => market.settlementToken)
          .filter((token): token is string => Boolean(token && isAddress(token)))
      )
    );
    if (tokens.length === 0 && isAddress(defaultSettlementToken)) tokens.push(defaultSettlementToken);
    Promise.all(
      tokens.map(async (token) => {
        const amount = await withRpcRetry(() => getPublicClient().readContract({
          address: contractAddress,
          abi: arcPredictionMarketV3Abi,
          functionName: "pendingWithdrawals",
          args: [token as Address, account as Address]
        }));
        return [token.toLowerCase(), amount] as const;
      })
    )
      .then((rows) => setPendingWithdrawalsByToken(Object.fromEntries(rows)))
      .catch(() => setPendingWithdrawalsByToken({}));
  }, [account, contractAddress, contractVersion, defaultSettlementToken, markets]);

  const connectWallet = useCallback(async (provider?: EthereumProvider | null) => {
    setNotice("");
    setConnecting(true);
    const providerToUse = provider ?? selectedWalletProvider ?? window.ethereum ?? null;
    const walletClient = getWalletClient(providerToUse);
    const addresses = await walletClient.requestAddresses();
    await switchToArc(providerToUse);
    const chainId = await walletClient.getChainId();
    if (BigInt(chainId) !== ARC_CHAIN_ID_DECIMAL) {
      throw new Error("Wallet is not on Arc Testnet.");
    }
    if (!addresses[0]) {
      throw new Error("No wallet account returned.");
    }
    setAccount(addresses[0]);
    registerUser(addresses[0]);
    void refreshWalletBalance(addresses[0]);
    setSelectedWalletProvider(providerToUse);
    setIsArcNetwork(true);
    window.localStorage.setItem(WALLET_CONNECTED_KEY, "true");
    window.localStorage.removeItem(WALLET_DISCONNECTED_KEY);
    setNotice("Wallet connected on Arc Testnet.");
    setConnecting(false);
  }, [registerUser, refreshWalletBalance, selectedWalletProvider, switchToArc]);

  const handleConnectWallet = useCallback(async (provider?: EthereumProvider | null) => {
    try {
      await connectWallet(provider);
      setWalletModalOpen(false);
    } catch (error) {
      setConnecting(false);
      setNotice(walletConnectionErrorMessage("Connect failed", error));
    }
  }, [connectWallet]);

  const handleWalletConnect = useCallback(async () => {
    try {
      setNotice("");
      setConnecting(true);
      const provider = await getWalletConnectProvider();
      await connectWallet(provider);
      setWalletModalOpen(false);
    } catch (error) {
      setConnecting(false);
      setNotice(walletConnectionErrorMessage("WalletConnect failed", error));
    }
  }, [connectWallet]);

  const openMobileWallet = useCallback((url: string) => {
    window.location.href = url;
  }, []);

  const openWalletModal = useCallback(() => {
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    setWalletModalOpen(true);
  }, []);

  const openProfile = useCallback(() => {
    if (!account) {
      setNotice("Connect wallet before opening your profile.");
      return;
    }

    setSelectedMarketId(null);
    setSelectedProfileAddress(account);
    updateProfileRoute(account);
    setView("profile");
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    setSwapMarketId(null);
    setSwapAmountInput("");
    setSwapQuote(null);
    setSwapQuotePairKey("");
    setSwapQuoteTime(0);
  }, [account]);

  const openNotifications = useCallback(() => {
    if (!account) {
      setNotice("Connect wallet before opening notifications.");
      return;
    }

    setSelectedMarketId(null);
    setSelectedProfileAddress("");
    updateMarketRoute(null);
    setView("notifications");
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
  }, [account, setNotice]);

  const disconnectWallet = useCallback(async () => {
    const providerToDisconnect = selectedWalletProvider;
    try {
      await providerToDisconnect?.disconnect?.();
    } catch {
      // Injected wallets usually do not expose disconnect; local session state is still cleared below.
    }
    setAccount("");
    setWalletBalance(0n);
    setSelectedWalletProvider(null);
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    setSelectedProfileAddress("");
    window.localStorage.removeItem(WALLET_CONNECTED_KEY);
    window.localStorage.setItem(WALLET_DISCONNECTED_KEY, "true");
    setNotice("Wallet disconnected in AuraPredict.");
  }, [selectedWalletProvider]);

  const dismissResultNotification = useCallback((market: MarketView) => {
    if (!account) return;
    const key = `${account.toLowerCase()}:result:${market.id}:${market.outcome}`;
    setDismissedResultNotices((current) => {
      if (current.includes(key)) return current;
      const next = [...current, key];
      window.localStorage.setItem(DISMISSED_RESULT_KEY, JSON.stringify(next));
      return next;
    });
  }, [account]);

  const dismissNotificationByKey = useCallback((key: string) => {
    setDismissedResultNotices((current) => {
      if (current.includes(key)) return current;
      const next = [...current, key];
      window.localStorage.setItem(DISMISSED_RESULT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const openCreateMarket = useCallback(() => {
    setAiMarketDraft(null);
    setAuraCreateStatus("idle");
    setDuplicateAcknowledged(false);
    setCreateModalOpen(true);
  }, []);

  const setCreateCloseTimePreset = useCallback(
    (offsetMinutes: number) => {
      const minimumOffset = 6;
      const targetOffset = Math.max(minimumOffset, offsetMinutes);
      const nextTime = utcInputFromNow(currentTime, targetOffset);
      setCreateForm((current) => ({
        ...current,
        closeTime: nextTime,
        resolutionTime: isStablecoinContractVersion(contractVersion) ? nextTime : current.resolutionTime
      }));
    },
    [contractVersion, currentTime]
  );

  const loadMoreMarkets = useCallback((silent = false) => {
    silentLoadRef.current = silent;
    setMarketLoadLimit((current) => {
      if (knownMarketCount <= 0) return current + MARKET_LOAD_STEP;
      return Math.min(knownMarketCount, current + MARKET_LOAD_STEP);
    });
  }, [knownMarketCount]);

  const setStakeByPercent = useCallback((marketId: number, percentage: number) => {
    const market = markets.find((item) => item.id === marketId);
    const balance =
      isStablecoinContractVersion(contractVersion) && market?.settlementToken && isAddress(market.settlementToken)
        ? walletTokenBalances[market.settlementToken.toLowerCase()] ??
          (isAddress(defaultSettlementToken) && sameAddress(market.settlementToken, defaultSettlementToken) ? walletBalance : 0n)
        : walletBalance;

    if (balance <= 0n) {
      setStakeInputs((current) => ({ ...current, [marketId]: "" }));
      return;
    }

    const clamped = Math.max(0, Math.min(100, percentage));
    const value = (balance * BigInt(Math.round(clamped * 100))) / 10000n;
    const decimals = isStablecoinContractVersion(contractVersion) ? marketDecimals(market) : ARC_NATIVE_USDC_DECIMALS;
    setStakeInputs((current) => ({ ...current, [marketId]: value > 0n ? formatUsdcInput(value, decimals) : "" }));
  }, [contractVersion, defaultSettlementToken, markets, walletBalance, walletTokenBalances]);

  const chooseTradeSide = useCallback((marketId: number, side: Outcome.Yes | Outcome.No) => {
    setSelectedTradeSides((current) => {
      const next = { ...current };
      if (next[marketId] === side) {
        delete next[marketId];
      } else {
        next[marketId] = side;
      }
      return next;
    });
  }, []);

  const swapPairForDirection = useCallback(
    (direction: StablecoinSwapDirection): StablecoinSwapPair | null => {
      if (!isAddress(defaultSettlementToken) || !isAddress(EURC_TOKEN_ADDRESS) || sameAddress(defaultSettlementToken, EURC_TOKEN_ADDRESS)) {
        return null;
      }
      if (direction === "USDC_TO_EURC") {
        return {
          fromToken: defaultSettlementToken as Address,
          fromSymbol: defaultSettlementSymbol || "USDC",
          toToken: EURC_TOKEN_ADDRESS as Address,
          toSymbol: "EURC",
          decimals: V3_STABLECOIN_DECIMALS
        };
      }
      return {
        fromToken: EURC_TOKEN_ADDRESS as Address,
        fromSymbol: "EURC",
        toToken: defaultSettlementToken as Address,
        toSymbol: defaultSettlementSymbol || "USDC",
        decimals: V3_STABLECOIN_DECIMALS
      };
    },
    [defaultSettlementSymbol, defaultSettlementToken]
  );

  const swapPairForMarket = useCallback(
    (market: MarketView): StablecoinSwapPair | null => {
      const marketToken = market.settlementToken || defaultSettlementToken;
      if (!isAddress(marketToken)) return null;
      if (sameAddress(marketToken, EURC_TOKEN_ADDRESS)) return swapPairForDirection("USDC_TO_EURC");
      if (sameAddress(marketToken, defaultSettlementToken)) return swapPairForDirection("EURC_TO_USDC");
      return null;
    },
    [defaultSettlementToken, swapPairForDirection]
  );

  const openMarketSwap = useCallback((market: MarketView) => {
    setSwapMarketId((current) => (current === market.id ? null : market.id));
    setSwapAmountInput("");
    setSwapQuote(null);
    setSwapQuotePairKey("");
    setSwapQuoteTime(0);
    setSwapProviderHealth({ circle: CIRCLE_APP_KIT_KEY ? "idle" : "skipped", lifi: "idle" });
  }, []);

  const requestSwapQuote = useCallback(
    async (pair: StablecoinSwapPair) => {
      let requestedAmount = 0n;
      try {
        if (!account || !isAddress(account)) throw new Error("Connect wallet before swapping.");
        requestedAmount = parseUsdcInput(swapAmountInput, pair.decimals);
        if (requestedAmount <= 0n) throw new Error("Enter an amount to swap.");
        const fromBalance =
          walletTokenBalances[pair.fromToken.toLowerCase()] ??
          (sameAddress(pair.fromToken, defaultSettlementToken) ? walletBalance : 0n);
        if (requestedAmount > fromBalance) throw new Error(`Not enough ${pair.fromSymbol} for this swap.`);
        setSwapBusy("quote");
        setSwapQuote(null);
        setSwapQuotePairKey("");
        setSwapQuoteTime(0);
        setSwapProviderHealth({
          circle: CIRCLE_APP_KIT_KEY ? "idle" : "skipped",
          lifi: "idle"
        });
        setNotice(`Finding a ${pair.fromSymbol} to ${pair.toSymbol} swap route on Arc...`);
        let quote: StablecoinSwapQuote | null = null;
        let appKitFailure = "";
        if (CIRCLE_APP_KIT_KEY) {
          try {
            await switchToArc();
            quote = await estimateArcAppKitSwap(getInjectedProvider(selectedWalletProvider), pair, requestedAmount, swapToleranceBps);
            setSwapProviderHealth({
              circle: "ok",
              lifi: "skipped"
            });
          } catch (error) {
            appKitFailure = compactErrorMessage(error);
            setSwapProviderHealth({
              circle: "fail",
              lifi: "idle",
              circleMessage: appKitFailure
            });
          }
        }
        if (!quote) {
          const { createConfig, getRoutes } = await import("@lifi/sdk");
          createConfig({ integrator: "aurapredict", disableVersionCheck: true });
          const result = await getRoutes({
            fromChainId: ARC_CHAIN_ID_NUMBER,
            toChainId: ARC_CHAIN_ID_NUMBER,
            fromTokenAddress: pair.fromToken,
            toTokenAddress: pair.toToken,
            fromAmount: requestedAmount.toString(),
            fromAddress: account,
            toAddress: account,
            options: { integrator: "aurapredict", order: "RECOMMENDED", slippage: swapToleranceBps / 10_000 }
          });
          const route = result.routes[0];
          if (!route) {
            const diagnostic = await lifiRouteDiagnostic(pair, requestedAmount, account, swapToleranceBps / 10_000);
            const fallbackReason = diagnostic || `No LI.FI route is available for ${pair.fromSymbol} to ${pair.toSymbol} right now.`;
            setSwapProviderHealth((current) => ({
              ...current,
              lifi: "fail",
              lifiMessage: fallbackReason
            }));
            throw new Error(appKitFailure ? `Circle App Kit failed first (${appKitFailure}). ${fallbackReason}` : fallbackReason);
          }
          quote = { provider: "lifi", route };
          setSwapProviderHealth((current) => ({
            ...current,
            lifi: "ok"
          }));
        }
        setSwapQuote(quote);
        setSwapQuotePairKey(stablecoinSwapPairKey(pair));
        setSwapQuoteTime(Date.now());
        const estimatedAmount = swapQuoteEstimatedAmount(quote, pair);
        setNotice(
          `${swapQuoteProviderLabel(quote)} quote ready: ${formatUsdcInput(requestedAmount, pair.decimals)} ${
            pair.fromSymbol
          } to approximately ${formatUsdcInput(estimatedAmount, pair.decimals)} ${pair.toSymbol} with ${formatSwapTolerance(
            swapToleranceBps
          )} price tolerance.`
        );
      } catch (error) {
        setSwapQuote(null);
        setSwapQuotePairKey("");
        setSwapQuoteTime(0);
        let message = compactErrorMessage(error);
        if (
          requestedAmount > 0n &&
          account &&
          isAddress(account) &&
          (message.toLowerCase().includes("no available quotes") || message.toLowerCase().includes("no li.fi route"))
        ) {
          message = await lifiRouteDiagnostic(pair, requestedAmount, account, swapToleranceBps / 10_000);
          setSwapProviderHealth((current) => ({
            ...current,
            lifi: "fail",
            lifiMessage: message
          }));
        }
        setNotice(`Swap quote unavailable: ${message}`);
      } finally {
        setSwapBusy("idle");
      }
    },
    [
      account,
      defaultSettlementToken,
      selectedWalletProvider,
      setNotice,
      swapAmountInput,
      swapToleranceBps,
      switchToArc,
      walletBalance,
      walletTokenBalances
    ]
  );

  const executeStablecoinSwap = useCallback(
    async (pair: StablecoinSwapPair) => {
      if (!swapQuote || swapQuotePairKey !== stablecoinSwapPairKey(pair)) return;
      if (!account || !isAddress(account)) {
        setNotice("Connect wallet before swapping.");
        return;
      }
      if (!swapQuoteTime || Date.now() - swapQuoteTime > SWAP_QUOTE_MAX_AGE_MS) {
        setSwapQuote(null);
        setSwapQuotePairKey("");
        setSwapQuoteTime(0);
        setNotice("Swap quote expired. Get a fresh quote before signing so the minimum receive amount is current.");
        return;
      }
      if (transactionLockRef.current) {
        setNotice("A wallet confirmation is already open. Confirm or reject it before sending another transaction.");
        return;
      }
      transactionLockRef.current = true;
      setTransactionPending(true);
      setSwapBusy("execute");
      try {
        await switchToArc();
        setNotice(`Confirm the ${pair.fromSymbol} to ${pair.toSymbol} swap in your wallet.`);
        if (swapQuote.provider === "arc-app-kit") {
          const executed = await executeArcAppKitSwap(getInjectedProvider(selectedWalletProvider), pair, swapQuote);
          const received = executed.amountOut || swapQuote.estimatedAmountOut;
          const swapHash = /^0x[a-fA-F0-9]{64}$/.test(executed.txHash) ? (executed.txHash as Hash) : undefined;
          setNotice(`Swap completed through Circle App Kit. Received approximately ${received} ${pair.toSymbol}.`, swapHash);
        } else {
          const walletClient = createWalletClient({
            account: account as Address,
            chain: arcTestnet,
            transport: custom(getInjectedProvider(selectedWalletProvider) as never)
          });
          const { createConfig, EVM, executeRoute } = await import("@lifi/sdk");
          createConfig({
            integrator: "aurapredict",
            disableVersionCheck: true,
            providers: [
              EVM({
                getWalletClient: async () => walletClient as never,
                switchChain: async (chainId) => {
                  if (chainId !== ARC_CHAIN_ID_NUMBER) throw new Error("This swap must stay on Arc Testnet.");
                  await switchToArc();
                  return walletClient as never;
                }
              })
            ]
          });
          const executed = await executeRoute(swapQuote.route, {
            updateRouteHook: (updatedRoute) => setSwapQuote({ provider: "lifi", route: updatedRoute }),
            acceptExchangeRateUpdateHook: async () => false
          });
          const hashes = executed.steps.flatMap((step) => step.execution?.process || []).map((process) => process.txHash);
          const swapHash = hashes.reverse().find((hash): hash is Hash => Boolean(hash && /^0x[a-fA-F0-9]{64}$/.test(hash)));
          const received = formatUsdcInput(BigInt(executed.toAmount), pair.decimals);
          setNotice(`Swap completed through LI.FI. Received approximately ${received} ${pair.toSymbol}.`, swapHash);
        }
        setSwapAmountInput("");
        setSwapQuote(null);
        setSwapQuotePairKey("");
        setSwapQuoteTime(0);
        await refreshWalletBalance();
      } catch (error) {
        setSwapQuote(null);
        setSwapQuotePairKey("");
        setSwapQuoteTime(0);
        setNotice(`Swap failed: ${compactErrorMessage(error)}`);
      } finally {
        transactionLockRef.current = false;
        setTransactionPending(false);
        setSwapBusy("idle");
      }
    },
    [account, refreshWalletBalance, selectedWalletProvider, setNotice, swapQuote, swapQuotePairKey, swapQuoteTime, switchToArc]
  );

  const profileSwapPair = swapPairForDirection(profileSwapDirection);
  const profileSwapSourceBalance = profileSwapPair
    ? walletTokenBalances[profileSwapPair.fromToken.toLowerCase()] ??
      (sameAddress(profileSwapPair.fromToken, defaultSettlementToken) ? walletBalance : 0n)
    : 0n;
  const activeProfileSwapQuote =
    profileSwapPair && swapQuotePairKey === stablecoinSwapPairKey(profileSwapPair) ? swapQuote : null;

  const copyTextToClipboard = useCallback(async (text: string, successMessage: string) => {
    try {
      await window.navigator.clipboard.writeText(text);
      setNotice(successMessage);
    } catch {
      setNotice(text);
    }
  }, [setNotice]);

  const toggleFollowCreator = useCallback(
    async (creator: string) => {
      if (!creator) return;
      const creatorKey = creator.toLowerCase();
      const isFollowing = followedCreators.includes(creatorKey);
      const response = account
        ? await postIndexerJson<{ following: boolean; follows: string[] }>(`/api/social/profiles/${account}/follows`, {
            creator
          })
        : null;

      if (response?.follows) {
        setFollowedCreators(response.follows);
        setNotice(response.following ? "Creator followed." : "Creator unfollowed.");
        return;
      }

      setFollowedCreators((current) =>
        isFollowing ? current.filter((address) => address !== creatorKey) : [...current, creatorKey]
      );
      setNotice(isFollowing ? "Creator unfollowed." : "Creator followed locally.");
    },
    [account, followedCreators, setNotice]
  );

  const postMarketComment = useCallback(
    async (marketId: number) => {
      const text = (commentInputs[marketId] || "").trim().replace(/\s+/g, " ");
      if (text.length < 2) {
        setNotice("Enter a comment before posting.");
        return;
      }

      const author = account || "Guest";
      const response = await postIndexerJson<{ comment: MarketComment; comments: MarketComment[] }>(
        `/api/social/markets/${marketId}/comments`,
        { author, text }
      );
      if (response?.comments) {
        setMarketComments((current) => ({ ...current, [String(marketId)]: response.comments }));
        setCommentInputs((current) => ({ ...current, [marketId]: "" }));
        setNotice("Comment posted.");
        return;
      }

      const comment: MarketComment = {
        id: `${marketId}-${Date.now()}`,
        marketId,
        author,
        text: text.slice(0, 420),
        createdAt: new Date().toISOString()
      };

      setMarketComments((current) => ({
        ...current,
        [String(marketId)]: [comment, ...(current[String(marketId)] || [])].slice(0, 80)
      }));
      setCommentInputs((current) => ({ ...current, [marketId]: "" }));
      setNotice("Comment posted locally.");
    },
    [account, commentInputs, setNotice]
  );

  const saveMarketEvidence = useCallback(
    async (marketId: number) => {
      const draft = evidenceDrafts[marketId] || { title: "", url: "", notes: "" };
      const title = draft.title.trim().replace(/\s+/g, " ").slice(0, 90);
      const url = draft.url.trim();
      const notes = draft.notes.trim().replace(/\s+/g, " ").slice(0, 520);

      if (!title && !url && !notes) {
        setNotice("Add a source link, title, or note before saving evidence.");
        return;
      }

      if (url && !/^https?:\/\//i.test(url)) {
        setNotice("Evidence URL must start with http:// or https://.");
        return;
      }

      const response = await postIndexerJson<{ evidence: MarketEvidence; evidenceRows: MarketEvidence[] }>(
        `/api/social/markets/${marketId}/evidence`,
        { title, url, notes, addedBy: account || "Guest" }
      );
      if (response?.evidenceRows) {
        setMarketEvidence((current) => ({ ...current, [String(marketId)]: response.evidenceRows }));
        setEvidenceDrafts((current) => ({
          ...current,
          [marketId]: { title: "", url: "", notes: "" }
        }));
        setNotice("Evidence saved.");
        return;
      }

      const evidence: MarketEvidence = {
        id: `${marketId}-${Date.now()}`,
        marketId,
        title: title || "Evidence",
        url,
        notes,
        addedBy: account || "Guest",
        createdAt: new Date().toISOString()
      };

      setMarketEvidence((current) => ({
        ...current,
        [String(marketId)]: [evidence, ...(current[String(marketId)] || [])].slice(0, 40)
      }));
      setEvidenceDrafts((current) => ({
        ...current,
        [marketId]: { title: "", url: "", notes: "" }
      }));
      setNotice("Evidence saved locally for this market.");
    },
    [account, evidenceDrafts, setNotice]
  );

  const askAuraForMarketDraft = useCallback(async () => {
    const idea = createForm.question.trim();
    if (idea.length < 4) {
      setNotice("Describe the market idea before asking Aura Agent.");
      return;
    }
    setAiBusy(true);
    setAuraCreateStatus("idle");
    setAiMarketDraft(null);
    setDuplicateAcknowledged(false);
    try {
      const response = await postIndexerJson<{ draft: AiMarketDraft }>("/api/ai/market-draft", {
        idea,
        category: createForm.category,
        closeTime: createForm.closeTime
      });
      if (!response?.draft) throw new Error("Aura Agent did not return a draft.");
      setAiMarketDraft(response.draft);
      setAuraCreateStatus("ready");
      setNotice("Aura Agent drafted clearer market terms.");
    } catch (error) {
      setAuraCreateStatus("failed");
      setNotice(`Aura Agent unavailable: ${compactErrorMessage(error)}. You can launch market manually.`);
    } finally {
      setAiBusy(false);
    }
  }, [createForm, setNotice]);

  const canCreateAfterAura = auraCreateStatus !== "idle";
  const ruleReferenceCloseTime = useMemo(
    () => parseResolutionReferenceTime(createForm.resolutionRule),
    [createForm.resolutionRule]
  );
  const hasRuleCloseMismatch = Boolean(
    ruleReferenceCloseTime &&
      (isStablecoinContractVersion(contractVersion) ? createForm.resolutionTime : createForm.closeTime) &&
      ruleReferenceCloseTime !== (isStablecoinContractVersion(contractVersion) ? createForm.resolutionTime : createForm.closeTime)
  );
  const createAuraStatusLabel =
    auraCreateStatus === "ready"
      ? "Aura draft ready. Review and launch."
      : auraCreateStatus === "failed"
        ? "Aura unavailable. Manual launch is unlocked."
        : "Ask Aura first. If Aura fails, manual launch will unlock.";

  const canResolveAfterAura = useCallback(
    (marketId: number) => {
      const status = auraResolutionStatusByMarket[marketId] || "idle";
      if (status !== "idle") return true;
      const receipt = aiResolutionReceipts[String(marketId)];
      const suggested = aiOutcomeFromReceipt(receipt);
      return suggested === Outcome.Yes || suggested === Outcome.No;
    },
    [aiResolutionReceipts, auraResolutionStatusByMarket]
  );

  const resolveAuraStatusLabel = useCallback(
    (market: Pick<MarketView, "id" | "closeTime">) => {
      const unlockTime = resolutionUnlockTime(market);
      if (nowSeconds < unlockTime) {
        return `Resolution opens at ${closeDate(unlockTime)} (rule timestamp).`;
      }
      const marketId = market.id;
      const status = auraResolutionStatusByMarket[marketId] || "idle";
      if (status === "ready") return "Aura suggestion is ready.";
      if (status === "failed") return "Aura unavailable. Manual propose is unlocked.";
      return "Ask Aura first before proposing. If Aura fails, manual propose is unlocked.";
    },
    [auraResolutionStatusByMarket, closeDate, nowSeconds, resolutionUnlockTime]
  );

  const applyAuraMarketDraft = useCallback(() => {
    if (!aiMarketDraft) return;
    const rawSources = aiMarketDraft.sources || [];
    const firstSourceCandidate = normalizeReferenceUrl(aiMarketDraft.sources?.[0] || "");
    const secondSourceCandidate = normalizeReferenceUrl(aiMarketDraft.sources?.[1] || "");
    const firstSource = isValidHttpUrl(firstSourceCandidate) ? firstSourceCandidate : "";
    const secondSource = isValidHttpUrl(secondSourceCandidate) ? secondSourceCandidate : "";
    const unresolvedSourceNames = rawSources
      .filter((source) => !isValidHttpUrl(normalizeReferenceUrl(source)))
      .slice(0, 3);
    const inferredCloseTime =
      parseAuraUtcCloseTimeFromText(aiMarketDraft.question || "") ||
      parseAuraUtcCloseTimeFromText(aiMarketDraft.resolutionCriteria || "") ||
      parseAuraUtcCloseTimeFromText(aiMarketDraft.closeTime || "");
    const contextFallbackSource = defaultSourceByContext(
      aiMarketDraft.category,
      `${aiMarketDraft.question || ""} ${aiMarketDraft.resolutionCriteria || ""}`
    );
    setCreateForm((current) => ({
      ...current,
      question: aiMarketDraft.question || current.question,
      category: aiMarketDraft.category && CATEGORIES.includes(aiMarketDraft.category) ? aiMarketDraft.category : current.category,
      closeTime: inferredCloseTime || current.closeTime,
      resolutionTime: inferredCloseTime || current.resolutionTime || current.closeTime,
      resolutionSource:
        firstSource ||
        (isValidHttpUrl(normalizeReferenceUrl(current.resolutionSource))
          ? normalizeReferenceUrl(current.resolutionSource)
          : "") ||
        contextFallbackSource,
      resolutionRule:
        aiMarketDraft.resolutionCriteria ||
        current.resolutionRule ||
        "Use the primary source value at the exact UTC close timestamp defined by this market.",
      fallbackSource: secondSource || current.fallbackSource
    }));
    setDuplicateAcknowledged(false);
    if (!firstSource && rawSources.length > 0) {
      const unresolvedHint = unresolvedSourceNames.length > 0 ? ` (${unresolvedSourceNames.join(", ")})` : "";
      setNotice(
        `Aura draft applied. Some sources were names only${unresolvedHint}. Applied context fallback source: ${contextFallbackSource}`
      );
    } else {
      setNotice("Aura Agent draft applied. Review it before launching.");
    }
  }, [aiMarketDraft, setNotice]);

  const askAuraForResolution = useCallback(
    async (market: MarketView) => {
      if (market.outcome !== Outcome.Unresolved) {
        setNotice("This market is finalized. Saved Aura analysis is read-only and no new AI review will run.");
        return;
      }
      const effectiveCloseTime = resolutionUnlockTime(market);
      if (Math.floor(Date.now() / 1000) < effectiveCloseTime) {
        setNotice("Aura resolution review is available only after the market resolution time.");
        return;
      }
      if (requiresCancelForLiquidity(market)) {
        setNotice(
          hasNoLiquidity(market)
            ? "This market has no positions. Cancel it to release the creator bond; Aura review is not needed."
            : "This market has positions on only one outcome. Cancel it to refund the funded position; Aura review is not needed."
        );
        return;
      }
      setAiBusy(true);
      setAuraResolutionStatusByMarket((current) => ({ ...current, [market.id]: "idle" }));
      try {
        const evidenceRows = marketEvidence[String(market.id)] || [];
        const response = await postIndexerJson<{ report: AiResolutionReport; receipt?: AiResolutionReceipt }>("/api/ai/resolution-report", {
          marketId: market.id,
          question: market.question,
          category: market.category,
          closeTime: market.closeTime,
          resolutionTime: effectiveCloseTime,
          evidence: evidenceRows
        });
        if (!response?.report) throw new Error("Aura Agent did not return a report.");
        setAiResolutionReports((current) => ({ ...current, [market.id]: response.report }));
        if (response.receipt) {
          setAiResolutionReceipts((current) => ({ ...current, [String(market.id)]: response.receipt ?? null }));
        }
        setAuraResolutionStatusByMarket((current) => ({ ...current, [market.id]: "ready" }));
        setNotice("Aura Agent resolution report updated.");
      } catch (error) {
        setAuraResolutionStatusByMarket((current) => ({ ...current, [market.id]: "failed" }));
        setNotice(`Aura Agent unavailable: ${compactErrorMessage(error)}. Manual propose is unlocked.`);
      } finally {
        setAiBusy(false);
      }
    },
    [marketEvidence, resolutionUnlockTime, setNotice]
  );

  const requestOracleProposal = useCallback(
    async (market: MarketView) => {
      const effectiveCloseTime = resolutionUnlockTime(market);
      if (Math.floor(Date.now() / 1000) < effectiveCloseTime) {
        setNotice("Oracle proposal is available only after the market resolution time.");
        return;
      }
      setOracleBusyByMarket((current) => ({ ...current, [market.id]: true }));
      try {
        const response = await postIndexerJson<OracleProposalResponse>(`/api/oracles/${market.id}/run`, {});
        if (!response?.proposal) throw new Error("Oracle did not return a proposal.");
        setOracleProposals((current) => ({ ...current, [String(market.id)]: response.proposal ?? null }));
        const outcome = oracleOutcomeFromProposal(response.proposal);
        setNotice(
          outcome === Outcome.Unresolved
            ? "Oracle could not make a deterministic proposal. Use Aura or authority review."
            : `Oracle proposal ready: ${outcomeLabel(outcome)}.`
        );
      } catch (error) {
        setNotice(`Oracle unavailable: ${compactErrorMessage(error)}.`);
      } finally {
        setOracleBusyByMarket((current) => ({ ...current, [market.id]: false }));
      }
    },
    [resolutionUnlockTime, setNotice]
  );

  const setThemeMode = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    setThemeMenuOpen(false);
  }, []);

  const saveProfileName = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!accountKey || !isOwnProfile) {
        setNotice("Connect wallet before setting a username.");
        return;
      }

      const nextName = profileNameInput.trim().replace(/\s+/g, " ").slice(0, 24);
      if (nextName.length < 2) {
        setNotice("Username must be at least 2 characters.");
        return;
      }

      const next = { ...profileNames, [accountKey]: nextName };
      setProfileNames(next);
      window.localStorage.setItem(PROFILE_NAMES_KEY, JSON.stringify(next));
      const response = await postIndexerJson<{ profile: { name?: string; isPublic?: boolean } }>(
        `/api/social/profiles/${account}`,
        { name: nextName, isPublic: profilePublicByAddress[accountKey] !== false }
      );
      setNotice(response?.profile ? "Username saved." : "Username saved for this wallet.");
    },
    [account, accountKey, isOwnProfile, profileNameInput, profileNames, profilePublicByAddress]
  );

  const toggleProfilePublic = useCallback(async () => {
    if (!accountKey || !isOwnProfile) {
      setNotice("Only the connected wallet can change profile visibility.");
      return;
    }

    const nextPublic = !(profilePublicByAddress[accountKey] !== false);
    const next = { ...profilePublicByAddress, [accountKey]: nextPublic };
    setProfilePublicByAddress(next);
    window.localStorage.setItem(PROFILE_PUBLIC_KEY, JSON.stringify(next));
    const response = await postIndexerJson<{ profile: { isPublic?: boolean } }>(`/api/social/profiles/${account}`, {
      name: profileNames[accountKey] || "",
      isPublic: nextPublic
    });
    setNotice(
      nextPublic
        ? response?.profile ? "Profile is public." : "Profile is public locally."
        : response?.profile ? "Profile is private. Share links are disabled." : "Profile is private locally."
    );
  }, [account, accountKey, isOwnProfile, profileNames, profilePublicByAddress]);

  const copyProfileLink = useCallback(async () => {
    const shareAddress = viewedProfileAddress || account;
    if (!shareAddress) {
      setNotice("Connect wallet before sharing a profile.");
      return;
    }
    if (isOwnProfile && !isProfilePublic) {
      setNotice("Turn Public on before sharing this profile.");
      return;
    }

    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set(PROFILE_QUERY_KEY, shareAddress);
    const sharedName = profileNames[shareAddress.toLowerCase()]?.trim();
    if (sharedName) {
      url.searchParams.set(PROFILE_NAME_QUERY_KEY, sharedName);
    }
    const profileUrl = url.toString();
    try {
      await window.navigator.clipboard.writeText(profileUrl);
      setNotice("Profile link copied.");
    } catch {
      setNotice(profileUrl);
    }
  }, [account, isOwnProfile, isProfilePublic, profileNames, viewedProfileAddress]);

  const openCollection = useCallback((section: MarketSectionKey) => {
    setCollectionView(section);
    setCollectionSortKey(section === "hot" ? "participants" : section === "closing" || section === "live" ? "ending" : "created");
    setCollectionSortDirection(section === "closing" || section === "live" ? "asc" : "desc");
    setCollectionPage(1);
    setSelectedMarketId(null);
    setSelectedProfileAddress("");
    updateMarketRoute(null);
    setView("collection");
    window.setTimeout(() => document.getElementById("markets")?.scrollIntoView({ block: "start" }), 50);
  }, []);

  const openMarket = useCallback((marketId: number, focusResolution = false) => {
    setSelectedMarketId(marketId);
    if (focusResolution) setFocusResolutionMarketId(marketId);
    setSelectedProfileAddress("");
    updateMarketRoute(marketId);
    setView("market");
    setSearchQuery("");
    setMarketWalletSearch("");
    setSearchFocused(false);
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    setThemeMenuOpen(false);
    window.setTimeout(() => document.getElementById("markets")?.scrollIntoView({ block: "start" }), 50);
  }, []);

  useEffect(() => {
    if (view !== "market" || selectedMarketId === null || focusResolutionMarketId !== selectedMarketId) return;
    const timer = window.setTimeout(() => {
      document.getElementById("market-resolution-zone")?.scrollIntoView({ block: "center", behavior: "smooth" });
      setFocusResolutionMarketId(null);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusResolutionMarketId, selectedMarketId, view]);

  const backToMarkets = useCallback(() => {
    setSelectedMarketId(null);
    setSelectedProfileAddress("");
    updateMarketRoute(null);
    setView("markets");
    window.setTimeout(() => document.getElementById("markets")?.scrollIntoView({ block: "start" }), 50);
  }, []);

  const goHomeTop = useCallback(() => {
    setSelectedMarketId(null);
    setSelectedProfileAddress("");
    updateMarketRoute(null);
    setView("markets");
    setSearchQuery("");
    setSearchFocused(false);
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    setThemeMenuOpen(false);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }, []);

  const openSearchedMarket = useCallback(
    (market: MarketView) => {
      setSelectedMarketId(market.id);
      setSelectedProfileAddress("");
      updateMarketRoute(market.id);
      setView("market");
      setActiveCategory("All");
      setSearchQuery("");
      setMarketWalletSearch("");
      setSearchFocused(false);
      setWalletMenuOpen(false);
      setNotificationMenuOpen(false);
      setThemeMenuOpen(false);
      window.setTimeout(() => document.getElementById("markets")?.scrollIntoView({ block: "start" }), 50);
    },
    []
  );

  const loadMarkets = useCallback(async () => {
    if (!hasContract) return;

    const isSilentLoad = silentLoadRef.current;
    silentLoadRef.current = false;
    if (loadMarketsInFlightRef.current) return;
    loadMarketsInFlightRef.current = true;
    if (!isSilentLoad) setLoading(true);
    try {
      const publicClient = getPublicClient();
      let detectedContractVersion: MarketContractVersion = contractVersion;
      let detectedSettlementSymbol = defaultSettlementSymbol;
      let detectedSettlementDecimals = defaultSettlementDecimals;
      const [count, contractOwner, contractMinStake] = await Promise.all([
        withRpcRetry(() => publicClient.readContract({
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "marketCount"
        })),
        withRpcRetry(() => publicClient.readContract({
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "owner"
        })),
        withRpcRetry(() => publicClient.readContract({
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "minStake"
        }))
      ]);

      const totalMarketCount = Number(count);
      const requestedMarketCount = Math.min(totalMarketCount, Math.max(1, marketLoadLimit));
      const latestMarketStart = Math.max(0, totalMarketCount - requestedMarketCount);
      const marketIdSet = new Set<number>();

      for (let id = latestMarketStart; id < totalMarketCount; id += 1) {
        marketIdSet.add(id);
      }

      if (selectedMarketId !== null && selectedMarketId >= 0 && selectedMarketId < totalMarketCount) {
        marketIdSet.add(selectedMarketId);
      }

      const marketIds = Array.from(marketIdSet).sort((a, b) => a - b);
      setKnownMarketCount(totalMarketCount);
      setOwner(contractOwner);
      setResolutionAuthority((current) => current || contractOwner);
      setMinStake(contractMinStake);
      try {
        const [contractCreatorBond, contractDisputeBond, contractDisputeWindow] = await Promise.all([
          withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "creatorBond"
          })),
          withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "disputeBond"
          })),
          withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "disputeWindow"
          }))
        ]);
        setCreatorBond(contractCreatorBond);
        setDisputeBond(contractDisputeBond);
        setDisputeWindow(Number(contractDisputeWindow));
      } catch {
        setCreatorBond(0n);
        setDisputeBond(0n);
        setDisputeWindow(0);
        setDisputeGracePeriod(0);
        setMarketCreationFee(0n);
      }
      try {
        const [contractVersionName, contractResolutionAuthority, contractDisputeGracePeriod, contractMarketCreationFee] =
          await Promise.all([
            withRpcRetry(() => publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "CONTRACT_VERSION"
            })),
            withRpcRetry(() => publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "resolutionAuthority"
            })),
            withRpcRetry(() => publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "disputeGracePeriod"
            })),
            withRpcRetry(() => publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "marketCreationFee"
            }))
          ]);
        detectedContractVersion =
          String(contractVersionName) === "AURAPREDICT_V4"
            ? "v4"
            : String(contractVersionName) === "AURAPREDICT_V3"
              ? "v3"
            : String(contractVersionName) === "AURAPREDICT_V2"
              ? "v2"
              : "dispute";
        setContractVersion(detectedContractVersion);
        setResolutionAuthority(contractResolutionAuthority);
        setDisputeGracePeriod(Number(contractDisputeGracePeriod));
        setMarketCreationFee(contractMarketCreationFee);
        if (isStablecoinContractVersion(detectedContractVersion)) {
          const token = await withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketV3Abi,
            functionName: "defaultSettlementToken"
          }));
          const asset = await withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketV3Abi,
            functionName: "assetConfigs",
            args: [token]
          }));
          detectedSettlementSymbol = String(asset[1] || "USDC");
          detectedSettlementDecimals = Number(asset[2] || V3_STABLECOIN_DECIMALS);
          setDefaultSettlementToken(token);
          setDefaultSettlementSymbol(detectedSettlementSymbol);
          setDefaultSettlementDecimals(detectedSettlementDecimals);
        } else {
          setDefaultSettlementToken("");
          setDefaultSettlementSymbol("USDC");
          setDefaultSettlementDecimals(ARC_NATIVE_USDC_DECIMALS);
        }
      } catch {
        setResolutionAuthority(contractOwner);
        setDisputeGracePeriod(0);
        setMarketCreationFee(0n);
      }
      try {
        const [feeBps, protocolFees] = await Promise.all([
          withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "protocolFeeBps"
          })),
          withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "accumulatedProtocolFees"
          }))
        ]);
        setProtocolFeeBps(Number(feeBps));
        setAccumulatedProtocolFees(protocolFees);
      } catch {
        setProtocolFeeBps(0);
        setAccumulatedProtocolFees(0n);
      }

      const indexedSnapshot = await loadIndexedSnapshot();
      if (indexedSnapshot) {
        const indexedRows = indexedSnapshot.markets;
        const indexedTotalCount = Math.max(totalMarketCount, indexedSnapshot.total, indexedRows.length);
        setKnownMarketCount(indexedTotalCount);
        setMarketLoadLimit((current) => Math.max(current, indexedTotalCount));
        const mergedIndexedRows = mergeMarketRows(indexedRows, markets, indexedTotalCount);
        setMarkets((current) => mergeMarketRows(indexedRows, current, indexedTotalCount));
        setActivities(indexedSnapshot.activities);
        if (indexedSnapshot.stats) {
          setProjectStats({
            ...indexedSnapshot.stats,
            totalMarkets: Math.max(indexedSnapshot.stats.totalMarkets, indexedTotalCount),
            indexedMarkets: Math.max(indexedSnapshot.stats.indexedMarkets, mergedIndexedRows.length),
            liveMarkets: Math.max(
              indexedSnapshot.stats.liveMarkets,
              mergedIndexedRows.filter((market) => market.outcome === Outcome.Unresolved && market.closeTime > nowSeconds).length
            ),
            pendingMarkets: Math.max(
              indexedSnapshot.stats.pendingMarkets,
              mergedIndexedRows.filter((market) => market.outcome === Outcome.Unresolved && market.closeTime <= nowSeconds).length
            )
          });
        }
        writeCachedMarkets(mergedIndexedRows);
        setDataSource("indexer");

        if (!isSilentLoad && account && isAddress(account) && indexedRows.length > 0) {
          const accountForPositions = account as Address;
          void (async () => {
            try {
              const positionRows = await mapWithConcurrency(
                indexedRows,
                MARKET_LOAD_CONCURRENCY,
                async (market) => {
                  const position = await withRpcRetry(() => publicClient.readContract({
                    address: contractAddress,
                    abi: arcPredictionMarketAbi,
                    functionName: "positionOf",
                    args: [BigInt(market.id), accountForPositions]
                  }));
                  const yesPosition = position[0];
                  const noPosition = position[1];
                  const claimed = position[2];
                  let potentialPayout = 0n;

                  if (market.outcome !== Outcome.Unresolved && !claimed && (yesPosition > 0n || noPosition > 0n)) {
                    potentialPayout = await withRpcRetry(() => publicClient.readContract({
                      address: contractAddress,
                      abi: arcPredictionMarketAbi,
                      functionName: "potentialPayout",
                      args: [BigInt(market.id), accountForPositions]
                    }));
                  }

                  return {
                    id: market.id,
                    yesPosition,
                    noPosition,
                    claimed,
                    potentialPayout
                  };
                }
              );
              const positionsByMarket = new Map(positionRows.map((position) => [position.id, position]));
              setMarkets((current) =>
                current.map((market) => {
                  const position = positionsByMarket.get(market.id);
                  return position ? { ...market, ...position } : market;
                })
              );
            } catch {
              // Position hydration is intentionally non-blocking.
            }
          })();
        }

        setLastDataRefresh(new Date());
        if (!isSilentLoad) setLoading(false);
        return;
      }

      let failedMarketLoads = 0;
      setDataSource("rpc");
      const readMarketById = async (id: number, trackFailure: boolean) => {
        if (isStablecoinContractVersion(detectedContractVersion)) {
          try {
            const data = await withRpcRetry(() => publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketV3Abi,
              functionName: "getMarket",
              args: [BigInt(id)]
            }));
            const asset = await withRpcRetry(() => publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketV3Abi,
              functionName: "assetConfigs",
              args: [data[2]]
            }));
            const terms =
              detectedContractVersion === "v4"
                ? await withRpcRetry(() => publicClient.readContract({
                    address: contractAddress,
                    abi: arcPredictionMarketV4Abi,
                    functionName: "getMarketTerms",
                    args: [BigInt(id)]
                  }))
                : null;
            const policy =
              detectedContractVersion === "v4"
                ? await withRpcRetry(() => publicClient.readContract({
                    address: contractAddress,
                    abi: arcPredictionMarketV4Abi,
                    functionName: "getMarketPolicy",
                    args: [BigInt(id)]
                  }))
                : null;
            return {
              market: {
                id,
                question: data[0],
                category: normalizeCategory(data[1]),
                settlementToken: data[2],
                settlementSymbol: String(asset[1] || detectedSettlementSymbol),
                settlementDecimals: Number(asset[2] || detectedSettlementDecimals),
                createdAt: 0,
                closeTime: Number(data[3]),
                resolutionTime: Number(data[4]),
                creator: data[5],
                resolver: data[6],
                authority: data[7],
                resolutionMode: Number(data[8]),
                metadataHash: data[9],
                metadataURI: data[10],
                fallbackSourceURI: terms?.[2],
                resolutionRule: terms?.[3],
                resolutionAdapter: policy?.[0],
                termsProtocolFeeBps: Number(data[11]),
                termsCreatorBond: data[12],
                termsDisputeBond: data[13],
                termsDisputeWindow: Number(data[14]),
                termsDisputeGracePeriod: Number(data[25]),
                termsProposalGracePeriod: policy ? Number(policy[2]) : undefined,
                yesPool: data[15],
                noPool: data[16],
                traderCount: Number(data[17]),
                proposedOutcome: Number(data[18]) as Outcome,
                proposedAt: Number(data[19]),
                disputeDeadline: Number(data[20]),
                authorityReviewRequired: Boolean(data[21]),
                disputed: Boolean(data[22]),
                disputer: data[23],
                outcome: Number(data[24]) as Outcome,
                yesPosition: 0n,
                noPosition: 0n,
                claimed: false,
                potentialPayout: 0n
              },
              isLegacyMarket: false
            };
          } catch (error) {
            if (trackFailure) failedMarketLoads += 1;
            console.warn(`Failed to load stablecoin market #${id}`, error);
            return null;
          }
        }
        let marketData;
        let isLegacyMarket = false;

        try {
          marketData = await withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "getMarket",
            args: [BigInt(id)]
          }));
        } catch (error) {
          const message = errorMessage(error);
          if (
            message.includes("valid boolean") ||
            message.includes("returned data did not match") ||
            message.includes("decode")
          ) {
            isLegacyMarket = true;
            const legacyAbi = [
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
            ] as const;
            const legacyMarket = await withRpcRetry(() => publicClient.readContract({
              address: contractAddress,
              abi: legacyAbi,
              functionName: "getMarket",
              args: [BigInt(id)]
            }));
            marketData = [
              legacyMarket[0],
              legacyMarket[1],
              legacyMarket[2],
              legacyMarket[3],
              legacyMarket[4],
              legacyMarket[5],
              legacyMarket[6],
              legacyMarket[7],
              Outcome.Unresolved,
              0n,
              0n,
              false,
              "0x0000000000000000000000000000000000000000",
              legacyMarket[8]
            ] as const;
          } else {
            if (trackFailure) failedMarketLoads += 1;
            console.warn(`Failed to load market #${id}`, error);
            return null;
          }
        }

        const [
          question,
          category,
          closeTime,
          creator,
          resolver,
          yesPool,
          noPool,
          traderCount,
          proposedOutcome,
          proposedAt,
          disputeDeadline,
          disputed,
          disputer,
          outcome
        ] = marketData;

        return {
          market: {
            id,
            question,
            category: normalizeCategory(category),
            createdAt: 0,
            closeTime: Number(closeTime),
            creator,
            resolver,
            yesPool,
            noPool,
            traderCount: Number(traderCount),
            proposedOutcome: Number(proposedOutcome) as Outcome,
            proposedAt: Number(proposedAt),
            disputeDeadline: Number(disputeDeadline),
            disputed,
            disputer,
            outcome: Number(outcome) as Outcome,
            yesPosition: 0n,
            noPosition: 0n,
            claimed: false,
            potentialPayout: 0n
          },
          isLegacyMarket
        };
      };

      const rows = await mapWithConcurrency<number, MarketView | null>(
        marketIds,
        MARKET_LOAD_CONCURRENCY,
        async (id) => {
          const row = await readMarketById(id, true);
          if (id === 0 && row) setContractVersion(row.isLegacyMarket ? "legacy" : "dispute");
          return row?.market ?? null;
        }
      );

      if (totalMarketCount === 0 && !isStablecoinContractVersion(detectedContractVersion)) setContractVersion("unknown");
      const loadedRows = rows.filter((row): row is MarketView => Boolean(row));

      if (totalMarketCount > 0 && marketIds.length > 0 && loadedRows.length === 0) {
        throw new Error("Arc RPC is rate-limiting requests right now (429). Wait 30-60 seconds, then refresh.");
      }

      let sortedRows = loadedRows.sort((a, b) => b.id - a.id);
      setMarkets((current) =>
        sortedRows.map((market) => {
          const currentMarket = current.find((item) => item.id === market.id);
          if (!currentMarket) return market;
          const shouldPreserveLocalProposal =
            currentMarket.outcome === Outcome.Unresolved &&
            market.outcome === Outcome.Unresolved &&
            currentMarket.proposedAt > market.proposedAt;
          const shouldPreserveLocalResolution =
            currentMarket.outcome !== Outcome.Unresolved && market.outcome === Outcome.Unresolved;

          return {
            ...market,
            ...(shouldPreserveLocalProposal || shouldPreserveLocalResolution
              ? {
                  proposedOutcome: currentMarket.proposedOutcome,
                  proposedAt: currentMarket.proposedAt,
                  disputeDeadline: currentMarket.disputeDeadline,
                  disputed: currentMarket.disputed,
                  disputer: currentMarket.disputer,
                  outcome: currentMarket.outcome
                }
              : {}),
            yesPosition: currentMarket.yesPosition,
            noPosition: currentMarket.noPosition,
            claimed: currentMarket.claimed,
            potentialPayout: currentMarket.potentialPayout
          };
        })
      );
      setLastDataRefresh(new Date());
      writeCachedMarkets(sortedRows);
      if (!isSilentLoad) setLoading(false);

      let projectCreatorAddresses = new Set<string>();
      const projectRows = await mapWithConcurrency(
        Array.from({ length: totalMarketCount }, (_, id) => id),
        MARKET_LOAD_CONCURRENCY,
        async (id) => readMarketById(id, false)
      );
      const projectMarkets = projectRows.flatMap((row) => row ? [row.market as MarketView] : []);
      if (projectMarkets.length >= sortedRows.length) {
        sortedRows = projectMarkets.sort((a, b) => b.id - a.id);
        setMarketLoadLimit((current) => Math.max(current, sortedRows.length));
        setMarkets((current) =>
          sortedRows.map((market) => {
            const currentMarket = current.find((item) => item.id === market.id);
            return currentMarket
              ? {
                  ...market,
                  yesPosition: currentMarket.yesPosition,
                  noPosition: currentMarket.noPosition,
                  claimed: currentMarket.claimed,
                  potentialPayout: currentMarket.potentialPayout
                }
              : market;
          })
        );
        writeCachedMarkets(sortedRows);
      }
      if (projectMarkets.length > 0 || totalMarketCount === 0) {
        const statsNow = Math.floor(Date.now() / 1000);
        const projectTotalVolume = projectMarkets.reduce((sum, market) => sum + marketVolume(market), 0n);
        const projectLiveMarkets = projectMarkets.filter(
          (market) => market.outcome === Outcome.Unresolved && market.closeTime > statsNow
        );
        const projectEndedMarkets = projectMarkets.filter((market) => market.outcome !== Outcome.Unresolved);
        const projectPendingMarkets = projectMarkets.filter(
          (market) => market.outcome === Outcome.Unresolved && market.closeTime <= statsNow
        );
        projectCreatorAddresses = new Set(projectMarkets.map((market) => market.creator.toLowerCase()));
        setProjectStats({
          totalMarkets: totalMarketCount,
          indexedMarkets: projectMarkets.length,
          liveMarkets: projectLiveMarkets.length,
          endedMarkets: projectEndedMarkets.length,
          pendingMarkets: projectPendingMarkets.length,
          totalVolume: projectTotalVolume,
          liveLiquidity: projectLiveMarkets.reduce((sum, market) => sum + marketVolume(market), 0n),
          averageMarketVolume: projectMarkets.length > 0 ? projectTotalVolume / BigInt(projectMarkets.length) : 0n,
          participantEntries: projectMarkets.reduce((sum, market) => sum + market.traderCount, 0),
          knownPlayers: projectCreatorAddresses.size,
          assetBreakdown: assetStatsFromMarkets(
            projectMarkets,
            statsNow,
            defaultSettlementToken,
            defaultSettlementSymbol,
            defaultSettlementDecimals
          )
        });
      }

      if (!isSilentLoad && account && isAddress(account) && sortedRows.length > 0) {
        const accountForPositions = account as Address;
        void (async () => {
          try {
            const positionRows = await mapWithConcurrency(
              sortedRows,
              MARKET_LOAD_CONCURRENCY,
              async (market) => {
                const position = await withRpcRetry(() => publicClient.readContract({
                  address: contractAddress,
                  abi: arcPredictionMarketAbi,
                  functionName: "positionOf",
                  args: [BigInt(market.id), accountForPositions]
                }));
                const yesPosition = position[0];
                const noPosition = position[1];
                const claimed = position[2];
                let potentialPayout = 0n;

                if (market.outcome !== Outcome.Unresolved && !claimed && (yesPosition > 0n || noPosition > 0n)) {
                  potentialPayout = await withRpcRetry(() => publicClient.readContract({
                    address: contractAddress,
                    abi: arcPredictionMarketAbi,
                    functionName: "potentialPayout",
                    args: [BigInt(market.id), accountForPositions]
                  }));
                }

                return {
                  id: market.id,
                  yesPosition,
                  noPosition,
                  claimed,
                  potentialPayout
                };
              }
            );
            const positionsByMarket = new Map(positionRows.map((position) => [position.id, position]));
            setMarkets((current) =>
              current.map((market) => {
                const position = positionsByMarket.get(market.id);
                return position ? { ...market, ...position } : market;
              })
            );
          } catch {
            // Position hydration is intentionally non-blocking.
          }
        })();
      }

      if (!isSilentLoad) try {
        const getContractEventsChunked = async (eventName: "MarketCreated" | "BetPlaced") => {
          const latestBlock = await withRpcRetry(() => publicClient.getBlockNumber());
          const events: ContractEventRow[] = [];
          let fromBlock = EVENT_START_BLOCK;

          while (fromBlock <= latestBlock) {
            const toBlock =
              fromBlock + EVENT_LOG_CHUNK_SIZE - 1n > latestBlock ? latestBlock : fromBlock + EVENT_LOG_CHUNK_SIZE - 1n;
            const rows = await withRpcRetry(() =>
              publicClient.getContractEvents({
                address: contractAddress,
                abi: arcPredictionMarketAbi,
                eventName,
                fromBlock,
                toBlock
              })
            );
            events.push(...(rows as ContractEventRow[]));
            fromBlock = toBlock + 1n;
          }

          return events;
        };
        const blockTimestamps = new Map<bigint, number>();
        const getBlockTimestamp = async (blockNumber?: bigint | null) => {
          if (!blockNumber) return 0;
          if (!blockTimestamps.has(blockNumber)) {
            const block = await withRpcRetry(() => publicClient.getBlock({ blockNumber }));
            blockTimestamps.set(blockNumber, Number(block.timestamp));
          }
          return blockTimestamps.get(blockNumber) ?? 0;
        };
        const [createdEvents, betEvents] = await Promise.all([
          getContractEventsChunked("MarketCreated"),
          getContractEventsChunked("BetPlaced")
        ]);
        const createdAtByMarket = new Map<number, number>();
        const activityMarketRows = projectMarkets.length > 0 ? projectMarkets : sortedRows;
        const loadedMarketIds = new Set(activityMarketRows.map((market) => market.id));
        const relevantCreatedEvents = createdEvents.filter((event) => {
          const args = event.args as { marketId?: bigint };
          return loadedMarketIds.has(Number(args.marketId ?? 0n));
        });
        const relevantBetEvents = betEvents.filter((event) => {
          const args = event.args as { marketId?: bigint };
          return loadedMarketIds.has(Number(args.marketId ?? 0n));
        });

        await mapWithConcurrency(
          relevantCreatedEvents,
          EVENT_LOAD_CONCURRENCY,
          async (event) => {
            const args = event.args as { marketId?: bigint };
            createdAtByMarket.set(Number(args.marketId ?? 0n), await getBlockTimestamp(event.blockNumber));
          }
        );

        sortedRows = sortedRows.map((market) => ({
          ...market,
          createdAt: createdAtByMarket.get(market.id) ?? market.createdAt
        }));
        if (projectMarkets.length > 0) {
          const createdRows = sortedRows;
          sortedRows = projectMarkets
            .map((market) => ({
              ...market,
              createdAt: createdAtByMarket.get(market.id) ?? market.createdAt
            }))
            .sort((a, b) => b.id - a.id);
          if (createdRows.length !== sortedRows.length) setMarketLoadLimit((current) => Math.max(current, sortedRows.length));
        }
        writeCachedMarkets(sortedRows);

        const marketMap = new Map(sortedRows.map((market) => [market.id, market]));
        const activityRows = await mapWithConcurrency(
          relevantBetEvents,
          EVENT_LOAD_CONCURRENCY,
          async (event) => {
            const args = event.args as {
              marketId?: bigint;
              user?: Address;
              side?: number;
              amount?: bigint;
            };
            const marketId = Number(args.marketId ?? 0n);

            return {
              id: `${event.transactionHash}-${event.logIndex}`,
              user: args.user ?? "0x0000000000000000000000000000000000000000",
              marketId,
              question: marketMap.get(marketId)?.question ?? `Market #${marketId}`,
              side: Number(args.side ?? 0) as Outcome,
              amount: args.amount ?? 0n,
              timestamp: await getBlockTimestamp(event.blockNumber)
            };
          }
        );
        setActivities(activityRows.sort((a, b) => b.timestamp - a.timestamp));
        const eventPlayerAddresses = new Set(projectCreatorAddresses);
        for (const event of betEvents) {
          const args = event.args as { user?: Address };
          if (args.user) eventPlayerAddresses.add(args.user.toLowerCase());
        }
        setProjectStats((current) =>
          current
            ? {
                ...current,
                knownPlayers: Math.max(current.knownPlayers, eventPlayerAddresses.size)
              }
            : current
        );
      } catch {
        setActivities((current) => current);
      }
      setMarkets((current) =>
        sortedRows.map((market) => {
          const currentMarket = current.find((item) => item.id === market.id);
          return currentMarket
            ? {
                ...market,
                yesPosition: currentMarket.yesPosition,
                noPosition: currentMarket.noPosition,
                claimed: currentMarket.claimed,
                potentialPayout: currentMarket.potentialPayout
              }
            : market;
        })
      );
      setLastDataRefresh(new Date());
      if (failedMarketLoads > 0) {
        setNotice(
          `Loaded ${loadedRows.length}/${totalMarketCount} markets in the current window. Arc RPC skipped ${failedMarketLoads} rate-limited calls; refresh again in a moment.`
        );
      }
    } catch (error) {
      setNotice(
        isRateLimitError(error)
          ? "Arc Testnet RPC is rate-limiting requests (429). Wait 30-60 seconds, then press Refresh."
          : errorMessage(error)
      );
    } finally {
      loadMarketsInFlightRef.current = false;
      if (!isSilentLoad) setLoading(false);
    }
  }, [account, contractAddress, hasContract, marketLoadLimit, selectedMarketId]);

  const isMarketActionPending = (action: string, marketId: number) => Boolean(pendingMarketActions[`${action}:${marketId}`]);
  const setMarketActionPending = (action: string, marketId: number, pending: boolean) => {
    setPendingMarketActions((current) => {
      const key = `${action}:${marketId}`;
      if (pending) return { ...current, [key]: true };
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const markMarketResultProposed = (marketId: number, outcome: Outcome, disputeDeadline?: number) => {
    const proposedAt = Math.floor(Date.now() / 1000);
    setMarkets((current) =>
      current.map((market) =>
        market.id === marketId
          ? {
              ...market,
              proposedOutcome: outcome,
              proposedAt: market.proposedAt > 0 ? market.proposedAt : proposedAt,
              disputeDeadline: disputeDeadline && disputeDeadline > 0 ? disputeDeadline : proposedAt + disputeWindow,
              disputed: false
            }
          : market
      )
    );
  };
  const markMarketFinalized = (marketId: number, outcome: Outcome) => {
    setMarkets((current) =>
      current.map((market) =>
        market.id === marketId
          ? {
              ...market,
              outcome,
              proposedOutcome: outcome,
              proposedAt: market.proposedAt || Math.floor(Date.now() / 1000)
            }
          : market
      )
    );
  };

  const runTransaction = async (
    action: () => Promise<Hash>,
    message: string,
    refreshAfterConfirm = true,
    onConfirmed?: (receipt: TransactionReceipt) => void
  ) => {
    if (transactionLockRef.current) {
      setNotice("A wallet confirmation is already open. Confirm or reject it before sending another transaction.");
      return false;
    }

    let submittedHash: Hash | undefined;
    transactionLockRef.current = true;
    setTransactionPending(true);
    try {
      setNotice(message);
      const hash = await action();
      submittedHash = hash;
      setNotice(`Submitted on Arc: ${shortHash(hash)}. Waiting for confirmation...`, hash);
      const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setNotice("Transaction reverted on Arc. Open the transaction to inspect the failure.", hash);
        return false;
      }
      setNotice(`Transaction confirmed on Arc: ${shortHash(hash)}`, hash);
      onConfirmed?.(receipt);
      void refreshWalletBalance();
      if (refreshAfterConfirm) void loadMarkets();
      return true;
    } catch (error) {
      setNotice(compactErrorMessage(error), submittedHash);
      return false;
    } finally {
      transactionLockRef.current = false;
      setTransactionPending(false);
    }
  };

  const createMarket = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
      const question = createForm.question.trim().replace(/\s+/g, " ");
      const category = createForm.category.trim() || "Other";
      const resolutionSource = normalizeReferenceUrl(createForm.resolutionSource);
      const resolutionRule = stripRuleMetadata(createForm.resolutionRule.trim());
      const fallbackSource = normalizeReferenceUrl(createForm.fallbackSource);
      if (!question) throw new Error("Market question is required.");
      if (question.length < 8) throw new Error("Market question must be at least 8 characters.");
      if (!canCreateAfterAura) throw new Error("Ask Aura Agent once before launching. If Aura is unavailable, you can continue after the failed check.");
      if (!resolutionSource) throw new Error("Resolution source is required.");
      if (!resolutionRule) throw new Error("Resolution rule is required.");
      if (!isValidHttpUrl(resolutionSource)) throw new Error("Resolution source must be a valid http(s) link.");
      if (fallbackSource && !isValidHttpUrl(fallbackSource)) throw new Error("Fallback source must be a valid http(s) link.");
      if (!createForm.closeTime) throw new Error("Close time is required.");
      const ruleReferenceTime = parseResolutionReferenceTime(resolutionRule);
      const declaredResolutionInput = isStablecoinContractVersion(contractVersion) ? createForm.resolutionTime : createForm.closeTime;
      if (isStablecoinContractVersion(contractVersion) && !declaredResolutionInput) throw new Error("Resolution time is required.");
      if (ruleReferenceTime && declaredResolutionInput !== ruleReferenceTime) {
        throw new Error(
          `Resolution time must match rule time (${ruleReferenceTime} UTC). Update resolution time or the rule.`
        );
      }
      const closeTime = parseUtcDateTime(createForm.closeTime);
      const resolutionTime = isStablecoinContractVersion(contractVersion) ? parseUtcDateTime(createForm.resolutionTime) : closeTime;
      const contractResolutionRule =
        contractVersion === "v4"
          ? resolutionRuleForContract({
              question,
              category,
              closeTime: createForm.closeTime,
              resolutionTime: createForm.resolutionTime || createForm.closeTime,
              resolutionSource,
              resolutionRule,
              fallbackSource
            })
          : resolutionRule;
      const earliestCloseTime = BigInt(Math.floor(Date.now() / 1000) + 5 * 60);
      if (closeTime <= earliestCloseTime) {
        throw new Error("Close time must be at least 5 minutes after the current UTC time.");
      }
      if (resolutionTime < closeTime) throw new Error("Resolution time cannot be earlier than close time.");

      await switchToArc();
      const walletClient = getActiveWalletClient();

      let completed = false;
      let createdMarketId: number | null = null;
      let createdSettlementSymbol = defaultSettlementSymbol;
      let createdSettlementDecimals = defaultSettlementDecimals;

      const useLegacyCreate = contractVersion === "legacy" || (contractVersion === "unknown" && creatorBond === 0n);

      if (isStablecoinContractVersion(contractVersion)) {
        const settlementToken =
          isAddress(createForm.settlementToken) ? createForm.settlementToken as Address : defaultSettlementToken as Address;
        if (!isAddress(settlementToken)) throw new Error("Settlement token is not configured for this contract.");
        const asset = await withRpcRetry(() => getPublicClient().readContract({
          address: contractAddress,
          abi: arcPredictionMarketV3Abi,
          functionName: "assetConfigs",
          args: [settlementToken]
        }));
        if (!asset[0]) throw new Error("Selected settlement token is not enabled in the contract.");
        createdSettlementSymbol = String(asset[1] || "TOKEN");
        createdSettlementDecimals = Number(asset[2] || V3_STABLECOIN_DECIMALS);
        const createCost = asset[4] + asset[6];
        const tokenBalance = await withRpcRetry(() => getPublicClient().readContract({
          address: settlementToken,
          abi: settlementTokenAbi,
          functionName: "balanceOf",
          args: [account as Address]
        }));
        if (tokenBalance < createCost) {
          throw new Error(
            `Not enough ${createdSettlementSymbol} to create this market. Need ${formatUsdc(
              createCost,
              createdSettlementDecimals
            )} ${createdSettlementSymbol}, wallet has ${formatUsdc(tokenBalance, createdSettlementDecimals)} ${createdSettlementSymbol}.`
          );
        }
        const allowance = await withRpcRetry(() => getPublicClient().readContract({
          address: settlementToken,
          abi: settlementTokenAbi,
          functionName: "allowance",
          args: [account as Address, contractAddress]
        }));
        if (allowance < createCost) {
          const approved = await runTransaction(
            () =>
              walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: settlementToken,
                abi: settlementTokenAbi,
                functionName: "approve",
                args: [contractAddress, createCost]
              }),
            `Approving ${formatUsdc(createCost, createdSettlementDecimals)} ${createdSettlementSymbol} for market creation...`,
            false
          );
          if (!approved) return;
        }
        completed = await runTransaction(
          () =>
            contractVersion === "v4"
              ? walletClient.writeContract({
                  account: account as Address,
                  chain: arcTestnet,
                  address: contractAddress,
                  abi: arcPredictionMarketV4Abi,
                  functionName: "createMarket",
                  args: [
                    question,
                    category,
                    settlementToken,
                    closeTime,
                    resolutionTime,
                    resolutionSource,
                    fallbackSource,
                    contractResolutionRule,
                    Number(createForm.resolutionMode),
                    ZERO_ADDRESS
                  ]
                })
              : walletClient.writeContract({
                  account: account as Address,
                  chain: arcTestnet,
                  address: contractAddress,
                  abi: arcPredictionMarketV3Abi,
                  functionName: "createMarket",
                  args: [
                    question,
                    category,
                    settlementToken,
                    closeTime,
                    resolutionTime,
                    keccak256(stringToHex(JSON.stringify({
                      question,
                      category,
                      resolutionSource,
                      resolutionRule: contractResolutionRule,
                      fallbackSource,
                      closeTime: closeTime.toString(),
                      resolutionTime: resolutionTime.toString()
                    }))),
                    resolutionSource,
                    Number(createForm.resolutionMode)
                  ]
                }),
          `Creating market with ${formatUsdc(createCost, createdSettlementDecimals)} ${createdSettlementSymbol} locked/charged...`,
          false,
          (receipt) => {
            const createdEvent = receipt.logs
              .map((log) => {
                try {
                  return decodeEventLog({
                    abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
                    data: log.data,
                    topics: log.topics
                  });
                } catch {
                  return null;
                }
              })
              .find((event) => event?.eventName === "MarketCreated");
            const args = createdEvent?.args as { marketId?: bigint } | undefined;
            if (args?.marketId !== undefined) createdMarketId = Number(args.marketId);
          }
        );
      } else if (useLegacyCreate) {
        const legacyCreateAbi = [
          {
            type: "function",
            name: "createMarket",
            stateMutability: "nonpayable",
            inputs: [
              { type: "string", name: "question" },
              { type: "string", name: "category" },
              { type: "uint256", name: "closeTime" }
            ],
            outputs: [{ type: "uint256", name: "marketId" }]
          }
        ] as const;
        completed = await runTransaction(
          () =>
            walletClient.writeContract({
              account: account as Address,
              chain: arcTestnet,
              address: contractAddress,
              abi: legacyCreateAbi,
              functionName: "createMarket",
              args: [question, category, closeTime]
            }),
          "Creating legacy market...",
          false,
          (receipt) => {
            const createdEvent = receipt.logs
              .map((log) => {
                try {
                  return decodeEventLog({
                    abi: arcPredictionMarketAbi,
                    data: log.data,
                    topics: log.topics
                  });
                } catch {
                  return null;
                }
              })
              .find((event) => event?.eventName === "MarketCreated");
            const args = createdEvent?.args as { marketId?: bigint } | undefined;
            if (args?.marketId !== undefined) createdMarketId = Number(args.marketId);
          }
        );
      } else {
        const createCost = creatorBond + marketCreationFee;
        completed = await runTransaction(
          () =>
            walletClient.writeContract({
              account: account as Address,
              chain: arcTestnet,
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "createMarket",
              args: [question, category, closeTime],
              value: createCost
            }),
          marketCreationFee > 0n
            ? `Creating market with ${formatUsdc(creatorBond, createdSettlementDecimals)} ${createdSettlementSymbol} bond and ${formatUsdc(marketCreationFee, createdSettlementDecimals)} ${createdSettlementSymbol} creation fee...`
            : `Creating market with ${formatUsdc(creatorBond, createdSettlementDecimals)} ${createdSettlementSymbol} creator bond...`,
          false,
          (receipt) => {
            const createdEvent = receipt.logs
              .map((log) => {
                try {
                  return decodeEventLog({
                    abi: arcPredictionMarketAbi,
                    data: log.data,
                    topics: log.topics
                  });
                } catch {
                  return null;
                }
              })
              .find((event) => event?.eventName === "MarketCreated");
            const args = createdEvent?.args as { marketId?: bigint } | undefined;
            if (args?.marketId !== undefined) createdMarketId = Number(args.marketId);
          }
        );
      }

      if (!completed) return;

      const optimisticMarket: MarketView = {
        id: createdMarketId ?? knownMarketCount,
        question,
        category,
        createdAt: Math.floor(Date.now() / 1000),
        closeTime: Number(closeTime),
        resolutionTime: Number(resolutionTime),
        settlementToken: isStablecoinContractVersion(contractVersion) ? (createForm.settlementToken || defaultSettlementToken) : undefined,
        settlementSymbol: isStablecoinContractVersion(contractVersion) ? createdSettlementSymbol : "USDC",
        settlementDecimals: isStablecoinContractVersion(contractVersion) ? createdSettlementDecimals : ARC_NATIVE_USDC_DECIMALS,
        resolutionMode: isStablecoinContractVersion(contractVersion) ? Number(createForm.resolutionMode) : undefined,
        metadataURI: isStablecoinContractVersion(contractVersion) ? resolutionSource : undefined,
        fallbackSourceURI: contractVersion === "v4" ? fallbackSource : undefined,
        resolutionRule: contractVersion === "v4" ? contractResolutionRule : undefined,
        termsDisputeGracePeriod: isStablecoinContractVersion(contractVersion) ? disputeGracePeriod : undefined,
        creator: account,
        resolver: account,
        yesPool: 0n,
        noPool: 0n,
        traderCount: 0,
        proposedOutcome: Outcome.Unresolved,
        proposedAt: 0,
        disputeDeadline: 0,
        disputed: false,
        disputer: "0x0000000000000000000000000000000000000000",
        outcome: Outcome.Unresolved,
        yesPosition: 0n,
        noPosition: 0n,
        claimed: false,
        potentialPayout: 0n
      };
      setMarkets((current) =>
        current.some((market) => market.id === optimisticMarket.id || (market.question === question && sameAddress(market.creator, account)))
          ? current
          : [optimisticMarket, ...current]
      );
      setKnownMarketCount((current) => Math.max(current + 1, optimisticMarket.id + 1));
      setProjectStats((current) =>
        current
          ? {
              ...current,
              totalMarkets: current.totalMarkets + 1,
              indexedMarkets: current.indexedMarkets + 1,
              liveMarkets: current.liveMarkets + 1,
              knownPlayers: Math.max(current.knownPlayers, uniquePlayerAddresses.size + 1)
            }
          : current
      );
      if (createdMarketId !== null) {
        const createdAtIso = new Date().toISOString();
        const sourceEvidence: MarketEvidence = {
          id: `${createdMarketId}-source-${Date.now()}`,
          marketId: createdMarketId,
          title: "Resolution source",
          url: resolutionSource,
          notes: resolutionRule,
          addedBy: account,
          createdAt: createdAtIso
        };
        const rows: MarketEvidence[] = [sourceEvidence];
        if (fallbackSource) {
          rows.push({
            id: `${createdMarketId}-fallback-${Date.now() + 1}`,
            marketId: createdMarketId,
            title: "Fallback source",
            url: fallbackSource,
            notes: "Use only if primary source is unavailable.",
            addedBy: account,
            createdAt: createdAtIso
          });
        }
        setMarketEvidence((current) => ({
          ...current,
          [String(createdMarketId)]: rows
        }));
        try {
          await Promise.all(
            rows.map((item) =>
              postIndexerJson(`/api/social/markets/${createdMarketId}/evidence`, {
                title: item.title,
                url: item.url,
                notes: item.notes,
                addedBy: item.addedBy
              })
            )
          );
        } catch {
          // Keep local evidence even if sync is temporarily unavailable.
        }
      }

      setCreateForm({
        question: "",
        category: "Crypto",
        closeTime: "",
        resolutionTime: "",
        settlementToken: "",
        resolutionMode: "0",
        resolutionSource: "",
        resolutionRule: "",
        fallbackSource: ""
      });
      setAiMarketDraft(null);
      setAuraCreateStatus("idle");
      setDuplicateAcknowledged(false);
      setCreateModalOpen(false);
      setView("markets");
      setActiveCategory("All");
      setNotice("Market created. It is shown locally now and will sync to the public indexer shortly.");
      window.setTimeout(() => {
        silentLoadRef.current = true;
        void loadMarkets();
      }, 90_000);
    } catch (error) {
      setNotice(compactErrorMessage(error));
    }
  };

  const placeBet = async (marketId: number, side: Outcome) => {
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
      const market = markets.find((item) => item.id === marketId);
      const amountDecimals = isStablecoinContractVersion(contractVersion) ? marketDecimals(market) : ARC_NATIVE_USDC_DECIMALS;
      const amount = stakeInputs[marketId] || "";
      const value = parseUsdcInput(amount, amountDecimals);
      if (!market) throw new Error("Market not found.");
      if (value <= 0n) throw new Error("Enter a valid amount.");
      if (!isStablecoinContractVersion(contractVersion) && walletBalance > 0n && value > walletBalance) {
        throw new Error("Stake amount is higher than your wallet balance.");
      }

      await switchToArc();
      const walletClient = getActiveWalletClient();

      if (isStablecoinContractVersion(contractVersion)) {
        const token = market?.settlementToken as Address;
        if (!token || !isAddress(token)) throw new Error("Market settlement token is unavailable.");
        const tokenBalance = await withRpcRetry(() => getPublicClient().readContract({
          address: token,
          abi: settlementTokenAbi,
          functionName: "balanceOf",
          args: [account as Address]
        }));
        if (value > tokenBalance) {
          throw new Error(
            `Stake amount is higher than your wallet ${marketSymbol(market)} balance. Wallet has ${formatMarketAmount(
              tokenBalance,
              market
            )} ${marketSymbol(market)}.`
          );
        }
        const allowance = await withRpcRetry(() => getPublicClient().readContract({
          address: token,
          abi: settlementTokenAbi,
          functionName: "allowance",
          args: [account as Address, contractAddress]
        }));
        if (allowance < value) {
          const approved = await runTransaction(
            () => walletClient.writeContract({
              account: account as Address,
              chain: arcTestnet,
              address: token,
              abi: settlementTokenAbi,
              functionName: "approve",
              args: [contractAddress, value]
            }),
            `Approving ${formatMarketAmount(value, market)} ${marketSymbol(market)} stake...`,
            false
          );
          if (!approved) return;
        }
      }

      const completed = await runTransaction(
        () =>
          isStablecoinContractVersion(contractVersion)
            ? walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
                functionName: "bet",
                args: [BigInt(marketId), side, value]
              })
            : walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: arcPredictionMarketAbi,
                functionName: "bet",
                args: [BigInt(marketId), side],
                value
              }),
        `Staking ${amount} ${marketSymbol(market)}...`,
        false
      );
      if (completed) {
        const isNewParticipant = market ? market.yesPosition + market.noPosition === 0n : false;
        const nowSeconds = Math.floor(Date.now() / 1000);
        const isLiveMarket =
          Boolean(market) && market?.outcome === Outcome.Unresolved && market.closeTime > nowSeconds;

        setMarkets((current) =>
          current.map((item) => {
            if (item.id !== marketId) return item;
            return {
              ...item,
              yesPool: side === Outcome.Yes ? item.yesPool + value : item.yesPool,
              noPool: side === Outcome.No ? item.noPool + value : item.noPool,
              traderCount: isNewParticipant ? item.traderCount + 1 : item.traderCount,
              yesPosition: side === Outcome.Yes ? item.yesPosition + value : item.yesPosition,
              noPosition: side === Outcome.No ? item.noPosition + value : item.noPosition
            };
          })
        );
        setProjectStats((current) =>
          current
            ? {
                ...current,
                totalVolume: current.totalVolume + value,
                liveLiquidity: isLiveMarket ? current.liveLiquidity + value : current.liveLiquidity,
                averageMarketVolume:
                  current.totalMarkets > 0 ? (current.totalVolume + value) / BigInt(current.totalMarkets) : 0n,
                participantEntries: isNewParticipant ? current.participantEntries + 1 : current.participantEntries,
                knownPlayers:
                  account &&
                  !activities.some((activity) => activity.user.toLowerCase() === account.toLowerCase()) &&
                  !markets.some((item) => item.creator.toLowerCase() === account.toLowerCase())
                    ? current.knownPlayers + 1
                    : current.knownPlayers
              }
            : current
        );
        setActivities((current) => [
          {
            id: `local-${Date.now()}-${marketId}-${side}`,
            user: account,
            marketId,
            question: market?.question ?? `Market #${marketId}`,
            side,
            amount: value,
            timestamp: Math.floor(Date.now() / 1000)
          },
          ...current
        ].slice(0, 100));
        setStakeInputs((current) => ({ ...current, [marketId]: "" }));
        window.setTimeout(() => {
          silentLoadRef.current = true;
          void loadMarkets();
        }, 90_000);
      }
    } catch (error) {
      setNotice(compactErrorMessage(error));
    }
  };

  const resolveMarket = async (
    marketId: number,
    outcome: Outcome,
    skipMismatchConfirm = false,
    options?: { source?: "manual" | "ai" | "oracle" }
  ) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    if (isMarketActionPending("resolve", marketId)) return;
    const market = markets.find((item) => item.id === marketId);
    if (market && requiresCancelForLiquidity(market)) {
      setNotice("This market is cancel-only because both YES and NO were not funded. Use Cancel to refund positions.");
      return;
    }
    const source = options?.source ?? "manual";
    const auraStatus = auraResolutionStatusByMarket[marketId] || "idle";
    const aiReceipt = aiResolutionReceipts[String(marketId)];
    const aiSuggestedOutcome = aiOutcomeFromReceipt(aiReceipt);
    const hasAiSuggestion = aiSuggestedOutcome === Outcome.Yes || aiSuggestedOutcome === Outcome.No;
    if (source !== "oracle" && auraStatus === "idle" && !hasAiSuggestion) {
      throw new Error("Ask Aura Agent before proposing. If Aura is unavailable, manual propose will be unlocked.");
    }
    const mismatchWithAi = hasAiSuggestion && aiSuggestedOutcome !== outcome;
    if (mismatchWithAi && !skipMismatchConfirm) {
      setMismatchConfirm({
        marketId,
        outcome,
        aiSuggestedOutcome: aiSuggestedOutcome as Outcome.Yes | Outcome.No
      });
      return;
    }
    await switchToArc();
    const walletClient = getActiveWalletClient();
    const evidenceHash = keccak256(stringToHex(JSON.stringify(marketEvidence[String(marketId)] || [])));
    const storedReceiptHash =
      typeof aiReceipt?.receiptHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(aiReceipt.receiptHash)
        ? aiReceipt.receiptHash as Hash
        : ZERO_HASH as Hash;
    const signedAiSuggestion =
      contractVersion === "v4" &&
      hasAiSuggestion &&
      storedReceiptHash !== ZERO_HASH &&
      typeof aiReceipt?.attestation === "string" &&
      /^0x[a-fA-F0-9]{130}$/.test(aiReceipt.attestation);
    setMarketActionPending("resolve", marketId, true);
    try {
      const success = await runTransaction(
        () =>
          contractVersion === "v4" && signedAiSuggestion
            ? walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: arcPredictionMarketV4Abi,
                functionName: "resolveWithAiAttestation",
                args: [
                  BigInt(marketId),
                  outcome,
                  evidenceHash,
                  storedReceiptHash,
                  aiSuggestedOutcome as Outcome.Yes | Outcome.No,
                  aiReceipt!.attestation as `0x${string}`
                ]
              })
            : isStablecoinContractVersion(contractVersion)
            ? walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
                functionName: "resolve",
                args: [BigInt(marketId), outcome, evidenceHash, storedReceiptHash]
              })
            : walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: arcPredictionMarketAbi,
                functionName: "resolve",
                args: [BigInt(marketId), outcome]
              }),
        "Proposing market result...",
        true,
        (receipt) => {
          const proposedEvent = receipt.logs
            .map((log) => {
              try {
                return decodeEventLog({
                  abi: isStablecoinContractVersion(contractVersion)
                    ? contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi
                    : arcPredictionMarketAbi,
                  data: log.data,
                  topics: log.topics
                });
              } catch {
                return null;
              }
            })
            .find((event) => event?.eventName === "MarketResultProposed");
          const args = proposedEvent?.args as
            | { marketId?: bigint; outcome?: number; disputeDeadline?: bigint }
            | undefined;
          markMarketResultProposed(
            Number(args?.marketId ?? BigInt(marketId)),
            Number(args?.outcome ?? outcome) as Outcome,
            Number(args?.disputeDeadline ?? 0n)
          );
        }
      );
      if (mismatchWithAi) {
        setNotice(
          `You proposed ${outcomeLabel(outcome)} against AI suggestion ${outcomeLabel(
            aiSuggestedOutcome
          )}. Owner was notified for review.`
        );
      }
      if (success) setNotificationMenuOpen(false);
    } finally {
      setMarketActionPending("resolve", marketId, false);
    }
  };

  const disputeMarket = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    const market = markets.find((item) => item.id === marketId);
    const requiredBond = isStablecoinContractVersion(contractVersion) ? market?.termsDisputeBond ?? disputeBond : disputeBond;
    if (requiredBond <= 0n) throw new Error("Dispute bond is not loaded. Refresh contract data first.");
    await switchToArc();
    const walletClient = getActiveWalletClient();
    if (isStablecoinContractVersion(contractVersion)) {
      const token = market?.settlementToken as Address;
      if (!token || !isAddress(token)) throw new Error("Market settlement token is unavailable.");
      const tokenBalance = await withRpcRetry(() => getPublicClient().readContract({
        address: token,
        abi: settlementTokenAbi,
        functionName: "balanceOf",
        args: [account as Address]
      }));
      if (tokenBalance < requiredBond) {
        throw new Error(
          `Not enough ${marketSymbol(market)} to dispute this market. Need ${formatMarketAmount(
            requiredBond,
            market
          )} ${marketSymbol(market)}, wallet has ${formatMarketAmount(tokenBalance, market)} ${marketSymbol(market)}.`
        );
      }
      const allowance = await withRpcRetry(() => getPublicClient().readContract({
        address: token,
        abi: settlementTokenAbi,
        functionName: "allowance",
        args: [account as Address, contractAddress]
      }));
      if (allowance < requiredBond) {
        const approved = await runTransaction(
          () => walletClient.writeContract({
            account: account as Address,
            chain: arcTestnet,
            address: token,
            abi: settlementTokenAbi,
            functionName: "approve",
            args: [contractAddress, requiredBond]
          }),
          `Approving ${formatMarketAmount(requiredBond, market)} ${marketSymbol(market)} dispute bond...`
        );
        if (!approved) return;
      }
    }
    await runTransaction(
      () =>
        isStablecoinContractVersion(contractVersion)
          ? walletClient.writeContract({
              account: account as Address,
              chain: arcTestnet,
              address: contractAddress,
              abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
              functionName: "dispute",
              args: [BigInt(marketId)]
            })
          : walletClient.writeContract({
              account: account as Address,
              chain: arcTestnet,
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "dispute",
              args: [BigInt(marketId)],
              value: requiredBond
            }),
      `Disputing result with ${formatMarketAmount(requiredBond, market)} ${marketSymbol(market)} bond...`
    );
  };

  const finalizeMarket = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    if (isMarketActionPending("finalize", marketId)) return;
    await switchToArc();
    const walletClient = getActiveWalletClient();
    setMarketActionPending("finalize", marketId, true);
    try {
      const fallbackOutcome = markets.find((market) => market.id === marketId)?.proposedOutcome ?? Outcome.Unresolved;
      await runTransaction(
        () =>
          walletClient.writeContract({
            account: account as Address,
            chain: arcTestnet,
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "finalize",
            args: [BigInt(marketId)]
          }),
        "Finalizing market result...",
        true,
        (receipt) => {
          const resolvedEvent = receipt.logs
            .map((log) => {
              try {
                return decodeEventLog({
                  abi: arcPredictionMarketAbi,
                  data: log.data,
                  topics: log.topics
                });
              } catch {
                return null;
              }
            })
            .find((event) => event?.eventName === "MarketResolved");
          const args = resolvedEvent?.args as { marketId?: bigint; outcome?: number } | undefined;
          markMarketFinalized(Number(args?.marketId ?? BigInt(marketId)), Number(args?.outcome ?? fallbackOutcome) as Outcome);
        }
      );
    } finally {
      setMarketActionPending("finalize", marketId, false);
    }
  };

  const finalizeDispute = async (marketId: number, outcome: Outcome) => {
    if (!account || !isAddress(account)) throw new Error("Connect resolution authority wallet first.");
    if (isMarketActionPending("finalize-dispute", marketId)) return;
    const market = markets.find((item) => item.id === marketId);
    if (market && requiresCancelForLiquidity(market) && outcome !== Outcome.Canceled) {
      setNotice("This market is cancel-only because both YES and NO were not funded. Use Final Cancel to refund positions.");
      return;
    }
    await switchToArc();
    const walletClient = getActiveWalletClient();
    const aiReceipt = aiResolutionReceipts[String(marketId)];
    const evidenceHash = keccak256(stringToHex(JSON.stringify(marketEvidence[String(marketId)] || [])));
    const receiptHash =
      typeof aiReceipt?.receiptHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(aiReceipt.receiptHash)
        ? aiReceipt.receiptHash as Hash
        : ZERO_HASH as Hash;
    setMarketActionPending("finalize-dispute", marketId, true);
    try {
      await runTransaction(
        () =>
          isStablecoinContractVersion(contractVersion)
            ? walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
                functionName: "finalizeDispute",
                args: [BigInt(marketId), outcome, evidenceHash, receiptHash]
              })
            : walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: arcPredictionMarketAbi,
                functionName: "finalizeDispute",
                args: [BigInt(marketId), outcome]
              }),
        "Finalizing disputed market...",
        true,
        () => markMarketFinalized(marketId, outcome)
      );
    } finally {
      setMarketActionPending("finalize-dispute", marketId, false);
    }
  };

  const cancelStaleDispute = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    if (isMarketActionPending("stale-dispute", marketId)) return;
    await switchToArc();
    const walletClient = getActiveWalletClient();
    setMarketActionPending("stale-dispute", marketId, true);
    try {
      await runTransaction(
        () =>
          walletClient.writeContract({
            account: account as Address,
            chain: arcTestnet,
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "cancelStaleDispute",
            args: [BigInt(marketId)]
          }),
        `Canceling stale dispute for Market #${marketId}...`,
        true,
        (receipt) => {
          const resolvedEvent = receipt.logs
            .map((log) => {
              try {
                return decodeEventLog({
                  abi: arcPredictionMarketAbi,
                  data: log.data,
                  topics: log.topics
                });
              } catch {
                return null;
              }
            })
            .find((event) => event?.eventName === "MarketResolved");
          const args = resolvedEvent?.args as { marketId?: bigint; outcome?: number } | undefined;
          markMarketFinalized(Number(args?.marketId ?? BigInt(marketId)), Number(args?.outcome ?? Outcome.Canceled) as Outcome);
        }
      );
    } finally {
      setMarketActionPending("stale-dispute", marketId, false);
    }
  };

  const cancelUnproposedMarket = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    if (contractVersion !== "v4" || isMarketActionPending("unproposed-cancel", marketId)) return;
    await switchToArc();
    const walletClient = getActiveWalletClient();
    setMarketActionPending("unproposed-cancel", marketId, true);
    try {
      await runTransaction(
        () =>
          walletClient.writeContract({
            account: account as Address,
            chain: arcTestnet,
            address: contractAddress,
            abi: arcPredictionMarketV4Abi,
            functionName: "cancelUnproposedMarket",
            args: [BigInt(marketId)]
          }),
        "Canceling timed-out unresolved market for refunds...",
        true,
        () => markMarketFinalized(marketId, Outcome.Canceled)
      );
    } finally {
      setMarketActionPending("unproposed-cancel", marketId, false);
    }
  };

  const cancelMarket = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    if (isMarketActionPending("resolve", marketId)) return;
    await switchToArc();
    const walletClient = getActiveWalletClient();
    const market = markets.find((item) => item.id === marketId);
    const aiReceipt = aiResolutionReceipts[String(marketId)];
    const evidenceHash = keccak256(stringToHex(JSON.stringify(marketEvidence[String(marketId)] || [])));
    const receiptHash =
      typeof aiReceipt?.receiptHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(aiReceipt.receiptHash)
        ? aiReceipt.receiptHash as Hash
        : ZERO_HASH as Hash;
    setMarketActionPending("resolve", marketId, true);
    try {
      const success = await runTransaction(
        () =>
          isStablecoinContractVersion(contractVersion) && market && hasNoLiquidity(market)
            ? walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
                functionName: "cancelEmptyMarket",
                args: [BigInt(marketId)]
              })
            : isStablecoinContractVersion(contractVersion)
              ? walletClient.writeContract({
                  account: account as Address,
                  chain: arcTestnet,
                  address: contractAddress,
                  abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
                  functionName: "cancel",
                  args: [BigInt(marketId), evidenceHash, receiptHash]
                })
              : walletClient.writeContract({
                  account: account as Address,
                  chain: arcTestnet,
                  address: contractAddress,
                  abi: arcPredictionMarketAbi,
                  functionName: "cancel",
                  args: [BigInt(marketId)]
                }),
        isStablecoinContractVersion(contractVersion) && market && hasNoLiquidity(market)
          ? "Canceling empty market and releasing creator bond..."
          : "Proposing market cancel...",
        true,
        (receipt) => {
          if (isStablecoinContractVersion(contractVersion) && market && hasNoLiquidity(market)) {
            markMarketFinalized(marketId, Outcome.Canceled);
            return;
          }
          const proposedEvent = receipt.logs
            .map((log) => {
              try {
                return decodeEventLog({
                  abi: isStablecoinContractVersion(contractVersion)
                    ? contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi
                    : arcPredictionMarketAbi,
                  data: log.data,
                  topics: log.topics
                });
              } catch {
                return null;
              }
            })
            .find((event) => event?.eventName === "MarketResultProposed");
          const args = proposedEvent?.args as
            | { marketId?: bigint; outcome?: number; disputeDeadline?: bigint }
            | undefined;
          markMarketResultProposed(
            Number(args?.marketId ?? BigInt(marketId)),
            Number(args?.outcome ?? Outcome.Canceled) as Outcome,
            Number(args?.disputeDeadline ?? 0n)
          );
        }
      );
      if (success) setNotificationMenuOpen(false);
    } finally {
      setMarketActionPending("resolve", marketId, false);
    }
  };

  const claim = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    await switchToArc();
    const walletClient = getActiveWalletClient();
    await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "claim",
          args: [BigInt(marketId)]
        }),
      "Claiming payout..."
    );
  };

  const withdrawPendingBalance = async (market: MarketView) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    if (!isStablecoinContractVersion(contractVersion) || !market.settlementToken || !isAddress(market.settlementToken)) return;
    await switchToArc();
    const walletClient = getActiveWalletClient();
    const completed = await runTransaction(
      () => walletClient.writeContract({
        account: account as Address,
        chain: arcTestnet,
        address: contractAddress,
        abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
        functionName: "withdrawBalance",
        args: [market.settlementToken as Address]
      }),
      `Withdrawing pending ${marketSymbol(market)} balance...`
    );
    if (completed) {
      setPendingWithdrawalsByToken((current) => ({ ...current, [market.settlementToken!.toLowerCase()]: 0n }));
      void refreshWalletBalance();
    }
  };

  const requestAuthorityReview = async (market: MarketView) => {
    if (!account || !isAddress(account)) throw new Error("Connect authority wallet first.");
    if (!isStablecoinContractVersion(contractVersion)) return;
    const aiReceipt = aiResolutionReceipts[String(market.id)];
    const reasonHash = keccak256(stringToHex(JSON.stringify({
      proposedOutcome: market.proposedOutcome,
      aiSuggestion: aiOutcomeFromReceipt(aiReceipt),
      receiptHash: aiReceipt?.receiptHash || ""
    })));
    await switchToArc();
    const walletClient = getActiveWalletClient();
    const completed = await runTransaction(
      () => walletClient.writeContract({
        account: account as Address,
        chain: arcTestnet,
        address: contractAddress,
        abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi,
        functionName: "requestAuthorityReview",
        args: [BigInt(market.id), reasonHash]
      }),
      "Flagging proposal for authority review..."
    );
    if (completed) {
      setMarkets((current) => current.map((item) => item.id === market.id ? { ...item, authorityReviewRequired: true } : item));
    }
  };

  const claimAll = async () => {
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
      if (claimNotifications.length === 0) {
        setNotice("No claimable payouts right now.");
        return;
      }

      await switchToArc();
      const walletClient = getActiveWalletClient();
      for (const [index, market] of claimNotifications.entries()) {
        const completed = await runTransaction(
          () =>
            walletClient.writeContract({
              account: account as Address,
              chain: arcTestnet,
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "claim",
              args: [BigInt(market.id)]
            }),
          `Claiming payout ${index + 1}/${claimNotifications.length} from Market #${market.id}...`
        );
        if (!completed) break;
      }
    } catch (error) {
      setNotice(compactErrorMessage(error));
    }
  };

  const withdrawFees = async (token?: string) => {
    if (!account || !isAddress(account)) throw new Error("Connect owner wallet first.");
    if (!owner || !sameAddress(account, owner)) throw new Error("Only the protocol owner can withdraw fees.");
    const targetToken = token && isAddress(token) ? token as Address : defaultSettlementToken as Address;
    if (isStablecoinContractVersion(contractVersion) && !isAddress(targetToken)) {
      throw new Error("Fee token is not configured.");
    }
    const asset = knownSettlementTokens.find((item) => sameAddress(item.token, targetToken));
    await switchToArc();
    const walletClient = getActiveWalletClient();
    const completed = await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: contractVersion === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketAbi,
          functionName: "withdrawProtocolFees",
          args: isStablecoinContractVersion(contractVersion)
            ? [targetToken, account as Address, 0n]
            : [account as Address, 0n]
        }),
      `Withdrawing ${asset?.symbol || defaultSettlementSymbol} protocol fees...`
    );
    if (completed && isAddress(targetToken)) {
      setProtocolFeesByToken((current) => ({ ...current, [targetToken.toLowerCase()]: 0n }));
      if (sameAddress(targetToken, defaultSettlementToken)) setAccumulatedProtocolFees(0n);
      void refreshWalletBalance();
    }
  };

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccounts = (accounts: unknown) => {
      const next = Array.isArray(accounts) ? String(accounts[0] || "") : "";
      if (next) {
        const remembered = window.localStorage.getItem(WALLET_CONNECTED_KEY) === "true";
        if (!remembered) {
          setAccount("");
          setWalletBalance(0n);
          setWalletMenuOpen(false);
          return;
        }
        registerUser(next);
        void refreshWalletBalance(next);
        setAccount(next);
      } else {
        window.localStorage.removeItem(WALLET_CONNECTED_KEY);
        window.localStorage.setItem(WALLET_DISCONNECTED_KEY, "true");
        setWalletMenuOpen(false);
        setWalletBalance(0n);
        setAccount("");
      }
    };

    const handleChainChanged = () => {
      void refreshNetworkState(window.ethereum ?? null);
    };

    window.ethereum.on?.("accountsChanged", handleAccounts);
    window.ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccounts);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [refreshNetworkState, refreshWalletBalance, registerUser]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    let mounted = true;

    async function restoreWallet() {
      try {
        const remembered = window.localStorage.getItem(WALLET_CONNECTED_KEY) === "true";
        const manuallyDisconnected = window.localStorage.getItem(WALLET_DISCONNECTED_KEY) === "true";
        if (!remembered || manuallyDisconnected) return;

        const accounts = await getInjectedProvider().request({ method: "eth_accounts" });
        const next = Array.isArray(accounts) ? String(accounts[0] || "") : "";
        if (!mounted || !next) return;

        setSelectedWalletProvider(window.ethereum ?? null);
        const walletClient = getWalletClient(window.ethereum ?? null);
        const chainId = await walletClient.getChainId();
        setAccount(next);
        registerUser(next);
        void refreshWalletBalance(next);
        window.localStorage.setItem(WALLET_CONNECTED_KEY, "true");
        window.localStorage.removeItem(WALLET_DISCONNECTED_KEY);

        if (BigInt(chainId) !== ARC_CHAIN_ID_DECIMAL) {
          setIsArcNetwork(false);
          setNotice("Wallet connected but not on Arc Testnet. Use Switch Network in the wallet menu.");
        } else {
          setIsArcNetwork(true);
        }
      } catch (error) {
        if (mounted) setNotice(`Reconnect failed: ${errorMessage(error)}`);
      }
    }

    restoreWallet();

    return () => {
      mounted = false;
    };
  }, [refreshWalletBalance, registerUser]);

  useEffect(() => {
    const syncRoute = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const profileParam = searchParams.get(PROFILE_QUERY_KEY);
      if (profileParam && isAddress(profileParam)) {
        const sharedName = searchParams.get(PROFILE_NAME_QUERY_KEY)?.trim().replace(/\s+/g, " ").slice(0, 24);
        if (sharedName && sharedName.length >= 2) {
          const profileKey = profileParam.toLowerCase();
          setProfileNames((current) => {
            if (current[profileKey] === sharedName) return current;
            const next = { ...current, [profileKey]: sharedName };
            window.localStorage.setItem(PROFILE_NAMES_KEY, JSON.stringify(next));
            return next;
          });
        }
        setSelectedMarketId(null);
        setSelectedProfileAddress(profileParam);
        setView("profile");
        return;
      }

      const marketParam = searchParams.get(MARKET_QUERY_KEY);
      if (!marketParam) {
        setSelectedMarketId(null);
        setSelectedProfileAddress("");
        setView("markets");
        return;
      }
      const marketId = Number(marketParam);
      if (!Number.isInteger(marketId) || marketId < 0) return;

      setSelectedMarketId(marketId);
      setSelectedProfileAddress("");
      setView("market");
    };

    syncRoute();
    window.addEventListener("popstate", syncRoute);

    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    if (!hasMoreMarkets || loading || view === "market") return;

    const timer = window.setTimeout(() => {
      loadMoreMarkets(true);
    }, 7000);

    return () => window.clearTimeout(timer);
  }, [hasMoreMarkets, loadMoreMarkets, loading, view]);

  useEffect(() => {
    const now = new Date();
    const nextUtcHour = new Date(now);
    nextUtcHour.setUTCMinutes(0, 0, 0);
    nextUtcHour.setUTCHours(nextUtcHour.getUTCHours() + 1);

    let refreshInterval: number | undefined;
    const refreshTimeout = window.setTimeout(() => {
      loadMarkets();
      refreshInterval = window.setInterval(() => {
        loadMarkets();
      }, 60 * 60 * 1000);
    }, Math.max(1000, nextUtcHour.getTime() - now.getTime()));

    return () => {
      window.clearTimeout(refreshTimeout);
      if (refreshInterval) window.clearInterval(refreshInterval);
    };
  }, [loadMarkets]);

  const renderMarketCards = (
    items: MarketView[],
    emptyTitle: string,
    emptyText: string,
    resultSubject = "You",
    cardContext: "market" | "profile" = "market"
  ) => (
    <section className={marketViewMode === "list" ? "market-grid market-grid-list" : "market-grid"}>
      {items.length === 0 &&
        loading &&
        Array.from({ length: marketViewMode === "list" ? 2 : 6 }, (_, index) => (
          <article className="market-card market-card-skeleton" key={`market-skeleton-${index}`} aria-hidden="true">
            <span />
            <strong />
            <div />
            <div />
            <div />
          </article>
        ))}
      {items.length === 0 && !loading && (
        <div className="empty-state">
          <strong>{emptyTitle}</strong>
          <span>{emptyText}</span>
        </div>
      )}
      {items.map((market) => {
        const totalPool = marketVolume(market);
        const yesPercent = percent(market.yesPool, totalPool);
        const noPercent = 100 - yesPercent;
        const meta = categoryMeta(market.category || "Other");
        const marketImage = marketImageFor(market);
        const imageVariant = marketImageVariant(market);
        const walletResult = personalMarketResult(market, resultSubject);
        const canUseDisputeFlow = contractVersion !== "legacy";
        const resolutionReadyAt = resolutionUnlockTime(market);
        const isResolutionReady = nowSeconds >= resolutionReadyAt;
        const canPropose =
          canUseDisputeFlow &&
          account &&
          market.outcome === Outcome.Unresolved &&
          market.proposedAt === 0 &&
          isResolutionReady &&
          (market.resolutionMode === 2
            ? (!!owner && sameAddress(owner, account)) ||
              (!!market.authority && sameAddress(market.authority, account))
            : sameAddress(market.resolver, account) ||
              (!!owner && sameAddress(owner, account)) ||
              (!!(market.authority || resolutionAuthority) && sameAddress(market.authority || resolutionAuthority, account)));
        const canBet =
          account &&
          market.outcome === Outcome.Unresolved &&
          market.proposedAt === 0 &&
          Date.now() / 1000 < market.closeTime;
        const canDispute =
          canUseDisputeFlow &&
          account &&
          market.outcome === Outcome.Unresolved &&
          market.proposedAt > 0 &&
          !market.disputed &&
          market.disputeDeadline > 0 &&
          Date.now() / 1000 < market.disputeDeadline &&
          hasUserPosition(market);
        const canFinalize =
          canUseDisputeFlow &&
          account &&
          market.outcome === Outcome.Unresolved &&
          market.proposedAt > 0 &&
          !market.disputed &&
          !market.authorityReviewRequired &&
          market.disputeDeadline > 0 &&
          Date.now() / 1000 >= market.disputeDeadline;
        const canFinalizeDispute =
          canUseDisputeFlow &&
          account &&
          market.outcome === Outcome.Unresolved &&
          (market.disputed || Boolean(market.authorityReviewRequired)) &&
          ((!!owner && sameAddress(account, owner)) ||
            (!!(market.authority || resolutionAuthority) && sameAddress(account, market.authority || resolutionAuthority)));
        const canCancelStaleDispute =
          canUseDisputeFlow &&
          account &&
          market.outcome === Outcome.Unresolved &&
          (market.disputed || Boolean(market.authorityReviewRequired)) &&
          market.disputeDeadline > 0 &&
          (market.termsDisputeGracePeriod ?? disputeGracePeriod) > 0 &&
          Date.now() / 1000 >= market.disputeDeadline + (market.termsDisputeGracePeriod ?? disputeGracePeriod);
        const canClaim = account && market.potentialPayout > 0n && !market.claimed;
        const canLegacyResolve =
          contractVersion === "legacy" &&
          account &&
          market.outcome === Outcome.Unresolved &&
          isResolutionReady &&
          [market.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());
        const cancelOnlyResolution = isResolutionReady && requiresCancelForLiquidity(market);
        const canProposeYes = !cancelOnlyResolution && market.yesPool > 0n;
        const canProposeNo = !cancelOnlyResolution && market.noPool > 0n;
        const proposeHint = resolveActionHint(market);
        const finalizeHint = finalizeWaitingHint(market);
        const aiReceipt = aiResolutionReceipts[String(market.id)];
        const aiSuggestedOutcome = aiOutcomeFromReceipt(aiReceipt);
        const aiCanPropose = aiSuggestedOutcome === Outcome.Yes || aiSuggestedOutcome === Outcome.No;
        const aiSuggestionBlockedByPool =
          (aiSuggestedOutcome === Outcome.Yes && !canProposeYes) ||
          (aiSuggestedOutcome === Outcome.No && !canProposeNo);
        const isProfileCard = cardContext === "profile";
        const profileResolutionAction =
          isProfileCard &&
          (Boolean(canPropose) ||
            Boolean(canLegacyResolve) ||
            Boolean(canDispute) ||
            Boolean(canFinalize) ||
            Boolean(canFinalizeDispute) ||
            Boolean(canCancelStaleDispute));
        const profileResolutionTitle = canPropose || canLegacyResolve
          ? "Result needed"
          : canDispute
            ? "Dispute available"
            : canFinalize || canFinalizeDispute || canCancelStaleDispute
              ? "Final action needed"
              : "Resolution action";
        const profileResolutionText = canPropose || canLegacyResolve
          ? "This market has reached resolution time. Open the market page to review Aura, Oracle, source evidence, and propose the result."
          : canDispute
            ? "A result has been proposed. Open the market page to review the report and dispute from the settlement panel if needed."
            : canFinalize || canFinalizeDispute || canCancelStaleDispute
              ? "This market needs a final settlement action. Open the market page to review the settlement report before acting."
              : "Open the market page to continue settlement.";
        const pendingTokenWithdrawal = market.settlementToken
          ? pendingWithdrawalsByToken[market.settlementToken.toLowerCase()] || 0n
          : 0n;
        const cardCreatorBond = market.termsCreatorBond ?? creatorBond;
        const showProfileBondReturn =
          isProfileCard &&
          Boolean(account) &&
          sameAddress(account, market.creator) &&
          market.outcome !== Outcome.Unresolved &&
          cardCreatorBond > 0n &&
          pendingTokenWithdrawal > 0n;
        const marketCardClasses = [
          "market-card",
          "interactive-market-card",
          isProfileCard ? "profile-market-card" : "",
          profileResolutionAction ? "profile-needs-resolution" : "",
          showProfileBondReturn ? "profile-pending-bond" : ""
        ]
          .filter(Boolean)
          .join(" ");
        const marketSymbolLabel = marketSymbol(market);
        const statusLabel = marketStatus(market);
        const cardFocusResolution = Boolean(profileResolutionAction || showProfileBondReturn);
        const actionHintTitle = profileResolutionAction
          ? profileResolutionTitle
          : showProfileBondReturn
            ? "Creator bond pending"
            : canClaim
              ? "Payout available"
              : "";
        const actionHintText = profileResolutionAction
          ? profileResolutionText
          : showProfileBondReturn
            ? `${formatMarketAmount(cardCreatorBond, market)} ${marketSymbolLabel} creator bond is ready for this market.`
            : canClaim
              ? `Open this market to claim ${formatMarketAmount(market.potentialPayout, market)} ${marketSymbolLabel}.`
              : "";

        return (
          <article
            className={marketCardClasses}
            key={market.id}
            onClick={() => openMarket(market.id, cardFocusResolution)}
            onKeyDown={(event) => {
              if (event.key === "Enter") openMarket(market.id, cardFocusResolution);
            }}
            role="button"
            tabIndex={0}
          >
            <div className={`market-card-image compact-market-visual ${imageVariant}`}>
              <img src={marketImage} alt="" loading="lazy" />
              <div className="compact-card-header">
                <span className={`category ${meta.className}`}>
                  <CategoryIcon category={market.category || "Other"} />
                  {market.category || "Other"}
                </span>
                <span className={`compact-live-badge ${statusLabel === "Live" ? "is-live" : "is-muted"}`}>
                  {statusLabel}
                </span>
              </div>
              <h3>{market.question}</h3>
            </div>
            <div className="compact-odds-grid" aria-label="YES and NO market odds">
              <div className="compact-odds-tile compact-yes-tile">
                <span>YES</span>
                <strong>{yesPercent.toFixed(1)}%</strong>
                <small>{formatMarketAmount(market.yesPool, market)} {marketSymbolLabel}</small>
              </div>
              <div className="compact-odds-tile compact-no-tile">
                <span>NO</span>
                <strong>{noPercent.toFixed(1)}%</strong>
                <small>{formatMarketAmount(market.noPool, market)} {marketSymbolLabel}</small>
              </div>
            </div>
            <div className="compact-card-footer">
              <span>Market #{market.id}</span>
              <strong>{formatMarketAmount(totalPool, market)} {marketSymbolLabel} VOL</strong>
            </div>
            <div className="compact-market-meta">
              <span>{countdownText(market.closeTime, currentTime)}</span>
              <span>{market.traderCount} traders</span>
            </div>
            {account && (
              <div className="compact-position-line">
                Your position: YES {formatMarketAmount(market.yesPosition, market)} / NO {formatMarketAmount(market.noPosition, market)} {marketSymbolLabel}
              </div>
            )}
            {market.outcome !== Outcome.Unresolved && (
              <span className={`compact-personal-result ${walletResult.className}`}>{walletResult.label}</span>
            )}
            {isProfileCard && (profileResolutionAction || showProfileBondReturn || canClaim) && (
              <div className="compact-action-hint" onClick={(event) => event.stopPropagation()}>
                <strong>{actionHintTitle}</strong>
                <span>{actionHintText}</span>
                {profileResolutionAction && (
                  <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">
                    Go to market
                  </button>
                )}
                {showProfileBondReturn && (
                  <button disabled={transactionPending} onClick={() => withdrawPendingBalance(market)} type="button">
                    Receive pending {marketSymbolLabel}
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );

  const renderMarketDetail = () => {
    if (!selectedMarket) {
      return (
        <section className="market-detail-view">
          <button className="secondary back-button" onClick={backToMarkets} type="button">
            Back to markets
          </button>
          <div className="empty-state">
            <strong>Market not found</strong>
            <span>This market may not be loaded yet. Refresh the app and try again.</span>
          </div>
        </section>
      );
    }

    const totalPool = marketVolume(selectedMarket);
    const canUseDisputeFlow = contractVersion !== "legacy";
    const selectedResolutionReadyAt = resolutionUnlockTime(selectedMarket);
    const selectedResolutionReady = nowSeconds >= selectedResolutionReadyAt;
    const canBet =
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.proposedAt === 0 &&
      Date.now() / 1000 < selectedMarket.closeTime;
    const canPropose =
      canUseDisputeFlow &&
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.proposedAt === 0 &&
      selectedResolutionReady &&
      (selectedMarket.resolutionMode === 2
        ? (!!owner && sameAddress(owner, account)) ||
          (!!selectedMarket.authority && sameAddress(selectedMarket.authority, account))
        : sameAddress(selectedMarket.resolver, account) ||
          (!!owner && sameAddress(owner, account)) ||
          (!!(selectedMarket.authority || resolutionAuthority) && sameAddress(selectedMarket.authority || resolutionAuthority, account)));
    const canDispute =
      canUseDisputeFlow &&
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.proposedAt > 0 &&
      !selectedMarket.disputed &&
      selectedMarket.disputeDeadline > 0 &&
      Date.now() / 1000 < selectedMarket.disputeDeadline &&
      hasUserPosition(selectedMarket);
    const canFinalize =
      canUseDisputeFlow &&
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.proposedAt > 0 &&
      !selectedMarket.disputed &&
      !selectedMarket.authorityReviewRequired &&
      selectedMarket.disputeDeadline > 0 &&
      Date.now() / 1000 >= selectedMarket.disputeDeadline;
    const canFinalizeDispute =
      canUseDisputeFlow &&
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      (selectedMarket.disputed || Boolean(selectedMarket.authorityReviewRequired)) &&
      ((!!owner && sameAddress(account, owner)) ||
        (!!(selectedMarket.authority || resolutionAuthority) && sameAddress(account, selectedMarket.authority || resolutionAuthority)));
    const canRequestAuthorityReview =
      isStablecoinContractVersion(contractVersion) &&
      Boolean(account) &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.proposedAt > 0 &&
      !selectedMarket.authorityReviewRequired &&
      ((!!owner && sameAddress(account, owner)) ||
        (!!selectedMarket.authority && sameAddress(account, selectedMarket.authority)));
    const canCancelStaleDispute =
      canUseDisputeFlow &&
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      (selectedMarket.disputed || Boolean(selectedMarket.authorityReviewRequired)) &&
      selectedMarket.disputeDeadline > 0 &&
      (selectedMarket.termsDisputeGracePeriod ?? disputeGracePeriod) > 0 &&
      Date.now() / 1000 >= selectedMarket.disputeDeadline + (selectedMarket.termsDisputeGracePeriod ?? disputeGracePeriod);
    const canCancelUnproposed =
      contractVersion === "v4" &&
      Boolean(account) &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.proposedAt === 0 &&
      nowSeconds >=
        (selectedMarket.resolutionTime || selectedMarket.closeTime) +
          (selectedMarket.termsProposalGracePeriod ?? 72 * 60 * 60);
    const canLegacyResolve =
      contractVersion === "legacy" &&
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedResolutionReady &&
      [selectedMarket.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());
    const cancelOnlyResolution = selectedResolutionReady && requiresCancelForLiquidity(selectedMarket);
    const canProposeYes = !cancelOnlyResolution && selectedMarket.yesPool > 0n;
    const canProposeNo = !cancelOnlyResolution && selectedMarket.noPool > 0n;
    const proposeHint = resolveActionHint(selectedMarket);
    const finalizeHint = finalizeWaitingHint(selectedMarket);
    const canClaim = account && selectedMarket.potentialPayout > 0n && !selectedMarket.claimed;
    const pendingTokenWithdrawal =
      selectedMarket.settlementToken ? pendingWithdrawalsByToken[selectedMarket.settlementToken.toLowerCase()] || 0n : 0n;
    const selectedMarketCreatorBond = selectedMarket.termsCreatorBond ?? creatorBond;
    const showCreatorBondContext =
      pendingTokenWithdrawal > 0n &&
      account &&
      sameAddress(account, selectedMarket.creator) &&
      selectedMarketCreatorBond > 0n;
    const selectedMarketBalance =
      isStablecoinContractVersion(contractVersion) && selectedMarket.settlementToken && isAddress(selectedMarket.settlementToken)
        ? walletTokenBalances[selectedMarket.settlementToken.toLowerCase()] ??
          (isAddress(defaultSettlementToken) && sameAddress(selectedMarket.settlementToken, defaultSettlementToken) ? walletBalance : 0n)
        : walletBalance;
    const selectedSwapPair = canBet ? swapPairForMarket(selectedMarket) : null;
    const selectedSwapOpen = Boolean(selectedSwapPair && swapMarketId === selectedMarket.id);
    const selectedSwapSourceBalance = selectedSwapPair
      ? walletTokenBalances[selectedSwapPair.fromToken.toLowerCase()] ??
        (sameAddress(selectedSwapPair.fromToken, defaultSettlementToken) ? walletBalance : 0n)
      : 0n;
    const activeSwapQuote =
      selectedSwapOpen && selectedSwapPair && swapQuotePairKey === stablecoinSwapPairKey(selectedSwapPair) ? swapQuote : null;
    const tradeAmount = parseUsdcInput(stakeInputs[selectedMarket.id] || "", marketDecimals(selectedMarket));
    const selectedMarketFeeBps = selectedMarket.termsProtocolFeeBps ?? protocolFeeBps;
    const yesEstimate = betEstimate(selectedMarket, Outcome.Yes, tradeAmount, selectedMarketFeeBps);
    const noEstimate = betEstimate(selectedMarket, Outcome.No, tradeAmount, selectedMarketFeeBps);
    const selectedTradeSide = selectedTradeSides[selectedMarket.id];
    const selectedEstimate = selectedTradeSide === Outcome.No ? noEstimate : yesEstimate;
    const selectedSideLabel = selectedTradeSide === Outcome.No ? "NO" : "YES";
    const balancePercent =
      selectedMarketBalance > 0n ? Math.min(100, Number((tradeAmount * 10000n) / selectedMarketBalance) / 100) : 0;
    const meta = categoryMeta(selectedMarket.category || "Other");
    const selectedMarketImage = marketImageFor(selectedMarket);
    const selectedMarketImageVariant = marketImageVariant(selectedMarket);
    const chartRows = detailChartRows;
    const selectedChartSide =
      chartViewSides[selectedMarket.id] ??
      selectedTradeSide ??
      (selectedMarketNoPercent > selectedMarketYesPercent ? Outcome.No : Outcome.Yes);
    const oppositeChartSide = selectedChartSide === Outcome.No ? Outcome.Yes : Outcome.No;
    const chartPrimaryPercent = selectedChartSide === Outcome.No ? selectedMarketNoPercent : selectedMarketYesPercent;
    const chartPrimaryLabel = selectedChartSide === Outcome.No ? "NO" : "YES";
    const chartOppositeLabel = oppositeChartSide === Outcome.No ? "NO" : "YES";
    const chartLineY = (point: (typeof chartRows)[number]) => selectedChartSide === Outcome.No ? point.noY : point.yesY;
    const chartLinePercent = (point: (typeof chartRows)[number]) =>
      selectedChartSide === Outcome.No ? point.noPercent : point.yesPercent;
    const chartYesPath = smoothPathFromPoints(chartRows.map((point) => ({ x: point.x, y: point.yesY })));
    const chartNoPath = smoothPathFromPoints(chartRows.map((point) => ({ x: point.x, y: point.noY })));
    const chartLinePath = selectedChartSide === Outcome.No ? chartNoPath : chartYesPath;
    const chartAreaPath =
      chartRows.length > 0 && chartLinePath
        ? `${chartLinePath} L${chartRows[chartRows.length - 1].x},${CHART_BOTTOM} L${chartRows[0].x},${CHART_BOTTOM} Z`
        : "";
    const chartLastPoint = chartRows[chartRows.length - 1];
    const chartPointerActive = chartHoverRatio !== null;
    const chartHoverPoint = (() => {
      if (!chartPointerActive || chartRows.length === 0) return undefined;
      const hoverX = CHART_LEFT + chartHoverRatio * (CHART_RIGHT - CHART_LEFT);
      const upperIndexRaw = chartRows.findIndex((point) => point.x >= hoverX);
      if (upperIndexRaw <= 0) return { ...chartRows[0], x: hoverX };
      if (upperIndexRaw === -1) return { ...chartRows[chartRows.length - 1], x: hoverX };
      const previous = chartRows[upperIndexRaw - 1];
      const next = chartRows[upperIndexRaw];
      const segmentRatio = (hoverX - previous.x) / Math.max(0.0001, next.x - previous.x);
      const yesPercent = previous.yesPercent + (next.yesPercent - previous.yesPercent) * segmentRatio;
      const noPercent = 100 - yesPercent;
      return {
        ...next,
        timestamp: Math.round(previous.timestamp + (next.timestamp - previous.timestamp) * segmentRatio),
        x: hoverX,
        yesPercent,
        noPercent,
        yesY: CHART_BOTTOM - (yesPercent / 100) * CHART_HEIGHT,
        noY: CHART_BOTTOM - (noPercent / 100) * CHART_HEIGHT
      };
    })();
    const chartFocusPoint = chartHoverPoint || chartLastPoint;
    const chartTooltipLeft = chartFocusPoint ? Math.min(88, Math.max(12, chartFocusPoint.x)) : 0;
    const chartTooltipTop = chartFocusPoint ? Math.min(68, Math.max(16, (chartLineY(chartFocusPoint) / 58) * 100 + 8)) : 0;
    const chartTooltipSide = chartFocusPoint && chartFocusPoint.x > 68 ? "left" : "right";
    const chartFocusPercent = chartFocusPoint ? chartLinePercent(chartFocusPoint) : chartPrimaryPercent;
    const chartTradeCount = selectedMarketActivities.length;
    const submitLabel = !selectedTradeSide
      ? "Select YES or NO"
      : tradeAmount <= 0n
        ? "Enter Amount"
        : `Buy ${selectedSideLabel}`;
    const copyMarketLink = async () => {
      const url = `${window.location.origin}${window.location.pathname}?market=${selectedMarket.id}`;
      await copyTextToClipboard(url, "Market link copied.");
    };
    const marketShareUrl = `${window.location.origin}${window.location.pathname}?market=${selectedMarket.id}`;
    const marketEmbedCode = `<iframe src="${marketShareUrl}" title="AuraPredict Market ${selectedMarket.id}" width="100%" height="720"></iframe>`;
    const shareMarketOnX = () => {
      const tweet = new URL("https://x.com/intent/tweet");
      tweet.searchParams.set("text", `${selectedMarket.question} | YES ${selectedMarketYesPercent.toFixed(0)}% / NO ${selectedMarketNoPercent.toFixed(0)}% on AuraPredict`);
      tweet.searchParams.set("url", marketShareUrl);
      window.open(tweet.toString(), "_blank", "noopener,noreferrer");
    };
    const creatorKey = selectedMarket.creator.toLowerCase();
    const isFollowingCreator = followedCreators.includes(creatorKey);
    const selectedEvidenceRows = marketEvidence[String(selectedMarket.id)] || [];
    const hasWalletAccess = Boolean(account);
    const aiResolutionReport = aiResolutionReports[selectedMarket.id];
    const aiResolutionReceipt = aiResolutionReceipts[String(selectedMarket.id)];
    const hasSavedAiReview = Boolean(aiResolutionReport || aiResolutionReceipt);
    const selectedMarketIsSettled = selectedMarket.outcome !== Outcome.Unresolved;
    const showResolutionAssistant = !selectedMarketIsSettled || Boolean(aiResolutionReport);
    const awaitingResolutionTime = !selectedMarketIsSettled && !selectedResolutionReady;
    const resolutionActionBusy =
      transactionPending ||
      isMarketActionPending("resolve", selectedMarket.id) ||
      isMarketActionPending("finalize", selectedMarket.id) ||
      isMarketActionPending("finalize-dispute", selectedMarket.id);
    const reportAiSuggestedOutcome = aiOutcomeFromText(aiResolutionReport?.suggestedOutcome);
    const receiptAiSuggestedOutcome = aiOutcomeFromReceipt(aiResolutionReceipt);
    const oracleProposal = oracleProposals[String(selectedMarket.id)];
    const oracleSuggestedOutcome = oracleOutcomeFromProposal(oracleProposal);
    const oracleCanPropose = oracleSuggestedOutcome === Outcome.Yes || oracleSuggestedOutcome === Outcome.No;
    const oracleCanCancel = oracleSuggestedOutcome === Outcome.Canceled;
    const oracleBusy = Boolean(oracleBusyByMarket[selectedMarket.id]);
    const oracleSuggestionBlockedByPool =
      (oracleSuggestedOutcome === Outcome.Yes && !canProposeYes) ||
      (oracleSuggestedOutcome === Outcome.No && !canProposeNo);
    const selectedAiSuggestedOutcome =
      reportAiSuggestedOutcome === Outcome.Yes || reportAiSuggestedOutcome === Outcome.No
        ? reportAiSuggestedOutcome
        : receiptAiSuggestedOutcome;
    const savedAiDecisionLabel =
      aiDecisionText(aiResolutionReport?.suggestedOutcome) ||
      aiDecisionText(aiResolutionReceipt?.consensus?.outcome) ||
      aiDecisionText(aiResolutionReceipt?.proposedOutcome) ||
      aiDecisionText(aiResolutionReceipt?.status);
    const selectedAiCanPropose = selectedAiSuggestedOutcome === Outcome.Yes || selectedAiSuggestedOutcome === Outcome.No;
    const selectedAiConfidence =
      typeof aiResolutionReport?.confidence === "number"
        ? aiResolutionReport.confidence
        : aiResolutionReceipt?.consensus?.confidence;
    const savedAiRisks =
      aiResolutionReport?.disputeRisks && aiResolutionReport.disputeRisks.length > 0
        ? aiResolutionReport.disputeRisks
        : (aiResolutionReceipt?.reviews || []).flatMap((review) => review.risks || []).slice(0, 4);
    const savedAiSummary =
      aiResolutionReport?.summary ||
      aiResolutionReceipt?.error ||
      aiResolutionReceipt?.reviews?.find((review) => review.reasoning)?.reasoning ||
      (aiResolutionReceipt
        ? `Aura saved a ${savedAiDecisionLabel || "review"} receipt, but it did not produce an approved YES/NO result.`
        : "");
    const selectedAiSuggestionBlockedByPool =
      (selectedAiSuggestedOutcome === Outcome.Yes && !canProposeYes) ||
      (selectedAiSuggestedOutcome === Outcome.No && !canProposeNo);
    const displayedAgentLabel = awaitingResolutionTime
      ? "NOT READY"
      : cancelOnlyResolution
      ? "CANCEL / REFUND"
      : savedAiDecisionLabel || "NO AI REVIEW YET";
    const displayedAgentConfidence =
      awaitingResolutionTime
        ? 0
        : cancelOnlyResolution
        ? 100
        : typeof selectedAiConfidence === "number" ? selectedAiConfidence : 0;
    const displayedAgentSummary = awaitingResolutionTime
      ? "Aura resolution review becomes available only after the market resolution time has passed."
      : cancelOnlyResolution
      ? "Only one outcome received positions. This market cannot be resolved as YES or NO in the app; use Cancel / Refund."
      : savedAiSummary ||
        (oracleProposal
          ? "No saved Aura review yet. Oracle has objective source data; use Oracle for deterministic markets or ask Aura for a narrative evidence review."
          : "No saved Aura review yet. Ask Aura to create an evidence-based review before using an AI suggestion.");
    const displayedAgentChecklist =
      awaitingResolutionTime
        ? ["Trading and the underlying event may still change before resolution time.", "Return after resolution time to request an Aura review."]
        : cancelOnlyResolution
        ? ["No Aura request is needed for this settlement rule.", "Cancellation returns the funded position through the market refund flow."]
        : savedAiRisks.length > 0
          ? savedAiRisks
          : hasSavedAiReview
            ? ["Aura did not produce an approved YES/NO result from the supplied evidence.", "Use Oracle when the market has objective price/status data.", "Add stronger evidence before asking Aura again."]
            : ["Aura has not generated an AI review for this market yet.", "Run Oracle first for objective price, macro, or status markets.", "Ask Aura only when you need evidence interpretation."];
    const selectedDisputeWindowSeconds = selectedMarket.termsDisputeWindow ?? disputeWindow;
    const selectedGraceSeconds = selectedMarket.termsDisputeGracePeriod ?? disputeGracePeriod;
    const selectedProposalGraceSeconds = selectedMarket.termsProposalGracePeriod ?? 72 * 60 * 60;
    const selectedProposalGraceDeadline = selectedResolutionReadyAt + selectedProposalGraceSeconds;
    const selectedDisputeGraceDeadline =
      selectedMarket.disputeDeadline > 0 && selectedGraceSeconds > 0
        ? selectedMarket.disputeDeadline + selectedGraceSeconds
        : 0;
    const settlementStage =
      selectedMarket.outcome !== Outcome.Unresolved
        ? "Finalized"
        : selectedMarket.disputed
        ? "Dispute review"
        : selectedMarket.authorityReviewRequired
        ? "Owner review"
        : selectedMarket.proposedAt > 0
        ? canFinalize
          ? "Ready to finalize"
          : "Dispute window"
        : awaitingResolutionTime
        ? "Waiting for event time"
        : cancelOnlyResolution
        ? "Cancel / refund"
        : "Awaiting proposal";
    const aiDecisionLabel = cancelOnlyResolution
      ? "Cancel / Refund"
      : selectedAiSuggestedOutcome !== Outcome.Unresolved
      ? outcomeLabel(selectedAiSuggestedOutcome)
      : savedAiDecisionLabel || "No saved AI result yet";
    const aiDecisionDetail = awaitingResolutionTime
      ? `Aura can review after ${closeDate(selectedResolutionReadyAt)}.`
      : cancelOnlyResolution
      ? "One side has no funded pool, so the app does not need another AI call."
      : selectedAiSuggestedOutcome !== Outcome.Unresolved
      ? `${typeof selectedAiConfidence === "number" ? `${selectedAiConfidence}% confidence. ` : ""}${displayedAgentSummary}`
      : hasSavedAiReview
      ? displayedAgentSummary
      : "No saved AI result yet. Ask Aura for narrative review, or use Oracle for objective markets.";
    const oracleDecisionLabel =
      oracleSuggestedOutcome !== Outcome.Unresolved
        ? outcomeLabel(oracleSuggestedOutcome)
        : oracleProposal?.status
        ? String(oracleProposal.status).replace(/_/g, " ")
        : "No oracle check yet";
    const oracleDecisionDetail =
      oracleProposal
        ? [
            oracleProposal.summary || "Oracle returned a saved proposal.",
            oracleProposal.observedValue ? `Observed: ${oracleProposal.observedValue}.` : "",
            typeof oracleProposal.confidence === "number" ? `${oracleProposal.confidence}% confidence.` : "",
            oracleProposal.txHash ? "Oracle auto-proposed this result onchain; dispute/review still stays open." : "",
            oracleProposal.autoProposeError ? `Auto-propose failed: ${oracleProposal.autoProposeError}` : "",
            oracleProposal.autoProposeSkipped ? `Auto-propose skipped: ${oracleProposal.autoProposeSkipped}` : ""
          ]
            .filter(Boolean)
            .join(" ")
        : "Run Oracle for objective markets such as crypto price, macro price, or health/status endpoints.";
    const proposalDecisionLabel =
      selectedMarket.proposedAt > 0 ? outcomeLabel(selectedMarket.proposedOutcome) : "No proposal yet";
    const proposalDecisionDetail =
      selectedMarket.proposedAt > 0
        ? `Proposed at ${closeDate(selectedMarket.proposedAt)} by the market resolver/creator path.`
        : selectedResolutionReady
        ? "The resolver can propose after reviewing Aura, source evidence, and pool rules."
        : `Proposal opens after ${closeDate(selectedResolutionReadyAt)}.`;
    const disputeDecisionLabel = selectedMarket.disputed
      ? "Dispute opened"
      : selectedMarket.authorityReviewRequired
      ? "Owner review required"
      : selectedMarket.proposedAt > 0
      ? "No dispute opened"
      : "Not available yet";
    const disputeDecisionDetail = selectedMarket.disputed
      ? `Disputer: ${displayNameForAddress(selectedMarket.disputer)}. The contract stores the disputing wallet and proposed result, not a separate YES/NO vote from the disputer.`
      : selectedMarket.authorityReviewRequired && selectedMarket.proposedAt > 0 && selectedMarket.disputeDeadline > nowSeconds
      ? `This result was flagged for owner/authority review. Users with funded positions can still open a formal dispute until ${closeDate(selectedMarket.disputeDeadline)}.`
      : selectedMarket.authorityReviewRequired
      ? "This result was flagged for owner/authority review, usually because the proposal needs extra verification."
      : selectedMarket.proposedAt > 0 && selectedMarket.disputeDeadline > 0
      ? `Users with positions can dispute until ${closeDate(selectedMarket.disputeDeadline)}.`
      : "Dispute opens only after a result has been proposed.";
    const finalDecisionLabel =
      selectedMarket.outcome !== Outcome.Unresolved
        ? outcomeLabel(selectedMarket.outcome)
        : requiresCancelForLiquidity(selectedMarket)
        ? "Use Cancel / Refund"
        : selectedMarket.disputed || selectedMarket.authorityReviewRequired
        ? "Owner/authority final choice"
        : selectedMarket.proposedAt > 0
        ? outcomeLabel(selectedMarket.proposedOutcome)
        : "No final action yet";
    const finalDecisionDetail =
      selectedMarket.outcome !== Outcome.Unresolved
        ? "The market is settled and winners/refunds can be claimed from the contract."
        : requiresCancelForLiquidity(selectedMarket)
        ? "YES/NO finalization is blocked because one side has no funded position."
        : selectedMarket.disputed || selectedMarket.authorityReviewRequired
        ? "Final reviewer should compare Aura, the proposed result, source evidence, and any dispute context before choosing Final YES, Final NO, or Final Cancel."
        : selectedMarket.proposedAt > 0 && selectedMarket.disputeDeadline > 0
        ? `If no dispute is opened, finalize the proposed result after ${closeDate(selectedMarket.disputeDeadline)}.`
        : "A final action appears after a result is proposed.";
    const selectedStructuredRule = structuredRuleFromText(selectedMarket.resolutionRule);
    const selectedHumanRule = stripRuleMetadata(selectedMarket.resolutionRule || "");
    const selectedRuleSource = selectedStructuredRule?.primarySource || selectedMarket.metadataURI || "";
    const selectedRuleFallback = selectedStructuredRule?.fallbackSource || selectedMarket.fallbackSourceURI || "";
    const selectedRuleComparator =
      selectedStructuredRule?.comparator && selectedStructuredRule?.target
        ? `${selectedStructuredRule.comparator.toUpperCase()} ${selectedStructuredRule.target}`
        : "";
    const selectedRuleContextRows = [
      selectedStructuredRule?.kind ? `Mode: ${selectedStructuredRule.kind.replace(/-/g, " ")}` : "",
      selectedStructuredRule?.asset ? `Asset: ${selectedStructuredRule.asset}` : "",
      selectedRuleComparator ? `Condition: ${selectedRuleComparator}` : "",
      selectedRuleSource ? `Primary source: ${selectedRuleSource}` : "",
      selectedRuleFallback ? `Fallback source: ${selectedRuleFallback}` : "",
      selectedHumanRule ? `Rule: ${selectedHumanRule}` : ""
    ].filter(Boolean);
    const scrollToAuraDetails = () => {
      document.getElementById("aura-resolution-details")?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    const topTraderRows = Array.from(
      selectedMarketActivities.reduce(
        (map, activity) => {
          const key = activity.user.toLowerCase();
          const row = map.get(key) ?? { address: activity.user, yes: 0n, no: 0n, total: 0n };
          if (activity.side === Outcome.Yes) row.yes += activity.amount;
          if (activity.side === Outcome.No) row.no += activity.amount;
          row.total += activity.amount;
          map.set(key, row);
          return map;
        },
        new Map<string, { address: string; yes: bigint; no: bigint; total: bigint }>()
      ).values()
    )
      .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0))
      .slice(0, 5);
    const marketWalletQuery = marketWalletSearch.trim().toLowerCase();
    const marketHistoryRows = [...selectedMarketActivities]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((activity) => {
        if (!marketWalletQuery) return true;
        const searchable = [
          activity.user,
          shortAddress(activity.user),
          displayNameForAddress(activity.user),
          activity.side === Outcome.Yes ? "yes" : "no",
          formatMarketAmount(activity.amount, selectedMarket)
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(marketWalletQuery);
      });
    const copyTraderPosition = (trader: { address: string; yes: bigint; no: bigint; total: bigint }) => {
      const side = trader.no > trader.yes ? Outcome.No : Outcome.Yes;
      const copyAmount = trader.total > selectedMarketBalance ? selectedMarketBalance : trader.total;
      setSelectedTradeSides((current) => ({ ...current, [selectedMarket.id]: side }));
      setStakeInputs((current) => ({
        ...current,
        [selectedMarket.id]: copyAmount > 0n ? formatUsdcInput(copyAmount, marketDecimals(selectedMarket)) : ""
      }));
      setNotice(`Copied ${displayNameForAddress(trader.address)} ${side === Outcome.Yes ? "YES" : "NO"} setup.`);
    };
    const copyAgentReport = () => {
      const report = [
        `Aura Agent report for Market #${selectedMarket.id}`,
        selectedMarket.question,
        `Suggested outcome: ${displayedAgentLabel}`,
        `Confidence: ${displayedAgentConfidence}%`,
        displayedAgentSummary,
        ...(aiResolutionReport?.evidence || []).map((item, index) => `${index + 1}. ${item.title || "Evidence"}${item.url ? ` - ${item.url}` : ""}${item.finding ? ` - ${item.finding}` : ""}`),
        ...selectedEvidenceRows.map((item, index) => `${index + 1}. ${item.title}${item.url ? ` - ${item.url}` : ""}`)
      ].join("\n");
      void copyTextToClipboard(report, "Aura Agent report copied.");
    };

    return (
      <section className="market-detail-view">
        <button className="secondary back-button" onClick={backToMarkets} type="button">
          Back to markets
        </button>

        <section className="market-detail-hero">
          <div className={`detail-question-panel ${selectedMarketImageVariant}`}>
            <img src={selectedMarketImage} alt="" />
            <div>
              <span className={`category ${meta.className}`}>
                <CategoryIcon category={selectedMarket.category || "Other"} />
                {selectedMarket.category || "Other"}
              </span>
              <h1>{selectedMarket.question}</h1>
              <div className="market-share-actions">
                <button className="secondary" onClick={() => toggleFollowCreator(selectedMarket.creator)} type="button">
                  {isFollowingCreator ? "Following" : "Follow creator"}
                </button>
                <button className="secondary" onClick={shareMarketOnX} type="button">
                  Share X
                </button>
                <button className="secondary" onClick={() => copyTextToClipboard(marketEmbedCode, "Embed code copied.")} type="button">
                  Embed
                </button>
              </div>
            </div>
            <button className="secondary copy-market-button" onClick={copyMarketLink} type="button">
              Copy link
            </button>
          </div>

          <aside className="detail-summary-card">
            <div>
              <span>Rating</span>
              <strong>{selectedMarket.traderCount > 4 ? "Active" : "New"}</strong>
            </div>
            <div>
              <span>Ends in</span>
              <strong>{countdownText(selectedMarket.closeTime, currentTime)}</strong>
            </div>
            <div>
              <span>Volume</span>
              <strong>{formatMarketAmount(totalPool, selectedMarket)} {marketSymbol(selectedMarket)}</strong>
            </div>
            <div>
              <span>Participants</span>
              <strong>{selectedMarket.traderCount}</strong>
            </div>
            <div>
              <span>Leading</span>
              <strong>{selectedMarketYesPercent >= selectedMarketNoPercent ? "YES" : "NO"}</strong>
            </div>
            <div>
              <span>Creator</span>
              <strong>{displayNameForAddress(selectedMarket.creator)}</strong>
            </div>
          </aside>
        </section>

        <section className="detail-body-grid">
          <div className="detail-primary-column">
          <section className="detail-chart-card">
            <div className="detail-chart-header">
              <div>
                <span className="section-label">Odds movement</span>
                <h2>
                  <b>{chartPrimaryPercent.toFixed(0)}%</b>
                  <span>{chartPrimaryLabel} chance</span>
                </h2>
              </div>
              <div className="chart-header-actions">
                <div className="chart-window-tabs">
                  {CHART_WINDOWS.map((windowOption) => (
                    <button
                      className={detailChartWindow === windowOption.value ? "active" : ""}
                      key={windowOption.value}
                      onClick={() => setDetailChartWindow(windowOption.value)}
                      type="button"
                    >
                      {windowOption.label}
                    </button>
                  ))}
                </div>
                <button
                  className={`chart-side-toggle ${chartOppositeLabel.toLowerCase()}`}
                  onClick={() =>
                    setChartViewSides((current) => ({
                      ...current,
                      [selectedMarket.id]: oppositeChartSide
                    }))
                  }
                  type="button"
                >
                  View {chartOppositeLabel}
                </button>
              </div>
            </div>
            <div className="chart-stat-strip">
              <span>
                <b className="won">YES</b>
                {selectedMarketYesPercent.toFixed(1)}%
              </span>
              <span>
                <b className="lost">NO</b>
                {selectedMarketNoPercent.toFixed(1)}%
              </span>
              <span>
                <b>Volume</b>
                {formatMarketAmount(totalPool, selectedMarket)} {marketSymbol(selectedMarket)}
              </span>
              <span>
                <b>Trades</b>
                {chartTradeCount}
              </span>
            </div>
            <div
              className="chart-frame"
              onPointerLeave={() => setChartHoverRatio(null)}
              onPointerEnter={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setChartHoverRatio(Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))));
              }}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setChartHoverRatio(Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))));
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                const rect = event.currentTarget.getBoundingClientRect();
                setChartHoverRatio(Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))));
              }}
            >
              <svg className="detail-chart" viewBox="0 0 100 58" preserveAspectRatio="none" role="img" aria-label="Market odds chart">
                <path className="edge-grid" d="M8 8H92 M8 19.5H92 M8 31H92 M8 42.5H92 M8 54H92" />
                {chartAreaPath && (
                  <path
                    className={selectedChartSide === Outcome.No ? "detail-no-area" : "detail-yes-area"}
                    d={chartAreaPath}
                  />
                )}
                <path
                  className={selectedChartSide === Outcome.No ? "detail-no-line" : "detail-yes-line"}
                  d={chartLinePath}
                />
                {chartLastPoint && (
                  <circle
                    className={`chart-end-dot ${selectedChartSide === Outcome.No ? "no" : "yes"}`}
                    cx={chartLastPoint.x}
                    cy={chartLineY(chartLastPoint)}
                    r="1.35"
                  />
                )}
              </svg>
              {chartFocusPoint && (
                <>
                  <span className={`chart-crosshair ${chartPointerActive ? "is-active" : "is-idle"}`} style={{ left: `${chartFocusPoint.x}%` }} />
                  <span
                    className={`chart-hover-dot ${selectedChartSide === Outcome.No ? "no" : "yes"} ${chartPointerActive ? "is-active" : "is-idle"}`}
                    style={{ left: `${chartFocusPoint.x}%`, top: `${(chartLineY(chartFocusPoint) / 58) * 100}%` }}
                  />
                  {chartPointerActive && (
                    <div
                      className={`chart-tooltip is-${chartTooltipSide}`}
                      style={{ left: `${chartTooltipLeft}%`, top: `${chartTooltipTop}%` }}
                    >
                      <span>{chartTimeLabel(chartFocusPoint.timestamp, true)}</span>
                      <strong className={selectedChartSide === Outcome.No ? "tooltip-no" : "tooltip-yes"}>
                        {chartPrimaryLabel} {chartFocusPercent.toFixed(1)}%
                      </strong>
                    </div>
                  )}
                </>
              )}
              <div className="chart-y-labels" aria-hidden="true">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
            </div>
            <div className="chart-time-row">
                {detailChartTicks.map((tick) => (
                  <span key={`${tick.x}-${tick.label}`}>
                    {tick.label}
                  </span>
                ))}
            </div>
            <div className="edge-legend">
              <span className="won">YES {selectedMarketYesPercent.toFixed(1)}%</span>
              <span className="lost">NO {selectedMarketNoPercent.toFixed(1)}%</span>
            </div>
          </section>

          {hasWalletAccess && (
            <section id="market-resolution-zone" className="resolution-zone">
              <div className="resolution-zone-head">
                <div>
                  <span className="section-label">Settlement</span>
                  <strong>Resolution actions</strong>
                </div>
                {!cancelOnlyResolution && selectedAiCanPropose && (
                  <button
                    className={`resolution-ai-banner ${selectedAiSuggestedOutcome === Outcome.Yes ? "yes" : "no"}`}
                    onClick={scrollToAuraDetails}
                    type="button"
                  >
                    AI suggests {outcomeLabel(selectedAiSuggestedOutcome)}
                    {typeof selectedAiConfidence === "number" ? ` (${selectedAiConfidence}% confidence)` : ""}
                    <small>View details</small>
                  </button>
                )}
              </div>
              <div className="resolution-report">
                <div className="resolution-report-head">
                  <div>
                    <span>Settlement report</span>
                    <strong>{settlementStage}</strong>
                  </div>
                  {(aiResolutionReport || aiResolutionReceipt || selectedAiCanPropose) && (
                    <button className="secondary" onClick={scrollToAuraDetails} type="button">
                      View AI details
                    </button>
                  )}
                  {!selectedMarketIsSettled && !awaitingResolutionTime && !cancelOnlyResolution && (
                    <button
                      className="secondary"
                      disabled={oracleBusy}
                      onClick={() => requestOracleProposal(selectedMarket)}
                      type="button"
                    >
                      {oracleBusy ? "Checking Oracle..." : oracleProposal ? "Refresh Oracle" : "Check Oracle"}
                    </button>
                  )}
                </div>

                <div className="resolution-report-grid">
                  <article>
                    <span>AI suggestion</span>
                    <strong>{aiDecisionLabel}</strong>
                    <small>{aiDecisionDetail}</small>
                  </article>
                  <article>
                    <span>Oracle suggestion</span>
                    <strong>{oracleDecisionLabel}</strong>
                    <small>{oracleDecisionDetail}</small>
                  </article>
                  <article>
                    <span>Creator / resolver proposal</span>
                    <strong>{proposalDecisionLabel}</strong>
                    <small>{proposalDecisionDetail}</small>
                  </article>
                  <article>
                    <span>Dispute / review</span>
                    <strong>{disputeDecisionLabel}</strong>
                    <small>{disputeDecisionDetail}</small>
                  </article>
                  <article>
                    <span>Final reviewer action</span>
                    <strong>{finalDecisionLabel}</strong>
                    <small>{finalDecisionDetail}</small>
                  </article>
                </div>

                <div className="resolution-report-pools">
                  <div>
                    <span>YES pool</span>
                    <strong>{selectedMarketYesPercent.toFixed(1)}% / {formatMarketAmount(selectedMarket.yesPool, selectedMarket)} {marketSymbol(selectedMarket)}</strong>
                  </div>
                  <div>
                    <span>NO pool</span>
                    <strong>{selectedMarketNoPercent.toFixed(1)}% / {formatMarketAmount(selectedMarket.noPool, selectedMarket)} {marketSymbol(selectedMarket)}</strong>
                  </div>
                  <div>
                    <span>Total volume</span>
                    <strong>{formatMarketAmount(totalPool, selectedMarket)} {marketSymbol(selectedMarket)}</strong>
                  </div>
                </div>

                <div className="resolution-timeline">
                  <div>
                    <span>Trading close</span>
                    <strong>{closeDate(selectedMarket.closeTime)}</strong>
                  </div>
                  <div>
                    <span>Resolution/event time</span>
                    <strong>{closeDate(selectedResolutionReadyAt)}</strong>
                  </div>
                  <div>
                    <span>Proposal grace</span>
                    <strong>{durationText(selectedProposalGraceSeconds)} · cancel after {closeDate(selectedProposalGraceDeadline)}</strong>
                  </div>
                  <div>
                    <span>Dispute window</span>
                    <strong>
                      {selectedMarket.disputeDeadline > 0
                        ? `until ${closeDate(selectedMarket.disputeDeadline)}`
                        : durationText(selectedDisputeWindowSeconds)}
                    </strong>
                  </div>
                  <div>
                    <span>Owner review grace</span>
                    <strong>
                      {selectedDisputeGraceDeadline > 0
                        ? `stale cancel after ${closeDate(selectedDisputeGraceDeadline)}`
                        : durationText(selectedGraceSeconds)}
                    </strong>
                  </div>
                </div>
                {selectedRuleContextRows.length > 0 && (
                  <div className="resolution-rule-context">
                    <span>Shared source rule</span>
                    <strong>Aura, Oracle, resolver, and final reviewer use this same rule context.</strong>
                    <ul>
                      {selectedRuleContextRows.map((row) => (
                        <li key={row}>{row}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {(canLegacyResolve || canPropose || canDispute || canFinalize || canFinalizeDispute || canCancelStaleDispute || canCancelUnproposed || canClaim) && (
                <div className="settlement-row resolution-actions">
                  <div className="resolution-button-grid">
                    {canLegacyResolve && (
                      <>
                        <button className="secondary action-propose-yes" onClick={() => resolveMarket(selectedMarket.id, Outcome.Yes)}>
                          Resolve YES
                        </button>
                        <button className="secondary action-propose-no" onClick={() => resolveMarket(selectedMarket.id, Outcome.No)}>
                          Resolve NO
                        </button>
                        <button className="secondary action-propose-cancel" onClick={() => cancelMarket(selectedMarket.id)}>
                          Cancel
                        </button>
                      </>
                    )}
                    {canPropose && (
                      <>
                        {!cancelOnlyResolution && (
                          <button className="secondary action-refresh-aura" disabled={aiBusy || resolutionActionBusy} onClick={() => askAuraForResolution(selectedMarket)} type="button">
                            {aiBusy ? "Aura thinking..." : resolutionActionBusy ? "Processing..." : selectedAiCanPropose ? "Refresh Aura" : "Ask Aura"}
                          </button>
                        )}
                        {!cancelOnlyResolution && selectedAiCanPropose && (
                          <button
                            className="secondary action-use-ai"
                            onClick={() => resolveMarket(selectedMarket.id, selectedAiSuggestedOutcome as Outcome.Yes | Outcome.No)}
                            disabled={resolutionActionBusy || !canResolveAfterAura(selectedMarket.id) || selectedAiSuggestionBlockedByPool}
                            type="button"
                          >
                            Use AI: {outcomeLabel(selectedAiSuggestedOutcome)}
                          </button>
                        )}
                        {!cancelOnlyResolution && oracleCanPropose && (
                          <button
                            className="secondary action-use-oracle"
                            onClick={() =>
                              resolveMarket(selectedMarket.id, oracleSuggestedOutcome as Outcome.Yes | Outcome.No, false, { source: "oracle" })
                            }
                            disabled={resolutionActionBusy || oracleSuggestionBlockedByPool}
                            type="button"
                          >
                            Use Oracle: {outcomeLabel(oracleSuggestedOutcome)}
                          </button>
                        )}
                        {!cancelOnlyResolution && oracleCanCancel && (
                          <button
                            className="secondary action-use-oracle"
                            disabled={resolutionActionBusy}
                            onClick={() => cancelMarket(selectedMarket.id)}
                            type="button"
                          >
                            Use Oracle: Cancel
                          </button>
                        )}
                        <button className="secondary action-propose-yes" onClick={() => resolveMarket(selectedMarket.id, Outcome.Yes)} disabled={resolutionActionBusy || !canProposeYes || !canResolveAfterAura(selectedMarket.id)}>
                          Propose YES
                        </button>
                        <button className="secondary action-propose-no" onClick={() => resolveMarket(selectedMarket.id, Outcome.No)} disabled={resolutionActionBusy || !canProposeNo || !canResolveAfterAura(selectedMarket.id)}>
                          Propose NO
                        </button>
                        <button className="secondary action-propose-cancel" disabled={resolutionActionBusy || (!canResolveAfterAura(selectedMarket.id) && !cancelOnlyResolution)} onClick={() => cancelMarket(selectedMarket.id)}>
                          {cancelOnlyResolution ? "Cancel / Refund" : "Cancel"}
                        </button>
                      </>
                    )}
                    {canDispute && (
                      <button className="secondary action-dispute" onClick={() => disputeMarket(selectedMarket.id)}>
                        Dispute {formatMarketAmount(selectedMarket.termsDisputeBond ?? disputeBond, selectedMarket)} {marketSymbol(selectedMarket)}
                      </button>
                    )}
                    {canFinalize && (
                      <button className="secondary action-use-ai" disabled={resolutionActionBusy} onClick={() => finalizeMarket(selectedMarket.id)}>
                        Finalize result
                      </button>
                    )}
                    {canRequestAuthorityReview && (
                      <button className="secondary action-dispute" onClick={() => requestAuthorityReview(selectedMarket)}>
                        Send to authority review
                      </button>
                    )}
                    {canFinalizeDispute && (
                      <>
                        {!cancelOnlyResolution && (
                          <>
                            <button className="secondary action-propose-yes" disabled={resolutionActionBusy} onClick={() => finalizeDispute(selectedMarket.id, Outcome.Yes)}>
                              Final YES
                            </button>
                            <button className="secondary action-propose-no" disabled={resolutionActionBusy} onClick={() => finalizeDispute(selectedMarket.id, Outcome.No)}>
                              Final NO
                            </button>
                          </>
                        )}
                        <button className="secondary action-propose-cancel" disabled={resolutionActionBusy} onClick={() => finalizeDispute(selectedMarket.id, Outcome.Canceled)}>
                          Final Cancel / Refund
                        </button>
                      </>
                    )}
                    {canCancelStaleDispute && (
                      <button className="secondary action-propose-cancel" onClick={() => cancelStaleDispute(selectedMarket.id)}>
                        Cancel stale dispute
                      </button>
                    )}
                    {canCancelUnproposed && (
                      <button className="secondary action-propose-cancel" onClick={() => cancelUnproposedMarket(selectedMarket.id)}>
                        Cancel timed-out market / refund
                      </button>
                    )}
                    {canClaim && (
                      <button onClick={() => claim(selectedMarket.id)}>
                        Claim {formatMarketAmount(selectedMarket.potentialPayout, selectedMarket)} {marketSymbol(selectedMarket)}
                      </button>
                    )}
                    {pendingTokenWithdrawal > 0n && (
                      <>
                        <button className="secondary action-withdraw-pending" onClick={() => withdrawPendingBalance(selectedMarket)}>
                          Withdraw total pending {marketSymbol(selectedMarket)}: {formatMarketAmount(pendingTokenWithdrawal, selectedMarket)} {marketSymbol(selectedMarket)}
                        </button>
                        <small className="pending-withdraw-note">
                          {showCreatorBondContext
                            ? `This market's creator bond is ${formatMarketAmount(selectedMarketCreatorBond, selectedMarket)} ${marketSymbol(selectedMarket)}. The withdraw button claims your total pending ${marketSymbol(selectedMarket)} balance across all finalized markets.`
                            : `This withdraw button claims your total pending ${marketSymbol(selectedMarket)} balance across finalized markets, not only this market.`}
                        </small>
                      </>
                    )}
                  </div>
                  <div className="resolution-meta">
                    {canPropose && proposeHint && <small>{proposeHint}</small>}
                    {canPropose && (
                      <small>
                        {cancelOnlyResolution
                          ? "Aura is not needed because this market must be canceled and refunded."
                          : selectedAiCanPropose
                          ? `Aura suggests ${outcomeLabel(selectedAiSuggestedOutcome)}. Use the banner above to read the analysis.`
                          : resolveAuraStatusLabel(selectedMarket)}
                      </small>
                    )}
                    {canPropose && oracleProposal && (
                      <small>
                        Oracle suggests {oracleDecisionLabel}. {oracleProposal.summary || "Use Oracle only when the adapter matches the market rule."}
                      </small>
                    )}
                    {finalizeHint && <small>{finalizeHint}</small>}
                    {selectedMarket.authorityReviewRequired && <small>This proposal is held for authority review before final settlement. Funded users can still dispute while the dispute window is open.</small>}
                  </div>
                </div>
              )}
              <div className="resolver-note">
                YES/NO resolution requires funded positions on both outcomes. If either side has no positions,
                use Cancel to refund. A proposed result moves to Ended only after Finalize.
              </div>
            </section>
          )}
          </div>

          {hasWalletAccess ? (
            <aside className="detail-trade-card">
            <div className="detail-outcome-row">
              <span className="outcome-dot yes" />
              <strong>YES</strong>
              <span>{selectedMarketYesPercent.toFixed(1)}% / {formatMarketAmount(selectedMarket.yesPool, selectedMarket)} {marketSymbol(selectedMarket)}</span>
            </div>
            <div className="detail-outcome-row">
              <span className="outcome-dot no" />
              <strong>NO</strong>
              <span>{selectedMarketNoPercent.toFixed(1)}% / {formatMarketAmount(selectedMarket.noPool, selectedMarket)} {marketSymbol(selectedMarket)}</span>
            </div>
            <div className="trade-balance-line">
              <span>Available</span>
              <button onClick={() => refreshWalletBalance()} type="button">
                {formatMarketAmount(selectedMarketBalance, selectedMarket)} {marketSymbol(selectedMarket)}
              </button>
            </div>
            {selectedSwapPair && (
              <section className="market-swap-panel">
                <button
                  className="market-swap-toggle"
                  disabled={transactionPending}
                  onClick={() => openMarketSwap(selectedMarket)}
                  type="button"
                >
                  <span>Need {selectedSwapPair.toSymbol}?</span>
                  <strong>Swap {selectedSwapPair.fromSymbol} to {selectedSwapPair.toSymbol}</strong>
                </button>
                {selectedSwapOpen && (
                  <div className="market-swap-body">
                    <div className="market-swap-balance">
                      <span>Available {selectedSwapPair.fromSymbol}</span>
                      <strong>{formatUsdcInput(selectedSwapSourceBalance, selectedSwapPair.decimals)}</strong>
                    </div>
                    <div className="market-swap-input">
                      <input
                        inputMode="decimal"
                        placeholder={`${selectedSwapPair.fromSymbol} amount`}
                        value={swapAmountInput}
                        disabled={swapBusy !== "idle" || transactionPending}
                        onChange={(event) => {
                          setSwapAmountInput(event.target.value);
                          setSwapQuote(null);
                          setSwapQuotePairKey("");
                          setSwapQuoteTime(0);
                          setSwapProviderHealth({ circle: CIRCLE_APP_KIT_KEY ? "idle" : "skipped", lifi: "idle" });
                        }}
                      />
                      <button
                        disabled={swapBusy !== "idle" || transactionPending || parseUsdcInput(swapAmountInput, selectedSwapPair.decimals) <= 0n}
                        onClick={() => requestSwapQuote(selectedSwapPair)}
                        type="button"
                      >
                        {swapBusy === "quote" ? "Quoting..." : "Get quote"}
                      </button>
                    </div>
                    <div className="market-swap-tolerance">
                      <span>Price tolerance</span>
                      <div role="group" aria-label="Swap price tolerance">
                        {SWAP_TOLERANCE_OPTIONS.map((bps) => (
                          <button
                            className={swapToleranceBps === bps ? "active" : ""}
                            disabled={swapBusy !== "idle" || transactionPending}
                            key={bps}
                            onClick={() => {
                              setSwapToleranceBps(bps);
                              setSwapQuote(null);
                              setSwapQuotePairKey("");
                              setSwapQuoteTime(0);
                            }}
                            type="button"
                          >
                            {formatSwapTolerance(bps)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="swap-provider-health" aria-live="polite">
                      <span className={`provider-badge ${swapProviderHealth.circle}`}>
                        Circle App Kit: {providerHealthLabel(swapProviderHealth.circle)}
                      </span>
                      <span className={`provider-badge ${swapProviderHealth.lifi}`}>
                        LI.FI: {providerHealthLabel(swapProviderHealth.lifi)}
                      </span>
                    </div>
                    {(swapProviderHealth.circleMessage || swapProviderHealth.lifiMessage) && (
                      <small className="market-swap-note">
                        {swapProviderHealth.circleMessage ? `Circle: ${swapProviderHealth.circleMessage}` : ""}
                        {swapProviderHealth.circleMessage && swapProviderHealth.lifiMessage ? " | " : ""}
                        {swapProviderHealth.lifiMessage ? `LI.FI: ${swapProviderHealth.lifiMessage}` : ""}
                      </small>
                    )}
                    {activeSwapQuote && (
                      <div className="market-swap-quote">
                        <span>Estimated receive</span>
                        <strong>{formatUsdcInput(swapQuoteEstimatedAmount(activeSwapQuote, selectedSwapPair), selectedSwapPair.decimals)} {selectedSwapPair.toSymbol}</strong>
                        <small>
                          Minimum {formatUsdcInput(swapQuoteMinimumAmount(activeSwapQuote, selectedSwapPair), selectedSwapPair.decimals)} {selectedSwapPair.toSymbol}
                          {swapQuoteGasCost(activeSwapQuote) ? ` / network cost about $${swapQuoteGasCost(activeSwapQuote)}` : ""}
                        </small>
                        <button
                          className="market-swap-execute"
                          disabled={swapBusy !== "idle" || transactionPending}
                          onClick={() => executeStablecoinSwap(selectedSwapPair)}
                          type="button"
                        >
                          {swapBusy === "execute" ? "Swapping..." : `Swap to ${selectedSwapPair.toSymbol}`}
                        </button>
                      </div>
                    )}
                    <small className="market-swap-note">
                      Quote source: {swapQuoteProviderLabel(activeSwapQuote)} on Arc Testnet. This market still settles only in {selectedSwapPair.toSymbol}.
                    </small>
                    <small className="market-swap-note">
                      Aura tries Circle App Kit first when configured, then LI.FI if the native route is unavailable. Testnet liquidity can still move quickly.
                    </small>
                  </div>
                )}
              </section>
            )}
            <div className="trade-input-row">
              <input
                inputMode="decimal"
                placeholder="Amount"
                value={stakeInputs[selectedMarket.id] || ""}
                onChange={(event) =>
                  setStakeInputs((current) => ({ ...current, [selectedMarket.id]: event.target.value }))
                }
                disabled={!canBet}
              />
            </div>
            <div className="stake-shortcuts">
              {[0, 25, 50, 100].map((value) => (
                <button key={value} onClick={() => setStakeByPercent(selectedMarket.id, value)} disabled={!canBet || selectedMarketBalance <= 0n} type="button">
                  {value}%
                </button>
              ))}
            </div>
            <label className="stake-slider">
              <span>{balancePercent.toFixed(0)}% of balance</span>
              <input
                max="100"
                min="0"
                step="1"
                type="range"
                value={balancePercent}
                onChange={(event) => setStakeByPercent(selectedMarket.id, Number(event.target.value))}
                disabled={!canBet || selectedMarketBalance <= 0n}
              />
            </label>
            <div className="trade-side-buttons">
              <button
                className={selectedTradeSide === Outcome.Yes ? "yes-button active" : "yes-button"}
                onClick={() => chooseTradeSide(selectedMarket.id, Outcome.Yes)}
                disabled={!canBet}
                type="button"
              >
                <span>YES {selectedMarketYesPercent.toFixed(0)}%</span>
              </button>
              <button
                className={selectedTradeSide === Outcome.No ? "no-button active" : "no-button"}
                onClick={() => chooseTradeSide(selectedMarket.id, Outcome.No)}
                disabled={!canBet}
                type="button"
              >
                <span>NO {selectedMarketNoPercent.toFixed(0)}%</span>
              </button>
            </div>
            <button
              className="trade-submit-button"
              disabled={!canBet || !selectedTradeSide || tradeAmount <= 0n || transactionPending}
              onClick={() => selectedTradeSide && placeBet(selectedMarket.id, selectedTradeSide)}
              type="button"
            >
              {submitLabel}
            </button>
            <div className={selectedTradeSide ? "payout-preview payout-preview-compact" : "trade-hint"}>
              {selectedTradeSide ? (
                <div>
                  <span>{selectedSideLabel} payout if correct</span>
                  <strong>{formatMarketAmount(selectedEstimate.payout, selectedMarket)} {marketSymbol(selectedMarket)}</strong>
                  <small>Profit {formatMarketAmount(selectedEstimate.profit, selectedMarket)} / price {selectedEstimate.pricePercent.toFixed(1)}%</small>
                </div>
              ) : (
                <span>Select YES or NO to focus the chart and preview payout. No side selected shows both lines.</span>
              )}
            </div>
            {account && (
              <div className="position-chip">
                Your position: YES {formatMarketAmount(selectedMarket.yesPosition, selectedMarket)} / NO {formatMarketAmount(selectedMarket.noPosition, selectedMarket)} {marketSymbol(selectedMarket)}
              </div>
            )}
          </aside>
          ) : (
            <aside className="detail-public-card">
              <span className="section-label">Public preview</span>
              <h3>Connect wallet to interact</h3>
              <div className="public-market-stats">
                <div>
                  <span>Volume</span>
                  <strong>{formatMarketAmount(totalPool, selectedMarket)} {marketSymbol(selectedMarket)}</strong>
                </div>
                <div>
                  <span>Participants</span>
                  <strong>{selectedMarket.traderCount}</strong>
                </div>
                <div>
                  <span>YES</span>
                  <strong>{selectedMarketYesPercent.toFixed(1)}%</strong>
                </div>
                <div>
                  <span>NO</span>
                  <strong>{selectedMarketNoPercent.toFixed(1)}%</strong>
                </div>
              </div>
              <button onClick={openWalletModal} disabled={connecting} type="button">
                {connecting ? "Connecting..." : "Connect Wallet"}
              </button>
            </aside>
          )}
        </section>

        {hasWalletAccess ? (
          <section className="market-intelligence-grid">
            {showResolutionAssistant && (
            <section className="agent-panel" id="aura-resolution-details">
              <div className="panel-heading">
                <div>
                  <span className="section-label">{cancelOnlyResolution ? "Settlement rule" : "Aura Agent"}</span>
                  <h3>{awaitingResolutionTime ? "Resolution review locked" : cancelOnlyResolution ? "Cancel / refund required" : "Resolution assistant"}</h3>
                </div>
                <span className="agent-confidence">{displayedAgentConfidence}% confidence</span>
              </div>
              <div className="agent-result">
                <span>Suggested outcome</span>
                <strong>{displayedAgentLabel}</strong>
                <p>{displayedAgentSummary}</p>
                {aiResolutionReport?.resolverAction && <p>{aiResolutionReport.resolverAction}</p>}
              </div>
              <div className="agent-checklist">
                {displayedAgentChecklist.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              {aiResolutionReport?.evidence && aiResolutionReport.evidence.length > 0 && (
                <div className="agent-evidence-list">
                  {aiResolutionReport.evidence.slice(0, 3).map((item, index) => (
                    <article key={`${item.title || "evidence"}-${index}`}>
                      <strong>{item.title || `Evidence ${index + 1}`}</strong>
                      {item.finding && <p>{item.finding}</p>}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer">
                          Open source
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {awaitingResolutionTime ? (
                <div className="resolver-note">Aura can review the outcome after the stated resolution time. No AI request is sent yet.</div>
              ) : cancelOnlyResolution ? (
                <div className="resolver-note">This market is cancel-only because both outcomes were not funded. Aura is not called for this action.</div>
              ) : !selectedMarketIsSettled ? (
                <button className="secondary" disabled={aiBusy} onClick={() => askAuraForResolution(selectedMarket)} type="button">
                  {aiBusy ? "Aura thinking..." : aiResolutionReport || selectedAiCanPropose ? "Refresh Aura Agent" : "Ask Aura Agent"}
                </button>
              ) : (
                <div className="resolver-note">Finalized market. This saved Aura report is read-only; new AI reviews are disabled.</div>
              )}
              <button className="secondary" onClick={copyAgentReport} type="button">
                Copy report
              </button>
            </section>
            )}

            {aiResolutionReceipt && !cancelOnlyResolution && !awaitingResolutionTime && (
              <section className="agent-panel" id={!showResolutionAssistant ? "aura-resolution-details" : undefined}>
                <div className="panel-heading">
                  <div>
                    <span className="section-label">AI receipt</span>
                    <h3>Resolver consensus</h3>
                  </div>
                  <span className="agent-confidence">
                    {aiResolutionReceipt.consensus?.confidence ?? 0}% confidence
                  </span>
                </div>
                <div className="agent-result">
                  <span>Status</span>
                  <strong>{aiResolutionReceipt.status || "pending"}</strong>
                  <p>
                    Consensus {aiResolutionReceipt.consensus?.outcome || aiResolutionReceipt.proposedOutcome || "not ready"}
                    {typeof aiResolutionReceipt.consensus?.agreed === "number"
                      ? ` from ${aiResolutionReceipt.consensus.agreed} AI reviewers.`
                      : "."}
                  </p>
                  {aiResolutionReceipt.receiptHash && <p>Receipt hash {shortAddress(aiResolutionReceipt.receiptHash)}</p>}
                  {aiResolutionReceipt.txHash && (
                    <a href={`${ARC_EXPLORER_URL}/tx/${aiResolutionReceipt.txHash}`} target="_blank" rel="noreferrer">
                      View resolver transaction
                    </a>
                  )}
                  {aiResolutionReceipt.error && <p>{aiResolutionReceipt.error}</p>}
                </div>
                {aiResolutionReceipt.reviews && aiResolutionReceipt.reviews.length > 0 && (
                  <div className="agent-evidence-list">
                    {aiResolutionReceipt.reviews.slice(0, 3).map((review: NonNullable<AiResolutionReceipt["reviews"]>[number], index: number) => (
                      <article key={`receipt-review-${selectedMarket.id}-${index}`}>
                        <strong>
                          {review.outcome || "Review"} {typeof review.confidence === "number" ? `${review.confidence}%` : ""}
                        </strong>
                        {review.reasoning && <p>{review.reasoning}</p>}
                        {review.risks && review.risks.length > 0 && <small>{review.risks.slice(0, 2).join(" / ")}</small>}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {oracleProposal && (
              <section className="agent-panel oracle-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-label">Oracle proposal</span>
                    <h3>{oracleProposal.adapter ? oracleProposal.adapter.replace(/-/g, " ") : "Objective data check"}</h3>
                  </div>
                  <span className="agent-confidence">{oracleProposal.confidence ?? 0}% confidence</span>
                </div>
                <div className="agent-result">
                  <span>Status</span>
                  <strong>{oracleDecisionLabel}</strong>
                  {oracleProposal.summary && <p>{oracleProposal.summary}</p>}
                  {oracleProposal.observedValue && <p>Observed: {oracleProposal.observedValue}</p>}
                  {oracleProposal.dataHash && oracleProposal.dataHash !== ZERO_HASH && <p>Oracle hash {shortAddress(oracleProposal.dataHash)}</p>}
                  {oracleProposal.autoProposed && oracleProposal.txHash && (
                    <p>Oracle submitted this proposal onchain. Dispute and owner review remain available.</p>
                  )}
                  {oracleProposal.txHash && (
                    <a href={`${ARC_EXPLORER_URL}/tx/${oracleProposal.txHash}`} target="_blank" rel="noreferrer">
                      View oracle proposal transaction
                    </a>
                  )}
                  {oracleProposal.autoProposeSkipped && <p>{oracleProposal.autoProposeSkipped}</p>}
                  {oracleProposal.autoProposeError && <p>{oracleProposal.autoProposeError}</p>}
                </div>
                {oracleProposal.checks && oracleProposal.checks.length > 0 && (
                  <div className="agent-checklist">
                    {oracleProposal.checks.slice(0, 4).map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                )}
                {oracleProposal.sourceUrls && oracleProposal.sourceUrls.length > 0 && (
                  <div className="agent-evidence-list">
                    {oracleProposal.sourceUrls.slice(0, 4).map((url) => (
                      <article key={url}>
                        <strong>{urlHostLabel(url)}</strong>
                        <a href={url} target="_blank" rel="noreferrer">
                          Open source
                        </a>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="top-traders-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-label">Top traders</span>
                  <h3>Copy trade setup</h3>
                </div>
                <span>{topTraderRows.length} wallets</span>
              </div>
              <div className="top-trader-list">
                {topTraderRows.length === 0 && <span>No trader activity indexed for this market yet.</span>}
                {topTraderRows.map((trader, index) => (
                  <article key={trader.address}>
                    <div>
                      <strong>#{index + 1} {displayNameForAddress(trader.address)}</strong>
                      <small>
                        YES {formatMarketAmount(trader.yes, selectedMarket)} / NO {formatMarketAmount(trader.no, selectedMarket)}
                      </small>
                    </div>
                    <span>{formatMarketAmount(trader.total, selectedMarket)} {marketSymbol(selectedMarket)}</span>
                    <button className="secondary" onClick={() => copyTraderPosition(trader)} type="button">
                      Copy
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : (
          <section className="locked-market-tools">
            <strong>Wallet required for market tools</strong>
            <span>Aura Agent, copy trading, and resolver tools are available after wallet connection.</span>
          </section>
        )}

        <section className="market-history-panel">
          <div className="panel-heading market-history-heading">
            <div>
              <span className="section-label">Player history</span>
              <h3>Market #{selectedMarket.id} bets</h3>
            </div>
            <label className="wallet-history-search">
              <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16 16 4 4" />
              </svg>
              <span className="search-prefix">Search</span>
              <input
                aria-label="Search wallet in this market"
                placeholder="Wallet address or name"
                value={marketWalletSearch}
                onChange={(event) => setMarketWalletSearch(event.target.value)}
              />
            </label>
          </div>
          <div className="market-history-list">
            {marketHistoryRows.length === 0 && (
              <span>
                {selectedMarketActivities.length === 0
                  ? "No indexed bets for this market yet."
                  : "No wallet matches this search."}
              </span>
            )}
            {marketHistoryRows.map((activity) => (
              <article key={activity.id}>
                <div>
                  <strong>{displayNameForAddress(activity.user)}</strong>
                  <small>{shortAddress(activity.user)} / {closeDate(activity.timestamp)}</small>
                </div>
                <span className={activity.side === Outcome.Yes ? "history-side yes" : "history-side no"}>
                  {activity.side === Outcome.Yes ? "YES" : "NO"}
                </span>
                <strong>{formatMarketAmount(activity.amount, selectedMarket)} {marketSymbol(selectedMarket)}</strong>
                {activity.txHash && (
                  <a href={`${ARC_EXPLORER_URL}/tx/${activity.txHash}`} target="_blank" rel="noreferrer">
                    Tx
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>

        {hasWalletAccess && (
          <section className="market-timeline">
          {[
            { label: "Created", active: true, detail: `Market #${selectedMarket.id}` },
            { label: "Trading open", active: Date.now() / 1000 < selectedMarket.closeTime, detail: countdownText(selectedMarket.closeTime, currentTime) },
            { label: "Trading closed", active: Date.now() / 1000 >= selectedMarket.closeTime, detail: closeDate(selectedMarket.closeTime) },
            { label: "Resolution time", active: Date.now() / 1000 >= resolutionTimeFor(selectedMarket), detail: closeDate(resolutionTimeFor(selectedMarket)) },
            { label: "Resolving", active: selectedMarket.proposedAt > 0 || selectedMarket.outcome !== Outcome.Unresolved, detail: selectedMarket.proposedAt > 0 ? outcomeLabel(selectedMarket.proposedOutcome) : "Waiting" },
            { label: "Resolved", active: selectedMarket.outcome !== Outcome.Unresolved, detail: outcomeLabel(selectedMarket.outcome) }
          ].map((step, index) => (
            <div className={step.active ? "timeline-step active" : "timeline-step"} key={step.label}>
              <span>{step.active ? "✓" : index + 1}</span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
          ))}
          </section>
        )}

        {hasWalletAccess && relatedMarkets.length > 0 && (
          <section className="related-market-section">
            <div className="market-section-header">
              <div className="market-section-title">
                <span className="section-dot" />
                <h3>Related {selectedMarket.category || "Other"} markets</h3>
              </div>
              <span>{relatedMarkets.length} suggestions</span>
            </div>
            <div className="related-market-grid">
              {relatedMarkets.map((market) => {
                const relatedTotal = marketVolume(market);
                const relatedYes = percent(market.yesPool, relatedTotal);
                const relatedMeta = categoryMeta(market.category || "Other");
                return (
                  <button
                    className="related-market-card"
                    key={market.id}
                    onClick={() => openMarket(market.id)}
                    type="button"
                  >
                    <span className={`category ${relatedMeta.className}`}>
                      <CategoryIcon category={market.category || "Other"} />
                      {market.category || "Other"}
                    </span>
                    <strong>{shortQuestion(market.question)}</strong>
                    <div className="related-market-meter">
                      <span style={{ width: `${relatedYes}%` }} />
                    </div>
                    <small>
                      YES {relatedYes.toFixed(0)}% / {formatMarketAmount(relatedTotal, market)} {marketSymbol(market)} / {countdownText(market.closeTime, currentTime)}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </section>
    );
  };

  return (
    <main className="app-shell" id="top">
      <AppUpdateNotice />
      <nav className="topbar">
        <a
          className="brand"
          href="#top"
          aria-label="AuraPredict home"
          onClick={(event) => {
            event.preventDefault();
            goHomeTop();
          }}
        >
          <img src="/aurapredict-logo.png" alt="AuraPredict" />
          <span className="brand-name">AuraPredict</span>
          <span className="arc-topbar-chip">
            <img src="/arc-icon-navy-gradient.svg" alt="" />
            Arc
          </span>
        </a>
        <div className="topbar-center">
          <div className="nav-tabs">
            <button
              className={view === "markets" || view === "collection" || view === "market" ? "tab active" : "tab"}
              onClick={goHomeTop}
            >
              Markets
            </button>
            <button
              className={view === "ended" ? "tab active" : "tab"}
              onClick={() => {
                setSelectedMarketId(null);
                setSelectedProfileAddress("");
                updateMarketRoute(null);
                setView("ended");
              }}
            >
              Ended
            </button>
            <button
              className={view === "leaderboard" ? "tab active" : "tab"}
              onClick={() => {
                setSelectedMarketId(null);
                setSelectedProfileAddress("");
                updateMarketRoute(null);
                setView("leaderboard");
              }}
            >
              Leaderboard
            </button>
            <button
              className={view === "security" ? "tab active" : "tab"}
              onClick={() => {
                setSelectedMarketId(null);
                setSelectedProfileAddress("");
                updateMarketRoute(null);
                setView("security");
              }}
            >
              Security
            </button>
            {canReviewAsOwner && (
              <button
                className={view === "owner" ? "tab active" : "tab"}
                onClick={() => {
                  setSelectedMarketId(null);
                  setSelectedProfileAddress("");
                  updateMarketRoute(null);
                  setView("owner");
                }}
              >
                {isProtocolOwner ? "Owner" : "Review"}
              </button>
            )}
          </div>
          <div className="market-search">
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              aria-label="Search markets"
              placeholder="Search markets..."
              value={searchQuery}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchFocused(true);
              }}
              onFocus={() => setSearchFocused(true)}
            />
            {searchFocused && searchQuery.trim() && (
              <div className="search-dropdown">
                {searchResults.length === 0 && <div className="search-empty">No matching markets</div>}
                {searchResults.map((market) => {
                  const meta = categoryMeta(market.category || "Other");
                  return (
                    <button
                      className="search-result"
                      key={market.id}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        openSearchedMarket(market);
                      }}
                      type="button"
                    >
                      <span className={`category ${meta.className}`}>
                        <CategoryIcon category={market.category || "Other"} />
                        {market.category || "Other"}
                      </span>
                      <strong>{shortQuestion(market.question)}</strong>
                      <small>
                        {marketStatus(market)} / {formatMarketAmount(marketVolume(market), market)} {marketSymbol(market)} / {closeDate(market.closeTime)}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="clock-widget">
            <span>UTC</span>
            <div>
              <strong>{formattedClock}</strong>
              <small>{formattedUtcDate}</small>
            </div>
          </div>
        </div>
        <div className="wallet-panel">
          <div className="theme-menu" ref={themeMenuRef}>
            <button
              className="theme-trigger"
              onClick={() => {
                setThemeMenuOpen((current) => !current);
                setWalletMenuOpen(false);
                setNotificationMenuOpen(false);
              }}
              type="button"
              aria-label="Theme"
            >
              <ThemeIcon theme={theme} />
            </button>
            {themeMenuOpen && (
              <div className="theme-dropdown">
                <button
                  className={theme === "dark" ? "theme-option active" : "theme-option"}
                  onClick={() => setThemeMode("dark")}
                  type="button"
                >
                  <ThemeIcon theme="dark" />
                  <span>Dark mode</span>
                  {theme === "dark" && <CheckIcon />}
                </button>
                <button
                  className={theme === "light" ? "theme-option active" : "theme-option"}
                  onClick={() => setThemeMode("light")}
                  type="button"
                >
                  <ThemeIcon theme="light" />
                  <span>Light mode</span>
                  {theme === "light" && <CheckIcon />}
                </button>
              </div>
            )}
          </div>
          <a href={ARC_EXPLORER_URL} target="_blank" rel="noreferrer">
            Arcscan
          </a>
          {account ? (
            <>
              <div className="notification-menu" ref={notificationMenuRef}>
                <button
                  className="notification-button"
                  onClick={() => {
                    setNotificationMenuOpen((current) => !current);
                    setWalletMenuOpen(false);
                  }}
                  aria-label="Notifications"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2Z" />
                    <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
                  </svg>
                  {notificationCount > 0 && <b>{notificationCount}</b>}
                </button>
                {notificationMenuOpen && (
                  <div className="notification-dropdown">
                    <div className="wallet-dropdown-head">
                      <span>Notifications</span>
                      <strong>{notificationCount} updates</strong>
                    </div>
                    <button className="secondary notification-view-all" onClick={openNotifications} type="button">
                      View all notifications
                    </button>
                    {notificationCount === 0 && (
                      <div className="notification-empty">No pending resolution or claim actions.</div>
                    )}
                    {claimNotifications.length > 1 && (
                      <div className="notification-bulk-actions">
                        <button onClick={claimAll} disabled={transactionPending} type="button">
                          Claim all {formatUsdc(claimableTotal, defaultSettlementDecimals)} {aggregateAssetLabel}
                        </button>
                      </div>
                    )}
                    {resolveNotifications.map((market) => {
                      const hint = resolveActionHint(market);
                      const cancelOnlyResolution = requiresCancelForLiquidity(market);
                      const resolutionReadyAt = resolutionUnlockTime(market);
                      const aiReceipt = aiResolutionReceipts[String(market.id)];
                      const aiSuggestedOutcome = aiOutcomeFromReceipt(aiReceipt);
                      const aiCanPropose = aiSuggestedOutcome === Outcome.Yes || aiSuggestedOutcome === Outcome.No;
                      const auraStatusText = cancelOnlyResolution
                        ? "Cancel / refund required. Aura review is not needed."
                        : aiCanPropose
                        ? `AI suggests ${outcomeLabel(aiSuggestedOutcome)}`
                        : resolveAuraStatusLabel(market);
                      return (
                        <article className="notification-card" key={`resolve-${market.id}`}>
                          <span>Result needed</span>
                          <strong>{shortQuestion(market.question)}</strong>
                          <small>Closed {closeDate(market.closeTime)}. Creator bond stays locked during dispute window.</small>
                          {resolutionReadyAt > market.closeTime && (
                            <small>Resolution unlock: {closeDate(resolutionReadyAt)} (rule timestamp).</small>
                          )}
                          <small>{auraStatusText}</small>
                          {hint && <small>{hint}</small>}
                          <small>Ended tab updates after finalization, not right after proposal.</small>
                          <div className="notification-actions">
                            <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">
                              Open Resolution
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {finalizeNotifications.map((market) => (
                      <article className="notification-card" key={`finalize-${market.id}`}>
                        <span>Ready to finalize</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>Proposed {outcomeLabel(market.proposedOutcome)}. No dispute was opened.</small>
                        <div className="notification-actions">
                          <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">
                            Open Resolution
                          </button>
                        </div>
                      </article>
                    ))}
                    {ownerAiMismatchNotifications.map((market) => {
                      const receipt = aiResolutionReceipts[String(market.id)];
                      const aiOutcome = aiOutcomeFromReceipt(receipt);
                      return (
                        <article className="notification-card" key={`owner-ai-mismatch-${market.id}`}>
                          <span>Owner review: AI mismatch</span>
                          <strong>{shortQuestion(market.question)}</strong>
                          <small>
                            AI suggested {outcomeLabel(aiOutcome)} but resolver proposed {outcomeLabel(market.proposedOutcome)}.
                          </small>
                          <div className="notification-actions">
                            <button className="secondary" onClick={() => openMarket(market.id)} type="button">
                              View market
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {disputeReviewNotifications.map((market) => (
                      <article className="notification-card" key={`review-${market.id}`}>
                        <span>{market.disputed ? "Dispute review" : "Authority review"}</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>
                          {market.disputed
                            ? `Proposed ${outcomeLabel(market.proposedOutcome)}. Disputer ${displayNameForAddress(market.disputer)}.`
                            : `Proposed ${outcomeLabel(market.proposedOutcome)}. This result is held for authority review.`}
                        </small>
                        <div className="notification-actions">
                          <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">
                            Open Review
                          </button>
                        </div>
                      </article>
                    ))}
                    {staleDisputeNotifications.map((market) => (
                      <article className="notification-card" key={`stale-${market.id}`}>
                        <span>Stale review</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>Authority did not finalize after the grace period. Cancel refunds positions.</small>
                        <div className="notification-actions">
                          <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">
                            Open Review
                          </button>
                        </div>
                      </article>
                    ))}
                    {proposedResultNotifications.map((market) => {
                      const aiReceipt = aiResolutionReceipts[String(market.id)];
                      const aiSuggestedOutcome = aiOutcomeFromReceipt(aiReceipt);
                      const dismissKey = `${account.toLowerCase()}:proposal:${market.id}:${market.proposedAt}:${market.proposedOutcome}`;
                      return (
                        <article className="notification-card" key={`proposal-${market.id}-${market.proposedAt}`}>
                          <span>Result proposed</span>
                          <strong>{shortQuestion(market.question)}</strong>
                          <small>
                            Resolver proposed {outcomeLabel(market.proposedOutcome)}
                            {aiSuggestedOutcome !== Outcome.Unresolved ? `. AI suggested ${outcomeLabel(aiSuggestedOutcome)}.` : "."}
                          </small>
                          <div className="notification-actions">
                            {!market.disputed && market.disputeDeadline > nowSeconds && (
                              <button className="secondary" onClick={() => disputeMarket(market.id)}>
                                Dispute {formatMarketAmount(market.termsDisputeBond ?? disputeBond, market)} {marketSymbol(market)}
                              </button>
                            )}
                            <button className="secondary" onClick={() => openMarket(market.id)} type="button">
                              View market
                            </button>
                            <button className="secondary" onClick={() => dismissNotificationByKey(dismissKey)} type="button">
                              Dismiss
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {disputeResolvedNotifications.map((market) => {
                      const dismissKey = `${account.toLowerCase()}:dispute-resolved:${market.id}:${market.outcome}`;
                      return (
                        <article className="notification-card" key={`dispute-resolved-${market.id}-${market.outcome}`}>
                          <span>Dispute resolved</span>
                          <strong>{shortQuestion(market.question)}</strong>
                          <small>Final outcome is {outcomeLabel(market.outcome)} after dispute review by owner/authority.</small>
                          <div className="notification-actions">
                            <button className="secondary" onClick={() => openMarket(market.id)} type="button">
                              View market
                            </button>
                            <button className="secondary" onClick={() => dismissNotificationByKey(dismissKey)} type="button">
                              Dismiss
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {claimNotifications.map((market) => (
                      <article className="notification-card" key={`claim-${market.id}`}>
                        <span>Claim available</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>{formatMarketAmount(market.potentialPayout, market)} {marketSymbol(market)} ready</small>
                        <button onClick={() => claim(market.id)}>Claim payout</button>
                      </article>
                    ))}
                    {resultNotifications.map((market) => (
                      <article className="notification-card" key={`result-${market.id}`}>
                        <span>Result posted</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>{outcomeLabel(market.outcome)}. No payout is available for this position.</small>
                        <button className="secondary" onClick={() => dismissResultNotification(market)}>
                          Dismiss
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div className="wallet-menu" ref={walletMenuRef}>
                <button
                  className="wallet-button"
                  onClick={() => {
                    setWalletMenuOpen((current) => !current);
                    setNotificationMenuOpen(false);
                  }}
                  title={profileDisplayName}
                >
                  <span className="wallet-dot" />
                  <span className="wallet-label">{topbarProfileLabel}</span>
                  <span className="chevron">v</span>
                </button>
                {walletMenuOpen && (
                  <div className="wallet-dropdown">
                    <div className="wallet-dropdown-head">
                      <span>Connected wallet</span>
                      <div className="wallet-address-row">
                        <strong>{shortAddress(account)}</strong>
                        <button
                          className="wallet-refresh-button"
                          onClick={() => copyTextToClipboard(account, "Wallet address copied.")}
                          type="button"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div className={`wallet-network-state ${isArcNetwork ? "ok" : "warning"}`}>
                      <span>{isArcNetwork ? "Network: Arc Testnet" : "Network: Not Arc Testnet"}</span>
                      {!isArcNetwork && (
                        <button
                          className="wallet-refresh-button"
                          onClick={() => ensureArcNetwork()}
                          type="button"
                          disabled={switchingNetwork}
                        >
                          {switchingNetwork ? "Switching..." : "Switch Network"}
                        </button>
                      )}
                    </div>
                    <div className="wallet-balance-row">
                      <div>
                        <span>Available USDC</span>
                        <strong>{formatUsdc(walletUsdcBalance, defaultSettlementDecimals)}</strong>
                      </div>
                    </div>
                    <div className="wallet-balance-row">
                      <div>
                        <span>Available EURC</span>
                        <strong>{formatUsdc(walletEurcBalance, defaultSettlementDecimals)}</strong>
                      </div>
                      <button className="wallet-refresh-button" onClick={() => refreshWalletBalance()} type="button">
                        Refresh
                      </button>
                    </div>
                    <a className="wallet-faucet-link" href={ARC_FAUCET_URL} target="_blank" rel="noreferrer">
                      Faucet
                    </a>
                    <button onClick={openProfile}>View Profile</button>
                    <button onClick={disconnectWallet}>Disconnect</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={openWalletModal} disabled={connecting}>
              {connecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </nav>

      {notice && (
        <div className="toast-notice">
          <span>{notice}</span>
          {noticeTxHash && (
            <a href={transactionUrl(noticeTxHash)} target="_blank" rel="noreferrer">
              View on explorer
            </a>
          )}
        </div>
      )}

      <section className="activity-ticker" aria-label="Recent market activity">
        <div className="ticker-track">
          {tickerActivities.length > 0 &&
            tickerActivities.map((activity, index) => {
              const activityMarket = markets.find((market) => market.id === activity.marketId);
              return (
                <button
                  className="ticker-item"
                  disabled={!activityMarket}
                  key={`${activity.id}-${index}`}
                  onClick={() => activityMarket && openMarket(activityMarket.id)}
                  type="button"
                >
                  <strong>{displayNameForAddress(activity.user)}</strong> bought{" "}
                  <b className={activity.side === Outcome.Yes ? "ticker-yes" : "ticker-no"}>
                    {activity.side === Outcome.Yes ? "YES" : "NO"}
                  </b>{" "}
                  {activityMarket ? formatMarketAmount(activity.amount, activityMarket) : formatUsdc(activity.amount)}{" "}
                  {activityMarket ? marketSymbol(activityMarket) : defaultSettlementSymbol} on {shortQuestion(activity.question)}
                  {activity.timestamp > 0 ? ` - ${timeAgo(activity.timestamp, currentTime)}` : ""}
                </button>
              );
            })}
          {tickerActivities.length === 0 &&
            tickerFallbackLoop.map((market, index) => {
              const yesPercent = percent(market.yesPool, marketVolume(market));
              return (
                <button className="ticker-item" key={`fallback-${market.id}-${index}`} onClick={() => openMarket(market.id)} type="button">
                  <strong>Market #{market.id}</strong> has {formatMarketAmount(marketVolume(market), market)} {marketSymbol(market)} live liquidity on{" "}
                  {shortQuestion(market.question)} - YES {yesPercent.toFixed(0)}%
                </button>
              );
            })}
          {tickerActivities.length === 0 && tickerFallbackLoop.length === 0 && (
            <span className="ticker-item">
              Recent trades will appear here once players stake YES or NO on AuraPredict markets.
            </span>
          )}
        </div>
      </section>

      {view === "markets" && (
        <section className="hero-band">
          <div className="hero-copy">
            <p className="network-kicker">
              <span className="hero-arc-mark">
                <img src="/arc-icon-white.svg" alt="" />
                Arc Testnet
              </span>
              prediction markets
            </p>
            <h1>
              AI-powered prediction markets on <span>Arc.</span>
            </h1>
            <p>
              Transparent outcomes, verifiable data, smarter markets.
              Create YES/NO markets with Aura-assisted evidence review and objective oracle checks.
            </p>
            <div className="hero-actions">
              <button className="button-link hero-launch-button" onClick={account ? openCreateMarket : openWalletModal} disabled={connecting}>
                {connecting ? "Connecting..." : "Launch Market"}
              </button>
              {!account && (
                <small className="hero-action-note">Connect a wallet to launch a market on Arc Testnet.</small>
              )}
              {account && !isArcNetwork && (
                <small className="hero-action-note">Wallet is connected. Switch to Arc Testnet before signing.</small>
              )}
            </div>
          </div>
          <aside className="hero-hot-panel">
            <div className="hero-hot-head">
              <div>
                <span className="section-label">Hot markets</span>
                <strong>Live markets moving now</strong>
              </div>
              <div className="hero-activity-actions">
                <span className="hero-live-pill">{liveMarkets} live</span>
                <button className="hero-see-all-button" onClick={() => openCollection("live")} type="button">
                  See all
                </button>
              </div>
            </div>
            <div className="hero-hot-window" aria-label="Hot live markets">
              {heroHotLoop.length > 0 ? (
                <div className="hero-hot-track">
                  {heroHotLoop.map((market, index) => {
                    const hotVolume = marketVolume(market);
                    const hotYesPercent = percent(market.yesPool, hotVolume);
                    return (
                      <button
                        className="hero-hot-card"
                        key={`${market.id}-${index}`}
                        onClick={() => openMarket(market.id)}
                        type="button"
                      >
                        <small>
                          #{market.id} · {market.category || "Other"} · {market.traderCount} traders
                        </small>
                        <strong>{market.question}</strong>
                        <div className="hero-hot-meter" aria-hidden="true">
                          <span style={{ width: `${Math.max(2, Math.min(98, hotYesPercent))}%` }} />
                        </div>
                        <small>
                          YES {hotYesPercent.toFixed(0)}% · {formatMarketAmount(hotVolume, market)} {marketSymbol(market)}
                        </small>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="hero-hot-empty">No live markets yet.</div>
              )}
            </div>
          </aside>
        </section>
      )}

      {!hasContract && (
        <section className="alert">
          Contract address is missing. Deploy the new contract, then set
          <code> VITE_PREDICTION_MARKET_ADDRESS </code>
          in your <code>.env</code> file and in Vercel.
        </section>
      )}

      <section className={view === "collection" || view === "market" ? "command-grid command-grid-full" : "command-grid"}>
        <section className="market-board" id="markets">
          <div className="board-header">
            <div>
              <span className="section-label">
                {view === "collection" ? "See all" : view === "market" ? "Market" : "Explore"}
              </span>
              <h2>{boardTitle}</h2>
              {view === "collection" && <p>{collectionDescription}</p>}
              {view === "market" && <p>Open a market to review odds, stake, settlement state, and timeline.</p>}
              {view === "leaderboard" && (
                <p>
                  Top {LEADERBOARD_LIMIT} wallets per metric. Updates at the top of every UTC hour while this app is open.
                  Last refresh: {lastRefreshText}.
                </p>
              )}
              {view === "security" && (
                <p>
                  AuraPredict is still a testnet MVP. This page keeps audit status, contract custody, resolution risk,
                  and user safety notes visible before mainnet decisions.
                </p>
              )}
            </div>
            <div className="board-actions">
              {view === "security" ? (
                <button className="secondary" onClick={backToMarkets} type="button">
                  Back to markets
                </button>
              ) : view === "collection" || view === "market" ? (
                <>
                  <button className="secondary" onClick={backToMarkets} type="button">
                    Back to markets
                  </button>
                  <button className="secondary" onClick={loadMarkets} disabled={loading || !hasContract}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                  {view !== "market" && hasMoreMarkets && (
                    <button className="secondary" onClick={() => loadMoreMarkets(false)} disabled={loading || !hasContract} type="button">
                      Load more
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button className="secondary" onClick={loadMarkets} disabled={loading || !hasContract}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                  {view !== "leaderboard" && hasMoreMarkets && (
                    <button className="secondary" onClick={() => loadMoreMarkets(false)} disabled={loading || !hasContract} type="button">
                      Load more
                    </button>
                  )}
                  {view !== "ended" && view !== "leaderboard" && <button onClick={openCreateMarket}>Create Market</button>}
                </>
              )}
            </div>
          </div>

          {view !== "leaderboard" && view !== "profile" && view !== "market" && view !== "security" && view !== "owner" && (
            <div className="category-row">
              {CATEGORIES.map((category) => (
                <button
                  className={`${activeCategory === category ? "category-pill active" : "category-pill"} ${
                    categoryMeta(category).className
                  }`}
                  key={category}
                  onClick={() => {
                    setActiveCategory(category);
                    setCollectionPage(1);
                  }}
                >
                  <CategoryIcon category={category} />
                  {category}
                </button>
              ))}
              <div className="view-mode-toggle" aria-label="Market view mode">
                <button
                  className={marketViewMode === "grid" ? "active" : ""}
                  onClick={() => setMarketViewMode("grid")}
                  type="button"
                  aria-label="Grid view"
                >
                  <GridViewIcon />
                </button>
                <button
                  className={marketViewMode === "list" ? "active" : ""}
                  onClick={() => setMarketViewMode("list")}
                  type="button"
                  aria-label="List view"
                >
                  <ListViewIcon />
                </button>
              </div>
            </div>
          )}

          {view === "market" ? (
            renderMarketDetail()
          ) : view === "notifications" ? (
            <section className="notifications-page">
              <div className="notifications-page-head">
                <div>
                  <span className="section-label">Wallet actions</span>
                  <h3>{notificationCount} pending notifications</h3>
                </div>
                {claimNotifications.length > 1 && (
                  <button onClick={claimAll} disabled={transactionPending} type="button">
                    Claim all {formatUsdc(claimableTotal, defaultSettlementDecimals)} {aggregateAssetLabel}
                  </button>
                )}
              </div>
              {notificationCount === 0 && (
                <div className="empty-state">
                  <strong>No pending notifications</strong>
                  <span>Claim, resolve, dispute, and result notices will appear here.</span>
                </div>
              )}
              {resolveNotifications.map((market) => {
                const hint = resolveActionHint(market);
                const cancelOnlyResolution = requiresCancelForLiquidity(market);
                const resolutionReadyAt = resolutionUnlockTime(market);
                const aiReceipt = aiResolutionReceipts[String(market.id)];
                const aiSuggestedOutcome = aiOutcomeFromReceipt(aiReceipt);
                const aiCanPropose = aiSuggestedOutcome === Outcome.Yes || aiSuggestedOutcome === Outcome.No;
                const auraStatusText = cancelOnlyResolution
                  ? "Cancel / refund required. Aura review is not needed."
                  : aiCanPropose
                  ? `AI suggests ${outcomeLabel(aiSuggestedOutcome)}`
                  : resolveAuraStatusLabel(market);
                return (
                  <article className="notification-card" key={`page-resolve-${market.id}`}>
                    <span>Result needed</span>
                    <strong>{shortQuestion(market.question)}</strong>
                    <small>Closed {closeDate(market.closeTime)}. Creator bond stays locked during dispute window.</small>
                    {resolutionReadyAt > market.closeTime && (
                      <small>Resolution unlock: {closeDate(resolutionReadyAt)} (rule timestamp).</small>
                    )}
                    <small>{auraStatusText}</small>
                    {hint && <small>{hint}</small>}
                    <small>Ended tab updates after finalization, not right after proposal.</small>
                    <div className="notification-actions">
                      <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">Open Resolution</button>
                    </div>
                  </article>
                );
              })}
              {finalizeNotifications.map((market) => (
                <article className="notification-card" key={`page-finalize-${market.id}`}>
                  <span>Ready to finalize</span>
                  <strong>{shortQuestion(market.question)}</strong>
                  <small>Proposed {outcomeLabel(market.proposedOutcome)}. No dispute was opened.</small>
                  <div className="notification-actions">
                    <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">Open Resolution</button>
                  </div>
                </article>
              ))}
              {ownerAiMismatchNotifications.map((market) => {
                const receipt = aiResolutionReceipts[String(market.id)];
                const aiOutcome = aiOutcomeFromReceipt(receipt);
                return (
                  <article className="notification-card" key={`page-owner-ai-mismatch-${market.id}`}>
                    <span>Owner review: AI mismatch</span>
                    <strong>{shortQuestion(market.question)}</strong>
                    <small>
                      AI suggested {outcomeLabel(aiOutcome)} but resolver proposed {outcomeLabel(market.proposedOutcome)}.
                    </small>
                    <div className="notification-actions">
                      <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">Open Resolution</button>
                    </div>
                  </article>
                );
              })}
              {disputeReviewNotifications.map((market) => (
                <article className="notification-card" key={`page-review-${market.id}`}>
                  <span>{market.disputed ? "Dispute review" : "Authority review"}</span>
                  <strong>{shortQuestion(market.question)}</strong>
                  <small>
                    {market.disputed
                      ? `Proposed ${outcomeLabel(market.proposedOutcome)}. Disputer ${displayNameForAddress(market.disputer)}.`
                      : `Proposed ${outcomeLabel(market.proposedOutcome)}. This result is held for authority review.`}
                  </small>
                  <div className="notification-actions">
                    <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">Open Review</button>
                  </div>
                </article>
              ))}
              {staleDisputeNotifications.map((market) => (
                <article className="notification-card" key={`page-stale-${market.id}`}>
                  <span>Stale review</span>
                  <strong>{shortQuestion(market.question)}</strong>
                  <small>Authority did not finalize after the grace period. Cancel refunds positions.</small>
                  <div className="notification-actions">
                    <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">Open Review</button>
                  </div>
                </article>
              ))}
              {proposedResultNotifications.map((market) => {
                const aiReceipt = aiResolutionReceipts[String(market.id)];
                const aiSuggestedOutcome = aiOutcomeFromReceipt(aiReceipt);
                const dismissKey = `${account.toLowerCase()}:proposal:${market.id}:${market.proposedAt}:${market.proposedOutcome}`;
                return (
                  <article className="notification-card" key={`page-proposal-${market.id}-${market.proposedAt}`}>
                    <span>Result proposed</span>
                    <strong>{shortQuestion(market.question)}</strong>
                    <small>
                      Resolver proposed {outcomeLabel(market.proposedOutcome)}
                      {aiSuggestedOutcome !== Outcome.Unresolved ? `. AI suggested ${outcomeLabel(aiSuggestedOutcome)}.` : "."}
                    </small>
                    <div className="notification-actions">
                      {!market.disputed && market.disputeDeadline > nowSeconds && (
                        <button className="secondary" onClick={() => disputeMarket(market.id)}>
                          Dispute {formatMarketAmount(market.termsDisputeBond ?? disputeBond, market)} {marketSymbol(market)}
                        </button>
                      )}
                      <button className="secondary" onClick={() => openMarket(market.id)} type="button">View market</button>
                      <button className="secondary" onClick={() => dismissNotificationByKey(dismissKey)} type="button">Dismiss</button>
                    </div>
                  </article>
                );
              })}
              {disputeResolvedNotifications.map((market) => {
                const dismissKey = `${account.toLowerCase()}:dispute-resolved:${market.id}:${market.outcome}`;
                return (
                  <article className="notification-card" key={`page-dispute-resolved-${market.id}-${market.outcome}`}>
                    <span>Dispute resolved</span>
                    <strong>{shortQuestion(market.question)}</strong>
                    <small>Final outcome is {outcomeLabel(market.outcome)} after dispute review by owner/authority.</small>
                    <div className="notification-actions">
                      <button className="secondary" onClick={() => openMarket(market.id)} type="button">View market</button>
                      <button className="secondary" onClick={() => dismissNotificationByKey(dismissKey)} type="button">Dismiss</button>
                    </div>
                  </article>
                );
              })}
              {claimNotifications.map((market) => (
                <article className="notification-card" key={`page-claim-${market.id}`}>
                  <span>Claim available</span>
                  <strong>{shortQuestion(market.question)}</strong>
                  <small>{formatMarketAmount(market.potentialPayout, market)} {marketSymbol(market)} ready</small>
                  <div className="notification-actions">
                    <button onClick={() => claim(market.id)}>Claim payout</button>
                    <button className="secondary" onClick={() => openMarket(market.id)} type="button">View market</button>
                  </div>
                </article>
              ))}
              {resultNotifications.map((market) => (
                <article className="notification-card" key={`page-result-${market.id}`}>
                  <span>Result posted</span>
                  <strong>{shortQuestion(market.question)}</strong>
                  <small>{outcomeLabel(market.outcome)}. No payout is available for this position.</small>
                  <div className="notification-actions">
                    <button className="secondary" onClick={() => dismissResultNotification(market)}>Dismiss</button>
                    <button className="secondary" onClick={() => openMarket(market.id)} type="button">View market</button>
                  </div>
                </article>
              ))}
            </section>
          ) : view === "owner" ? (
            <section className="owner-console">
              {isProtocolOwner ? (
                <>
                  <div className="owner-console-head">
                    <div>
                      <span className="section-label">Owner dashboard</span>
                      <h3>Project management and reporting</h3>
                      <p>Visible only to the protocol owner wallet. Review usage, token volume, fees, and escalated markets from one page.</p>
                    </div>
                    <div className="owner-wallet-pill">
                      <span>Owner</span>
                      <strong>{shortAddress(owner)}</strong>
                    </div>
                  </div>

                  <div className="owner-dashboard-grid">
                    <article className="owner-panel owner-panel-wide">
                      <span className="section-label">Volume by token</span>
                      <div className="owner-token-grid">
                        {statsAssetBreakdown.length > 0 ? (
                          statsAssetBreakdown.map((asset) => (
                            <div key={`${asset.token || asset.symbol}-owner-volume`} className="owner-token-card">
                              <span>{asset.symbol}</span>
                              <strong>{formatUsdc(asset.totalVolume, asset.decimals)}</strong>
                              <small>Live {formatUsdc(asset.liveLiquidity, asset.decimals)} / Avg {formatUsdc(asset.averageMarketVolume, asset.decimals)}</small>
                              <small>{asset.marketCount} markets / {asset.participantEntries} entries</small>
                            </div>
                          ))
                        ) : (
                          <div className="owner-token-card">
                            <span>Token volume</span>
                            <strong>--</strong>
                            <small>Waiting for indexer data</small>
                          </div>
                        )}
                      </div>
                    </article>

                    <article className="owner-panel">
                      <span className="section-label">Market report</span>
                      <div className="owner-report-grid">
                        <div><span>Total markets</span><strong>{statsSummary.totalMarkets}</strong></div>
                        <div><span>Indexed</span><strong>{statsSummary.indexedMarkets}</strong></div>
                        <div><span>Live</span><strong>{statsSummary.liveMarkets}</strong></div>
                        <div><span>Ended</span><strong>{statsSummary.endedMarkets}</strong></div>
                        <div><span>Awaiting result</span><strong>{statsSummary.pendingMarkets}</strong></div>
                        <div><span>Known players</span><strong>{statsSummary.knownPlayers}</strong></div>
                      </div>
                    </article>

                    <article className="owner-panel">
                      <span className="section-label">User activity</span>
                      <div className="owner-report-grid">
                        <div><span>Trades</span><strong>{ownerUsageMetrics.totalTrades}</strong></div>
                        <div><span>Entries</span><strong>{statsSummary.participantEntries}</strong></div>
                        <div><span>Named profiles</span><strong>{ownerUsageMetrics.namedProfiles}</strong></div>
                        <div><span>Public profiles</span><strong>{ownerUsageMetrics.publicProfiles}</strong></div>
                        <div><span>Comments</span><strong>{ownerUsageMetrics.comments}</strong></div>
                        <div><span>Evidence links</span><strong>{ownerUsageMetrics.evidence}</strong></div>
                      </div>
                    </article>

                    <article className="owner-panel">
                      <span className="section-label">Protocol fees</span>
                      <div className="owner-fee-list">
                        {ownerFeeRows.map((asset) => (
                          <div key={`${asset.token}-fee`} className="owner-fee-row">
                            <div>
                              <span>{asset.symbol}</span>
                              <strong>{formatUsdc(asset.amount, asset.decimals)}</strong>
                            </div>
                            <button
                              className="secondary"
                              disabled={asset.amount <= 0n || transactionPending}
                              onClick={() => withdrawFees(asset.token)}
                              type="button"
                            >
                              Withdraw
                            </button>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="owner-panel">
                      <span className="section-label">Contract controls</span>
                      <div className="owner-report-grid">
                        <div><span>Contract</span><strong>{shortAddress(CONTRACT_ADDRESS)}</strong></div>
                        <div><span>Authority</span><strong>{resolutionAuthority ? shortAddress(resolutionAuthority) : shortAddress(owner)}</strong></div>
                        <div><span>Creation fee</span><strong>{formatUsdc(marketCreationFee, defaultSettlementDecimals)} {defaultSettlementSymbol}</strong></div>
                        <div><span>Creator bond</span><strong>{formatUsdc(creatorBond, defaultSettlementDecimals)} {defaultSettlementSymbol}</strong></div>
                        <div><span>Dispute bond</span><strong>{formatUsdc(disputeBond, defaultSettlementDecimals)} {defaultSettlementSymbol}</strong></div>
                        <div><span>Project fee</span><strong>{(protocolFeeBps / 100).toFixed(2)}%</strong></div>
                      </div>
                    </article>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <strong>Owner wallet required</strong>
                  <span>This management dashboard is only visible to the protocol owner. Authority wallets can still review escalated markets below.</span>
                </div>
              )}

              <div className="notifications-page-head">
                <div>
                  <span className="section-label">Review queue</span>
                  <h3>{ownerAiMismatchNotifications.length} active mismatch alerts</h3>
                </div>
              </div>
              {ownerAiMismatchNotifications.length === 0 && ownerMismatchHistory.length === 0 && (
                <div className="empty-state">
                  <strong>No owner review items</strong>
                  <span>AI mismatch and dispute escalation alerts will appear here.</span>
                </div>
              )}
              {ownerAiMismatchNotifications.map((market) => {
                const receipt = aiResolutionReceipts[String(market.id)];
                const aiOutcome = aiOutcomeFromReceipt(receipt);
                return (
                  <article className="notification-card" key={`owner-live-${market.id}`}>
                    <span>Active mismatch</span>
                    <strong>{shortQuestion(market.question)}</strong>
                    <small>AI suggested {outcomeLabel(aiOutcome)} but resolver proposed {outcomeLabel(market.proposedOutcome)}.</small>
                    <small>Dispute deadline: {market.disputeDeadline > 0 ? closeDate(market.disputeDeadline) : "Pending"}</small>
                    <div className="notification-actions">
                      <button className="secondary" onClick={() => openMarket(market.id)} type="button">View market</button>
                    </div>
                  </article>
                );
              })}
              {ownerMismatchHistory.length > 0 && (
                <div className="notifications-page-head">
                  <div>
                    <span className="section-label">History</span>
                    <h3>{ownerMismatchHistory.length} reviewed mismatch outcomes</h3>
                  </div>
                </div>
              )}
              {ownerMismatchHistory.map((market) => {
                const receipt = aiResolutionReceipts[String(market.id)];
                const aiOutcome = aiOutcomeFromReceipt(receipt);
                return (
                  <article className="notification-card" key={`owner-history-${market.id}-${market.outcome}`}>
                    <span>Reviewed mismatch</span>
                    <strong>{shortQuestion(market.question)}</strong>
                    <small>AI suggested {outcomeLabel(aiOutcome)}. Resolver proposed {outcomeLabel(market.proposedOutcome)}. Final {outcomeLabel(market.outcome)}.</small>
                    <div className="notification-actions">
                      <button className="secondary" onClick={() => openMarket(market.id)} type="button">View market</button>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : view === "collection" ? (
            <section className={`market-section section-${collectionView}`}>
              <div className="market-section-header">
                <div className="market-section-title">
                  <span
                    className={
                      collectionView === "hot"
                        ? "section-dot hot"
                        : collectionView === "closing"
                          ? "section-dot closing"
                          : collectionView === "live"
                            ? "section-dot live"
                            : "section-dot"
                    }
                  />
                  <h3>{collectionTitle}</h3>
                </div>
                <div className="section-actions">
                  <span>
                    {collectionVisibleStart}-{collectionVisibleEnd} of {collectionMarkets.length} markets
                  </span>
                  <button className="see-all-button" onClick={backToMarkets} type="button">
                    Back
                  </button>
                </div>
              </div>
              <div className="collection-toolbar">
                <label>
                  <span>Sort by</span>
                  <select
                    value={collectionSortKey}
                    onChange={(event) => {
                      setCollectionSortKey(event.target.value as MarketSortKey);
                      setCollectionPage(1);
                    }}
                  >
                    {MARKET_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Order</span>
                  <select
                    value={collectionSortDirection}
                    onChange={(event) => {
                      setCollectionSortDirection(event.target.value as SortDirection);
                      setCollectionPage(1);
                    }}
                  >
                    <option value="desc">High to low</option>
                    <option value="asc">Low to high</option>
                  </select>
                </label>
                <label>
                  <span>Currency</span>
                  <select
                    value={collectionSettlementToken}
                    onChange={(event) => {
                      setCollectionSettlementToken(event.target.value);
                      setCollectionPage(1);
                    }}
                  >
                    <option value="All">All assets</option>
                    {knownSettlementTokens.map((asset) => (
                      <option key={asset.token} value={asset.token}>
                        {asset.symbol}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="collection-page-summary">
                  Page {safeCollectionPage} of {collectionPageCount}
                </div>
              </div>
              {renderMarketCards(
                paginatedCollectionMarkets,
                `No ${collectionTitle.toLowerCase()}`,
                "Markets matching this section and category will appear here."
              )}
              {collectionPageCount > 1 && (
                <div className="pagination-row">
                  <button
                    className="secondary"
                    disabled={safeCollectionPage <= 1}
                    onClick={() => setCollectionPage((current) => Math.max(1, current - 1))}
                    type="button"
                  >
                    Previous
                  </button>
                  <span>
                    {collectionVisibleStart}-{collectionVisibleEnd} / {collectionMarkets.length}
                  </span>
                  <button
                    className="secondary"
                    disabled={safeCollectionPage >= collectionPageCount}
                    onClick={() => setCollectionPage((current) => Math.min(collectionPageCount, current + 1))}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          ) : view === "profile" ? (
            <section className="profile-view">
              <section className="profile-hero-card">
                <div className="profile-head">
                  <div className="profile-avatar">{profileInitial || "A"}</div>
                  <div className="profile-identity">
                    <form className="profile-name-form" onSubmit={saveProfileName}>
                      <input
                        maxLength={24}
                        placeholder={isOwnProfile ? "Set username" : profileDisplayName}
                        value={isOwnProfile ? profileNameInput : ""}
                        onChange={(event) => setProfileNameInput(event.target.value)}
                        disabled={!isOwnProfile}
                      />
                      <button type="submit" disabled={!isOwnProfile}>
                        Save
                      </button>
                    </form>
                    <h2>{profileDisplayName}</h2>
                    <div className="profile-id-row">
                      <span>
                        {viewedProfileAddress ? shortAddress(viewedProfileAddress) : "No wallet connected"}
                        {viewedProfileAddress && (
                          <button
                            className="copy-inline-button"
                            onClick={() => copyTextToClipboard(viewedProfileAddress, "Wallet address copied.")}
                            type="button"
                          >
                            Copy
                          </button>
                        )}
                      </span>
                      <span>Joined {profileJoinedLabel}</span>
                      {!isOwnProfile && <span>Shared profile</span>}
                    </div>
                    <div className="profile-chip-row">
                      <span>Arc Testnet</span>
                      {isOwnProfile && <span>USDC {formatUsdc(walletUsdcBalance, defaultSettlementDecimals)}</span>}
                      {isOwnProfile && <span>EURC {formatUsdc(walletEurcBalance, defaultSettlementDecimals)}</span>}
                      <span>{createdMarkets} created</span>
                      <span>{participatedProfileMarkets.length} participated</span>
                    </div>
                    <div className="badge-row profile-badge-row">
                      <span className={`reputation-tier tier-${displayedProfileTier.value}`}>
                        {displayedProfileTier.label}
                      </span>
                      {displayedProfileBadges.length === 0 && <span className="reputation-badge">New Forecaster</span>}
                      {displayedProfileBadges.map((badge) => (
                        <span className="reputation-badge" key={badge}>{badge}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="profile-actions">
                  <button
                    className={isProfilePublic ? "profile-public" : "profile-public is-private"}
                    disabled={!isOwnProfile}
                    onClick={toggleProfilePublic}
                    type="button"
                  >
                    <span className="profile-public-dot" />
                    {isProfilePublic ? "Public" : "Private"}
                    <span className="profile-toggle" />
                  </button>
                  <button className="secondary" type="button" onClick={copyProfileLink} disabled={isOwnProfile && !isProfilePublic}>
                    Share profile
                  </button>
                  {!isOwnProfile && viewedProfileAddress && (
                    <button className="secondary" type="button" onClick={() => toggleFollowCreator(viewedProfileAddress)}>
                      {followedCreators.includes(viewedProfileKey) ? "Following" : "Follow user"}
                    </button>
                  )}
                </div>
              </section>

              <section className="profile-stat-grid">
                {isOwnProfile && (
                  <article className="profile-stat-card profile-balance-card profile-liquidity-card">
                    <span>Available balances</span>
                    <strong>USDC {formatUsdc(walletUsdcBalance, defaultSettlementDecimals)}</strong>
                    <strong>EURC {formatUsdc(walletEurcBalance, defaultSettlementDecimals)}</strong>
                    <small>Arc Testnet wallet balance</small>
                    {profileSwapPair && (
                      <div className="profile-swap-panel">
                        <div className="profile-swap-title">
                          <strong>Swap stablecoins</strong>
                          <small>{CIRCLE_APP_KIT_KEY ? "Circle App Kit first, LI.FI fallback" : "LI.FI route on Arc Testnet"}</small>
                        </div>
                        <div className="profile-swap-direction" role="group" aria-label="Swap direction">
                          <button
                            className={profileSwapDirection === "USDC_TO_EURC" ? "active" : ""}
                            disabled={swapBusy !== "idle" || transactionPending}
                            onClick={() => {
                              setProfileSwapDirection("USDC_TO_EURC");
                              setSwapAmountInput("");
                              setSwapQuote(null);
                              setSwapQuotePairKey("");
                              setSwapQuoteTime(0);
                              setSwapProviderHealth({ circle: CIRCLE_APP_KIT_KEY ? "idle" : "skipped", lifi: "idle" });
                            }}
                            type="button"
                          >
                            USDC to EURC
                          </button>
                          <button
                            className={profileSwapDirection === "EURC_TO_USDC" ? "active" : ""}
                            disabled={swapBusy !== "idle" || transactionPending}
                            onClick={() => {
                              setProfileSwapDirection("EURC_TO_USDC");
                              setSwapAmountInput("");
                              setSwapQuote(null);
                              setSwapQuotePairKey("");
                              setSwapQuoteTime(0);
                              setSwapProviderHealth({ circle: CIRCLE_APP_KIT_KEY ? "idle" : "skipped", lifi: "idle" });
                            }}
                            type="button"
                          >
                            EURC to USDC
                          </button>
                        </div>
                        <div className="market-swap-balance">
                          <span>Available {profileSwapPair.fromSymbol}</span>
                          <strong>{formatUsdcInput(profileSwapSourceBalance, profileSwapPair.decimals)}</strong>
                        </div>
                        <div className="market-swap-input">
                          <input
                            inputMode="decimal"
                            placeholder={`${profileSwapPair.fromSymbol} amount`}
                            value={swapAmountInput}
                            disabled={swapBusy !== "idle" || transactionPending}
                            onChange={(event) => {
                              setSwapAmountInput(event.target.value);
                              setSwapQuote(null);
                              setSwapQuotePairKey("");
                              setSwapQuoteTime(0);
                              setSwapProviderHealth({ circle: CIRCLE_APP_KIT_KEY ? "idle" : "skipped", lifi: "idle" });
                            }}
                          />
                          <button
                            disabled={
                              swapBusy !== "idle" ||
                              transactionPending ||
                              parseUsdcInput(swapAmountInput, profileSwapPair.decimals) <= 0n
                            }
                            onClick={() => requestSwapQuote(profileSwapPair)}
                            type="button"
                          >
                            {swapBusy === "quote" ? "Quoting..." : "Get quote"}
                          </button>
                        </div>
                        <div className="market-swap-tolerance">
                          <span>Price tolerance</span>
                          <div role="group" aria-label="Swap price tolerance">
                            {SWAP_TOLERANCE_OPTIONS.map((bps) => (
                              <button
                                className={swapToleranceBps === bps ? "active" : ""}
                                disabled={swapBusy !== "idle" || transactionPending}
                                key={bps}
                                onClick={() => {
                                  setSwapToleranceBps(bps);
                                  setSwapQuote(null);
                                  setSwapQuotePairKey("");
                                  setSwapQuoteTime(0);
                                }}
                                type="button"
                              >
                                {formatSwapTolerance(bps)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="swap-provider-health" aria-live="polite">
                          <span className={`provider-badge ${swapProviderHealth.circle}`}>
                            Circle App Kit: {providerHealthLabel(swapProviderHealth.circle)}
                          </span>
                          <span className={`provider-badge ${swapProviderHealth.lifi}`}>
                            LI.FI: {providerHealthLabel(swapProviderHealth.lifi)}
                          </span>
                        </div>
                        {(swapProviderHealth.circleMessage || swapProviderHealth.lifiMessage) && (
                          <small className="market-swap-note">
                            {swapProviderHealth.circleMessage ? `Circle: ${swapProviderHealth.circleMessage}` : ""}
                            {swapProviderHealth.circleMessage && swapProviderHealth.lifiMessage ? " | " : ""}
                            {swapProviderHealth.lifiMessage ? `LI.FI: ${swapProviderHealth.lifiMessage}` : ""}
                          </small>
                        )}
                        {activeProfileSwapQuote && (
                          <div className="market-swap-quote">
                            <span>Estimated receive via {swapQuoteProviderLabel(activeProfileSwapQuote)}</span>
                            <strong>
                              {formatUsdcInput(swapQuoteEstimatedAmount(activeProfileSwapQuote, profileSwapPair), profileSwapPair.decimals)} {profileSwapPair.toSymbol}
                            </strong>
                            <small>
                              Minimum {formatUsdcInput(swapQuoteMinimumAmount(activeProfileSwapQuote, profileSwapPair), profileSwapPair.decimals)} {profileSwapPair.toSymbol}
                              {swapQuoteGasCost(activeProfileSwapQuote) ? ` / network cost about $${swapQuoteGasCost(activeProfileSwapQuote)}` : ""}
                            </small>
                            <button
                              className="market-swap-execute"
                              disabled={swapBusy !== "idle" || transactionPending}
                              onClick={() => executeStablecoinSwap(profileSwapPair)}
                              type="button"
                            >
                              {swapBusy === "execute" ? "Swapping..." : `Swap to ${profileSwapPair.toSymbol}`}
                            </button>
                          </div>
                        )}
                        <small className="market-swap-note">
                          {CIRCLE_APP_KIT_KEY ? "Aura asks Circle App Kit first, then LI.FI if that route is unavailable. " : ""}
                          Arc testnet swap liquidity is limited: EURC to USDC may have no route, and USDC to EURC may only quote for small amounts.
                        </small>
                      </div>
                    )}
                  </article>
                )}
                <article className="profile-stat-card">
                  <span>Your edge</span>
                  <strong className={displayedProfilePnl >= 0n ? "profile-positive" : "profile-negative"}>
                    {formatSignedUsdc(displayedProfilePnl, defaultSettlementDecimals)} {aggregateAssetLabel}
                  </strong>
                  <small>{profileEdgePercent.toFixed(1)}% realized return</small>
                </article>
                <article className="profile-stat-card">
                  <span>Markets resolved</span>
                  <strong>{displayedProfileResolvedCount}</strong>
                  <small>
                    {displayedProfileWonCount} wins / {displayedProfileResolvedCount} settled
                  </small>
                </article>
                <article className="profile-stat-card">
                  <span>Win streak</span>
                  <strong>{profileWinStreak}</strong>
                  <small>wins in a row</small>
                </article>
                <article className="profile-stat-card">
                  <span>Aura points</span>
                  <strong>{displayedProfileAuraScore.toLocaleString("en-US")}</strong>
                  <small>{displayedProfileWinRate.toFixed(1)}% win rate</small>
                </article>
              </section>

              <section className="profile-edge-card aura-breakdown-card">
                <div className="profile-section-title">
                  <div>
                    <h3>Aura Points breakdown</h3>
                    <span>
                      Public formula: volume, accuracy, realized edge, market creation, and settled history.
                    </span>
                  </div>
                  <strong>{displayedProfileAuraBreakdown.total.toLocaleString("en-US")} points</strong>
                </div>
                <div className="aura-breakdown-grid">
                  {displayedProfileAuraBreakdown.items.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value.toLocaleString("en-US")}</strong>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="profile-edge-card">
                <div className="profile-section-title">
                  <div>
                    <h3>What's your edge?</h3>
                    <span>
                      Realized PNL from settled markets. Current payout available: {formatUsdc(claimable, defaultSettlementDecimals)} {aggregateAssetLabel}.
                    </span>
                  </div>
                  {isOwnProfile && claimNotifications.length > 1 && (
                    <button onClick={claimAll} disabled={transactionPending} type="button">
                      Claim all {formatUsdc(claimableTotal, defaultSettlementDecimals)} {aggregateAssetLabel}
                    </button>
                  )}
                </div>
                <div className="edge-chart-wrap">
                  <svg className="edge-chart" viewBox="0 0 100 58" role="img" aria-label="Profile edge chart">
                    <path className="edge-grid" d="M8 10H96 M8 28H96 M8 46H96" />
                    <path className="edge-market-line" d="M8 48 96 12" />
                    {profileEdgePoints.length > 1 && (
                      <polyline
                        className="edge-user-line"
                        points={profileEdgePoints.map((point) => `${point.x},${point.y}`).join(" ")}
                      />
                    )}
                    {profileEdgePoints.map((point, index) => (
                      <circle
                        className={point.won ? "edge-point won" : "edge-point lost"}
                        cx={point.x}
                        cy={point.y}
                        key={`${point.x}-${index}`}
                        r="1.8"
                      />
                    ))}
                  </svg>
                  {profileEdgePoints.length === 0 && (
                    <div className="edge-empty">Resolved positions will draw your edge chart here.</div>
                  )}
                </div>
                <div className="edge-legend">
                  <span>Market line</span>
                  <span className="won">{isOwnProfile ? "You won" : "Profile won"}</span>
                  <span className="lost">{isOwnProfile ? "You lost" : "Profile lost"}</span>
                </div>
              </section>

              <section className="profile-rank-grid">
                <article>
                  <span>Volume rank</span>
                  <strong>{profileVolumeRank > 0 ? `Rank #${profileVolumeRank}` : "Unranked"}</strong>
                  <small>of {profileVolumeRows.length} traders</small>
                </article>
                <article>
                  <span>Total volume</span>
                  <strong>{formatUsdc(displayedProfileVolume, defaultSettlementDecimals)} {aggregateAssetLabel}</strong>
                  <small>all active wallet positions</small>
                </article>
                <article>
                  <span>Win rate</span>
                  <strong>{displayedProfileWinRate.toFixed(1)}%</strong>
                  <small>{displayedProfileWonCount} winning markets</small>
                </article>
                <article>
                  <span>PNL</span>
                  <strong className={displayedProfilePnl >= 0n ? "profile-positive" : "profile-negative"}>
                    {formatSignedUsdc(displayedProfilePnl, defaultSettlementDecimals)} {aggregateAssetLabel}
                  </strong>
                  <small>settled markets only</small>
                </article>
              </section>

              <div className="history-list">
                {participatedProfileMarkets.length === 0 && createdProfileMarkets.length === 0 && (
                  <div className="empty-state">
                    <strong>No profile activity yet</strong>
                    <span>Connect your wallet, stake YES/NO, or create a market to build your profile.</span>
                  </div>
                )}
                {participatedProfileMarkets.length > 0 && (
                  <div className="profile-section-title">
                    <h3>Markets participated</h3>
                    <span>
                      {participatedProfileMarkets.length} markets / page {safeProfileHistoryPage} of {profileHistoryPageCount}
                    </span>
                  </div>
                )}
                {paginatedParticipatedProfileMarkets.map((market) => {
                  const marketActivityRows = activities.filter(
                    (activity) => sameAddress(activity.user, viewedProfileKey) && activity.marketId === market.id
                  );
                  const firstTxUrl = maybeTransactionUrl(marketActivityRows[0]?.txHash);
                  const canUseDisputeFlow = contractVersion !== "legacy";
                  const resolutionReadyAt = resolutionUnlockTime(market);
                  const isResolutionReady = nowSeconds >= resolutionReadyAt;
                  const canPropose =
                    isOwnProfile &&
                    canUseDisputeFlow &&
                    account &&
                    market.outcome === Outcome.Unresolved &&
                    market.proposedAt === 0 &&
                    isResolutionReady &&
                    (market.resolutionMode === 2
                      ? (!!owner && sameAddress(owner, account)) ||
                        (!!market.authority && sameAddress(market.authority, account))
                      : sameAddress(market.resolver, account) ||
                        (!!owner && sameAddress(owner, account)) ||
                        (!!(market.authority || resolutionAuthority) && sameAddress(market.authority || resolutionAuthority, account)));
                  const canFinalize =
                    isOwnProfile &&
                    canUseDisputeFlow &&
                    market.outcome === Outcome.Unresolved &&
                    market.proposedAt > 0 &&
                    !market.disputed &&
                    !market.authorityReviewRequired &&
                    market.disputeDeadline > 0 &&
                    Date.now() / 1000 >= market.disputeDeadline;
                  const canFinalizeDispute =
                    isOwnProfile &&
                    canUseDisputeFlow &&
                    account &&
                    market.outcome === Outcome.Unresolved &&
                    (market.disputed || Boolean(market.authorityReviewRequired)) &&
                    ((!!owner && sameAddress(account, owner)) ||
                      (!!(market.authority || resolutionAuthority) && sameAddress(account, market.authority || resolutionAuthority)));
                  const canCancelStaleDispute =
                    isOwnProfile &&
                    canUseDisputeFlow &&
                    account &&
                    market.outcome === Outcome.Unresolved &&
                    (market.disputed || Boolean(market.authorityReviewRequired)) &&
                    market.disputeDeadline > 0 &&
                    (market.termsDisputeGracePeriod ?? disputeGracePeriod) > 0 &&
                    Date.now() / 1000 >= market.disputeDeadline + (market.termsDisputeGracePeriod ?? disputeGracePeriod);
                  const canLegacyResolve =
                    isOwnProfile &&
                    contractVersion === "legacy" &&
                    account &&
                    market.outcome === Outcome.Unresolved &&
                    isResolutionReady &&
                    [market.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());
                  const meta = categoryMeta(market.category || "Other");
                  const result = personalMarketResult(market, isOwnProfile ? "You" : "Profile");
                  const settlement = userSettlement(market, market.termsProtocolFeeBps ?? protocolFeeBps);
                  const claimStatus = claimStatusFor(market, settlement, isOwnProfile);
                  const claimableValue = isOwnProfile ? market.potentialPayout : settlement.payout;
                  const profileResolutionAction =
                    Boolean(canPropose) ||
                    Boolean(canLegacyResolve) ||
                    Boolean(canFinalize) ||
                    Boolean(canFinalizeDispute) ||
                    Boolean(canCancelStaleDispute);
                  const profileResolutionTitle = canPropose || canLegacyResolve
                    ? "Result needed"
                    : canFinalize || canFinalizeDispute || canCancelStaleDispute
                      ? "Final action needed"
                      : "Resolution action";
                  const profileResolutionText = canPropose || canLegacyResolve
                    ? "This market has reached resolution time. Open the market page to review Aura, Oracle, source evidence, and propose the result."
                    : canFinalize || canFinalizeDispute || canCancelStaleDispute
                      ? "This market needs a final settlement action. Open the market page to review the settlement report before acting."
                      : "Open the market page to continue settlement.";
                  const pendingTokenWithdrawal = market.settlementToken
                    ? pendingWithdrawalsByToken[market.settlementToken.toLowerCase()] || 0n
                    : 0n;
                  const profileMarketCreatorBond = market.termsCreatorBond ?? creatorBond;
                  const showProfileBondReturn =
                    isOwnProfile &&
                    Boolean(account) &&
                    sameAddress(account, market.creator) &&
                    market.outcome !== Outcome.Unresolved &&
                    profileMarketCreatorBond > 0n &&
                    pendingTokenWithdrawal > 0n;

                  return (
                    <article className="history-card" key={market.id}>
                      <div>
                        <span className={`category ${meta.className}`}>
                          <CategoryIcon category={market.category || "Other"} />
                          {market.category || "Other"}
                        </span>
                        <h3>{market.question}</h3>
                      </div>
                      <div className="history-metrics">
                        <div>
                          <span>YES</span>
                          <strong>{formatMarketAmount(market.yesPosition, market)} {marketSymbol(market)}</strong>
                        </div>
                        <div>
                          <span>NO</span>
                          <strong>{formatMarketAmount(market.noPosition, market)} {marketSymbol(market)}</strong>
                        </div>
                        <div>
                          <span>Market result</span>
                          <strong>{marketStatus(market)}</strong>
                        </div>
                        <div>
                          <span>{isOwnProfile ? "Your result" : "Profile result"}</span>
                          <strong className={`personal-result-text ${result.className}`}>{result.label}</strong>
                        </div>
                        <div>
                          <span>Countdown</span>
                          <strong>{countdownText(market.closeTime, currentTime)}</strong>
                        </div>
                        <div>
                          <span>Est. payout</span>
                          <strong>{formatMarketAmount(settlement.payout, market)} {marketSymbol(market)}</strong>
                        </div>
                        <div>
                          <span>{isOwnProfile ? "Claimable" : "Est. claim"}</span>
                          <strong>{formatMarketAmount(claimableValue, market)} {marketSymbol(market)}</strong>
                        </div>
                        <div>
                          <span>Claim status</span>
                          <strong>{claimStatus}</strong>
                        </div>
                      </div>
                      <div className="history-tx-row">
                        <button className="secondary" onClick={() => openMarket(market.id)} type="button">
                          View market
                        </button>
                        {firstTxUrl ? (
                          <a className="tx-link-button" href={firstTxUrl} target="_blank" rel="noreferrer">
                            View tx
                          </a>
                        ) : (
                          <span>No indexed tx yet</span>
                        )}
                      </div>
                      {(profileResolutionAction ||
                        showProfileBondReturn ||
                        (isOwnProfile && market.potentialPayout > 0n && !market.claimed)) && (
                        <div className="settlement-row profile-card-actions">
                          {profileResolutionAction && (
                            <div className="profile-resolution-callout">
                              <span>{profileResolutionTitle}</span>
                              <strong>Open this market to handle settlement</strong>
                              <small>{profileResolutionText}</small>
                              <button className="secondary" onClick={() => openMarket(market.id, true)} type="button">
                                Go to market
                              </button>
                            </div>
                          )}
                          {showProfileBondReturn && (
                            <div className="profile-bond-return-card">
                              <span>Creator bond pending</span>
                              <strong>{formatMarketAmount(profileMarketCreatorBond, market)} {marketSymbol(market)} bond for this market</strong>
                              <small>
                                Your wallet has {formatMarketAmount(pendingTokenWithdrawal, market)} {marketSymbol(market)} pending across finalized markets. The contract withdraws the total pending balance for this token.
                              </small>
                              <button disabled={transactionPending} onClick={() => withdrawPendingBalance(market)} type="button">
                                Receive pending {marketSymbol(market)}
                              </button>
                            </div>
                          )}
                          {isOwnProfile && market.potentialPayout > 0n && !market.claimed && (
                            <button onClick={() => claim(market.id)} type="button">
                              Claim {formatMarketAmount(market.potentialPayout, market)} {marketSymbol(market)}
                            </button>
                          )}
                          {firstTxUrl && (
                            <a className="tx-link-button" href={firstTxUrl} target="_blank" rel="noreferrer">
                              Arcscan tx
                            </a>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
                {participatedProfileMarkets.length > PROFILE_PAGE_SIZE && (
                  <div className="pagination-row">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setProfileHistoryPage((page) => Math.max(1, page - 1))}
                      disabled={safeProfileHistoryPage <= 1}
                    >
                      Previous
                    </button>
                    <span>
                      Page {safeProfileHistoryPage} / {profileHistoryPageCount}
                    </span>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setProfileHistoryPage((page) => Math.min(profileHistoryPageCount, page + 1))}
                      disabled={safeProfileHistoryPage >= profileHistoryPageCount}
                    >
                      Next
                    </button>
                  </div>
                )}
                {createdProfileMarkets.length > 0 && (
                  <>
                    <div className="profile-section-title">
                      <h3>Markets created</h3>
                      <span>
                        {createdProfileMarkets.length} markets / page {safeProfileCreatedPage} of {profileCreatedPageCount}
                      </span>
                    </div>
                    {renderMarketCards(
                      paginatedCreatedProfileMarkets,
                      "No created markets",
                      "Created markets from your wallet will appear here.",
                      isOwnProfile ? "You" : "Profile",
                      "profile"
                    )}
                    {createdProfileMarkets.length > PROFILE_PAGE_SIZE && (
                      <div className="pagination-row">
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => setProfileCreatedPage((page) => Math.max(1, page - 1))}
                          disabled={safeProfileCreatedPage <= 1}
                        >
                          Previous
                        </button>
                        <span>
                          Page {safeProfileCreatedPage} / {profileCreatedPageCount}
                        </span>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => setProfileCreatedPage((page) => Math.min(profileCreatedPageCount, page + 1))}
                          disabled={safeProfileCreatedPage >= profileCreatedPageCount}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          ) : view === "leaderboard" ? (
            <section className="leaderboard-panel">
              <div className="leaderboard-controls">
                <div className="leaderboard-control-group">
                  <span>Rank by</span>
                  {LEADERBOARD_METRICS.map((metric) => (
                    <button
                      className={leaderboardMetric === metric.value ? "category-pill active" : "category-pill"}
                      key={metric.value}
                      onClick={() => setLeaderboardMetric(metric.value)}
                    >
                      {metric.label}
                    </button>
                  ))}
                </div>
                <div className="leaderboard-control-group">
                  <span>Period</span>
                  {LEADERBOARD_PERIODS.map((period) => (
                    <button
                      className={leaderboardPeriod === period.value ? "category-pill active" : "category-pill"}
                      key={period.value}
                      onClick={() => setLeaderboardPeriod(period.value)}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
                <div className="leaderboard-control-group leaderboard-control-wide">
                  <span>Category</span>
                  {CATEGORIES.map((category) => (
                    <button
                      className={leaderboardCategory === category ? "category-pill active" : "category-pill"}
                      key={`leaderboard-category-${category}`}
                      onClick={() => setLeaderboardCategory(category)}
                      type="button"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <section className="aura-formula-card">
                <div>
                  <span className="section-label">Aura Points formula</span>
                  <h3>Base 25 + volume x10 + positive PNL x12 + wins x90 + settled x18 + created x35 + win rate x4.</h3>
                  <p>Category and time filters recalculate the same formula for the selected leaderboard slice.</p>
                </div>
                <div className="aura-tier-strip">
                  {REPUTATION_TIERS.map((tier) => (
                    <span className={`reputation-tier tier-${tier.value}`} key={tier.value}>
                      {tier.label} {tier.min.toLocaleString("en-US")}+
                    </span>
                  ))}
                </div>
              </section>

              <div className="leaderboard-table">
                <div className="leaderboard-row leaderboard-head">
                  <span>Rank</span>
                  <span>Wallet / badges</span>
                  <span>Volume</span>
                  <span>Win rate</span>
                  <span>PNL</span>
                  <span>Aura points</span>
                </div>
                {leaderboardRows.length === 0 && (
                  <div className="empty-state">
                    <strong>No leaderboard data yet</strong>
                    <span>Rows appear after players stake on markets.</span>
                  </div>
                )}
                {leaderboardRows.map((row, index) => {
                  const tier = reputationTierFor(row.auraPoints);
                  const badges = reputationBadgesFor(row, defaultSettlementDecimals);
                  const profileName = displayNameForAddress(row.address);

                  return (
                    <div className="leaderboard-row" key={row.address}>
                      <span>#{index + 1}</span>
                      <div className="leaderboard-wallet">
                        <strong>{profileName}</strong>
                        {profileName !== shortAddress(row.address) && <small>{shortAddress(row.address)}</small>}
                        <div className="badge-row">
                          <span className={`reputation-tier tier-${tier.value}`}>{tier.label}</span>
                          {badges.map((badge) => (
                            <span className="reputation-badge" key={badge}>{badge}</span>
                          ))}
                        </div>
                      </div>
                      <span>{formatUsdc(row.volume, defaultSettlementDecimals)} {aggregateAssetLabel}</span>
                      <span>
                        {row.winRate.toFixed(1)}% ({row.wonMarkets}/{row.resolvedMarkets})
                      </span>
                      <span className={row.pnl >= 0n ? "pnl-positive" : "pnl-negative"}>
                        {formatSignedUsdc(row.pnl, defaultSettlementDecimals)} {aggregateAssetLabel}
                      </span>
                      <span>{row.auraPoints.toLocaleString("en-US")}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : view === "security" ? (
            <section className="security-page">
              <article>
                <span className="section-label">Audit status</span>
                <h3>Unaudited testnet contract</h3>
                <p>
                  AuraPredict is operating as an Arc Testnet MVP. Treat all market activity as testing until a formal
                  smart contract audit, public findings, and mainnet deployment checklist are complete.
                </p>
              </article>
              <article>
                <span className="section-label">Contract custody</span>
                <h3>Funds live in the prediction market contract</h3>
                <p>
                  The frontend does not custody user funds. Wallets sign contract transactions, and users should verify
                  market creation, staking, resolution, and claim transactions on Arcscan.
                </p>
              </article>
              <article>
                <span className="section-label">Resolution risk</span>
                <h3>Creator propose, evidence, dispute window</h3>
                <p>
                  Aura Agent evidence summaries are decision support only. Final settlement still follows the contract
                  resolution flow, so ambiguous markets should include source links and remain open to dispute review.
                </p>
              </article>
              <article>
                <span className="section-label">User checklist</span>
                <h3>Before staking</h3>
                <ul>
                  <li>Check close time, category, creator, and market wording.</li>
                  <li>Use small testnet amounts and keep transaction links.</li>
                  <li>Review evidence before accepting a proposed outcome.</li>
                  <li>Do not treat Aura Agent output as a final oracle.</li>
                </ul>
              </article>
            </section>
          ) : view === "ended" ? (
            <section className="market-section">
              <div className="market-section-header">
                <div className="market-section-title">
                  <span className="section-dot closing" />
                  <h3>Resolved and canceled</h3>
                </div>
                <div className="section-actions ended-search-actions">
                  <label className="ended-search">
                    <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m16 16 4 4" />
                    </svg>
                    <span className="search-prefix">Search</span>
                    <input
                      aria-label="Search ended markets"
                      placeholder="Question, category, market id, or wallet"
                      value={endedSearchQuery}
                      onChange={(event) => setEndedSearchQuery(event.target.value)}
                    />
                  </label>
                  <span>{filteredEndedMarkets.length} markets</span>
                </div>
              </div>
              {renderMarketCards(
                filteredEndedMarkets,
                "No ended markets",
                "Resolved and canceled markets will appear here after the creator reports a result."
              )}
            </section>
          ) : (
            <section className="market-sections">
              {!onboardingDismissed && (
                <section className="onboarding-card">
                  <div>
                    <span className="section-label">Getting started</span>
                    <h3>Predict, prove, and build Aura reputation.</h3>
                    <p>
                      Connect a wallet, open a market, choose YES or NO, then track your payout, evidence,
                      badges, and leaderboard rank from your profile.
                    </p>
                  </div>
                  <div className="onboarding-steps" aria-label="AuraPredict onboarding steps">
                    {["Connect", "Pick side", "Stake token", "Track Aura"].map((step, index) => (
                      <span key={step}>{index + 1}. {step}</span>
                    ))}
                  </div>
                  <button className="secondary" onClick={() => setOnboardingDismissed(true)} type="button">
                    Got it
                  </button>
                </section>
              )}
              <section className="market-section section-fresh">
                <div className="market-section-header">
                  <div className="market-section-title">
                    <span className="section-dot" />
                    <h3>Fresh</h3>
                  </div>
                  <div className="section-actions">
                    <span>
                      {freshMarkets.length} of {allFreshMarkets.length} markets
                    </span>
                    {allFreshMarkets.length > homeSectionLimit && (
                      <button className="see-all-button" onClick={() => openCollection("fresh")} type="button">
                        See all
                      </button>
                    )}
                  </div>
                </div>
                {renderMarketCards(
                  freshMarkets,
                  "No fresh markets",
                  "Create the first market from the market studio."
                )}
              </section>

              <section className="market-section section-hot">
                <div className="market-section-header">
                  <div className="market-section-title">
                    <span className="section-dot hot" />
                    <h3>Hottest</h3>
                  </div>
                  <div className="section-actions">
                    <span>
                      {hottestMarkets.length} of {allHottestMarkets.length} by participants
                    </span>
                    {allHottestMarkets.length > homeSectionLimit && (
                      <button className="see-all-button" onClick={() => openCollection("hot")} type="button">
                        See all
                      </button>
                    )}
                  </div>
                </div>
                {renderMarketCards(
                  hottestMarkets,
                  "No hot markets yet",
                  "Markets will rank here after players stake YES or NO."
                )}
              </section>

              <section className="market-section section-closing">
                <div className="market-section-header">
                  <div className="market-section-title">
                    <span className="section-dot closing" />
                    <h3>Closing Soon</h3>
                  </div>
                  <div className="section-actions">
                    <span>
                      {closingSoonMarkets.length} of {allClosingSoonMarkets.length} soonest
                    </span>
                    {allClosingSoonMarkets.length > homeSectionLimit && (
                      <button className="see-all-button" onClick={() => openCollection("closing")} type="button">
                        See all
                      </button>
                    )}
                  </div>
                </div>
                {renderMarketCards(
                  closingSoonMarkets,
                  "No markets closing soon",
                  "Open markets with the nearest UTC close time will appear here."
                )}
              </section>
            </section>
          )}
        </section>

        {view !== "collection" && view !== "market" && (
        <aside className="side-rail">
          <section className="protocol-card protocol-stats-card">
            <span className="section-label">Market stats</span>
            <div className="market-stat-list">
              <div className="market-stat-row highlight">
                <span className="stat-glyph stat-volume" aria-hidden="true" />
                <div>
                  <span>Total volume</span>
                  <strong>{totalVolumeByTokenText}</strong>
                </div>
              </div>
              <div className="market-stat-row">
                <span className="stat-glyph stat-liquidity" aria-hidden="true" />
                <div>
                  <span>Total liquidity</span>
                  <strong>{liveLiquidityByTokenText}</strong>
                </div>
              </div>
              <div className="market-stat-row">
                <span className="stat-glyph stat-live" aria-hidden="true" />
                <div>
                  <span>Live markets</span>
                  <strong>{statsSummary.liveMarkets}</strong>
                </div>
              </div>
              <div className="market-stat-row">
                <span className="stat-glyph stat-indexed" aria-hidden="true" />
                <div>
                  <span>Indexed markets</span>
                  <strong>{statsSummary.indexedMarkets}</strong>
                </div>
              </div>
              <div className="market-stat-row">
                <span className="stat-glyph stat-pending" aria-hidden="true" />
                <div>
                  <span>Awaiting result</span>
                  <strong>{statsSummary.pendingMarkets}</strong>
                </div>
              </div>
              <div className="market-stat-row">
                <span className="stat-glyph stat-users" aria-hidden="true" />
                <div>
                  <span>Known players</span>
                  <strong>{statsSummary.knownPlayers}</strong>
                </div>
              </div>
              <div className="market-stat-row status">
                <span className="stat-glyph stat-sync" aria-hidden="true" />
                <div>
                  <span>Indexer status</span>
                  <strong>Live & Syncing</strong>
                </div>
                <em>{indexerSyncText}</em>
              </div>
            </div>
          </section>
          <section className="protocol-card">
            <span className="section-label">Protocol</span>
            <div>
              <span>Contract</span>
              <strong>{hasContract ? shortAddress(CONTRACT_ADDRESS) : "Not deployed"}</strong>
            </div>
            <div>
              <span>Owner</span>
              <strong>{owner ? shortAddress(owner) : "..."}</strong>
            </div>
            <div>
              <span>Resolution authority</span>
              <strong>{resolutionAuthority ? shortAddress(resolutionAuthority) : owner ? shortAddress(owner) : "..."}</strong>
            </div>
            <div>
              <span>Min stake</span>
              <strong>{formatUsdc(minStake, defaultSettlementDecimals)} {defaultSettlementSymbol}</strong>
            </div>
            <div>
              <span>Creation fee</span>
              <strong>{formatUsdc(marketCreationFee, defaultSettlementDecimals)} {defaultSettlementSymbol}</strong>
            </div>
            <div>
              <span>Creator bond</span>
              <strong>{formatUsdc(creatorBond, defaultSettlementDecimals)} {defaultSettlementSymbol}</strong>
            </div>
            <div>
              <span>Dispute bond</span>
              <strong>{formatUsdc(disputeBond, defaultSettlementDecimals)} {defaultSettlementSymbol}</strong>
            </div>
            <div>
              <span>Dispute window</span>
              <strong>{Math.round(disputeWindow / 3600)} hours</strong>
            </div>
            <div>
              <span>Stale dispute grace</span>
              <strong>{disputeGracePeriod > 0 ? `${Math.round(disputeGracePeriod / 3600)} hours` : "Not available"}</strong>
            </div>
            <div>
              <span>Project fee</span>
              <strong>{(protocolFeeBps / 100).toFixed(2)}% of winnings</strong>
            </div>
            <div>
              <span>Fee balance</span>
              <strong>{formatUsdc(accumulatedProtocolFees, defaultSettlementDecimals)} {defaultSettlementSymbol}</strong>
            </div>
            {account && owner && sameAddress(account, owner) && accumulatedProtocolFees > 0n && (
              <button onClick={() => withdrawFees(defaultSettlementToken)}>Withdraw fees</button>
            )}
          </section>
          <section className="protocol-card security-card">
            <span className="section-label">Security & audit</span>
            <div>
              <span>Status</span>
              <strong>Testnet MVP / unaudited</strong>
            </div>
            <div>
              <span>Custody</span>
              <strong>Market contract only</strong>
            </div>
            <div>
              <span>Resolution</span>
              <strong>Creator propose + dispute window</strong>
            </div>
            <div>
              <span>Public checks</span>
              <strong>Verify every tx on Arcscan</strong>
            </div>
          </section>
        </aside>
        )}
      </section>

      {createModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create market">
          <form className="modal-panel create-market-modal" onSubmit={createMarket}>
            <div className="modal-header">
              <div>
                <span className="section-label">Market Studio</span>
                <h2>Create a new market</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setCreateModalOpen(false)}>
                X
              </button>
            </div>
            <label>
              <span className="field-label">
                Question <span className="required-mark">*</span>
              </span>
              <textarea
                value={createForm.question}
                onChange={(event) => {
                  setCreateForm({ ...createForm, question: event.target.value });
                  setAiMarketDraft(null);
                  setAuraCreateStatus("idle");
                  setDuplicateAcknowledged(false);
                }}
                placeholder="Will Arc Testnet pass 1M transactions this week?"
                minLength={8}
                maxLength={280}
                rows={4}
              />
            </label>
            <div className="aura-agent-create-panel">
              <div>
                <span className="section-label">Aura Agent</span>
                <strong>Draft clear market terms before launch.</strong>
                <small>AI can suggest a measurable question, UTC close time, sources, and risk flags. Review before signing.</small>
                <small>{createAuraStatusLabel}</small>
              </div>
              <button className="aura-ask-button" disabled={aiBusy || createForm.question.trim().length < 4} onClick={askAuraForMarketDraft} type="button">
                {aiBusy ? "Aura thinking..." : "Ask Aura Agent"}
              </button>
            </div>
            {aiMarketDraft && (
              <div className="aura-draft-card">
                <div className="panel-heading">
                  <div>
                    <span className="section-label">Suggested market</span>
                    <h3>{aiMarketDraft.question || "Draft ready"}</h3>
                  </div>
                  <div className="aura-draft-badges">
                    {aiMarketDraft.duplicateRisk && <span className={`risk-${aiMarketDraft.duplicateRisk.toLowerCase()}`}>{aiMarketDraft.duplicateRisk} duplicate risk</span>}
                    {typeof aiMarketDraft.clarityScore === "number" && <span>{aiMarketDraft.clarityScore}% clarity</span>}
                  </div>
                </div>
                {aiMarketDraft.resolutionCriteria && <p>{aiMarketDraft.resolutionCriteria}</p>}
                <button className="aura-apply-button" onClick={applyAuraMarketDraft} type="button">
                  Apply suggestion
                </button>
                {aiMarketDraft.similarMarkets && aiMarketDraft.similarMarkets.length > 0 && (
                  <div className="similar-market-list">
                    <span className="section-label">Similar markets found</span>
                    {aiMarketDraft.similarMarkets.map((market) => (
                      <button
                        className="similar-market-row"
                        key={market.id}
                        onClick={() => {
                          setCreateModalOpen(false);
                          openMarket(market.id);
                        }}
                        type="button"
                      >
                        <strong>#{market.id} {shortQuestion(market.question)}</strong>
                        <small>
                          {market.similarity}% similar / {market.traderCount} traders / {formatStatUsdc(BigInt(market.volume || "0"))} USDC
                        </small>
                      </button>
                    ))}
                  </div>
                )}
                {aiMarketDraft.sources && aiMarketDraft.sources.length > 0 && (
                  <div className="aura-draft-tags">
                    {aiMarketDraft.sources.slice(0, 4).map((source) => (
                      <span key={source}>{source}</span>
                    ))}
                  </div>
                )}
                {aiMarketDraft.riskFlags && aiMarketDraft.riskFlags.length > 0 && (
                  <div className="aura-draft-tags warning">
                    {aiMarketDraft.riskFlags.slice(0, 4).map((flag) => (
                      <span key={flag}>{flag}</span>
                    ))}
                  </div>
                )}
                {aiMarketDraft.creatorNote && <small>{aiMarketDraft.creatorNote}</small>}
              </div>
            )}
            <div className="modal-form-grid">
              <label>
                <span className="field-label">
                  Category <span className="required-mark">*</span>
                </span>
                <select
                  value={createForm.category}
                  onChange={(event) => setCreateForm({ ...createForm, category: event.target.value })}
                >
                  {CATEGORIES.filter((category) => category !== "All").map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <small className="time-format-hint">Choose the main topic for this market.</small>
              </label>
              <label>
                <span className="field-label">
                  Close time (UTC) <span className="required-mark">*</span>
                </span>
                <div className="close-time-fields">
                  <input
                    type="date"
                    value={selectedCloseParts?.date || ""}
                    min={minimumCloseParts?.date}
                    onChange={(event) =>
                      setCreateForm((current) => {
                        const parts = parseUtcDateTimeParts(current.closeTime);
                        const nextDate = event.target.value;
                        const nextTime = parts?.time || "00:00";
                        return { ...current, closeTime: combineUtcDateTimeParts(nextDate, nextTime) };
                      })
                    }
                  />
                  <input
                    type="time"
                    step={60}
                    value={selectedCloseParts?.time || ""}
                    onChange={(event) =>
                      setCreateForm((current) => {
                        const parts = parseUtcDateTimeParts(current.closeTime);
                        const nextDate = parts?.date || minimumCloseParts?.date || "";
                        const nextTime = event.target.value;
                        return { ...current, closeTime: combineUtcDateTimeParts(nextDate, nextTime) };
                      })
                    }
                  />
                </div>
                <div className="close-time-presets" aria-label="Quick close time presets">
                  <button type="button" onClick={() => setCreateCloseTimePreset(60)}>
                    +1h
                  </button>
                  <button type="button" onClick={() => setCreateCloseTimePreset(6 * 60)}>
                    +6h
                  </button>
                  <button type="button" onClick={() => setCreateCloseTimePreset(24 * 60)}>
                    +24h
                  </button>
                  <button type="button" onClick={() => setCreateCloseTimePreset(72 * 60)}>
                    +3d
                  </button>
                </div>
                <small className="time-format-hint">
                  UTC only. Betting stops at this time. Min close time: {minimumCloseInput}.
                </small>
                {hasRuleCloseMismatch && !isStablecoinContractVersion(contractVersion) && (
                  <small className="time-format-hint error-hint">
                    Close time does not match rule time: {ruleReferenceCloseTime} UTC.
                  </small>
                )}
              </label>
              {isStablecoinContractVersion(contractVersion) && (
                <label>
                  <span className="field-label">
                    Resolution time (UTC) <span className="required-mark">*</span>
                  </span>
                  <div className="close-time-fields">
                    <input
                      type="date"
                      value={selectedResolutionParts?.date || ""}
                      min={selectedCloseParts?.date || minimumCloseParts?.date}
                      onChange={(event) =>
                        setCreateForm((current) => {
                          const parts = parseUtcDateTimeParts(current.resolutionTime);
                          return { ...current, resolutionTime: combineUtcDateTimeParts(event.target.value, parts?.time || "00:00") };
                        })
                      }
                    />
                    <input
                      type="time"
                      step={60}
                      value={selectedResolutionParts?.time || ""}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          resolutionTime: combineUtcDateTimeParts(
                            parseUtcDateTimeParts(current.resolutionTime)?.date || selectedCloseParts?.date || minimumCloseParts?.date || "",
                            event.target.value
                          )
                        }))
                      }
                    />
                  </div>
                  <small className="time-format-hint">Results cannot be proposed before this event timestamp.</small>
                  {hasRuleCloseMismatch && (
                    <small className="time-format-hint error-hint">
                      Resolution time does not match rule time: {ruleReferenceCloseTime} UTC.
                    </small>
                  )}
                </label>
              )}
              {isStablecoinContractVersion(contractVersion) && (
                <label>
                  <span className="field-label">
                    Settlement asset <span className="required-mark">*</span>
                  </span>
                  <select
                    value={createForm.settlementToken || defaultSettlementToken}
                    onChange={(event) => setCreateForm({ ...createForm, settlementToken: event.target.value })}
                  >
                    {isAddress(defaultSettlementToken) && (
                      <option value={defaultSettlementToken}>{defaultSettlementSymbol}</option>
                    )}
                    {isAddress(EURC_TOKEN_ADDRESS) && !sameAddress(EURC_TOKEN_ADDRESS, defaultSettlementToken) && (
                      <option value={EURC_TOKEN_ADDRESS}>EURC</option>
                    )}
                  </select>
                  <small className="time-format-hint">All stakes and payouts for this market use one token.</small>
                </label>
              )}
              {isStablecoinContractVersion(contractVersion) && (
                <label>
                  <span className="field-label">
                    Resolution mode <span className="required-mark">*</span>
                  </span>
                  <select
                    value={createForm.resolutionMode}
                    onChange={(event) => setCreateForm({ ...createForm, resolutionMode: event.target.value as "0" | "1" | "2" })}
                  >
                    <option value="0">Creator + dispute review</option>
                    <option value="1">Creator + required authority review</option>
                    <option value="2">Authority / oracle only</option>
                  </select>
                  <small className="time-format-hint">The selected control path is fixed for this market.</small>
                </label>
              )}
              <label>
                <span className="field-label">
                  Resolution source URL <span className="required-mark">*</span>
                </span>
                <input
                  type="text"
                  value={createForm.resolutionSource}
                  onChange={(event) => setCreateForm({ ...createForm, resolutionSource: event.target.value })}
                  placeholder="https://www.coingecko.com/..."
                  maxLength={512}
                />
                <small className="time-format-hint">Primary source used to resolve this market.</small>
              </label>
              <label className="full-width resolution-rule-field">
                <span className="field-label">
                  Resolution rule <span className="required-mark">*</span>
                </span>
                <textarea
                  value={createForm.resolutionRule}
                  onChange={(event) => setCreateForm({ ...createForm, resolutionRule: event.target.value })}
                  placeholder="Example: Use BTC/USD spot price at 09:30 UTC from primary source."
                  rows={3}
                  maxLength={2048}
                />
                <small className="time-format-hint">Define exactly what value and timestamp are used.</small>
              </label>
              <label className="full-width">
                Fallback source URL (optional)
                <input
                  type="text"
                  value={createForm.fallbackSource}
                  onChange={(event) => setCreateForm({ ...createForm, fallbackSource: event.target.value })}
                  placeholder="https://www.binance.com/..."
                  maxLength={512}
                />
                <small className="time-format-hint">Secondary source if primary source is unavailable.</small>
              </label>
            </div>
            <div className="resolver-note">
              Resolver is locked to the creator wallet: {account ? shortAddress(account) : "connect wallet first"}.
              Resolution authority can later be moved to an oracle or committee wallet without changing market cards.
              Question must be at least 8 characters.
              Resolution source and rule are required before launch.
              Market close time is saved in UTC and must be at least 5 minutes after the current UTC time.
              {isStablecoinContractVersion(contractVersion) && " Resolution time is enforced onchain and cannot be earlier than close time."}
              {contractVersion === "v4" && " The primary source, fallback source, and resolution rule are stored onchain; current markets remain creator-led with Aura and owner review until an approved oracle adapter is selected for a future market."}
              {contractVersion === "legacy"
                ? " This legacy contract does not use creator bonds or dispute windows."
                : marketCreationFee > 0n
                  ? ` Creating a market costs ${formatUsdc(creatorBond + marketCreationFee, defaultSettlementDecimals)} ${defaultSettlementSymbol} total: ${formatUsdc(creatorBond, defaultSettlementDecimals)} bond plus ${formatUsdc(marketCreationFee, defaultSettlementDecimals)} creation fee.`
                  : ` Creating a market locks a ${formatUsdc(creatorBond, defaultSettlementDecimals)} ${defaultSettlementSymbol} creator bond until the result is finalized.`}
            </div>
            {aiMarketDraft?.duplicateRisk && aiMarketDraft.duplicateRisk !== "LOW" && (
              <label className="duplicate-acknowledge">
                <input
                  checked={duplicateAcknowledged}
                  onChange={(event) => setDuplicateAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I understand Aura Agent found similar markets and creating this one may split liquidity.
                </span>
              </label>
            )}
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </button>
              <button
                disabled={
                  !account ||
                  !hasContract ||
                  transactionPending ||
                  createForm.question.trim().length < 8 ||
                  createForm.resolutionSource.trim().length === 0 ||
                  createForm.resolutionRule.trim().length === 0 ||
                  (isStablecoinContractVersion(contractVersion) && createForm.resolutionTime.trim().length === 0) ||
                  hasRuleCloseMismatch ||
                  !canCreateAfterAura ||
                  (!!aiMarketDraft?.duplicateRisk && aiMarketDraft.duplicateRisk !== "LOW" && !duplicateAcknowledged)
                }
                type="submit"
              >
                {transactionPending
                  ? "Waiting Wallet..."
                  : aiMarketDraft?.duplicateRisk && aiMarketDraft.duplicateRisk !== "LOW"
                    ? "Create anyway"
                    : !canCreateAfterAura
                      ? "Ask Aura first"
                    : "Launch Market"}
              </button>
            </div>
          </form>
        </div>
      )}

      {mismatchConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="AI mismatch confirmation">
          <section className="modal-panel wallet-connect-modal">
            <div className="modal-header">
              <h2>AI Mismatch Warning</h2>
              <button className="icon-button" type="button" onClick={() => setMismatchConfirm(null)}>
                X
              </button>
            </div>
            <p>
              AI suggests <strong>{outcomeLabel(mismatchConfirm.aiSuggestedOutcome)}</strong>, but you are proposing{" "}
              <strong>{outcomeLabel(mismatchConfirm.outcome)}</strong>.
            </p>
            <p>This action will create an owner review alert. Continue?</p>
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={() => setMismatchConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const pending = mismatchConfirm;
                  if (!pending) return;
                  setMismatchConfirm(null);
                  await resolveMarket(pending.marketId, pending.outcome, true);
                }}
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      )}

      {walletModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Connect wallet">
          <section className="modal-panel wallet-connect-modal">
            <div className="wallet-list-panel">
              <div className="modal-header">
                <h2>Connect a wallet</h2>
                <button className="icon-button" type="button" onClick={() => setWalletModalOpen(false)}>
                  X
                </button>
              </div>
              <span className="wallet-group-label">Installed</span>
              <small className="wallet-connect-hint">
                If wallet opens on another chain, AuraPredict will request switching to Arc Testnet automatically.
              </small>
              {walletOptions.length > 0 ? (
                walletOptions.map((wallet) => (
                  <button
                    className="wallet-option"
                    key={wallet.info.uuid}
                    onClick={() => handleConnectWallet(wallet.provider)}
                    disabled={connecting}
                  >
                    {wallet.info.icon ? (
                      <img className="wallet-badge wallet-badge-image" src={wallet.info.icon} alt="" />
                    ) : (
                      <span className="wallet-badge">{wallet.info.name.slice(0, 1)}</span>
                    )}
                    <strong>{wallet.info.name}</strong>
                    <small>Detected provider</small>
                  </button>
                ))
              ) : (
                <button className="wallet-option disabled-wallet" type="button" disabled>
                  <span className="wallet-badge">W</span>
                  <strong>No wallet detected</strong>
                  <small>Use a wallet app below to open AuraPredict with an injected provider.</small>
                </button>
              )}
              <span className="wallet-group-label">Connect from Chrome or desktop</span>
              <button className="wallet-option" type="button" onClick={handleWalletConnect} disabled={connecting || !walletConnectReady}>
                <span className="wallet-badge">W</span>
                <strong>WalletConnect</strong>
                <small>
                  {walletConnectReady
                    ? "Open MetaMask, Rabby, Zerion, OKX, or another WalletConnect wallet."
                    : "Set VITE_WALLETCONNECT_PROJECT_ID in Vercel to enable this."}
                </small>
              </button>
              <span className="wallet-group-label">Open in wallet browser</span>
              {WALLET_DEEP_LINKS.map((wallet) => (
                <button className="wallet-option mobile-wallet-option" key={wallet.name} type="button" onClick={() => openMobileWallet(wallet.url)}>
                  <span className="wallet-badge">{wallet.name.slice(0, 1)}</span>
                  <strong>{wallet.name}</strong>
                  <small>{wallet.detail}</small>
                </button>
              ))}
              <span className="wallet-group-label">Recommended</span>
              {recommendedWallets.map((walletName) => {
                const detected = walletOptions.find((wallet) =>
                  wallet.info.name.toLowerCase().includes(walletName.toLowerCase().replace(" wallet", ""))
                );

                return (
                <button
                  className={detected ? "wallet-option" : "wallet-option disabled-wallet"}
                  key={walletName}
                  onClick={() => detected && handleConnectWallet(detected.provider)}
                  disabled={connecting || !detected}
                  type="button"
                >
                  <span className="wallet-badge">{walletName.slice(0, 1)}</span>
                  <strong>{walletName}</strong>
                  <small>{detected ? "Detected" : "Use the wallet in-app browser"}</small>
                </button>
                );
              })}
              <span className="wallet-group-label">Other</span>
              {["Phantom", "WalletConnect"].map((wallet) => (
                <button className="wallet-option disabled-wallet" key={wallet} type="button" disabled>
                  <span className="wallet-badge">{wallet.slice(0, 1)}</span>
                  <strong>{wallet}</strong>
                  <small>Coming soon</small>
                </button>
              ))}
            </div>
            <div className="wallet-info-panel">
              <h2>What is a wallet?</h2>
              <div className="wallet-info-item">
                <span className="wallet-info-icon">1</span>
                <div>
                  <strong>Your account for digital assets</strong>
                  <p>Use it to sign transactions, stake testnet stablecoins, and claim payouts on Arc Testnet.</p>
                </div>
              </div>
              <div className="wallet-info-item">
                <span className="wallet-info-icon">2</span>
                <div>
                  <strong>No password for this dapp</strong>
                  <p>AuraPredict never receives your private key. Your wallet asks before every transaction.</p>
                </div>
              </div>
              <button className="secondary" type="button" onClick={() => window.open("https://metamask.io", "_blank")}>
                Get a wallet
              </button>
            </div>
          </section>
        </div>
      )}

      <footer className="site-footer">
        <section className="footer-brand">
          <img src="/aurapredict-logo.png" alt="AuraPredict" />
          <div>
            <div className="footer-brand-row">
              <strong>AuraPredict</strong>
              <span className="arc-brand-chip footer-arc-chip">
                <img src="/arc-icon-navy-gradient.svg" alt="" />
                Built on Arc
              </span>
            </div>
            <p>Prediction markets built for Arc Testnet with transparent stablecoin settlement.</p>
          </div>
        </section>
        <section className="footer-arc">
          <span className="section-label">Arc Network</span>
          <p>
            Arc is an EVM-compatible testnet focused on stablecoin-native payments,
            USDC gas, fast confirmation, and familiar wallet tooling.
          </p>
          <div className="arc-facts">
            <span>Chain ID 5042002</span>
            <span>Native USDC</span>
            <span>EVM compatible</span>
          </div>
        </section>
        <section className="social-links" aria-label="AuraPredict social links">
          <a href={X_URL} target="_blank" rel="noreferrer" aria-label="AuraPredict on X">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.9 2h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.2-5.6 6.2h-3.1l7.3-8.3-7.7-9.7h6.4l4.4 5.6 5.2-5.6Zm-1.1 16.2h1.7L8.4 3.7H6.6l11.2 14.5Z" />
            </svg>
            <span>X</span>
          </a>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer" aria-label="AuraPredict Discord">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.6 4.8A16.1 16.1 0 0 0 15.7 3l-.2.4c1.4.4 2.1.9 3 1.5a13.8 13.8 0 0 0-12.9 0c.9-.7 1.8-1.1 3-1.5L8.4 3c-1.4.3-2.7.9-3.9 1.8C2 8.5 1.3 12 1.6 15.5c1.6 1.2 3.1 1.9 4.6 2.4l1-1.7c-.6-.2-1.2-.5-1.7-.8l.4-.3c3.3 1.5 6.9 1.5 10.2 0l.4.3c-.5.3-1.1.6-1.7.8l1 1.7c1.5-.5 3.1-1.2 4.6-2.4.4-4.1-.7-7.6-2.8-10.7ZM8.4 13.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
            </svg>
            <span>Discord</span>
          </a>
        </section>
      </footer>
    </main>
  );
}
