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
AURA_INDEXER_CHUNK_SIZE=9000
```

The active production contract and its initial block are pinned in `indexer/server.mjs` for the V4 cutover. Arc RPC currently limits `eth_getLogs` ranges, so the default chunk size stays below that limit.

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
V4 settlement assets are restricted to 6-decimal stablecoins. If more than one asset such as USDC and EURC is used, `/api/stats` includes `assetBreakdown` so volume and live liquidity can be reported per token instead of merged into one generic total. The indexer does not perform FX conversion.

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
AURA_ATTESTATION_PRIVATE_KEY=0x_optional_dedicated_ai_signer_key
```

Keep `AURA_RESOLUTION_AUTO_PROPOSE=0` until the resolver key and evidence policy are tested. If enabled, the private key must be the market resolver, contract owner, or configured `resolutionAuthority`.
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
```

The VPS stores server-only configuration at `/opt/aurapredict/.env` because `npm run indexer` is started from `/opt/aurapredict`. The process is managed by PM2 and listens internally on `127.0.0.1:8787`; Nginx exposes the HTTPS API domain.

```bash
cd /opt/aurapredict
pm2 restart aurapredict-indexer
curl https://api.aurapredict.xyz/health
```

Set this on the frontend deployment:

```bash
VITE_AURA_INDEXER_URL=https://api.aurapredict.xyz
VITE_PREDICTION_MARKET_START_BLOCK=44083985
```

Redeploy the frontend after changing env vars.

The V3 contract remains onchain for old market settlement and claims; the frontend exposes it through `?deployment=v3`, while the primary production indexer tracks V4.
