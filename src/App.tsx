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
import { Buffer } from "buffer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARC_CHAIN_ID_DECIMAL,
  ARC_RPC_URL,
  arcTestnet,
  arcTestnetParams
} from "./arc";
import { arcPredictionMarketV3Abi, arcPredictionMarketV4Abi, settlementTokenAbi } from "./contracts/arcPredictionMarketAbi";
import { arcPredictionMarketV2Abi as arcPredictionMarketAbi } from "./contracts/arcPredictionMarketV2Abi";
import { arcPredictionMarketV5Abi } from "./contracts/arcPredictionMarketV5Abi";
import { claimAllResultNotice, type ClaimAllFailure } from "./lib/claims";
import {
  Outcome,
  type EthereumProvider,
  type Eip6963ProviderDetail,
  type LifiSwapRoute,
  type StablecoinSwapDirection,
  type StablecoinSwapPair,
  type AppKitSwapQuote,
  type LifiStablecoinSwapQuote,
  type StablecoinSwapQuote,
  type SwapProviderState,
  type SwapProviderHealth,
  type UnifiedBalanceSourceChainKey,
  type UnifiedBalanceBusy,
  type UnifiedBalanceChainBalance,
  type UnifiedBalanceSummary,
  type UnifiedBalanceFeeLine,
  type UnifiedBalanceTx,
  type UnifiedBalanceWalletBalance,
  type MarketView,
  type ChainMarketSnapshot,
  type MarketContractVersion,
  type ActivityItem,
  type AppView,
  type AssistantAction,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type MarketSectionKey,
  type ThemeMode,
  type MarketViewMode,
  type ChartWindowKey,
  type MarketDetailTab,
  type MobileMarketTab,
  type MarketSortKey,
  type SortDirection,
  type NotificationType,
  type NotificationFilter,
  type LeaderboardRow,
  type UserRegistry,
  type ProjectStats,
  type AssetStats,
  type MarketComment,
  type MarketEvidence,
  type MarketReportStatus,
  type MarketReport,
  type ActiveNotificationItem,
  type EvidenceDraft,
  type CreateFormState,
  type StructuredResolutionRule,
  type MismatchConfirmState,
  type SettlementAuditStatus,
  type SettlementAudit,
  type SocialMarketResponse,
  type SocialProfileResponse,
  type SocialProfileSaveResponse,
  type SocialReportsResponse,
  type AiMarketDraft,
  type MarketRiskSeverity,
  type MarketRiskFlag,
  type ProfileHistoryFilter,
  type AiResolutionReport,
  type AiResolutionReceipt,
  type OracleProposal,
  type ResolutionReceiptResponse,
  type OracleProposalResponse,
  type AiMarketInsight,
  type PublicOracleReceipt,
  type OracleReputation,
  type PublicOracleReceiptResponse,
  type AiMarketInsightResponse,
  type OracleReputationResponse,
  type AuraBreakdown,
  type IndexedMarket,
  type IndexedActivity,
  type IndexedAssetStats,
  type IndexedProjectStats,
  type IndexedSnapshot,
  type LandingHealth,
  type ContractEventRow,
  type CachedMarketView
} from "./types";
import {
  SWAP_TOLERANCE_OPTIONS,
  DEFAULT_SWAP_TOLERANCE_BPS,
  SWAP_QUOTE_MAX_AGE_MS,
  UNIFIED_BALANCE_SOURCE_CHAINS,
  UNIFIED_BALANCE_WALLET_CHAINS,
  LIFI_QUOTE_ENDPOINT,
  LIFI_PROBE_AMOUNTS,
  AURA_RULE_JSON_PREFIX,
  ACTIVE_V3_CONTRACT_ADDRESS,
  ACTIVE_V3_DEPLOYMENT_BLOCK,
  ACTIVE_V5_CONTRACT_ADDRESS,
  ACTIVE_V5_DEPLOYMENT_BLOCK,
  ACTIVE_V3_EURC_TOKEN_ADDRESS,
  PRIMARY_CONTRACT_ADDRESS,
  PRIMARY_DEPLOYMENT_BLOCK,
  REQUESTED_DEPLOYMENT,
  VIEWING_V3_ARCHIVE,
  CONTRACT_ADDRESS,
  EURC_TOKEN_ADDRESS,
  V3_STABLECOIN_DECIMALS,
  ZERO_ADDRESS,
  ZERO_HASH,
  CATEGORIES,
  SECTION_LIMIT,
  COLLECTION_PAGE_SIZE,
  PROFILE_PAGE_SIZE,
  LEADERBOARD_LIMIT,
  MARKET_INITIAL_LOAD,
  MARKET_LOAD_STEP,
  MARKET_LOAD_CONCURRENCY,
  EVENT_LOAD_CONCURRENCY,
  RPC_RETRY_ATTEMPTS,
  RPC_RETRY_DELAY_MS,
  RPC_CALL_STAGGER_MS,
  CHART_LEFT,
  CHART_RIGHT,
  CHART_TOP,
  CHART_BOTTOM,
  CHART_HEIGHT,
  WALLET_CONNECTED_KEY,
  WALLET_DISCONNECTED_KEY,
  WALLETCONNECT_PROJECT_ID,
  CIRCLE_APP_KIT_KEY,
  DISMISSED_RESULT_KEY,
  THEME_KEY,
  PROFILE_NAMES_KEY,
  PROFILE_JOINED_KEY,
  PROFILE_PUBLIC_KEY,
  USER_REGISTRY_KEY,
  MARKET_CACHE_KEY,
  FOLLOWED_CREATORS_KEY,
  MARKET_COMMENTS_KEY,
  MARKET_EVIDENCE_KEY,
  MARKET_REPORTS_KEY,
  LOCAL_CLAIMED_MARKETS_KEY,
  AI_RESOLUTION_RECEIPTS_KEY,
  ONBOARDING_DISMISSED_KEY,
  MARKET_QUERY_KEY,
  PROFILE_QUERY_KEY,
  PROFILE_NAME_QUERY_KEY,
  LANDING_HOSTS,
  APP_URL,
  DOCS_URL,
  ARC_FAUCET_URL,
  ARC_UNIFIED_BALANCE_URL,
  X_URL,
  DISCORD_URL,
  DEMO_VIDEO_URL,
  DEMO_EMBED_URL,
  CURRENT_APP_URL,
  WALLET_DEEP_LINKS,
  INDEXER_URL,
  EVENT_START_BLOCK,
  EVENT_LOG_CHUNK_SIZE,
  CATEGORY_META,
  CATEGORY_SET,
  MARKET_IMAGE_CATEGORIES,
  MARKET_IMAGE_COUNT,
  LEADERBOARD_PERIODS,
  LEADERBOARD_METRICS,
  REPUTATION_TIERS,
  CHART_WINDOWS,
  MARKET_SORT_OPTIONS,
  ARC_CHAIN_ID_NUMBER,
  ARC_EXPLORER_URL,
  ARC_NATIVE_USDC_DECIMALS,
  ARC_RPC_URLS
} from "./constants";
import { FundOnArcActions } from "./components/FundOnArcActions";
import {
  CategoryIcon,
  ThemeIcon,
  CheckIcon,
  GridViewIcon,
  ListViewIcon,
  MobileMarketTabIcon,
  MobileNavIcon
} from "./components/icons";
import { LandingPage } from "./components/LandingPage";
import { AppUpdateNotice } from "./components/AppUpdateNotice";
import { AuraAssistant, type AssistantMarketContext } from "./components/AuraAssistant";
import { AuraFloatingChat } from "./components/AuraFloatingChat";
import type { AuraUserStats } from "./hooks/useAuraChat";
import {
  indexedMarketToView,
  normalizeCategory,
  indexedStatsToProjectStats,
  indexedActivityToItem,
  mergeMarketState,
  mergeMarketRows
} from "./lib/marketTransform";
import {
  fetchIndexerJson,
  postIndexerJson,
  postIndexerJsonWithStatus,
  loadIndexedSnapshot
} from "./lib/indexerClient";
import {
  formatUsdc,
  formatStatUsdc,
  formatSignedUsdc,
  formatUsdcInput,
  parseUsdcInput,
  shortAddress,
  compactAccountLabel,
  shortHash,
  transactionUrl,
  maybeTransactionUrl
} from "./lib/format";
import {
  marketVolume,
  marketDecimals,
  marketSymbol,
  formatMarketAmount,
  assetStatsFromMarkets,
  fallbackAssetStatsFromProject,
  formatAssetSummary
} from "./lib/marketStats";
import { timeAgo } from "./lib/timeUtils";
import {
  getInjectedProvider,
  getPublicClient,
  getWalletClient,
  getWalletConnectProvider
} from "./lib/rpcClient";
import {
  errorMessage,
  walletConnectionErrorMessage,
  isRateLimitError,
  isTransientRpcError,
  compactErrorMessage,
  sleep,
  withRpcRetry,
  isUnknownChainError,
  isDuplicateRpcNetworkError
} from "./lib/errorUtils";
import {
  readJsonStorage,
  claimedMarketKey,
  readCachedMarkets,
  writeCachedMarkets
} from "./lib/storage";
import { useWalletProviders } from "./hooks/useWalletProviders";
import { useCurrentTime } from "./hooks/useCurrentTime";
import { useTheme } from "./hooks/useTheme";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { useLocalStoragePersist } from "./hooks/useLocalStoragePersist";
import {
  chartTimeLabel,
  chartAxisLabel,
  clampChartValue,
  formatChartPercent,
  smoothPathFromPoints
} from "./lib/chartUtils";
import { updateMarketRoute, updateProfileRoute } from "./lib/routeUtils";
import {
  normalizeReferenceUrl,
  isValidHttpUrl,
  stripRuleMetadata,
  structuredRuleFromText,
  yesConditionText,
  parseComparatorTarget,
  inferRuleKindAndAsset,
  buildStructuredResolutionRule,
  resolutionRuleForContract,
  parseUtcDateTime,
  parseUtcDateTimeParts,
  combineUtcDateTimeParts,
  inferKnownEventDeadlineFromText,
  isSportsTournamentWinnerQuestion,
  parseAuraUtcCloseTimeFromText,
  parseResolutionReferenceTime,
  utcDateTimeInputValue,
  utcInputFromUnixSeconds,
  utcInputFromNow,
  utcInputIsWeekend,
  parseUtcInputToUnixSeconds,
  hostFromSource,
  isStockMarketContext,
  isSportsMarketContext,
  sourceConfidenceFlag,
  dedupeRiskFlags,
  parseNumericText,
  marketRiskFlagsForInput,
  defaultSourceByContext,
  marketQualitySnapshot,
  NUMERIC_ORACLE_ADAPTERS
} from "./lib/resolutionUtils";
import {
  V5_MARKET_STATE,
  V5_NO_OUTCOME,
  V5_BINARY_OUTCOME_LABELS_HASH,
  legacyOutcomeToV5,
  v5OutcomeToLegacy,
  v5StateToOutcome,
  hasUserPosition,
  settlementForPosition,
  userSettlement,
  personalMarketResult,
  claimStatusFor,
  auraPointsFor,
  auraBreakdownFor,
  reputationTierFor,
  reputationBadgesFor,
  marketStatus,
  resolveActionHint,
  hasNoLiquidity,
  requiresCancelForLiquidity,
  finalizeWaitingHint,
  aiOutcomeFromText,
  aiDecisionText,
  aiOutcomeFromReceipt,
  oracleOutcomeFromProposal,
  compareNumericValue,
  oracleSafetyIssueFor,
  urlHostLabel
} from "./lib/settlementUtils";
import { mapWithConcurrency } from "./lib/asyncUtils";
import { normalizeProfileUsername } from "./lib/profileUtils";
import { stablecoinMarketAbi } from "./lib/contractUtils";
import { useWalletState } from "./hooks/useWalletState";
import { useAppKitBridge } from "./hooks/useAppKitBridge";
import { appKitModal } from "./lib/walletkit";
import {
  stablecoinSwapPairKey,
  formatSwapTolerance,
  providerHealthLabel,
  lifiRouteDiagnostic,
  swapQuoteEstimatedAmount,
  swapQuoteMinimumAmount,
  swapQuoteGasCost,
  swapQuoteProviderLabel,
  estimateArcAppKitSwap,
  executeArcAppKitSwap,
  unifiedBalanceChainLabel,
  formatUnifiedBalanceDecimal,
  hasUnifiedBalanceValue,
  normalizeUnifiedBalanceAmount,
  unifiedBalanceGatewayAmount,
  addUnifiedBalanceDecimals,
  flattenUnifiedBalanceSummary,
  flattenUnifiedBalanceFees,
  unifiedBalanceTxFromResult,
  createUnifiedBalanceSpendParams,
  createUnifiedBalanceRuntime,
  readUnifiedBalanceWalletBalances
} from "./lib/swapUtils";
import {
  resolutionTimeFor,
  percent,
  compareBigint,
  betEstimate,
  outcomeLabel,
  closeDate,
  isoDateLabel,
  closeDateLocal,
  countdownText,
  isStablecoinContractVersion,
  categoryMeta,
  marketImageFor,
  marketImageVariant,
  shortQuestion,
  sameAddress,
  durationText
} from "./lib/marketUtils";

const browserGlobal = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (!browserGlobal.Buffer) {
  browserGlobal.Buffer = Buffer;
}





export default function App() {
  const isLandingHost = typeof window !== "undefined" && LANDING_HOSTS.has(window.location.hostname.toLowerCase());

  if (isLandingHost) {
    return <LandingPage />;
  }

  const transactionLockRef = useRef(false);
  const silentLoadRef = useRef(false);
  const loadMarketsInFlightRef = useRef(false);
  const loadMarketsQueuedRef = useRef(false);
  const lastPositionAccountKeyRef = useRef("");
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const walletMenuRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
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
  const [markets, setMarkets] = useState<MarketView[]>(() => readCachedMarkets());
  const [ownerDraftMarkets, setOwnerDraftMarkets] = useState<MarketView[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [knownMarketCount, setKnownMarketCount] = useState(() => readCachedMarkets().length);
  const [dataSource, setDataSource] = useState<"cache" | "indexer" | "rpc">("cache");
  const [marketLoadLimit, setMarketLoadLimit] = useState(MARKET_INITIAL_LOAD);
  const [loading, setLoading] = useState(false);
  const { walletProviders } = useWalletProviders();
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [emailLoginOpen, setEmailLoginOpen] = useState(false);
  const [emailLoginInput, setEmailLoginInput] = useState("");
  const currentTime = useCurrentTime();
  const [marketReloadToken, setMarketReloadToken] = useState(0);
  const [lastDataRefresh, setLastDataRefresh] = useState<Date | null>(null);
  const [notice, setNoticeText] = useState("");
  const {
    account,
    setAccount,
    selectedWalletProvider,
    setSelectedWalletProvider,
    connecting,
    setConnecting,
    isArcNetwork,
    setIsArcNetwork,
    switchingNetwork,
    walletBalance,
    walletTokenBalances,
    pendingWithdrawalsByToken,
    walletMenuOpen,
    setWalletMenuOpen,
    walletModalOpen,
    setWalletModalOpen,
    authMoreOpen,
    setAuthMoreOpen,
    setPendingWithdrawalsByToken,
    switchToArc,
    refreshNetworkState,
    refreshWalletBalance,
    ensureArcNetwork,
    connectWallet,
    handleConnectWallet,
    handleWalletConnect,
    connectCircleWallet,
    disconnectWallet
  } = useWalletState({
    contractVersion,
    defaultSettlementToken,
    defaultSettlementDecimals,
    contractAddress: CONTRACT_ADDRESS as Address,
    markets,
    setNotice: setNoticeText
  });

  const { isReconnecting } = useAppKitBridge({ account, connectWallet, disconnectWallet });
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
  const [unifiedBalanceModalOpen, setUnifiedBalanceModalOpen] = useState(false);
  const [unifiedBalanceSourceChain, setUnifiedBalanceSourceChain] = useState<UnifiedBalanceSourceChainKey>("Base_Sepolia");
  const [unifiedBalanceAmount, setUnifiedBalanceAmount] = useState("");
  const [unifiedBalanceBusy, setUnifiedBalanceBusy] = useState<UnifiedBalanceBusy>("idle");
  const [unifiedBalanceSummary, setUnifiedBalanceSummary] = useState<UnifiedBalanceSummary | null>(null);
  const [unifiedBalanceWalletBalances, setUnifiedBalanceWalletBalances] = useState<UnifiedBalanceWalletBalance[]>([]);
  const [unifiedBalanceFees, setUnifiedBalanceFees] = useState<UnifiedBalanceFeeLine[]>([]);
  const [unifiedBalanceLastTx, setUnifiedBalanceLastTx] = useState<UnifiedBalanceTx | null>(null);
  const [unifiedBalanceLog, setUnifiedBalanceLog] = useState<string[]>([]);
  const [profileSwapDirection, setProfileSwapDirection] = useState<StablecoinSwapDirection>("USDC_TO_EURC");
  const [activeCategory, setActiveCategory] = useState("All");
  const [marketViewMode, setMarketViewMode] = useState<MarketViewMode>("grid");
  const [detailChartWindow, setDetailChartWindow] = useState<ChartWindowKey>("all");
  const [marketDetailTab, setMarketDetailTab] = useState<MarketDetailTab>("overview");
  const [mobileMarketTab, setMobileMarketTab] = useState<MobileMarketTab>("overview");
  const [chartHoverRatio, setChartHoverRatio] = useState<number | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [indexerHealth, setIndexerHealth] = useState<LandingHealth | null>(null);
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
  const [collectionParticipationFilter, setCollectionParticipationFilter] = useState({
    participated: false,
    notParticipated: false
  });
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all");
  const [claimRetryMarketIds, setClaimRetryMarketIds] = useState<number[]>([]);
  const [collectionPage, setCollectionPage] = useState(1);
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [selectedProfileAddress, setSelectedProfileAddress] = useState("");
  const [profileHistoryPage, setProfileHistoryPage] = useState(1);
  const [profileHistoryFilter, setProfileHistoryFilter] = useState<ProfileHistoryFilter>("all");
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
  const [marketReports, setMarketReports] = useState<Record<string, MarketReport[]>>(() =>
    readJsonStorage(MARKET_REPORTS_KEY, {})
  );
  const [locallyClaimedMarkets, setLocallyClaimedMarkets] = useState<string[]>(() =>
    readJsonStorage(LOCAL_CLAIMED_MARKETS_KEY, [])
  );
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<number, EvidenceDraft>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<number, { reason: string; url: string }>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [rejectMarketModal, setRejectMarketModal] = useState<{ marketId: number; isDraft: boolean } | null>(null);
  const [rejectMarketReason, setRejectMarketReason] = useState("");
  const [aiMarketDraft, setAiMarketDraft] = useState<AiMarketDraft | null>(null);
  const [auraCreateStatus, setAuraCreateStatus] = useState<"idle" | "ready" | "failed">("idle");
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [aiResolutionReports, setAiResolutionReports] = useState<Record<number, AiResolutionReport>>({});
  const [aiResolutionReceipts, setAiResolutionReceipts] = useState<Record<string, AiResolutionReceipt | null>>(() => {
    try { return JSON.parse(window.localStorage.getItem(AI_RESOLUTION_RECEIPTS_KEY) || "{}"); } catch { return {}; }
  });
  const [oracleProposals, setOracleProposals] = useState<Record<string, OracleProposal | null>>({});
  const [aiMarketInsights, setAiMarketInsights] = useState<Record<string, AiMarketInsight | null>>({});
  const [publicOracleReceipts, setPublicOracleReceipts] = useState<Record<string, PublicOracleReceipt | null>>({});
  const [oracleReputation, setOracleReputation] = useState<OracleReputation | null>(null);
  const [oracleBusyByMarket, setOracleBusyByMarket] = useState<Record<number, boolean>>({});
  const [auraResolutionStatusByMarket, setAuraResolutionStatusByMarket] = useState<Record<number, "idle" | "ready" | "failed">>({});
  const [mismatchConfirm, setMismatchConfirm] = useState<MismatchConfirmState | null>(null);
  const modalOpen = createModalOpen || unifiedBalanceModalOpen || walletModalOpen || Boolean(mismatchConfirm);
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
  const { theme, setTheme } = useTheme();
  const [dismissedResultNotices, setDismissedResultNotices] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(DISMISSED_RESULT_KEY) || "[]") as string[];
    } catch {
      return [];
    }
  });
  const [localQuestionDraft, setLocalQuestionDraft] = useState("");
  const [createForm, setCreateForm] = useState<CreateFormState>({
    question: "",
    category: "Crypto",
    closeTime: "",
    resolutionTime: "",
    settlementToken: "",
    resolutionMode: "2",
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
    (market) => !market.isDraft && market.outcome === Outcome.Unresolved && market.closeTime > nowSeconds
  );
  const pendingResolutionMarkets = markets.filter(
    (market) => !market.isDraft && market.outcome === Outcome.Unresolved && resolutionUnlockTime(market) <= nowSeconds
  );
  const marketRiskFlagsFor = useCallback(
    (market: MarketView) =>
      marketRiskFlagsForInput({
        question: market.question,
        category: market.category,
        resolutionSource: market.metadataURI,
        resolutionRule: stripRuleMetadata(market.resolutionRule || ""),
        closeTime: utcInputFromUnixSeconds(market.closeTime),
        resolutionTime: utcInputFromUnixSeconds(resolutionUnlockTime(market)),
        openReports: (marketReports[String(market.id)] || []).filter((report) => report.status === "open").length,
        authorityReviewRequired: Boolean(market.authorityReviewRequired),
        disputed: market.disputed,
        proposedAt: market.proposedAt,
        outcome: market.outcome,
        nowSeconds
      }),
    [marketReports, nowSeconds, resolutionUnlockTime]
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
  useEffect(() => {
    if (lastPositionAccountKeyRef.current === accountKey) return;
    lastPositionAccountKeyRef.current = accountKey;
    setClaimRetryMarketIds([]);
    setMarkets((current) =>
      current.map((market) =>
        market.yesPosition === 0n && market.noPosition === 0n && !market.claimed && market.potentialPayout === 0n
          ? market
          : { ...market, yesPosition: 0n, noPosition: 0n, claimed: false, potentialPayout: 0n }
      )
    );
  }, [accountKey]);
  const viewedProfileAddress =
    selectedProfileAddress && isAddress(selectedProfileAddress) ? selectedProfileAddress : account;
  const viewedProfileKey = viewedProfileAddress ? viewedProfileAddress.toLowerCase() : "";
  const isOwnProfile = !!account && !!viewedProfileAddress && sameAddress(account, viewedProfileAddress);
  const isProfilePublic = viewedProfileKey ? profilePublicByAddress[viewedProfileKey] !== false : true;
  const buildActivityPositionsForWallet = useCallback((walletKey: string) => {
    const positions = new Map<number, { yes: bigint; no: bigint }>();
    if (!walletKey) return positions;

    for (const activity of activities) {
      if (!sameAddress(activity.user, walletKey)) continue;
      const current = positions.get(activity.marketId) ?? { yes: 0n, no: 0n };
      if (activity.side === Outcome.Yes) current.yes += activity.amount;
      if (activity.side === Outcome.No) current.no += activity.amount;
      positions.set(activity.marketId, current);
    }

    return positions;
  }, [activities]);
  const profileActivityPositions = useMemo(
    () => buildActivityPositionsForWallet(viewedProfileKey),
    [buildActivityPositionsForWallet, viewedProfileKey]
  );
  const accountActivityPositions = useMemo(
    () => buildActivityPositionsForWallet(accountKey),
    [accountKey, buildActivityPositionsForWallet]
  );
  const marketWithWalletPosition = useCallback(
    (
      market: MarketView,
      activityPositions: Map<number, { yes: bigint; no: bigint }>,
      walletKey: string,
      useHydratedWalletState: boolean
    ) => {
      const activityPosition = activityPositions.get(market.id) ?? { yes: 0n, no: 0n };
      const hasHydratedPosition = market.yesPosition > 0n || market.noPosition > 0n || market.claimed;
      const locallyClaimed = walletKey ? locallyClaimedMarkets.includes(claimedMarketKey(walletKey, market.id)) : false;
      const effectiveClaimed = useHydratedWalletState ? market.claimed || locallyClaimed : locallyClaimed;
      const yesPosition = useHydratedWalletState && hasHydratedPosition ? market.yesPosition : activityPosition.yes;
      const noPosition = useHydratedWalletState && hasHydratedPosition ? market.noPosition : activityPosition.no;
      const hasPosition = yesPosition > 0n || noPosition > 0n;
      const settlement = settlementForPosition(market, protocolFeeBps, yesPosition, noPosition);
      const potentialPayout =
        effectiveClaimed || market.outcome === Outcome.Unresolved || !hasPosition
          ? 0n
          : useHydratedWalletState && market.potentialPayout > 0n
            ? market.potentialPayout
            : settlement.payout;

      return {
        ...market,
        yesPosition,
        noPosition,
        claimed: effectiveClaimed,
        potentialPayout
      };
    },
    [locallyClaimedMarkets, protocolFeeBps]
  );
  const profileMarkets = viewedProfileAddress
    ? markets
        .map((market) => marketWithWalletPosition(market, profileActivityPositions, viewedProfileKey, isOwnProfile))
        .filter((market) => hasUserPosition(market) || sameAddress(market.creator, viewedProfileAddress))
    : [];
  const accountPositionMarkets = account
    ? markets
        .map((market) => marketWithWalletPosition(market, accountActivityPositions, accountKey, true))
        .filter(hasUserPosition)
    : [];
  const participatedProfileMarkets = profileMarkets.filter(hasUserPosition);
  const createdProfileMarkets = viewedProfileAddress
    ? profileMarkets.filter((market) => sameAddress(market.creator, viewedProfileAddress))
    : [];
  const filteredParticipatedProfileMarkets = participatedProfileMarkets.filter((market) => {
    const settlement = userSettlement(market, market.termsProtocolFeeBps ?? protocolFeeBps);
    if (profileHistoryFilter === "live") return market.outcome === Outcome.Unresolved;
    if (profileHistoryFilter === "claimable") return isOwnProfile && market.potentialPayout > 0n && !market.claimed;
    if (profileHistoryFilter === "won") return settlement.settled && settlement.won;
    if (profileHistoryFilter === "lost") return settlement.settled && settlement.stake > 0n && !settlement.won && market.outcome !== Outcome.Canceled;
    if (profileHistoryFilter === "refund") return settlement.settled && market.outcome === Outcome.Canceled;
    return true;
  });
  const profileHistoryPageCount = Math.max(1, Math.ceil(filteredParticipatedProfileMarkets.length / PROFILE_PAGE_SIZE));
  const safeProfileHistoryPage = Math.min(profileHistoryPage, profileHistoryPageCount);
  const paginatedParticipatedProfileMarkets = filteredParticipatedProfileMarkets.slice(
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
  const creatorResolvedMarkets = createdProfileMarkets.filter((market) => market.outcome !== Outcome.Unresolved);
  const creatorCanceledMarkets = creatorResolvedMarkets.filter((market) => market.outcome === Outcome.Canceled).length;
  const creatorSettledVolume = creatorResolvedMarkets.reduce((sum, market) => sum + marketVolume(market), 0n);
  const resolverProfileMarkets = viewedProfileAddress
    ? markets.filter(
        (market) =>
          sameAddress(market.resolver, viewedProfileAddress) &&
          (market.proposedAt > 0 || market.outcome !== Outcome.Unresolved)
      )
    : [];
  const resolverFinalizedMarkets = resolverProfileMarkets.filter((market) => market.outcome !== Outcome.Unresolved).length;
  const resolverDisputedMarkets = resolverProfileMarkets.filter((market) => market.disputed || market.authorityReviewRequired).length;
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
  const participationFilteredCollectionMarkets = baseCollectionMarkets.filter((market) => {
    const { participated, notParticipated } = collectionParticipationFilter;
    if (!participated && !notParticipated) return true;
    if (participated && notParticipated) return true;
    const userParticipated = account ? hasUserPosition(market) : false;
    return participated ? userParticipated : !userParticipated;
  });
  const collectionMarkets = [...participationFilteredCollectionMarkets].sort((a, b) => {
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
  const detailChartDomain = (() => {
    if (!selectedMarket) return { start: 0, end: 60, range: 60 };

    const referenceEnd = Math.max(
      selectedMarket.createdAt || 0,
      Math.min(nowSeconds, selectedMarket.closeTime || nowSeconds)
    );
    const firstActivityTime = selectedMarketActivities[0]?.timestamp || selectedMarket.createdAt || referenceEnd;
    const marketStart = selectedMarket.createdAt || firstActivityTime || Math.max(0, referenceEnd - 60 * 60);
    const start = activeChartWindow.seconds
      ? Math.max(marketStart, referenceEnd - activeChartWindow.seconds)
      : Math.min(marketStart, firstActivityTime);
    const end = Math.max(start + 60, referenceEnd);

    return { start, end, range: Math.max(60, end - start) };
  })();
  const detailChartRows = (() => {
    if (!selectedMarket) return [];

    const { start: windowStart, end: windowEnd, range } = detailChartDomain;
    let yesPool = 0n;
    let noPool = 0n;
    const points: Array<{ timestamp: number; yesPercent: number; noPercent: number }> = [];
    const poolYesPercent = () => {
      const total = yesPool + noPool;
      return total > 0n ? percent(yesPool, total) : selectedMarketTotal > 0n ? selectedMarketYesPercent : 50;
    };
    const pushPoint = (timestamp: number) => {
      const yes = poolYesPercent();
      points.push({ timestamp, yesPercent: yes, noPercent: 100 - yes });
    };

    for (const activity of selectedMarketActivities) {
      const timestamp = activity.timestamp || selectedMarket.createdAt || windowEnd;
      if (timestamp < windowStart) {
        if (activity.side === Outcome.Yes) yesPool += activity.amount;
        if (activity.side === Outcome.No) noPool += activity.amount;
        continue;
      }
      if (timestamp > windowEnd) continue;
      if (points.length === 0) pushPoint(windowStart);
      if (activity.side === Outcome.Yes) yesPool += activity.amount;
      if (activity.side === Outcome.No) noPool += activity.amount;
      pushPoint(timestamp);
    }

    if (points.length === 0) {
      points.push(
        { timestamp: windowStart, yesPercent: poolYesPercent(), noPercent: 100 - poolYesPercent() },
        { timestamp: windowEnd, yesPercent: selectedMarketYesPercent, noPercent: selectedMarketNoPercent }
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
        timestamp: windowEnd,
        yesPercent: selectedMarketYesPercent,
        noPercent: selectedMarketNoPercent
      });
    } else if (points.length > 0 && last.timestamp < windowEnd) {
      points.push({
        timestamp: windowEnd,
        yesPercent: last.yesPercent,
        noPercent: last.noPercent
      });
    }
    if (points.length === 1) {
      points.unshift({
        timestamp: Math.max(0, windowStart),
        yesPercent: points[0].yesPercent,
        noPercent: points[0].noPercent
      });
    }

    return points.map((point) => {
      const x = CHART_LEFT + ((point.timestamp - windowStart) / range) * (CHART_RIGHT - CHART_LEFT);
      return {
        ...point,
        x,
        yesY: CHART_BOTTOM - (point.yesPercent / 100) * CHART_HEIGHT,
        noY: CHART_BOTTOM - (point.noPercent / 100) * CHART_HEIGHT
      };
    });
  })();
  const detailChartTicks = (() => {
    if (!selectedMarket) return [];
    const { start, range } = detailChartDomain;
    return Array.from({ length: 5 }, (_, index) => {
      const timestamp = Math.round(start + (range * index) / 4);
      const x = CHART_LEFT + (index / 4) * (CHART_RIGHT - CHART_LEFT);
      return { x, label: chartAxisLabel(timestamp, range) };
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
  const claimNotifications = account
    ? accountPositionMarkets.filter(
        (market) => market.outcome !== Outcome.Unresolved && !market.claimed && market.potentialPayout > 0n
      )
    : [];
  const claimableAssetSummary = useMemo(() => {
    const byAsset = new Map<string, { symbol: string; decimals: number; amount: bigint }>();
    for (const market of claimNotifications) {
      const symbol = marketSymbol(market);
      const decimals = marketDecimals(market);
      const key = (market.settlementToken && isAddress(market.settlementToken)
        ? market.settlementToken
        : `${symbol}:${decimals}`).toLowerCase();
      const current = byAsset.get(key) ?? { symbol, decimals, amount: 0n };
      current.amount += market.potentialPayout;
      byAsset.set(key, current);
    }
    return [...byAsset.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [claimNotifications]);
  const claimableTotalLabel =
    claimableAssetSummary.length > 0
      ? claimableAssetSummary.map((asset) => `${formatUsdc(asset.amount, asset.decimals)} ${asset.symbol}`).join(" + ")
      : `0.00 ${defaultSettlementSymbol}`;
  const claimRetryLabel =
    claimRetryMarketIds.length === 1
      ? "Retry failed claim"
      : `Retry ${claimRetryMarketIds.length} failed claims`;
  const proposedResultNotifications = account
    ? accountPositionMarkets.filter((market) => {
        const key = `${accountKey}:proposal:${market.id}:${market.proposedAt}:${market.proposedOutcome}`;
        return (
          hasUserPosition(market) &&
          market.outcome === Outcome.Unresolved &&
          market.proposedAt > 0 &&
          !dismissedResultNotices.includes(key)
        );
      })
    : [];
  const disputeResolvedNotifications = account
    ? accountPositionMarkets.filter((market) => {
        const key = `${accountKey}:dispute-resolved:${market.id}:${market.outcome}`;
        return (
          hasUserPosition(market) &&
          market.disputed &&
          market.outcome !== Outcome.Unresolved &&
          !dismissedResultNotices.includes(key)
        );
      })
    : [];
  const resultNotifications = account
    ? accountPositionMarkets.filter((market) => {
        const key = `${accountKey}:result:${market.id}:${market.outcome}`;
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
  const ownerReviewReasonFor = useCallback(
    (market: MarketView) => {
      if (market.disputed) {
        return `Formal dispute opened by ${displayNameForAddress(market.disputer)}. Owner/authority must choose the final outcome.`;
      }

      const receipt = aiResolutionReceipts[String(market.id)];
      const aiOutcome = aiOutcomeFromReceipt(receipt);
      if (
        market.authorityReviewRequired &&
        aiOutcome !== Outcome.Unresolved &&
        aiOutcome !== Outcome.Canceled &&
        market.proposedOutcome !== Outcome.Unresolved &&
        market.proposedOutcome !== Outcome.Canceled &&
        market.proposedOutcome !== aiOutcome
      ) {
        return `Aura suggested ${outcomeLabel(aiOutcome)}, but the resolver proposed ${outcomeLabel(market.proposedOutcome)}.`;
      }

      const receiptStatus = [receipt?.status, receipt?.proposedOutcome, receipt?.error]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (market.authorityReviewRequired && receiptStatus.includes("insufficient")) {
        return "Aura returned insufficient evidence, so the resolver proposal needs owner/authority verification.";
      }

      if (market.authorityReviewRequired && !receipt) {
        return "No saved Aura review is available for this proposal, so owner/authority verification is required.";
      }

      return "The proposal was flagged by the resolver/authority path and needs owner/authority verification before final settlement.";
    },
    [aiResolutionReceipts, displayNameForAddress]
  );
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
  const activeNotificationItems = useMemo<ActiveNotificationItem[]>(() => {
    if (!account) return [];
    const wallet = account.toLowerCase();
    const rows: ActiveNotificationItem[] = [];
    resolveNotifications.forEach((market) => {
      rows.push({
        key: `${wallet}:resolve:${market.id}:${market.closeTime}`,
        type: "resolve",
        label: "Result needed",
        title: shortQuestion(market.question),
        detail: `Closed ${closeDate(market.closeTime)}. Resolution proposal is needed.`,
        marketId: market.id
      });
    });
    finalizeNotifications.forEach((market) => {
      rows.push({
        key: `${wallet}:finalize:${market.id}:${market.proposedAt}`,
        type: "finalize",
        label: "Ready to finalize",
        title: shortQuestion(market.question),
        detail: `Proposed ${outcomeLabel(market.proposedOutcome)}. No dispute was opened.`,
        marketId: market.id
      });
    });
    ownerAiMismatchNotifications.forEach((market) => {
      rows.push({
        key: `${wallet}:owner-ai-mismatch:${market.id}:${market.proposedAt}:${market.proposedOutcome}`,
        type: "owner-review",
        label: "Owner review",
        title: shortQuestion(market.question),
        detail: ownerReviewReasonFor(market),
        marketId: market.id
      });
    });
    disputeReviewNotifications.forEach((market) => {
      rows.push({
        key: `${wallet}:review:${market.id}:${market.proposedAt}:${market.disputed ? "dispute" : "authority"}`,
        type: market.disputed ? "dispute-review" : "owner-review",
        label: market.disputed ? "Dispute review" : "Authority review",
        title: shortQuestion(market.question),
        detail: ownerReviewReasonFor(market),
        marketId: market.id
      });
    });
    staleDisputeNotifications.forEach((market) => {
      rows.push({
        key: `${wallet}:stale-review:${market.id}:${market.proposedAt}`,
        type: "stale-review",
        label: "Stale review",
        title: shortQuestion(market.question),
        detail: "Authority did not finalize after the grace period. Cancel refunds positions.",
        marketId: market.id
      });
    });
    proposedResultNotifications.forEach((market) => {
      const aiReceipt = aiResolutionReceipts[String(market.id)];
      const aiSuggestedOutcome = aiOutcomeFromReceipt(aiReceipt);
      rows.push({
        key: `${wallet}:proposal:${market.id}:${market.proposedAt}:${market.proposedOutcome}`,
        type: "proposal",
        label: "Result proposed",
        title: shortQuestion(market.question),
        detail: `Resolver proposed ${outcomeLabel(market.proposedOutcome)}${
          aiSuggestedOutcome !== Outcome.Unresolved ? `. AI suggested ${outcomeLabel(aiSuggestedOutcome)}.` : "."
        }`,
        marketId: market.id
      });
    });
    disputeResolvedNotifications.forEach((market) => {
      rows.push({
        key: `${wallet}:dispute-resolved:${market.id}:${market.outcome}`,
        type: "dispute-resolved",
        label: "Dispute resolved",
        title: shortQuestion(market.question),
        detail: `Final outcome is ${outcomeLabel(market.outcome)} after dispute review by owner/authority.`,
        marketId: market.id
      });
    });
    claimNotifications.forEach((market) => {
      rows.push({
        key: `${wallet}:claim:${market.id}:${market.outcome}:${market.potentialPayout.toString()}`,
        type: "claim",
        label: "Claim available",
        title: shortQuestion(market.question),
        detail: `${formatMarketAmount(market.potentialPayout, market)} ${marketSymbol(market)} ready.`,
        marketId: market.id
      });
    });
    resultNotifications.forEach((market) => {
      rows.push({
        key: `${wallet}:result:${market.id}:${market.outcome}`,
        type: "result",
        label: "Result posted",
        title: shortQuestion(market.question),
        detail: `${outcomeLabel(market.outcome)}. No payout is available for this position.`,
        marketId: market.id
      });
    });
    return rows;
  }, [
    account,
    aiResolutionReceipts,
    claimNotifications,
    disputeResolvedNotifications,
    disputeReviewNotifications,
    finalizeNotifications,
    ownerAiMismatchNotifications,
    ownerReviewReasonFor,
    proposedResultNotifications,
    resolveNotifications,
    resultNotifications,
    staleDisputeNotifications
  ]);
  const visibleNotificationItems =
    notificationFilter === "all"
      ? activeNotificationItems
      : activeNotificationItems.filter((item) => item.type === notificationFilter);
  const notificationFilterOptions: { value: NotificationFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "claim", label: "Claims" },
    { value: "result", label: "Results" },
    { value: "proposal", label: "Proposals" },
    { value: "resolve", label: "Resolve" },
    { value: "finalize", label: "Finalize" },
    { value: "owner-review", label: "Owner review" },
    { value: "dispute-review", label: "Disputes" },
    { value: "report", label: "Reports" },
    { value: "flag", label: "Flags" },
    { value: "stale-review", label: "Stale" },
    { value: "dispute-resolved", label: "Resolved disputes" }
  ];
  const ownerUsageMetrics = {
    totalTrades: activities.length,
    comments: Object.values(marketComments).reduce((sum, rows) => sum + rows.length, 0),
    evidence: Object.values(marketEvidence).reduce((sum, rows) => sum + rows.length, 0),
    reports: Object.values(marketReports).reduce((sum, rows) => sum + rows.filter((row) => row.status === "open").length, 0),
    publicProfiles: Object.values(profilePublicByAddress).filter((value) => value !== false).length,
    namedProfiles: Object.values(profileNames).filter((name) => name.trim()).length
  };
  const settlementAuditFor = useCallback(
    (market: MarketView): SettlementAudit => {
      if (market.outcome !== Outcome.Unresolved) {
        return {
          status: "safe",
          label: "Finalized",
          detail: `Final result is ${outcomeLabel(market.outcome)}.`,
          severity: "info",
          blocksFinalize: false
        };
      }

      const proposedOutcome = market.proposedOutcome;
      const oracleProposal = oracleProposals[String(market.id)];
      const oracleOutcome = oracleOutcomeFromProposal(oracleProposal);
      const oracleIssue = oracleSafetyIssueFor(oracleProposal, market);
      const aiReceiptOutcome = aiOutcomeFromReceipt(aiResolutionReceipts[String(market.id)]);
      const aiReportOutcome = aiOutcomeFromText(aiResolutionReports[market.id]?.suggestedOutcome);
      const aiOutcome =
        aiReceiptOutcome === Outcome.Yes || aiReceiptOutcome === Outcome.No
          ? aiReceiptOutcome
          : aiReportOutcome === Outcome.Yes || aiReportOutcome === Outcome.No
            ? aiReportOutcome
            : Outcome.Unresolved;

      if (requiresCancelForLiquidity(market) && proposedOutcome !== Outcome.Unresolved && proposedOutcome !== Outcome.Canceled) {
        return {
          status: "conflict",
          label: "Conflict detected",
          detail: "YES/NO finalization is unsafe because one side has no funded positions. Use Cancel / Refund.",
          severity: "bad",
          blocksFinalize: true
        };
      }

      if (oracleIssue) {
        const unsafeProposalIsActive =
          proposedOutcome === Outcome.Unresolved ||
          (oracleOutcome !== Outcome.Unresolved && proposedOutcome === oracleOutcome);
        return {
          status: unsafeProposalIsActive ? "conflict" : "review",
          label: unsafeProposalIsActive ? "Conflict detected" : "Needs review",
          detail: oracleIssue,
          severity: unsafeProposalIsActive ? "bad" : "warn",
          blocksFinalize: unsafeProposalIsActive
        };
      }

      if (market.disputed || market.authorityReviewRequired) {
        return {
          status: "review",
          label: "Needs review",
          detail: ownerReviewReasonFor(market),
          severity: "warn",
          blocksFinalize: false
        };
      }

      if (
        market.proposedAt > 0 &&
        aiOutcome !== Outcome.Unresolved &&
        proposedOutcome !== Outcome.Unresolved &&
        proposedOutcome !== Outcome.Canceled &&
        proposedOutcome !== aiOutcome
      ) {
        return {
          status: "review",
          label: "Needs review",
          detail: `Aura suggested ${outcomeLabel(aiOutcome)}, but resolver proposed ${outcomeLabel(proposedOutcome)}.`,
          severity: "warn",
          blocksFinalize: false
        };
      }

      const blockingRisk = marketRiskFlagsFor(market).find((flag) => flag.severity === "bad");
      if (blockingRisk) {
        return {
          status: "review",
          label: "Needs review",
          detail: `${blockingRisk.label}: ${blockingRisk.detail}`,
          severity: "warn",
          blocksFinalize: false
        };
      }

      if (market.proposedAt > 0 && market.disputeDeadline > nowSeconds) {
        return {
          status: "review",
          label: "Needs review",
          detail: `Dispute window is still open until ${closeDate(market.disputeDeadline)}.`,
          severity: "warn",
          blocksFinalize: false
        };
      }

      if (market.proposedAt > 0) {
        return {
          status: "safe",
          label: "Safe to finalize",
          detail: `No conflict detected for proposed ${outcomeLabel(proposedOutcome)}.`,
          severity: "info",
          blocksFinalize: false
        };
      }

      if (resolutionUnlockTime(market) <= nowSeconds) {
        return {
          status: "review",
          label: "Needs review",
          detail: "Resolution time has passed and no result has been proposed yet.",
          severity: "warn",
          blocksFinalize: false
        };
      }

      return {
        status: "safe",
        label: "Safe to monitor",
        detail: "Market is still before resolution time.",
        severity: "info",
        blocksFinalize: false
      };
    },
    [aiResolutionReceipts, aiResolutionReports, marketRiskFlagsFor, nowSeconds, oracleProposals, ownerReviewReasonFor, resolutionUnlockTime]
  );
  const draftMarkets = isProtocolOwner ? ownerDraftMarkets : [];
  const ownerOpenReports = Object.values(marketReports)
    .flat()
    .filter((report) => report.status === "open")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12);
  const ownerPendingProposalQueue = pendingResolutionMarkets
    .filter((market) => market.outcome === Outcome.Unresolved && market.proposedAt === 0)
    .sort((a, b) => resolutionUnlockTime(a) - resolutionUnlockTime(b))
    .slice(0, 8);
  const ownerFinalizationQueue = pendingResolutionMarkets
    .filter(
      (market) =>
        market.outcome === Outcome.Unresolved &&
        market.proposedAt > 0 &&
        !market.disputed &&
        !market.authorityReviewRequired &&
        market.disputeDeadline > 0 &&
        market.disputeDeadline <= nowSeconds
    )
    .sort((a, b) => a.disputeDeadline - b.disputeDeadline)
    .slice(0, 8);
  const ownerEscalatedReviewQueue = pendingResolutionMarkets
    .filter((market) => market.outcome === Outcome.Unresolved && (market.disputed || Boolean(market.authorityReviewRequired)))
    .sort((a, b) => (a.disputeDeadline || 0) - (b.disputeDeadline || 0))
    .slice(0, 8);
  const ownerFlaggedRiskMarkets = markets
    .map((market) => ({ market, flags: marketRiskFlagsFor(market).filter((flag) => flag.severity !== "info") }))
    .filter((row) => row.flags.length > 0 && row.market.outcome === Outcome.Unresolved)
    .sort((a, b) => {
      const badDelta = Number(b.flags.some((flag) => flag.severity === "bad")) - Number(a.flags.some((flag) => flag.severity === "bad"));
      if (badDelta !== 0) return badDelta;
      return b.market.traderCount - a.market.traderCount || b.market.id - a.market.id;
    })
    .slice(0, 8);
  const ownerSourceQualityRows = markets
    .filter((market) => market.outcome === Outcome.Unresolved)
    .map((market) => {
      const audit = settlementAuditFor(market);
      const flags = marketRiskFlagsFor(market).filter((flag) => flag.severity !== "info");
      const proposal = oracleProposals[String(market.id)];
      const receipt = aiResolutionReceipts[String(market.id)];
      const receiptEvidenceUrls = Array.isArray(receipt?.evidence)
        ? receipt.evidence.map((item) => item.url || "").filter(Boolean)
        : [];
      const sourceUrls = [
        market.metadataURI,
        market.fallbackSourceURI,
        ...(proposal?.sourceUrls || []),
        ...receiptEvidenceUrls
      ].filter(Boolean);
      const sourceRiskText = flags.map((flag) => `${flag.label} ${flag.detail}`).join(" ").toLowerCase();
      const missingSource = sourceUrls.length === 0 || sourceRiskText.includes("source weak") || sourceRiskText.includes("source verification");
      const deterministicOracle =
        Boolean(proposal) &&
        !["", "unsupported", "needs_review", "error"].includes(String(proposal?.status || "").toLowerCase()) &&
        (proposal?.outcome === "YES" || proposal?.outcome === "NO" || proposal?.outcome === "CANCEL" || Number(proposal?.outcomeValue || 0) > 0);
      const severityRank = audit.status === "conflict" ? 3 : missingSource || audit.status === "review" || flags.length > 0 ? 2 : 1;
      return {
        market,
        audit,
        flags,
        sourceCount: new Set(sourceUrls).size,
        missingSource,
        deterministicOracle,
        severityRank
      };
    });
  const ownerSourceQualitySummary = {
    safe: ownerSourceQualityRows.filter((row) => row.audit.status === "safe" && !row.missingSource && row.flags.length === 0).length,
    review: ownerSourceQualityRows.filter((row) => row.audit.status === "review" || row.missingSource || row.flags.length > 0).length,
    conflict: ownerSourceQualityRows.filter((row) => row.audit.status === "conflict").length,
    missingSource: ownerSourceQualityRows.filter((row) => row.missingSource).length,
    deterministic: ownerSourceQualityRows.filter((row) => row.deterministicOracle).length
  };
  const ownerSourceQualityQueue = ownerSourceQualityRows
    .filter((row) => row.severityRank > 1 || row.audit.status !== "safe")
    .sort((a, b) => b.severityRank - a.severityRank || b.market.traderCount - a.market.traderCount || b.market.id - a.market.id)
    .slice(0, 8);
  const ownerQueueCount =
    draftMarkets.length +
    ownerPendingProposalQueue.length +
    ownerFinalizationQueue.length +
    ownerEscalatedReviewQueue.length +
    ownerFlaggedRiskMarkets.length;
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
  const authInstalledWallets = walletOptions.slice(0, 3);
  const detectedWalletNames = new Set(walletOptions.map((wallet) => wallet.info.name.toLowerCase()));
  const authDeepLinkWallets = WALLET_DEEP_LINKS.filter(
    (wallet) => !detectedWalletNames.has(wallet.name.toLowerCase())
  ).slice(0, 2);
  const hasExtraAuthWallets =
    walletOptions.length > authInstalledWallets.length ||
    WALLET_DEEP_LINKS.length > authDeepLinkWallets.length ||
    recommendedWallets.length > 0;

  useBodyScrollLock(modalOpen);

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
  const indexerStatus = indexerHealth?.indexer;
  const indexerHasSyncError = Boolean(indexerStatus?.lastSyncError);
  const indexerLastSyncedAtMs = indexerStatus?.lastSyncedAt ? Date.parse(indexerStatus.lastSyncedAt) : NaN;
  const indexerLastSyncedAgeSeconds = Number.isFinite(indexerLastSyncedAtMs)
    ? Math.max(0, Math.floor(Date.now() / 1000) - Math.floor(indexerLastSyncedAtMs / 1000))
    : null;
  const indexerPollingIsFresh = Boolean(
    !indexerHasSyncError &&
      indexerLastSyncedAgeSeconds !== null &&
      indexerLastSyncedAgeSeconds <= Math.max(180, Number(indexerStatus?.pollMs || 60_000) / 1000 + 120)
  );
  const indexerWsDegraded = Boolean(
    indexerStatus?.wsEnabled &&
      ["error", "reconnecting"].includes(String(indexerStatus?.wsStatus || "")) &&
      !indexerHasSyncError &&
      indexerPollingIsFresh
  );
  const indexerUsingPollingFallback = Boolean(
    indexerWsDegraded &&
      (indexerStatus?.lastSyncReason === "polling" || indexerStatus?.lastSyncReason === "startup") &&
      indexerPollingIsFresh
  );
  const indexerStatusTone = indexerHasSyncError
    ? "danger"
    : indexerUsingPollingFallback
      ? "success"
      : indexerStatus?.wsEnabled && indexerStatus?.wsStatus === "connected"
        ? "success"
        : "neutral";
  const indexerModeText = indexerHasSyncError
    ? "Sync error"
    : indexerUsingPollingFallback
      ? "Polling healthy"
      : indexerStatus?.wsEnabled
        ? indexerStatus.wsStatus === "connected"
          ? "Realtime WS"
          : `WS ${indexerStatus.wsStatus || "starting"}`
        : indexerStatus?.mode || dataSource;
  const indexerStatusDetail = indexerHasSyncError
    ? indexerStatus?.lastSyncError || "Indexer sync failed. Check RPC/indexer logs."
    : indexerUsingPollingFallback
      ? "Realtime socket is reconnecting; polling sync is active."
      : indexerStatus?.wsEnabled && indexerStatus.wsStatus === "connected"
        ? "Realtime WebSocket sync is active."
        : indexerStatus?.wsLastError
          ? "WebSocket is not connected yet; polling remains available."
          : "Waiting for indexer heartbeat.";
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
              : view === "assistant"
                ? "Aura AI assistant"
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


  useLocalStoragePersist(AI_RESOLUTION_RECEIPTS_KEY, aiResolutionReceipts);
  useLocalStoragePersist(FOLLOWED_CREATORS_KEY, followedCreators);
  useLocalStoragePersist(MARKET_COMMENTS_KEY, marketComments);
  useLocalStoragePersist(MARKET_EVIDENCE_KEY, marketEvidence);
  useLocalStoragePersist(MARKET_REPORTS_KEY, marketReports);
  useLocalStoragePersist(LOCAL_CLAIMED_MARKETS_KEY, locallyClaimedMarkets.slice(-400));

  useEffect(() => {
    let canceled = false;
    fetchIndexerJson<SocialReportsResponse>("/api/social/reports").then((response) => {
      if (canceled || !response?.reports) return;
      const next: Record<string, MarketReport[]> = {};
      response.reports.forEach((report) => {
        const key = String(report.marketId);
        next[key] = [report, ...(next[key] || [])].slice(0, 40);
      });
      setMarketReports((current) => ({ ...current, ...next }));
    });
    return () => {
      canceled = true;
    };
  }, []);

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
      if (response.reports) {
        setMarketReports((current) => ({ ...current, [String(selectedMarketId)]: response.reports ?? [] }));
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
    fetchIndexerJson<AiMarketInsightResponse>(`/api/markets/${selectedMarketId}/ai-insight`).then((response) => {
      if (canceled || !response || !("insight" in response)) return;
      setAiMarketInsights((current) => ({ ...current, [String(selectedMarketId)]: response.insight ?? null }));
    });
    fetchIndexerJson<PublicOracleReceiptResponse>(`/api/oracle-receipts/${selectedMarketId}`).then((response) => {
      if (canceled || !response || !("receipt" in response)) return;
      setPublicOracleReceipts((current) => ({ ...current, [String(selectedMarketId)]: response.receipt ?? null }));
    });
    return () => {
      canceled = true;
    };
  }, [selectedMarketId]);

  useEffect(() => {
    let canceled = false;
    fetchIndexerJson<OracleReputationResponse>("/api/oracle-reputation").then((response) => {
      if (canceled || !response || !("reputation" in response)) return;
      setOracleReputation(response.reputation ?? null);
    });
    return () => {
      canceled = true;
    };
  }, []);

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
              abi: stablecoinMarketAbi(contractVersion),
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
  }, [profileHistoryFilter, viewedProfileKey]);


  const getActiveWalletClient = useCallback(
    (provider?: EthereumProvider | null) => getWalletClient(provider ?? selectedWalletProvider),
    [selectedWalletProvider]
  );

  const setNotice = useCallback((message: string, txHash?: Hash) => {
    setNoticeText(message);
    setNoticeTxHash(txHash || "");
  }, []);

  const exportProfileHistoryCsv = useCallback(() => {
    if (filteredParticipatedProfileMarkets.length === 0) {
      setNotice("No filtered profile history to export.");
      return;
    }

    const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      [
        "market_id",
        "question",
        "category",
        "side",
        "stake",
        "yes_position",
        "no_position",
        "outcome",
        "profile_result",
        "payout",
        "pnl",
        "claim_status",
        "settlement_symbol"
      ],
      ...filteredParticipatedProfileMarkets.map((market) => {
        const decimals = marketDecimals(market);
        const symbol = marketSymbol(market);
        const settlement = userSettlement(market, market.termsProtocolFeeBps ?? protocolFeeBps);
        const result = personalMarketResult(market, isOwnProfile ? "You" : "Profile");
        const side =
          market.yesPosition > 0n && market.noPosition > 0n
            ? "YES + NO"
            : market.yesPosition > 0n
              ? "YES"
              : market.noPosition > 0n
                ? "NO"
                : "None";
        return [
          market.id,
          market.question,
          market.category || "Other",
          side,
          formatUnits(settlement.stake, decimals),
          formatUnits(market.yesPosition, decimals),
          formatUnits(market.noPosition, decimals),
          outcomeLabel(market.outcome),
          result.label,
          formatUnits(settlement.settled ? settlement.payout : 0n, decimals),
          formatUnits(settlement.pnl, decimals),
          claimStatusFor(market, settlement, isOwnProfile),
          symbol
        ];
      })
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aurapredict-profile-${viewedProfileAddress ? shortAddress(viewedProfileAddress) : "wallet"}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setNotice("Profile history CSV exported.");
  }, [
    filteredParticipatedProfileMarkets,
    isOwnProfile,
    protocolFeeBps,
    setNotice,
    viewedProfileAddress
  ]);

  const addUnifiedBalanceLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
    setUnifiedBalanceLog((current) => [`${timestamp} - ${message}`, ...current].slice(0, 5));
  }, []);

  const switchToUnifiedBalanceSourceChain = useCallback(
    async (sourceChain: UnifiedBalanceSourceChainKey, provider?: EthereumProvider | null) => {
      const chain = UNIFIED_BALANCE_SOURCE_CHAINS.find((item) => item.value === sourceChain);
      if (!chain) throw new Error("Unsupported Unified Balance source chain.");
      const injected = getInjectedProvider(provider ?? selectedWalletProvider);
      const chainId = chain.chainIdHex.toLowerCase();
      const switchChain = async () => {
        await injected.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId }]
        });
      };
      const addChain = async () => {
        try {
          await injected.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId,
                chainName: chain.chainName,
                nativeCurrency: chain.nativeCurrency,
                rpcUrls: chain.rpcUrls,
                blockExplorerUrls: chain.blockExplorerUrls
              }
            ]
          });
        } catch (error) {
          if (!isDuplicateRpcNetworkError(error)) throw error;
        }
      };

      try {
        await switchChain();
      } catch (error) {
        if (!isUnknownChainError(error)) throw error;
        await addChain();
        await switchChain();
      }
      setIsArcNetwork(false);
    },
    [selectedWalletProvider]
  );

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

  // Register user in local registry when wallet connects
  useEffect(() => {
    if (account) registerUser(account);
  }, [account, registerUser]);

  // Close menus when wallet disconnects
  useEffect(() => {
    if (!account) {
      setNotificationMenuOpen(false);
      setSelectedProfileAddress("");
    }
  }, [account]);

  const openMobileWallet = useCallback((url: string) => {
    window.location.href = url;
  }, []);

  const openWalletModal = useCallback(() => {
    setWalletMenuOpen(false);
    setNotificationMenuOpen(false);
    setAuthMoreOpen(false);
    void appKitModal.open();
  }, []);

  const handleDisconnect = useCallback(() => {
    setWalletMenuOpen(false);
    // Disconnect AppKit first so isConnected flips to false; otherwise the
    // bridge effect immediately reconnects after we clear our local account.
    void appKitModal.disconnect();
    void disconnectWallet();
  }, [disconnectWallet]);

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

  const refreshUnifiedBalance = useCallback(async () => {
    if (!account || !isAddress(account)) throw new Error("Connect wallet before using Unified Balance.");
    const { kit, Blockchain, adapter } = await createUnifiedBalanceRuntime(getInjectedProvider(selectedWalletProvider));
    const [result, walletBalances] = await Promise.all([
      kit.unifiedBalance.getBalances({
        token: "USDC",
        sources: {
          adapter,
          chains: [unifiedBalanceSourceChain, Blockchain.Arc_Testnet]
        },
        includePending: true,
        networkType: "testnet"
      } as never),
      readUnifiedBalanceWalletBalances(account)
    ]);
    const summary = flattenUnifiedBalanceSummary(result);
    setUnifiedBalanceSummary(summary);
    setUnifiedBalanceWalletBalances(walletBalances);
    return summary;
  }, [account, selectedWalletProvider, unifiedBalanceSourceChain]);

  const loadUnifiedBalance = useCallback(async () => {
    try {
      setUnifiedBalanceBusy("balances");
      await refreshUnifiedBalance();
      addUnifiedBalanceLog("Unified Balance refreshed.");
    } catch (error) {
      setNotice(`Unified Balance unavailable: ${compactErrorMessage(error)}`);
    } finally {
      setUnifiedBalanceBusy("idle");
    }
  }, [addUnifiedBalanceLog, refreshUnifiedBalance, setNotice]);

  const openUnifiedBalanceModal = useCallback(() => {
    if (!account || !isAddress(account)) {
      setNotice("Connect wallet before using Unified Balance.");
      void appKitModal.open();
      return;
    }
    setWalletMenuOpen(false);
    setUnifiedBalanceModalOpen(true);
  }, [account, setNotice]);

  useEffect(() => {
    if (!unifiedBalanceModalOpen || !account || !isAddress(account)) return;
    void loadUnifiedBalance();
  }, [account, loadUnifiedBalance, unifiedBalanceModalOpen, unifiedBalanceSourceChain]);

  const waitForUnifiedBalanceConfirmed = useCallback(
    async (sourceChain: UnifiedBalanceSourceChainKey, amount: string) => {
      const required = parseUsdcInput(amount, 6);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const summary = await refreshUnifiedBalance();
        if (unifiedBalanceGatewayAmount(summary, sourceChain, "confirmedBalance") >= required) return summary;
        await sleep(6000);
      }
      return null;
    },
    [refreshUnifiedBalance]
  );

  const estimateUnifiedBalanceSpend = useCallback(async () => {
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet before using Unified Balance.");
      const amount = normalizeUnifiedBalanceAmount(unifiedBalanceAmount);
      setUnifiedBalanceBusy("estimate");
      setUnifiedBalanceFees([]);
      const { kit, Blockchain, adapter } = await createUnifiedBalanceRuntime(getInjectedProvider(selectedWalletProvider));
      const estimate = await kit.unifiedBalance.estimateSpend(
        createUnifiedBalanceSpendParams(adapter, Blockchain as Record<string, unknown>, unifiedBalanceSourceChain, amount, account) as never
      );
      setUnifiedBalanceFees(flattenUnifiedBalanceFees(estimate));
      addUnifiedBalanceLog(`Estimated spend of ${amount} USDC to Arc.`);
      setNotice(`Unified Balance estimate ready for ${amount} USDC to Arc Testnet.`);
    } catch (error) {
      setUnifiedBalanceFees([]);
      setNotice(`Unified Balance estimate failed: ${compactErrorMessage(error)}`);
    } finally {
      setUnifiedBalanceBusy("idle");
    }
  }, [account, addUnifiedBalanceLog, selectedWalletProvider, setNotice, unifiedBalanceAmount, unifiedBalanceSourceChain]);

  const depositUnifiedBalance = useCallback(async () => {
    if (transactionLockRef.current) {
      setNotice("A wallet confirmation is already open. Confirm or reject it before sending another transaction.");
      return;
    }
    transactionLockRef.current = true;
    setTransactionPending(true);
    setUnifiedBalanceBusy("deposit");
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet before using Unified Balance.");
      const amount = normalizeUnifiedBalanceAmount(unifiedBalanceAmount);
      await switchToUnifiedBalanceSourceChain(unifiedBalanceSourceChain);
      const { kit, adapter } = await createUnifiedBalanceRuntime(getInjectedProvider(selectedWalletProvider));
      addUnifiedBalanceLog(`Depositing ${amount} USDC from ${unifiedBalanceChainLabel(unifiedBalanceSourceChain)}.`);
      setNotice(`Confirm deposit of ${amount} USDC from ${unifiedBalanceChainLabel(unifiedBalanceSourceChain)} to Circle Gateway.`);
      const result = await kit.unifiedBalance.deposit({
        from: { adapter, chain: unifiedBalanceSourceChain },
        amount,
        token: "USDC",
        allowanceStrategy: "authorize"
      } as never);
      const tx = unifiedBalanceTxFromResult("Deposit to Gateway", result);
      setUnifiedBalanceLastTx(tx);
      addUnifiedBalanceLog(`Deposit confirmed${tx.txHash ? `: ${shortHash(tx.txHash)}` : "."}`);
      setNotice(`Gateway deposit confirmed for ${amount} USDC. You can now spend it to Arc.`, tx.txHash as Hash | undefined);
      await refreshUnifiedBalance();
    } catch (error) {
      setNotice(`Gateway deposit failed: ${compactErrorMessage(error)}`);
    } finally {
      transactionLockRef.current = false;
      setTransactionPending(false);
      setUnifiedBalanceBusy("idle");
    }
  }, [
    account,
    addUnifiedBalanceLog,
    refreshUnifiedBalance,
    selectedWalletProvider,
    setNotice,
    switchToUnifiedBalanceSourceChain,
    unifiedBalanceAmount,
    unifiedBalanceSourceChain
  ]);

  const spendUnifiedBalanceToArc = useCallback(async () => {
    if (transactionLockRef.current) {
      setNotice("A wallet confirmation is already open. Confirm or reject it before sending another transaction.");
      return;
    }
    transactionLockRef.current = true;
    setTransactionPending(true);
    setUnifiedBalanceBusy("spend");
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet before using Unified Balance.");
      const amount = normalizeUnifiedBalanceAmount(unifiedBalanceAmount);
      const required = parseUsdcInput(amount, 6);
      const summary = await refreshUnifiedBalance();
      const confirmed = unifiedBalanceGatewayAmount(summary, unifiedBalanceSourceChain, "confirmedBalance");
      const pending = unifiedBalanceGatewayAmount(summary, unifiedBalanceSourceChain, "pendingBalance");
      if (confirmed < required) {
        throw new Error(
          pending > 0n
            ? `Gateway deposit is still pending on ${unifiedBalanceChainLabel(unifiedBalanceSourceChain)}. Wait for confirmations, refresh, then retry spend.`
            : `No confirmed Gateway balance on ${unifiedBalanceChainLabel(unifiedBalanceSourceChain)}. Deposit first or choose a chain with Gateway balance.`
        );
      }
      await switchToUnifiedBalanceSourceChain(unifiedBalanceSourceChain);
      const { kit, Blockchain, adapter } = await createUnifiedBalanceRuntime(getInjectedProvider(selectedWalletProvider));
      const params = createUnifiedBalanceSpendParams(
        adapter,
        Blockchain as Record<string, unknown>,
        unifiedBalanceSourceChain,
        amount,
        account
      );
      addUnifiedBalanceLog(`Spending ${amount} USDC to Arc Testnet.`);
      setNotice(`Confirm Unified Balance spend of ${amount} USDC. Circle Gateway will mint USDC to Arc Testnet.`);
      const result = await kit.unifiedBalance.spend(params as never);
      const tx = unifiedBalanceTxFromResult("Spend to Arc", result);
      setUnifiedBalanceLastTx(tx);
      const resultFees = flattenUnifiedBalanceFees(result);
      if (resultFees.length > 0) setUnifiedBalanceFees(resultFees);
      addUnifiedBalanceLog(`Spend to Arc confirmed${tx.txHash ? `: ${shortHash(tx.txHash)}` : "."}`);
      setNotice(`Unified Balance spend complete. ${amount} USDC was minted to Arc Testnet.`, tx.txHash as Hash | undefined);
      await switchToArc();
      await sleep(1200);
      await refreshWalletBalance();
      await refreshUnifiedBalance();
    } catch (error) {
      setNotice(`Unified Balance spend failed: ${compactErrorMessage(error)}`);
    } finally {
      transactionLockRef.current = false;
      setTransactionPending(false);
      setUnifiedBalanceBusy("idle");
    }
  }, [
    account,
    addUnifiedBalanceLog,
    refreshUnifiedBalance,
    refreshWalletBalance,
    selectedWalletProvider,
    setNotice,
    switchToArc,
    switchToUnifiedBalanceSourceChain,
    unifiedBalanceAmount,
    unifiedBalanceSourceChain
  ]);

  const depositAndSpendUnifiedBalance = useCallback(async () => {
    if (transactionLockRef.current) {
      setNotice("A wallet confirmation is already open. Confirm or reject it before sending another transaction.");
      return;
    }
    transactionLockRef.current = true;
    setTransactionPending(true);
    setUnifiedBalanceBusy("deposit-spend");
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet before using Unified Balance.");
      const amount = normalizeUnifiedBalanceAmount(unifiedBalanceAmount);
      const required = parseUsdcInput(amount, 6);
      let summary = await refreshUnifiedBalance();
      let confirmed = unifiedBalanceGatewayAmount(summary, unifiedBalanceSourceChain, "confirmedBalance");
      let pending = unifiedBalanceGatewayAmount(summary, unifiedBalanceSourceChain, "pendingBalance");

      if (confirmed < required && confirmed + pending < required) {
        await switchToUnifiedBalanceSourceChain(unifiedBalanceSourceChain);
        const { kit: depositKit, adapter: depositAdapter } = await createUnifiedBalanceRuntime(getInjectedProvider(selectedWalletProvider));
        addUnifiedBalanceLog(`Depositing ${amount} USDC before Arc spend.`);
        setNotice(`Step 1/2: confirm Gateway deposit of ${amount} USDC from ${unifiedBalanceChainLabel(unifiedBalanceSourceChain)}.`);
        const deposit = await depositKit.unifiedBalance.deposit({
          from: { adapter: depositAdapter, chain: unifiedBalanceSourceChain },
          amount,
          token: "USDC",
          allowanceStrategy: "authorize"
        } as never);
        const depositTx = unifiedBalanceTxFromResult("Deposit to Gateway", deposit);
        setUnifiedBalanceLastTx(depositTx);
        addUnifiedBalanceLog(`Deposit confirmed${depositTx.txHash ? `: ${shortHash(depositTx.txHash)}` : "."}`);
        summary = await refreshUnifiedBalance();
        confirmed = unifiedBalanceGatewayAmount(summary, unifiedBalanceSourceChain, "confirmedBalance");
        pending = unifiedBalanceGatewayAmount(summary, unifiedBalanceSourceChain, "pendingBalance");
      } else if (confirmed >= required) {
        addUnifiedBalanceLog(`Using existing confirmed Gateway balance on ${unifiedBalanceChainLabel(unifiedBalanceSourceChain)}.`);
      } else {
        addUnifiedBalanceLog(`Waiting for pending Gateway deposit on ${unifiedBalanceChainLabel(unifiedBalanceSourceChain)}.`);
      }

      if (confirmed < required) {
        setNotice(`Gateway deposit is pending ${formatUsdcInput(pending, 6)} USDC. Waiting for confirmations before minting to Arc...`);
        const readySummary = await waitForUnifiedBalanceConfirmed(unifiedBalanceSourceChain, amount);
        if (!readySummary) {
          setNotice(`Gateway deposit is still pending. Refresh later, then use Retry spend to Arc without depositing again.`);
          return;
        }
        confirmed = unifiedBalanceGatewayAmount(readySummary, unifiedBalanceSourceChain, "confirmedBalance");
        if (confirmed < required) {
          setNotice(`Gateway balance is not confirmed yet. Refresh later, then use Retry spend to Arc.`);
          return;
        }
      }

      await switchToUnifiedBalanceSourceChain(unifiedBalanceSourceChain);
      const { kit, Blockchain, adapter } = await createUnifiedBalanceRuntime(getInjectedProvider(selectedWalletProvider));
      setNotice(`Step 2/2: confirm Unified Balance spend of ${amount} USDC to Arc Testnet.`);
      const spend = await kit.unifiedBalance.spend(
        createUnifiedBalanceSpendParams(adapter, Blockchain as Record<string, unknown>, unifiedBalanceSourceChain, amount, account) as never
      );
      const spendTx = unifiedBalanceTxFromResult("Spend to Arc", spend);
      setUnifiedBalanceLastTx(spendTx);
      const spendFees = flattenUnifiedBalanceFees(spend);
      if (spendFees.length > 0) setUnifiedBalanceFees(spendFees);
      addUnifiedBalanceLog(`Spend to Arc confirmed${spendTx.txHash ? `: ${shortHash(spendTx.txHash)}` : "."}`);
      setNotice(`Unified Balance funding complete. ${amount} USDC is on Arc Testnet.`, spendTx.txHash as Hash | undefined);
      await switchToArc();
      await sleep(1200);
      await refreshWalletBalance();
      await refreshUnifiedBalance();
    } catch (error) {
      setNotice(`Unified Balance funding failed: ${compactErrorMessage(error)}`);
    } finally {
      transactionLockRef.current = false;
      setTransactionPending(false);
      setUnifiedBalanceBusy("idle");
    }
  }, [
    account,
    addUnifiedBalanceLog,
    refreshUnifiedBalance,
    refreshWalletBalance,
    selectedWalletProvider,
    setNotice,
    switchToArc,
    switchToUnifiedBalanceSourceChain,
    unifiedBalanceAmount,
    unifiedBalanceSourceChain,
    waitForUnifiedBalanceConfirmed
  ]);

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

  const reportMarketIssue = useCallback(
    async (marketId: number) => {
      if (!account) {
        setNotice("Connect wallet to report a market.");
        return;
      }
      const draft = reportDrafts[marketId] || { reason: "", url: "" };
      const reason = draft.reason.trim().replace(/\s+/g, " ").slice(0, 520);
      const url = draft.url.trim();
      if (reason.length < 8) {
        setNotice("Add a clear reason before reporting this market.");
        return;
      }
      if (url && !/^https?:\/\//i.test(url)) {
        setNotice("Report URL must start with http:// or https://.");
        return;
      }
      const response = await postIndexerJson<{ report: MarketReport; reports: MarketReport[] }>(
        `/api/social/markets/${marketId}/reports`,
        { reporter: account, reason, url }
      );
      if (response?.reports) {
        setMarketReports((current) => ({ ...current, [String(marketId)]: response.reports }));
        setReportDrafts((current) => ({ ...current, [marketId]: { reason: "", url: "" } }));
        setNotice("Market report sent to owner review.");
        return;
      }

      const report: MarketReport = {
        id: `${marketId}-${Date.now()}`,
        marketId,
        reporter: account,
        reason,
        url,
        status: "open",
        createdAt: new Date().toISOString()
      };
      setMarketReports((current) => ({
        ...current,
        [String(marketId)]: [report, ...(current[String(marketId)] || [])].slice(0, 40)
      }));
      setReportDrafts((current) => ({ ...current, [marketId]: { reason: "", url: "" } }));
      setNotice("Market report saved locally. Owner will see it after indexer sync is available.");
    },
    [account, reportDrafts, setNotice]
  );

  const reviewMarketReport = useCallback(
    async (marketId: number, reportId: string, status: Exclude<MarketReportStatus, "open">, ownerNote: string) => {
      const reviewer = account || owner || "Owner";
      const updatedAt = new Date().toISOString();
      const applyLocalReportUpdate = (rows: MarketReport[]) =>
        rows.map((report) =>
          report.id === reportId
            ? {
                ...report,
                status,
                ownerNote,
                resolvedBy: reviewer,
                resolvedAt: updatedAt
              }
            : report
        );

      const response = await postIndexerJson<{ report: MarketReport; reports: MarketReport[] }>(
        `/api/social/markets/${marketId}/reports/${encodeURIComponent(reportId)}`,
        { status, ownerNote, reviewer }
      );

      if (response?.reports) {
        setMarketReports((current) => ({ ...current, [String(marketId)]: response.reports }));
      } else {
        setMarketReports((current) => ({
          ...current,
          [String(marketId)]: applyLocalReportUpdate(current[String(marketId)] || [])
        }));
      }
      setNotice(
        status === "resolved"
          ? "Market report marked resolved."
          : status === "flagged"
            ? "Market report kept flagged for owner review."
            : "Market report dismissed."
      );
    },
    [account, owner, setNotice]
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
      const response = await postIndexerJsonWithStatus<{
        draft?: AiMarketDraft;
        error?: string;
        provider?: string;
        fallbackReason?: string;
      }>("/api/ai/market-draft", {
        idea,
        category: createForm.category,
        closeTime: inferKnownEventDeadlineFromText(idea) || createForm.closeTime
      });
      if (!response.ok || !response.data?.draft) {
        throw new Error(response.data?.error || `Aura Agent did not return a draft${response.status ? ` (HTTP ${response.status})` : ""}.`);
      }
      setAiMarketDraft(response.data.draft);
      setAuraCreateStatus("ready");
      setNotice(
        response.data.provider === "local-fallback"
          ? "Aura drafted fallback market terms. Review source, date, and rule before launch."
          : "Aura Agent drafted clearer market terms."
      );
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
  const needsVerifiedEventDeadline = Boolean(
    isSportsTournamentWinnerQuestion(`${createForm.question} ${createForm.resolutionRule}`) &&
      !parseResolutionReferenceTime(createForm.resolutionRule) &&
      !inferKnownEventDeadlineFromText(`${createForm.question} ${createForm.resolutionRule}`)
  );
  const createRiskFlags = useMemo(
    () =>
      marketRiskFlagsForInput({
        question: createForm.question,
        category: createForm.category,
        resolutionSource: createForm.resolutionSource,
        resolutionRule: createForm.resolutionRule,
        closeTime: createForm.closeTime,
        resolutionTime: isStablecoinContractVersion(contractVersion) ? createForm.resolutionTime : createForm.closeTime,
        strictSource: true
      }),
    [contractVersion, createForm]
  );
  const hasBlockingMarketRisk = createRiskFlags.some((flag) => flag.severity === "bad");
  const createMarketQuality = useMemo(
    () =>
      marketQualitySnapshot(
        createForm,
        aiMarketDraft,
        hasRuleCloseMismatch,
        isStablecoinContractVersion(contractVersion) ? Boolean(createForm.resolutionTime.trim()) : Boolean(createForm.closeTime.trim()),
        needsVerifiedEventDeadline,
        createRiskFlags
      ),
    [aiMarketDraft, contractVersion, createForm, createRiskFlags, hasRuleCloseMismatch, needsVerifiedEventDeadline]
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
    const draftDeadlineContext = `${aiMarketDraft.question || ""} ${aiMarketDraft.resolutionCriteria || ""}`;
    const knownTournamentDeadline = isSportsTournamentWinnerQuestion(draftDeadlineContext)
      ? inferKnownEventDeadlineFromText(draftDeadlineContext)
      : "";
    const inferredCloseTime =
      knownTournamentDeadline ||
      parseAuraUtcCloseTimeFromText(aiMarketDraft.question || "") ||
      parseAuraUtcCloseTimeFromText(aiMarketDraft.resolutionCriteria || "") ||
      inferKnownEventDeadlineFromText(draftDeadlineContext) ||
      parseAuraUtcCloseTimeFromText(aiMarketDraft.closeTime || "");
    const contextFallbackSource = defaultSourceByContext(
      aiMarketDraft.category,
      draftDeadlineContext
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
    if (aiMarketDraft.question) setLocalQuestionDraft(aiMarketDraft.question);
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

      const nextName = normalizeProfileUsername(profileNameInput);
      if (nextName.length < 2) {
        setNotice("Username must use 2-20 characters: a-z, 0-9, or underscore.");
        return;
      }

      const response = await postIndexerJsonWithStatus<SocialProfileSaveResponse>(
        `/api/social/profiles/${account}`,
        { name: nextName, isPublic: profilePublicByAddress[accountKey] !== false }
      );
      if (!response.ok) {
        if (response.data?.code === "USERNAME_TAKEN") {
          setNotice(`Username "${response.data.username || nextName}" is already taken.`);
          return;
        }
        if (response.status > 0) {
          setNotice(response.data?.error || "Username could not be saved.");
          return;
        }
      }

      const savedName = response.data?.profile?.name?.trim() || nextName;
      const next = { ...profileNames, [accountKey]: savedName };
      setProfileNames(next);
      setProfileNameInput(savedName);
      window.localStorage.setItem(PROFILE_NAMES_KEY, JSON.stringify(next));
      setNotice(response.ok ? "Username saved." : "Indexer unavailable; username saved locally only.");
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
    setMarketDetailTab("overview");
    setMobileMarketTab(focusResolution ? "resolve" : "overview");
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
      setMarketDetailTab("overview");
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
    if (loadMarketsInFlightRef.current) {
      loadMarketsQueuedRef.current = true;
      return;
    }
    loadMarketsInFlightRef.current = true;
    if (!isSilentLoad) setLoading(true);
    try {
      const publicClient = getPublicClient();
      let prefetchedIndexedSnapshot: IndexedSnapshot | null = null;
      const applyIndexedSnapshot = (snapshot: IndexedSnapshot, totalFloor = snapshot.total) => {
        const indexedRows = snapshot.markets;
        const indexedTotalCount = Math.max(totalFloor, snapshot.total, indexedRows.length);
        setKnownMarketCount(indexedTotalCount);
        setMarketLoadLimit((current) => Math.max(current, indexedTotalCount));
        const mergedIndexedRows = mergeMarketRows(indexedRows, markets, indexedTotalCount);
        setMarkets((current) => mergeMarketRows(indexedRows, current, indexedTotalCount));
        setActivities(snapshot.activities);
        if (snapshot.health) setIndexerHealth(snapshot.health);
        if (snapshot.stats) {
          setProjectStats({
            ...snapshot.stats,
            totalMarkets: Math.max(snapshot.stats.totalMarkets, indexedTotalCount),
            indexedMarkets: Math.max(snapshot.stats.indexedMarkets, mergedIndexedRows.length),
            liveMarkets: Math.max(
              snapshot.stats.liveMarkets,
              mergedIndexedRows.filter((market) => market.outcome === Outcome.Unresolved && market.closeTime > nowSeconds).length
            ),
            pendingMarkets: Math.max(
              snapshot.stats.pendingMarkets,
              mergedIndexedRows.filter((market) => market.outcome === Outcome.Unresolved && market.closeTime <= nowSeconds).length
            )
          });
        }
        writeCachedMarkets(mergedIndexedRows);
        setDataSource("indexer");
        setLastDataRefresh(new Date());
        return mergedIndexedRows;
      };

      try {
        prefetchedIndexedSnapshot = await loadIndexedSnapshot(account);
        if (prefetchedIndexedSnapshot) {
          applyIndexedSnapshot(prefetchedIndexedSnapshot);
          if (!isSilentLoad) setLoading(false);
        }
      } catch {
        prefetchedIndexedSnapshot = null;
      }

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
          String(contractVersionName) === "AURAPREDICT_V5"
            ? "v5"
            : String(contractVersionName) === "AURAPREDICT_V4"
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
            abi: stablecoinMarketAbi(detectedContractVersion),
            functionName: "defaultSettlementToken"
          }));
          const asset = await withRpcRetry(() => publicClient.readContract({
            address: contractAddress,
            abi: stablecoinMarketAbi(detectedContractVersion),
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

      const indexedSnapshot = prefetchedIndexedSnapshot ?? await loadIndexedSnapshot(account);
      if (indexedSnapshot) {
        const indexedRows = indexedSnapshot.markets;
        const mergedIndexedRows = applyIndexedSnapshot(indexedSnapshot, totalMarketCount);

        if (detectedContractVersion === "v5") {
          // Hydrate isDraft for markets the indexer may not have flagged.
          // Only check markets with no trading activity (cheapest proxy for draft state).
          const draftCandidates = mergedIndexedRows.filter(
            (m) => !m.isDraft && m.outcome === Outcome.Unresolved && m.traderCount === 0 && m.yesPool === 0n && m.noPool === 0n
          );
          if (draftCandidates.length > 0) {
            void (async () => {
              try {
                const draftChecks = await mapWithConcurrency(
                  draftCandidates,
                  MARKET_LOAD_CONCURRENCY,
                  async (market) => {
                    try {
                      const summary = await withRpcRetry(() => publicClient.readContract({
                        address: contractAddress,
                        abi: arcPredictionMarketV5Abi,
                        functionName: "getMarket",
                        args: [BigInt(market.id)]
                      }));
                      return { id: market.id, isDraft: Number(summary[2]) === V5_MARKET_STATE.Draft };
                    } catch {
                      return null;
                    }
                  }
                );
                const draftIds = new Set(
                  draftChecks.filter((r) => r?.isDraft).map((r) => r!.id)
                );
                if (draftIds.size > 0) {
                  setMarkets((current) =>
                    current.map((m) => draftIds.has(m.id) ? { ...m, isDraft: true } : m)
                  );
                }
              } catch {
                // Non-blocking.
              }
            })();
          }
        }

        if (!isSilentLoad && account && isAddress(account) && indexedRows.length > 0) {
          const accountForPositions = account as Address;
          void (async () => {
            try {
              const positionRows = await mapWithConcurrency(
                indexedRows,
                MARKET_LOAD_CONCURRENCY,
                async (market) => {
                  const position = detectedContractVersion === "v5"
                    ? await withRpcRetry(() => publicClient.readContract({
                        address: contractAddress,
                        abi: arcPredictionMarketV5Abi,
                        functionName: "getUserPosition",
                        args: [BigInt(market.id), accountForPositions]
                      }))
                    : await withRpcRetry(() => publicClient.readContract({
                        address: contractAddress,
                        abi: arcPredictionMarketAbi,
                        functionName: "positionOf",
                        args: [BigInt(market.id), accountForPositions]
                      }));
                  const v5Position = position as readonly [readonly bigint[], boolean];
                  const legacyPosition = position as readonly [bigint, bigint, boolean];
                  const yesPosition = detectedContractVersion === "v5" ? (v5Position[0][0] ?? 0n) : legacyPosition[0];
                  const noPosition = detectedContractVersion === "v5" ? (v5Position[0][1] ?? 0n) : legacyPosition[1];
                  const claimed = detectedContractVersion === "v5" ? Boolean(v5Position[1]) : Boolean(legacyPosition[2]);
                  let potentialPayout = 0n;

                  if (market.outcome !== Outcome.Unresolved && !claimed && (yesPosition > 0n || noPosition > 0n)) {
                    potentialPayout = detectedContractVersion === "v5"
                      ? await withRpcRetry(() => publicClient.readContract({
                          address: contractAddress,
                          abi: arcPredictionMarketV5Abi,
                          functionName: "getClaimable",
                          args: [BigInt(market.id), accountForPositions]
                        }))
                      : await withRpcRetry(() => publicClient.readContract({
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

        if (!isSilentLoad) setLoading(false);
        return;
      }

      let failedMarketLoads = 0;
      setDataSource("rpc");
      const readMarketById = async (id: number, trackFailure: boolean) => {
        if (detectedContractVersion === "v5") {
          try {
            const [summary, v5, pools] = await Promise.all([
              withRpcRetry(() => publicClient.readContract({
                address: contractAddress,
                abi: arcPredictionMarketV5Abi,
                functionName: "getMarket",
                args: [BigInt(id)]
              })),
              withRpcRetry(() => publicClient.readContract({
                address: contractAddress,
                abi: arcPredictionMarketV5Abi,
                functionName: "getMarketV5",
                args: [BigInt(id)]
              })),
              withRpcRetry(() => publicClient.readContract({
                address: contractAddress,
                abi: arcPredictionMarketV5Abi,
                functionName: "getOutcomePools",
                args: [BigInt(id)]
              }))
            ]);
            const asset = await withRpcRetry(() => publicClient.readContract({
              address: contractAddress,
              abi: arcPredictionMarketV5Abi,
              functionName: "assetConfigs",
              args: [summary[7]]
            }));
            const state = Number(summary[2]);
            const proposedRaw = Number(v5[7]);
            const finalRaw = Number(v5[8]);
            const proposedAt = Number(v5[12] || 0n);
            const termsDisputeWindow = Number(v5[13] || 0n);
            const termsProposalGracePeriod = Number(v5[14] || 0n);
            return {
              market: {
                id,
                question: summary[0],
                category: normalizeCategory(summary[1]),
                settlementToken: summary[7],
                settlementSymbol: String(asset[1] || detectedSettlementSymbol),
                settlementDecimals: Number(asset[2] || detectedSettlementDecimals),
                createdAt: 0,
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
                termsCreatorBond: asset[4],
                termsDisputeBond: asset[6],
                termsDisputeWindow,
                termsDisputeGracePeriod: termsProposalGracePeriod,
                termsProposalGracePeriod,
                yesPool: pools[0] ?? 0n,
                noPool: pools[1] ?? 0n,
                traderCount: 0,
                proposedOutcome:
                  state === V5_MARKET_STATE.Proposed || state === V5_MARKET_STATE.Disputed
                    ? v5OutcomeToLegacy(proposedRaw)
                    : Outcome.Unresolved,
                proposedAt,
                disputeDeadline: proposedAt > 0 ? proposedAt + termsDisputeWindow : 0,
                isDraft: state === V5_MARKET_STATE.Draft,
                authorityReviewRequired: Boolean(v5[15]),
                disputed: Boolean(v5[16]),
                disputer: v5[17],
                outcome: v5StateToOutcome(state, finalRaw),
                yesPosition: 0n,
                noPosition: 0n,
                claimed: false,
                potentialPayout: 0n
              },
              isLegacyMarket: false
            };
          } catch (error) {
            if (trackFailure) failedMarketLoads += 1;
            console.warn(`Failed to load V5 market #${id}`, error);
            return null;
          }
        }
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
          if (id === 0 && row && !isStablecoinContractVersion(detectedContractVersion)) {
            setContractVersion(row.isLegacyMarket ? "legacy" : "dispute");
          }
          return row?.market ?? null;
        }
      );

      if (totalMarketCount === 0 && !isStablecoinContractVersion(detectedContractVersion)) setContractVersion("unknown");
      const loadedRows = rows.filter((row): row is MarketView => Boolean(row));

      if (totalMarketCount > 0 && marketIds.length > 0 && loadedRows.length === 0) {
        throw new Error("Arc RPC is rate-limiting requests right now (429). Wait 30-60 seconds, then refresh.");
      }

      let sortedRows = loadedRows.sort((a, b) => b.id - a.id);
      setMarkets((current) => mergeMarketRows(sortedRows, current, totalMarketCount));
      setLastDataRefresh(new Date());
      writeCachedMarkets(sortedRows);
      if (!isSilentLoad) setLoading(false);

      let projectCreatorAddresses = new Set<string>();
      // Skip the full project scan when the display pass already loaded all markets.
      // With MARKET_INITIAL_LOAD = 9999, latestMarketStart is always 0, so the display
      // pass covers every market ID. A second identical RPC pass would just double the
      // rate-limit pressure without adding new data.
      let projectMarkets: MarketView[];
      if (loadedRows.length >= totalMarketCount) {
        projectMarkets = sortedRows;
      } else {
        const projectRows = await mapWithConcurrency(
          Array.from({ length: totalMarketCount }, (_, id) => id),
          MARKET_LOAD_CONCURRENCY,
          async (id) => readMarketById(id, false)
        );
        projectMarkets = projectRows.flatMap((row) => row ? [row.market as MarketView] : []);
        if (projectMarkets.length >= sortedRows.length) {
          sortedRows = projectMarkets.sort((a, b) => b.id - a.id);
          setMarketLoadLimit((current) => Math.max(current, sortedRows.length));
          setMarkets((current) => mergeMarketRows(sortedRows, current, totalMarketCount));
          writeCachedMarkets(sortedRows);
        }
      }
      // Only update project stats from RPC data when we have a complete picture.
      // If the RPC only loaded a fraction of markets, keep the indexer's accurate stats.
      const hasGoodIndexerStats = Boolean(prefetchedIndexedSnapshot?.stats);
      if ((projectMarkets.length >= totalMarketCount || (!hasGoodIndexerStats && projectMarkets.length > 0)) || totalMarketCount === 0) {
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
                const position = detectedContractVersion === "v5"
                  ? await withRpcRetry(() => publicClient.readContract({
                      address: contractAddress,
                      abi: arcPredictionMarketV5Abi,
                      functionName: "getUserPosition",
                      args: [BigInt(market.id), accountForPositions]
                    }))
                  : await withRpcRetry(() => publicClient.readContract({
                      address: contractAddress,
                      abi: arcPredictionMarketAbi,
                      functionName: "positionOf",
                      args: [BigInt(market.id), accountForPositions]
                    }));
                const v5Position = position as readonly [readonly bigint[], boolean];
                const legacyPosition = position as readonly [bigint, bigint, boolean];
                const yesPosition = detectedContractVersion === "v5" ? (v5Position[0][0] ?? 0n) : legacyPosition[0];
                const noPosition = detectedContractVersion === "v5" ? (v5Position[0][1] ?? 0n) : legacyPosition[1];
                const claimed = detectedContractVersion === "v5" ? Boolean(v5Position[1]) : Boolean(legacyPosition[2]);
                let potentialPayout = 0n;

                if (market.outcome !== Outcome.Unresolved && !claimed && (yesPosition > 0n || noPosition > 0n)) {
                  potentialPayout = detectedContractVersion === "v5"
                    ? await withRpcRetry(() => publicClient.readContract({
                        address: contractAddress,
                        abi: arcPredictionMarketV5Abi,
                        functionName: "getClaimable",
                        args: [BigInt(market.id), accountForPositions]
                      }))
                    : await withRpcRetry(() => publicClient.readContract({
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
        const getContractEventsChunked = async (eventName: "MarketCreated" | "BetPlaced" | "PositionTaken") => {
          const latestBlock = await withRpcRetry(() => publicClient.getBlockNumber());
          const events: ContractEventRow[] = [];
          let fromBlock = EVENT_START_BLOCK;
          const eventAbi = detectedContractVersion === "v5" ? arcPredictionMarketV5Abi : arcPredictionMarketAbi;

          while (fromBlock <= latestBlock) {
            const toBlock =
              fromBlock + EVENT_LOG_CHUNK_SIZE - 1n > latestBlock ? latestBlock : fromBlock + EVENT_LOG_CHUNK_SIZE - 1n;
            const rows = await withRpcRetry(() =>
              publicClient.getContractEvents({
                address: contractAddress,
                abi: eventAbi,
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
          getContractEventsChunked(contractVersion === "v5" ? "PositionTaken" : "BetPlaced")
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
              outcomeId?: number;
              amount?: bigint;
            };
            const marketId = Number(args.marketId ?? 0n);
            const side = contractVersion === "v5"
              ? v5OutcomeToLegacy(Number(args.outcomeId ?? V5_NO_OUTCOME))
              : Number(args.side ?? 0) as Outcome;

            return {
              id: `${event.transactionHash}-${event.logIndex}`,
              user: args.user ?? "0x0000000000000000000000000000000000000000",
              marketId,
              question: marketMap.get(marketId)?.question ?? `Market #${marketId}`,
              side,
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
      if (loadMarketsQueuedRef.current) {
        loadMarketsQueuedRef.current = false;
        silentLoadRef.current = false;
        setMarketReloadToken((current) => current + 1);
      }
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

  const applyChainMarketSnapshot = (marketId: number, snapshot: ChainMarketSnapshot) => {
    setMarkets((current) =>
      current.map((market) =>
        market.id === marketId
          ? {
              ...market,
              proposedOutcome: snapshot.proposedOutcome,
              proposedAt: snapshot.proposedAt,
              disputeDeadline: snapshot.disputeDeadline,
              authorityReviewRequired: snapshot.authorityReviewRequired,
              disputed: snapshot.disputed,
              outcome: snapshot.outcome
            }
          : market
      )
    );
  };

  const readChainMarketSnapshot = async (marketId: number): Promise<ChainMarketSnapshot | null> => {
    if (!isStablecoinContractVersion(contractVersion)) return null;
    if (contractVersion === "v5") {
      const v5 = await withRpcRetry(() =>
        getPublicClient().readContract({
          address: contractAddress,
          abi: arcPredictionMarketV5Abi,
          functionName: "getMarketV5",
          args: [BigInt(marketId)]
        })
      );
      const state = Number(v5[0]);
      const proposedAt = Number(v5[12] ?? 0n);
      const disputeWindowSeconds = Number(v5[13] ?? 0n);
      return {
        proposedOutcome:
          state === V5_MARKET_STATE.Proposed || state === V5_MARKET_STATE.Disputed
            ? v5OutcomeToLegacy(Number(v5[7]))
            : Outcome.Unresolved,
        proposedAt,
        disputeDeadline: proposedAt > 0 ? proposedAt + disputeWindowSeconds : 0,
        authorityReviewRequired: Boolean(v5[15]),
        disputed: Boolean(v5[16]),
        outcome: v5StateToOutcome(state, Number(v5[8]))
      };
    }
    const data = (await withRpcRetry(() =>
      getPublicClient().readContract({
        address: contractAddress,
        abi: stablecoinMarketAbi(contractVersion),
        functionName: "getMarket",
        args: [BigInt(marketId)]
      })
    )) as readonly unknown[];
    return {
      proposedOutcome: Number(data[18] ?? Outcome.Unresolved) as Outcome,
      proposedAt: Number(data[19] ?? 0),
      disputeDeadline: Number(data[20] ?? 0),
      authorityReviewRequired: Boolean(data[21]),
      disputed: Boolean(data[22]),
      outcome: Number(data[24] ?? Outcome.Unresolved) as Outcome
    };
  };

  const ensureFreshSettlementState = async (marketId: number, action: "finalize" | "final-review") => {
    const snapshot = await readChainMarketSnapshot(marketId);
    if (!snapshot) return true;

    applyChainMarketSnapshot(marketId, snapshot);

    if (snapshot.outcome !== Outcome.Unresolved) {
      setNotice(`Market #${marketId} is already finalized as ${outcomeLabel(snapshot.outcome)}. Refreshed from chain.`);
      void loadMarkets();
      return false;
    }

    if (action === "finalize") {
      if (snapshot.proposedAt <= 0) {
        setNotice("Finalize is not available because no result has been proposed on-chain.");
        return false;
      }
      if (snapshot.disputed || snapshot.authorityReviewRequired) {
        setNotice("Normal finalize is blocked because this market requires owner/authority final review.");
        return false;
      }
      if (snapshot.disputeDeadline > 0 && Math.floor(Date.now() / 1000) < snapshot.disputeDeadline) {
        setNotice(`Finalize is not available until the dispute window closes at ${closeDate(snapshot.disputeDeadline)}.`);
        return false;
      }
    }

    if (action === "final-review" && !snapshot.disputed && !snapshot.authorityReviewRequired) {
      setNotice("Final review is not available because this market is not disputed and does not require authority review.");
      return false;
    }

    return true;
  };

  const runTransaction = async (
    action: () => Promise<Hash>,
    message: string,
    refreshAfterConfirm = true,
    onConfirmed?: (receipt: TransactionReceipt) => void,
    onFailed?: (message: string) => void
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
      const compactMessage = compactErrorMessage(error);
      setNotice(compactMessage, submittedHash);
      onFailed?.(compactMessage);
      return false;
    } finally {
      transactionLockRef.current = false;
      setTransactionPending(false);
    }
  };

  const markClaimedLocally = useCallback(
    (marketId: number) => {
      if (!accountKey) return;
      const key = claimedMarketKey(accountKey, marketId);
      setLocallyClaimedMarkets((current) => (current.includes(key) ? current : [...current, key].slice(-400)));
      setMarkets((current) =>
        current.map((market) =>
          market.id === marketId ? { ...market, claimed: true, potentialPayout: 0n } : market
        )
      );
    },
    [accountKey]
  );

  const refreshClaimEligibility = useCallback(
    async (marketId: number) => {
      if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
      const [position, payout] = contractVersion === "v5"
        ? await Promise.all([
            withRpcRetry(() => getPublicClient().readContract({
              address: contractAddress,
              abi: arcPredictionMarketV5Abi,
              functionName: "getUserPosition",
              args: [BigInt(marketId), account as Address]
            })),
            withRpcRetry(() => getPublicClient().readContract({
              address: contractAddress,
              abi: arcPredictionMarketV5Abi,
              functionName: "getClaimable",
              args: [BigInt(marketId), account as Address]
            }))
          ])
        : await Promise.all([
            withRpcRetry(() => getPublicClient().readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "positionOf",
              args: [BigInt(marketId), account as Address]
            })),
            withRpcRetry(() => getPublicClient().readContract({
              address: contractAddress,
              abi: arcPredictionMarketAbi,
              functionName: "potentialPayout",
              args: [BigInt(marketId), account as Address]
            }))
          ]);
      const v5Position = position as readonly [readonly bigint[], boolean];
      const legacyPosition = position as readonly [bigint, bigint, boolean];
      const yesPosition = contractVersion === "v5" ? (v5Position[0][0] ?? 0n) : legacyPosition[0];
      const noPosition = contractVersion === "v5" ? (v5Position[0][1] ?? 0n) : legacyPosition[1];
      const claimed = contractVersion === "v5" ? Boolean(v5Position[1]) : Boolean(legacyPosition[2]);
      setMarkets((current) =>
        current.map((market) =>
          market.id === marketId
            ? {
                ...market,
                yesPosition,
                noPosition,
                claimed,
                potentialPayout: claimed ? 0n : payout
              }
            : market
        )
      );
      if (claimed) markClaimedLocally(marketId);
      return { claimed, payout };
    },
    [account, contractAddress, contractVersion, markClaimedLocally]
  );

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
      const validationFlags = marketRiskFlagsForInput({
        question,
        category,
        resolutionSource,
        resolutionRule,
        closeTime: createForm.closeTime,
        resolutionTime: isStablecoinContractVersion(contractVersion) ? createForm.resolutionTime : createForm.closeTime,
        strictSource: true
      });
      const blockingFlag = validationFlags.find((flag) => flag.severity === "bad");
      if (blockingFlag) throw new Error(`${blockingFlag.label}: ${blockingFlag.detail}`);
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
          abi: stablecoinMarketAbi(contractVersion),
          functionName: "assetConfigs",
          args: [settlementToken]
        }));
        const assetConfig = asset as unknown as readonly [boolean, string, number, bigint, bigint, bigint, bigint, bigint, bigint];
        if (!assetConfig[0]) throw new Error("Selected settlement token is not enabled in the contract.");
        createdSettlementSymbol = String(assetConfig[1] || "TOKEN");
        createdSettlementDecimals = Number(assetConfig[2] || V3_STABLECOIN_DECIMALS);
        const createCost =
          contractVersion === "v5"
            ? (assetConfig[4] ?? 0n) + (assetConfig[8] ?? 0n)
            : (assetConfig[4] ?? 0n) + (assetConfig[6] ?? 0n);
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
            contractVersion === "v5"
              ? walletClient.writeContract({
                  account: account as Address,
                  chain: arcTestnet,
                  address: contractAddress,
                  abi: arcPredictionMarketV5Abi,
                  functionName: "submitMarketDraft",
                  args: [
                    {
                      question,
                      category,
                      sourceUrl: resolutionSource,
                      resolutionRule: contractResolutionRule,
                      metadataURI: resolutionSource,
                      token: settlementToken,
                      adapter: ZERO_ADDRESS,
                      closeTime,
                      resolutionTime,
                      mode: Number(createForm.resolutionMode),
                      outcomeCount: 2,
                      outcomeLabelsHash: V5_BINARY_OUTCOME_LABELS_HASH,
                      sourceHash: keccak256(stringToHex(resolutionSource)),
                      ruleHash: keccak256(stringToHex(contractResolutionRule))
                    }
                  ]
                })
              : contractVersion === "v4"
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
                    abi: stablecoinMarketAbi(contractVersion),
                    data: log.data,
                    topics: log.topics
                  });
                } catch {
                  return null;
                }
              })
              .find((event) => event?.eventName === (contractVersion === "v5" ? "MarketDraftSubmitted" : "MarketCreated"));
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
        resolutionMode: "2",
        resolutionSource: "",
        resolutionRule: "",
        fallbackSource: ""
      });
      setLocalQuestionDraft("");
      setAiMarketDraft(null);
      setAuraCreateStatus("idle");
      setDuplicateAcknowledged(false);
      setCreateModalOpen(false);
      setView("markets");
      setActiveCategory("All");
      setNotice(
        contractVersion === "v5"
          ? "Market draft submitted. The owner must approve it before trading opens."
          : "Market created. It is shown locally now and will sync to the public indexer shortly."
      );
      window.setTimeout(() => {
        silentLoadRef.current = true;
        void loadMarkets();
      }, 90_000);
    } catch (error) {
      setNotice(compactErrorMessage(error));
    }
  };

  const placeBet = async (marketId: number, side: Outcome, amountOverride?: string) => {
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
      const market = markets.find((item) => item.id === marketId);
      const amountDecimals = isStablecoinContractVersion(contractVersion) ? marketDecimals(market) : ARC_NATIVE_USDC_DECIMALS;
      const amount = amountOverride ?? stakeInputs[marketId] ?? "";
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
                abi: stablecoinMarketAbi(contractVersion),
                functionName: contractVersion === "v5" ? "placePosition" : "bet",
                args: contractVersion === "v5"
                  ? [BigInt(marketId), legacyOutcomeToV5(side), value]
                  : [BigInt(marketId), side, value]
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
    if (contractVersion === "v5" && market) {
      const unlockAt = resolutionUnlockTime(market);
      if (Math.floor(Date.now() / 1000) < unlockAt) {
        const diff = unlockAt - Math.floor(Date.now() / 1000);
        const hrs = Math.ceil(diff / 3600);
        setNotice(`Too early: resolution unlocks in ~${hrs}h. Wait until after the resolution time.`);
        return;
      }
    }
    const source = options?.source ?? "manual";
    if (market && (outcome === Outcome.Yes || outcome === Outcome.No)) {
      const oracleProposal = oracleProposals[String(marketId)];
      const oracleIssue = oracleSafetyIssueFor(oracleProposal, market);
      const oracleOutcome = oracleOutcomeFromProposal(oracleProposal);
      if (source === "oracle" && oracleIssue) {
        setNotice(`Oracle preflight blocked this proposal: ${oracleIssue}`);
        return;
      }
      if (oracleIssue && oracleOutcome === outcome) {
        setNotice(`Preflight blocked ${outcomeLabel(outcome)} because it matches an unsafe oracle proposal: ${oracleIssue}`);
        return;
      }
    }
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
      if (contractVersion === "v5" && market) {
        const token = (market.settlementToken || defaultSettlementToken) as Address;
        const assetCfg = await withRpcRetry(() => getPublicClient().readContract({
          address: contractAddress,
          abi: arcPredictionMarketV5Abi,
          functionName: "assetConfigs",
          args: [token]
        })) as readonly [boolean, string, number, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
        // tuple: [enabled, symbol, decimals, minStake, creatorBond, resolverBond, disputeBond, ...]
        const resolverBond = assetCfg?.[5] ?? 0n;
        if (resolverBond > 0n) {
          const allowance = await withRpcRetry(() => getPublicClient().readContract({
            address: token,
            abi: settlementTokenAbi,
            functionName: "allowance",
            args: [account as Address, contractAddress]
          })) as bigint;
          if (allowance < resolverBond) {
            const approved = await runTransaction(
              () => walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: token,
                abi: settlementTokenAbi,
                functionName: "approve",
                args: [contractAddress, resolverBond]
              }),
              `Approving ${formatMarketAmount(resolverBond, market)} ${marketSymbol(market)} resolver bond...`
            );
            if (!approved) { setMarketActionPending("resolve", marketId, false); return; }
          }
        }
      }
      const success = await runTransaction(
        () =>
          contractVersion === "v5"
            ? walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: arcPredictionMarketV5Abi,
                functionName: "proposeOutcome",
                args: [
                  BigInt(marketId),
                  legacyOutcomeToV5(outcome),
                  evidenceHash,
                  storedReceiptHash,
                  hasAiSuggestion ? legacyOutcomeToV5(aiSuggestedOutcome as Outcome) : V5_NO_OUTCOME,
                  V5_NO_OUTCOME,
                  0,
                  ZERO_HASH
                ]
              })
            : contractVersion === "v4" && signedAiSuggestion
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
                    ? stablecoinMarketAbi(contractVersion)
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
            | { marketId?: bigint; outcome?: number; outcomeId?: number; disputeDeadline?: bigint }
            | undefined;
          const eventOutcome =
            contractVersion === "v5" && args?.outcomeId !== undefined
              ? v5OutcomeToLegacy(Number(args.outcomeId))
              : Number(args?.outcome ?? outcome) as Outcome;
          markMarketResultProposed(
            Number(args?.marketId ?? BigInt(marketId)),
            eventOutcome,
            Number(args?.disputeDeadline ?? BigInt(Math.floor(Date.now() / 1000) + (market?.termsDisputeWindow || disputeWindow || 0)))
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
              abi: stablecoinMarketAbi(contractVersion),
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
    const market = markets.find((item) => item.id === marketId);
    const audit = market ? settlementAuditFor(market) : null;
    if (audit?.blocksFinalize) {
      setNotice(`Finalize preflight blocked: ${audit.detail}`);
      return;
    }
    setMarketActionPending("finalize", marketId, true);
    try {
      await switchToArc();
      if (!(await ensureFreshSettlementState(marketId, "finalize"))) return;
      const walletClient = getActiveWalletClient();
      const fallbackOutcome = market?.proposedOutcome ?? Outcome.Unresolved;
      await runTransaction(
        () =>
          walletClient.writeContract({
            account: account as Address,
            chain: arcTestnet,
            address: contractAddress,
            abi: contractVersion === "v5" ? arcPredictionMarketV5Abi : arcPredictionMarketAbi,
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
                  abi: contractVersion === "v5" ? arcPredictionMarketV5Abi : arcPredictionMarketAbi,
                  data: log.data,
                  topics: log.topics
                });
              } catch {
                return null;
              }
            })
            .find((event) => event?.eventName === (contractVersion === "v5" ? "MarketFinalized" : "MarketResolved"));
          const args = resolvedEvent?.args as { marketId?: bigint; outcome?: number; outcomeId?: number } | undefined;
          const finalOutcome =
            contractVersion === "v5" && args?.outcomeId !== undefined
              ? v5OutcomeToLegacy(Number(args.outcomeId))
              : Number(args?.outcome ?? fallbackOutcome) as Outcome;
          markMarketFinalized(Number(args?.marketId ?? BigInt(marketId)), finalOutcome);
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
    if (market && (outcome === Outcome.Yes || outcome === Outcome.No)) {
      const oracleProposal = oracleProposals[String(marketId)];
      const oracleIssue = oracleSafetyIssueFor(oracleProposal, market);
      const oracleOutcome = oracleOutcomeFromProposal(oracleProposal);
      if (oracleIssue && oracleOutcome === outcome) {
        setNotice(`Final review preflight blocked ${outcomeLabel(outcome)}: ${oracleIssue}`);
        return;
      }
    }
    const aiReceipt = aiResolutionReceipts[String(marketId)];
    const evidenceHash = keccak256(stringToHex(JSON.stringify(marketEvidence[String(marketId)] || [])));
    const receiptHash =
      typeof aiReceipt?.receiptHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(aiReceipt.receiptHash)
        ? aiReceipt.receiptHash as Hash
        : ZERO_HASH as Hash;
    setMarketActionPending("finalize-dispute", marketId, true);
    try {
      await switchToArc();
      if (!(await ensureFreshSettlementState(marketId, "final-review"))) return;
      const walletClient = getActiveWalletClient();
      await runTransaction(
        () =>
          contractVersion === "v5"
            ? walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: arcPredictionMarketV5Abi,
                functionName: "finalizeOutcome",
                args: [BigInt(marketId), legacyOutcomeToV5(outcome), evidenceHash, receiptHash]
              })
          : isStablecoinContractVersion(contractVersion)
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
    if ((contractVersion !== "v4" && contractVersion !== "v5") || isMarketActionPending("unproposed-cancel", marketId)) return;
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
            abi: contractVersion === "v5" ? arcPredictionMarketV5Abi : arcPredictionMarketV4Abi,
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
          contractVersion === "v5"
            ? walletClient.writeContract({
                account: account as Address,
                chain: arcTestnet,
                address: contractAddress,
                abi: arcPredictionMarketV5Abi,
                functionName: "proposeCancel",
                args: [BigInt(marketId), evidenceHash, receiptHash]
              })
          : isStablecoinContractVersion(contractVersion) && market && hasNoLiquidity(market)
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
          if (isStablecoinContractVersion(contractVersion) && contractVersion !== "v5" && market && hasNoLiquidity(market)) {
            markMarketFinalized(marketId, Outcome.Canceled);
            return;
          }
          const proposedEvent = receipt.logs
            .map((log) => {
              try {
                return decodeEventLog({
                  abi: isStablecoinContractVersion(contractVersion)
                    ? stablecoinMarketAbi(contractVersion)
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
            | { marketId?: bigint; outcome?: number; outcomeId?: number; disputeDeadline?: bigint }
            | undefined;
          const proposedOutcome =
            contractVersion === "v5" && args?.outcomeId !== undefined
              ? v5OutcomeToLegacy(Number(args.outcomeId))
              : Number(args?.outcome ?? Outcome.Canceled) as Outcome;
          markMarketResultProposed(
            Number(args?.marketId ?? BigInt(marketId)),
            proposedOutcome,
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
    const eligibility = await refreshClaimEligibility(marketId);
    if (eligibility.claimed) {
      setNotice("This payout was already claimed. Notification updated.");
      setNotificationMenuOpen(false);
      return;
    }
    if (eligibility.payout <= 0n) {
      setNotice("No claimable payout is available onchain for this market. Notification updated.");
      setMarkets((current) =>
        current.map((market) => (market.id === marketId ? { ...market, potentialPayout: 0n } : market))
      );
      setNotificationMenuOpen(false);
      return;
    }
    const walletClient = getActiveWalletClient();
    const completed = await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: isStablecoinContractVersion(contractVersion) ? stablecoinMarketAbi(contractVersion) : arcPredictionMarketAbi,
          functionName: "claim",
          args: [BigInt(marketId)]
        }),
      "Claiming payout...",
      true,
      () => markClaimedLocally(marketId)
    );
    if (completed) setNotificationMenuOpen(false);
  };

  const assistantMarkets = useMemo<AssistantMarketContext[]>(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const D = 1e18;
    return markets
      .filter((market) => !market.isDraft)
      .map((market) => {
        const total = market.yesPool + market.noPool;
        const yesPercent = total > 0n ? Number((market.yesPool * 10000n) / total) / 100 : 50;
        const status =
          market.outcome !== Outcome.Unresolved ? "resolved" : market.closeTime > nowSeconds ? "live" : "pending";
        const myYes = market.yesPosition > 0n ? Math.round(Number(market.yesPosition) / D * 100) / 100 : undefined;
        const myNo  = market.noPosition  > 0n ? Math.round(Number(market.noPosition)  / D * 100) / 100 : undefined;
        const myPayout = market.potentialPayout > 0n && !market.claimed
          ? Math.round(Number(market.potentialPayout) / D * 100) / 100
          : undefined;
        return {
          id: market.id,
          question: market.question,
          category: market.category,
          status,
          yesPercent: Math.round(yesPercent * 10) / 10,
          noPercent: Math.round((100 - yesPercent) * 10) / 10,
          closeIso: new Date(market.closeTime * 1000).toISOString(),
          outcome: market.outcome === Outcome.Yes ? "YES" : market.outcome === Outcome.No ? "NO" : "Unresolved",
          claimable: market.potentialPayout > 0n && !market.claimed,
          ...(myYes !== undefined && { myYes }),
          ...(myNo  !== undefined && { myNo }),
          ...(myPayout !== undefined && { myPayout })
        };
      });
  }, [markets]);

  const assistantUserStats = useMemo<AuraUserStats | null>(() => {
    if (!account) return null;
    const D = 1e18;
    const participatedIds: number[] = [];
    const createdIds: number[] = [];
    let claimableMarkets = 0;
    let totalClaimable = 0;
    for (const market of markets) {
      if (market.isDraft) continue;
      if (market.yesPosition > 0n || market.noPosition > 0n) participatedIds.push(market.id);
      if (sameAddress(market.creator, account)) createdIds.push(market.id);
      if (market.potentialPayout > 0n && !market.claimed) {
        claimableMarkets += 1;
        totalClaimable += Number(market.potentialPayout) / D;
      }
    }
    return {
      wallet: account,
      participatedMarkets: participatedIds.length,
      createdMarkets: createdIds.length,
      claimableMarkets,
      totalClaimableUsdc: Math.round(totalClaimable * 100) / 100,
      participatedMarketIds: participatedIds,
      createdMarketIds: createdIds
    };
  }, [account, markets]);

  const handleAssistantAction = useCallback(
    (action: AssistantAction) => {
      if (action.type === "view") {
        setSelectedProfileAddress("");
        setSelectedMarketId(action.marketId);
        updateMarketRoute(action.marketId);
        setView("market");
        return;
      }
      if (action.type === "claim") {
        void claim(action.marketId);
        return;
      }
      if (action.type === "bet" && action.side) {
        const side = action.side === "YES" ? Outcome.Yes : Outcome.No;
        if (action.amount) setStakeInputs((current) => ({ ...current, [action.marketId]: action.amount as string }));
        void placeBet(action.marketId, side, action.amount);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claim, placeBet, updateMarketRoute]
  );

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
        abi: stablecoinMarketAbi(contractVersion),
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
        abi: stablecoinMarketAbi(contractVersion),
        functionName: "requestAuthorityReview",
        args: [BigInt(market.id), reasonHash]
      }),
      "Flagging proposal for authority review..."
    );
    if (completed) {
      setMarkets((current) => current.map((item) => item.id === market.id ? { ...item, authorityReviewRequired: true } : item));
    }
  };

  const claimAll = async (targetMarketIds?: number[]) => {
    try {
      if (!account || !isAddress(account)) throw new Error("Connect wallet first.");
      const retryTargetSet = targetMarketIds && targetMarketIds.length > 0 ? new Set(targetMarketIds) : null;

      const candidateMap = new Map<number, MarketView>();
      for (const market of [...accountPositionMarkets, ...claimNotifications]) {
        if (retryTargetSet && !retryTargetSet.has(market.id)) continue;
        if (market.outcome !== Outcome.Unresolved && !market.claimed && hasUserPosition(market)) {
          candidateMap.set(market.id, market);
        }
      }
      const claimCandidates = [...candidateMap.values()].sort((a, b) => a.id - b.id);
      if (claimCandidates.length === 0) {
        setClaimRetryMarketIds([]);
        setNotice(retryTargetSet ? "No failed claim targets are still claimable." : "No claimable payouts right now.");
        return;
      }

      await switchToArc();
      const walletClient = getActiveWalletClient();
      setNotice(`Checking ${claimCandidates.length} ended markets for claimable payouts...`);
      const eligibilityRows = await mapWithConcurrency(
        claimCandidates,
        Math.min(4, MARKET_LOAD_CONCURRENCY),
        async (market) => {
          try {
            return { market, eligibility: await refreshClaimEligibility(market.id), error: null };
          } catch (error) {
            return { market, eligibility: null, error };
          }
        }
      );
      const claimTargets = eligibilityRows
        .filter((row) => row.eligibility && !row.eligibility.claimed && row.eligibility.payout > 0n)
        .map((row) => row.market);
      let skippedCount = eligibilityRows.length - claimTargets.length;
      for (const row of eligibilityRows) {
        if (row.eligibility?.claimed) {
          markClaimedLocally(row.market.id);
        } else if (row.eligibility && row.eligibility.payout <= 0n) {
          setMarkets((current) =>
            current.map((item) => (item.id === row.market.id ? { ...item, potentialPayout: 0n } : item))
          );
        }
      }
      const firstEligibilityError = eligibilityRows.find((row) => row.error)?.error;
      if (claimTargets.length === 0) {
        setClaimRetryMarketIds([]);
        setNotice(
          firstEligibilityError
            ? `No claimable payouts found. Last check error: ${compactErrorMessage(firstEligibilityError)}`
            : "No claimable payouts found after checking your ended markets."
        );
        void loadMarkets();
        return;
      }

      if (contractVersion === "v5") {
        let failureMessage = "";
        const targetIds = claimTargets.map((market) => BigInt(market.id));
        const completed = await runTransaction(
          () =>
            walletClient.writeContract({
              account: account as Address,
              chain: arcTestnet,
              address: contractAddress,
              abi: arcPredictionMarketV5Abi,
              functionName: "claimMany",
              args: [targetIds]
            }),
          `Claiming ${claimTargets.length} V5 payouts in one transaction...`,
          false,
          () => claimTargets.forEach((market) => markClaimedLocally(market.id)),
          (message) => {
            failureMessage = message;
          }
        );
        if (completed) {
          setClaimRetryMarketIds([]);
          setNotificationMenuOpen(false);
          setNotice(`Claimed ${claimTargets.length} available V5 payout${claimTargets.length === 1 ? "" : "s"}.`);
          void refreshWalletBalance();
          void loadMarkets();
          return;
        }
        setClaimRetryMarketIds(claimTargets.map((market) => market.id));
        setNotice(`Claim all failed before confirmation: ${failureMessage || "Claim transaction failed."}`);
        return;
      }

      let claimedCount = 0;
      const failedClaims: ClaimAllFailure[] = [];
      for (const [index, market] of claimTargets.entries()) {
        let failureMessage = "";
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
          `Claiming payout ${index + 1}/${claimTargets.length} from Market #${market.id}...`,
          false,
          () => markClaimedLocally(market.id),
          (message) => {
            failureMessage = message;
          }
        );
        if (completed) claimedCount += 1;
        if (!completed) {
          failedClaims.push({ marketId: market.id, message: failureMessage || "Claim transaction failed." });
          if ((failureMessage || "").toLowerCase().includes("transaction rejected")) {
            skippedCount += claimTargets.length - index - 1;
            break;
          }
        }
      }
      setClaimRetryMarketIds(failedClaims.map((failure) => failure.marketId));
      void refreshWalletBalance();
      void loadMarkets();
      if (claimedCount > 0 || skippedCount > 0 || failedClaims.length > 0) {
        setNotificationMenuOpen(false);
        setNotice(claimAllResultNotice(claimedCount, skippedCount, failedClaims));
      }
    } catch (error) {
      setNotice(compactErrorMessage(error));
    }
  };

  const approveDraftMarket = async (marketId: number) => {
    if (!account || !isAddress(account)) throw new Error("Connect owner wallet first.");
    if (!owner || !sameAddress(account, owner)) throw new Error("Only the protocol owner can approve draft markets.");
    if (contractVersion !== "v5") throw new Error("Draft approval is only supported on V5 contracts.");
    await switchToArc();
    const walletClient = getActiveWalletClient();
    const completed = await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketV5Abi,
          functionName: "approveMarket",
          args: [BigInt(marketId)]
        }),
      `Approving draft market #${marketId}...`
    );
    if (completed) {
      setMarkets((current) =>
        current.map((m) => (m.id === marketId ? { ...m, isDraft: false } : m))
      );
      setNotice(`Market #${marketId} approved. It is now live.`);
    }
  };

  const rejectDraftMarket = async (marketId: number) => {
    setRejectMarketModal({ marketId, isDraft: true });
    setRejectMarketReason("");
  };

  const cancelLiveMarket = async (marketId: number) => {
    setRejectMarketModal({ marketId, isDraft: false });
    setRejectMarketReason("");
  };

  const confirmRejectMarket = async () => {
    if (!rejectMarketModal) return;
    const { marketId, isDraft } = rejectMarketModal;
    if (!account || !isAddress(account)) throw new Error("Connect owner wallet first.");
    if (!owner || !sameAddress(account, owner)) throw new Error("Only the protocol owner can cancel markets.");
    if (contractVersion !== "v5") throw new Error("Only supported on V5 contracts.");
    const reason = rejectMarketReason.trim() || (isDraft ? "Owner rejected draft market." : "Owner cancelled market.");
    setRejectMarketModal(null);
    await switchToArc();
    const walletClient = getActiveWalletClient();
    const completed = await runTransaction(
      () =>
        walletClient.writeContract({
          account: account as Address,
          chain: arcTestnet,
          address: contractAddress,
          abi: arcPredictionMarketV5Abi,
          functionName: "rejectMarket",
          args: [BigInt(marketId), false, keccak256(stringToHex(reason))]
        }),
      `${isDraft ? "Rejecting" : "Cancelling"} market #${marketId}...`
    );
    if (completed) {
      const stored = JSON.parse(localStorage.getItem("aurapredict.marketRejections") || "{}");
      stored[String(marketId)] = { reason, by: account, at: new Date().toISOString(), isDraft };
      localStorage.setItem("aurapredict.marketRejections", JSON.stringify(stored));
      setOwnerDraftMarkets((current) => current.filter((m) => m.id !== marketId));
      setMarkets((current) => current.filter((m) => m.id !== marketId));
      setNotice(`Market #${marketId} ${isDraft ? "rejected" : "cancelled"}. Reason stored.`);
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
          abi: isStablecoinContractVersion(contractVersion) ? stablecoinMarketAbi(contractVersion) : arcPredictionMarketAbi,
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
  }, [loadMarkets, marketReloadToken]);

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

  useEffect(() => {
    if (!isProtocolOwner) { setOwnerDraftMarkets([]); return; }
    const load = () =>
      fetchIndexerJson<{ markets: MarketView[] }>("/api/markets/drafts").then((r) => {
        if (r?.markets) setOwnerDraftMarkets(r.markets.sort((a, b) => b.id - a.id));
      }).catch(() => {});
    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, [isProtocolOwner]);

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
          !market.isDraft &&
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
        const marketRiskFlags = marketRiskFlagsFor(market);
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
            <span className="mobile-market-question">{market.question}</span>
            <span className="mobile-market-info">
              {statusLabel === "Live" ? countdownText(market.closeTime, currentTime) : statusLabel}
              {" · "}{formatMarketAmount(totalPool, market)} {marketSymbolLabel}
            </span>
            <span
              className="mobile-market-yes"
              style={{ "--yes-pct": `${Math.round(yesPercent)}%` } as React.CSSProperties}
            >
              <b>{Math.round(yesPercent)}%</b>
              <small>YES</small>
              <i className="mobile-yes-bar" />
            </span>
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
            {marketRiskFlags.length > 0 && (
              <div className="compact-risk-row">
                {marketRiskFlags.slice(0, 2).map((flag) => (
                  <span className={`market-risk-pill risk-${flag.severity}`} key={`${market.id}-${flag.label}-${flag.detail}`}>
                    {flag.label}
                  </span>
                ))}
              </div>
            )}
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
      !selectedMarket.isDraft &&
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
    const selectedMarketRiskFlags = marketRiskFlagsFor(selectedMarket);
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
    const chartYForPercent = (value: number) => CHART_BOTTOM - (clampChartValue(value, 0, 100) / 100) * CHART_HEIGHT;
    const chartYesPath = smoothPathFromPoints(chartRows.map((point) => ({ x: point.x, y: chartYForPercent(point.yesPercent) })));
    const chartNoPath = smoothPathFromPoints(chartRows.map((point) => ({ x: point.x, y: chartYForPercent(point.noPercent) })));
    const chartYTicks = [100, 75, 50, 25, 0].map((value) => ({
      value,
      y: chartYForPercent(value),
      label: formatChartPercent(value)
    }));
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
        yesY: chartYForPercent(yesPercent),
        noY: chartYForPercent(noPercent)
      };
    })();
    const chartFocusPoint = chartHoverPoint || chartLastPoint;
    const chartTooltipLeft = chartFocusPoint ? Math.min(88, Math.max(12, chartFocusPoint.x)) : 0;
    const chartTooltipSide = chartFocusPoint && chartFocusPoint.x > 68 ? "left" : "right";
    const chartFocusYesY = chartFocusPoint ? chartYForPercent(chartFocusPoint.yesPercent) : CHART_BOTTOM;
    const chartFocusNoY = chartFocusPoint ? chartYForPercent(chartFocusPoint.noPercent) : CHART_BOTTOM;
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
    const selectedCommentRows = marketComments[String(selectedMarket.id)] || [];
    const selectedReportRows = marketReports[String(selectedMarket.id)] || [];
    const selectedOpenReportRows = selectedReportRows.filter((report) => report.status === "open");
    const hasWalletAccess = Boolean(account);
    const aiResolutionReport = aiResolutionReports[selectedMarket.id];
    const aiResolutionReceipt = aiResolutionReceipts[String(selectedMarket.id)];
    const selectedAiInsight = aiMarketInsights[String(selectedMarket.id)];
    const selectedPublicReceipt = publicOracleReceipts[String(selectedMarket.id)];
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
    const selectedOracleSafetyIssue = oracleSafetyIssueFor(oracleProposal, selectedMarket);
    const oracleSuggestionBlockedByPool =
      (oracleSuggestedOutcome === Outcome.Yes && !canProposeYes) ||
      (oracleSuggestedOutcome === Outcome.No && !canProposeNo);
    const oracleSuggestionBlockedByIntegrity = Boolean(selectedOracleSafetyIssue);
    const selectedMarketAuditFlags = selectedOracleSafetyIssue
      ? [
          ...selectedMarketRiskFlags,
          {
            label: "Oracle safety",
            detail: selectedOracleSafetyIssue,
            severity: "bad" as const
          }
        ]
      : selectedMarketRiskFlags;
    const selectedSettlementAudit = settlementAuditFor(selectedMarket);
    const selectedFinalizeBlocked = selectedSettlementAudit.blocksFinalize;
    const finalYesBlockedByIntegrity = Boolean(selectedOracleSafetyIssue && oracleSuggestedOutcome === Outcome.Yes);
    const finalNoBlockedByIntegrity = Boolean(selectedOracleSafetyIssue && oracleSuggestedOutcome === Outcome.No);
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
            selectedOracleSafetyIssue ? `Safety guard: ${selectedOracleSafetyIssue}` : "",
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
    const selectedOwnerReviewReason =
      canReviewAsOwner && (selectedMarket.disputed || Boolean(selectedMarket.authorityReviewRequired))
        ? ownerReviewReasonFor(selectedMarket)
        : "";
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
        : selectedFinalizeBlocked
        ? `Finalize is blocked by preflight: ${selectedSettlementAudit.detail}`
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
    const aiInsightEdgeLabel = selectedAiInsight
      ? selectedAiInsight.edgeSide === "balanced"
        ? "Balanced"
        : `${selectedAiInsight.edgeSide} ${Math.abs(selectedAiInsight.edge).toFixed(1)} pt edge`
      : "Loading";
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
    const selectedEvidenceDraft = evidenceDrafts[selectedMarket.id] || { title: "", url: "", notes: "" };
    const selectedReportDraft = reportDrafts[selectedMarket.id] || { reason: "", url: "" };
    const sourceLinks = [selectedRuleSource, selectedRuleFallback]
      .filter((url, index, rows) => url && rows.indexOf(url) === index)
      .slice(0, 3);
    const overviewDescription =
      selectedAiInsight?.summary ||
      `This market tracks whether ${selectedMarket.question.replace(/\?+$/g, "")}. The resolution below defines the source, timestamp, and outcome conditions.`;
    const detailTabs: Array<{ key: MarketDetailTab; label: string; count?: number }> = [
      { key: "overview", label: "Overview" },
      { key: "comments", label: "Comments", count: selectedCommentRows.length + selectedEvidenceRows.length + selectedReportRows.length },
      { key: "activity", label: "Activity", count: selectedMarketActivities.length },
      { key: "holders", label: "Top Holders", count: topTraderRows.length }
    ];
    const activeMobileMarketTab = !hasWalletAccess && mobileMarketTab === "resolve" ? "overview" : mobileMarketTab;
    const mobileDetailTabs: Array<{ key: MobileMarketTab; label: string; detail: string; count?: number }> = [
      {
        key: "overview",
        label: "Market",
        detail: `${selectedMarketYesPercent >= selectedMarketNoPercent ? "YES" : "NO"} ${Math.max(selectedMarketYesPercent, selectedMarketNoPercent).toFixed(0)}%`
      },
      {
        key: "trade",
        label: hasWalletAccess ? "Trade" : "Join",
        detail: hasWalletAccess
          ? `${formatMarketAmount(selectedMarketBalance, selectedMarket)} ${marketSymbol(selectedMarket)}`
          : "Connect"
      },
      ...(hasWalletAccess
        ? [
            {
              key: "resolve" as const,
              label: "Resolve",
              detail: settlementStage,
              count: selectedMarketAuditFlags.length || undefined
            }
          ]
        : []),
      {
        key: "details",
        label: "Info",
        detail: `${selectedMarketActivities.length} trades`
      }
    ];
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
      <section className="market-detail-view" data-mobile-tab={activeMobileMarketTab}>
        {selectedMarket.isDraft && (
          <div className="draft-market-notice">
            <div>
              <strong>Pending owner approval</strong>
              <span>This market is in draft state. Betting is disabled until the owner approves it.</span>
            </div>
            {isProtocolOwner && (
              <div className="draft-market-actions">
                <button
                  className="secondary"
                  disabled={transactionPending}
                  onClick={() => void approveDraftMarket(selectedMarket.id)}
                  type="button"
                >
                  Approve
                </button>
                <button
                  className="secondary"
                  disabled={transactionPending}
                  onClick={() => void rejectDraftMarket(selectedMarket.id)}
                  type="button"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )}
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

          {/* Mobile compact odds strip */}
          <div className="mobile-odds-strip">
            <button
              className={`mobile-odds-yes${activeMobileMarketTab === "trade" && selectedTradeSides[selectedMarket.id] !== Outcome.No ? " active" : ""}`}
              onClick={() => {
                setSelectedTradeSides((cur) => ({ ...cur, [selectedMarket.id]: Outcome.Yes }));
                setMobileMarketTab("trade");
              }}
              type="button"
            >
              <span>YES</span>
              <strong>{selectedMarketYesPercent.toFixed(0)}%</strong>
            </button>
            <div className="mobile-odds-bar">
              <div className="mobile-odds-bar-yes" style={{ width: `${selectedMarketYesPercent}%` }} />
            </div>
            <button
              className={`mobile-odds-no${activeMobileMarketTab === "trade" && selectedTradeSides[selectedMarket.id] === Outcome.No ? " active" : ""}`}
              onClick={() => {
                setSelectedTradeSides((cur) => ({ ...cur, [selectedMarket.id]: Outcome.No }));
                setMobileMarketTab("trade");
              }}
              type="button"
            >
              <strong>{selectedMarketNoPercent.toFixed(0)}%</strong>
              <span>NO</span>
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

        <nav className="mobile-market-tabs-bottom" aria-label="Market sections">
          {mobileDetailTabs.map((tab) => (
            <button
              aria-current={activeMobileMarketTab === tab.key ? "page" : undefined}
              className={activeMobileMarketTab === tab.key ? "active" : ""}
              key={tab.key}
              onClick={() => setMobileMarketTab(tab.key)}
              type="button"
            >
              <MobileMarketTabIcon tabKey={tab.key} />
              <span>
                {tab.label}
                {typeof tab.count === "number" && <b>{tab.count}</b>}
              </span>
            </button>
          ))}
        </nav>

        {selectedMarketAuditFlags.length > 0 && (
          <section className="market-risk-panel">
            <div>
              <span className="section-label">Market risk checks</span>
              <strong>{selectedMarketAuditFlags.some((flag) => flag.severity === "bad") ? "Review before action" : "Checks available"}</strong>
            </div>
            <div className="market-risk-strip">
              {selectedMarketAuditFlags.map((flag) => (
                <span className={`market-risk-pill risk-${flag.severity}`} key={`${flag.label}-${flag.detail}`}>
                  <strong>{flag.label}</strong>
                  {flag.detail}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="detail-body-grid" data-mobile-tab={activeMobileMarketTab}>
          <div className="detail-primary-column">
          <section className="detail-chart-card mobile-tab-overview">
            <div className="detail-chart-header">
              <div className="detail-chart-title">
                <span className="section-label">Odds movement</span>
                <h2>
                  <b>{chartPrimaryPercent.toFixed(0)}%</b>
                  <span>{chartPrimaryLabel} chance</span>
                </h2>
                <div className="chart-inline-legend" aria-label="Current YES and NO odds">
                  <span className="yes">YES {selectedMarketYesPercent.toFixed(1)}%</span>
                  <span className="no">NO {selectedMarketNoPercent.toFixed(1)}%</span>
                </div>
              </div>
              <div className="chart-header-actions">
                <div className="chart-window-tabs">
                  {CHART_WINDOWS.map((windowOption) => (
                    <button
                      aria-pressed={detailChartWindow === windowOption.value}
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
                  Focus {chartOppositeLabel}
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
                <path
                  className={`detail-yes-line ${selectedChartSide === Outcome.Yes ? "is-focused" : "is-muted"}`}
                  d={chartYesPath}
                />
                <path
                  className={`detail-no-line ${selectedChartSide === Outcome.No ? "is-focused" : "is-muted"}`}
                  d={chartNoPath}
                />
                {chartLastPoint && (
                  <>
                    <circle className="chart-end-dot yes" cx={chartLastPoint.x} cy={chartYForPercent(chartLastPoint.yesPercent)} r="1.2" />
                    <circle className="chart-end-dot no" cx={chartLastPoint.x} cy={chartYForPercent(chartLastPoint.noPercent)} r="1.2" />
                  </>
                )}
              </svg>
              {chartFocusPoint && (
                <>
                  <span className={`chart-crosshair ${chartPointerActive ? "is-active" : "is-idle"}`} style={{ left: `${chartFocusPoint.x}%` }} />
                  <span
                    className={`chart-hover-dot yes ${chartPointerActive ? "is-active" : "is-idle"}`}
                    style={{ left: `${chartFocusPoint.x}%`, top: `${(chartFocusYesY / 58) * 100}%` }}
                  />
                  <span
                    className={`chart-hover-dot no ${chartPointerActive ? "is-active" : "is-idle"}`}
                    style={{ left: `${chartFocusPoint.x}%`, top: `${(chartFocusNoY / 58) * 100}%` }}
                  />
                  {chartPointerActive && (
                    <div
                      className={`chart-tooltip chart-unified-tooltip is-${chartTooltipSide}`}
                      style={{ left: `${chartTooltipLeft}%` }}
                    >
                      <span className="chart-unified-time">{chartTimeLabel(chartFocusPoint.timestamp, true)}</span>
                      <div className="chart-unified-row">
                        <span className="chart-unified-dot yes" />
                        <span className="chart-unified-label">YES</span>
                        <strong className="tooltip-yes">{chartFocusPoint.yesPercent.toFixed(1)}%</strong>
                      </div>
                      <div className="chart-unified-row">
                        <span className="chart-unified-dot no" />
                        <span className="chart-unified-label">NO</span>
                        <strong className="tooltip-no">{chartFocusPoint.noPercent.toFixed(1)}%</strong>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="chart-y-labels" aria-hidden="true">
                {chartYTicks.map((tick) => (
                  <span key={`${tick.y}-${tick.label}`} style={{ top: `${(tick.y / 58) * 100}%` }}>
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="chart-time-row">
                {detailChartTicks.map((tick, index) => (
                  <span
                    className={index === 0 ? "is-first" : index === detailChartTicks.length - 1 ? "is-last" : ""}
                    key={`${tick.x}-${tick.label}`}
                    style={{ left: `${tick.x}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
            </div>
          </section>

          {hasWalletAccess && (
            <section id="market-resolution-zone" className="resolution-zone mobile-tab-resolve">
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
                  {selectedOwnerReviewReason && (
                    <article>
                      <span>Owner review reason</span>
                      <strong>{selectedMarket.disputed ? "Formal dispute" : "Authority flag"}</strong>
                      <small>{selectedOwnerReviewReason}</small>
                    </article>
                  )}
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
                    <strong>{durationText(selectedProposalGraceSeconds)} - cancel after {closeDate(selectedProposalGraceDeadline)}</strong>
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
                            disabled={resolutionActionBusy || oracleSuggestionBlockedByPool || oracleSuggestionBlockedByIntegrity}
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
                      <button className="secondary action-use-ai" disabled={resolutionActionBusy || selectedFinalizeBlocked} onClick={() => finalizeMarket(selectedMarket.id)}>
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
                            <button className="secondary action-propose-yes" disabled={resolutionActionBusy || finalYesBlockedByIntegrity} onClick={() => finalizeDispute(selectedMarket.id, Outcome.Yes)}>
                              Final YES
                            </button>
                            <button className="secondary action-propose-no" disabled={resolutionActionBusy || finalNoBlockedByIntegrity} onClick={() => finalizeDispute(selectedMarket.id, Outcome.No)}>
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
                        Oracle suggests {oracleDecisionLabel}.{" "}
                        {selectedOracleSafetyIssue
                          ? `Safety guard blocked this proposal: ${selectedOracleSafetyIssue}`
                          : oracleProposal.summary || "Use Oracle only when the adapter matches the market rule."}
                      </small>
                    )}
                    {finalizeHint && <small>{finalizeHint}</small>}
                    {selectedFinalizeBlocked && <small>Preflight blocked finalize: {selectedSettlementAudit.detail}</small>}
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
            <aside className="detail-trade-card mobile-tab-trade">
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
            <div className="trade-fund-row">
              <FundOnArcActions compact targetSymbol={marketSymbol(selectedMarket)} onUnifiedBalance={openUnifiedBalanceModal} />
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
            {isProtocolOwner && !selectedMarket.isDraft && selectedMarket.outcome === Outcome.Unresolved && (
              <button
                className="owner-cancel-market-btn"
                disabled={transactionPending}
                onClick={() => void cancelLiveMarket(selectedMarket.id)}
                type="button"
              >
                Cancel market
              </button>
            )}
          </aside>
          ) : (
            <aside className="detail-public-card mobile-tab-trade">
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
              <button onClick={openWalletModal} disabled={connecting || isReconnecting} type="button">
                {connecting || isReconnecting ? "Connecting..." : "Sign in"}
              </button>
            </aside>
          )}
        </section>

        <section className="market-detail-tab-card mobile-tab-details">
          <div className="market-detail-tabs" role="tablist" aria-label="Market detail sections">
            {detailTabs.map((tab) => (
              <button
                aria-selected={marketDetailTab === tab.key}
                className={marketDetailTab === tab.key ? "active" : ""}
                key={tab.key}
                onClick={() => setMarketDetailTab(tab.key)}
                role="tab"
                type="button"
              >
                {tab.label}
                {typeof tab.count === "number" && <span>{tab.count}</span>}
              </button>
            ))}
          </div>

          {marketDetailTab === "overview" && (
            <div className="market-tab-panel">
              <article className="market-overview-card">
                <p className="market-overview-lede">{overviewDescription}</p>
                <div className="overview-resolution-box">
                  <div>
                    <span className="section-label">Resolution</span>
                    <strong>{selectedHumanRule || "This market resolves using the stated source rule and onchain settlement flow."}</strong>
                  </div>
                  <div className="overview-source-row">
                    {sourceLinks.length > 0 ? (
                      sourceLinks.map((url) => (
                        <a href={url} key={url} target="_blank" rel="noreferrer">
                          {urlHostLabel(url)}
                        </a>
                      ))
                    ) : (
                      <span>No public source link saved yet.</span>
                    )}
                  </div>
                </div>
                <div className="overview-signal-grid">
                  <article>
                    <span>Aura AI Insight</span>
                    <strong>{aiInsightEdgeLabel}</strong>
                    <small>
                      Market YES {selectedAiInsight ? selectedAiInsight.marketYesPrice.toFixed(1) : selectedMarketYesPercent.toFixed(1)}%
                      {selectedAiInsight ? ` / AI ${selectedAiInsight.estimatedYesProbability}%` : ""}
                    </small>
                  </article>
                  <article>
                    <span>Public oracle receipt</span>
                    <strong>{selectedPublicReceipt?.status ? selectedPublicReceipt.status.replace(/_/g, " ") : "No receipt yet"}</strong>
                    <small>
                      {selectedPublicReceipt?.oracle
                        ? `${selectedPublicReceipt.oracle.outcome} ${selectedPublicReceipt.oracle.confidence}%`
                        : "Oracle receipt appears after a check or proposal."}
                    </small>
                    <button className="secondary" onClick={() => copyTextToClipboard(`${INDEXER_URL}/api/oracle-receipts/${selectedMarket.id}`, "Public receipt API copied.")} type="button">
                      Copy receipt API
                    </button>
                  </article>
                  <article>
                    <span>Settlement state</span>
                    <strong>{settlementStage}</strong>
                    <small>{finalDecisionDetail}</small>
                  </article>
                </div>
              </article>

              {hasWalletAccess ? (
                <details className="market-advanced-drawer">
                  <summary>
                    <span>AI / Oracle review details</span>
                    <strong>{displayedAgentConfidence}% confidence</strong>
                  </summary>
                  <div className="market-intelligence-grid">
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
                          <span className="agent-confidence">{aiResolutionReceipt.consensus?.confidence ?? 0}% confidence</span>
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
                      </section>
                    )}
                  </div>
                </details>
              ) : (
                <section className="locked-market-tools">
                  <strong>Wallet required for market tools</strong>
                  <span>Aura Agent, copy trading, and resolver tools are available after wallet connection.</span>
                </section>
              )}
            </div>
          )}

          {marketDetailTab === "comments" && (
            <div className="market-tab-panel market-comments-grid">
              <section className="market-discussion-card">
                <div className="panel-heading">
                  <div>
                    <span className="section-label">Comments</span>
                    <h3>Market discussion</h3>
                  </div>
                  <span>{selectedCommentRows.length} posts</span>
                </div>
                <div className="comment-composer">
                  <textarea
                    aria-label="Add market comment"
                    disabled={!hasWalletAccess}
                    placeholder={hasWalletAccess ? "Add a short market comment..." : "Connect wallet to comment"}
                    value={commentInputs[selectedMarket.id] || ""}
                    onChange={(event) =>
                      setCommentInputs((current) => ({ ...current, [selectedMarket.id]: event.target.value }))
                    }
                  />
                  <button disabled={!hasWalletAccess} onClick={() => postMarketComment(selectedMarket.id)} type="button">
                    Post comment
                  </button>
                </div>
                <div className="comment-list">
                  {selectedCommentRows.length === 0 && <span>No comments yet.</span>}
                  {selectedCommentRows.map((comment) => (
                    <article key={comment.id}>
                      <div>
                        <strong>{displayNameForAddress(comment.author)}</strong>
                        <small>{isoDateLabel(comment.createdAt)}</small>
                      </div>
                      <p>{comment.text}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="market-discussion-card">
                <div className="panel-heading">
                  <div>
                    <span className="section-label">Evidence</span>
                    <h3>Source links</h3>
                  </div>
                  <span>{selectedEvidenceRows.length} links</span>
                </div>
                <div className="evidence-composer">
                  <input
                    disabled={!hasWalletAccess}
                    placeholder="Source title"
                    value={selectedEvidenceDraft.title}
                    onChange={(event) =>
                      setEvidenceDrafts((current) => ({
                        ...current,
                        [selectedMarket.id]: { ...(current[selectedMarket.id] || { title: "", url: "", notes: "" }), title: event.target.value }
                      }))
                    }
                  />
                  <input
                    disabled={!hasWalletAccess}
                    placeholder="https://source.example"
                    value={selectedEvidenceDraft.url}
                    onChange={(event) =>
                      setEvidenceDrafts((current) => ({
                        ...current,
                        [selectedMarket.id]: { ...(current[selectedMarket.id] || { title: "", url: "", notes: "" }), url: event.target.value }
                      }))
                    }
                  />
                  <textarea
                    disabled={!hasWalletAccess}
                    placeholder={hasWalletAccess ? "Why this source matters..." : "Connect wallet to save evidence"}
                    value={selectedEvidenceDraft.notes}
                    onChange={(event) =>
                      setEvidenceDrafts((current) => ({
                        ...current,
                        [selectedMarket.id]: { ...(current[selectedMarket.id] || { title: "", url: "", notes: "" }), notes: event.target.value }
                      }))
                    }
                  />
                  <button disabled={!hasWalletAccess} onClick={() => saveMarketEvidence(selectedMarket.id)} type="button">
                    Save evidence
                  </button>
                </div>
                <div className="evidence-list">
                  {selectedEvidenceRows.length === 0 && <span>No evidence saved yet.</span>}
                  {selectedEvidenceRows.map((item) => (
                    <article key={item.id}>
                      <div>
                        <strong>{item.title || "Evidence"}</strong>
                        <small>{item.addedBy ? `${displayNameForAddress(item.addedBy)} / ` : ""}{isoDateLabel(item.createdAt)}</small>
                      </div>
                      {item.notes && <p>{item.notes}</p>}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {urlHostLabel(item.url)}
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              </section>

              <section className="market-discussion-card market-report-card">
                <div className="panel-heading">
                  <div>
                    <span className="section-label">Report market</span>
                    <h3>Issue queue</h3>
                  </div>
                  <span>{selectedOpenReportRows.length} open</span>
                </div>
                {selectedOpenReportRows.length > 0 && (
                  <div className="market-report-warning">
                    This market has open user reports. Review source, rule, and timing before adding more stake.
                  </div>
                )}
                <div className="evidence-composer">
                  <textarea
                    disabled={!hasWalletAccess}
                    placeholder={hasWalletAccess ? "Explain what is wrong: bad date, wrong source, invalid team, ambiguous rule..." : "Connect wallet to report"}
                    value={selectedReportDraft.reason}
                    onChange={(event) =>
                      setReportDrafts((current) => ({
                        ...current,
                        [selectedMarket.id]: { ...(current[selectedMarket.id] || { reason: "", url: "" }), reason: event.target.value }
                      }))
                    }
                  />
                  <input
                    disabled={!hasWalletAccess}
                    placeholder="Optional source link"
                    value={selectedReportDraft.url}
                    onChange={(event) =>
                      setReportDrafts((current) => ({
                        ...current,
                        [selectedMarket.id]: { ...(current[selectedMarket.id] || { reason: "", url: "" }), url: event.target.value }
                      }))
                    }
                  />
                  <button disabled={!hasWalletAccess} onClick={() => reportMarketIssue(selectedMarket.id)} type="button">
                    Send report
                  </button>
                </div>
                <div className="evidence-list">
                  {selectedReportRows.length === 0 && <span>No reports for this market.</span>}
                  {selectedReportRows.map((report) => (
                    <article key={report.id}>
                      <div>
                        <strong>{report.status === "open" ? "Open report" : report.status}</strong>
                        <small>{displayNameForAddress(report.reporter)} / {isoDateLabel(report.createdAt)}</small>
                      </div>
                      <p>{report.reason}</p>
                      {report.url && (
                        <a href={report.url} target="_blank" rel="noreferrer">
                          {urlHostLabel(report.url)}
                        </a>
                      )}
                      {report.ownerNote && (
                        <small>
                          Owner note: {report.ownerNote}
                          {report.resolvedAt ? ` / ${isoDateLabel(report.resolvedAt)}` : ""}
                        </small>
                      )}
                      {canReviewAsOwner && report.status === "open" && (
                        <div className="market-report-actions">
                          <button
                            className="secondary"
                            onClick={() => reviewMarketReport(selectedMarket.id, report.id, "resolved", "Owner reviewed and accepted the follow-up.")}
                            type="button"
                          >
                            Mark resolved
                          </button>
                          <button
                            className="secondary"
                            onClick={() => reviewMarketReport(selectedMarket.id, report.id, "flagged", "Owner kept this report flagged for settlement review.")}
                            type="button"
                          >
                            Keep flagged
                          </button>
                          <button
                            className="secondary"
                            onClick={() => reviewMarketReport(selectedMarket.id, report.id, "dismissed", "Owner dismissed this report after review.")}
                            type="button"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}

          {marketDetailTab === "holders" && (
            <div className="market-tab-panel">
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
                      <button className="secondary" disabled={!hasWalletAccess} onClick={() => copyTraderPosition(trader)} type="button">
                        Copy
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </section>

        {marketDetailTab === "activity" && (
          <>
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
              <span>{step.active ? "OK" : index + 1}</span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
          ))}
          </section>
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
          </>
        )}

        {hasWalletAccess && marketDetailTab === "overview" && relatedMarkets.length > 0 && (
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

  const unifiedBalanceSelectedSource =
    UNIFIED_BALANCE_SOURCE_CHAINS.find((item) => item.value === unifiedBalanceSourceChain) || UNIFIED_BALANCE_SOURCE_CHAINS[0];
  const unifiedBalanceAmountReady = parseUsdcInput(unifiedBalanceAmount, 6) > 0n;
  const unifiedBalanceSourceBalance = unifiedBalanceSummary?.breakdown.find((entry) => entry.chain === unifiedBalanceSourceChain);
  const unifiedBalanceArcBalance = unifiedBalanceSummary?.breakdown.find((entry) => entry.chain === "Arc_Testnet");
  const unifiedBalanceSourceWalletBalance = unifiedBalanceWalletBalances.find((entry) => entry.chain === unifiedBalanceSourceChain);
  const unifiedBalanceArcWalletBalance = unifiedBalanceWalletBalances.find((entry) => entry.chain === "Arc_Testnet");
  const unifiedBalanceOtherWalletBalances = unifiedBalanceWalletBalances.filter((entry) => entry.chain !== "Arc_Testnet");
  const unifiedBalanceBusyText =
    unifiedBalanceBusy === "balances"
      ? "Refreshing..."
      : unifiedBalanceBusy === "estimate"
      ? "Estimating..."
      : unifiedBalanceBusy === "deposit"
      ? "Depositing..."
      : unifiedBalanceBusy === "spend"
      ? "Spending..."
      : unifiedBalanceBusy === "deposit-spend"
      ? "Funding..."
      : "";
  type WalletPickerRow = {
    key: string;
    name: string;
    icon: string;
    iconSrc?: string;
    tag: string;
    tagTone: "success" | "info" | "muted";
    detail: string;
    disabled: boolean;
    onClick: () => void | Promise<void>;
  };
  const walletProviderFor = (aliases: string[]) =>
    walletOptions.find((wallet) => {
      const haystack = `${wallet.info.name || ""} ${wallet.info.rdns || ""}`.toLowerCase();
      return aliases.some((alias) => haystack.includes(alias));
    });
  const providerWalletRows = [
    {
      key: "metamask",
      name: "MetaMask",
      icon: "MM",
      aliases: ["metamask", "io.metamask"],
      fallbackUrl: WALLET_DEEP_LINKS.find((wallet) => wallet.name === "MetaMask")?.url
    },
    {
      key: "okx",
      name: "OKX Wallet",
      icon: "OKX",
      aliases: ["okx", "com.okex.wallet"],
      fallbackUrl: WALLET_DEEP_LINKS.find((wallet) => wallet.name === "OKX Wallet")?.url
    },
    {
      key: "bitget",
      name: "Bitget Wallet",
      icon: "BG",
      aliases: ["bitget", "bitkeep"],
      fallbackUrl: WALLET_DEEP_LINKS.find((wallet) => wallet.name === "Bitget Wallet")?.url
    },
    {
      key: "base",
      name: "Base (Coinbase Wallet)",
      icon: "B",
      aliases: ["base", "coinbase", "coinbase wallet"],
      fallbackUrl: WALLET_DEEP_LINKS.find((wallet) => wallet.name === "Base")?.url
    },
    {
      key: "coinbase",
      name: "Coinbase",
      icon: "CB",
      aliases: ["coinbase", "coinbase wallet"],
      fallbackUrl: WALLET_DEEP_LINKS.find((wallet) => wallet.name === "Coinbase")?.url
    }
  ];
  const quickWalletRows: WalletPickerRow[] = [
    {
      key: "walletconnect",
      name: "WalletConnect",
      icon: "WC",
      tag: walletConnectReady ? "QR CODE" : "SETUP",
      tagTone: walletConnectReady ? "info" : "muted",
      detail: walletConnectReady ? "Scan from a mobile wallet" : "Add VITE_WALLETCONNECT_PROJECT_ID",
      disabled: connecting || !walletConnectReady,
      onClick: handleWalletConnect
    },
    ...providerWalletRows.map((wallet): WalletPickerRow => {
    const detected = walletProviderFor(wallet.aliases || []);
    return {
      key: wallet.key,
      name: wallet.name,
      icon: wallet.icon,
      iconSrc: detected?.info.icon,
      tag: detected ? "INSTALLED" : "OPEN",
      tagTone: detected ? "success" : "muted",
      detail: detected ? "Detected in this browser" : "Open wallet app or install",
      disabled: connecting || (!detected && !wallet.fallbackUrl),
      onClick: () => (detected ? handleConnectWallet(detected.provider) : wallet.fallbackUrl ? openMobileWallet(wallet.fallbackUrl) : undefined)
    };
    })
  ];
  const extraDetectedWallets = walletOptions.filter((wallet) => {
    const haystack = `${wallet.info.name || ""} ${wallet.info.rdns || ""}`.toLowerCase();
    return !["metamask", "okx", "bitget", "bitkeep", "base", "coinbase"].some((alias) => haystack.includes(alias));
  });

  return (
    <main className={`app-shell${view === "market" && selectedMarketId !== null ? " has-market-detail" : ""}`} id="top">
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
              className={view === "assistant" ? "tab active" : "tab"}
              onClick={() => {
                setSelectedMarketId(null);
                setSelectedProfileAddress("");
                updateMarketRoute(null);
                setView("assistant");
              }}
            >
              Aura AI
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
                {draftMarkets.length > 0 && <span className="nav-badge">{draftMarkets.length}</span>}
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
                    {(claimNotifications.length > 1 || claimRetryMarketIds.length > 0) && (
                      <div className="notification-bulk-actions">
                        {claimNotifications.length > 1 && (
                          <button onClick={() => claimAll()} disabled={transactionPending} type="button">
                            Claim all {claimableTotalLabel}
                          </button>
                        )}
                        {claimRetryMarketIds.length > 0 && (
                          <button
                            className="secondary"
                            onClick={() => claimAll(claimRetryMarketIds)}
                            disabled={transactionPending}
                            type="button"
                          >
                            {claimRetryLabel}
                          </button>
                        )}
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
                            : `Proposed ${outcomeLabel(market.proposedOutcome)}. ${ownerReviewReasonFor(market)}`}
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
                    <FundOnArcActions compact targetSymbol={defaultSettlementSymbol} onUnifiedBalance={openUnifiedBalanceModal} />
                    <button onClick={openProfile}>View Profile</button>
                    <button
                      className="wallet-security-btn"
                      onClick={() => {
                        setWalletMenuOpen(false);
                        setSelectedMarketId(null);
                        setSelectedProfileAddress("");
                        updateMarketRoute(null);
                        setView("security");
                      }}
                    >
                      Security &amp; audit
                    </button>
                    <button onClick={handleDisconnect}>Disconnect</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button onClick={openWalletModal} disabled={connecting || isReconnecting}>
                {connecting || isReconnecting ? "Connecting..." : "Sign in"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setEmailLoginOpen(true)}
                disabled={connecting || isReconnecting}
              >
                Email login
              </button>
            </>
          )}
        </div>
      </nav>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          aria-current={view === "markets" || view === "collection" || view === "market" ? "page" : undefined}
          className={view === "markets" || view === "collection" || view === "market" ? "active" : ""}
          onClick={goHomeTop}
          type="button"
        >
          <MobileNavIcon icon="markets" />
          <span>Markets</span>
        </button>
        <button
          aria-current={view === "leaderboard" ? "page" : undefined}
          className={view === "leaderboard" ? "active" : ""}
          onClick={() => {
            setSelectedMarketId(null);
            setSelectedProfileAddress("");
            updateMarketRoute(null);
            setView("leaderboard");
          }}
          type="button"
        >
          <MobileNavIcon icon="leaderboard" />
          <span>Leaderboard</span>
        </button>
        <button
          aria-current={view === "assistant" ? "page" : undefined}
          className={`mobile-nav-cta${view === "assistant" ? " active" : ""}`}
          onClick={() => {
            setSelectedMarketId(null);
            setSelectedProfileAddress("");
            updateMarketRoute(null);
            setView("assistant");
          }}
          type="button"
        >
          <MobileNavIcon icon="assistant" />
          <span>Ask Aura</span>
        </button>
        <button
          aria-current={view === "notifications" ? "page" : undefined}
          className={view === "notifications" ? "active" : ""}
          onClick={account ? openNotifications : openWalletModal}
          type="button"
        >
          <MobileNavIcon icon="alerts" />
          <span>Alerts</span>
          {notificationCount > 0 && <b>{notificationCount}</b>}
        </button>
        <button
          aria-current={view === "profile" ? "page" : undefined}
          className={view === "profile" ? "active" : ""}
          onClick={account ? openProfile : openWalletModal}
          type="button"
        >
          <MobileNavIcon icon="profile" />
          <span>Profile</span>
        </button>
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
        <div className="mobile-market-header">
          <div className="mobile-market-header-top">
            <h2>Prediction <span>Markets</span></h2>
            <span className="mobile-live-pill">{liveMarkets} live</span>
          </div>
          <div className="mobile-stats-strip">
            <div className="mobile-stat-chip">
              <span>Volume</span>
              <strong>{totalVolumeByTokenText}</strong>
            </div>
            <div className="mobile-stat-chip">
              <span>Players</span>
              <strong>{statsSummary.knownPlayers}</strong>
            </div>
            <div className="mobile-stat-chip">
              <span>Markets</span>
              <strong>{statsSummary.totalMarkets}</strong>
            </div>
          </div>
          <button
            className="mobile-launch-btn"
            onClick={account ? openCreateMarket : openWalletModal}
            disabled={connecting}
            type="button"
          >
            🚀 Launch a Market
          </button>
        </div>
      )}

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
              Create YES/NO markets with Aura-assisted evidence review, objective oracle checks, and Circle Agent Wallet proposal support.
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
                          #{market.id} - {market.category || "Other"} - {market.traderCount} traders
                        </small>
                        <strong>{market.question}</strong>
                        <div className="hero-hot-meter" aria-hidden="true">
                          <span style={{ width: `${Math.max(2, Math.min(98, hotYesPercent))}%` }} />
                        </div>
                        <small>
                          YES {hotYesPercent.toFixed(0)}% - {formatMarketAmount(hotVolume, market)} {marketSymbol(market)}
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
              {view === "assistant" && (
                <p>
                  Chat in any language. Aura AI finds markets, drafts bets, checks AI and Oracle results, and claims —
                  but you always approve and sign in your own wallet.
                </p>
              )}
            </div>
            <div
              className={`board-actions ${view === "market" ? "market-detail-board-actions" : ""} ${
                view === "profile" ? "profile-board-actions" : ""
              }`}
            >
              {view === "security" || view === "assistant" ? (
                <button className="secondary" onClick={backToMarkets} type="button">
                  Back to markets
                </button>
              ) : view === "collection" || view === "market" ? (
                <>
                  <button className="secondary" onClick={backToMarkets} type="button">
                    Back to markets
                  </button>
                  <button className="secondary refresh-action" onClick={loadMarkets} disabled={loading || !hasContract}>
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
                  <button className="secondary refresh-action" onClick={loadMarkets} disabled={loading || !hasContract}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                  {view !== "ended" && view !== "leaderboard" && view !== "profile" && <button className="create-market-action" onClick={openCreateMarket}>Create Market</button>}
                  {view !== "leaderboard" && view !== "profile" && hasMoreMarkets && (
                    <button className="secondary" onClick={() => loadMoreMarkets(false)} disabled={loading || !hasContract} type="button">
                      Load more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {view !== "leaderboard" && view !== "profile" && view !== "market" && view !== "security" && view !== "owner" && view !== "assistant" && (
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
                  <h3>{notificationCount} current notifications</h3>
                  <p>Only active wallet actions are shown. Dismissed or handled notices stay hidden on this device.</p>
                </div>
                <div className="notification-head-actions">
                  {claimNotifications.length > 1 && (
                    <button onClick={() => claimAll()} disabled={transactionPending} type="button">
                      Claim all {claimableTotalLabel}
                    </button>
                  )}
                  {claimRetryMarketIds.length > 0 && (
                    <button
                      className="secondary"
                      onClick={() => claimAll(claimRetryMarketIds)}
                      disabled={transactionPending}
                      type="button"
                    >
                      {claimRetryLabel}
                    </button>
                  )}
                </div>
              </div>
              <div className="notification-filter-row" aria-label="Notification filters">
                {notificationFilterOptions.map((option) => (
                  <button
                    className={notificationFilter === option.value ? "active" : ""}
                    key={option.value}
                    onClick={() => setNotificationFilter(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {activeNotificationItems.length === 0 && (
                <div className="empty-state">
                  <strong>No active notifications</strong>
                  <span>Claim, result, dispute, and owner review actions will appear here while they still need attention.</span>
                </div>
              )}
              {visibleNotificationItems.length === 0 && activeNotificationItems.length > 0 && (
                <div className="empty-state">
                  <strong>No notifications in this filter</strong>
                  <span>Choose another type to view current wallet actions.</span>
                </div>
              )}
              {visibleNotificationItems.map((item) => {
                const historyMarketId = item.marketId;
                const market = historyMarketId !== undefined ? markets.find((row) => row.id === historyMarketId) : undefined;
                const activeClaim = item.type === "claim" && market && claimNotifications.some((row) => row.id === market.id);
                const canDismiss =
                  item.type === "proposal" ||
                  item.type === "result" ||
                  item.type === "dispute-resolved" ||
                  item.type === "report" ||
                  item.type === "flag";
                return (
                  <article className="notification-card notification-active-card" key={item.key}>
                    <span>{item.label}</span>
                    <strong>{historyMarketId !== undefined ? `#${historyMarketId} ${item.title}` : item.title}</strong>
                    <small>{item.detail}</small>
                    <div className="notification-actions">
                      {historyMarketId !== undefined && (
                        <button className="secondary" onClick={() => openMarket(historyMarketId, item.type.includes("review") || item.type === "resolve" || item.type === "finalize")} type="button">
                          View market
                        </button>
                      )}
                      {market && activeClaim && (
                        <button onClick={() => claim(market.id)} disabled={transactionPending} type="button">
                          Claim payout
                        </button>
                      )}
                      {canDismiss && (
                        <button className="secondary" onClick={() => dismissNotificationByKey(item.key)} type="button">
                          Dismiss
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
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
                        <div><span>Open reports</span><strong>{ownerUsageMetrics.reports}</strong></div>
                      </div>
                    </article>

                    <article className="owner-panel owner-panel-wide">
                      <div className="panel-heading">
                        <div>
                          <span className="section-label">Market reports</span>
                          <h3>{ownerOpenReports.length} open reports</h3>
                        </div>
                      </div>
                      <div className="oracle-reputation-list">
                        {ownerOpenReports.length === 0 && <span>No open market reports.</span>}
                        {ownerOpenReports.map((report) => {
                          const reportedMarket = markets.find((market) => market.id === report.marketId);
                          return (
                            <article className="owner-report-row" key={report.id}>
                              <button className="similar-market-row" onClick={() => openMarket(report.marketId)} type="button">
                                <strong>#{report.marketId} {shortQuestion(reportedMarket?.question || "Market report")}</strong>
                                <small>{displayNameForAddress(report.reporter)} / {isoDateLabel(report.createdAt)} / {report.reason}</small>
                              </button>
                              <div className="market-report-actions">
                                <button
                                  className="secondary"
                                  onClick={() => openMarket(report.marketId, true)}
                                  type="button"
                                >
                                  Review market
                                </button>
                                <button
                                  className="secondary"
                                  onClick={() => reviewMarketReport(report.marketId, report.id, "resolved", "Owner reviewed and accepted the follow-up.")}
                                  type="button"
                                >
                                  Resolve
                                </button>
                                <button
                                  className="secondary"
                                  onClick={() => reviewMarketReport(report.marketId, report.id, "flagged", "Owner kept this report flagged for settlement review.")}
                                  type="button"
                                >
                                  Flag
                                </button>
                                <button
                                  className="secondary"
                                  onClick={() => reviewMarketReport(report.marketId, report.id, "dismissed", "Owner dismissed this report after review.")}
                                  type="button"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </article>

                    <article className="owner-panel owner-panel-wide">
                      <div className="panel-heading">
                        <div>
                          <span className="section-label">Draft market approvals</span>
                          <h3>{draftMarkets.length} pending</h3>
                        </div>
                      </div>
                      <div className="oracle-reputation-list">
                        {draftMarkets.length === 0 && <span>No draft markets pending approval.</span>}
                        {draftMarkets.map((market) => (
                          <article className="draft-approval-row" key={`draft-${market.id}`}>
                            <button className="draft-approval-info" onClick={() => openMarket(market.id)} type="button">
                              <strong>#{market.id} {shortQuestion(market.question)}</strong>
                              <small>By {displayNameForAddress(market.creator)} · closes {closeDate(market.closeTime)}</small>
                            </button>
                            <div className="draft-approval-actions">
                              <button
                                className="draft-approve-btn"
                                disabled={transactionPending}
                                onClick={() => void approveDraftMarket(market.id)}
                                type="button"
                              >
                                Approve
                              </button>
                              <button
                                className="draft-reject-btn"
                                disabled={transactionPending}
                                onClick={() => void rejectDraftMarket(market.id)}
                                type="button"
                              >
                                Reject
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>

                    <article className="owner-panel owner-panel-wide">
                      <div className="panel-heading">
                        <div>
                          <span className="section-label">Owner action queue</span>
                          <h3>{ownerQueueCount} active checks</h3>
                        </div>
                        <span className="agent-confidence">Realtime after indexer sync</span>
                      </div>
                      <div className="owner-action-grid">
                        <div className="owner-action-column">
                          <span>Needs proposal</span>
                          {ownerPendingProposalQueue.length === 0 && <small>No pending proposal items.</small>}
                          {ownerPendingProposalQueue.map((market) => (
                            <button className="similar-market-row" key={`owner-proposal-${market.id}`} onClick={() => openMarket(market.id, true)} type="button">
                              <strong>#{market.id} {shortQuestion(market.question)}</strong>
                              <small>Resolution time {closeDate(resolutionUnlockTime(market))}</small>
                            </button>
                          ))}
                        </div>
                        <div className="owner-action-column">
                          <span>Ready to finalize</span>
                          {ownerFinalizationQueue.length === 0 && <small>No finalization items.</small>}
                          {ownerFinalizationQueue.map((market) => {
                            const audit = settlementAuditFor(market);
                            return (
                              <button className="similar-market-row" key={`owner-finalize-${market.id}`} onClick={() => openMarket(market.id, true)} type="button">
                                <strong>#{market.id} {shortQuestion(market.question)}</strong>
                                <span className={`settlement-audit-badge audit-${audit.status}`}>{audit.label}</span>
                                <small>{audit.detail}</small>
                                <small>Proposed {outcomeLabel(market.proposedOutcome)} / deadline {closeDate(market.disputeDeadline)}</small>
                              </button>
                            );
                          })}
                        </div>
                        <div className="owner-action-column">
                          <span>Escalated review</span>
                          {ownerEscalatedReviewQueue.length === 0 && <small>No dispute or authority review items.</small>}
                          {ownerEscalatedReviewQueue.map((market) => {
                            const audit = settlementAuditFor(market);
                            return (
                              <button className="similar-market-row" key={`owner-escalated-${market.id}`} onClick={() => openMarket(market.id, true)} type="button">
                                <strong>#{market.id} {shortQuestion(market.question)}</strong>
                                <span className={`settlement-audit-badge audit-${audit.status}`}>{audit.label}</span>
                                <small>{audit.detail || ownerReviewReasonFor(market)}</small>
                              </button>
                            );
                          })}
                        </div>
                        <div className="owner-action-column">
                          <span>Flagged risk</span>
                          {ownerFlaggedRiskMarkets.length === 0 && <small>No market risk badges.</small>}
                          {ownerFlaggedRiskMarkets.map(({ market, flags }) => (
                            <button className="similar-market-row" key={`owner-risk-${market.id}`} onClick={() => openMarket(market.id)} type="button">
                              <strong>#{market.id} {shortQuestion(market.question)}</strong>
                              <small>{flags.slice(0, 2).map((flag) => flag.label).join(" / ")}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    </article>

                    <article className="owner-panel owner-panel-wide source-quality-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="section-label">Source quality dashboard</span>
                          <h3>{ownerSourceQualitySummary.conflict} conflicts / {ownerSourceQualitySummary.review} reviews</h3>
                        </div>
                        <span className="agent-confidence">{ownerSourceQualitySummary.deterministic} deterministic checks</span>
                      </div>
                      <div className="source-quality-metrics">
                        <div className="quality-signal good">
                          <span>Safe to monitor/finalize</span>
                          <strong>{ownerSourceQualitySummary.safe}</strong>
                        </div>
                        <div className="quality-signal warn">
                          <span>Needs review</span>
                          <strong>{ownerSourceQualitySummary.review}</strong>
                        </div>
                        <div className="quality-signal bad">
                          <span>Conflict detected</span>
                          <strong>{ownerSourceQualitySummary.conflict}</strong>
                        </div>
                        <div className={ownerSourceQualitySummary.missingSource > 0 ? "quality-signal warn" : "quality-signal good"}>
                          <span>Missing / weak source</span>
                          <strong>{ownerSourceQualitySummary.missingSource}</strong>
                        </div>
                      </div>
                      <div className="oracle-reputation-list">
                        {ownerSourceQualityQueue.length === 0 && <span>No source-quality issues in unresolved markets.</span>}
                        {ownerSourceQualityQueue.map((row) => (
                          <button className="similar-market-row source-quality-row" key={`source-quality-${row.market.id}`} onClick={() => openMarket(row.market.id, true)} type="button">
                            <strong>#{row.market.id} {shortQuestion(row.market.question)}</strong>
                            <span className={`settlement-audit-badge audit-${row.audit.status}`}>{row.audit.label}</span>
                            <small>
                              {row.deterministicOracle ? "Deterministic oracle available" : "No deterministic oracle yet"} / {row.sourceCount} source rows
                            </small>
                            <small>{row.flags[0]?.label || row.audit.detail}</small>
                          </button>
                        ))}
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

                    <article className="owner-panel owner-panel-wide oracle-reputation-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="section-label">Aura Oracle Agent reputation</span>
                          <h3>{oracleReputation?.tier || "Waiting for indexer"}</h3>
                        </div>
                        <span className="agent-confidence">{oracleReputation ? `${oracleReputation.reputationScore}% score` : "Syncing"}</span>
                      </div>
                      <div className="agent-identity-grid">
                        <div>
                          <span>Agent</span>
                          <strong>{oracleReputation?.agent?.name || "Aura Oracle Agent"}</strong>
                          <small>{oracleReputation?.agent?.network || "Arc Testnet"} / signer {oracleReputation?.agent?.signerMode || "manual"}</small>
                        </div>
                        <div>
                          <span>Public API</span>
                          <strong>{oracleReputation?.agent?.apiBaseUrl ? "Available" : "Waiting"}</strong>
                          <small>{oracleReputation?.agent?.manifestUrl || "/api/agent"}</small>
                        </div>
                        <div>
                          <span>MCP tools</span>
                          <strong>{oracleReputation?.agent?.mcpToolsUrl ? "Published" : "Draft"}</strong>
                          <small>{oracleReputation?.agent?.mcpToolsUrl || "/api/agent/mcp"}</small>
                        </div>
                      </div>
                      <div className="owner-report-grid">
                        <div><span>Coverage</span><strong>{oracleReputation ? `${oracleReputation.coverage}%` : "--"}</strong></div>
                        <div><span>Final-match accuracy</span><strong>{oracleReputation ? `${oracleReputation.accuracy}%` : "--"}</strong></div>
                        <div><span>Reversal rate</span><strong>{oracleReputation ? `${oracleReputation.reversalRate}%` : "--"}</strong></div>
                        <div><span>Oracle confidence</span><strong>{oracleReputation ? `${oracleReputation.avgOracleConfidence}%` : "--"}</strong></div>
                        <div><span>AI confidence</span><strong>{oracleReputation ? `${oracleReputation.avgAiConfidence}%` : "--"}</strong></div>
                        <div><span>Evidence quality</span><strong>{oracleReputation ? `${oracleReputation.evidenceQuality}%` : "--"}</strong></div>
                        <div><span>Oracle proposals</span><strong>{oracleReputation?.oracleProposals ?? "--"}</strong></div>
                        <div><span>AI receipts</span><strong>{oracleReputation?.aiReceipts ?? "--"}</strong></div>
                        <div><span>Auto-proposed</span><strong>{oracleReputation?.autoProposed ?? "--"}</strong></div>
                        <div><span>Authority review</span><strong>{oracleReputation?.authorityReviewMarkets ?? "--"}</strong></div>
                      </div>
                      {oracleReputation?.policy && <p>{oracleReputation.policy}</p>}
                      {oracleReputation?.safeguards && oracleReputation.safeguards.length > 0 && (
                        <div className="agent-safeguard-list">
                          {oracleReputation.safeguards.slice(0, 4).map((item) => (
                            <span key={item}>{item}</span>
                          ))}
                        </div>
                      )}
                      {oracleReputation?.adapters && Object.keys(oracleReputation.adapters).length > 0 && (
                        <div className="adapter-chip-list">
                          {Object.entries(oracleReputation.adapters)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 8)
                            .map(([adapter, count]) => (
                              <span key={adapter}>{adapter}: {count}</span>
                            ))}
                        </div>
                      )}
                      {oracleReputation?.recent && oracleReputation.recent.length > 0 && (
                        <div className="oracle-reputation-list">
                          {oracleReputation.recent.slice(0, 4).map((row) => (
                            <button className="similar-market-row" key={`oracle-reputation-${row.marketId}-${row.generatedAt || row.status}`} onClick={() => openMarket(row.marketId)} type="button">
                              <strong>#{row.marketId} {shortQuestion(row.question)}</strong>
                              <small>{row.adapter || "oracle"} / {row.outcome} / {row.confidence}% confidence / {row.status}</small>
                            </button>
                          ))}
                        </div>
                      )}
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
                <fieldset className="collection-check-filter">
                  <legend>Position</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={collectionParticipationFilter.participated}
                      onChange={(event) => {
                        setCollectionParticipationFilter((current) => ({
                          ...current,
                          participated: event.target.checked
                        }));
                        setCollectionPage(1);
                      }}
                    />
                    <span>Participated</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={collectionParticipationFilter.notParticipated}
                      onChange={(event) => {
                        setCollectionParticipationFilter((current) => ({
                          ...current,
                          notParticipated: event.target.checked
                        }));
                        setCollectionPage(1);
                      }}
                    />
                    <span>Not participated</span>
                  </label>
                </fieldset>
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
                        maxLength={20}
                        placeholder={isOwnProfile ? "username" : profileDisplayName}
                        value={isOwnProfile ? profileNameInput : ""}
                        onChange={(event) => setProfileNameInput(event.target.value)}
                        disabled={!isOwnProfile}
                      />
                      <button type="submit" disabled={!isOwnProfile}>
                        Save
                      </button>
                    </form>
                    {isOwnProfile && <small className="profile-username-help">Unique username, 2-20 chars: a-z, 0-9, underscore.</small>}
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
                    <FundOnArcActions compact targetSymbol={defaultSettlementSymbol} onUnifiedBalance={openUnifiedBalanceModal} />
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
                  {isOwnProfile && (claimNotifications.length > 1 || claimRetryMarketIds.length > 0) && (
                    <div className="notification-head-actions">
                      {claimNotifications.length > 1 && (
                        <button onClick={() => claimAll()} disabled={transactionPending} type="button">
                          Claim all {claimableTotalLabel}
                        </button>
                      )}
                      {claimRetryMarketIds.length > 0 && (
                        <button
                          className="secondary"
                          onClick={() => claimAll(claimRetryMarketIds)}
                          disabled={transactionPending}
                          type="button"
                        >
                          {claimRetryLabel}
                        </button>
                      )}
                    </div>
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
                <article>
                  <span>Creator record</span>
                  <strong>{creatorResolvedMarkets.length}/{createdMarkets}</strong>
                  <small>
                    {formatUsdc(creatorSettledVolume, defaultSettlementDecimals)} {aggregateAssetLabel} settled / {creatorCanceledMarkets} canceled
                  </small>
                </article>
                <article>
                  <span>Resolver record</span>
                  <strong>{resolverFinalizedMarkets}/{resolverProfileMarkets.length}</strong>
                  <small>{resolverDisputedMarkets} dispute or authority reviews</small>
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
                    <div>
                      <h3>Markets participated</h3>
                      <span>
                        {filteredParticipatedProfileMarkets.length} shown / {participatedProfileMarkets.length} total / page {safeProfileHistoryPage} of {profileHistoryPageCount}
                      </span>
                    </div>
                    <div className="profile-history-toolbar">
                      {([
                        ["all", "All"],
                        ["live", "Live"],
                        ["claimable", "Claimable"],
                        ["won", "Won"],
                        ["lost", "Lost"],
                        ["refund", "Refund"]
                      ] as Array<[ProfileHistoryFilter, string]>).map(([key, label]) => (
                        <button
                          className={profileHistoryFilter === key ? "active" : ""}
                          key={key}
                          onClick={() => setProfileHistoryFilter(key)}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                      <button className="secondary" onClick={exportProfileHistoryCsv} type="button">
                        Export CSV
                      </button>
                    </div>
                  </div>
                )}
                {participatedProfileMarkets.length > 0 && filteredParticipatedProfileMarkets.length === 0 && (
                  <div className="empty-state">
                    <strong>No markets match this filter</strong>
                    <span>Try All, Live, Won, Lost, Claimable, or Refund to inspect profile history.</span>
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
                  const totalPosition = market.yesPosition + market.noPosition;
                  const selectedSideLabel =
                    market.yesPosition > 0n && market.noPosition > 0n
                      ? "YES + NO"
                      : market.yesPosition > 0n
                        ? "YES"
                        : market.noPosition > 0n
                          ? "NO"
                          : "No position";
                  const selectedSideClass =
                    market.yesPosition > 0n && market.noPosition === 0n
                      ? "yes"
                      : market.noPosition > 0n && market.yesPosition === 0n
                        ? "no"
                        : "mixed";
                  const finalOutcomeLabel =
                    market.outcome === Outcome.Unresolved ? marketStatus(market) : outcomeLabel(market.outcome);
                  const profilePayoutValue = settlement.settled ? settlement.payout : 0n;
                  const pnlClassName =
                    settlement.pnl > 0n ? "profile-positive" : settlement.pnl < 0n ? "profile-negative" : "profile-neutral";
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
                    <article className={`history-card history-card-${result.className}`} key={market.id}>
                      <div className="history-card-head">
                        <div className="history-card-title">
                          <span className={`category ${meta.className}`}>
                            <CategoryIcon category={market.category || "Other"} />
                            {market.category || "Other"}
                          </span>
                          <h3>{market.question}</h3>
                        </div>
                        <div className={`history-result-badge ${result.className}`}>
                          <span>{isOwnProfile ? "Your result" : "Profile result"}</span>
                          <strong>{result.label}</strong>
                          <small>{settlement.settled ? `${formatSignedUsdc(settlement.pnl, marketDecimals(market))} ${marketSymbol(market)} PnL` : selectedSideLabel}</small>
                        </div>
                      </div>
                      <div className="history-outcome-strip">
                        <div>
                          <span>Side</span>
                          <strong className={`history-side-pill ${selectedSideClass}`}>{selectedSideLabel}</strong>
                        </div>
                        <div>
                          <span>Stake</span>
                          <strong>{formatMarketAmount(totalPosition, market)} {marketSymbol(market)}</strong>
                        </div>
                        <div>
                          <span>Outcome</span>
                          <strong>{finalOutcomeLabel}</strong>
                        </div>
                        <div>
                          <span>Payout</span>
                          <strong>{formatMarketAmount(profilePayoutValue, market)} {marketSymbol(market)}</strong>
                        </div>
                        <div>
                          <span>PNL</span>
                          <strong className={pnlClassName}>{formatSignedUsdc(settlement.pnl, marketDecimals(market))} {marketSymbol(market)}</strong>
                        </div>
                        <div>
                          <span>Claim</span>
                          <strong>{claimStatus}</strong>
                        </div>
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
                          <strong>{finalOutcomeLabel}</strong>
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
                          <strong>{formatMarketAmount(profilePayoutValue, market)} {marketSymbol(market)}</strong>
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
                {filteredParticipatedProfileMarkets.length > PROFILE_PAGE_SIZE && (
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
              <div className="leaderboard-filterbar" aria-label="Leaderboard filters">
                <label className="leaderboard-select-filter">
                  <span>Rank by</span>
                  <select value={leaderboardMetric} onChange={(event) => setLeaderboardMetric(event.target.value as LeaderboardMetric)}>
                    {LEADERBOARD_METRICS.map((metric) => (
                      <option key={metric.value} value={metric.value}>
                        {metric.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="leaderboard-period-filter">
                  <span>Period</span>
                  <div className="leaderboard-period-tabs">
                    {LEADERBOARD_PERIODS.map((period) => (
                      <button
                        aria-pressed={leaderboardPeriod === period.value}
                        className={leaderboardPeriod === period.value ? "active" : ""}
                        key={period.value}
                        onClick={() => setLeaderboardPeriod(period.value)}
                        type="button"
                      >
                        {period.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="leaderboard-select-filter">
                  <span>Category</span>
                  <select value={leaderboardCategory} onChange={(event) => setLeaderboardCategory(event.target.value)}>
                    {CATEGORIES.map((category) => (
                      <option key={`leaderboard-category-${category}`} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <section className="aura-formula-card aura-formula-card-compact">
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
          ) : view === "assistant" ? (
            <AuraAssistant
              account={account}
              markets={assistantMarkets}
              userStats={assistantUserStats}
              onAction={handleAssistantAction}
              onConnect={openWalletModal}
              busy={transactionPending}
            />
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
                <span className="section-label">Legal and risk notice</span>
                <h3>Experimental software, not financial advice</h3>
                <p>
                  AuraPredict is not a regulated exchange, broker, gambling platform, investment product, or financial
                  adviser. Testnet tokens have no real-world value. Market wording, AI summaries, oracle suggestions,
                  source checks, odds, and payouts are provided for testing and research only.
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
                <span className="section-label">Oracle policy</span>
                <h3>Authority, adapters, and reputation remain visible</h3>
                <p>
                  Objective adapters may propose high-confidence outcomes, but funded markets still expose dispute,
                  authority review, and finalization state. Committee or oracle reputation should be based on accuracy,
                  coverage, reversals, response time, and evidence quality before any mainnet use.
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
              <div className={`market-stat-row status ${indexerStatusTone}`}>
                <span className="stat-glyph stat-sync" aria-hidden="true" />
                <div>
                  <span>Indexer status</span>
                  <strong>{indexerModeText}</strong>
                  <small>{indexerStatusDetail}</small>
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
                value={localQuestionDraft}
                onChange={(event) => setLocalQuestionDraft(event.target.value)}
                onBlur={() => {
                  if (localQuestionDraft !== createForm.question) {
                    setCreateForm({ ...createForm, question: localQuestionDraft });
                    setAiMarketDraft(null);
                    setAuraCreateStatus("idle");
                    setDuplicateAcknowledged(false);
                  }
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
            <div className="market-quality-card">
              <div className="panel-heading">
                <div>
                  <span className="section-label">AI market quality</span>
                  <h3>{createMarketQuality.label}</h3>
                </div>
                <span className="agent-confidence">{createMarketQuality.score}% score</span>
              </div>
              <div className="quality-signal-grid">
                {createMarketQuality.signals.map((signal) => (
                  <span className={`quality-signal ${signal.state}`} key={`${signal.label}-${signal.detail}`}>
                    <strong>{signal.label}</strong>
                    {signal.detail}
                  </span>
                ))}
              </div>
              {createRiskFlags.length > 0 && (
                <div className="market-risk-strip">
                  {createRiskFlags.slice(0, 5).map((flag) => (
                    <span className={`market-risk-pill risk-${flag.severity}`} key={`${flag.label}-${flag.detail}`}>
                      <strong>{flag.label}</strong>
                      {flag.detail}
                    </span>
                  ))}
                </div>
              )}
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
                {needsVerifiedEventDeadline && !isStablecoinContractVersion(contractVersion) && (
                  <small className="time-format-hint error-hint">
                    Tournament winner markets need an official final/end timestamp in the rule before launch.
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
                  {needsVerifiedEventDeadline && (
                    <small className="time-format-hint error-hint">
                      Tournament winner markets need an official final/end timestamp in the rule before launch.
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
                  <small className="time-format-hint">
                    {createForm.resolutionMode === "0"
                      ? "Creator can propose. A matching signed Aura result can finalize after the dispute window; otherwise authority review is required."
                      : createForm.resolutionMode === "1"
                        ? "Creator can propose, but owner/authority must approve the final result before settlement."
                        : "Only owner/authority/oracle can propose. Best for objective data markets and oracle-led settlement."}
                  </small>
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
              {contractVersion === "v4" && " The primary source, fallback source, and resolution rule are stored onchain. New markets default to authority/oracle review so creators do not need to publish their own result."}
              {contractVersion === "v5" && " V5 markets launch as owner-reviewed drafts. The owner must approve each draft before trading opens."}
              {contractVersion === "legacy"
                ? " This legacy contract does not use creator bonds or dispute windows."
                : marketCreationFee > 0n
                  ? ` Creating a market costs ${formatUsdc(creatorBond + marketCreationFee, defaultSettlementDecimals)} ${defaultSettlementSymbol} total: ${formatUsdc(creatorBond, defaultSettlementDecimals)} bond plus ${formatUsdc(marketCreationFee, defaultSettlementDecimals)} creation fee.`
                  : ` Creating a market locks a ${formatUsdc(creatorBond, defaultSettlementDecimals)} ${defaultSettlementSymbol} creator bond until the result is finalized.`}
            </div>
            <div className="create-fund-panel">
              <div>
                <strong>Need creator bond or fees?</strong>
                <small>Fund your Arc wallet before launching, then refresh your balance.</small>
              </div>
              <FundOnArcActions compact targetSymbol={defaultSettlementSymbol} onUnifiedBalance={openUnifiedBalanceModal} />
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
            {aiMarketDraft && (createForm.resolutionSource.trim().length === 0 || createForm.resolutionRule.trim().length === 0) && (
              <p className="form-hint-apply-draft">
                Click <strong>Apply suggestion</strong> above to fill the form, then review before launching.
              </p>
            )}
            {hasBlockingMarketRisk && createForm.resolutionSource.trim().length > 0 && (
              <div className="form-hint-apply-draft">
                {createRiskFlags.filter((f) => f.severity === "bad").map((f) => (
                  <p key={f.label} style={{ margin: "2px 0" }}>
                    <strong>{f.label}:</strong> {f.detail}
                  </p>
                ))}
              </div>
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
                  needsVerifiedEventDeadline ||
                  hasBlockingMarketRisk ||
                  !canCreateAfterAura ||
                  (!!aiMarketDraft?.duplicateRisk && aiMarketDraft.duplicateRisk !== "LOW" && !duplicateAcknowledged)
                }
                type="submit"
              >
                {transactionPending
                  ? "Waiting Wallet..."
                  : hasBlockingMarketRisk
                    ? "Fix market risks"
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

      {unifiedBalanceModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Unified Balance funding">
          <section className="modal-panel unified-balance-modal" aria-busy={unifiedBalanceBusy !== "idle"}>
            <div className="modal-header">
              <div>
                <span className="section-label">Circle Gateway</span>
                <h2>Unified Balance</h2>
                <p>Move testnet USDC from supported chains into Gateway, then mint USDC to your Arc Testnet wallet.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setUnifiedBalanceModalOpen(false)}>
                X
              </button>
            </div>
            <div className="unified-balance-status-row">
              <span>Wallet {account ? shortAddress(account) : "not connected"}</span>
              <span>Destination Arc Testnet</span>
              <span>
                Source wallet{" "}
                {formatUsdcInput(unifiedBalanceSourceWalletBalance?.balance || 0n, unifiedBalanceSourceWalletBalance?.decimals || 6)} USDC
              </span>
              {unifiedBalanceBusyText && <strong>{unifiedBalanceBusyText}</strong>}
            </div>
            <div className="unified-balance-grid">
              <article className="unified-balance-card unified-balance-controls">
                <label>
                  Source chain
                  <select
                    value={unifiedBalanceSourceChain}
                    disabled={unifiedBalanceBusy !== "idle" || transactionPending}
                    onChange={(event) => {
                      setUnifiedBalanceSourceChain(event.target.value as UnifiedBalanceSourceChainKey);
                      setUnifiedBalanceFees([]);
                      setUnifiedBalanceLastTx(null);
                    }}
                  >
                    {UNIFIED_BALANCE_SOURCE_CHAINS.map((chain) => (
                      <option key={chain.value} value={chain.value}>
                        {chain.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount USDC
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={unifiedBalanceAmount}
                    disabled={unifiedBalanceBusy !== "idle" || transactionPending}
                    onChange={(event) => {
                      setUnifiedBalanceAmount(event.target.value);
                      setUnifiedBalanceFees([]);
                    }}
                  />
                </label>
                <div className="unified-balance-action-grid">
                  <button
                    className="unified-balance-primary"
                    disabled={unifiedBalanceBusy !== "idle" || transactionPending || !unifiedBalanceAmountReady}
                    onClick={depositAndSpendUnifiedBalance}
                    type="button"
                  >
                    {unifiedBalanceBusy === "deposit-spend" ? "Moving..." : "Move USDC to Arc"}
                  </button>
                  <button
                    className="secondary"
                    disabled={unifiedBalanceBusy !== "idle"}
                    onClick={loadUnifiedBalance}
                    type="button"
                  >
                    {unifiedBalanceBusy === "balances" ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    className="secondary"
                    disabled={unifiedBalanceBusy !== "idle" || !unifiedBalanceAmountReady}
                    onClick={estimateUnifiedBalanceSpend}
                    type="button"
                  >
                    {unifiedBalanceBusy === "estimate" ? "Estimating..." : "Estimate fees"}
                  </button>
                </div>
                <details className="unified-balance-advanced-actions">
                  <summary>Advanced recovery</summary>
                  <div>
                    <button
                      className="secondary"
                      disabled={unifiedBalanceBusy !== "idle" || transactionPending || !unifiedBalanceAmountReady}
                      onClick={depositUnifiedBalance}
                      type="button"
                    >
                      {unifiedBalanceBusy === "deposit" ? "Depositing..." : "Deposit only"}
                    </button>
                    <button
                      className="secondary"
                      disabled={unifiedBalanceBusy !== "idle" || transactionPending || !unifiedBalanceAmountReady}
                      onClick={spendUnifiedBalanceToArc}
                      type="button"
                    >
                      {unifiedBalanceBusy === "spend" ? "Spending..." : "Retry spend to Arc"}
                    </button>
                  </div>
                </details>
                <small>
                  Main flow deposits from {unifiedBalanceSelectedSource.label}, then spends the confirmed Gateway balance to Arc. Use retry spend if a previous deposit succeeded but minting failed.
                </small>
              </article>

              <article className="unified-balance-card unified-balance-summary">
                <span>Gateway balance available to spend</span>
                <strong>{formatUnifiedBalanceDecimal(unifiedBalanceSummary?.totalConfirmedBalance)} USDC</strong>
                {hasUnifiedBalanceValue(unifiedBalanceSummary?.totalPendingBalance) && (
                  <small>Pending {formatUnifiedBalanceDecimal(unifiedBalanceSummary?.totalPendingBalance)} USDC. Pending deposits need confirmations before spend.</small>
                )}
                <div className="unified-balance-mini-grid">
                  <div>
                    <span>{unifiedBalanceSelectedSource.label} Gateway</span>
                    <strong>{formatUnifiedBalanceDecimal(unifiedBalanceSourceBalance?.confirmedBalance)} USDC</strong>
                    {hasUnifiedBalanceValue(unifiedBalanceSourceBalance?.pendingBalance) && (
                      <small>Pending {formatUnifiedBalanceDecimal(unifiedBalanceSourceBalance?.pendingBalance)}</small>
                    )}
                  </div>
                  <div>
                    <span>Arc Testnet Gateway</span>
                    <strong>{formatUnifiedBalanceDecimal(unifiedBalanceArcBalance?.confirmedBalance)} USDC</strong>
                    {hasUnifiedBalanceValue(unifiedBalanceArcBalance?.pendingBalance) && (
                      <small>Pending {formatUnifiedBalanceDecimal(unifiedBalanceArcBalance?.pendingBalance)}</small>
                    )}
                  </div>
                </div>
                <div className="unified-balance-breakdown">
                  {(unifiedBalanceSummary?.breakdown || []).map((entry) => (
                    <div key={entry.chain}>
                      <span>{unifiedBalanceChainLabel(entry.chain)}</span>
                      <strong>{formatUnifiedBalanceDecimal(entry.confirmedBalance)} USDC</strong>
                    </div>
                  ))}
                  {unifiedBalanceSummary && unifiedBalanceSummary.breakdown.length === 0 && (
                    <small>No Gateway balance found for the selected testnet pair yet.</small>
                  )}
                </div>
              </article>
            </div>

            <div className="unified-balance-card unified-balance-wallets">
              <span>Wallet USDC by chain</span>
              <div className="unified-balance-wallet-grid">
                {unifiedBalanceOtherWalletBalances.map((entry) => (
                  <div className={entry.chain === unifiedBalanceSourceChain ? "active" : ""} key={entry.chain}>
                    <span>{entry.label}</span>
                    <strong>{formatUsdcInput(entry.balance, entry.decimals)} USDC</strong>
                    {entry.error && <small>{entry.error}</small>}
                  </div>
                ))}
                {unifiedBalanceArcWalletBalance && (
                  <div className="arc-wallet-balance">
                    <span>Arc Testnet</span>
                    <strong>{formatUsdcInput(unifiedBalanceArcWalletBalance.balance, unifiedBalanceArcWalletBalance.decimals)} USDC</strong>
                    {unifiedBalanceArcWalletBalance.error && <small>{unifiedBalanceArcWalletBalance.error}</small>}
                  </div>
                )}
              </div>
            </div>

            {unifiedBalanceFees.length > 0 && (
              <div className="unified-balance-card unified-balance-fees">
                <span>Estimated / executed fees</span>
                {unifiedBalanceFees.map((fee, index) => (
                  <div key={`${fee.type}-${index}`}>
                    <strong>
                      {fee.type.replace(/([A-Z])/g, " $1")} {formatUnifiedBalanceDecimal(fee.amount)} {fee.token}
                    </strong>
                    {fee.detail && <small>{fee.detail}</small>}
                  </div>
                ))}
              </div>
            )}

            {unifiedBalanceLastTx && (
              <div className="unified-balance-card unified-balance-lasttx">
                <span>{unifiedBalanceLastTx.label}</span>
                <strong>{unifiedBalanceLastTx.chain ? unifiedBalanceChainLabel(unifiedBalanceLastTx.chain) : "Gateway"}</strong>
                {unifiedBalanceLastTx.txHash && <small>{shortHash(unifiedBalanceLastTx.txHash)}</small>}
                {unifiedBalanceLastTx.explorerUrl && (
                  <a href={unifiedBalanceLastTx.explorerUrl} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                )}
              </div>
            )}

            {unifiedBalanceLog.length > 0 && (
              <div className="unified-balance-card unified-balance-events">
                <span>Recent Unified Balance activity</span>
                {unifiedBalanceLog.map((item) => (
                  <small key={item}>{item}</small>
                ))}
              </div>
            )}

            <small className="unified-balance-note">
              This flow only funds Arc USDC. Markets that settle in EURC still need the in-app Arc swap before staking.
            </small>
            <div className="modal-actions">
              <a className="button-link" href={ARC_UNIFIED_BALANCE_URL} target="_blank" rel="noreferrer">
                Docs
              </a>
              <button className="secondary" type="button" onClick={() => setUnifiedBalanceModalOpen(false)}>
                Close
              </button>
            </div>
          </section>
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


      {emailLoginOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Email login">
          <section className="modal-panel email-login-modal">
            <div className="modal-header email-login-header">
              <div>
                <span className="email-login-eyebrow">Circle wallet</span>
                <h2>Log in with email</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close email login" onClick={() => setEmailLoginOpen(false)}>
                X
              </button>
            </div>
            <div className="email-login-intro">
              <strong>Secure Arc wallet, no extension required.</strong>
              <p>
                We create a PIN-protected Circle wallet for you. Your keys stay private and are never shared with AuraPredict.
              </p>
            </div>
            <form
              className="email-login-form"
              onSubmit={async (event) => {
                event.preventDefault();
                await connectCircleWallet(emailLoginInput);
                setEmailLoginOpen(false);
              }}
            >
              <label className="email-login-field">
                <span>Email address</span>
                <input
                  type="email"
                  value={emailLoginInput}
                  placeholder="you@example.com"
                  onChange={(event) => setEmailLoginInput(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="modal-actions email-login-actions">
                <button className="secondary" type="button" onClick={() => setEmailLoginOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={connecting || !emailLoginInput.trim()}>
                  {connecting ? "Setting up..." : "Continue"}
                </button>
              </div>
            </form>
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

      {rejectMarketModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cancel market">
          <section className="modal-panel cancel-market-modal">
            <div className="modal-header">
              <div>
                <span className="section-label" style={{ color: "#e74c3c" }}>
                  {rejectMarketModal.isDraft ? "Owner — Reject draft" : "Owner — Cancel market"}
                </span>
                <h2 style={{ marginTop: 2 }}>
                  {rejectMarketModal.isDraft ? "Reject draft" : "Cancel live market"}{" "}
                  <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>#{rejectMarketModal.marketId}</span>
                </h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setRejectMarketModal(null)} aria-label="Close">✕</button>
            </div>
            <p className="cancel-market-modal-desc">
              {rejectMarketModal.isDraft
                ? "The creator's bond will be returned. Provide a reason so the creator understands why the draft was rejected."
                : "This will cancel the market and refund all participants. The creator's bond will be returned."}
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="field-label">
                Reason{" "}
                <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>(optional)</span>
              </span>
              <textarea
                className="create-textarea"
                placeholder={
                  rejectMarketModal.isDraft
                    ? "e.g. Duplicate market, ambiguous question…"
                    : "e.g. Source unavailable, question cannot be resolved…"
                }
                rows={3}
                value={rejectMarketReason}
                onChange={(e) => setRejectMarketReason(e.target.value)}
              />
            </label>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="secondary" type="button" onClick={() => setRejectMarketModal(null)}>
                Close
              </button>
              <button
                className="cancel-market-confirm-btn"
                disabled={transactionPending}
                type="button"
                onClick={() => void confirmRejectMarket()}
              >
                {rejectMarketModal.isDraft ? "Reject draft" : "Cancel market"}
              </button>
            </div>
          </section>
        </div>
      )}
      {view !== "assistant" && !!account && (
        <AuraFloatingChat
          account={account}
          markets={assistantMarkets}
          userStats={assistantUserStats}
          onAction={handleAssistantAction}
          onConnect={openWalletModal}
          busy={transactionPending}
        />
      )}
    </main>
  );
}

