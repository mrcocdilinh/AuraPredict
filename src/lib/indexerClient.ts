import { isAddress } from "viem";
import { INDEXER_URL, VIEWING_V3_ARCHIVE } from "../constants";
import type {
  IndexedMarket,
  IndexedActivity,
  IndexedProjectStats,
  LandingHealth,
  IndexedSnapshot
} from "../types";
import { indexedMarketToView, indexedStatsToProjectStats, indexedActivityToItem } from "./marketTransform";

const MAX_INDEXER_SNAPSHOT_AGE_MS = 5 * 60 * 1000;

export async function fetchIndexerJson<T>(path: string): Promise<T | null> {
  if (!INDEXER_URL || VIEWING_V3_ARCHIVE) return null;
  const [route, query = ""] = path.split("?");
  const urls = [
    `${INDEXER_URL}${path}`,
    `${INDEXER_URL}${route}.json${query ? `?${query}` : ""}`
  ];
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    for (const url of urls) {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (response.ok) return (await response.json()) as T;
    }
    return null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function postIndexerJson<T>(path: string, payload: unknown): Promise<T | null> {
  if (!INDEXER_URL || INDEXER_URL.includes("github.io") || VIEWING_V3_ARCHIVE) return null;
  try {
    const response = await fetch(`${INDEXER_URL}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function postIndexerJsonWithStatus<T extends { error?: string }>(
  path: string,
  payload: unknown
): Promise<{ ok: boolean; status: number; data: T | null }> {
  if (!INDEXER_URL || INDEXER_URL.includes("github.io") || VIEWING_V3_ARCHIVE) {
    return { ok: false, status: 0, data: null };
  }
  try {
    const response = await fetch(`${INDEXER_URL}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function loadIndexedSnapshot(account?: string): Promise<IndexedSnapshot | null> {
  const activityLimit = 2_000;
  const walletActivityLimit = 20_000;
  const accountActivityPath =
    account && isAddress(account) ? `/api/activity?limit=${walletActivityLimit}&user=${account}` : "";
  const [marketsResponse, activityResponse, accountActivityResponse, statsResponse, healthResponse] = await Promise.all([
    fetchIndexerJson<{ markets: IndexedMarket[]; total: number }>("/api/markets?limit=9999"),
    fetchIndexerJson<{ activities: IndexedActivity[] }>(`/api/activity?limit=${activityLimit}`),
    accountActivityPath
      ? fetchIndexerJson<{ activities: IndexedActivity[] }>(accountActivityPath)
      : Promise.resolve(null),
    fetchIndexerJson<{ stats: IndexedProjectStats }>("/api/stats"),
    fetchIndexerJson<LandingHealth>("/health")
  ]);

  if (!marketsResponse?.markets?.length) return null;
  const updatedAtMs = Date.parse(String(healthResponse?.updatedAt || ""));
  const snapshotIsStale =
    !healthResponse?.ok ||
    !Number.isFinite(updatedAtMs) ||
    Date.now() - updatedAtMs > MAX_INDEXER_SNAPSHOT_AGE_MS ||
    Boolean(healthResponse.indexer?.lastSyncError);
  if (snapshotIsStale) return null;

  const markets = marketsResponse.markets.map(indexedMarketToView).sort((a, b) => b.id - a.id);
  const marketsById = new Map(markets.map((market) => [market.id, market]));
  const activityRowsById = new Map<string, IndexedActivity>();
  for (const activity of [...(activityResponse?.activities ?? []), ...(accountActivityResponse?.activities ?? [])]) {
    if (activity?.id) activityRowsById.set(activity.id, activity);
  }
  const activities = [...activityRowsById.values()]
    .map((activity) => indexedActivityToItem(activity, marketsById))
    .sort((a, b) => b.timestamp - a.timestamp);

  return {
    markets,
    activities,
    stats: statsResponse?.stats ? indexedStatsToProjectStats(statsResponse.stats) : null,
    total: marketsResponse.total || markets.length,
    health: healthResponse?.ok ? healthResponse : null
  };
}
