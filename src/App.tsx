import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hash
} from "viem";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARC_CHAIN_ID_DECIMAL,
  ARC_EXPLORER_URL,
  ARC_NATIVE_USDC_DECIMALS,
  arcTestnet,
  arcTestnetParams
} from "./arc";
import { arcPredictionMarketAbi } from "./contracts/arcPredictionMarketAbi";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type MarketView = {
  id: number;
  question: string;
  category: string;
  closeTime: number;
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

type MarketContractVersion = "unknown" | "legacy" | "dispute";

type ActivityItem = {
  id: string;
  user: string;
  marketId: number;
  question: string;
  side: Outcome;
  amount: bigint;
  timestamp: number;
};

type AppView = "markets" | "ended" | "leaderboard" | "profile" | "collection" | "market";
type LeaderboardMetric = "volume" | "winRate" | "pnl";
type LeaderboardPeriod = "day" | "7d" | "30d" | "all";
type MarketSectionKey = "fresh" | "hot" | "closing";
type ThemeMode = "dark" | "light";

type LeaderboardRow = {
  address: string;
  volume: bigint;
  stake: bigint;
  payout: bigint;
  pnl: bigint;
  wonMarkets: number;
  resolvedMarkets: number;
  winRate: number;
};

enum Outcome {
  Unresolved = 0,
  Yes = 1,
  No = 2,
  Canceled = 3
}

const CONTRACT_ADDRESS = import.meta.env.VITE_PREDICTION_MARKET_ADDRESS || "";
const CATEGORIES = ["All", "Crypto", "Macro", "Sports", "Politics", "Arc", "AI", "Other"];
const SECTION_LIMIT = 6;
const WALLET_CONNECTED_KEY = "aurapredict.walletConnected";
const DISMISSED_RESULT_KEY = "aurapredict.dismissedResultNotices";
const THEME_KEY = "aurapredict.theme";
const PROFILE_NAMES_KEY = "aurapredict.profileNames";
const PROFILE_JOINED_KEY = "aurapredict.profileJoined";
const MARKET_QUERY_KEY = "market";
const X_URL = "https://x.com/AuraPredict";
const DISCORD_URL = "https://discord.gg/3wTYhdsr";
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
const LEADERBOARD_PERIODS: Array<{ value: LeaderboardPeriod; label: string; seconds: number | null }> = [
  { value: "day", label: "24H", seconds: 24 * 60 * 60 },
  { value: "7d", label: "7D", seconds: 7 * 24 * 60 * 60 },
  { value: "30d", label: "1M", seconds: 30 * 24 * 60 * 60 },
  { value: "all", label: "All", seconds: null }
];
const LEADERBOARD_METRICS: Array<{ value: LeaderboardMetric; label: string }> = [
  { value: "volume", label: "Volume" },
  { value: "winRate", label: "Win rate" },
  { value: "pnl", label: "PNL" }
];

function getInjectedProvider() {
  if (!window.ethereum) {
    throw new Error("Install MetaMask or Rabby, then open AuraPredict again.");
  }
  return window.ethereum;
}

function getPublicClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http()
  });
}

function getWalletClient() {
  return createWalletClient({
    chain: arcTestnet,
    transport: custom(getInjectedProvider() as never)
  });
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatUsdc(value: bigint) {
  const formatted = Number(formatUnits(value, ARC_NATIVE_USDC_DECIMALS));
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: formatted < 1 && formatted > 0 ? 4 : 2,
    maximumFractionDigits: 6
  }).format(formatted);
}

function formatSignedUsdc(value: bigint) {
  if (value === 0n) return "0.00";
  const sign = value < 0n ? "-" : "+";
  const absolute = value < 0n ? -value : value;
  return `${sign}${formatUsdc(absolute)}`;
}

function marketVolume(market: MarketView) {
  return market.yesPool + market.noPool;
}

function percent(value: bigint, total: bigint) {
  if (total === 0n) return 50;
  return Number((value * 10000n) / total) / 100;
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

function parseUtcDateTime(value: string) {
  const normalized = value.length === 16 ? `${value}:00Z` : `${value}Z`;
  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    throw new Error("Enter a valid UTC close time.");
  }
  return BigInt(Math.floor(timestamp / 1000));
}

function utcDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes())
  ].join("");
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

function hasUserPosition(market: MarketView) {
  return market.yesPosition > 0n || market.noPosition > 0n;
}

function userSettlement(market: MarketView, feeBps: number) {
  const stake = market.yesPosition + market.noPosition;
  if (market.outcome === Outcome.Unresolved) {
    return { settled: false, stake, payout: 0n, pnl: 0n, won: false };
  }

  if (market.outcome === Outcome.Canceled) {
    return { settled: true, stake, payout: stake, pnl: 0n, won: false };
  }

  const winningStake = market.outcome === Outcome.Yes ? market.yesPosition : market.noPosition;
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

function marketStatus(market: MarketView) {
  if (market.outcome !== Outcome.Unresolved) return outcomeLabel(market.outcome);
  if (market.disputed) return "Disputed";
  if (market.proposedAt > 0) return "Pending finalization";
  if (Date.now() / 1000 >= market.closeTime) return "Awaiting resolve";
  return "Live";
}

function isUnknownChainError(error: unknown) {
  const code = (error as { code?: number }).code;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return code === 4902 || message.includes("4902") || message.includes("not added");
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

function updateMarketRoute(marketId: number | null) {
  const url = new URL(window.location.href);
  if (marketId === null) {
    url.searchParams.delete(MARKET_QUERY_KEY);
  } else {
    url.searchParams.set(MARKET_QUERY_KEY, String(marketId));
  }
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
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

export default function App() {
  const transactionLockRef = useRef(false);
  const [account, setAccount] = useState("");
  const [owner, setOwner] = useState("");
  const [contractVersion, setContractVersion] = useState<MarketContractVersion>("unknown");
  const [minStake, setMinStake] = useState<bigint>(0n);
  const [creatorBond, setCreatorBond] = useState<bigint>(0n);
  const [disputeBond, setDisputeBond] = useState<bigint>(0n);
  const [disputeWindow, setDisputeWindow] = useState(0);
  const [protocolFeeBps, setProtocolFeeBps] = useState(0);
  const [accumulatedProtocolFees, setAccumulatedProtocolFees] = useState<bigint>(0n);
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastDataRefresh, setLastDataRefresh] = useState<Date | null>(null);
  const [notice, setNotice] = useState("");
  const [transactionPending, setTransactionPending] = useState(false);
  const [stakeInputs, setStakeInputs] = useState<Record<number, string>>({});
  const [activeCategory, setActiveCategory] = useState("All");
  const [view, setView] = useState<AppView>("markets");
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>("volume");
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [collectionView, setCollectionView] = useState<MarketSectionKey>("fresh");
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
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
  const [createForm, setCreateForm] = useState({
    question: "",
    category: "Crypto",
    closeTime: ""
  });

  const hasContract = useMemo(() => isAddress(CONTRACT_ADDRESS), []);
  const contractAddress = CONTRACT_ADDRESS as Address;

  const nowSeconds = Math.floor(currentTime.getTime() / 1000);
  const activeMarkets = markets.filter(
    (market) => market.outcome === Outcome.Unresolved && market.closeTime > nowSeconds
  );
  const pendingResolutionMarkets = markets.filter(
    (market) => market.outcome === Outcome.Unresolved && market.closeTime <= nowSeconds
  );
  const endedMarkets = markets.filter((market) => market.outcome !== Outcome.Unresolved);
  const liveMarkets = activeMarkets.length;
  const totalLiquidity = markets.reduce((sum, market) => sum + marketVolume(market), 0n);
  const profileMarkets = account
    ? markets.filter((market) => hasUserPosition(market) || sameAddress(market.creator, account))
    : [];
  const participatedProfileMarkets = profileMarkets.filter(hasUserPosition);
  const createdProfileMarkets = account ? markets.filter((market) => sameAddress(market.creator, account)) : [];
  const profileStake = profileMarkets.reduce((sum, market) => sum + market.yesPosition + market.noPosition, 0n);
  const claimable = profileMarkets.reduce((sum, market) => sum + market.potentialPayout, 0n);
  const createdMarkets = createdProfileMarkets.length;
  const accountKey = account ? account.toLowerCase() : "";
  const profileDisplayName = account ? profileNames[accountKey] || shortAddress(account) : "Connect wallet";
  const profileInitial = profileDisplayName.slice(0, 1).toUpperCase();
  const profileJoinedDate = accountKey ? profileJoinedDates[accountKey] : "";
  const profileJoinedLabel = profileJoinedDate
    ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(profileJoinedDate))
    : "New profile";
  const profileSettlements = participatedProfileMarkets
    .map((market) => ({ market, ...userSettlement(market, protocolFeeBps) }))
    .filter((item) => item.settled);
  const profileResolvedCount = profileSettlements.length;
  const profileWonCount = profileSettlements.filter((item) => item.won).length;
  const profileRealizedStake = profileSettlements.reduce((sum, item) => sum + item.stake, 0n);
  const profileRealizedPayout = profileSettlements.reduce((sum, item) => sum + item.payout, 0n);
  const profilePnl = profileRealizedPayout - profileRealizedStake;
  const profilePnlNumber = Number(formatUnits(profilePnl, ARC_NATIVE_USDC_DECIMALS));
  const profileStakeNumber = Number(formatUnits(profileRealizedStake, ARC_NATIVE_USDC_DECIMALS));
  const profileEdgePercent = profileStakeNumber > 0 ? (profilePnlNumber / profileStakeNumber) * 100 : 0;
  const profileWinRate = profileResolvedCount > 0 ? (profileWonCount / profileResolvedCount) * 100 : 0;
  const profileAuraScore = Math.max(
    0,
    Math.round(
      profileWinRate * 10 +
        profileResolvedCount * 35 +
        Number(formatUnits(profileStake, ARC_NATIVE_USDC_DECIMALS)) * 8 +
        createdMarkets * 20
    )
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
  const filteredEndedMarkets = endedMarkets.filter(categoryMatches);
  const formattedClock = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(currentTime);
  const minimumCloseInput = useMemo(
    () => utcDateTimeInputValue(new Date(currentTime.getTime() + 6 * 60 * 1000)),
    [currentTime]
  );
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
  const collectionMarkets =
    collectionView === "hot"
      ? allHottestMarkets
      : collectionView === "closing"
        ? allClosingSoonMarkets
        : allFreshMarkets;
  const collectionTitle =
    collectionView === "hot" ? "Hottest markets" : collectionView === "closing" ? "Closing soon" : "Fresh markets";
  const collectionDescription =
    collectionView === "hot"
      ? "All live markets sorted by participants, then volume."
      : collectionView === "closing"
        ? "All live markets sorted by nearest UTC close time."
        : "All live markets sorted by newest market first.";
  const freshMarkets = allFreshMarkets.slice(0, SECTION_LIMIT);
  const hottestMarkets = allHottestMarkets.slice(0, SECTION_LIMIT);
  const closingSoonMarkets = allClosingSoonMarkets.slice(0, SECTION_LIMIT);
  const selectedMarket = selectedMarketId === null ? undefined : markets.find((market) => market.id === selectedMarketId);
  const selectedMarketActivities = selectedMarket
    ? activities
        .filter((activity) => activity.marketId === selectedMarket.id)
        .sort((a, b) => a.timestamp - b.timestamp)
    : [];
  const selectedMarketTotal = selectedMarket ? marketVolume(selectedMarket) : 0n;
  const selectedMarketYesPercent = selectedMarket ? percent(selectedMarket.yesPool, selectedMarketTotal) : 50;
  const selectedMarketNoPercent = 100 - selectedMarketYesPercent;
  const detailChartRows = (() => {
    if (!selectedMarket) return [];

    let yesPool = 0n;
    let noPool = 0n;
    const source =
      selectedMarketActivities.length > 0
        ? selectedMarketActivities
        : [
            {
              id: `market-${selectedMarket.id}-current`,
              user: selectedMarket.creator,
              marketId: selectedMarket.id,
              question: selectedMarket.question,
              side: Outcome.Yes,
              amount: selectedMarket.yesPool,
              timestamp: selectedMarket.closeTime
            }
          ];

    return source.map((activity, index) => {
      if (activity.side === Outcome.Yes) yesPool += activity.amount;
      if (activity.side === Outcome.No) noPool += activity.amount;
      const total = yesPool + noPool;
      const yes = total > 0n ? percent(yesPool, total) : selectedMarketYesPercent;
      const x = source.length <= 1 ? 8 + index * 84 : 8 + (index / (source.length - 1)) * 84;

      return {
        x,
        yesY: 54 - yes * 0.42,
        noY: 54 - (100 - yes) * 0.42
      };
    });
  })();
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
  const resolveNotifications = account
    ? pendingResolutionMarkets.filter(
        (market) =>
          market.proposedAt === 0 &&
          (sameAddress(market.resolver, account) || (!!owner && sameAddress(owner, account)))
      )
    : [];
  const finalizeNotifications = account
    ? pendingResolutionMarkets.filter(
        (market) =>
          market.proposedAt > 0 &&
          !market.disputed &&
          market.disputeDeadline <= nowSeconds &&
          (sameAddress(market.resolver, account) || (!!owner && sameAddress(owner, account)))
      )
    : [];
  const disputeReviewNotifications =
    account && owner
      ? pendingResolutionMarkets.filter((market) => market.disputed && sameAddress(owner, account))
      : [];
  const claimNotifications = account
    ? profileMarkets.filter(
        (market) => market.outcome !== Outcome.Unresolved && !market.claimed && market.potentialPayout > 0n
      )
    : [];
  const resultNotifications = account
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
  const notificationCount =
    resolveNotifications.length +
    finalizeNotifications.length +
    disputeReviewNotifications.length +
    claimNotifications.length +
    resultNotifications.length;
  const leaderboardTimestamp = lastDataRefresh ? Math.floor(lastDataRefresh.getTime() / 1000) : nowSeconds;
  const lastRefreshText = lastDataRefresh
    ? `${lastDataRefresh.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false })} UTC`
    : "Not loaded";
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
              : "Live markets";
  const leaderboardRows = useMemo<LeaderboardRow[]>(() => {
    const period = LEADERBOARD_PERIODS.find((item) => item.value === leaderboardPeriod);
    const periodStart = period?.seconds ? leaderboardTimestamp - period.seconds : 0;
    const marketMap = new Map(markets.map((market) => [market.id, market]));
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
        positions: Map<number, { yes: bigint; no: bigint }>;
      }
    >();

    for (const activity of activities) {
      if (activity.timestamp > 0 && activity.timestamp < periodStart) continue;
      const market = marketMap.get(activity.marketId);
      if (!market) continue;

      const key = activity.user.toLowerCase();
      const row =
        rows.get(key) ??
        {
          address: activity.user,
          volume: 0n,
          stake: 0n,
          payout: 0n,
          pnl: 0n,
          wonMarkets: 0,
          resolvedMarkets: 0,
          positions: new Map<number, { yes: bigint; no: bigint }>()
        };
      const position = row.positions.get(activity.marketId) ?? { yes: 0n, no: 0n };

      row.volume += activity.amount;
      row.stake += activity.amount;
      if (activity.side === Outcome.Yes) {
        position.yes += activity.amount;
      } else if (activity.side === Outcome.No) {
        position.no += activity.amount;
      }

      row.positions.set(activity.marketId, position);
      rows.set(key, row);
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
          const fee = (profit * BigInt(protocolFeeBps)) / 10000n;
          const payout = grossPayout - fee;
          row.payout += payout;
          row.pnl += payout - stake;
          row.resolvedMarkets += 1;
          if (winningStake > 0n) row.wonMarkets += 1;
        } else if (market.outcome === Outcome.Canceled) {
          row.payout += stake;
        }
      }

      return {
        address: row.address,
        volume: row.volume,
        stake: row.stake,
        payout: row.payout,
        pnl: row.pnl,
        wonMarkets: row.wonMarkets,
        resolvedMarkets: row.resolvedMarkets,
        winRate: row.resolvedMarkets > 0 ? (row.wonMarkets / row.resolvedMarkets) * 100 : 0
      };
    });

    return output
      .sort((left, right) => {
        if (leaderboardMetric === "winRate") {
          if (right.winRate !== left.winRate) return right.winRate - left.winRate;
          return right.volume > left.volume ? 1 : right.volume < left.volume ? -1 : 0;
        }
        const rightValue = leaderboardMetric === "volume" ? right.volume : right.pnl;
        const leftValue = leaderboardMetric === "volume" ? left.volume : left.pnl;
        return rightValue > leftValue ? 1 : rightValue < leftValue ? -1 : 0;
      })
      .slice(0, 50);
  }, [activities, leaderboardMetric, leaderboardPeriod, leaderboardTimestamp, markets, protocolFeeBps]);

  const profileVolumeRows = useMemo(
    () =>
      Array.from(
        activities.reduce((rows, activity) => {
          const key = activity.user.toLowerCase();
          rows.set(key, (rows.get(key) ?? 0n) + activity.amount);
          return rows;
        }, new Map<string, bigint>())
      ).sort((left, right) => (right[1] > left[1] ? 1 : right[1] < left[1] ? -1 : 0)),
    [activities]
  );
  const profileVolumeRank = accountKey
    ? profileVolumeRows.findIndex(([address]) => address === accountKey) + 1
    : 0;
  const profileLeaderboardRow = accountKey
    ? leaderboardRows.find((row) => sameAddress(row.address, accountKey))
    : undefined;

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

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

  const switchToArc = useCallback(async () => {
    const injected = getInjectedProvider();
    try {
      await injected.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: arcTestnetParams.chainId }]
      });
    } catch (error) {
      if (!isUnknownChainError(error)) throw error;
      await injected.request({
        method: "wallet_addEthereumChain",
        params: [arcTestnetParams]
      });
      await injected.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: arcTestnetParams.chainId }]
      });
    }
  }, []);

  const connectWallet = useCallback(async () => {
    setNotice("");
    setConnecting(true);
    await switchToArc();
    const walletClient = getWalletClient();
    const addresses = await walletClient.requestAddresses();
    const chainId = await walletClient.getChainId();
    if (BigInt(chainId) !== ARC_CHAIN_ID_DECIMAL) {
      throw new Error("Wallet is not on Arc Testnet.");
    }
    if (!addresses[0]) {
      throw new Error("No wallet account returned.");
    }
    setAccount(addresses[0]);
    window.localStorage.setItem(WALLET_CONNECTED_KEY, "true");
    setNotice("Wallet connected on Arc Testnet.");
    setConnecting(false);
  }, [switchToArc]);

  const handleConnectWallet = useCallback(async () => {
    try {
      await connectWallet();
      setWalletModalOpen(false);
    } catch (error) {
      setConnecting(false);
      setNotice(`Connect failed: ${errorMessage(error)}`);
    }
  }, [connectWallet]);

  const openWalletModal = useCallback(() => {
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    setWalletModalOpen(true);
  }, []);

  const openProfile = useCallback(() => {
    setSelectedMarketId(null);
    updateMarketRoute(null);
    setView("profile");
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
  }, []);

  const disconnectWallet = useCallback(async () => {
    setAccount("");
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    window.localStorage.removeItem(WALLET_CONNECTED_KEY);
    setNotice("Wallet disconnected in AuraPredict.");

    try {
      await window.ethereum?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }]
      });
    } catch {
      // Some wallets do not support permission revocation from dapps.
    }
  }, []);

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

  const openCreateMarket = useCallback(() => {
    setCreateModalOpen(true);
  }, []);

  const setThemeMode = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    setThemeMenuOpen(false);
  }, []);

  const saveProfileName = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!accountKey) {
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
      setNotice("Username saved for this wallet.");
    },
    [accountKey, profileNameInput, profileNames]
  );

  const copyProfileLink = useCallback(async () => {
    if (!account) {
      setNotice("Connect wallet before sharing a profile.");
      return;
    }

    const profileUrl = `${window.location.origin}${window.location.pathname}?profile=${account}`;
    try {
      await window.navigator.clipboard.writeText(profileUrl);
      setNotice("Profile link copied.");
    } catch {
      setNotice(profileUrl);
    }
  }, [account]);

  const openCollection = useCallback((section: MarketSectionKey) => {
    setCollectionView(section);
    setSelectedMarketId(null);
    updateMarketRoute(null);
    setView("collection");
    window.setTimeout(() => document.getElementById("markets")?.scrollIntoView({ block: "start" }), 50);
  }, []);

  const openMarket = useCallback((marketId: number) => {
    setSelectedMarketId(marketId);
    updateMarketRoute(marketId);
    setView("market");
    setSearchQuery("");
    setSearchFocused(false);
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    setThemeMenuOpen(false);
    window.setTimeout(() => document.getElementById("markets")?.scrollIntoView({ block: "start" }), 50);
  }, []);

  const backToMarkets = useCallback(() => {
    setSelectedMarketId(null);
    updateMarketRoute(null);
    setView("markets");
    window.setTimeout(() => document.getElementById("markets")?.scrollIntoView({ block: "start" }), 50);
  }, []);

  const openSearchedMarket = useCallback(
    (market: MarketView) => {
      setSelectedMarketId(market.id);
      updateMarketRoute(market.id);
      setView("market");
      setActiveCategory("All");
      setSearchQuery("");
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

    setLoading(true);
    try {
      const publicClient = getPublicClient();
      const [count, contractOwner, contractMinStake] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "marketCount"
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "owner"
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "minStake"
        })
      ]);

      setOwner(contractOwner);
      setMinStake(contractMinStake);
      try {
        const [contractCreatorBond, contractDisputeBond, contractDisputeWindow] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "creatorBond"
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "disputeBond"
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "disputeWindow"
          })
        ]);
        setCreatorBond(contractCreatorBond);
        setDisputeBond(contractDisputeBond);
        setDisputeWindow(Number(contractDisputeWindow));
      } catch {
        setCreatorBond(0n);
        setDisputeBond(0n);
        setDisputeWindow(0);
      }
      try {
        const [feeBps, protocolFees] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "protocolFeeBps"
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: arcPredictionMarketAbi,
            functionName: "accumulatedProtocolFees"
          })
        ]);
        setProtocolFeeBps(Number(feeBps));
        setAccumulatedProtocolFees(protocolFees);
      } catch {
        setProtocolFeeBps(0);
        setAccumulatedProtocolFees(0n);
      }

      const rows = await Promise.all(
        Array.from({ length: Number(count) }, async (_, id) => {
          let marketData;
          let isLegacyMarket = false;

          try {
            marketData = await publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "getMarket",
              args: [BigInt(id)]
            });
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
              const legacyMarket = await publicClient.readContract({
                address: contractAddress,
                abi: legacyAbi,
                functionName: "getMarket",
                args: [BigInt(id)]
              });
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
              throw error;
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

          if (id === 0) setContractVersion(isLegacyMarket ? "legacy" : "dispute");

          let yesPosition = 0n;
          let noPosition = 0n;
          let claimed = false;
          let potentialPayout = 0n;

          if (account && isAddress(account)) {
            const position = await publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "positionOf",
              args: [BigInt(id), account as Address]
            });
            yesPosition = position[0];
            noPosition = position[1];
            claimed = position[2];
            potentialPayout = await publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "potentialPayout",
              args: [BigInt(id), account as Address]
            });
          }

          return {
            id,
            question,
            category,
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
            yesPosition,
            noPosition,
            claimed,
            potentialPayout
          };
        })
      );

      if (Number(count) === 0) setContractVersion("unknown");
      const sortedRows = rows.sort((a, b) => b.id - a.id);
      setMarkets(sortedRows);

      try {
        const marketMap = new Map(sortedRows.map((market) => [market.id, market]));
        const events = await publicClient.getContractEvents({
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          eventName: "BetPlaced",
          fromBlock: 0n,
          toBlock: "latest"
        });
        const blockTimestamps = new Map<bigint, number>();
        const activityRows = await Promise.all(
          events.map(async (event) => {
            const args = event.args as {
              marketId?: bigint;
              user?: Address;
              side?: number;
              amount?: bigint;
            };
            const marketId = Number(args.marketId ?? 0n);
            let timestamp = 0;
            if (event.blockNumber) {
              if (!blockTimestamps.has(event.blockNumber)) {
                const block = await publicClient.getBlock({ blockNumber: event.blockNumber });
                blockTimestamps.set(event.blockNumber, Number(block.timestamp));
              }
              timestamp = blockTimestamps.get(event.blockNumber) ?? 0;
            }

            return {
              id: `${event.transactionHash}-${event.logIndex}`,
              user: args.user ?? "0x0000000000000000000000000000000000000000",
              marketId,
              question: marketMap.get(marketId)?.question ?? `Market #${marketId}`,
              side: Number(args.side ?? 0) as Outcome,
              amount: args.amount ?? 0n,
              timestamp
            };
          })
        );
        setActivities(activityRows.sort((a, b) => b.timestamp - a.timestamp));
      } catch {
        setActivities([]);
      }
      setLastDataRefresh(new Date());
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [account, contractAddress, hasContract]);

  const runTransaction = async (action: () => Promise<Hash>, message: string) => {
    if (transactionLockRef.current) {
      setNotice("A wallet confirmation is already open. Confirm or reject it before sending another transaction.");
      return false;
    }

    transactionLockRef.current = true;
    setTransactionPending(true);
    try {
      setNotice(message);
      const hash = await action();
      await getPublicClient().waitForTransactionReceipt({ hash });
      setNotice(`Transaction finalized on Arc: ${shortHash(hash)}`);
      await loadMarkets();
      return true;
    } finally {
      transactionLockRef.current = false;
      setTransactionPending(false);
    }
  };

  const createMarket = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
      if (!createForm.question.trim()) throw new Error("Market question is required.");
      if (!createForm.closeTime) throw new Error("Close time is required.");
      if (contractVersion !== "legacy" && creatorBond <= 0n) {
        throw new Error("Creator bond is not loaded. Refresh contract data first.");
      }

      const closeTime = parseUtcDateTime(createForm.closeTime);
      const earliestCloseTime = BigInt(Math.floor(Date.now() / 1000) + 5 * 60);
      if (closeTime <= earliestCloseTime) {
        throw new Error("Close time must be at least 5 minutes after the current UTC time.");
      }

      await switchToArc();
      const walletClient = getWalletClient();

      let completed = false;

      if (contractVersion === "legacy") {
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
              args: [createForm.question.trim(), createForm.category.trim(), closeTime]
            }),
          "Creating legacy market..."
        );
      } else {
        completed = await runTransaction(
          () =>
            walletClient.writeContract({
              account: account as Address,
              chain: arcTestnet,
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "createMarket",
              args: [createForm.question.trim(), createForm.category.trim(), closeTime],
              value: creatorBond
            }),
          `Creating market with ${formatUsdc(creatorBond)} USDC creator bond...`
        );
      }

      if (!completed) return;

      setCreateForm({ question: "", category: "Crypto", closeTime: "" });
      setCreateModalOpen(false);
      setView("markets");
      setActiveCategory("All");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const placeBet = async (marketId: number, side: Outcome) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    const amount = stakeInputs[marketId] || "";
    if (!amount || Number(amount) <= 0) throw new Error("Enter a valid USDC amount.");

    await switchToArc();
    const walletClient = getWalletClient();
    const value = parseUnits(amount, ARC_NATIVE_USDC_DECIMALS);

    const completed = await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "bet",
          args: [BigInt(marketId), side],
          value
        }),
      `Staking ${amount} USDC...`
    );
    if (completed) {
      setStakeInputs((current) => ({ ...current, [marketId]: "" }));
    }
  };

  const resolveMarket = async (marketId: number, outcome: Outcome) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    await switchToArc();
    const walletClient = getWalletClient();
    await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "resolve",
          args: [BigInt(marketId), outcome]
        }),
      "Resolving market..."
    );
  };

  const disputeMarket = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    if (disputeBond <= 0n) throw new Error("Dispute bond is not loaded. Refresh contract data first.");
    await switchToArc();
    const walletClient = getWalletClient();
    await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "dispute",
          args: [BigInt(marketId)],
          value: disputeBond
        }),
      `Disputing result with ${formatUsdc(disputeBond)} USDC bond...`
    );
  };

  const finalizeMarket = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    await switchToArc();
    const walletClient = getWalletClient();
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
      "Finalizing market result..."
    );
  };

  const finalizeDispute = async (marketId: number, outcome: Outcome) => {
    if (!account || !isAddress(account)) throw new Error("Connect owner wallet first.");
    await switchToArc();
    const walletClient = getWalletClient();
    await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "finalizeDispute",
          args: [BigInt(marketId), outcome]
        }),
      "Finalizing disputed market..."
    );
  };

  const cancelMarket = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    await switchToArc();
    const walletClient = getWalletClient();
    await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "cancel",
          args: [BigInt(marketId)]
        }),
      "Canceling market..."
    );
  };

  const claim = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
    await switchToArc();
    const walletClient = getWalletClient();
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

  const withdrawFees = async () => {
    if (!account || !isAddress(account)) throw new Error("Connect owner wallet first.");
    if (!owner || !sameAddress(account, owner)) throw new Error("Only the protocol owner can withdraw fees.");
    await switchToArc();
    const walletClient = getWalletClient();
    await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketAbi,
          functionName: "withdrawProtocolFees",
          args: [account as Address, 0n]
        }),
      "Withdrawing protocol fees..."
    );
  };

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccounts = (accounts: unknown) => {
      const next = Array.isArray(accounts) ? String(accounts[0] || "") : "";
      if (next) {
        window.localStorage.setItem(WALLET_CONNECTED_KEY, "true");
      } else {
        window.localStorage.removeItem(WALLET_CONNECTED_KEY);
        setWalletMenuOpen(false);
      }
      setAccount(next);
    };

    window.ethereum.on?.("accountsChanged", handleAccounts);
    window.ethereum.on?.("chainChanged", () => window.location.reload());

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccounts);
    };
  }, []);

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
        const accounts = await getInjectedProvider().request({ method: "eth_accounts" });
        const next = Array.isArray(accounts) ? String(accounts[0] || "") : "";
        if (!mounted || !next) return;

        const walletClient = getWalletClient();
        const chainId = await walletClient.getChainId();
        setAccount(next);
        window.localStorage.setItem(WALLET_CONNECTED_KEY, "true");

        if (BigInt(chainId) !== ARC_CHAIN_ID_DECIMAL) {
          setNotice("Wallet remembered. Switch MetaMask to Arc Testnet to continue.");
        }
      } catch (error) {
        if (mounted) setNotice(`Reconnect failed: ${errorMessage(error)}`);
      }
    }

    restoreWallet();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const syncMarketRoute = () => {
      const marketParam = new URLSearchParams(window.location.search).get(MARKET_QUERY_KEY);
      if (!marketParam) return;
      const marketId = Number(marketParam);
      if (!Number.isInteger(marketId) || marketId < 0) return;

      setSelectedMarketId(marketId);
      setView("market");
    };

    syncMarketRoute();
    window.addEventListener("popstate", syncMarketRoute);

    return () => window.removeEventListener("popstate", syncMarketRoute);
  }, []);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      loadMarkets();
    }, 60 * 60 * 1000);

    return () => window.clearInterval(refreshTimer);
  }, [loadMarkets]);

  const renderMarketCards = (items: MarketView[], emptyTitle: string, emptyText: string) => (
    <section className="market-grid">
      {items.length === 0 && (
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
        const canUseDisputeFlow = contractVersion !== "legacy";
        const canPropose =
          canUseDisputeFlow &&
          account &&
          market.outcome === Outcome.Unresolved &&
          market.proposedAt === 0 &&
          Date.now() / 1000 >= market.closeTime &&
          [market.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());
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
          Date.now() / 1000 < market.disputeDeadline &&
          hasUserPosition(market);
        const canFinalize =
          canUseDisputeFlow &&
          market.outcome === Outcome.Unresolved &&
          market.proposedAt > 0 &&
          !market.disputed &&
          Date.now() / 1000 >= market.disputeDeadline;
        const canFinalizeDispute =
          canUseDisputeFlow &&
          account &&
          owner &&
          market.outcome === Outcome.Unresolved &&
          market.disputed &&
          sameAddress(account, owner);
        const canClaim = account && market.potentialPayout > 0n && !market.claimed;
        const canLegacyResolve =
          contractVersion === "legacy" &&
          account &&
          market.outcome === Outcome.Unresolved &&
          Date.now() / 1000 >= market.closeTime &&
          [market.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());

        return (
          <article
            className="market-card interactive-market-card"
            key={market.id}
            onClick={() => openMarket(market.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") openMarket(market.id);
            }}
            role="button"
            tabIndex={0}
          >
            <div className="market-topline">
              <span className={`category ${meta.className}`}>
                <CategoryIcon category={market.category || "Other"} />
                {market.category || "Other"}
              </span>
              <span className={`status status-${market.outcome}`}>{marketStatus(market)}</span>
            </div>
            <h3>{market.question}</h3>

            <div className="odds-row">
              <div>
                <span>YES</span>
                <strong>{yesPercent.toFixed(1)}%</strong>
              </div>
              <div>
                <span>NO</span>
                <strong>{noPercent.toFixed(1)}%</strong>
              </div>
            </div>
            <div className="pool-bar" aria-label="Pool split">
              <span style={{ width: `${yesPercent}%` }} />
            </div>

            <div className="market-meta">
              <div>
                <span>Volume</span>
                <strong>{formatUsdc(totalPool)} USDC</strong>
              </div>
              <div>
                <span>Participants</span>
                <strong>{market.traderCount}</strong>
              </div>
              <div>
                <span>Countdown</span>
                <strong>{countdownText(market.closeTime, currentTime)}</strong>
              </div>
              <div>
                <span>Closes</span>
                <strong>{closeDate(market.closeTime)}</strong>
              </div>
              <div>
                <span>Creator</span>
                <strong>{shortAddress(market.creator)}</strong>
              </div>
              {market.proposedAt > 0 && (
                <div>
                  <span>Proposed</span>
                  <strong>{outcomeLabel(market.proposedOutcome)}</strong>
                </div>
              )}
              {market.proposedAt > 0 && market.outcome === Outcome.Unresolved && (
                <div>
                  <span>Dispute until</span>
                  <strong>{closeDate(market.disputeDeadline)}</strong>
                </div>
              )}
            </div>

            {account && (
              <div className="position-chip">
                YES {formatUsdc(market.yesPosition)} / NO {formatUsdc(market.noPosition)}
              </div>
            )}

            <div className="trade-row" onClick={(event) => event.stopPropagation()}>
              <input
                inputMode="decimal"
                placeholder="USDC amount"
                value={stakeInputs[market.id] || ""}
                onChange={(event) =>
                  setStakeInputs((current) => ({ ...current, [market.id]: event.target.value }))
                }
                disabled={!canBet}
              />
              <button
                className="yes-button"
                onClick={(event) => {
                  event.stopPropagation();
                  placeBet(market.id, Outcome.Yes);
                }}
                disabled={!canBet}
              >
                YES
              </button>
              <button
                className="no-button"
                onClick={(event) => {
                  event.stopPropagation();
                  placeBet(market.id, Outcome.No);
                }}
                disabled={!canBet}
              >
                NO
              </button>
            </div>

            {(canPropose || canLegacyResolve || canDispute || canFinalize || canFinalizeDispute || canClaim) && (
              <div className="settlement-row" onClick={(event) => event.stopPropagation()}>
                {canLegacyResolve && (
                  <>
                    <button className="secondary" onClick={() => resolveMarket(market.id, Outcome.Yes)}>
                      Resolve YES
                    </button>
                    <button className="secondary" onClick={() => resolveMarket(market.id, Outcome.No)}>
                      Resolve NO
                    </button>
                    <button className="secondary" onClick={() => cancelMarket(market.id)}>
                      Cancel
                    </button>
                  </>
                )}
                {canPropose && (
                  <>
                    <button className="secondary" onClick={() => resolveMarket(market.id, Outcome.Yes)}>
                      Propose YES
                    </button>
                    <button className="secondary" onClick={() => resolveMarket(market.id, Outcome.No)}>
                      Propose NO
                    </button>
                    <button className="secondary" onClick={() => cancelMarket(market.id)}>
                      Propose Cancel
                    </button>
                  </>
                )}
                {canDispute && (
                  <button className="secondary" onClick={() => disputeMarket(market.id)}>
                    Dispute {formatUsdc(disputeBond)} USDC
                  </button>
                )}
                {canFinalize && (
                  <button className="secondary" onClick={() => finalizeMarket(market.id)}>
                    Finalize
                  </button>
                )}
                {canFinalizeDispute && (
                  <>
                    <button className="secondary" onClick={() => finalizeDispute(market.id, Outcome.Yes)}>
                      Final YES
                    </button>
                    <button className="secondary" onClick={() => finalizeDispute(market.id, Outcome.No)}>
                      Final NO
                    </button>
                    <button className="secondary" onClick={() => finalizeDispute(market.id, Outcome.Canceled)}>
                      Final Cancel
                    </button>
                  </>
                )}
                {canClaim && (
                  <button onClick={() => claim(market.id)}>
                    Claim {formatUsdc(market.potentialPayout)} USDC
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
      Date.now() / 1000 >= selectedMarket.closeTime &&
      [selectedMarket.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());
    const canDispute =
      canUseDisputeFlow &&
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.proposedAt > 0 &&
      !selectedMarket.disputed &&
      Date.now() / 1000 < selectedMarket.disputeDeadline &&
      hasUserPosition(selectedMarket);
    const canFinalize =
      canUseDisputeFlow &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.proposedAt > 0 &&
      !selectedMarket.disputed &&
      Date.now() / 1000 >= selectedMarket.disputeDeadline;
    const canFinalizeDispute =
      canUseDisputeFlow &&
      account &&
      owner &&
      selectedMarket.outcome === Outcome.Unresolved &&
      selectedMarket.disputed &&
      sameAddress(account, owner);
    const canLegacyResolve =
      contractVersion === "legacy" &&
      account &&
      selectedMarket.outcome === Outcome.Unresolved &&
      Date.now() / 1000 >= selectedMarket.closeTime &&
      [selectedMarket.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());
    const canClaim = account && selectedMarket.potentialPayout > 0n && !selectedMarket.claimed;
    const meta = categoryMeta(selectedMarket.category || "Other");
    const chartRows =
      detailChartRows.length > 1
        ? detailChartRows
        : [
            { x: 8, yesY: 54 - 50 * 0.42, noY: 54 - 50 * 0.42 },
            {
              x: 92,
              yesY: 54 - selectedMarketYesPercent * 0.42,
              noY: 54 - selectedMarketNoPercent * 0.42
            }
          ];
    const copyMarketLink = async () => {
      const url = `${window.location.origin}${window.location.pathname}?market=${selectedMarket.id}`;
      try {
        await window.navigator.clipboard.writeText(url);
        setNotice("Market link copied.");
      } catch {
        setNotice(url);
      }
    };

    return (
      <section className="market-detail-view">
        <button className="secondary back-button" onClick={backToMarkets} type="button">
          Back to markets
        </button>

        <section className="market-detail-hero">
          <div className="detail-question-panel">
            <img src="/aurapredict-logo.png" alt="" />
            <div>
              <span className={`category ${meta.className}`}>
                <CategoryIcon category={selectedMarket.category || "Other"} />
                {selectedMarket.category || "Other"}
              </span>
              <h1>{selectedMarket.question}</h1>
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
              <strong>{formatUsdc(totalPool)} USDC</strong>
            </div>
            <div>
              <span>Leading</span>
              <strong>{selectedMarketYesPercent >= selectedMarketNoPercent ? "YES" : "NO"}</strong>
            </div>
            <div>
              <span>Creator</span>
              <strong>{shortAddress(selectedMarket.creator)}</strong>
            </div>
          </aside>
        </section>

        <section className="detail-body-grid">
          <section className="detail-chart-card">
            <div className="detail-chart-header">
              <div>
                <span className="section-label">Odds movement</span>
                <h2>YES / NO price history</h2>
              </div>
              <div className="chart-window-tabs">
                <span>1H</span>
                <strong>All</strong>
              </div>
            </div>
            <svg className="detail-chart" viewBox="0 0 100 58" role="img" aria-label="Market odds chart">
              <path className="edge-grid" d="M8 10H96 M8 28H96 M8 46H96" />
              <polyline className="detail-yes-line" points={chartRows.map((point) => `${point.x},${point.yesY}`).join(" ")} />
              <polyline className="detail-no-line" points={chartRows.map((point) => `${point.x},${point.noY}`).join(" ")} />
            </svg>
            <div className="edge-legend">
              <span className="won">YES {selectedMarketYesPercent.toFixed(1)}%</span>
              <span className="lost">NO {selectedMarketNoPercent.toFixed(1)}%</span>
            </div>
          </section>

          <aside className="detail-trade-card">
            <div className="detail-outcome-row">
              <span className="outcome-dot yes" />
              <strong>YES</strong>
              <span>{selectedMarketYesPercent.toFixed(1)}%</span>
            </div>
            <div className="detail-outcome-row">
              <span className="outcome-dot no" />
              <strong>NO</strong>
              <span>{selectedMarketNoPercent.toFixed(1)}%</span>
            </div>
            <div className="trade-row">
              <input
                inputMode="decimal"
                placeholder="USDC amount"
                value={stakeInputs[selectedMarket.id] || ""}
                onChange={(event) =>
                  setStakeInputs((current) => ({ ...current, [selectedMarket.id]: event.target.value }))
                }
                disabled={!canBet}
              />
              <button className="yes-button" onClick={() => placeBet(selectedMarket.id, Outcome.Yes)} disabled={!canBet}>
                YES
              </button>
              <button className="no-button" onClick={() => placeBet(selectedMarket.id, Outcome.No)} disabled={!canBet}>
                NO
              </button>
            </div>
            {account && (
              <div className="position-chip">
                Your position: YES {formatUsdc(selectedMarket.yesPosition)} / NO {formatUsdc(selectedMarket.noPosition)}
              </div>
            )}
            {(canLegacyResolve || canPropose || canDispute || canFinalize || canFinalizeDispute || canClaim) && (
              <div className="settlement-row">
                {canLegacyResolve && (
                  <>
                    <button className="secondary" onClick={() => resolveMarket(selectedMarket.id, Outcome.Yes)}>
                      Resolve YES
                    </button>
                    <button className="secondary" onClick={() => resolveMarket(selectedMarket.id, Outcome.No)}>
                      Resolve NO
                    </button>
                    <button className="secondary" onClick={() => cancelMarket(selectedMarket.id)}>
                      Cancel
                    </button>
                  </>
                )}
                {canPropose && (
                  <>
                    <button className="secondary" onClick={() => resolveMarket(selectedMarket.id, Outcome.Yes)}>
                      Propose YES
                    </button>
                    <button className="secondary" onClick={() => resolveMarket(selectedMarket.id, Outcome.No)}>
                      Propose NO
                    </button>
                    <button className="secondary" onClick={() => cancelMarket(selectedMarket.id)}>
                      Cancel
                    </button>
                  </>
                )}
                {canDispute && (
                  <button className="secondary" onClick={() => disputeMarket(selectedMarket.id)}>
                    Dispute {formatUsdc(disputeBond)} USDC
                  </button>
                )}
                {canFinalize && (
                  <button className="secondary" onClick={() => finalizeMarket(selectedMarket.id)}>
                    Finalize
                  </button>
                )}
                {canFinalizeDispute && (
                  <>
                    <button className="secondary" onClick={() => finalizeDispute(selectedMarket.id, Outcome.Yes)}>
                      Final YES
                    </button>
                    <button className="secondary" onClick={() => finalizeDispute(selectedMarket.id, Outcome.No)}>
                      Final NO
                    </button>
                    <button className="secondary" onClick={() => finalizeDispute(selectedMarket.id, Outcome.Canceled)}>
                      Final Cancel
                    </button>
                  </>
                )}
                {canClaim && (
                  <button onClick={() => claim(selectedMarket.id)}>
                    Claim {formatUsdc(selectedMarket.potentialPayout)} USDC
                  </button>
                )}
              </div>
            )}
          </aside>
        </section>

        <section className="market-timeline">
          {[
            { label: "Created", active: true, detail: `Market #${selectedMarket.id}` },
            { label: "Trading open", active: Date.now() / 1000 < selectedMarket.closeTime, detail: countdownText(selectedMarket.closeTime, currentTime) },
            { label: "Trading closed", active: Date.now() / 1000 >= selectedMarket.closeTime, detail: closeDate(selectedMarket.closeTime) },
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
      </section>
    );
  };

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a
          className="brand"
          href="#markets"
          aria-label="AuraPredict home"
          onClick={(event) => {
            event.preventDefault();
            backToMarkets();
          }}
        >
          <img src="/aurapredict-logo.png" alt="AuraPredict" />
          <span>AuraPredict</span>
        </a>
        <div className="topbar-center">
          <div className="nav-tabs">
            <button
              className={view === "markets" || view === "collection" || view === "market" ? "tab active" : "tab"}
              onClick={backToMarkets}
            >
              Markets
            </button>
            <button
              className={view === "ended" ? "tab active" : "tab"}
              onClick={() => {
                setSelectedMarketId(null);
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
                updateMarketRoute(null);
                setView("leaderboard");
              }}
            >
              Leaderboard
            </button>
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
                        {marketStatus(market)} / {formatUsdc(marketVolume(market))} USDC / {closeDate(market.closeTime)}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="clock-widget">
            <span>UTC</span>
            <strong>{formattedClock}</strong>
          </div>
        </div>
        <div className="wallet-panel">
          <div className="theme-menu">
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
              <div className="notification-menu">
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
                    {notificationCount === 0 && (
                      <div className="notification-empty">No pending resolution or claim actions.</div>
                    )}
                    {resolveNotifications.map((market) => (
                      <article className="notification-card" key={`resolve-${market.id}`}>
                        <span>Result needed</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>Closed {closeDate(market.closeTime)}. Creator bond stays locked during dispute window.</small>
                        <div className="notification-actions">
                          <button onClick={() => resolveMarket(market.id, Outcome.Yes)}>Propose YES</button>
                          <button onClick={() => resolveMarket(market.id, Outcome.No)}>Propose NO</button>
                          <button className="secondary" onClick={() => cancelMarket(market.id)}>
                            Propose Cancel
                          </button>
                        </div>
                      </article>
                    ))}
                    {finalizeNotifications.map((market) => (
                      <article className="notification-card" key={`finalize-${market.id}`}>
                        <span>Ready to finalize</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>Proposed {outcomeLabel(market.proposedOutcome)}. No dispute was opened.</small>
                        <button onClick={() => finalizeMarket(market.id)}>Finalize result</button>
                      </article>
                    ))}
                    {disputeReviewNotifications.map((market) => (
                      <article className="notification-card" key={`review-${market.id}`}>
                        <span>Dispute review</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>
                          Proposed {outcomeLabel(market.proposedOutcome)}. Disputer {shortAddress(market.disputer)}.
                        </small>
                        <div className="notification-actions">
                          <button onClick={() => finalizeDispute(market.id, Outcome.Yes)}>Final YES</button>
                          <button onClick={() => finalizeDispute(market.id, Outcome.No)}>Final NO</button>
                          <button className="secondary" onClick={() => finalizeDispute(market.id, Outcome.Canceled)}>
                            Cancel
                          </button>
                        </div>
                      </article>
                    ))}
                    {claimNotifications.map((market) => (
                      <article className="notification-card" key={`claim-${market.id}`}>
                        <span>Claim available</span>
                        <strong>{shortQuestion(market.question)}</strong>
                        <small>{formatUsdc(market.potentialPayout)} USDC ready</small>
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
              <div className="wallet-menu">
                <button
                  className="wallet-button"
                  onClick={() => {
                    setWalletMenuOpen((current) => !current);
                    setNotificationMenuOpen(false);
                  }}
                >
                  <span className="wallet-dot" />
                  {profileDisplayName}
                  <span className="chevron">v</span>
                </button>
                {walletMenuOpen && (
                  <div className="wallet-dropdown">
                    <div className="wallet-dropdown-head">
                      <span>Connected wallet</span>
                      <strong>{shortAddress(account)}</strong>
                    </div>
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

      {notice && <div className="toast-notice">{notice}</div>}

      <section className="activity-ticker" aria-label="Recent market activity">
        <div className="ticker-track">
          {tickerActivities.map((activity, index) => (
            <span className="ticker-item" key={`${activity.id}-${index}`}>
              <strong>{shortAddress(activity.user)}</strong> bought{" "}
              <b className={activity.side === Outcome.Yes ? "ticker-yes" : "ticker-no"}>
                {activity.side === Outcome.Yes ? "YES" : "NO"}
              </b>{" "}
              {formatUsdc(activity.amount)} USDC on {shortQuestion(activity.question)}
              {activity.timestamp > 0 ? ` - ${timeAgo(activity.timestamp, currentTime)}` : ""}
            </span>
          ))}
          {activities.length === 0 && (
            <span className="ticker-item">
              Recent trades will appear here once players stake YES or NO on AuraPredict markets.
            </span>
          )}
        </div>
      </section>

      {view === "markets" && (
        <section className="hero-band">
          <div className="hero-copy">
            <p className="network-kicker">Arc Testnet prediction markets</p>
            <h1>Trade the future with native USDC.</h1>
            <p>
              A Polymarket-style testnet venue for fast YES/NO markets on Arc.
              Market creators are the resolvers, and every stake settles onchain.
            </p>
            <div className="hero-actions">
              <button onClick={account ? undefined : openWalletModal} disabled={connecting}>
                {account ? "Wallet Connected" : connecting ? "Connecting..." : "Connect Wallet"}
              </button>
              <button className="button-link" onClick={openCreateMarket}>
                Launch Market
              </button>
            </div>
          </div>
          <aside className="hero-card">
            <div className="orbital-logo">
              <img src="/aurapredict-logo.png" alt="AuraPredict logo" />
            </div>
            <div className="hero-stats">
              <div>
                <span>Markets</span>
                <strong>{markets.length}</strong>
              </div>
              <div>
                <span>Live</span>
                <strong>{liveMarkets}</strong>
              </div>
              <div>
                <span>Liquidity</span>
                <strong>{formatUsdc(totalLiquidity)} USDC</strong>
              </div>
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
                <p>Updates every 1 hour while this app is open. Last refresh: {lastRefreshText}.</p>
              )}
            </div>
            <div className="board-actions">
              {view === "collection" || view === "market" ? (
                <>
                  <button className="secondary" onClick={backToMarkets} type="button">
                    Back to markets
                  </button>
                  <button className="secondary" onClick={loadMarkets} disabled={loading || !hasContract}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                </>
              ) : (
                <>
                  <button className="secondary" onClick={loadMarkets} disabled={loading || !hasContract}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                  <button onClick={openCreateMarket}>Create Market</button>
                </>
              )}
            </div>
          </div>

          {view !== "leaderboard" && view !== "profile" && view !== "market" && (
            <div className="category-row">
              {CATEGORIES.map((category) => (
                <button
                  className={`${activeCategory === category ? "category-pill active" : "category-pill"} ${
                    categoryMeta(category).className
                  }`}
                  key={category}
                  onClick={() => setActiveCategory(category)}
                >
                  <CategoryIcon category={category} />
                  {category}
                </button>
              ))}
            </div>
          )}

          {view === "market" ? (
            renderMarketDetail()
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
                          : "section-dot"
                    }
                  />
                  <h3>{collectionTitle}</h3>
                </div>
                <div className="section-actions">
                  <span>{collectionMarkets.length} markets</span>
                  <button className="see-all-button" onClick={backToMarkets} type="button">
                    Back
                  </button>
                </div>
              </div>
              {renderMarketCards(
                collectionMarkets,
                `No ${collectionTitle.toLowerCase()}`,
                "Markets matching this section and category will appear here."
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
                        placeholder={account ? "Set username" : "Connect wallet"}
                        value={profileNameInput}
                        onChange={(event) => setProfileNameInput(event.target.value)}
                        disabled={!account}
                      />
                      <button type="submit" disabled={!account}>
                        Save
                      </button>
                    </form>
                    <h2>{profileDisplayName}</h2>
                    <div className="profile-id-row">
                      <span>{account ? shortAddress(account) : "No wallet connected"}</span>
                      <span>Joined {profileJoinedLabel}</span>
                    </div>
                    <div className="profile-chip-row">
                      <span>Arc Testnet</span>
                      <span>{createdMarkets} created</span>
                      <span>{participatedProfileMarkets.length} participated</span>
                    </div>
                  </div>
                </div>
                <div className="profile-actions">
                  <button className="profile-public" type="button">
                    <span className="profile-public-dot" />
                    Public
                    <span className="profile-toggle" />
                  </button>
                  <button className="secondary" type="button" onClick={copyProfileLink}>
                    Share profile
                  </button>
                </div>
              </section>

              <section className="profile-stat-grid">
                <article className="profile-stat-card">
                  <span>Your edge</span>
                  <strong className={profilePnl >= 0n ? "profile-positive" : "profile-negative"}>
                    {formatSignedUsdc(profilePnl)} USDC
                  </strong>
                  <small>{profileEdgePercent.toFixed(1)}% realized return</small>
                </article>
                <article className="profile-stat-card">
                  <span>Markets resolved</span>
                  <strong>{profileResolvedCount}</strong>
                  <small>
                    {profileWonCount} wins / {profileResolvedCount} settled
                  </small>
                </article>
                <article className="profile-stat-card">
                  <span>Win streak</span>
                  <strong>{profileWinStreak}</strong>
                  <small>wins in a row</small>
                </article>
                <article className="profile-stat-card">
                  <span>Aura points</span>
                  <strong>{profileAuraScore.toLocaleString("en-US")}</strong>
                  <small>{profileWinRate.toFixed(1)}% win rate</small>
                </article>
              </section>

              <section className="profile-edge-card">
                <div className="profile-section-title">
                  <div>
                    <h3>What's your edge?</h3>
                    <span>
                      Realized PNL from settled markets. Current payout available: {formatUsdc(claimable)} USDC.
                    </span>
                  </div>
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
                  <span className="won">You won</span>
                  <span className="lost">You lost</span>
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
                  <strong>{formatUsdc(profileLeaderboardRow?.volume ?? profileStake)} USDC</strong>
                  <small>all active wallet positions</small>
                </article>
                <article>
                  <span>Win rate</span>
                  <strong>{profileWinRate.toFixed(1)}%</strong>
                  <small>{profileWonCount} winning markets</small>
                </article>
                <article>
                  <span>PNL</span>
                  <strong className={profilePnl >= 0n ? "profile-positive" : "profile-negative"}>
                    {formatSignedUsdc(profilePnl)} USDC
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
                    <span>{participatedProfileMarkets.length} markets</span>
                  </div>
                )}
                {participatedProfileMarkets.map((market) => {
                  const canUseDisputeFlow = contractVersion !== "legacy";
                  const canPropose =
                    canUseDisputeFlow &&
                    account &&
                    market.outcome === Outcome.Unresolved &&
                    market.proposedAt === 0 &&
                    Date.now() / 1000 >= market.closeTime &&
                    [market.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());
                  const canFinalize =
                    canUseDisputeFlow &&
                    market.outcome === Outcome.Unresolved &&
                    market.proposedAt > 0 &&
                    !market.disputed &&
                    Date.now() / 1000 >= market.disputeDeadline;
                  const canFinalizeDispute =
                    canUseDisputeFlow &&
                    account &&
                    owner &&
                    market.outcome === Outcome.Unresolved &&
                    market.disputed &&
                    sameAddress(account, owner);
                  const canLegacyResolve =
                    contractVersion === "legacy" &&
                    account &&
                    market.outcome === Outcome.Unresolved &&
                    Date.now() / 1000 >= market.closeTime &&
                    [market.resolver.toLowerCase(), owner.toLowerCase()].includes(account.toLowerCase());
                  const meta = categoryMeta(market.category || "Other");

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
                          <strong>{formatUsdc(market.yesPosition)} USDC</strong>
                        </div>
                        <div>
                          <span>NO</span>
                          <strong>{formatUsdc(market.noPosition)} USDC</strong>
                        </div>
                        <div>
                          <span>Status</span>
                          <strong>{marketStatus(market)}</strong>
                        </div>
                        <div>
                          <span>Countdown</span>
                          <strong>{countdownText(market.closeTime, currentTime)}</strong>
                        </div>
                        <div>
                          <span>Payout</span>
                          <strong>{formatUsdc(market.potentialPayout)} USDC</strong>
                        </div>
                      </div>
                      {(canPropose ||
                        canLegacyResolve ||
                        canFinalize ||
                        canFinalizeDispute ||
                        (market.potentialPayout > 0n && !market.claimed)) && (
                        <div className="settlement-row">
                          {canLegacyResolve && (
                            <>
                              <button className="secondary" onClick={() => resolveMarket(market.id, Outcome.Yes)}>
                                Resolve YES
                              </button>
                              <button className="secondary" onClick={() => resolveMarket(market.id, Outcome.No)}>
                                Resolve NO
                              </button>
                              <button className="secondary" onClick={() => cancelMarket(market.id)}>
                                Cancel
                              </button>
                            </>
                          )}
                          {canPropose && (
                            <>
                              <button className="secondary" onClick={() => resolveMarket(market.id, Outcome.Yes)}>
                                Propose YES
                              </button>
                              <button className="secondary" onClick={() => resolveMarket(market.id, Outcome.No)}>
                                Propose NO
                              </button>
                              <button className="secondary" onClick={() => cancelMarket(market.id)}>
                                Propose Cancel
                              </button>
                            </>
                          )}
                          {canFinalize && (
                            <button className="secondary" onClick={() => finalizeMarket(market.id)}>
                              Finalize
                            </button>
                          )}
                          {canFinalizeDispute && (
                            <>
                              <button className="secondary" onClick={() => finalizeDispute(market.id, Outcome.Yes)}>
                                Final YES
                              </button>
                              <button className="secondary" onClick={() => finalizeDispute(market.id, Outcome.No)}>
                                Final NO
                              </button>
                              <button className="secondary" onClick={() => finalizeDispute(market.id, Outcome.Canceled)}>
                                Final Cancel
                              </button>
                            </>
                          )}
                          {market.potentialPayout > 0n && !market.claimed && (
                            <button onClick={() => claim(market.id)}>
                              Claim {formatUsdc(market.potentialPayout)} USDC
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
                {createdProfileMarkets.length > 0 && (
                  <>
                    <div className="profile-section-title">
                      <h3>Markets created</h3>
                      <span>{createdProfileMarkets.length} markets</span>
                    </div>
                    {renderMarketCards(
                      createdProfileMarkets,
                      "No created markets",
                      "Created markets from your wallet will appear here."
                    )}
                  </>
                )}
              </div>
            </section>
          ) : view === "leaderboard" ? (
            <section className="leaderboard-panel">
              <div className="leaderboard-controls">
                <div>
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
                <div>
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
              </div>

              <div className="leaderboard-table">
                <div className="leaderboard-row leaderboard-head">
                  <span>Rank</span>
                  <span>Wallet</span>
                  <span>Volume</span>
                  <span>Win rate</span>
                  <span>PNL</span>
                </div>
                {leaderboardRows.length === 0 && (
                  <div className="empty-state">
                    <strong>No leaderboard data yet</strong>
                    <span>Rows appear after players stake on markets.</span>
                  </div>
                )}
                {leaderboardRows.map((row, index) => (
                  <div className="leaderboard-row" key={row.address}>
                    <span>#{index + 1}</span>
                    <strong>{shortAddress(row.address)}</strong>
                    <span>{formatUsdc(row.volume)} USDC</span>
                    <span>
                      {row.winRate.toFixed(1)}% ({row.wonMarkets}/{row.resolvedMarkets})
                    </span>
                    <span className={row.pnl >= 0n ? "pnl-positive" : "pnl-negative"}>
                      {formatSignedUsdc(row.pnl)} USDC
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : view === "ended" ? (
            <section className="market-section">
              <div className="market-section-header">
                <div className="market-section-title">
                  <span className="section-dot closing" />
                  <h3>Resolved and canceled</h3>
                </div>
                <span>{filteredEndedMarkets.length} markets</span>
              </div>
              {renderMarketCards(
                filteredEndedMarkets,
                "No ended markets",
                "Resolved and canceled markets will appear here after the creator reports a result."
              )}
            </section>
          ) : (
            <section className="market-sections">
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
                    {allFreshMarkets.length > SECTION_LIMIT && (
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
                    {allHottestMarkets.length > SECTION_LIMIT && (
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
                    {allClosingSoonMarkets.length > SECTION_LIMIT && (
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
              <span>Min stake</span>
              <strong>{formatUsdc(minStake)} USDC</strong>
            </div>
            <div>
              <span>Creator bond</span>
              <strong>{formatUsdc(creatorBond)} USDC</strong>
            </div>
            <div>
              <span>Dispute bond</span>
              <strong>{formatUsdc(disputeBond)} USDC</strong>
            </div>
            <div>
              <span>Dispute window</span>
              <strong>{Math.round(disputeWindow / 3600)} hours</strong>
            </div>
            <div>
              <span>Project fee</span>
              <strong>{(protocolFeeBps / 100).toFixed(2)}% of winnings</strong>
            </div>
            <div>
              <span>Fee balance</span>
              <strong>{formatUsdc(accumulatedProtocolFees)} USDC</strong>
            </div>
            {account && owner && sameAddress(account, owner) && accumulatedProtocolFees > 0n && (
              <button onClick={withdrawFees}>Withdraw fees</button>
            )}
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
              Question
              <textarea
                value={createForm.question}
                onChange={(event) => setCreateForm({ ...createForm, question: event.target.value })}
                placeholder="Will Arc Testnet pass 1M transactions this week?"
                rows={4}
              />
            </label>
            <div className="modal-form-grid">
              <label>
                Category
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
              </label>
              <label>
                Close time (UTC)
                <input
                  type="datetime-local"
                  min={minimumCloseInput}
                  value={createForm.closeTime}
                  onChange={(event) => setCreateForm({ ...createForm, closeTime: event.target.value })}
                />
              </label>
            </div>
            <div className="resolver-note">
              Resolver is locked to the creator wallet: {account ? shortAddress(account) : "connect wallet first"}.
              Market close time is saved in UTC and must be at least 5 minutes after the current UTC time.
              {contractVersion === "legacy"
                ? " This legacy contract does not use creator bonds or dispute windows."
                : ` Creating a market locks a ${formatUsdc(creatorBond)} USDC creator bond until the result is finalized.`}
            </div>
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </button>
              <button disabled={!account || !hasContract || transactionPending} type="submit">
                {transactionPending ? "Waiting Wallet..." : "Launch Market"}
              </button>
            </div>
          </form>
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
              <button className="wallet-option" onClick={handleConnectWallet} disabled={connecting}>
                <span className="wallet-badge">W</span>
                <strong>Browser Wallet</strong>
                <small>{window.ethereum ? "Detected" : "Not detected"}</small>
              </button>
              <span className="wallet-group-label">Recommended</span>
              {["MetaMask", "Rabby Wallet", "OKX Wallet", "Rainbow"].map((wallet) => (
                <button className="wallet-option" key={wallet} onClick={handleConnectWallet} disabled={connecting}>
                  <span className="wallet-badge">{wallet.slice(0, 1)}</span>
                  <strong>{wallet}</strong>
                  <small>{window.ethereum ? "Use injected provider" : "Install first"}</small>
                </button>
              ))}
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
                  <p>Use it to sign transactions, stake USDC, and claim payouts on Arc Testnet.</p>
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
            <strong>AuraPredict</strong>
            <p>Prediction markets built for Arc Testnet and native USDC settlement.</p>
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
