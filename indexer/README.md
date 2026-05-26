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

The indexer reads `VITE_PREDICTION_MARKET_ADDRESS` from `.env`, detects V2 or V3 at startup, and applies the matching ABI. Optional overrides:

```bash
VITE_AURA_INDEXER_URL=http://127.0.0.1:8787
AURA_INDEXER_PORT=8787
AURA_INDEXER_HOST=127.0.0.1
AURA_INDEXER_START_BLOCK=0
AURA_INDEXER_CHUNK_SIZE=9000
```

If `AURA_INDEXER_START_BLOCK=0`, the indexer automatically finds the deployment block with `eth_getCode`, then scans logs from there. Arc RPC currently limits `eth_getLogs` ranges, so the default chunk size stays below that limit.

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
```

The frontend uses `VITE_AURA_INDEXER_URL` when available and falls back to direct Arc RPC reads if the indexer is offline.
When `VITE_AURA_INDEXER_URL` points to a live web service, the frontend also persists comments, evidence, follows, and profile metadata through these social endpoints. Static GitHub Pages exports remain read-only, so the app falls back to browser-local storage for social actions on that setup.
V3 settlement assets are restricted to 6-decimal stablecoins. If more than one asset such as USDC and EURC is used, cross-market totals are reported as stablecoin units; the indexer does not perform FX conversion.

## AI Resolution And V3 Receipts

AuraPredict keeps AI calculation off-chain and stores detailed AI resolution receipts in the indexer state. The receipt is public through the indexer API, while the contract controls proposal, review/dispute, finalization, cancellation, and claim flow. With V3, a proposal also commits `evidenceHash` and `aiReceiptHash` onchain, supports authority-review modes, and cannot be proposed before the market's onchain `resolutionTime`.

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

The indexer asks three AI reviewer roles for an evidence-based outcome, builds a consensus receipt, hashes the immutable decision payload, and stores it under `state.resolutions`. By default this only creates the receipt. It does not write onchain unless `propose` is true and `AURA_RESOLUTION_AUTO_PROPOSE=1`. For V3, zero-liquidity markets can be canceled without requesting AI and any automatic proposal waits for `resolutionTime`.

Required for AI receipts:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key
GEMINI_API_KEYS=gemini_key_1,gemini_key_2,gemini_key_3
AI_MODEL=gemini-2.5-flash
GEMINI_RATE_LIMIT_COOLDOWN_MS=120000
AURA_RESOLUTION_ADMIN_TOKEN=long_random_admin_token
```

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
AURA_RESOLVER_PRIVATE_KEY=0x...
AURA_RESOLUTION_MIN_CONFIDENCE=72
AURA_RESOLUTION_CONSENSUS_COUNT=2
```

Keep `AURA_RESOLUTION_AUTO_PROPOSE=0` until the resolver key and evidence policy are tested. If enabled, the private key must be the market resolver, contract owner, or configured `resolutionAuthority`.
When Gemini returns `429` (rate limit), the indexer puts that key on cooldown and rotates to the next key in `GEMINI_API_KEYS`. If all Gemini keys are cooling down or Gemini returns transient `5xx`, the indexer falls back to the configured provider if available.

`POST /api/resolutions/:marketId/run` always requires `AURA_RESOLUTION_ADMIN_TOKEN`. If `AURA_RESOLUTION_AUTO_RUN=1`, the indexer only auto-generates the first receipt for each closed unresolved market; use the admin endpoint with `force: true` to rerun after adding better evidence.

## Public Deploy

The production app at `https://app.aurapredict.xyz` needs a public indexer URL, not `127.0.0.1`.

## Free No-Card Option: GitHub Pages Static Indexer

This repo includes `.github/workflows/static-indexer.yml`.

Steps:

1. In GitHub, open `Settings` -> `Pages`.
2. Set `Build and deployment` source to `GitHub Actions`.
3. Open `Actions`.
4. Run `Publish static indexer`.
5. After it completes, test:

```text
https://mrcocdilinh.github.io/AuraPredict/api/stats.json
https://mrcocdilinh.github.io/AuraPredict/api/markets.json
```

Then set the frontend production env:

```bash
VITE_AURA_INDEXER_URL=https://mrcocdilinh.github.io/AuraPredict
VITE_PREDICTION_MARKET_START_BLOCK=43295581
```

This option is free and does not need a card. The tradeoff is that data refreshes on the GitHub Actions schedule, not instantly.

## Web Service Option

Recommended flow:

1. Deploy this repo as a separate web service named `aurapredict-indexer`.
2. Use Dockerfile: `Dockerfile.indexer`.
3. Start command is already handled by Docker: `npm run indexer`.
4. Set these environment variables on the indexer service:

```bash
VITE_PREDICTION_MARKET_ADDRESS=0x_your_active_contract_address
AURA_INDEXER_START_BLOCK=the_deployment_block_for_that_contract
AURA_INDEXER_CHUNK_SIZE=9000
AURA_INDEXER_POLL_MS=12000
```

Most hosts set `PORT` automatically. The indexer listens on `0.0.0.0` when `PORT` is present.

After the service is live, open:

```text
https://your-indexer-domain/health
https://your-indexer-domain/api/stats
```

Then set this on the frontend deployment, for example in Vercel:

```bash
VITE_AURA_INDEXER_URL=https://your-indexer-domain
VITE_PREDICTION_MARKET_START_BLOCK=43295581
```

Redeploy the frontend after changing env vars.

`render.yaml` intentionally does not hard-code the active contract address or deployment block; set both per deployment so switching V2 to V3 cannot silently point the indexer at stale markets.
For smooth production behavior, avoid free plans that sleep. If the host sleeps or has ephemeral storage, the indexer will recover by backfilling from `AURA_INDEXER_START_BLOCK`, but users may see slow data during cold starts.
