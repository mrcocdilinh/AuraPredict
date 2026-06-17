import { formatUnits, parseUnits } from "viem";
import type { Hash } from "viem";
import { ARC_NATIVE_USDC_DECIMALS, ARC_EXPLORER_URL } from "../constants";

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function compactAccountLabel(label: string) {
  const trimmed = label.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function formatUsdc(value: bigint, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const formatted = Number(formatUnits(value, decimals));
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: formatted < 1 && formatted > 0 ? 4 : 2,
    maximumFractionDigits: 6
  }).format(formatted);
}

export function formatStatUsdc(value: bigint, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const formatted = Number(formatUnits(value, decimals));
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(formatted);
}

export function formatSignedUsdc(value: bigint, decimals = ARC_NATIVE_USDC_DECIMALS) {
  if (value === 0n) return "0.00";
  const sign = value < 0n ? "-" : "+";
  const absolute = value < 0n ? -value : value;
  return `${sign}${formatUsdc(absolute, decimals)}`;
}

export function formatUsdcInput(value: bigint, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const raw = formatUnits(value, decimals);
  return raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
}

export function transactionUrl(hash: Hash) {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

export function maybeTransactionUrl(hash?: string) {
  return hash && /^0x[a-fA-F0-9]{64}$/.test(hash) ? `${ARC_EXPLORER_URL}/tx/${hash}` : "";
}

export function parseUsdcInput(value: string, decimals = ARC_NATIVE_USDC_DECIMALS) {
  const normalized = value.trim().replace(/,/g, ".");
  if (!normalized || Number(normalized) <= 0) return 0n;
  try {
    return parseUnits(normalized, decimals);
  } catch {
    return 0n;
  }
}
