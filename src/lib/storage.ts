import { MARKET_CACHE_KEY } from "../constants";
import type { MarketView, CachedMarketView } from "../types";

export function readJsonStorage<T>(key: string, fallback: T) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function claimedMarketKey(account: string, marketId: number) {
  return `${account.toLowerCase()}:${marketId}`;
}

export function readCachedMarkets() {
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

export function writeCachedMarkets(markets: MarketView[]) {
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
