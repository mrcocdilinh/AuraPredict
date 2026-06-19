# AuraPredict V5 Protocol Notes

V5 is the active AuraPredict contract branch. It is deployed on Arc Testnet and the frontend/indexer environment now points at the V5 address (`VITE_AURAPREDICT_V5_ADDRESS`). Older V3/V4 deployments remain readable by the indexer for historical markets only.

## Core Goals

- Owner-reviewed market creation: public creators submit drafts, and the owner must approve before a market accepts positions.
- Multi-token settlement: the asset registry supports USDC, EURC, and future stable assets with independent decimals, min stake, bonds, and fee settings.
- Multi-outcome markets: binary YES/NO markets are a two-outcome subset. V5 supports up to 32 outcomes per market.
- Per-market claims: users claim by market, and `claimMany` skips open, already-claimed, and losing markets instead of blocking the entire batch.
- Per-market accountability: creator, resolver, disputer, reporter, and oracle reputation updates are emitted per market.
- Report and cancel path: users can report bad markets; owner can accept a report, cancel/refund the market, and route creator/report bonds.
- Seedless-ready flow: V5 supports ERC-2771-style trusted forwarders so embedded wallets, smart accounts, and gas-sponsored relayers can submit user actions while preserving the user address on-chain.
- AI/oracle-ready flow: proposals include evidence hashes, receipt hashes, AI/oracle suggested outcomes, confidence, and adapter IDs.

## Deliberate V5 ABI Changes

V5 is not a drop-in ABI replacement for V4. To stay deployable under EVM code-size limits, V5 removes V4 compatibility wrappers such as `bet`, `resolve`, `finalizeDispute`, and long tuple views.

Use these V5 calls instead:

- Create binary or multi-outcome markets: `createMultiOutcomeMarket(MarketInput input)`
- User drafts: `submitMarketDraft(MarketInput input)`
- Stake: `placePosition(marketId, outcomeId, amount)`
- Propose result: `proposeOutcome(marketId, outcomeId, evidenceHash, receiptHash, aiOutcome, oracleOutcome, oracleConfidenceBps, oracleAdapterId)`
- Propose cancellation/refund: `proposeCancel(marketId, evidenceHash, receiptHash)`
- Finalize normal proposal: `finalize(marketId)`
- Authority final action: `finalizeOutcome(marketId, outcomeId, evidenceHash, receiptHash)`
- Claim one market: `claim(marketId)`
- Claim batch: `claimMany(marketIds)`

Read surfaces:

- `getMarket(marketId)`: compact market summary
- `getMarketV5(marketId)`: lifecycle, resolver, outcome, evidence, and receipt state
- `getMarketAudit(marketId)`: finalize readiness, authority requirement, conflict flags, AI/oracle hints
- `getOutcomePools(marketId)`: all outcome pools
- `getUserPosition(marketId, user)`: all outcome stakes plus claimed state
- `getClaimable(marketId, user)`: claimable amount for a single market
- `getRoleStats(account, role)`: per-role reputation stats

## Seedless Scope

The V5 contract is seedless-ready, not a full account system by itself.

To ship true Google/social login and no-Web3 UX, AuraPredict still needs an embedded wallet or smart-account provider plus relayer/paymaster infrastructure:

- Embedded/social wallet provider creates or recovers a user wallet.
- The user wallet approves settlement tokens or signs session permissions.
- A trusted forwarder or account abstraction relayer submits transactions and pays gas.
- Arc gas is USDC, so the relayer/paymaster must hold USDC and enforce spending limits.
- V5 `trustedForwarder` preserves the original user address for `placePosition`, `claim`, `submitMarketDraft`, `reportMarket`, and other supported calls.

Recommended production controls:

- Use a dedicated trusted forwarder, not a personal wallet.
- Cap sponsored gas per wallet/day and per action type.
- Require explicit user confirmation for stake, report, dispute, and claim actions.
- Keep owner/authority/finalizer paths out of seedless relays unless a multisig policy is added.

## Deploying V5

Set:

```bash
AURA_CONTRACT_VERSION=V5
ARC_USDC_TOKEN_ADDRESS=0x...
ARC_EURC_TOKEN_ADDRESS=0x...
MIN_STAKE_USDC=0.1
AURA_CREATOR_BOND_USDC=1
AURA_RESOLVER_BOND_USDC=1
AURA_DISPUTE_BOND_USDC=1
AURA_REPORT_BOND_USDC=1
AURA_MARKET_CREATION_FEE_USDC=0
AURA_PROTOCOL_FEE_BPS_USDC=0
AURA_CREATOR_FEE_BPS_USDC=0
AURA_TRUSTED_FORWARDER_ADDRESS=0x...
AURA_RESOLUTION_AUTHORITY_ADDRESS=0x...
AURA_ATTESTATION_SIGNER_ADDRESS=0x...
```

Then run:

```bash
npm run compile
npm run deploy:arc:v5
npm run abi:v5
```

After deployment, update the frontend/indexer contract address and ABI wiring to V5 before sending users to the new contract.

## Verification

V5 currently has Hardhat tests for:

- Owner approval before positions can be taken.
- 18-decimal future stable assets.
- Multi-outcome payout.
- `claimMany` skip behavior.
- Report/cancel with per-market bond reward.
- ERC-2771-style trusted forwarder seedless flow.

Run:

```bash
npx hardhat test test/ArcPredictionMarketV5.js
```
