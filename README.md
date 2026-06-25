# AuraOn

AuraOn is an AI-assisted prediction market dapp built on Arc Testnet. It lets users create YES/NO markets, stake testnet USDC or EURC, review market evidence, and resolve outcomes through a mix of creator proposals, authority review, oracle checks, and dispute windows.

The project is a testnet MVP and a public builder project for the Arc ecosystem. It is not a financial product, broker, investment platform, or real-money betting service.

## What Is Included

- Solidity smart contracts: `contracts/ArcPredictionMarketV5.sol` is the active protocol; older V3/V4 contracts remain in the repo only for historical reference.
- Hardhat compile, test, and deploy scripts
- Vite + React frontend in `src/`
- Local backend/indexer in `indexer/`
- Static documentation site in `docs/`
- Deployment guide: `DEPLOY_AURAPREDICT.md`
- Risk, oracle, and QA policy: `docs/RISK_ORACLE_AND_QA.md`

## Current Features

- Arc Testnet prediction markets with configurable settlement asset per market.
- USDC and EURC support, with per-token volume and liquidity tracking.
- UTC-first market timing for close time, resolution time, dispute windows, and finalization.
- Market discovery views for live, ended, hot, fresh, and closing-soon markets.
- Activity ticker showing recent YES/NO stakes.
- Market detail pages with odds history, staking, evidence, comments, holders, activity, dispute, finalize, and claim surfaces.
- Aura Agent market drafting and result-review support.
- Deterministic market creation checks for source quality, UTC date mismatch, weekend stock close, and sports fixture/final-date risk.
- Oracle proposal flow for objective markets such as crypto prices, macro chart values, public health/status checks, and simple liquidity edge cases.
- Circle Agent Wallet support for authority/oracle proposal signing.
- Circle Gateway-based USDC funding utility for moving testnet USDC from supported source chains to Arc Testnet.
- In-app USDC/EURC swap helper using Circle App Kit first, with LI.FI fallback when available.
- Off-chain social data for profiles, comments, notifications, evidence links, and username reservations through the AuraOn indexer.
- Read-only Agent API and MCP-style tool metadata for external AI agents and Arc builders.
- Owner dashboard queues for reports, pending proposals, finalization, dispute/authority review, and flagged market-risk badges.
- Public docs, risk disclosures, oracle policy, backtest sample, and frontend E2E coverage for core market flows.
- Active V5 protocol with owner-reviewed drafts, multi-outcome markets, settlement-token registry, per-market batch claims, report/cancel bonds, AI/oracle receipts, Agent API metadata, and ERC-2771 seedless-ready forwarding.
- Seedless login path for Magic embedded wallets using Google popup or email OTP when `VITE_SEEDLESS_ENABLED=1` and `VITE_MAGIC_PUBLISHABLE_KEY` are configured.

## Active Testnet Deployment

AuraOn now targets the deployed V5 contract surface:

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Active V5 contract: `0xb3B74ee71a02a25eB668A6206ed3F74b3444611A`
- V5 deployment block: `47380000`
- Arc native gas token: USDC
- Faucet: `https://faucet.circle.com`

New markets are created through the V5 owner-reviewed draft flow. See `docs/V5_PROTOCOL.md`.

## Quick Start

```bash
npm install
cp .env.example .env
npm run compile
npm test
npm run test:e2e
npm run oracle:backtest
npm run smoke:api
npm run indexer
npm run dev
```

On Windows PowerShell, use `copy .env.example .env` instead of `cp`.

## Configuration

The app uses `.env` values for the active contract, Arc RPC, token addresses, WalletConnect, indexer URL, Circle App Kit, oracle automation, and signer settings.

For local development, start from `.env.example` and only fill in the services you actually use. The frontend can run directly against Arc RPC, while production is expected to use the AuraOn indexer for faster market stats, leaderboard, history, profiles, comments, notifications, and evidence data.

Important production references:

- Frontend indexer URL: `https://api.auraon.xyz`
- Indexer health: `https://api.auraon.xyz/health`
- Indexer stats: `https://api.auraon.xyz/api/stats`
- Agent API manifest: `https://api.auraon.xyz/api/agent`
- MCP-style tool metadata: `https://api.auraon.xyz/api/agent/mcp`

Do not commit `.env`, private keys, API keys, Circle credentials, or wallet secrets.

## Indexer

The indexer reads Arc contract events and exposes faster API surfaces for:

- Market stats
- Leaderboard
- Trade history
- Activity ticker
- Social profiles
- Comments
- Notifications
- Evidence links
- Oracle review receipts

For setup details, see `indexer/README.md`.

## Agent API

AuraOn publishes read-only agent endpoints for market discovery, evidence packages, oracle receipts, oracle reputation, and next-action previews. These endpoints are designed for AI agents and partner widgets; they do not propose, finalize, dispute, claim, or move funds.

Market reports also have an owner-review lifecycle (`open`, `resolved`, `flagged`, `dismissed`) so bad-source or bad-rule reports can be tracked without leaving stale warnings open forever.

See `docs/AGENT_API_AND_MCP.md`.

## Oracle And Resolution Flow

AuraOn V5 separates market trading close time from event resolution time. Results cannot be proposed before the event resolution timestamp, and public market creation now goes through owner review before a market becomes live.

Supported resolution paths include:

- Creator proposal with dispute review
- Creator proposal with required authority review
- Authority/oracle-only proposal
- Adapter-only path for future oracle or committee integrations

The oracle layer can assist with objective markets such as crypto price checks, macro chart checks, status-page checks, and liquidity-related cancellation suggestions. The current confidence threshold is experimental and should be calibrated with historical backtests before any production-grade use.

For the full policy, see `docs/RISK_ORACLE_AND_QA.md`.

## Circle And Arc Integrations

AuraOn uses Arc and Circle tooling in several places:

- Arc Testnet contract deployment and settlement.
- USDC as native gas on Arc.
- USDC/EURC market settlement assets.
- Circle Agent Wallet for authority/oracle proposal support.
- Circle Gateway funding utility for testnet USDC movement to Arc.
- Circle App Kit swap path when available, with LI.FI fallback.

Unified Balance funding is a convenience flow for getting USDC onto Arc Testnet. It does not change a market's selected settlement asset and does not convert USDC to EURC by itself.

## Docs Site

The `docs/` folder is a static documentation site intended for `docs.auraon.xyz`.

On Vercel, deploy it as a separate project from the same repository with:

- Root Directory: `docs`
- Framework: Other
- Build command: none

The main dapp should continue to deploy from the repository root.

## Test Markets

Legacy V4 sample markets remain available for regression testing only:

```text
scripts/seed_markets_v4_test_20.json
```

Use the seed scripts only with a funded Arc Testnet wallet and after confirming the target contract address.

## Safety Notes

- This is a testnet MVP and has not been audited.
- Testnet tokens have no real value.
- AI, oracle checks, source routing, and automated proposals can be wrong, incomplete, delayed, or unavailable.
- Dispute windows and authority review are part of the safety model, not a replacement for audits, compliance, monitoring, or multisig governance.
- Each market settles only in its selected token. AuraOn does not perform FX conversion between settlement assets.
- Do not use this project as financial, legal, investment, trading, or betting advice.
