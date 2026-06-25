import { expect, test, type Page, type Route } from "@playwright/test";
import { encodeAbiParameters, toFunctionSelector } from "viem";

const OWNER = "0xAAAEE8880C73a00cACe246B9445C62B77506b9b2";
const AUTHORITY = "0x035E03F8C0a9D22a24b8212c466895A210645DC6";
const CONTRACT = "0x1000000000000000000000000000000000000001";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const selectors = {
  marketCount: toFunctionSelector("marketCount()"),
  owner: toFunctionSelector("owner()"),
  minStake: toFunctionSelector("minStake()"),
  creatorBond: toFunctionSelector("creatorBond()"),
  disputeBond: toFunctionSelector("disputeBond()"),
  disputeWindow: toFunctionSelector("disputeWindow()"),
  contractVersion: toFunctionSelector("CONTRACT_VERSION()"),
  resolutionAuthority: toFunctionSelector("resolutionAuthority()"),
  disputeGracePeriod: toFunctionSelector("disputeGracePeriod()"),
  marketCreationFee: toFunctionSelector("marketCreationFee()"),
  protocolFeeBps: toFunctionSelector("protocolFeeBps()"),
  accumulatedProtocolFees: toFunctionSelector("accumulatedProtocolFees()"),
  defaultSettlementToken: toFunctionSelector("defaultSettlementToken()"),
  assetConfigs: toFunctionSelector("assetConfigs(address)"),
  positionOf: toFunctionSelector("positionOf(uint256,address)"),
  potentialPayout: toFunctionSelector("potentialPayout(uint256,address)"),
  getUserPosition: toFunctionSelector("getUserPosition(uint256,address)"),
  getClaimable: toFunctionSelector("getClaimable(uint256,address)")
};

function uint256(value: bigint | number) {
  return encodeAbiParameters([{ type: "uint256" }], [BigInt(value)]);
}

function address(value: string) {
  return encodeAbiParameters([{ type: "address" }], [value as `0x${string}`]);
}

function stringValue(value: string) {
  return encodeAbiParameters([{ type: "string" }], [value]);
}

function assetConfig() {
  return encodeAbiParameters(
    [
      { type: "bool" },
      { type: "string" },
      { type: "uint8" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" }
    ],
    [true, "USDC", 6, 100_000n, 1_000_000n, 1_000_000n, 1_000_000n, 1_000_000n, 0n, 200n, 0n]
  );
}

function positionValue(yes: bigint, no: bigint, claimed: boolean) {
  return encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "bool" }],
    [yes, no, claimed]
  );
}

function v5PositionValue(stakes: bigint[], claimed: boolean) {
  return encodeAbiParameters(
    [{ type: "uint256[]" }, { type: "bool" }],
    [stakes, claimed]
  );
}

function seconds(offset: number) {
  return Math.floor(Date.now() / 1000) + offset;
}

function market(overrides: Record<string, unknown>) {
  const id = Number(overrides.id ?? 1);
  return {
    id,
    question: `Will AuraOn E2E market #${id} render correctly?`,
    category: "Arc",
    createdAt: seconds(-7_200),
    closeTime: seconds(7_200),
    resolutionTime: seconds(7_200),
    settlementToken: USDC,
    settlementSymbol: "USDC",
    settlementDecimals: 6,
    creator: OWNER,
    resolver: OWNER,
    authority: AUTHORITY,
    resolutionMode: 2,
    metadataHash: "0x" + "1".repeat(64),
    metadataURI: "https://example.com/primary",
    fallbackSourceURI: "https://example.com/fallback",
    resolutionRule:
      "YES if the referenced source confirms the event by the resolution time. NO otherwise.",
    resolutionAdapter: "0x0000000000000000000000000000000000000000",
    termsProtocolFeeBps: 200,
    termsCreatorBond: "1000000",
    termsDisputeBond: "1000000",
    termsDisputeWindow: 43_200,
    termsDisputeGracePeriod: 259_200,
    termsProposalGracePeriod: 259_200,
    yesPool: "6000000",
    noPool: "4000000",
    traderCount: 4,
    proposedOutcome: 0,
    proposedAt: 0,
    disputeDeadline: 0,
    proposedBy: "0x0000000000000000000000000000000000000000",
    proposalEvidenceHash: "0x" + "0".repeat(64),
    aiReceiptHash: "0x" + "0".repeat(64),
    authorityReviewRequired: false,
    disputed: false,
    disputer: "0x0000000000000000000000000000000000000000",
    outcome: 0,
    resolvedAt: 0,
    createdTxHash: "0x" + String(id).padStart(64, "0"),
    updatedTxHash: "0x" + String(id + 100).padStart(64, "0"),
    ...overrides
  };
}

const markets = [
  market({
    id: 1,
    question: "Will AuraOn let users stake YES or NO on a live Arc market?",
    closeTime: seconds(86_400),
    resolutionTime: seconds(86_400),
    yesPool: "8000000",
    noPool: "2000000",
    traderCount: 8
  }),
  market({
    id: 2,
    question: "Will AuraOn show dispute and finalization controls after a proposal?",
    closeTime: seconds(-7_200),
    resolutionTime: seconds(-7_200),
    proposedOutcome: 1,
    proposedAt: seconds(-1_800),
    disputeDeadline: seconds(41_400),
    proposedBy: AUTHORITY,
    traderCount: 6
  }),
  market({
    id: 3,
    question: "Will AuraOn show claim state after a market is finalized?",
    closeTime: seconds(-86_400),
    resolutionTime: seconds(-86_400),
    proposedOutcome: 1,
    proposedAt: seconds(-80_000),
    disputeDeadline: seconds(-36_800),
    proposedBy: AUTHORITY,
    outcome: 1,
    resolvedAt: seconds(-35_000),
    traderCount: 5
  }),
  market({
    id: 4,
    question: "Will AuraOn include a second finalized claimable market?",
    closeTime: seconds(-90_000),
    resolutionTime: seconds(-90_000),
    proposedOutcome: 1,
    proposedAt: seconds(-84_000),
    disputeDeadline: seconds(-40_000),
    proposedBy: AUTHORITY,
    outcome: 1,
    resolvedAt: seconds(-39_000),
    traderCount: 3,
    yesPool: "5000000",
    noPool: "1000000"
  })
];

async function mockAuraBackend(page: Page) {
  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname === "/health") return route.fulfill({ json: { ok: true, marketCount: markets.length } });
    if (pathname === "/api/stats") {
      return route.fulfill({
        json: {
          stats: {
            totalMarkets: markets.length,
            indexedMarkets: markets.length,
            liveMarkets: 1,
            endedMarkets: 2,
            pendingMarkets: 1,
            totalVolume: "30000000",
            liveLiquidity: "10000000",
            averageMarketVolume: "10000000",
            participantEntries: 9,
            knownPlayers: 4,
            settlementSymbols: ["USDC", "EURC"],
            hasMixedSettlementAssets: true,
            assetBreakdown: [
              { token: USDC, symbol: "USDC", decimals: 6, marketCount: 2, liveMarkets: 1, endedMarkets: 1, pendingMarkets: 1, participantEntries: 8, totalVolume: "25000000", liveLiquidity: "10000000", averageMarketVolume: "12500000" },
              { token: EURC, symbol: "EURC", decimals: 6, marketCount: 1, liveMarkets: 0, endedMarkets: 1, pendingMarkets: 0, participantEntries: 1, totalVolume: "5000000", liveLiquidity: "0", averageMarketVolume: "5000000" }
            ]
          },
          contract: {
            version: "AURAPREDICT_V5",
            owner: OWNER,
            resolutionAuthority: AUTHORITY,
            creatorBond: "1000000",
            disputeBond: "1000000",
            disputeWindow: 43_200,
            disputeGracePeriod: 259_200,
            proposalGracePeriod: 259_200,
            aiAttestationSigner: "0x0000000000000000000000000000000000000000",
            protocolFeeBps: 200,
            marketCreationFee: "0",
            accumulatedProtocolFees: "0"
          },
          updatedAt: new Date().toISOString(),
          lastIndexedBlock: "45413586"
        }
      });
    }
    if (pathname === "/api/markets") return route.fulfill({ json: { markets, total: markets.length, updatedAt: new Date().toISOString() } });
    if (pathname.match(/^\/api\/markets\/\d+\/ai-insight$/)) {
      const id = Number(pathname.split("/")[3]);
      return route.fulfill({
        json: {
          insight: {
            marketId: id,
            question: markets.find((item) => item.id === id)?.question,
            category: "Arc",
            status: "open",
            marketYesPrice: 80,
            marketNoPrice: 20,
            estimatedYesProbability: 74,
            edge: -6,
            edgeSide: "balanced",
            confidence: 68,
            confidenceBand: "Medium",
            basis: "Market price baseline",
            summary: "Aura compares current market pricing with saved AI and Oracle evidence.",
            riskFlags: ["No saved Aura resolution receipt yet."],
            sourceUrls: ["https://example.com/primary"],
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
    if (pathname.startsWith("/api/markets/")) {
      const id = Number(pathname.split("/").pop());
      return route.fulfill({ json: { market: markets.find((item) => item.id === id) ?? null } });
    }
    if (pathname === "/api/activity") {
      return route.fulfill({
        json: {
          activities: [
            { marketId: 1, user: OWNER, side: 1, amount: "3000000", timestamp: seconds(-1_200), txHash: "0x" + "a".repeat(64) },
            { marketId: 1, user: AUTHORITY, side: 2, amount: "2000000", timestamp: seconds(-900), txHash: "0x" + "b".repeat(64) }
          ]
        }
      });
    }
    if (pathname === "/api/leaderboard") return route.fulfill({ json: { rows: [], period: "all", metric: "volume" } });
    if (pathname.startsWith("/api/social/markets/")) return route.fulfill({ json: { comments: [], evidence: [], updatedAt: new Date().toISOString() } });
    if (pathname.endsWith("/notifications") && pathname.startsWith("/api/social/profiles/")) {
      return route.fulfill({ json: { notifications: [], updatedAt: new Date().toISOString() } });
    }
    if (pathname.startsWith("/api/social/profiles/")) return route.fulfill({ json: { profile: null, follows: [], updatedAt: new Date().toISOString() } });
    if (pathname.startsWith("/api/resolutions/")) return route.fulfill({ json: { receipt: null, updatedAt: new Date().toISOString() } });
    if (pathname.startsWith("/api/oracles/")) return route.fulfill({ json: { proposal: null, updatedAt: new Date().toISOString() } });
    if (pathname.startsWith("/api/oracle-receipts/")) {
      return route.fulfill({
        json: {
          receipt: {
            marketId: Number(pathname.split("/").pop()),
            status: "awaiting_proposal",
            finalOutcome: "INSUFFICIENT_EVIDENCE",
            proposedOutcome: "INSUFFICIENT_EVIDENCE",
            ai: null,
            oracle: null,
            evidence: [],
            sourceUrls: ["https://example.com/primary"]
          }
        }
      });
    }
    if (pathname === "/api/oracle-reputation") {
      return route.fulfill({
        json: {
          reputation: {
            reputationScore: 62,
            tier: "Operator ready",
            coverage: 50,
            accuracy: 0,
            reversalRate: 0,
            avgOracleConfidence: 68,
            avgAiConfidence: 0,
            evidenceQuality: 40,
            oracleProposals: 2,
            aiReceipts: 0,
            finalizedMarkets: 1,
            disputedMarkets: 0,
            authorityReviewMarkets: 0,
            autoProposed: 1,
            adapters: { "crypto-price": 1 },
            recent: [],
            policy: "Experimental testnet reputation.",
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
    if (pathname === "/api/ai/hot-markets") return route.fulfill({ json: { markets: [], updatedAt: new Date().toISOString() } });
    return route.fulfill({ json: { ok: true } });
  });
}

async function mockConnectedWallet(page: Page) {
  await page.addInitScript((walletAddress) => {
    window.localStorage.setItem("aurapredict.walletConnected", "true");
    window.localStorage.removeItem("aurapredict.walletDisconnected");

    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const provider = {
      isMetaMask: true,
      request: async ({ method }: { method: string; params?: unknown[] }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [walletAddress];
        if (method === "eth_chainId") return "0x4cef52";
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        if (method === "eth_sendTransaction") return "0x" + "c".repeat(64);
        return "0x0";
      },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        const bucket = listeners.get(event) || new Set<(...args: unknown[]) => void>();
        bucket.add(handler);
        listeners.set(event, bucket);
      },
      removeListener: (event: string, handler: (...args: unknown[]) => void) => {
        listeners.get(event)?.delete(handler);
      }
    };

    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: provider
    });
  }, OWNER);
}

async function mockRpc(route: Route) {
  const request = route.request();
  const body = request.postDataJSON() as { id?: number; method?: string; params?: Array<Record<string, string>> } | Array<{ id?: number; method?: string; params?: Array<Record<string, string>> }> | undefined;
  const calls = Array.isArray(body) ? body : [body || {}];
  const results = calls.map((call) => {
    let result = "0x0";
    if (call.method === "eth_chainId") result = "0x4cef52";
    if (call.method === "eth_blockNumber") result = "0x2b4f120";
    if (call.method === "eth_getLogs") result = [];
    if (call.method === "eth_getTransactionReceipt") {
      return {
        jsonrpc: "2.0",
        id: call.id ?? 1,
        result: {
          transactionHash: "0x" + "c".repeat(64),
          transactionIndex: "0x0",
          blockHash: "0x" + "d".repeat(64),
          blockNumber: "0x2b4f121",
          from: OWNER,
          to: CONTRACT,
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          effectiveGasPrice: "0x1",
          contractAddress: null,
          logs: [],
          logsBloom: "0x" + "0".repeat(512),
          status: "0x1",
          type: "0x2"
        }
      };
    }
    if (call.method === "eth_call") {
      const data = String(call.params?.[0]?.data || "").slice(0, 10);
      const responses: Record<string, string> = {
        [selectors.marketCount]: uint256(markets.length),
        [selectors.owner]: address(OWNER),
        [selectors.minStake]: uint256(100_000),
        [selectors.creatorBond]: uint256(1_000_000),
        [selectors.disputeBond]: uint256(1_000_000),
        [selectors.disputeWindow]: uint256(43_200),
        [selectors.contractVersion]: stringValue("AURAPREDICT_V5"),
        [selectors.resolutionAuthority]: address(AUTHORITY),
        [selectors.disputeGracePeriod]: uint256(259_200),
        [selectors.marketCreationFee]: uint256(0),
        [selectors.protocolFeeBps]: uint256(200),
        [selectors.accumulatedProtocolFees]: uint256(0),
        [selectors.defaultSettlementToken]: address(USDC),
        [selectors.assetConfigs]: assetConfig(),
        [selectors.positionOf]: positionValue(1_000_000n, 0n, false),
        [selectors.potentialPayout]: uint256(1_000_000),
        [selectors.getUserPosition]: v5PositionValue([1_000_000n, 0n], false),
        [selectors.getClaimable]: uint256(1_000_000)
      };
      result = responses[data] || "0x" + "0".repeat(64);
    }
    return { jsonrpc: "2.0", id: call.id ?? 1, result };
  });
  await route.fulfill({ json: Array.isArray(body) ? results : results[0] });
}

test.beforeEach(async ({ page }) => {
  await mockAuraBackend(page);
  await page.route("https://rpc.testnet.arc.network/**", mockRpc);
  await page.route("https://rpc.drpc.testnet.arc.network/**", mockRpc);
  await page.route("https://rpc.quicknode.testnet.arc.network/**", mockRpc);
  await page.route("https://rpc.blockdaemon.testnet.arc.network/**", mockRpc);
});

test("create market form defaults to authority/oracle review", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create Market/i }).first().click();

  await expect(page.getByRole("dialog", { name: /Create market/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Create a new market/i })).toBeVisible();
  await expect(page.getByLabel(/Resolution mode/i)).toHaveValue("2");
  await expect(page.getByLabel(/Resolution source URL/i)).toBeVisible();
  await expect(page.getByText(/V5 markets launch as owner-reviewed drafts/i)).toBeVisible();
  await expect(page.getByText(/AI market quality/i)).toBeVisible();
});

test("create market explains all resolution modes and UTC timing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Create Market/i }).first().click();

  const mode = page.getByLabel(/Resolution mode/i);
  await expect(mode).toHaveValue("2");
  await expect(page.getByText(/Only owner\/authority\/oracle can propose/i)).toBeVisible();
  await expect(page.getByText(/UTC only\. Betting stops at this time/i)).toBeVisible();
  await expect(page.getByText(/Resolution time is enforced onchain/i)).toBeVisible();

  await mode.selectOption("0");
  await expect(page.getByText(/Creator can propose\. A matching signed Aura result/i)).toBeVisible();

  await mode.selectOption("1");
  await expect(page.getByText(/Creator can propose, but owner\/authority must approve/i)).toBeVisible();

  await mode.selectOption("2");
  await expect(page.getByText(/Best for objective data markets and oracle-led settlement/i)).toBeVisible();
});

test("market detail exposes stake, resolution, dispute, finalize and claim surfaces", async ({ page }) => {
  await page.goto("/?market=1");
  await expect(page.getByRole("heading", { name: /Will AuraOn let users stake YES or NO/i })).toBeVisible();
  await expect(page.getByText(/Public preview/i)).toBeVisible();
  await expect(page.getByRole("img", { name: /Market odds chart/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Overview/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Comments/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Activity/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Top Holders/i })).toBeVisible();
  await expect(page.getByText(/Aura AI Insight/i)).toBeVisible();
  await expect(page.getByText(/Public oracle receipt/i)).toBeVisible();
  await expect(page.getByText(/Connect wallet to interact/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in/i }).first()).toBeVisible();
  await page.getByRole("tab", { name: /Activity/i }).click();
  await expect(page.getByText(/Player history/i)).toBeVisible();
  await page.getByRole("tab", { name: /Top Holders/i }).click();
  await expect(page.getByText(/Top traders/i)).toBeVisible();

  await page.goto("/?market=2");
  await expect(page.getByRole("heading", { name: /dispute and finalization controls/i })).toBeVisible();
  await expect(page.getByText(/Connect wallet to interact/i)).toBeVisible();
  await expect(page.getByText(/Public preview/i)).toBeVisible();

  await page.goto("/?market=3");
  await expect(page.getByRole("heading", { name: /claim state after a market is finalized/i })).toBeVisible();
  await expect(page.getByText(/Finalized/i).first()).toBeVisible();
  await expect(page.getByText(/Connect wallet to interact/i)).toBeVisible();
});

test("Unified Balance funding modal documents pending and retry states", async ({ page }) => {
  await mockConnectedWallet(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Create Market/i }).first().click();
  const createDialog = page.getByRole("dialog", { name: /Create market/i });
  await createDialog.getByRole("button", { name: /^Unified Balance$/i }).click();

  await expect(page.getByRole("dialog", { name: /Unified Balance funding/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Unified Balance/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Move USDC to Arc/i })).toBeVisible();
  await expect(page.getByText(/Gateway balance available to spend/i)).toBeVisible();
  await expect(page.getByText(/Wallet USDC by chain/i)).toBeVisible();

  await page.getByText(/Advanced recovery/i).click();
  await expect(page.getByRole("button", { name: /Deposit only/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Retry spend to Arc/i })).toBeVisible();
});

test("wallet notifications expose claim all and claim filters", async ({ page }) => {
  await mockConnectedWallet(page);
  await page.goto("/");

  await expect(page.getByLabel(/Notifications/i)).toBeVisible();
  await page.getByLabel(/Notifications/i).click();
  await expect(page.getByText(/Claim all 2\.00 USDC/i)).toBeVisible();
  await page.getByRole("button", { name: /View all notifications/i }).click();

  await expect(page.getByRole("heading", { name: /\d+ current notifications/i })).toBeVisible();
  await page.getByRole("button", { name: /^Claims$/i }).click();
  await expect(page.getByText(/Claim available/i).first()).toBeVisible();

  await page.getByRole("button", { name: /Claim all 2\.00 USDC/i }).click();
  await expect(page.getByText(/Claimed 2 available V5 payouts/i)).toBeVisible({ timeout: 10_000 });
});
