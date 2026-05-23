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

Default API:

```text
http://127.0.0.1:8787
```

## Environment

The indexer reads the existing `VITE_PREDICTION_MARKET_ADDRESS` from `.env`. Optional overrides:

```bash
VITE_AURA_INDEXER_URL=http://127.0.0.1:8787
AURA_INDEXER_PORT=8787
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
