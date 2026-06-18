import { type IndexedMarket, type IndexedActivity, type IndexedProjectStats, type MarketView, type ActivityItem, type ProjectStats, Outcome } from "../types";
import { ARC_NATIVE_USDC_DECIMALS, CATEGORY_SET } from "../constants";

export function normalizeCategory(category?: string) {
  const value = String(category || "").trim();
  if (!value) return "Other";
  return CATEGORY_SET.has(value) ? value : "Other";
}

export function indexedMarketToView(market: IndexedMarket): MarketView {
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

export function indexedStatsToProjectStats(stats: IndexedProjectStats): ProjectStats {
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

export function indexedActivityToItem(activity: IndexedActivity, marketsById: Map<number, MarketView>): ActivityItem {
  return {
    ...activity,
    question: activity.question || marketsById.get(activity.marketId)?.question || `Market #${activity.marketId}`,
    side: Number(activity.side || 0) as Outcome,
    amount: BigInt(activity.amount || "0")
  };
}

export function mergeMarketState(incoming: MarketView, current?: MarketView) {
  if (!current) return incoming;
  // The indexer reads the chain authoritatively, so its outcome always wins.
  // We only keep locally-known proposal details while both sides agree the
  // market is still Unresolved and our proposal data is fresher (avoids a
  // brief flicker right after the user proposes, before the indexer catches up).
  // We must NOT preserve a local *resolved* outcome over an Unresolved indexer
  // value — doing so permanently pins stale resolutions into the cache.
  const shouldPreserveLocalProposal =
    current.outcome === Outcome.Unresolved &&
    incoming.outcome === Outcome.Unresolved &&
    current.proposedAt > incoming.proposedAt;

  return {
    ...incoming,
    ...(shouldPreserveLocalProposal
      ? {
          proposedOutcome: current.proposedOutcome,
          proposedAt: current.proposedAt,
          disputeDeadline: current.disputeDeadline,
          disputed: current.disputed,
          disputer: current.disputer
        }
      : {}),
    yesPosition: current.yesPosition,
    noPosition: current.noPosition,
    claimed: current.claimed,
    potentialPayout: current.potentialPayout
  };
}

export function mergeMarketRows(incomingRows: MarketView[], currentRows: MarketView[], totalMarketCount: number) {
  const incomingIds = new Set(incomingRows.map((market) => market.id));
  const currentById = new Map(currentRows.map((market) => [market.id, market]));
  const mergedRows = incomingRows.map((market) => mergeMarketState(market, currentById.get(market.id)));
  const localOnlyRows = currentRows.filter((market) => !incomingIds.has(market.id) && market.id < totalMarketCount);
  return [...mergedRows, ...localOnlyRows].sort((a, b) => b.id - a.id);
}
