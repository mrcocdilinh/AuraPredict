import { isAddress, createPublicClient, fallback, http, formatUnits } from "viem";
import type { Address } from "viem";
import {
  ARC_CHAIN_ID_NUMBER,
  LIFI_QUOTE_ENDPOINT,
  LIFI_PROBE_AMOUNTS,
  CIRCLE_APP_KIT_KEY,
  UNIFIED_BALANCE_SOURCE_CHAINS,
  UNIFIED_BALANCE_WALLET_CHAINS
} from "../constants";
import type {
  StablecoinSwapPair,
  StablecoinSwapQuote,
  AppKitSwapQuote,
  SwapProviderState,
  EthereumProvider,
  UnifiedBalanceSummary,
  UnifiedBalanceChainBalance,
  UnifiedBalanceWalletBalance,
  UnifiedBalanceTx,
  UnifiedBalanceFeeLine,
  UnifiedBalanceSourceChainKey
} from "../types";
import { formatUsdcInput, parseUsdcInput } from "./format";
import { compactErrorMessage } from "./errorUtils";
import { settlementTokenAbi } from "../contracts/arcPredictionMarketAbi";

export function stablecoinSwapPairKey(pair: StablecoinSwapPair) {
  return `${pair.fromToken.toLowerCase()}:${pair.toToken.toLowerCase()}`;
}

export function formatSwapTolerance(bps: number) {
  return `${bps / 100}%`;
}

export function providerHealthLabel(state: SwapProviderState) {
  if (state === "ok") return "OK";
  if (state === "fail") return "Failed";
  if (state === "skipped") return "Skipped";
  return "Idle";
}

export function lifiQuoteUrl(pair: StablecoinSwapPair, amount: bigint, account: string, slippage: number) {
  const params = new URLSearchParams({
    fromChain: String(ARC_CHAIN_ID_NUMBER),
    toChain: String(ARC_CHAIN_ID_NUMBER),
    fromToken: pair.fromToken,
    toToken: pair.toToken,
    fromAmount: amount.toString(),
    fromAddress: account,
    toAddress: account,
    slippage: String(slippage)
  });
  return `${LIFI_QUOTE_ENDPOINT}?${params.toString()}`;
}

export function hasLifiQuote(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return Boolean(record.transactionRequest || record.estimate || record.toAmount);
}

export function firstLifiFailureMessage(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  if (typeof record.message === "string" && record.message) return record.message;
  const errors = record.errors;
  if (!errors || typeof errors !== "object") return "";
  const failed = (errors as Record<string, unknown>).failed;
  if (!Array.isArray(failed)) return "";
  for (const item of failed) {
    if (!item || typeof item !== "object") continue;
    const itemRecord = item as Record<string, unknown>;
    const subpaths = itemRecord.subpaths;
    if (!subpaths || typeof subpaths !== "object") continue;
    for (const attempts of Object.values(subpaths as Record<string, unknown>)) {
      if (!Array.isArray(attempts)) continue;
      for (const attempt of attempts) {
        if (!attempt || typeof attempt !== "object") continue;
        const message = (attempt as Record<string, unknown>).message;
        if (typeof message === "string" && message) return message;
      }
    }
  }
  return "";
}

export async function fetchLifiQuoteJson(pair: StablecoinSwapPair, amount: bigint, account: string, slippage: number) {
  const response = await fetch(lifiQuoteUrl(pair, amount, account, slippage));
  return (await response.json()) as unknown;
}

export async function lifiRouteDiagnostic(pair: StablecoinSwapPair, requestedAmount: bigint, account: string, slippage: number) {
  try {
    const requested = await fetchLifiQuoteJson(pair, requestedAmount, account, slippage);
    if (hasLifiQuote(requested)) return "";
    const directFailure = firstLifiFailureMessage(requested);
    let largestWorkingProbe = 0n;
    for (const probeAmount of LIFI_PROBE_AMOUNTS) {
      if (probeAmount >= requestedAmount) continue;
      const probe = await fetchLifiQuoteJson(pair, probeAmount, account, slippage);
      if (hasLifiQuote(probe)) largestWorkingProbe = probeAmount;
    }
    if (largestWorkingProbe > 0n) {
      return `LI.FI has only shallow ${pair.fromSymbol} to ${pair.toSymbol} liquidity on Arc Testnet right now. Try ${formatUsdcInput(
        largestWorkingProbe,
        pair.decimals
      )} ${pair.fromSymbol} or less, or wait for LI.FI liquidity to recover.`;
    }
    if (pair.fromSymbol === "EURC" && pair.toSymbol === "USDC") {
      return "LI.FI currently has no EURC to USDC route on Arc Testnet. This is a LI.FI/liquidity limitation, not an AuraPredict market issue. Use USDC directly or try again later.";
    }
    if (directFailure.toLowerCase().includes("liquidity")) {
      return `LI.FI does not have enough ${pair.fromSymbol} to ${pair.toSymbol} liquidity on Arc Testnet for this amount. Try a much smaller amount or try again later.`;
    }
    return directFailure
      ? `LI.FI could not quote this ${pair.fromSymbol} to ${pair.toSymbol} swap on Arc Testnet: ${directFailure}`
      : `LI.FI could not quote ${pair.fromSymbol} to ${pair.toSymbol} on Arc Testnet right now. Try again later.`;
  } catch {
    return `LI.FI quote diagnostics are unavailable, and no ${pair.fromSymbol} to ${pair.toSymbol} route was returned. Try again later.`;
  }
}

export function swapAmountToDecimalString(amount: bigint, decimals: number) {
  return formatUnits(amount, decimals);
}

export function swapQuoteEstimatedAmount(quote: StablecoinSwapQuote, pair: StablecoinSwapPair) {
  return quote.provider === "lifi" ? BigInt(quote.route.toAmount) : parseUsdcInput(quote.estimatedAmountOut, pair.decimals);
}

export function swapQuoteMinimumAmount(quote: StablecoinSwapQuote, pair: StablecoinSwapPair) {
  return quote.provider === "lifi" ? BigInt(quote.route.toAmountMin) : parseUsdcInput(quote.minimumAmountOut, pair.decimals);
}

export function swapQuoteGasCost(quote: StablecoinSwapQuote) {
  return quote.provider === "lifi" ? quote.route.gasCostUSD || "" : "";
}

export function swapQuoteProviderLabel(quote?: StablecoinSwapQuote | null) {
  if (!quote) return CIRCLE_APP_KIT_KEY ? "Circle App Kit, fallback LI.FI" : "LI.FI";
  return quote.provider === "arc-app-kit" ? "Circle App Kit" : "LI.FI";
}

export async function createArcAppKitSwapRuntime(provider: EthereumProvider) {
  const [{ AppKit, Blockchain }, { createViemAdapterFromProvider }] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2")
  ]);
  const adapter = await createViemAdapterFromProvider({ provider: provider as never });
  return { kit: new AppKit(), Blockchain, adapter };
}

export async function createUnifiedBalanceRuntime(provider: EthereumProvider) {
  return createArcAppKitSwapRuntime(provider);
}

export async function estimateArcAppKitSwap(
  provider: EthereumProvider,
  pair: StablecoinSwapPair,
  requestedAmount: bigint,
  toleranceBps: number
): Promise<AppKitSwapQuote> {
  if (!CIRCLE_APP_KIT_KEY) throw new Error("Circle App Kit key is not configured.");
  const { kit, Blockchain, adapter } = await createArcAppKitSwapRuntime(provider);
  const amountIn = swapAmountToDecimalString(requestedAmount, pair.decimals);
  const estimate = await kit.estimateSwap({
    from: { adapter, chain: Blockchain.Arc_Testnet },
    tokenIn: pair.fromSymbol,
    tokenOut: pair.toSymbol,
    amountIn,
    config: {
      kitKey: CIRCLE_APP_KIT_KEY,
      slippageBps: toleranceBps
    }
  } as never);
  return {
    provider: "arc-app-kit",
    amountIn,
    estimatedAmountOut: estimate.estimatedOutput.amount,
    minimumAmountOut: estimate.stopLimit.amount,
    pairKey: stablecoinSwapPairKey(pair),
    slippageBps: toleranceBps
  };
}

export async function executeArcAppKitSwap(provider: EthereumProvider, pair: StablecoinSwapPair, quote: AppKitSwapQuote) {
  if (!CIRCLE_APP_KIT_KEY) throw new Error("Circle App Kit key is not configured.");
  const { kit, Blockchain, adapter } = await createArcAppKitSwapRuntime(provider);
  return kit.swap({
    from: { adapter, chain: Blockchain.Arc_Testnet },
    tokenIn: pair.fromSymbol,
    tokenOut: pair.toSymbol,
    amountIn: quote.amountIn,
    config: {
      kitKey: CIRCLE_APP_KIT_KEY,
      slippageBps: quote.slippageBps,
      stopLimit: quote.minimumAmountOut
    }
  } as never);
}

export function unifiedBalanceChainLabel(chain: string) {
  if (chain === "Arc_Testnet") return "Arc Testnet";
  const source = UNIFIED_BALANCE_SOURCE_CHAINS.find((item) => item.value === chain);
  return source?.label ?? chain.replace(/_/g, " ");
}

export function unifiedBalanceString(value: unknown, fallback = "0") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return fallback;
}

export function formatUnifiedBalanceDecimal(value?: string) {
  const raw = value && value.trim() ? value.trim() : "0";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: numeric > 0 && numeric < 1 ? 4 : 0,
    maximumFractionDigits: 6
  }).format(numeric);
}

export function hasUnifiedBalanceValue(value?: string) {
  const numeric = Number(value || "0");
  return Number.isFinite(numeric) && numeric > 0;
}

export function normalizeUnifiedBalanceAmount(value: string) {
  const amount = parseUsdcInput(value, 6);
  if (amount <= 0n) throw new Error("Enter a USDC amount greater than 0.");
  return formatUsdcInput(amount, 6);
}

export function unifiedBalanceGatewayAmount(
  summary: UnifiedBalanceSummary | null | undefined,
  chain: UnifiedBalanceSourceChainKey,
  field: "confirmedBalance" | "pendingBalance"
) {
  const row = summary?.breakdown.find((entry) => entry.chain === chain);
  return parseUsdcInput(row?.[field] || "0", 6);
}

export function addUnifiedBalanceDecimals(left?: string, right?: string) {
  const total = parseUsdcInput(left || "0", 6) + parseUsdcInput(right || "0", 6);
  return formatUsdcInput(total, 6);
}

export function flattenUnifiedBalanceSummary(data: unknown): UnifiedBalanceSummary {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const accounts = Array.isArray(record.breakdown) ? record.breakdown : [];
  const rows = accounts.flatMap((account) => {
    const accountRecord = account && typeof account === "object" ? (account as Record<string, unknown>) : {};
    const breakdown = Array.isArray(accountRecord.breakdown) ? accountRecord.breakdown : [];
    return breakdown.map((entry) => {
      const entryRecord = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      return {
        chain: unifiedBalanceString(entryRecord.chain, "Unknown"),
        confirmedBalance: unifiedBalanceString(entryRecord.confirmedBalance),
        pendingBalance: entryRecord.pendingBalance === undefined ? undefined : unifiedBalanceString(entryRecord.pendingBalance)
      };
    });
  });
  const byChain = new Map<string, UnifiedBalanceChainBalance>();
  for (const row of rows) {
    const current = byChain.get(row.chain);
    byChain.set(row.chain, {
      chain: row.chain,
      confirmedBalance: addUnifiedBalanceDecimals(current?.confirmedBalance, row.confirmedBalance),
      pendingBalance:
        current?.pendingBalance || row.pendingBalance
          ? addUnifiedBalanceDecimals(current?.pendingBalance, row.pendingBalance)
          : undefined
    });
  }

  return {
    totalConfirmedBalance: unifiedBalanceString(record.totalConfirmedBalance),
    totalPendingBalance: record.totalPendingBalance === undefined ? undefined : unifiedBalanceString(record.totalPendingBalance),
    breakdown: [...byChain.values()].sort((left, right) =>
      unifiedBalanceChainLabel(left.chain).localeCompare(unifiedBalanceChainLabel(right.chain))
    )
  };
}

export function flattenUnifiedBalanceFees(data: unknown): UnifiedBalanceFeeLine[] {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const fees = Array.isArray(record.fees) ? record.fees : [];
  return fees.map((fee) => {
    const feeRecord = fee && typeof fee === "object" ? (fee as Record<string, unknown>) : {};
    const allocations = Array.isArray(feeRecord.allocations) ? feeRecord.allocations : [];
    const detail = allocations
      .map((allocation) => {
        const allocationRecord = allocation && typeof allocation === "object" ? (allocation as Record<string, unknown>) : {};
        const chain = unifiedBalanceString(allocationRecord.chain, "Chain");
        const amount = unifiedBalanceString(allocationRecord.amount);
        return `${unifiedBalanceChainLabel(chain)} ${formatUnifiedBalanceDecimal(amount)}`;
      })
      .filter(Boolean)
      .join(" / ");
    return {
      type: unifiedBalanceString(feeRecord.type, "fee"),
      token: unifiedBalanceString(feeRecord.token, "USDC"),
      amount: unifiedBalanceString(feeRecord.amount),
      detail
    };
  });
}

export function unifiedBalanceTxFromResult(label: string, data: unknown): UnifiedBalanceTx {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    label,
    chain: unifiedBalanceString(record.chain ?? record.destinationChain, ""),
    txHash: unifiedBalanceString(record.txHash, ""),
    explorerUrl: unifiedBalanceString(record.explorerUrl, "")
  };
}

export function createUnifiedBalanceSpendParams(
  adapter: unknown,
  blockchain: Record<string, unknown>,
  sourceChain: UnifiedBalanceSourceChainKey,
  amount: string,
  recipientAddress: string
) {
  return {
    from: {
      adapter,
      allocations: { amount, chain: sourceChain }
    },
    to: {
      chain: blockchain.Arc_Testnet,
      recipientAddress,
      useForwarder: true
    },
    token: "USDC",
    amount
  };
}

export async function readUnifiedBalanceWalletBalances(account: string): Promise<UnifiedBalanceWalletBalance[]> {
  if (!account || !isAddress(account)) return [];
  return Promise.all(
    UNIFIED_BALANCE_WALLET_CHAINS.map(async (chain) => {
      try {
        const client = createPublicClient({
          transport: fallback(
            chain.rpcUrls.map((url) => http(url, { retryCount: 1, retryDelay: 250, timeout: 10_000 })),
            { rank: false, retryCount: 1, retryDelay: 400 }
          )
        });
        const balance = (await client.readContract({
          address: chain.usdcAddress,
          abi: settlementTokenAbi,
          functionName: "balanceOf",
          args: [account as Address]
        })) as bigint;
        return {
          chain: chain.value,
          label: chain.label,
          balance,
          decimals: chain.decimals,
          tokenAddress: chain.usdcAddress
        };
      } catch (error) {
        return {
          chain: chain.value,
          label: chain.label,
          balance: 0n,
          decimals: chain.decimals,
          tokenAddress: chain.usdcAddress,
          error: compactErrorMessage(error)
        };
      }
    })
  );
}
