# AuraPredict

AuraPredict is an AI-assisted prediction market dapp built on Arc Testnet. It lets users create YES/NO markets, stake testnet USDC or EURC, review market evidence, and resolve outcomes through a mix of creator proposals, authority review, oracle checks, and dispute windows.

The project is a testnet MVP and a public builder project for the Arc ecosystem. It is not a financial product, broker, investment platform, or real-money betting service.

## What Is Included

- Solidity smart contract: `contracts/ArcPredictionMarket.sol`
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
- Oracle proposal flow for objective markets such as crypto prices, macro chart values, public health/status checks, and simple liquidity edge cases.
- Circle Agent Wallet support for authority/oracle proposal signing.
- Circle Gateway-based USDC funding utility for moving testnet USDC from supported source chains to Arc Testnet.
- In-app USDC/EURC swap helper using Circle App Kit first, with LI.FI fallback when available.
- Off-chain social data for profiles, comments, notifications, evidence links, and username reservations through the AuraPredict indexer.
- Public docs, risk disclosures, oracle policy, backtest sample, and frontend E2E coverage for core market flows.

## Active Testnet Deployment

AuraPredict currently targets the V4 contract on Arc Testnet:

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Active V4 contract: `0x3c853AE2eC705B453c9657569b6335e762631536`
- Archived V3 contract: `0x4399ea3f59AA14e4D19217f1af2aD0681f5FafFd`
- Arc native gas token: USDC
- Faucet: `https://faucet.circle.com`

New markets are created on V4. Older V3 markets still exist on the archived contract and can be accessed with `?deployment=v3` when needed.

## Quick Start

```bash
npm install
cp .env.example .env
npm run compile
npm test
npm run test:e2e
npm run oracle:backtest
npm run indexer
npm run dev
```

On Windows PowerShell, use `copy .env.example .env` instead of `cp`.

## Configuration

The app uses `.env` values for the active contract, Arc RPC, token addresses, WalletConnect, indexer URL, Circle App Kit, oracle automation, and signer settings.

For local development, start from `.env.example` and only fill in the services you actually use. The frontend can run directly against Arc RPC, while production is expected to use the AuraPredict indexer for faster market stats, leaderboard, history, profiles, comments, notifications, and evidence data.

Important production references:

- Frontend indexer URL: `https://api.aurapredict.xyz`
- Indexer health: `https://api.aurapredict.xyz/health`
- Indexer stats: `https://api.aurapredict.xyz/api/stats`

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

## Oracle And Resolution Flow

AuraPredict V4 separates market trading close time from event resolution time. Results cannot be proposed before the event resolution timestamp.

Supported resolution paths include:

- Creator proposal with dispute review
- Creator proposal with required authority review
- Authority/oracle-only proposal
- Adapter-only path for future oracle or committee integrations

The oracle layer can assist with objective markets such as crypto price checks, macro chart checks, status-page checks, and liquidity-related cancellation suggestions. The current confidence threshold is experimental and should be calibrated with historical backtests before any production-grade use.

For the full policy, see `docs/RISK_ORACLE_AND_QA.md`.

## Circle And Arc Integrations

AuraPredict uses Arc and Circle tooling in several places:

- Arc Testnet contract deployment and settlement.
- USDC as native gas on Arc.
- USDC/EURC market settlement assets.
- Circle Agent Wallet for authority/oracle proposal support.
- Circle Gateway funding utility for testnet USDC movement to Arc.
- Circle App Kit swap path when available, with LI.FI fallback.

Unified Balance funding is a convenience flow for getting USDC onto Arc Testnet. It does not change a market's selected settlement asset and does not convert USDC to EURC by itself.

## Docs Site

The `docs/` folder is a static documentation site intended for `docs.aurapredict.xyz`.

On Vercel, deploy it as a separate project from the same repository with:

- Root Directory: `docs`
- Framework: Other
- Build command: none

The main dapp should continue to deploy from the repository root.

## Test Markets

Sample V4 markets are available in:

```text
scripts/seed_markets_v4_test_20.json
```

Use the seed scripts only with a funded Arc Testnet wallet and after confirming the target contract address.

## Safety Notes

- This is a testnet MVP and has not been audited.
- Testnet tokens have no real value.
- AI, oracle checks, source routing, and automated proposals can be wrong, incomplete, delayed, or unavailable.
- Dispute windows and authority review are part of the safety model, not a replacement for audits, compliance, monitoring, or multisig governance.
- Each market settles only in its selected token. AuraPredict does not perform FX conversion between settlement assets.
- Do not use this project as financial, legal, investment, trading, or betting advice.
