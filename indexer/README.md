# AuraPredict Indexer

Local backend/indexer for AuraPredict. It reads AuraPredict contract events on Arc Testnet, stores a JSON checkpoint, and exposes fast read APIs for the frontend.

It does not change or deploy any contract.

## Run

```bash
npm run indexer
```

One-time sync only:

```bash
npm run indexer:once
```

Default local API:

```text
http://127.0.0.1:8787
```

## Environment

The production indexer is pinned to AuraPredict V4 at `0x3c853AE2eC705B453c9657569b6335e762631536` from block `44083985`, detects its ABI at startup, and indexes the primary V4 market surface. Optional runtime settings:

```bash
VITE_AURA_INDEXER_URL=http://127.0.0.1:8787
AURA_INDEXER_PORT=8787
AURA_INDEXER_HOST=127.0.0.1
AURA_INDEXER_RPC_URLS=https://rpc.testnet.arc.network
AURA_INDEXER_WS_URL=wss://rpc.testnet.arc.network
AURA_INDEXER_WS_ENABLED=1
AURA_INDEXER_POLL_MS=60000
AURA_INDEXER_CHUNK_SIZE=100
AURA_ORACLE_AUTO_RUN=1
AURA_ORACLE_HTTP_TIMEOUT_MS=8000
AURA_ORACLE_AUTO_PROPOSE=0
AURA_ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE=78
AURA_ORACLE_AUTO_PROPOSE_ADAPTERS=crypto-price,macro-yahoo-chart,status-health,status-page,liquidity-rule
```

The active production contract and its initial block are pinned in `indexer/server.mjs` for the V4 cutover. Arc RPC currently limits `eth_getLogs` ranges and some public endpoints enforce daily quotas, so production should use one stable RPC plus WebSocket sync, a 60-second poll fallback, and a small `eth_getLogs` chunk.

## API

```text
GET /health
GET /api/stats
GET /api/markets
GET /api/markets/:id
GET /api/activity?limit=50
GET /api/leaderboard?period=all&metric=volume&limit=100
GET /api/users/:address
GET /api/sync
GET /api/social/markets/:id
POST /api/social/markets/:id/comments
POST /api/social/markets/:id/evidence
GET /api/social/profiles/:address
POST /api/social/profiles/:address
POST /api/social/profiles/:address/follows
GET /api/social/profiles/:address/notifications
POST /api/social/profiles/:address/notifications
GET /api/markets/:id/ai-insight
GET /api/oracles/:marketId
POST /api/oracles/:marketId/run
GET /api/oracle-receipts/:marketId
GET /api/oracle-reputation
GET /api/ai/hot-markets?limit=8
GET /api/embed/market/:marketId
```

The frontend uses `VITE_AURA_INDEXER_URL` when available and falls back to direct Arc RPC reads if the indexer is offline.
When `VITE_AURA_INDEXER_URL` points to a live web service, the frontend also persists comments, evidence, follows, profile metadata, and wallet notification history through these social endpoints. Static GitHub Pages exports remain read-only, so the app falls back to browser-local storage for social actions on that setup.
Profile usernames are normalized to lowercase `a-z`, `0-9`, and `_`, then reserved in `state.social.usernames` so two wallets cannot claim the same display name through the live indexer.
V4 settlement assets are restricted to 6-decimal stablecoins. If more than one asset such as USDC and EURC is used, `/api/stats` includes `assetBreakdown` so volume and live liquidity can be reported per token instead of merged into one generic total. The indexer does not perform FX conversion.

## Open Prediction Market Infrastructure

AuraPredict exposes a small public infrastructure layer for other Arc builders:

- `/api/markets/:id/ai-insight` compares market YES pricing with Aura's current probability estimate, possible edge, confidence, risk flags, and source basis.
- `/api/oracle-receipts/:marketId` returns the public AI/Oracle receipt: outcome, confidence, evidence rows, source URLs, hashes, dispute status, and tx references.
- `/api/oracle-reputation` summarizes Aura Oracle Agent coverage, confidence, final-match accuracy, reversal rate, evidence depth, adapter usage, and auto-propose history.
- `/api/ai/hot-markets` returns active markets with AI insight summaries for homepage, partner widgets, or bots.
- `/api/embed/market/:marketId` returns a compact HTML market card that can be used inside an iframe.

These endpoints are read-only. They do not propose, finalize, dispute, or claim funds.

## Objective Oracle Proposals

Oracle proposal v1 is deterministic offchain assistance for markets with objective data sources. It does not spend AI quota. By default it only writes a saved suggestion for the settlement report. When explicitly enabled, the indexer can also auto-submit the first onchain proposal through either a private-key resolver or a Circle Agent Wallet signer, but it still does not auto-finalize funded markets.

New V4 markets can include an `AURA_RULE_JSON` metadata line inside the onchain resolution rule. The indexer strips that line for human display, but uses it for adapter matching: asset, comparator, target, primary source, fallback source, close time, and resolution time. This keeps Aura Agent, Oracle proposals, resolver actions, and final-review reporting aligned on the same source rule.

Supported adapters:

- Liquidity rule: if YES pool or NO pool is empty, suggest `CANCEL` so the funded side can be refunded instead of awarding a one-sided market.
- Crypto price: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK through Binance 1-minute klines, with a near-time CoinGecko fallback only when exact minute data is unavailable.
- Macro chart: gold and DXY through Yahoo chart data near the market's `resolutionTime`.
- Health/status API: HTTP 200, JSON `ok: true`, and public status summary endpoints for supported services.
- Sports schedule count: MLB schedule-count markets such as "at least 10 scheduled MLB regular season games on June 7, 2026" are checked through MLB's public Stats API schedule endpoint instead of generic HTML scraping.
- Sports scoreboard evidence: ESPN structured scoreboards for MLB, NBA, NFL, NHL, FIFA World Cup, FIFA Club World Cup, and UEFA Champions League add candidate match/result rows before the AI reviewers run. These rows are evidence, not automatic onchain finalization.

The proposal is stored under `state.oracleProposals` and exposed at:

```text
GET /api/oracles/:marketId
POST /api/oracles/:marketId/run
```

Set `AURA_ORACLE_AUTO_RUN=0` to disable the automatic sweep for closed unresolved markets. Keep this enabled for public UX, because it gives reviewers a source-based suggestion before they choose a contract action.

Optional phase 2 auto-propose:

```bash
AURA_ORACLE_AUTO_PROPOSE=1
AURA_ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE=78
AURA_ORACLE_AUTO_PROPOSE_ADAPTERS=crypto-price,macro-yahoo-chart,status-health,status-page,liquidity-rule
AURA_RESOLVER_SIGNER_MODE=private-key
AURA_RESOLVER_PRIVATE_KEY=0x...
```

Auto-propose only runs after `resolutionTime`, only when no result has already been proposed, and only when the configured signer is allowed by that market's resolution mode. YES/NO auto-propose requires both YES and NO pools to be funded. One-sided markets can only auto-propose Cancel through the liquidity rule. The normal dispute window, owner review, and finalization buttons remain the source of final settlement.

Circle Agent Wallet signer mode:

```bash
AURA_RESOLVER_SIGNER_MODE=circle-cli
AURA_CIRCLE_AGENT_WALLET_ADDRESS=0x_your_agent_wallet
AURA_CIRCLE_CLI_PATH=circle
AURA_CIRCLE_AGENT_CHAIN=ARC-TESTNET
AURA_CIRCLE_EXECUTE_TIMEOUT_MS=60000
AURA_CIRCLE_WALLET_ADDRESS_FLAG=--address
```

In this mode the indexer sends proposal transactions through `circle wallet execute` instead of loading `AURA_RESOLVER_PRIVATE_KEY`. The Circle wallet still must be the market resolver, market authority, contract owner, or configured adapter for the market's resolution mode. For new Oracle-led markets, `Authority / oracle only` is the cleanest flow because the creator cannot front-run the authority path. Creator-led modes can still allow the authority signer to propose when no result has been proposed yet. The VPS session must already be authenticated with Circle CLI, usually with `circle wallet login your@email --testnet`, and production shells should set `CIRCLE_ACCEPT_TERMS=1` so the CLI does not pause on first use.

Manual API proposal is also gated:

```text
POST /api/oracles/:marketId/run
Authorization: Bearer your_admin_token
{ "propose": true }
```

Without `propose: true`, the endpoint only refreshes the saved Oracle suggestion and does not spend the resolver wallet.

## AI Resolution And V4 Receipts

AuraPredict keeps AI calculation off-chain and stores detailed AI resolution receipts in the indexer state. The receipt is public through the indexer API, while the contract controls proposal, review/dispute, finalization, cancellation, and claim flow. With V4, each market stores its primary source, fallback source, and resolution rule onchain. A proposal can also commit `evidenceHash` and `aiReceiptHash`, supports authority-review modes, and cannot be proposed before the market's onchain `resolutionTime`.

V4 supports an optional Aura attestation path. If `AURA_ATTESTATION_PRIVATE_KEY` is set on the indexer and the contract owner configures the matching public address with `setAiAttestationSigner`, the indexer can attach a signed AI suggestion to a receipt. A creator proposal that matches that signed suggestion can follow the normal dispute/finalize path. A proposal without a signed receipt, or a proposal that differs from Aura's signed suggestion, is routed to authority review. If the signer is not configured, the system stays in the current creator plus Aura plus owner-review mode.

Public read:

```text
GET /api/resolutions/:marketId
```

Admin run:

```text
POST /api/resolutions/:marketId/run
Authorization: Bearer your_admin_token
```

Request body:

```json
{
  "force": false,
  "propose": false
}
```

The indexer asks three AI reviewer roles for an evidence-based outcome, builds a consensus receipt, hashes the immutable decision payload, and stores it under `state.resolutions`. By default this only creates the receipt. It does not write onchain unless `propose` is true and `AURA_RESOLUTION_AUTO_PROPOSE=1`. For V4, zero-liquidity markets can be canceled without requesting AI and any automatic proposal waits for `resolutionTime`.

Required for AI receipts:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key
GEMINI_API_KEYS=gemini_key_1,gemini_key_2,gemini_key_3
AI_MODEL=gemini-2.5-flash
GEMINI_RATE_LIMIT_COOLDOWN_MS=120000
AURA_RESOLUTION_ADMIN_TOKEN=long_random_admin_token
```

Automatic evidence collection is enabled by default. Before Aura asks its reviewer models, the indexer scans the market's primary source, fallback source, URLs embedded in the question/rule, and a small registry of common official sources. This turns source checks into explicit evidence rows instead of asking the model to guess from memory.

```bash
AURA_AUTO_EVIDENCE_ENABLED=1
AURA_AUTO_EVIDENCE_TIMEOUT_MS=6000
AURA_AUTO_EVIDENCE_MAX_SOURCES=3
AURA_AUTO_EVIDENCE_MAX_ITEMS=80
AURA_AUTO_EVIDENCE_MAX_ROWS=16
```

The source router reads RSS/Atom feeds, sitemaps, JSON-LD, and visible page links. It currently helps by-deadline publish/announce/news/blog markets such as Circle/Arc/OpenAI blog checks, public status pages, and selected official government sources. If it finds a qualifying item before the resolution timestamp, Aura receives evidence that supports YES. For static publish/news/blog sources, a reachable no-match scan can support NO. For sports schedules, fixtures, scores, or other dynamic app pages, a generic no-match HTML scan is treated as inconclusive unless a structured adapter/API confirms the count or result. If matching items exist but no timestamp can be parsed, Aura is instructed to ask for manual review instead of inventing a result.

Optional evidence search can make Aura much better on dynamic sports/news pages where the primary URL is not parseable by simple HTML scanning. Set a search provider key; Aura will add search-result snippets and URLs as candidate evidence before asking the reviewer models. Candidate search rows are not treated as automatic truth: reviewers still have to match the URL/snippet to the market rule, timestamp, and source policy.

```bash
AURA_AUTO_EVIDENCE_SEARCH_ENABLED=1
AURA_AUTO_EVIDENCE_SEARCH_PROVIDER=tavily
AURA_AUTO_EVIDENCE_SEARCH_MAX_RESULTS=4
AURA_AUTO_EVIDENCE_SEARCH_TIMEOUT_MS=7000
TAVILY_API_KEYS=your_tavily_key_1,your_tavily_key_2,your_tavily_key_3

# Single-key fallback is also supported:
TAVILY_API_KEY=your_tavily_key

# Or use one of these providers instead:
BRAVE_SEARCH_API_KEY=your_brave_search_key
SERPAPI_API_KEY=your_serpapi_key
```

When `TAVILY_API_KEYS` is set, the indexer rotates across the comma-separated keys and tries the next key on quota/rate-limit or temporary search failures. `TAVILY_API_KEY` remains supported for simple one-key deployments.

After changing evidence search keys on the VPS, smoke-test one closed market without proposing onchain:

```bash
export AURA_SMOKE_MARKET_ID=89
export AURA_RESOLUTION_ADMIN_TOKEN=your_admin_token
npm run smoke:resolution
```

The smoke command calls `/api/resolutions/:marketId/run` with `force: true` and `propose: false`, so it refreshes the AI receipt only.

Optional provider fallback:

```bash
AI_FALLBACK_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
```

Optional automation:

```bash
AURA_RESOLUTION_AUTO_RUN=1
AURA_RESOLUTION_AUTO_PROPOSE=0
AURA_RESOLVER_SIGNER_MODE=private-key
AURA_RESOLVER_PRIVATE_KEY=0x...
AURA_RESOLUTION_MIN_CONFIDENCE=72
AURA_RESOLUTION_CONSENSUS_COUNT=2
AURA_ATTESTATION_PRIVATE_KEY=0x_optional_dedicated_ai_signer_key
```

Keep `AURA_RESOLUTION_AUTO_PROPOSE=0` until the resolver signer and evidence policy are tested. If enabled, the signer must be the market resolver, contract owner, or the authority captured on that market. Use the Circle Agent Wallet env block above when `AURA_RESOLVER_SIGNER_MODE=circle-cli`.
When Gemini returns `429` (rate limit), the indexer puts that key on cooldown and rotates to the next key in `GEMINI_API_KEYS`. If all Gemini keys are cooling down or Gemini returns transient `5xx`, the indexer falls back to the configured provider if available.

`POST /api/resolutions/:marketId/run` always requires `AURA_RESOLUTION_ADMIN_TOKEN`. If `AURA_RESOLUTION_AUTO_RUN=1`, the indexer only auto-generates the first receipt for each closed unresolved market; use the admin endpoint with `force: true` to rerun after adding better evidence.

## Public Deploy

The production app at `https://app.aurapredict.xyz` needs a public indexer URL, not `127.0.0.1`.

## Current VPS Service

The current public service runs on a VPS behind Nginx and HTTPS:

```text
https://api.aurapredict.xyz/health
https://api.aurapredict.xyz/api/stats
```

The current V4 address and block are pinned in `indexer/server.mjs`:

```bash
VITE_PREDICTION_MARKET_ADDRESS=0x3c853AE2eC705B453c9657569b6335e762631536
AURA_INDEXER_START_BLOCK=44083985
AURA_INDEXER_CHUNK_SIZE=9000
AURA_INDEXER_POLL_MS=12000
AURA_INDEXER_WS_URL=wss://rpc.testnet.arc.network
AURA_INDEXER_WS_ENABLED=1
```

The VPS stores server-only configuration at `/opt/aurapredict/.env` because `npm run indexer` is started from `/opt/aurapredict`. The process is managed by PM2 and listens internally on `127.0.0.1:8787`; Nginx exposes the HTTPS API domain.

```bash
cd /opt/aurapredict
pm2 restart aurapredict-indexer
curl https://api.aurapredict.xyz/health
npm run smoke:api
```

The indexer runs in hybrid mode when `AURA_INDEXER_WS_ENABLED=1`: WebSocket block notifications trigger fast syncs, while `AURA_INDEXER_POLL_MS` remains a fallback. `/health` exposes `indexer.mode`, `indexer.wsStatus`, `indexer.wsLastBlock`, and feature flags such as `features.socialReports`.

Set this on the frontend deployment:

```bash
VITE_AURA_INDEXER_URL=https://api.aurapredict.xyz
VITE_PREDICTION_MARKET_START_BLOCK=44083985
```

Redeploy the frontend after changing env vars.

The V3 contract remains onchain for old market settlement and claims; the frontend exposes it through `?deployment=v3`, while the primary production indexer tracks V4.
