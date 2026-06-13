const AUTHORITATIVE_EVIDENCE_HOSTS = new Map([
  ["fifa.com", 90],
  ["mlb.com", 90],
  ["nba.com", 90],
  ["nhl.com", 90],
  ["nfl.com", 90],
  ["uefa.com", 90],
  ["espn.com", 72],
  ["espn.co.uk", 72],
  ["olympics.com", 72],
  ["bls.gov", 92],
  ["bea.gov", 92],
  ["federalreserve.gov", 92],
  ["treasury.gov", 88],
  ["sec.gov", 88],
  ["coinbase.com", 78],
  ["binance.com", 78],
  ["coingecko.com", 78],
  ["coinmarketcap.com", 76],
  ["status.circle.com", 90],
  ["githubstatus.com", 90],
  ["status.openai.com", 90],
  ["cloudflarestatus.com", 90],
  ["circle.com", 82],
  ["arc.io", 82],
  ["openai.com", 82],
  ["whitehouse.gov", 88],
  ["congress.gov", 88]
]);

const WEAK_EVIDENCE_HOST_PATTERNS = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)threads\.net$/i,
  /(^|\.)reddit\.com$/i
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9.%:$+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostnameForUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceHostScore(host) {
  if (!host) return 0;
  if (AUTHORITATIVE_EVIDENCE_HOSTS.has(host)) return AUTHORITATIVE_EVIDENCE_HOSTS.get(host);
  for (const [officialHost, score] of AUTHORITATIVE_EVIDENCE_HOSTS.entries()) {
    if (host.endsWith(`.${officialHost}`)) return score;
  }
  if (WEAK_EVIDENCE_HOST_PATTERNS.some((pattern) => pattern.test(host))) return -45;
  if (/\.(gov|edu)$/i.test(host)) return 65;
  return 10;
}

function marketKeywordScore(market, result) {
  const marketText = normalizeText(`${market?.question || ""} ${market?.resolutionRule || market?.resolutionCriteria || ""}`);
  const resultText = normalizeText(`${result.title || ""} ${result.snippet || ""} ${result.url || ""}`);
  if (!marketText || !resultText) return 0;
  const keywords = marketText
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !["will", "this", "that", "with", "from", "before", "after", "market", "resolve", "official"].includes(word));
  if (keywords.length === 0) return 0;
  const unique = [...new Set(keywords)].slice(0, 16);
  const matches = unique.filter((word) => resultText.includes(word)).length;
  return Math.round((matches / unique.length) * 35);
}

export function scoreEvidenceSearchResult(market, result, sourceHosts = []) {
  const host = hostnameForUrl(result.url);
  let score = sourceHostScore(host);
  if (host && sourceHosts.some((sourceHost) => host === sourceHost || host.endsWith(`.${sourceHost}`))) score += 80;
  score += marketKeywordScore(market, result);
  if (/\b(final|result|score|official|release|reported|published|announced|winner|won|lost)\b/i.test(`${result.title} ${result.snippet}`)) {
    score += 14;
  }
  if (!result.url) score -= 15;
  if (!result.snippet) score -= 8;
  return score;
}
