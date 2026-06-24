# AuraPredict Full Handoff - 2026-06-17

This handoff is for a new coding agent continuing AuraPredict. It summarizes the practical project history, current architecture, deployments, environment variables, known issues, decisions already made, and next steps. Do not assume any private keys or API keys in screenshots are safe to reuse or expose. Never commit `.env`, local private keys, or local bot tools unless the user explicitly requests it.

## Current Project

- Repo: `https://github.com/mrcocdilinh/AuraPredict`
- App: `https://app.auraon.xyz/`
- API/indexer: `https://api.auraon.xyz/`
- VPS: `/opt/aurapredict` on `root@14.225.218.99`
- Main local workspace: `C:\Users\admin\Documents\Codex\2026-06-02\files-mentioned-by-the-user-aurapredict-2\work\AuraPredict`
- Current direction: fully move from V4 to V5, with a more mobile-first, seedless/login-friendly prediction market app on Arc Testnet.

## Product Direction

AuraPredict is an AI-assisted prediction market dapp on Arc Testnet. The user wants it to evolve toward:

- Mobile-first market browsing and betting, closer in usability to Polymarket/Opinion mobile.
- Seedless onboarding: login with Google/email/social/wallet, create or attach an Arc wallet, then trade from one account.
- Owner-reviewed market creation in V5: public users should not publish markets directly without owner approval.
- Multi-token stablecoin support, not hard-coded only to USDC/EURC. Future country-specific stablecoins should be supportable.
- Strong AI/oracle support with objective evidence search, source adapters, rule linting, anti-wrong-finalization safeguards, and agent-readable APIs.
- Per-market reputation and rewards/penalties for creators, resolvers, disputers, and reviewers.
- Better claim accounting. V4 had a broad per-user claim pattern that could make one action cover multiple markets; V5 should support clearer per-market claim/reward logic.
- Agent compatibility: public read-only APIs, market/action preview endpoints, MCP-style manifest, oracle reputation endpoint, and safe "read-only by default" agent access.

## Contract History And Current Contract State

V4 was the long-running contract:

- Old V4 contract frequently referenced: `0x3c853AE2eC705B453c9657569b6335e762631536`
- Older/V3-like contract seen in production at one point: `0x2C9101983100185691E1AdC8E4C92Cdf4192184D`
- V5 deployed contract now used for new direction: `0xb3B74ee71a02a25eB668A6206ed3F74b3444611A`
- V5 deployment block used in env: `47380000`

Important V5 env keys that must point to the V5 contract:

```env
PREDICTION_MARKET_ADDRESS=0xb3B74ee71a02a25eB668A6206ed3F74b3444611A
AURA_INDEXER_CONTRACT_ADDRESS=0xb3B74ee71a02a25eB668A6206ed3F74b3444611A
VITE_PREDICTION_MARKET_ADDRESS=0xb3B74ee71a02a25eB668A6206ed3F74b3444611A
VITE_AURAPREDICT_V5_ADDRESS=0xb3B74ee71a02a25eB668A6206ed3F74b3444611A
START_BLOCK=47380000
AURA_INDEXER_START_BLOCK=47380000
VITE_PREDICTION_MARKET_START_BLOCK=47380000
VITE_AURAPREDICT_V5_DEPLOYMENT_BLOCK=47380000
```

There was repeated VPS confusion where PM2 still loaded stale env or old data. The current robust approach is:

- Use `ecosystem.config.cjs` for PM2.
- Ensure PM2 process env actually includes V5 address and start block.
- If old index JSON blocks V5 indexing, back it up and remove/rebuild it.
- Check `/health` shows the V5 contract address and live market count > 0.

## V5 Goals That Were Requested

The user wants V5 to avoid repeated future contract migrations. Requested V5 contract/product capabilities:

- Owner-approved market creation.
- Multi-token settlement support.
- Better per-market claim/reward accounting.
- Per-market creator/resolver/disputer/reviewer reputation.
- Creator bonds / dispute bonds / protocol fees where applicable.
- Review/dispute logic that is clear and bounded per market, not vague global state.
- Owner/admin cancellation/refund path with visible reason.
- Report market flow for users to flag bad markets before end.
- Better multi-choice market support planned for future, but binary YES/NO remains current foundation unless V5 already supports more.
- AI/oracle compatible metadata and source URLs.
- Mobile app and seedless login support.

## Resolution Modes

The UI has three resolution modes:

1. Creator + dispute review
   - Creator/resolver proposes result after resolution time.
   - Users can dispute during dispute window.
   - Finalization after window if no dispute or after review path.

2. Creator + required authority review
   - Creator/resolver can propose, but owner/authority review is required.
   - Used when market needs human/authority confirmation.

3. Authority / oracle only
   - The owner/oracle/authority path controls resolution.
   - Auto-oracle can propose only when confidence is high enough and adapter supports it.
   - The current auto-propose threshold has used `AURA_ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE=78`.

Important past issue: owner wallet can sometimes shortcut review/finalize paths by design. The UI should explain why a market is under authority review and should avoid surprising "Final" status.

## AI And Oracle Work

Major work has been done around AI/oracle:

- Gemini provider is used (`AI_PROVIDER=gemini`, usually `AI_MODEL=gemini-2.5-flash`).
- Multiple `GEMINI_API_KEYS` can be comma-separated for rotation.
- Tavily evidence search was added because plain LLM answers were not enough.
- `TAVILY_API_KEYS` can be comma-separated, currently user used 3 keys.
- Evidence search env:

```env
AURA_AUTO_EVIDENCE_ENABLED=1
AURA_AUTO_EVIDENCE_MAX_SOURCES=3
AURA_AUTO_EVIDENCE_MAX_ITEMS=80
AURA_AUTO_EVIDENCE_SEARCH_ENABLED=1
AURA_AUTO_EVIDENCE_SEARCH_PROVIDER=tavily
AURA_AUTO_EVIDENCE_SEARCH_MAX_RESULTS=4
AURA_AUTO_EVIDENCE_SEARCH_TIMEOUT_MS=7000
AURA_AUTO_EVIDENCE_MAX_ROWS=16
TAVILY_API_KEYS=key1,key2,key3
```

Oracle improvements already requested/partly implemented:

- Source-aware evidence search.
- Sports adapters, especially FIFA/ESPN/MLB/NBA patterns.
- Crypto price adapter for Binance/CoinMarketCap/CoinGecko style rules.
- Rule parsing/linting: comparator mismatches, target values, exact timestamp/daily close vs minute close mismatch.
- Preflight/action preview to block unsafe propose/finalize actions when evidence conflicts with rule.
- Owner audit badges: safe to finalize / needs review / conflict detected.
- Regression script for oracle checks.

Critical past bug:

- Markets 79/80/81 around BTC/ETH/SOL had oracle saying YES when observed price was clearly below threshold.
- Root cause was comparator/rule-target parsing confusion, especially "closes strictly above/greater than" vs internal `gte 0` fallback.
- Fix direction: never auto-propose if parsed comparator/threshold/rule cannot be reconciled; require exact rule value and timestamp; downgrade to conflict/needs review if adapter sees a different threshold or comparator.

Another past AI issue:

- FIFA/Mexico opening match: ChatGPT/Gemini could answer YES, but Aura AI originally said insufficient evidence because source scanning missed/failed timestamp proof.
- Tavily evidence search improved this by gathering web snippets and source candidates.
- Still, official source parsing can be weak. The system should prefer official source, then reliable fallback source if rule allows it, and clearly state confidence/risk.

## Indexer/API

Indexer lives in `indexer/server.mjs`.

Health endpoints:

- Local VPS: `curl http://127.0.0.1:8787/health`
- Public: `curl https://api.auraon.xyz/health`

Expected healthy V5 health:

- `ok: true`
- `contractAddress: 0xb3B74ee71a02a25eB668A6206ed3F74b3444611A`
- `chainId: 5042002`
- `indexer.mode: websocket+polling`
- `wsStatus: connected`
- `marketCount` should reflect V5 markets, not 0 after sync.
- `features.evidenceSearch.configured: true` if Tavily env is loaded.

Indexer sync problems encountered:

- QuickNode daily request limit reached on `https://rpc.testnet.arc.network`.
- Blockdaemon endpoint had "block range extends beyond current head block"; was removed from RPC list.
- `rpc-testnet.arc.io` DNS ENOTFOUND; do not use.
- `rpc.drpc.testnet.arc.network` free tier timeout.
- Current commonly used RPC/WS:
  - `RPC_URL=https://rpc.testnet.arc.network`
  - `ARC_RPC_URL=https://rpc.testnet.arc.network`
  - `AURA_INDEXER_RPC_URLS=https://rpc.testnet.arc.network`
  - `AURA_INDEXER_WS_URL=wss://rpc.testnet.arc.network`

Indexer polling was increased to reduce RPC load:

```env
AURA_INDEXER_POLL_MS=60000
AURA_INDEXER_CHUNK_SIZE=100
```

If VPS PM2 still shows old contract:

1. Check effective env:
   ```bash
   PID=$(pm2 pid aurapredict-indexer)
   tr '\0' '\n' < /proc/$PID/environ | grep -E "AURA_INDEXER_CONTRACT_ADDRESS|PREDICTION_MARKET_ADDRESS|START_BLOCK"
   ```

2. Check code start block:
   ```bash
   grep -n "const START_BLOCK" -A2 -B2 indexer/server.mjs
   ```

3. Restart with ecosystem:
   ```bash
   cd /opt/aurapredict
   pm2 delete all
   rm -f /opt/aurapredict/indexer/data/aurapredict-index.json
   npm ci
   pm2 start ecosystem.config.cjs --update-env
   sleep 10
   curl http://127.0.0.1:8787/health
   curl https://api.auraon.xyz/health
   ```

Note: If `marketCount:0` and `lastIndexedBlock` stays deployment block while WS says connected, wait for logs or ensure V5 ABI/events match the deployed contract.

## Agent API / MCP Direction

The API now has an agent-facing direction:

- `/api/agent`
- `/api/agent/markets`
- `/api/agent/markets/:marketId`
- `/api/agent/markets/:marketId/action-preview`
- `/api/agent/mcp`
- `/api/oracle-reputation`
- `/api/oracle-receipts/:marketId`

Agent policy:

- Read-only by default.
- Write actions should still require a connected wallet or admin-authorized resolver endpoint.
- Agent responses are decision support only. Final settlement follows contract, evidence, dispute windows, and authority review.

## Notifications And Claim Work

A lot of work went into notifications:

- The user reported notifications were slow or missing.
- Indexer-backed historical notifications caused reliability/RPC pressure issues.
- Current preference from user: notifications should be complete and fast, but not necessarily permanently archived on VPS.
- Dismissed/read notifications can disappear after interaction.
- Profile history should be optimized and easier to read: show bets, win/loss, claim status, payouts.

Claim issues:

- "Claim all" sometimes missed some winning markets.
- Some wallets had claim available not showing quickly.
- User wants claim-all to process all claimable markets robustly.
- V5 should make per-market claim logic clearer; V4 claim accounting was confusing because one action could clear across markets.

Relevant code added earlier:

- `src/lib/claims.ts` existed from a prior claim improvement.

## Market Creation Tools

Local-only tools were created under `.local-aura-tools`. These should not be committed unless the user explicitly asks.

Tools included:

- Batch market creator script using PowerShell/env private key.
- Random participation bot:
  - Reads many private keys from `.local-aura-tools/private_keys.txt`.
  - Can run one wallet or up to five wallets concurrently.
  - Scans unjoined markets and bets a percentage of token balance randomly YES/NO.
  - User wanted it local only, not pushed.

PowerShell note:

- `npm run ...` can fail due to execution policy. Use:
  ```powershell
  npm.cmd run create:markets:30
  ```

Private key format:

- Must be a full 32-byte EVM private key, usually `0x` + 64 hex chars. A wallet address is not a private key.

## UI / Design Work

Brand/logo:

- New Aura logo assets were added under `public/`:
  - `aurapredict-logo-192.png`
  - `aurapredict-logo-512.png`
  - `aurapredict-logo-64.png`
  - `aurapredict-og.png`
  - favicon and apple touch icons
- UI was adjusted to use new logo and favicon.

Design direction:

- The user wants Aura to feel modern, Arc-like, and prediction-market friendly.
- Recent UI trend requested: mobile-first, simpler, bottom tabs, less long/complex sections.
- User showed Polymarket/Opinion mobile examples:
  - Top compact header.
  - Market cards/list.
  - Category tabs.
  - Bottom nav.
  - Market detail broken into tabs instead of a long page.

Auth modal:

- A seedless auth modal was added.
- User disliked cyan-heavy colors.
- Latest commit changed auth modal/toast toward Polymarket-like neutral dark:
  - Dark neutral panels.
  - Blue primary CTA.
  - Less cyan glow.
  - Toast errors clearer.
- Magic hosted popup is white and cannot be styled by Aura CSS.

## Seedless Login / Magic

The user wants login like Polymarket:

- Continue with Google.
- Email login.
- Wallet login (MetaMask, Rabby, WalletConnect, etc.).
- Every account should get/attach an Arc wallet.
- User can fund/faucet into internal wallet and operate like a normal trading app.

Current implementation status:

- Frontend has seedless modal and Magic SDK-based login attempt.
- Env requires:

```env
VITE_SEEDLESS_ENABLED=1
VITE_MAGIC_PUBLISHABLE_KEY=pk_live_or_pk_test_from_magic
```

Current Magic errors seen:

1. `First App has not approved access for https://app.auraon.xyz.`
   - Fix in Magic dashboard:
     - Add/approve `https://app.auraon.xyz` under Allowed Origins.
     - Add/approve redirect for `https://app.auraon.xyz` if required.
     - Save.

2. `Magic RPC Error: [-32603] RPC route not enabled or provider not supported`
   - Fix in Magic dashboard:
     - Enable Google/social login provider for the app.
     - Configure Google OAuth Client ID/Secret if Magic requires it.
     - Enable Email login/OTP.

Magic dashboard notes:

- User has a Magic publishable key like `pk_live_...`.
- In Magic "Allowed Origins & Redirects", enable Domain and add:
  ```txt
  https://app.auraon.xyz
  ```
- For redirects, if Magic requires exact redirect, add:
  ```txt
  https://app.auraon.xyz
  ```
  and any callback path the code uses if introduced later.

Important limitation:

- Full gas sponsorship / no-Web3 UX is not just a frontend modal. It needs a relayer/paymaster/trusted forwarder or an account abstraction design, plus backend policy and security.
- Arc/Circle App Kit may help with wallets and user ops depending on Arc support, but contract support for meta-transactions or a relayer path must be explicit.

## Circle / Arc / Swap History

The app integrated Arc Testnet and Circle App Kit/Li.FI exploration:

- User contacted Arc/Circle support about swap quote failures.
- Error: LI.FI "No quotes available" / "There is not enough liquidity. Amount is too high."
- Circle support asked which SDK version was used and whether latest.
- Swap route likely failed due to testnet liquidity/route availability rather than app amount alone.

Arc/USDC/EURC:

- Current settlement tokens used include USDC/EURC.
- V5 should be multi-token-ready.
- User wants future stablecoin support beyond USDC/EURC.

## Important Env Variables

Frontend/Vercel:

```env
VITE_PREDICTION_MARKET_ADDRESS=0xb3B74ee71a02a25eB668A6206ed3F74b3444611A
VITE_AURAPREDICT_V5_ADDRESS=0xb3B74ee71a02a25eB668A6206ed3F74b3444611A
VITE_PREDICTION_MARKET_START_BLOCK=47380000
VITE_AURAPREDICT_V5_DEPLOYMENT_BLOCK=47380000
VITE_AURA_INDEXER_URL=https://api.auraon.xyz
VITE_CIRCLE_APP_KIT_KEY=...
VITE_SEEDLESS_ENABLED=1
VITE_MAGIC_PUBLISHABLE_KEY=...
```

VPS/indexer:

```env
PORT=8787
HOST=127.0.0.1
CHAIN_ID=5042002
RPC_URL=https://rpc.testnet.arc.network
ARC_RPC_URL=https://rpc.testnet.arc.network
AURA_INDEXER_RPC_URLS=https://rpc.testnet.arc.network
AURA_INDEXER_WS_URL=wss://rpc.testnet.arc.network
AURA_INDEXER_WS_ENABLED=1

PREDICTION_MARKET_ADDRESS=0xb3B74ee71a02a25eB668A6206ed3F74b3444611A
AURA_INDEXER_CONTRACT_ADDRESS=0xb3B74ee71a02a25eB668A6206ed3F74b3444611A
START_BLOCK=47380000
AURA_INDEXER_START_BLOCK=47380000
AURA_INDEXER_POLL_MS=60000
AURA_INDEXER_CHUNK_SIZE=100

AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEYS=...
GEMINI_RATE_LIMIT_COOLDOWN_MS=25000
AURA_ORACLE_AUTO_PROPOSE=1
AURA_ORACLE_AUTO_PROPOSE_MIN_CONFIDENCE=78
AURA_RESOLVER_SIGNER_MODE=circle-cli

AURA_CIRCLE_AGENT_WALLET_ADDRESS=...
AURA_CIRCLE_CLI_PATH=circle
AURA_CIRCLE_AGENT_CHAIN=ARC-TESTNET
AURA_CIRCLE_EXECUTE_TIMEOUT_MS=60000
AURA_CIRCLE_WALLET_ADDRESS_FLAG=--address
CIRCLE_ACCEPT_TERMS=1

AURA_RESOLUTION_AUTO_PROPOSE=0
AURA_RESOLUTION_ADMIN_TOKEN=...

AURA_AUTO_EVIDENCE_ENABLED=1
AURA_AUTO_EVIDENCE_MAX_SOURCES=3
AURA_AUTO_EVIDENCE_MAX_ITEMS=80
AURA_AUTO_EVIDENCE_SEARCH_ENABLED=1
AURA_AUTO_EVIDENCE_SEARCH_PROVIDER=tavily
AURA_AUTO_EVIDENCE_SEARCH_MAX_RESULTS=4
AURA_AUTO_EVIDENCE_SEARCH_TIMEOUT_MS=7000
AURA_AUTO_EVIDENCE_MAX_ROWS=16
TAVILY_API_KEYS=...
```

Do not expose:

- Private keys.
- Gemini keys.
- Tavily keys.
- Magic secret key.
- Admin token.

## Deployment / VPS Routine

Typical deploy:

```bash
cd /opt/aurapredict
git pull origin main
npm ci
pm2 restart aurapredict-indexer --update-env
sleep 10
curl http://127.0.0.1:8787/health
curl https://api.auraon.xyz/health
```

If package-lock conflicts on VPS:

- This happened after `npm install` changed `package-lock.json` locally on VPS.
- Prefer `npm ci`.
- If local VPS changes block pull and are not needed, inspect first:
  ```bash
  git status --short
  ```
- If only generated package-lock changes on VPS and repo version should win, use a safe restore only after confirming:
  ```bash
  git restore package-lock.json
  git pull origin main
  npm ci
  ```

## Tests / Build

Useful commands:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
```

Build warnings seen often:

- Vite CJS Node API deprecated.
- Rollup PURE annotation warnings in `node_modules`.
- Empty vendor chunks generated.

These warnings have not usually blocked build.

Audit:

- `npm audit` has repeatedly shown vulnerabilities (counts changed over time, e.g. 35-66). User asked what this meant.
- Do not blindly run `npm audit fix --force` because it may break dependencies.
- Prior advice: review dependency tree and only update safely after features stabilize.

## Known Open Issues / Risks

1. Magic configuration is still external.
   - Code is ready to show better errors, but Magic dashboard must approve domain and enable login methods.

2. V5 indexer may still need full verification after contract switch.
   - Check public health and market count.
   - Ensure Vercel env also points frontend to V5.

3. Seedless full UX is not finished until transaction signing/gas sponsorship is solved.
   - Current login modal is not enough for fully no-Web3 trading.
   - Need relayer/paymaster/trusted forwarder or AA plan.

4. Mobile market detail needs deeper simplification.
   - Requested bottom tab navigation and compact tabbed market detail like Polymarket/Opinion.

5. Oracle quality requires ongoing adapters.
   - Crypto improved, sports partially improved.
   - Stocks/Yahoo adapter was requested.
   - Macroeconomic/BLS/FRED style adapters should be added.
   - Weather/politics/source-specific adapters may be needed later.

6. Claim and notifications should be rechecked on V5.
   - V4 had slow/missing notification behavior under indexer/RPC pressure.
   - Claim-all sometimes missed markets.

7. V5 contract migration means old markets remain on old contracts.
   - If app fully switches to V5, old V4/V3 markets are not in current market list unless a legacy view is retained.

8. Security review is needed before any mainnet-like use.
   - Owner powers, cancellation, relayer, seedless custody, and admin token all need clear security boundaries.

## Recent Commits / Work Highlights

Recent notable work includes:

- V5 contract ABI and frontend/indexer switch scaffolding.
- Agent API and MCP-style docs.
- Oracle action preview and safer checks.
- New logo and favicon assets.
- Auth modal and Magic seedless login UI.
- Polymarket-like auth modal color cleanup:
  - Commit `f4a8404`: `style: align seedless auth with trading UI`
- V5 deployment/indexer config pushes around the V5 contract.

## How To Continue Safely

Before changing code:

1. Check repo status:
   ```bash
   git status --short
   ```

2. Check current contract config:
   ```bash
   grep -R "0x3c853AE2eC705B453c9657569b6335e762631536\|0x2C9101983100185691E1AdC8E4C92Cdf4192184D" -n src indexer docs .github README.md DEPLOY_AURAPREDICT.md
   ```
   Any old contract reference in docs may be historical; any old reference in runtime env/source should be investigated.

3. Build:
   ```bash
   npm.cmd run build
   ```

4. If changing UI, verify desktop/mobile with browser/Playwright screenshots.

5. Do not commit local screenshots, `.env`, `.local-aura-tools`, private key files, or generated bot run logs.

6. Only push when user asks or the current task explicitly includes push.

## User Preferences

- User usually wants direct action, not long proposals.
- User often asks "push di" after fixes.
- User prefers concise Vietnamese explanations.
- User dislikes AI-looking long fluff.
- User wants practical exact commands, especially for VPS/nano/env.
- User wants warnings surfaced clearly when external dashboard config is required.
- User cares strongly about:
  - Oracle correctness.
  - Notification reliability.
  - Claim correctness.
  - Mobile UX.
  - No repeated contract migrations.
  - Seedless onboarding.

## Immediate Next Recommended Steps

1. Finish Magic dashboard configuration:
   - Approve `https://app.auraon.xyz`.
   - Enable Email OTP.
   - Enable/configure Google OAuth.
   - Retest email and Google login.

2. Confirm frontend Vercel env is fully V5:
   - `VITE_PREDICTION_MARKET_ADDRESS`
   - `VITE_AURAPREDICT_V5_ADDRESS`
   - `VITE_PREDICTION_MARKET_START_BLOCK`
   - `VITE_AURAPREDICT_V5_DEPLOYMENT_BLOCK`

3. Confirm VPS indexer V5 health:
   - `contractAddress` is V5.
   - `marketCount` is not stuck at 0.

4. Add deeper mobile market-detail tabs:
   - Overview
   - Trade
   - Resolution
   - Activity/Profile

5. Continue oracle adapters:
   - Stock/Yahoo or official exchange data.
   - Macro/BLS/FRED.
   - Sports official APIs where possible.
   - Politics/news source policy.

6. Design gas sponsorship/seedless transaction model:
   - Decide whether to implement relayer, Circle/Arc-supported AA, or Magic wallet direct signing with user-funded gas.

