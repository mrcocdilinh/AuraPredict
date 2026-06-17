import { Outcome, type MarketView, type MarketContractVersion } from "../types";
import { CATEGORY_META, MARKET_IMAGE_CATEGORIES, MARKET_IMAGE_COUNT } from "../constants";
import { marketVolume } from "./marketStats";

export function resolutionTimeFor(market: Pick<MarketView, "closeTime" | "resolutionTime">) {
  return market.resolutionTime || market.closeTime;
}

export function percent(value: bigint, total: bigint) {
  if (total === 0n) return 50;
  return Number((value * 10000n) / total) / 100;
}

export function compareBigint(a: bigint, b: bigint) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

export function betEstimate(market: MarketView, side: Outcome, amount: bigint, feeBps: number) {
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

export function outcomeLabel(outcome: Outcome) {
  if (outcome === Outcome.Yes) return "YES won";
  if (outcome === Outcome.No) return "NO won";
  if (outcome === Outcome.Canceled) return "Canceled";
  return "Live";
}

export function closeDate(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value * 1000)) + " UTC";
}

export function isoDateLabel(value?: string) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? closeDate(Math.floor(timestamp / 1000)) : "Just now";
}

export function closeDateLocal(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value * 1000));
}

export function countdownText(closeTime: number, now: Date) {
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

export function durationText(seconds: number) {
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

export function isStablecoinContractVersion(version: MarketContractVersion) {
  return version === "v3" || version === "v4" || version === "v5";
}

export function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.Other;
}

export function marketImageFor(market: Pick<MarketView, "id" | "category">) {
  const rawCategory = (market.category || "Other").toLowerCase();
  const category = MARKET_IMAGE_CATEGORIES.includes(rawCategory as (typeof MARKET_IMAGE_CATEGORIES)[number])
    ? rawCategory
    : "other";
  const index = Math.abs(market.id % MARKET_IMAGE_COUNT) + 1;
  return `/market-images/${category}-${index}.webp`;
}

export function marketImageVariant(market: Pick<MarketView, "id">) {
  return `market-image-variant-${Math.abs(market.id % 6)}`;
}

export function shortQuestion(question: string) {
  return question.length > 70 ? `${question.slice(0, 67)}...` : question;
}

export function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}
