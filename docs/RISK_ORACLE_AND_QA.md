# AuraPredict Risk, Oracle, And QA Policy

AuraPredict is an experimental Arc Testnet prediction market application. This document records the current risk posture, oracle operating policy, confidence calibration plan, and manual QA steps that cannot be fully automated without a real wallet signature.

## Legal And Risk Notice

AuraPredict is not a regulated exchange, broker, gambling platform, investment product, or financial adviser. Markets, prices, odds, AI outputs, oracle suggestions, source checks, and resolution reports are provided for testing and research only.

Testnet USDC and EURC have no real-world value. Smart contracts are unaudited and may contain bugs. AI and oracle systems may produce incorrect, incomplete, delayed, or unverifiable results. Market outcomes may depend on creator proposals, authority review, oracle adapters, dispute windows, source availability, and final reviewer actions.

Users should review each market question, source URL, fallback source, resolution rule, close time, resolution time, evidence, and trust assumptions before participating. Users remain responsible for their own wallet security, transaction approvals, and testnet activity.

## Current Trust Assumptions

- Contract: V4 on Arc Testnet, unaudited.
- Custody: user funds are held by the market contract, not by the frontend.
- Owner: currently a single protocol owner wallet.
- Authority: the active resolution authority can be operated by a Circle Agent Wallet.
- AI: Aura Agent is decision support, not a trustless oracle.
- Oracle: objective adapters can propose outcomes for supported market types, but auto-propose does not auto-finalize funded markets.
- Dispute: the 12-hour dispute window remains visible after a proposal.

Before any mainnet or real-value use, AuraPredict needs an independent contract audit, multisig or timelocked owner operations, durable backend storage, production monitoring, and a formally selected oracle/committee process.

## Oracle Committee And Reputation Policy

The production direction is to move from a single authority toward a committee or adapter-based authority set. Candidate oracle/committee operators should be evaluated by:

- Accuracy: share of resolved YES/NO/CANCEL proposals that matched the final reviewed outcome.
- Coverage: share of eligible markets where the operator produced a usable proposal.
- Reversal rate: share of proposals later corrected by dispute or authority review.
- Evidence quality: whether source URLs, timestamps, observed values, and hashes were complete enough for reviewers.
- Response time: time from `resolutionTime` to proposal.
- Scope discipline: whether the operator declined unsupported or ambiguous markets instead of guessing.

Suggested reputation tiers:

| Tier | Requirement |
| --- | --- |
| Candidate | Testnet-only operator with at least 20 reviewed proposals. |
| Trusted | At least 100 reviewed proposals, high evidence quality, low reversal rate. |
| Committee | Multisig/committee member selected by owner governance or an explicit operator policy. |
| Paused | Operator with repeated reversals, missing evidence, key compromise, or policy breach. |

The Owner/Oracle dashboard should eventually show these metrics per oracle address or adapter.

## Oracle 78% Confidence Backtest

`AURA_ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE=78` is an experimental threshold. It should be calibrated with historical objective markets before being treated as production-ready.

Backtest input rows should include:

```json
{
  "id": "btc-2026-06-03-0330",
  "adapter": "crypto-price",
  "oracleOutcome": "NO",
  "actualOutcome": "NO",
  "confidence": 91
}
```

Run:

```bash
npm run oracle:backtest
npm run oracle:backtest -- scripts/your_historical_oracle_dataset.json
```

The script reports coverage, accuracy, average confidence, and calibration gap across several thresholds, including 78%. A healthy threshold should keep enough coverage while maintaining a low reversal rate and a calibration gap that is not materially misleading.

## Frontend E2E Scope

The automated E2E suite uses mocked indexer data and mocked RPC responses. It checks that critical screens render and that users can reach:

- Create market form.
- Authority/oracle default resolution mode.
- Live market stake UI.
- Resolution/dispute/finalization surfaces.
- Finalized market claim state.
- Unified Balance funding modal, pending balance copy, and advanced retry controls.

The E2E suite intentionally does not sign real wallet transactions. Contract behavior remains covered by Hardhat tests, and live funding remains covered by the manual QA checklist below.

Run:

```bash
npm run test:e2e
```

## Unified Balance Manual QA Checklist

This flow must be tested with a real testnet wallet after deploy because Circle Gateway requires wallet signatures and cross-chain confirmation.

1. Open AuraPredict production with the latest deployed frontend.
2. Connect the same wallet on Arc Testnet.
3. Open Unified Balance from the wallet menu, Profile, Create Market, or market funding panel.
4. Confirm `Wallet USDC by chain` shows Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, and Arc Testnet.
5. Pick one source chain with testnet USDC.
6. Enter a small amount such as `1` USDC.
7. Click `Move USDC to Arc`.
8. Confirm the Gateway deposit in the wallet.
9. After the source-chain transaction confirms, verify the UI shows the deposit as `Pending` if Circle Gateway has not confirmed it yet.
10. Do not deposit again while pending.
11. Refresh until the selected source Gateway balance becomes confirmed.
12. If the spend/mint step did not complete automatically, open `Advanced recovery` and click `Retry spend to Arc`.
13. Confirm the spend/mint transaction.
14. Verify Arc Testnet wallet USDC increases.
15. Verify the recent activity log shows deposit and spend steps.

Failure handling:

- If source chain USDC was deducted but Arc did not receive USDC, wait for pending Gateway confirmation and retry spend. Do not run another deposit for the same amount.
- If the UI shows a browser SDK error, capture the console error, transaction hash, source chain, amount, and Gateway pending/confirmed state.
- If Arc USDC remains zero after a successful Gateway spend transaction, open a Circle/Arc support ticket with both transaction hashes and the connected wallet address.
