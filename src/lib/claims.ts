export type ClaimAllFailure = {
  marketId: number;
  message: string;
};

export function claimAllResultNotice(claimedCount: number, skippedCount: number, failedClaims: ClaimAllFailure[]) {
  const failedLabel =
    failedClaims.length > 0
      ? `, ${failedClaims.length} failed (${failedClaims.map((item) => `#${item.marketId}`).join(", ")})`
      : "";
  return `Claim all finished: ${claimedCount} claimed, ${skippedCount} already updated/skipped${failedLabel}.`;
}
