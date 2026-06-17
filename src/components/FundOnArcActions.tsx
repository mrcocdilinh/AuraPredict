import { ARC_FAUCET_URL, ARC_UNIFIED_BALANCE_URL } from "../constants";

export function FundOnArcActions({
  compact = false,
  targetSymbol = "USDC",
  onUnifiedBalance
}: {
  compact?: boolean;
  targetSymbol?: string;
  onUnifiedBalance?: () => void;
}) {
  const symbol = targetSymbol || "USDC";

  return (
    <div className={`fund-on-arc-actions${compact ? " compact" : ""}`}>
      <a className="fund-on-arc-primary" href={ARC_FAUCET_URL} target="_blank" rel="noreferrer">
        Fund on Arc
      </a>
      {onUnifiedBalance ? (
        <button className="fund-on-arc-secondary" type="button" onClick={onUnifiedBalance}>
          Unified Balance
        </button>
      ) : (
        <a className="fund-on-arc-secondary" href={ARC_UNIFIED_BALANCE_URL} target="_blank" rel="noreferrer">
          Unified Balance
        </a>
      )}
      {!compact && (
        <small>
          Need {symbol}? Claim testnet funds from Circle Faucet or move USDC from supported testnets with Arc Unified Balance.
        </small>
      )}
    </div>
  );
}
