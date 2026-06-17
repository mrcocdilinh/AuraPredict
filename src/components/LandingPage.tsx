import { useEffect, useState } from "react";
import {
  INDEXER_URL,
  THEME_KEY,
  APP_URL,
  DOCS_URL,
  X_URL,
  DISCORD_URL,
  DEMO_VIDEO_URL,
  DEMO_EMBED_URL,
  ARC_NATIVE_USDC_DECIMALS
} from "../constants";
import type { ThemeMode, ProjectStats, AssetStats, LandingHealth, IndexedProjectStats, IndexedMarket } from "../types";
import { fetchIndexerJson } from "../lib/indexerClient";
import { indexedStatsToProjectStats, indexedMarketToView } from "../lib/marketTransform";
import { assetStatsFromMarkets, fallbackAssetStatsFromProject, formatAssetSummary } from "../lib/marketStats";
import { timeAgo } from "../lib/timeUtils";
import { ThemeIcon } from "./icons";
import { AppUpdateNotice } from "./AppUpdateNotice";

export function LandingPage() {
  const [landingTheme, setLandingTheme] = useState<ThemeMode>(() => {
    try {
      return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [landingStats, setLandingStats] = useState<ProjectStats | null>(null);
  const [landingMarketAssetStats, setLandingMarketAssetStats] = useState<AssetStats[]>([]);
  const [landingHealth, setLandingHealth] = useState<LandingHealth | null>(null);
  const indexerIsRealtime = INDEXER_URL && !INDEXER_URL.includes("github.io");
  const featureCards = [
    {
      title: "YES/NO markets",
      text: "Create binary prediction markets for crypto, macro, sports, politics, Arc, AI, and community events."
    },
    {
      title: "Stablecoin settlement",
      text: "The current contract supports 6-decimal settlement assets by market, including Arc Testnet USDC and EURC, with selected-token balance checks before actions."
    },
  {
      title: "Arc funding and swap access",
      text: "Wallets can fund Arc USDC through Circle Unified Balance, then request USDC/EURC quotes from a market or profile. Aura tries Circle App Kit first for Arc swaps, then falls back to LI.FI liquidity before the wallet signs."
    },
    {
      title: "Onchain market terms",
      text: "Each market's primary source, fallback source, and resolution rule are stored onchain so settlement criteria stay tied to the market."
    },
    {
      title: "Circle Agent Wallet signer",
      text: "Resolution authority can be operated by a Circle Agent Wallet on Arc Testnet, giving authority/oracle-only markets a server-side signer for source-backed proposals."
    },
    {
      title: "Objective oracle proposals",
      text: "The indexer can check objective markets such as crypto prices, macro prices, and health/status endpoints, then show or auto-submit a high-confidence Oracle proposal before dispute/final review."
    },
    {
      title: "Policy controls",
      text: "Operational controls can pause new activity, allow approved creators, or block new positions without preventing existing markets from settling."
    },
    {
      title: "Protocol revenue",
      text: "Configurable creation fees and winner-profit fees accrue onchain for the owner to review and withdraw from an owner-only dashboard."
    },
    {
      title: "Profiles and reputation",
      text: "Set a username, share your profile, view USDC/EURC balances, open Unified Balance funding, track PNL, win rate, created markets, and prediction history."
    },
    {
      title: "Aura Points",
      text: "A social score for forecasters, combining volume, winning markets, PNL, resolved activity, and market creation."
    },
    {
      title: "Leaderboard",
      text: "Rank traders by volume, win rate, PNL, and Aura Points across 24H, 7D, 1M, and all-time views."
    },
    {
      title: "Social forecasting",
      text: "Follow creators, copy wallet addresses, share to X, embed market links, and study top traders before staking."
    },
    {
      title: "Aura Agent",
      text: "Use AI assistance to draft clearer markets, review duplicate risk, prepare source-based rules, and receive visible result suggestions."
    },
    {
      title: "AI resolution receipts",
      text: "View a suggested YES or NO outcome with confidence, supporting detail, and a settlement report that compares AI, creator proposal, dispute status, and final action."
    },
    {
      title: "Live indexer",
      text: "Read market history, wallet-searchable bet activity, token-specific USDC/EURC stats, and leaderboard data from the live AuraPredict indexer before falling back to Arc RPC."
    }
  ];
  const flow = ["Create a market", "Stake YES or NO", "Track odds", "Resolve result", "Claim payout"];
  const architectureSteps = ["Wallet", "AuraPredict UI", "AuraPredict Indexer", "Arc RPC", "Market Contract", "Arcscan"];
  const settlementSteps = [
    "Trading closes at the published UTC time",
    "Resolution opens only after the rule's event timestamp",
    "Resolver or authority reviews Aura and Oracle suggestions with confidence",
    "Resolution actions show a settlement report with AI choice, creator proposal, dispute/review state, pools, and timelines",
    "Creator, authority, or Circle Agent Wallet signer can submit the first onchain proposal when permitted",
    "Owner receives an alert when the proposed result needs extra review",
    "Dispute window stays open",
    "Disputes are routed to owner/resolution authority review",
    "Stale disputes can be canceled to refund users",
    "Final outcome is locked",
    "Winners claim payout"
  ];
  const dataFlow = [
    "The live AuraPredict indexer now powers market history, per-token volume, participants, activity, and leaderboards",
    "Wallet UI shows USDC and EURC balances with copy-address, faucet, Unified Balance funding, and swap access from markets or the user's profile",
    "Market cards are now compact click-through summaries; staking, Aura review, Oracle checks, dispute, finalize, and claim actions happen inside the market page",
    "The app checks selected-token balance and allowance before create, stake, or dispute transactions",
    "Aura Agent drafts clearer markets, checks similar questions, and prepares rules with source links",
    "Oracle proposal checks objective data sources such as Binance, Yahoo chart data, and health/status endpoints without spending AI quota",
    "Objective oracle automation can auto-submit the first onchain proposal through the configured Circle Agent Wallet while keeping dispute and owner review open",
    "After the rule timestamp, Aura displays a suggested outcome and confidence in Resolution actions",
    "A saved AI receipt can be viewed without running a new AI request; Ask or Refresh requests a new review",
    "The settlement report explains what AI suggested, what the resolver proposed, whether a dispute exists, and what the final reviewer should do next",
    "Resolver, authority, or agent-signed decisions that differ from Aura and user disputes are flagged for owner/authority review",
    "Owner wallets get a private dashboard for reporting, user activity, protocol fees, and fee withdrawal",
    "Aura analysis remains off-chain; the contract anchors source/rule terms, evidence hashes, and receipt hashes in wallet-signed proposal actions",
    "Wallet actions still sign directly against the Arc contract, with Arcscan as the verification layer"
  ];
  const oracleAdapters = [
    {
      title: "Crypto price",
      text: "BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, and LINK markets can be checked against Binance 1-minute price data, with a near-time CoinGecko fallback when exact data is unavailable."
    },
    {
      title: "Macro chart",
      text: "Gold and US Dollar Index markets can be checked against Yahoo chart data near the market's onchain resolution timestamp."
    },
    {
      title: "Health and status",
      text: "API health checks, JSON ok:true endpoints, and supported public status pages can produce a source-based Oracle suggestion."
    },
    {
      title: "Liquidity safety",
      text: "If YES or NO has no funded positions, Oracle suggests Cancel/Refund instead of awarding a one-sided market."
    },
    {
      title: "No AI quota",
      text: "Oracle proposals use deterministic source checks from the indexer, so they do not consume Gemini/OpenAI quota like Aura Agent reviews."
    },
    {
      title: "Circle Agent proposal signer",
      text: "When automation is enabled, a configured Circle Agent Wallet can submit high-confidence Oracle proposals on Arc while finalization still follows the contract's review windows."
    }
  ];
  const infrastructureCards = [
    {
      title: "Prediction market API",
      text: "Public endpoints expose markets, activity, AI insights, public oracle receipts, hot markets, and oracle reputation so other builders can consume AuraPredict data on Arc."
    },
    {
      title: "Embeddable market cards",
      text: "Each market can be shared as a compact card or embedded by URL, turning AuraPredict markets into portable forecasting components for partner apps and docs."
    },
    {
      title: "Public oracle receipts",
      text: "Aura and Oracle decisions publish outcome, confidence, source URLs, evidence hashes, receipt hashes, and transaction references before final settlement."
    },
    {
      title: "Unified Balance funding",
      text: "Circle Gateway and Unified Balance funding help users bring testnet USDC toward Arc before staking, while market actions stay wallet-signed on the Arc contract."
    },
    {
      title: "AI market intelligence",
      text: "Market detail compares current YES pricing with Aura's probability estimate, possible edge, confidence, and risk flags."
    },
    {
      title: "Oracle Agent reputation",
      text: "The owner dashboard tracks coverage, confidence, final-match accuracy, reversal rate, evidence depth, adapters, and auto-propose history."
    }
  ];
  const roadmapItems = [
    "Add websocket or event streaming for absolute realtime odds and cross-user updates",
    "Harden AI receipt review with better evidence policy, audit logs, and operator dashboards",
    "Back up off-chain social state with stronger moderation, export, and recovery tooling",
    "Expand oracle adapters, committee policies, and Circle Agent Wallet operations after evidence policy is hardened"
  ];
  const nextTheme = landingTheme === "dark" ? "light" : "dark";
  const heroMarketCount = landingHealth?.marketCount ?? landingStats?.totalMarkets ?? 0;
  const heroMarketText = heroMarketCount > 0 ? heroMarketCount.toLocaleString("en-US") : "--";
  const landingAssetRows =
    landingStats?.assetBreakdown && landingStats.assetBreakdown.length > 0
      ? landingStats.assetBreakdown
      : landingMarketAssetStats.length > 0
        ? landingMarketAssetStats
        : fallbackAssetStatsFromProject(landingStats);
  const indexedVolumeText = landingStats ? formatAssetSummary(landingAssetRows, "totalVolume") : "--";
  const landingLiveLiquidityText = landingStats ? formatAssetSummary(landingAssetRows, "liveLiquidity") : "--";
  const participantsText = landingStats ? landingStats.participantEntries.toLocaleString("en-US") : "--";
  const knownPlayersText = landingStats ? landingStats.knownPlayers.toLocaleString("en-US") : "--";
  const liveMarketsText = landingStats ? landingStats.liveMarkets.toLocaleString("en-US") : "--";
  const pendingMarketsText = landingStats ? landingStats.pendingMarkets.toLocaleString("en-US") : "--";
  const indexedBlockText = landingHealth?.lastIndexedBlock
    ? Number(landingHealth.lastIndexedBlock).toLocaleString("en-US")
    : "--";
  const updatedText = landingHealth?.updatedAt
    ? `${timeAgo(Math.floor(new Date(landingHealth.updatedAt).getTime() / 1000), new Date())} synced`
    : "syncing";
  const liveMetricCards = [
    {
      value: heroMarketText,
      label: "Markets created"
    },
    {
      value: indexedVolumeText,
      label: "Indexed volume by token"
    },
    {
      value: participantsText,
      label: "Participant entries"
    },
    {
      value: liveMarketsText,
      label: "Live markets"
    }
  ];

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, landingTheme);
  }, [landingTheme]);

  useEffect(() => {
    let canceled = false;
    const loadLandingData = async () => {
      const [statsResponse, healthResponse] = await Promise.all([
        fetchIndexerJson<{ stats: IndexedProjectStats }>("/api/stats"),
        fetchIndexerJson<LandingHealth>("/health")
      ]);
      if (canceled) return;
      if (statsResponse?.stats) {
        const nextStats = indexedStatsToProjectStats(statsResponse.stats);
        setLandingStats(nextStats);
        if (!nextStats.assetBreakdown || nextStats.assetBreakdown.length === 0) {
          const marketResponse = await fetchIndexerJson<{ markets: IndexedMarket[] }>("/api/markets");
          if (!canceled && marketResponse?.markets) {
            setLandingMarketAssetStats(
              assetStatsFromMarkets(
                marketResponse.markets.map(indexedMarketToView),
                Math.floor(Date.now() / 1000),
                "",
                "USDC",
                ARC_NATIVE_USDC_DECIMALS
              )
            );
          }
        } else {
          setLandingMarketAssetStats([]);
        }
      }
      if (healthResponse?.ok) setLandingHealth(healthResponse);
    };
    void loadLandingData();
    const interval = window.setInterval(loadLandingData, 15_000);
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className={`landing-page landing-${landingTheme}`}>
      <AppUpdateNotice />
      <nav className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="AuraPredict home">
          <img src="/aurapredict-logo.png" alt="AuraPredict" />
          <span>AuraPredict</span>
          <span className="arc-brand-chip">
            <img src="/arc-icon-navy-gradient.svg" alt="" />
            Built on Arc
          </span>
        </a>
        <div>
          <a href="#features">Features</a>
          <a href="#oracle">Oracle</a>
          <a href="#how-it-works">How it works</a>
          <a href="#demo">Demo</a>
          <a href={DOCS_URL}>Docs</a>
          <a href={X_URL} target="_blank" rel="noreferrer">
            X
          </a>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">
            Discord
          </a>
          <button
            className="landing-theme-toggle"
            onClick={() => setLandingTheme(nextTheme)}
            type="button"
            aria-label={`Switch to ${nextTheme} mode`}
          >
            <ThemeIcon theme={landingTheme} />
          </button>
          <a className="landing-enter-small" href={APP_URL}>
            Enter Dapp
          </a>
        </div>
      </nav>

      <section className="landing-hero" id="top">
        <div className="landing-hero-copy">
          <div className="landing-network-row">
            <span>AuraPredict</span>
            <span className="landing-arc-powered">
              <img src="/arc-logo-white.svg" alt="Arc" />
              Testnet
            </span>
            <strong>{indexerIsRealtime ? "Network :: Live" : "Network :: Indexed"}</strong>
          </div>
          <p className="landing-kicker">Arc Testnet prediction markets</p>
          <h1>
            <span>{heroMarketText}</span> prediction markets indexed.
          </h1>
          <p>
            Trade YES/NO markets with Arc testnet stablecoins while the live AuraPredict indexer keeps market
            history, volume, participants, leaderboards, comments, evidence, AI resolution receipts, oracle proposals,
            Circle Agent Wallet proposal status, and profile reputation fast enough for public forecasting.
          </p>
          <div className="landing-hero-ledger" aria-label="AuraPredict live indexer metrics">
            <div>
              <span>Total volume by token</span>
              <strong>{indexedVolumeText}</strong>
            </div>
            <div>
              <span>Live liquidity by token</span>
              <strong>{landingLiveLiquidityText}</strong>
            </div>
            <div>
              <span>Participant entries</span>
              <strong>{participantsText}</strong>
            </div>
            <div>
              <span>Known players</span>
              <strong>{knownPlayersText}</strong>
            </div>
          </div>
          <div className="landing-actions">
            <a className="landing-primary" href={APP_URL}>
              Launch the App
            </a>
            <a className="landing-secondary" href={DOCS_URL}>
              Read Docs
            </a>
            <a className="landing-secondary" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
              Watch Demo
            </a>
          </div>
          <div className="landing-proof">
            <span>{indexerIsRealtime ? "AuraPredict indexer live" : "Indexer fallback active"}</span>
            <span className="landing-proof-arc">
              <img src="/arc-icon-white.svg" alt="" />
              Deployed on Arc Testnet
            </span>
            <span>{updatedText}</span>
            <span>{pendingMarketsText} pending resolution</span>
            <span>Circle Agent Wallet authority ready</span>
          </div>
        </div>
        <aside className="landing-network-panel" aria-label="Live AuraPredict network metrics">
          <div>
            <span>Live markets</span>
            <strong>{liveMarketsText}</strong>
          </div>
          <div>
            <span>Last indexed block</span>
            <strong>{indexedBlockText}</strong>
          </div>
          <div>
            <span>Awaiting result</span>
            <strong>{pendingMarketsText}</strong>
          </div>
          <div>
            <span>Sync age</span>
            <strong>{updatedText}</strong>
          </div>
          <div className="landing-network-wide">
            <span>Realtime data path</span>
            <strong>AuraPredict indexer to UI to wallet-signed Arc transactions</strong>
          </div>
        </aside>
      </section>

      <section className="landing-strip landing-live-stats" aria-label="AuraPredict live stats">
        {liveMetricCards.map((metric) => (
          <div key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </section>

      <section className="landing-section" id="features">
        <div className="landing-section-head">
          <p className="landing-kicker">Core features</p>
          <h2>Built for people who want their forecasts to compound into reputation.</h2>
          <p>
            The app keeps the trading surface simple while making evidence, profiles, and leaderboard
            performance visible enough for social forecasting. AuraPredict combines onchain YES/NO
            staking, an indexer-backed data layer, AI-assisted market quality checks, AI resolution
            receipts, objective oracle proposals, and Circle Agent Wallet signing for eligible authority/oracle markets. The current contract is deployed on Arc Testnet with onchain source/rule terms, structured rule metadata, resolution timing, configurable settlement assets, signed-Aura hooks, and authority/oracle controls.
          </p>
        </div>
        <div className="landing-feature-grid">
          {featureCards.map((feature) => (
            <article key={feature.title}>
              <span />
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="oracle">
        <div className="landing-section-head">
          <p className="landing-kicker">Objective Oracle v1</p>
          <h2>Source-based proposals for markets that can be checked without AI.</h2>
          <p>
            AuraPredict now separates two kinds of help during resolution. Aura Agent is used for reasoning-heavy
            questions and evidence review. Oracle proposal v1 is used when the market can be checked directly against
            objective data sources. It gives reviewers a YES, NO, Cancel, or manual-review signal before they sign a
            contract action. When auto-propose is enabled and confidence passes the policy threshold, the configured
            Circle Agent Wallet can submit that first proposal onchain. For new markets, the same structured source rule
            is shared by Aura, Oracle, the resolver, and the final reviewer.
          </p>
        </div>
        <div className="landing-feature-grid">
          {oracleAdapters.map((adapter) => (
            <article key={adapter.title}>
              <span />
              <h3>{adapter.title}</h3>
              <p>{adapter.text}</p>
            </article>
          ))}
        </div>
        <div className="docs-note">
          <strong>Settlement boundary</strong>
          <p>
            Oracle proposal v1 does not move funds by itself. The contract still enforces resolution time,
            review/dispute windows, and finalization. The proposal simply gives the signer, including the Circle Agent
            Wallet signer when configured, a clearer source-based report before choosing YES, NO, or Cancel.
          </p>
        </div>
      </section>

      <section className="landing-section" id="infrastructure">
        <div className="landing-section-head">
          <p className="landing-kicker">Open infrastructure</p>
          <h2>Open Prediction Market Infrastructure on Arc.</h2>
          <p>
            AuraPredict is expanding from a trading dapp into a reusable prediction-market layer for Arc. Builders can
            read market data, embed live cards, inspect AI and Oracle receipts, and route users into USDC funding before
            they stake onchain.
          </p>
        </div>
        <div className="landing-feature-grid">
          {infrastructureCards.map((feature) => (
            <article key={feature.title}>
              <span />
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
        <div className="docs-note">
          <strong>AI proposes, evidence proves, smart contracts enforce.</strong>
          <p>
            Aura Agent helps create clearer markets and explain probabilities. Oracle adapters check objective sources.
            Final proposals, disputes, review, and claims still follow the contract.
          </p>
        </div>
      </section>

      <section className="landing-section landing-demo-section" id="demo">
        <div className="landing-section-head">
          <p className="landing-kicker">Demo</p>
          <h2>Preview the dapp flow after the live network stats.</h2>
          <p>
            Watch the AuraPredict walkthrough, then launch the app to create markets, check Aura Agent duplicate
            risk, stake YES/NO, and resolve outcomes on Arc Testnet.
          </p>
        </div>
        <div className="landing-video-card">
          <div className="landing-video-frame">
            <iframe
              src={`${DEMO_EMBED_URL}?rel=0&modestbranding=1`}
              title="AuraPredict demo video"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      <section className="landing-section landing-split" id="how-it-works">
        <div>
          <p className="landing-kicker">How it works</p>
          <h2>From question to payout, every step is transparent.</h2>
          <p>
            A market starts as a clear YES/NO question. Users stake based on their conviction.
            Creation now requires a primary resolution source and an explicit resolution rule.
            After the event timestamp in the resolution rule has passed, the resolver opens the
            market to request or view Aura and Oracle suggestions with confidence. The creator,
            configured authority, or Circle Agent Wallet signer then proposes the result through a contract action.
            Resolution actions summarize AI choice, creator proposal, dispute status, pools, and deadlines
            before any final reviewer action. Users can dispute during the window, and winners claim directly after finalization.
          </p>
          <a className="landing-primary" href={APP_URL}>
            Launch the App
          </a>
        </div>
        <div className="landing-flow">
          {flow.map((item, index) => (
            <article key={item}>
              <span>{index + 1}</span>
              <strong>{item}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-docs" id="docs">
        <div className="landing-section-head">
          <p className="landing-kicker">Project docs</p>
          <h2>Transparent testnet mechanics without hiding the roadmap.</h2>
          <p>
            AuraPredict is live as an Arc Testnet MVP with its public indexer hosted at api.aurapredict.xyz. The current product
            proves market creation, staking, dispute-aware settlement, profiles, comments, evidence,
            AI resolution receipts, objective Oracle automation, Circle Agent Wallet proposal signing, live stats, notifications, and public reputation while wallet
            actions remain fully onchain. Production reads the active Arc Testnet contract through the AuraPredict indexer and wallet transactions remain verifiable on Arcscan.
          </p>
          <div className="landing-docs-actions">
            <a className="landing-primary" href={DOCS_URL}>
              Open Full Docs
            </a>
            <a className="landing-secondary" href="https://github.com/mrcocdilinh/AuraPredict" target="_blank" rel="noreferrer">
              View GitHub
            </a>
          </div>
        </div>

        <div className="docs-summary-grid">
          <article className="docs-card">
            <span className="docs-label">Purpose</span>
            <h3>Make forecasting social on Arc</h3>
            <p>
              Users can create public markets, back YES or NO with the market's testnet stablecoin, track odds, and
              build a visible record through profiles, rankings, PNL, win rate, and Aura Points.
            </p>
          </article>
          <article className="docs-card">
            <span className="docs-label">Current network</span>
            <h3>Arc Testnet first</h3>
            <p>
              The app currently targets Arc Testnet and is designed for testing product flow, market
              mechanics, wallet UX, and community behavior before any mainnet deployment decisions.
            </p>
          </article>
          <article className="docs-card">
            <span className="docs-label">Resolution model</span>
            <h3>AI and Oracle assisted, contract settled</h3>
            <p>
              Aura displays a suggested outcome with confidence after the rule timestamp, Oracle checks objective sources,
              and a configured Circle Agent Wallet can submit eligible high-confidence proposals. The settlement report
              shows AI choice, proposed result, dispute status, and final review guidance before users reach finalization.
            </p>
          </article>
          <article className="docs-card">
            <span className="docs-label">AI layer</span>
            <h3>Aura Agent plus receipts</h3>
            <p>
              Aura Agent helps draft questions, score clarity, surface similar markets, summarize
              evidence, and expose resolution receipts that users can inspect without rerunning AI.
              A source router now scans configured links before Aura reviews deadline-style markets.
            </p>
          </article>
        </div>

        <div className="docs-diagram-panel">
          <div>
            <span className="docs-label">System architecture</span>
            <h3>Live indexer, wallet signed</h3>
            <p>
              The public app reads the AuraPredict indexer first for low-latency market state, social data,
              and AI receipts. Wallets still sign transactions against the prediction market contract,
              and Arcscan remains the verification layer.
            </p>
          </div>
          <div className="docs-flow-diagram" aria-label="AuraPredict architecture diagram">
            {architectureSteps.map((step, index) => (
              <div className="docs-flow-step" key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
                {index < architectureSteps.length - 1 && <i />}
              </div>
            ))}
          </div>
        </div>

        <div className="docs-two-column">
          <article className="docs-card docs-large-card">
            <span className="docs-label">Market lifecycle</span>
            <h3>From question to payout</h3>
            <div className="docs-step-list">
              {settlementSteps.map((step, index) => (
                <div key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="docs-card docs-large-card">
            <span className="docs-label">Data loading</span>
            <h3>What the data layer does</h3>
            <div className="docs-step-list">
              {dataFlow.map((step, index) => (
                <div key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="docs-feature-table">
          <article>
            <span>Market creation</span>
            <strong>YES/NO questions with UTC close time, separate resolution time, category labels, required source URL, and required resolution rule.</strong>
          </article>
          <article>
            <span>Market terms</span>
            <strong>Primary source, fallback source, and resolution rule are stored onchain for every new market.</strong>
          </article>
          <article>
            <span>Trading</span>
            <strong>Users stake the market's configured Arc testnet stablecoin, such as USDC or EURC, directly from their wallet. Markets never convert payout currency.</strong>
          </article>
          <article>
            <span>Wallet UX</span>
            <strong>The wallet menu and profile show USDC/EURC balances, copy-address access, faucet shortcut, Unified Balance funding, swap access, and selected-token balance checks before transactions.</strong>
          </article>
          <article>
            <span>Swap access</span>
            <strong>A trader can bring USDC to Arc through Circle Unified Balance, then swap USDC/EURC on Arc with visible minimum receive and adjustable tolerance before staking.</strong>
          </article>
          <article>
            <span>Settlement</span>
            <strong>AI receipts and Oracle proposals can support the result, but finalized outcomes still unlock payouts through the contract.</strong>
          </article>
          <article>
            <span>Settlement report</span>
            <strong>Resolution actions summarize AI suggestion, Oracle suggestion, creator proposal, dispute/review state, YES/NO pools, volume, and timing so final reviewers know what they are signing.</strong>
          </article>
          <article>
            <span>Oracle proposal</span>
            <strong>Objective adapters can fetch crypto price, macro chart, and health/status API data, then display or auto-submit YES/NO/Cancel guidance without spending AI quota.</strong>
          </article>
          <article>
            <span>AI resolution</span>
            <strong>Aura-first flow: the suggested result is visible before proposal, with mismatch alerts and dispute review when needed.</strong>
          </article>
          <article>
            <span>Source router</span>
            <strong>Before Aura reviews publish, announce, blog, news, fixture, and schedule markets, the indexer scans primary/fallback/inferred sources such as official blogs, status pages, sports schedules, and selected government pages, then turns findings into explicit evidence rows.</strong>
          </article>
          <article>
            <span>AI efficiency</span>
            <strong>Saved resolution receipts can be displayed again without rerunning Aura; only Ask or Refresh spends AI quota.</strong>
          </article>
          <article>
            <span>Oracle path</span>
            <strong>Circle Agent Wallet signing is now supported by the indexer; the contract also includes approved adapter and signed-Aura hooks for future oracle or committee markets.</strong>
          </article>
          <article>
            <span>Deadline outcomes</span>
            <strong>For a clearly defined event due by a fixed time, Aura may suggest NO after the deadline when reviewed evidence provides no credible confirmation, while displaying its confidence and risk.</strong>
          </article>
          <article>
            <span>Timeout safety</span>
            <strong>Timed-out markets can be canceled and refunded after the proposal grace period when no result is proposed.</strong>
          </article>
          <article>
            <span>Profiles</span>
            <strong>Wallet profile tracks USDC/EURC balances, participation, created markets, PNL, win rate, and claims.</strong>
          </article>
          <article>
            <span>Leaderboard</span>
            <strong>Ranks users by volume, win rate, PNL, and Aura Points.</strong>
          </article>
          <article>
            <span>Admin controls</span>
            <strong>Operational credentials and automation policies stay private; public docs only show user-facing behavior and rules.</strong>
          </article>
          <article>
            <span>Docs domain</span>
            <strong>docs.aurapredict.xyz documents app usage, smart contract behavior, indexer setup, and deployment.</strong>
          </article>
        </div>

        <div className="docs-diagram-panel docs-roadmap-panel">
          <div>
            <span className="docs-label">Roadmap</span>
            <h3>Path toward a production-grade prediction market</h3>
            <p>
            AuraPredict now has a live public indexer, AI market drafting, duplicate-risk checks, comments,
              evidence fields, AI resolution receipts, profile reputation, and leaderboard metrics. The remaining
              gap is production-grade realtime streaming, durable social data, and broader oracle-backed settlement coverage.
            </p>
          </div>
          <div className="docs-roadmap">
            {roadmapItems.map((item, index) => (
              <article key={item}>
                <span>{`0${index + 1}`}</span>
                <strong>{item}</strong>
              </article>
            ))}
          </div>
        </div>

        <div className="docs-note">
          <strong>Important note</strong>
          <p>
            AuraPredict is currently a testnet dapp. It is not financial advice and the current market
            resolution flow uses AI and source-based Oracle checks as decision aids, not as a trustless oracle.
            Circle Agent Wallet proposals still follow contract timing, dispute, review, and finalization rules.
          </p>
        </div>
      </section>

      <section className="landing-section landing-dark-panel">
        <div className="landing-section-head">
          <p className="landing-kicker">Why AuraPredict</p>
          <h2>Prediction markets become more powerful when they are social.</h2>
          <p>
            AuraPredict is designed around public forecasting identity. Every trade, market, payout,
            and ranking can help users build a visible prediction track record.
          </p>
        </div>
        <div className="landing-benefit-grid">
          <article>
            <strong>For traders</strong>
            <p>Discover fresh markets, back your view with the market's stablecoin, track positions, and compete on leaderboard metrics.</p>
          </article>
          <article>
            <strong>For creators</strong>
            <p>Launch markets for your community, resolve outcomes, build creator reputation, and grow market volume.</p>
          </article>
          <article>
            <strong>For Arc</strong>
            <p>Create an engaging social finance primitive around information, events, and ecosystem participation.</p>
          </article>
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <p className="landing-kicker">Start predicting</p>
          <h2>Watch the demo, then enter the live Arc Testnet app.</h2>
        </div>
        <div className="landing-actions">
          <a className="landing-secondary" href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
            View Demo
          </a>
          <a className="landing-secondary" href={DOCS_URL}>
            Read Docs
          </a>
          <a className="landing-primary" href={APP_URL}>
            Enter Dapp
          </a>
        </div>
      </section>
    </main>
  );
}
