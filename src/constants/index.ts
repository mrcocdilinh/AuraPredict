import type { Address } from "viem";
import { ARC_RPC_URLS, ARC_CHAIN_ID_NUMBER, ARC_EXPLORER_URL, ARC_NATIVE_USDC_DECIMALS } from "../arc";
import type {
  UnifiedBalanceSourceChainKey,
  LeaderboardPeriod,
  LeaderboardMetric,
  ChartWindowKey,
  MarketSortKey
} from "../types";

export { ARC_CHAIN_ID_NUMBER, ARC_EXPLORER_URL, ARC_NATIVE_USDC_DECIMALS };

export const SWAP_TOLERANCE_OPTIONS = [50, 100, 300, 500] as const;
export const DEFAULT_SWAP_TOLERANCE_BPS = 300;
export const SWAP_QUOTE_MAX_AGE_MS = 30_000;
export const UNIFIED_BALANCE_SOURCE_CHAINS: Array<{
  value: UnifiedBalanceSourceChainKey;
  label: string;
  chainIdHex: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
  usdcAddress: Address;
  decimals: number;
}> = [
  {
    value: "Base_Sepolia",
    label: "Base Sepolia",
    chainIdHex: "0x14a34",
    chainName: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    decimals: 6
  },
  {
    value: "Arbitrum_Sepolia",
    label: "Arbitrum Sepolia",
    chainIdHex: "0x66eee",
    chainName: "Arbitrum Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    decimals: 6
  },
  {
    value: "Ethereum_Sepolia",
    label: "Ethereum Sepolia",
    chainIdHex: "0xaa36a7",
    chainName: "Ethereum Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    decimals: 6
  }
];
export const UNIFIED_BALANCE_WALLET_CHAINS = [
  ...UNIFIED_BALANCE_SOURCE_CHAINS,
  {
    value: "Arc_Testnet",
    label: "Arc Testnet",
    rpcUrls: ARC_RPC_URLS,
    usdcAddress: "0x3600000000000000000000000000000000000000" as Address,
    decimals: 6
  }
];
export const LIFI_QUOTE_ENDPOINT = "https://li.quest/v1/quote";
export const LIFI_PROBE_AMOUNTS = [1_000n, 10_000n, 100_000n, 1_000_000n, 5_000_000n, 10_000_000n];
export const AURA_RULE_JSON_PREFIX = "AURA_RULE_JSON:";

export const ACTIVE_V3_CONTRACT_ADDRESS = "0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd";
export const ACTIVE_V3_DEPLOYMENT_BLOCK = "44074836";
export const ACTIVE_V5_CONTRACT_ADDRESS = String(
  import.meta.env.VITE_PREDICTION_MARKET_ADDRESS || import.meta.env.VITE_AURAPREDICT_V5_ADDRESS || ""
).trim();
export const ACTIVE_V5_DEPLOYMENT_BLOCK = String(import.meta.env.VITE_AURAPREDICT_V5_DEPLOYMENT_BLOCK || "0").trim();
export const ACTIVE_V3_EURC_TOKEN_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
export const PRIMARY_CONTRACT_ADDRESS = ACTIVE_V5_CONTRACT_ADDRESS;
export const PRIMARY_DEPLOYMENT_BLOCK = ACTIVE_V5_DEPLOYMENT_BLOCK;
export const REQUESTED_DEPLOYMENT =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("deployment") : null;
export const VIEWING_V3_ARCHIVE =
  REQUESTED_DEPLOYMENT === "v3" &&
  PRIMARY_CONTRACT_ADDRESS.toLowerCase() !== ACTIVE_V3_CONTRACT_ADDRESS.toLowerCase();
export const CONTRACT_ADDRESS = VIEWING_V3_ARCHIVE ? ACTIVE_V3_CONTRACT_ADDRESS : PRIMARY_CONTRACT_ADDRESS;
export const EURC_TOKEN_ADDRESS = ACTIVE_V3_EURC_TOKEN_ADDRESS;
export const V3_STABLECOIN_DECIMALS = 6;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const CATEGORIES = ["All", "Crypto", "Macro", "Sports", "Politics", "Arc", "AI", "Other"];
export const SECTION_LIMIT = 6;
export const COLLECTION_PAGE_SIZE = 12;
export const PROFILE_PAGE_SIZE = 12;
export const LEADERBOARD_LIMIT = 100;
export const MARKET_INITIAL_LOAD = 9999;
export const MARKET_LOAD_STEP = 24;
export const MARKET_LOAD_CONCURRENCY = 4;
export const EVENT_LOAD_CONCURRENCY = 2;
export const RPC_RETRY_ATTEMPTS = 3;
export const RPC_RETRY_DELAY_MS = 450;
export const RPC_CALL_STAGGER_MS = 40;
export const CHART_LEFT = 8;
export const CHART_RIGHT = 92;
export const CHART_TOP = 8;
export const CHART_BOTTOM = 54;
export const CHART_HEIGHT = CHART_BOTTOM - CHART_TOP;
export const WALLET_CONNECTED_KEY = "aurapredict.walletConnected";
export const WALLET_DISCONNECTED_KEY = "aurapredict.walletDisconnected";
export const WALLETCONNECT_PROJECT_ID = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "").trim();
export const CIRCLE_APP_KIT_KEY = String(import.meta.env.VITE_CIRCLE_APP_KIT_KEY || "").trim();
export const DISMISSED_RESULT_KEY = "aurapredict.dismissedResultNotices";
export const THEME_KEY = "aurapredict.theme";
export const PROFILE_NAMES_KEY = "aurapredict.profileNames";
export const PROFILE_JOINED_KEY = "aurapredict.profileJoined";
export const PROFILE_PUBLIC_KEY = "aurapredict.profilePublic";
export const USER_REGISTRY_KEY = "aurapredict.userRegistry";
export const MARKET_CACHE_KEY = "aurapredict.marketCache";
export const FOLLOWED_CREATORS_KEY = "aurapredict.followedCreators";
export const MARKET_COMMENTS_KEY = "aurapredict.marketComments";
export const MARKET_EVIDENCE_KEY = "aurapredict.marketEvidence";
export const MARKET_REPORTS_KEY = "aurapredict.marketReports";
export const MARKET_REJECTION_KEY = "aurapredict.marketRejections";
export const LOCAL_CLAIMED_MARKETS_KEY = "aurapredict.localClaimedMarkets";
export const ONBOARDING_DISMISSED_KEY = "aurapredict.onboardingDismissed";
export const MARKET_QUERY_KEY = "market";
export const PROFILE_QUERY_KEY = "profile";
export const PROFILE_NAME_QUERY_KEY = "name";
export const LANDING_HOSTS = new Set(["aurapredict.xyz", "www.aurapredict.xyz"]);
export const APP_URL = "https://app.aurapredict.xyz";
export const DOCS_URL = "https://docs.aurapredict.xyz";
export const ARC_FAUCET_URL = "https://faucet.circle.com";
export const ARC_UNIFIED_BALANCE_URL = "https://docs.arc.io/app-kit/unified-balance";
export const X_URL = "https://x.com/AuraPredict";
export const DISCORD_URL = "https://discord.gg/3wTYhdsr";
export const DEMO_VIDEO_URL = "https://www.youtube.com/watch?v=tdYqpAIG82s";
export const DEMO_EMBED_URL = "https://www.youtube.com/embed/tdYqpAIG82s";
export const CURRENT_APP_URL =
  typeof window !== "undefined" ? `${window.location.host}${window.location.pathname}${window.location.search}` : "app.aurapredict.xyz";
export const WALLET_DEEP_LINKS = [
  {
    name: "WalletConnect",
    detail: "Scan a QR code from your wallet app",
    url: ""
  },
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
    name: "Bitget Wallet",
    detail: "Open Bitget Wallet and use the in-app browser",
    url: "https://web3.bitget.com"
  },
  {
    name: "Base",
    detail: "Open with Coinbase Wallet",
    url: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(`https://${CURRENT_APP_URL}`)}`
  },
  {
    name: "Coinbase",
    detail: "Open with Coinbase Wallet",
    url: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(`https://${CURRENT_APP_URL}`)}`
  },
  {
    name: "Zerion",
    detail: "Open with Zerion mobile wallet",
    url: `https://link.zerion.io/dapp/${CURRENT_APP_URL}`
  }
];
export const INDEXER_URL = String(
  import.meta.env.VITE_AURA_INDEXER_URL ||
    (import.meta.env.DEV ? "http://127.0.0.1:8787" : "https://api.aurapredict.xyz")
).replace(/\/$/, "");
export const EVENT_START_BLOCK = BigInt(VIEWING_V3_ARCHIVE ? ACTIVE_V3_DEPLOYMENT_BLOCK : PRIMARY_DEPLOYMENT_BLOCK);
export const EVENT_LOG_CHUNK_SIZE = 9_000n;
export const CATEGORY_META: Record<string, { label: string; className: string }> = {
  All: { label: "All", className: "category-all" },
  Crypto: { label: "Crypto", className: "category-crypto" },
  Macro: { label: "Macro", className: "category-macro" },
  Sports: { label: "Sports", className: "category-sports" },
  Politics: { label: "Politics", className: "category-politics" },
  Arc: { label: "Arc", className: "category-arc" },
  AI: { label: "AI", className: "category-ai" },
  Other: { label: "Other", className: "category-other" }
};
export const CATEGORY_SET = new Set(CATEGORIES.filter((category) => category !== "All"));
export const MARKET_IMAGE_CATEGORIES = ["crypto", "sports", "politics", "macro", "ai", "arc", "other"] as const;
export const MARKET_IMAGE_COUNT = 6;
export const LEADERBOARD_PERIODS: Array<{ value: LeaderboardPeriod; label: string; seconds: number | null }> = [
  { value: "day", label: "24H", seconds: 24 * 60 * 60 },
  { value: "7d", label: "7D", seconds: 7 * 24 * 60 * 60 },
  { value: "30d", label: "1M", seconds: 30 * 24 * 60 * 60 },
  { value: "all", label: "All", seconds: null }
];
export const LEADERBOARD_METRICS: Array<{ value: LeaderboardMetric; label: string }> = [
  { value: "volume", label: "Volume" },
  { value: "winRate", label: "Win rate" },
  { value: "pnl", label: "PNL" },
  { value: "auraPoints", label: "Aura points" }
];
export const REPUTATION_TIERS = [
  { value: "bronze", label: "Bronze", min: 0 },
  { value: "silver", label: "Silver", min: 1000 },
  { value: "gold", label: "Gold", min: 2500 },
  { value: "diamond", label: "Diamond", min: 5000 }
] as const;
export const CHART_WINDOWS: Array<{ value: ChartWindowKey; label: string; seconds: number | null }> = [
  { value: "1h", label: "1H", seconds: 60 * 60 },
  { value: "6h", label: "6H", seconds: 6 * 60 * 60 },
  { value: "1d", label: "1D", seconds: 24 * 60 * 60 },
  { value: "1w", label: "1W", seconds: 7 * 24 * 60 * 60 },
  { value: "1m", label: "1M", seconds: 30 * 24 * 60 * 60 },
  { value: "all", label: "ALL", seconds: null }
];
export const MARKET_SORT_OPTIONS: Array<{ value: MarketSortKey; label: string }> = [
  { value: "created", label: "Created time" },
  { value: "ending", label: "Ending time" },
  { value: "volume", label: "Volume" },
  { value: "participants", label: "Participants" },
  { value: "yes", label: "YES %" },
  { value: "no", label: "NO %" }
];

export { ARC_RPC_URLS };
