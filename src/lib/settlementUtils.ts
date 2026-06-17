import { formatUnits, keccak256, stringToHex } from "viem";
import { Outcome, type MarketView, type LeaderboardRow, type AuraBreakdown, type AiResolutionReceipt, type OracleProposal } from "../types";
import { ARC_NATIVE_USDC_DECIMALS, REPUTATION_TIERS } from "../constants";
import { marketVolume } from "./marketStats";
import { outcomeLabel, closeDate, closeDateLocal } from "./marketUtils";
import { NUMERIC_ORACLE_ADAPTERS, stripRuleMetadata, yesConditionText, parseComparatorTarget, parseNumericText } from "./resolutionUtils";

export const V5_MARKET_STATE = {
  Draft: 0,
  Live: 1,
  Proposed: 2,
  Disputed: 3,
  Finalized: 4,
  Canceled: 5,
  Rejected: 6
} as const;

export const V5_NO_OUTCOME = 65535;
export const V5_BINARY_OUTCOME_LABELS_HASH = keccak256(stringToHex("YES|NO"));

export function legacyOutcomeToV5(outcome: Outcome) {
  if (outcome === Outcome.Yes) return 0;
  if (outcome === Outcome.No) return 1;
  return V5_NO_OUTCOME;
}

export function v5OutcomeToLegacy(outcomeId: number) {
  if (outcomeId === 0) return Outcome.Yes;
  if (outcomeId === 1) return Outcome.No;
  if (outcomeId === V5_NO_OUTCOME) return Outcome.Canceled;
  return Outcome.Unresolved;
}

export function v5StateToOutcome(state: number, finalOutcome: number) {
  if (state === V5_MARKET_STATE.Finalized) return v5OutcomeToLegacy(finalOutcome);
  if (state === V5_MARKET_STATE.Canceled || state === V5_MARKET_STATE.Rejected) return Outcome.Canceled;
  return Outcome.Unresolved;
}

export function hasUserPosition(market: MarketView) {
  return market.yesPosition > 0n || market.noPosition > 0n;
}

export function settlementForPosition(market: MarketView, feeBps: number, yesPosition: bigint, noPosition: bigint) {
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

export function userSettlement(market: MarketView, feeBps: number) {
  return settlementForPosition(market, feeBps, market.yesPosition, market.noPosition);
}

export function personalMarketResult(market: MarketView, subject = "You") {
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

export function claimStatusFor(market: MarketView, settlement: ReturnType<typeof userSettlement>, isOwnProfile: boolean) {
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

export function auraPointsFor(
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

export function auraBreakdownFor(
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

export function reputationTierFor(points: number) {
  return (
    [...REPUTATION_TIERS]
      .reverse()
      .find((tier) => points >= tier.min) ?? REPUTATION_TIERS[0]
  );
}

export function reputationBadgesFor(row: LeaderboardRow, decimals = ARC_NATIVE_USDC_DECIMALS) {
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

export function marketStatus(market: MarketView) {
  if (market.outcome !== Outcome.Unresolved) return outcomeLabel(market.outcome);
  if (market.disputed) return "Disputed";
  if (market.proposedAt > 0) return "Pending finalization";
  if (Date.now() / 1000 >= market.closeTime) return "Awaiting resolve";
  return "Live";
}

export function resolveActionHint(market: Pick<MarketView, "yesPool" | "noPool">) {
  const noYesPool = market.yesPool <= 0n;
  const noNoPool = market.noPool <= 0n;
  if (noYesPool && noNoPool) return "No positions were placed. Use Cancel to release the creator bond.";
  if (noYesPool || noNoPool) return "Only one outcome was funded. YES/NO resolution is disabled; use Cancel to refund the funded position.";
  return "";
}

export function hasNoLiquidity(market: Pick<MarketView, "yesPool" | "noPool">) {
  return market.yesPool === 0n && market.noPool === 0n;
}

export function requiresCancelForLiquidity(market: Pick<MarketView, "yesPool" | "noPool">) {
  return market.yesPool === 0n || market.noPool === 0n;
}

export function finalizeWaitingHint(market: Pick<MarketView, "proposedAt" | "outcome" | "disputed" | "disputeDeadline">) {
  if (market.outcome !== Outcome.Unresolved || market.proposedAt === 0 || market.disputed || market.disputeDeadline <= 0) {
    return "";
  }
  const now = Math.floor(Date.now() / 1000);
  if (now >= market.disputeDeadline) {
    return "Finalize is now available.";
  }
  return `Finalize available after ${closeDate(market.disputeDeadline)} (${closeDateLocal(market.disputeDeadline)} local).`;
}

export function aiOutcomeFromText(value?: string | null) {
  const outcomeText = String(value || "").trim().toUpperCase();
  if (outcomeText === "YES") return Outcome.Yes;
  if (outcomeText === "NO") return Outcome.No;
  if (outcomeText === "CANCEL" || outcomeText === "CANCELED" || outcomeText === "CANCELLED") return Outcome.Canceled;
  return Outcome.Unresolved;
}

export function aiDecisionText(value?: string | null) {
  const outcomeText = String(value || "").trim().toUpperCase();
  if (outcomeText === "YES") return "YES";
  if (outcomeText === "NO") return "NO";
  if (outcomeText === "CANCEL" || outcomeText === "CANCELED" || outcomeText === "CANCELLED") return "CANCEL / REFUND";
  if (outcomeText.includes("INSUFFICIENT")) return "INSUFFICIENT EVIDENCE";
  if (outcomeText === "NEEDS_REVIEW") return "NEEDS REVIEW";
  return "";
}

export function aiOutcomeFromReceipt(receipt?: AiResolutionReceipt | null) {
  if (!receipt) return Outcome.Unresolved;
  if (typeof receipt.proposedOutcomeValue === "number") {
    if (receipt.proposedOutcomeValue === Outcome.Yes) return Outcome.Yes;
    if (receipt.proposedOutcomeValue === Outcome.No) return Outcome.No;
    if (receipt.proposedOutcomeValue === Outcome.Canceled) return Outcome.Canceled;
  }
  return aiOutcomeFromText(receipt.consensus?.outcome || receipt.proposedOutcome);
}

export function oracleOutcomeFromProposal(proposal?: OracleProposal | null) {
  if (!proposal) return Outcome.Unresolved;
  if (typeof proposal.outcomeValue === "number") {
    if (proposal.outcomeValue === Outcome.Yes) return Outcome.Yes;
    if (proposal.outcomeValue === Outcome.No) return Outcome.No;
    if (proposal.outcomeValue === Outcome.Canceled) return Outcome.Canceled;
  }
  return aiOutcomeFromText(proposal.outcome);
}

export function compareNumericValue(observed: number, comparator: string, target: number) {
  if (comparator === "gt") return observed > target;
  if (comparator === "gte") return observed >= target;
  if (comparator === "lt") return observed < target;
  if (comparator === "lte") return observed <= target;
  if (comparator === "eq") return Math.abs(observed - target) < 0.000001;
  return false;
}

export function urlHostLabel(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export function oracleSafetyIssueFor(proposal: OracleProposal | null | undefined, market: MarketView) {
  if (!proposal) return "";
  const safetyCheck = (proposal.checks || []).find((check) => /safety guard/i.test(check));
  if (safetyCheck) return safetyCheck;
  if (!["ready", "proposed"].includes(String(proposal.status || ""))) return "";
  const actual = oracleOutcomeFromProposal(proposal);
  if (actual !== Outcome.Yes && actual !== Outcome.No) return "";

  if (String(proposal.adapter || "") === "sports-scoreboard") {
    const sportsText = `${proposal.summary || ""} ${proposal.observedValue || ""} ${(proposal.checks || []).join(" ")}`;
    if (!/\b(matched one completed scoreboard row|completed scoreboard row)\b/i.test(sportsText)) {
      return "Sports oracle must match exactly one completed scoreboard row before settlement.";
    }
    if (!/\b(final|\[final\]|ft|full time|completed)\b/i.test(sportsText)) {
      return "Sports oracle outcome is missing final/completed status evidence.";
    }
    return "";
  }

  if (!NUMERIC_ORACLE_ADAPTERS.has(String(proposal.adapter || ""))) return "";

  const rule = stripRuleMetadata(market.resolutionRule || "");
  const condition = parseComparatorTarget(`${yesConditionText(rule)} ${market.question} ${market.category}`);
  if (!condition.comparator || !condition.target) return "Oracle safety check could not parse the numeric YES condition.";
  const proposalTarget = parseNumericText(proposal.targetValue);
  const observed = parseNumericText(proposal.observedValue);
  if (proposalTarget === null || observed === null) return "Oracle proposal is missing a parseable target or observed value.";
  if (proposal.comparator !== condition.comparator || Math.abs(proposalTarget - Number(condition.target)) > Math.max(0.000001, Math.abs(Number(condition.target)) * 0.000001)) {
    return `Oracle target ${String(proposal.comparator || "").toUpperCase()} ${proposalTarget} does not match rule ${condition.comparator.toUpperCase()} ${condition.target}.`;
  }
  const expected = compareNumericValue(observed, condition.comparator, Number(condition.target)) ? Outcome.Yes : Outcome.No;
  if (actual !== expected) {
    return `Oracle outcome ${outcomeLabel(actual)} conflicts with observed ${observed}; expected ${outcomeLabel(expected)}.`;
  }
  return "";
}
