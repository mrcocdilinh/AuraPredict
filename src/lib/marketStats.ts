import { isAddress } from "viem";
import { Outcome, type MarketView, type ProjectStats, type AssetStats } from "../types";
import { ARC_NATIVE_USDC_DECIMALS } from "../constants";
import { formatUsdc } from "./format";

export function marketVolume(market: MarketView) {
  return market.yesPool + market.noPool;
}

export function marketDecimals(market?: Pick<MarketView, "settlementDecimals">) {
  return market?.settlementDecimals ?? ARC_NATIVE_USDC_DECIMALS;
}

export function marketSymbol(market?: Pick<MarketView, "settlementSymbol">) {
  return market?.settlementSymbol || "USDC";
}

export function formatMarketAmount(value: bigint, market?: Pick<MarketView, "settlementDecimals">) {
  return formatUsdc(value, marketDecimals(market));
}

export function assetStatsFromMarkets(
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

export function fallbackAssetStatsFromProject(stats: ProjectStats | null, defaultSymbol = "USDC", defaultDecimals = ARC_NATIVE_USDC_DECIMALS) {
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

export function formatAssetSummary(assets: AssetStats[], field: "totalVolume" | "liveLiquidity" | "averageMarketVolume") {
  if (assets.length === 0) return "--";
  return assets
    .map((asset) => `${formatUsdc(asset[field], asset.decimals)} ${asset.symbol}`)
    .join(" / ");
}
