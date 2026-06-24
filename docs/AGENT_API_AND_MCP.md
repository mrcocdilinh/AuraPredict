# AuraPredict Agent API And MCP Surface

AuraPredict exposes a read-only agent surface for builders and AI agents on Arc Testnet. The goal is to make market data, source evidence, AI receipts, and oracle reputation easy to inspect without scraping the web app.

Production base URL:

```text
https://api.auraon.xyz
```

## Endpoints

```text
GET /api/agent
GET /api/agent/mcp
GET /api/agent/markets?limit=30&status=all&category=Crypto
GET /api/agent/markets/:marketId
GET /api/agent/markets/:marketId/action-preview
GET /api/oracle-reputation
GET /api/oracle-receipts/:marketId
GET /api/ai/hot-markets?limit=8
```

Well-known aliases:

```text
GET /.well-known/aurapredict-agent.json
GET /.well-known/aurapredict-mcp.json
```

## MCP-Style Tools

The `/api/agent/mcp` response publishes MCP-compatible tool metadata:

- `aurapredict.list_markets`
- `aurapredict.get_market`
- `aurapredict.preview_market_action`
- `aurapredict.get_oracle_reputation`

These tools are read-only. They do not propose, finalize, dispute, claim, or move funds.

## Example Usage

List recent markets:

```bash
curl "https://api.auraon.xyz/api/agent/markets?limit=20&status=live"
```

Get an evidence package for one market:

```bash
curl "https://api.auraon.xyz/api/agent/markets/89"
```

Preview the next safe workflow step:

```bash
curl "https://api.auraon.xyz/api/agent/markets/89/action-preview"
```

Read the Aura Oracle Agent reputation summary:

```bash
curl "https://api.auraon.xyz/api/oracle-reputation"
```

## Safety Model

- Public agent endpoints are read-only by default.
- Any onchain action still requires a connected wallet or an admin-authorized resolver endpoint.
- Aura Agent and oracle receipts are decision support. Final settlement still follows the contract, source evidence, dispute windows, and authority review.
- Low-confidence, stale, conflicting, or rule-mismatched evidence should be routed to manual review instead of automatic settlement.
