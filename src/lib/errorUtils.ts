import { RPC_RETRY_ATTEMPTS, RPC_RETRY_DELAY_MS } from "../constants";

export function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

export function walletConnectionErrorMessage(prefix: string, error: unknown) {
  const message = errorMessage(error);
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("same rpc endpoint as existing network")) {
    return `${prefix}: this wallet already has an Arc network saved with a conflicting chain ID. Remove the old Arc network in wallet settings, then reconnect.`;
  }
  if (
    lowerMessage.includes("unrecognized chain") ||
    lowerMessage.includes("unknown chain") ||
    lowerMessage.includes("wallet_addethereumchain") ||
    lowerMessage.includes("not added") ||
    lowerMessage.includes("try adding")
  ) {
    return `${prefix}: Arc Testnet is not added in this wallet. Approve Add network when prompted, then reconnect.`;
  }
  return `${prefix}: ${message}`;
}

export function isRateLimitError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("429") || message.includes("too many requests") || message.includes("rate limit");
}

export function isTransientRpcError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return (
    isRateLimitError(error) ||
    message.includes("failed to fetch") ||
    message.includes("http request failed") ||
    message.includes("networkerror") ||
    message.includes("timeout")
  );
}

export function compactErrorMessage(error: unknown) {
  const raw = errorMessage(error);
  const firstLine = raw.split("\n").find(Boolean) || raw;
  const lower = raw.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("http request failed") ||
    lower.includes("networkerror") ||
    lower.includes("timeout")
  ) {
    return "Arc RPC request failed. This is usually a temporary network/RPC issue. Refresh or try again in a few seconds.";
  }
  if (lower.includes("user rejected") || lower.includes("user denied")) return "Transaction rejected in wallet.";
  if (lower.includes("insufficient funds")) return "Insufficient wallet balance for this transaction. Check USDC for gas and the selected market token.";
  if (lower.includes("insufficientamountout") || lower.includes("0xe52970aa")) {
    return "Swap rate moved below the minimum receive amount. Nothing was exchanged. Get a fresh quote or select a higher price tolerance.";
  }
  if (lower.includes("transferfailed")) {
    return "Token transfer failed. Check the selected token balance and allowance before trying again.";
  }
  if (lower.includes("execution reverted")) {
    return "Transaction reverted by the contract. Check market status, amount, wallet permission, or open the transaction on Arcscan.";
  }
  if (lower.includes("contract interaction failed")) {
    return "Contract interaction failed. Check wallet balance, market status, contract address, or open the transaction details in your wallet.";
  }
  return firstLine.length > 220 ? `${firstLine.slice(0, 220)}...` : firstLine;
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function withRpcRetry<T>(request: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 0; attempt < RPC_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (!isTransientRpcError(error) || attempt === RPC_RETRY_ATTEMPTS - 1) {
        throw error;
      }

      const delay = RPC_RETRY_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }

  throw lastError;
}
