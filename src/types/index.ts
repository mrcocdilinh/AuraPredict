import type { Address, Hash } from "viem";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  disconnect?: () => Promise<void> | void;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon?: string;
    rdns?: string;
  };
  provider: EthereumProvider;
};

export type LifiSwapRoute = Awaited<ReturnType<(typeof import("@lifi/sdk"))["getRoutes"]>>["routes"][number];
export type StablecoinSwapDirection = "USDC_TO_EURC" | "EURC_TO_USDC";
export type StablecoinSwapPair = {
  fromToken: Address;
  fromSymbol: string;
  toToken: Address;
  toSymbol: string;
  decimals: number;
};
export type AppKitSwapQuote = {
  provider: "arc-app-kit";
  amountIn: string;
  estimatedAmountOut: string;
  minimumAmountOut: string;
  pairKey: string;
  slippageBps: number;
};
export type LifiStablecoinSwapQuote = {
  provider: "lifi";
  route: LifiSwapRoute;
};
export type StablecoinSwapQuote = AppKitSwapQuote | LifiStablecoinSwapQuote;
export type SwapProviderState = "idle" | "ok" | "fail" | "skipped";
export type SwapProviderHealth = {
  circle: SwapProviderState;
  lifi: SwapProviderState;
  circleMessage?: string;
  lifiMessage?: string;
};
export type UnifiedBalanceSourceChainKey = "Base_Sepolia" | "Arbitrum_Sepolia" | "Ethereum_Sepolia";
export type UnifiedBalanceBusy = "idle" | "balances" | "estimate" | "deposit" | "spend" | "deposit-spend";
export type UnifiedBalanceChainBalance = {
  chain: string;
  confirmedBalance: string;
  pendingBalance?: string;
};
export type UnifiedBalanceSummary = {
  totalConfirmedBalance: string;
  totalPendingBalance?: string;
  breakdown: UnifiedBalanceChainBalance[];
};
export type UnifiedBalanceFeeLine = {
  type: string;
  token: string;
  amount: string;
  detail?: string;
};
export type UnifiedBalanceTx = {
  label: string;
  chain?: string;
  txHash?: string;
  explorerUrl?: string;
};
export type UnifiedBalanceWalletBalance = {
  chain: string;
  label: string;
  balance: bigint;
  decimals: number;
  tokenAddress: Address;
  error?: string;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export enum Outcome {
  Unresolved = 0,
  Yes = 1,
  No = 2,
  Canceled = 3
}

export type MarketView = {
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
  isDraft?: boolean;
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

export type ChainMarketSnapshot = Pick<
  MarketView,
  "proposedOutcome" | "proposedAt" | "disputeDeadline" | "authorityReviewRequired" | "disputed" | "outcome"
>;

export type MarketContractVersion = "unknown" | "legacy" | "dispute" | "v2" | "v3" | "v4" | "v5";

export type ActivityItem = {
  id: string;
  user: string;
  marketId: number;
  question: string;
  side: Outcome;
  amount: bigint;
  timestamp: number;
  txHash?: Hash | string;
};

export type AppView = "markets" | "ended" | "leaderboard" | "profile" | "collection" | "market" | "security" | "notifications" | "owner" | "assistant";

export type AssistantAction = {
  type: "bet" | "claim" | "view";
  marketId: number;
  side?: "YES" | "NO";
  amount?: string;
  label: string;
};

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
};
export type LeaderboardMetric = "volume" | "winRate" | "pnl" | "auraPoints";
export type LeaderboardPeriod = "day" | "7d" | "30d" | "all";
export type MarketSectionKey = "fresh" | "hot" | "closing" | "live";
export type ThemeMode = "dark" | "light";
export type MarketViewMode = "grid" | "list";
export type ChartWindowKey = "1h" | "6h" | "1d" | "1w" | "1m" | "all";
export type MarketDetailTab = "overview" | "comments" | "activity" | "holders";
export type MobileMarketTab = "overview" | "trade" | "resolve" | "details";
export type MarketSortKey = "created" | "ending" | "volume" | "participants" | "yes" | "no";
export type SortDirection = "asc" | "desc";

export type NotificationType =
  | "resolve"
  | "finalize"
  | "owner-review"
  | "dispute-review"
  | "stale-review"
  | "proposal"
  | "dispute-resolved"
  | "report"
  | "flag"
  | "claim"
  | "result";

export type NotificationFilter = NotificationType | "all";

export type LeaderboardRow = {
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

export type UserRegistry = Record<string, { address: string; joinedAt: string }>;

export type ProjectStats = {
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
  activityReconciliation?: {
    ok: boolean;
    mismatchCount: number;
    checkedMarkets: number;
    sample?: Array<{
      marketId: number;
      question: string;
      expectedYes: string;
      indexedYes: string;
      yesDelta: string;
      expectedNo: string;
      indexedNo: string;
      noDelta: string;
      tradeCount: number;
      settlementSymbol: string;
      settlementDecimals: number;
    }>;
  };
  assetBreakdown?: AssetStats[];
};

export type AssetStats = {
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

export type MarketComment = {
  id: string;
  marketId: number;
  author: string;
  text: string;
  createdAt: string;
};

export type MarketEvidence = {
  id: string;
  marketId: number;
  title: string;
  url: string;
  notes: string;
  addedBy: string;
  createdAt: string;
};

export type MarketReportStatus = "open" | "dismissed" | "flagged" | "resolved";

export type MarketReport = {
  id: string;
  marketId: number;
  reporter: string;
  reason: string;
  url: string;
  status: MarketReportStatus;
  createdAt: string;
  ownerNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
};

export type ActiveNotificationItem = {
  key: string;
  type: NotificationType;
  label: string;
  title: string;
  detail: string;
  marketId?: number;
};

export type EvidenceDraft = {
  title: string;
  url: string;
  notes: string;
};

export type CreateFormState = {
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

export type StructuredResolutionRule = {
  version: 1;
  kind: "crypto-price" | "stock-price" | "macro-price" | "status-health" | "status-page" | "sports-fixture" | "manual-review";
  asset?: string;
  metric?: string;
  comparator?: "gt" | "gte" | "lt" | "lte" | "eq";
  target?: string;
  closeTimeUtc?: string;
  resolutionTimeUtc?: string;
  primarySource?: string;
  fallbackSource?: string;
};

export type MismatchConfirmState = {
  marketId: number;
  outcome: Outcome;
  aiSuggestedOutcome: Outcome.Yes | Outcome.No;
};

export type SettlementAuditStatus = "safe" | "review" | "conflict";

export type SettlementAudit = {
  status: SettlementAuditStatus;
  label: string;
  detail: string;
  severity: MarketRiskSeverity;
  blocksFinalize: boolean;
};

export type SocialMarketResponse = {
  comments?: MarketComment[];
  evidence?: MarketEvidence[];
  reports?: MarketReport[];
};

export type SocialProfileResponse = {
  profile?: {
    address: string;
    name?: string;
    isPublic?: boolean;
    joinedAt?: string;
  } | null;
  follows?: string[];
};

export type SocialProfileSaveResponse = SocialProfileResponse & {
  code?: string;
  error?: string;
  username?: string;
};

export type SocialReportsResponse = {
  reports?: MarketReport[];
  updatedAt?: string;
};

export type AiMarketDraft = {
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

export type MarketRiskSeverity = "info" | "warn" | "bad";
export type MarketRiskFlag = {
  label: string;
  detail: string;
  severity: MarketRiskSeverity;
};
export type ProfileHistoryFilter = "all" | "live" | "claimable" | "won" | "lost" | "refund";

export type AiResolutionReport = {
  suggestedOutcome?: string;
  confidence?: number;
  summary?: string;
  evidence?: Array<{ title?: string; url?: string; finding?: string }>;
  disputeRisks?: string[];
  resolverAction?: string;
};

export type AiResolutionReceipt = {
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

export type OracleProposal = {
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

export type ResolutionReceiptResponse = {
  receipt?: AiResolutionReceipt | null;
};

export type OracleProposalResponse = {
  proposal?: OracleProposal | null;
};

export type AiMarketInsight = {
  marketId: number;
  question?: string;
  category?: string;
  status?: string;
  marketYesPrice: number;
  marketNoPrice: number;
  estimatedYesProbability: number;
  edge: number;
  edgeSide: "YES" | "NO" | "balanced" | string;
  confidence: number;
  confidenceBand: string;
  basis: string;
  summary: string;
  riskFlags: string[];
  sourceUrls: string[];
  receiptHash?: string;
  oracleDataHash?: string;
  txHash?: string;
  updatedAt?: string;
};

export type PublicOracleReceipt = {
  marketId: number;
  status: string;
  finalOutcome: string;
  proposedOutcome: string;
  ai?: {
    status: string;
    outcome: string;
    confidence: number;
    agreed?: number | null;
    receiptHash?: string;
    provider?: string;
    model?: string;
    generatedAt?: string;
    txHash?: string;
  } | null;
  oracle?: {
    status: string;
    adapter: string;
    outcome: string;
    confidence: number;
    observedValue?: string;
    dataHash?: string;
    txHash?: string;
    summary?: string;
  } | null;
  evidence?: MarketEvidence[];
  sourceUrls?: string[];
  hashes?: {
    proposalEvidenceHash?: string;
    aiReceiptHash?: string;
    oracleDataHash?: string;
  };
};

export type OracleReputation = {
  agent?: {
    name?: string;
    network?: string;
    chainId?: number;
    contractAddress?: string;
    apiBaseUrl?: string;
    manifestUrl?: string;
    mcpToolsUrl?: string;
    signerMode?: string;
    circleAgentWallet?: string;
  };
  reputationScore: number;
  tier: string;
  coverage: number;
  accuracy: number;
  reversalRate: number;
  avgOracleConfidence: number;
  avgAiConfidence: number;
  evidenceQuality: number;
  oracleProposals: number;
  aiReceipts: number;
  finalizedMarkets: number;
  disputedMarkets: number;
  authorityReviewMarkets: number;
  autoProposed: number;
  adapters: Record<string, number>;
  recent: Array<{
    marketId: number;
    question: string;
    adapter: string;
    status: string;
    outcome: string;
    confidence: number;
    txHash?: string;
    generatedAt?: string;
  }>;
  safeguards?: string[];
  policy: string;
  updatedAt?: string;
};

export type PublicOracleReceiptResponse = {
  receipt?: PublicOracleReceipt | null;
};

export type AiMarketInsightResponse = {
  insight?: AiMarketInsight | null;
};

export type OracleReputationResponse = {
  reputation?: OracleReputation | null;
};

export type AuraBreakdown = {
  items: Array<{ label: string; detail: string; value: number }>;
  total: number;
  winRate: number;
};

export type IndexedMarket = Omit<
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

export type IndexedActivity = Omit<ActivityItem, "amount" | "side"> & {
  amount: string;
  side: number;
};

export type IndexedAssetStats = Omit<AssetStats, "totalVolume" | "liveLiquidity" | "averageMarketVolume"> & {
  totalVolume: string;
  liveLiquidity: string;
  averageMarketVolume: string;
};

export type IndexedProjectStats = Omit<ProjectStats, "totalVolume" | "liveLiquidity" | "averageMarketVolume" | "assetBreakdown"> & {
  totalVolume: string;
  liveLiquidity: string;
  averageMarketVolume: string;
  assetBreakdown?: IndexedAssetStats[];
};

export type IndexedSnapshot = {
  markets: MarketView[];
  activities: ActivityItem[];
  stats: ProjectStats | null;
  total: number;
  health?: LandingHealth | null;
};

export type LandingHealth = {
  ok: boolean;
  updatedAt?: string | null;
  lastIndexedBlock?: string;
  marketCount?: number;
  indexer?: {
    mode?: string;
    pollMs?: number;
    wsEnabled?: boolean;
    wsStatus?: string;
    wsLastBlock?: string;
    wsLastEventAt?: string | null;
    wsLastError?: string;
    lastSyncReason?: string;
    lastSyncedAt?: string;
    lastSyncError?: string;
    lastSyncStartedAt?: string;
    lastSyncTargetBlock?: string;
  };
  features?: {
    socialReports?: boolean;
    socialNotifications?: boolean;
    oracleReceipts?: boolean;
    realtimeSync?: boolean;
    evidenceSearch?: {
      enabled?: boolean;
      configured?: boolean;
      provider?: string;
      keyCount?: number;
    };
  };
};

export type ContractEventRow = {
  args: {
    marketId?: bigint;
    user?: Address;
    side?: number;
    outcomeId?: number;
    amount?: bigint;
  };
  blockNumber?: bigint | null;
  transactionHash?: Hash;
  logIndex?: number;
};

export type CachedMarketView = Omit<
  MarketView,
  "yesPool" | "noPool" | "yesPosition" | "noPosition" | "potentialPayout" | "termsCreatorBond" | "termsDisputeBond"
> & {
  yesPool: string;
  noPool: string;
  termsCreatorBond?: string;
  termsDisputeBond?: string;
};
