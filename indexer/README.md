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

The indexer reads the existing `VITE_PREDICTION_MARKET_ADDRESS` from `.env`. Optional overrides:

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
```

The frontend uses `VITE_AURA_INDEXER_URL` when available and falls back to direct Arc RPC reads if the indexer is offline.

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
VITE_PREDICTION_MARKET_ADDRESS=0x834f1DACA2c49D0231a8e640eb667AE0E1319311
AURA_INDEXER_START_BLOCK=43295581
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

For smooth production behavior, avoid free plans that sleep. If the host sleeps or has ephemeral storage, the indexer will recover by backfilling from `AURA_INDEXER_START_BLOCK`, but users may see slow data during cold starts.
