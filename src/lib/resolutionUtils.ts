import type { StructuredResolutionRule, MarketView, MarketRiskFlag, Outcome, CreateFormState, AiMarketDraft } from "../types";
import { AURA_RULE_JSON_PREFIX } from "../constants";

export function normalizeReferenceUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const cleaned = trimmed.replace(/^[\s"'`[(]+|[\s"'`)\].,;:!?]+$/g, "");
  const normalizedToken = cleaned.toLowerCase();
  if (normalizedToken === "e.g" || normalizedToken === "eg" || normalizedToken === "i.e" || normalizedToken === "ie") {
    return "";
  }
  const markdownLink = cleaned.match(/\((https?:\/\/[^\s)]+)\)/i);
  if (markdownLink?.[1]) return markdownLink[1];
  const directLink = cleaned.match(/https?:\/\/[^\s)\]]+/i);
  if (directLink?.[0]) return directLink[0];
  const domainMatch = cleaned.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[^\s)]*)?/i);
  if (domainMatch) return `https://${domainMatch[1]}${domainMatch[2] || ""}`;

  const lower = cleaned.toLowerCase();
  if (lower.includes("coingecko")) return "https://www.coingecko.com";
  if (lower.includes("coinmarketcap")) return "https://coinmarketcap.com";
  if (lower.includes("tradingview")) return "https://www.tradingview.com";
  if (lower.includes("yahoo finance")) return "https://finance.yahoo.com";
  if (lower.includes("nasdaq")) return "https://www.nasdaq.com";
  if (lower.includes("nyse")) return "https://www.nyse.com";
  if (lower.includes("binance")) return "https://www.binance.com";
  if (lower.includes("coinbase")) return "https://www.coinbase.com";
  if (lower.includes("kraken")) return "https://www.kraken.com";
  if (lower.includes("fifa")) return "https://www.fifa.com";
  if (lower.includes("uefa")) return "https://www.uefa.com";
  if (lower.includes("espn")) return "https://www.espn.com";
  if (lower.includes("nba")) return "https://www.nba.com";
  if (lower.includes("mlb")) return "https://www.mlb.com";
  if (lower.includes("nfl")) return "https://www.nfl.com";
  if (lower.includes("reuters")) return "https://www.reuters.com";
  if (lower.includes("associated press") || lower === "ap" || lower.includes(" ap ")) return "https://apnews.com";
  if (lower.includes("bbc")) return "https://www.bbc.com/news";
  if (lower.includes("cnn")) return "https://www.cnn.com";
  if (lower.includes("bloomberg")) return "https://www.bloomberg.com";
  if (lower.includes("wsj") || lower.includes("wall street journal")) return "https://www.wsj.com";
  if (lower.includes("new york times") || lower === "nyt") return "https://www.nytimes.com";
  if (lower.includes("financial times") || lower === "ft") return "https://www.ft.com";
  if (lower.includes("washington post")) return "https://www.washingtonpost.com";
  if (lower.includes("al jazeera")) return "https://www.aljazeera.com";
  if (lower.includes("axios")) return "https://www.axios.com";
  if (lower.includes("politico")) return "https://www.politico.com";
  if (lower.includes("abc news")) return "https://abcnews.go.com";
  if (lower.includes("cbs news")) return "https://www.cbsnews.com";
  if (lower.includes("nbc news")) return "https://www.nbcnews.com";
  if (lower.includes("fox news")) return "https://www.foxnews.com";
  if (lower.includes("the guardian") || lower === "guardian") return "https://www.theguardian.com";
  if (lower === "npr" || lower.includes("national public radio")) return "https://www.npr.org";
  if (lower.includes("coindesk")) return "https://www.coindesk.com";
  if (lower.includes("cointelegraph")) return "https://cointelegraph.com";
  if (lower.includes("federal reserve") || lower === "fed") return "https://www.federalreserve.gov";
  if (lower.includes("bls") || lower.includes("bureau of labor statistics")) return "https://www.bls.gov";
  if (lower.includes("sec")) return "https://www.sec.gov";
  if (lower.includes("fec")) return "https://www.fec.gov";
  if (lower.includes("congress.gov")) return "https://www.congress.gov";
  if (lower.includes("govtrack")) return "https://www.govtrack.us";
  if (lower.includes("ecb")) return "https://www.ecb.europa.eu";
  return cleaned;
}

export function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) return false;
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = new Set([
      "e.g",
      "i.e",
      "example.com",
      "example.net",
      "example.org",
      "localhost",
      "invalid",
      "test"
    ]);
    if (blockedHosts.has(host)) return false;
    if (/^[a-z]\.[a-z]$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function stripRuleMetadata(value: string) {
  return String(value || "")
    .replace(new RegExp(`\\n*${AURA_RULE_JSON_PREFIX}[\\s\\S]*$`), "")
    .trim();
}

export function structuredRuleFromText(value?: string): StructuredResolutionRule | null {
  const text = String(value || "");
  const index = text.indexOf(AURA_RULE_JSON_PREFIX);
  if (index < 0) return null;
  const raw = text.slice(index + AURA_RULE_JSON_PREFIX.length).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StructuredResolutionRule;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function yesConditionText(value: string) {
  const rule = String(value || "").replace(/\s+/g, " ").trim();
  if (!rule) return "";
  const startPatterns = [
    /\bresolve\s+yes\s+if\b/i,
    /\bwill\s+resolve\s+yes\s+if\b/i,
    /\byes\s*:\s*(?:if\s+)?/i,
    /\byes\s+if\b/i
  ];
  const starts = startPatterns
    .map((regex) => {
      const match = rule.match(regex);
      return match ? { index: match.index ?? 0, end: (match.index ?? 0) + match[0].length } : null;
    })
    .filter((item): item is { index: number; end: number } => Boolean(item))
    .sort((a, b) => a.index - b.index);
  if (!starts.length) return rule;

  const tail = rule.slice(starts[0].end);
  const endPatterns = [
    /\bresolve\s+no\s+if\b/i,
    /\bno\s*:\s*(?:if\s+)?/i,
    /\bno\s+if\b/i,
    /\bresolve\s+cancel\b/i,
    /\bcancel\s*:/i,
    /\bcancel\s+if\b/i
  ];
  const endIndex = endPatterns.reduce((best, regex) => {
    const match = tail.match(regex);
    if (!match) return best;
    const index = match.index ?? tail.length;
    return best === -1 || index < best ? index : best;
  }, -1);
  return (endIndex >= 0 ? tail.slice(0, endIndex) : tail).trim() || rule;
}

export function parseComparatorTarget(value: string): Pick<StructuredResolutionRule, "comparator" | "target"> {
  const text = String(value || "").toLowerCase().replace(/\s+/g, " ");
  const patterns: Array<{ comparator: "gt" | "gte" | "lt" | "lte" | "eq"; regex: RegExp }> = [
    { comparator: "gte", regex: /(?:at\s+or\s+above|at\s+least|greater than or equal(?:s)?(?: to)?|no less than|>=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "gte", regex: /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|usdc|points?|index|per ounce)?\s*(?:or higher|or above|or more|or greater)/i },
    { comparator: "lte", regex: /(?:at\s+or\s+below|at\s+most|less than or equal(?:s)?(?: to)?|no more than|<=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "lte", regex: /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|usdc|points?|index|per ounce)?\s*(?:or lower|or below|or less)/i },
    { comparator: "gt", regex: /(?:strictly\s+above|above|higher than|greater than|exceeds?|over|>)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "lt", regex: /(?:strictly\s+below|below|lower than|less than|under|<)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "eq", regex: /(?:exactly|equal(?:s)?|=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i }
  ];
  let best: { comparator: "gt" | "gte" | "lt" | "lte" | "eq"; target: string; index: number; priority: number } | null = null;
  for (let priority = 0; priority < patterns.length; priority += 1) {
    const pattern = patterns[priority];
    const match = text.match(pattern.regex);
    const target = match?.[1]?.replace(/,/g, "");
    if (!target) continue;
    const index = match?.index ?? text.length;
    if (!best || index < best.index || (index === best.index && priority < best.priority)) {
      best = { comparator: pattern.comparator, target, index, priority };
    }
  }
  return best ? { comparator: best.comparator, target: best.target } : {};
}

export function inferRuleKindAndAsset(category: string, text: string): Pick<StructuredResolutionRule, "kind" | "asset" | "metric"> {
  const value = `${category} ${text}`.toLowerCase();
  if (/\/health(?:\?|$|\/)|\bhealth endpoint\b|\bok true\b|\bapi status\b/.test(value)) {
    return { kind: "status-health", metric: "http_health" };
  }
  if (/\bgithub status\b|\bopenai status\b|\bstatus page\b/.test(value)) {
    return { kind: "status-page", metric: "service_status" };
  }
  if (/\bfootball\b|\bsoccer\b|\bnba\b|\bnfl\b|\bmlb\b|\bespn\b|\bfixture\b|\bmatch\b/.test(value)) {
    return { kind: "sports-fixture", metric: "fixture_presence" };
  }
  const cryptoAssets = [
    ["BTC", /\bbtc\b|\bbitcoin\b/],
    ["ETH", /\beth\b|\bethereum\b/],
    ["SOL", /\bsol\b|\bsolana\b/],
    ["BNB", /\bbnb\b/],
    ["XRP", /\bxrp\b/],
    ["ADA", /\bada\b|\bcardano\b/],
    ["DOGE", /\bdoge\b|\bdogecoin\b/],
    ["AVAX", /\bavax\b|\bavalanche\b/],
    ["LINK", /\blink\b|\bchainlink\b/]
  ] as const;
  for (const [asset, regex] of cryptoAssets) {
    if ((regex as RegExp).test(value)) return { kind: "crypto-price", asset, metric: `${asset}/USD spot` };
  }
  const stockAssets = [
    ["TSLA", /\btsla\b|\btesla\b/],
    ["NVDA", /\bnvda\b|\bnvidia\b/],
    ["AAPL", /\baapl\b|\bapple\b/],
    ["MSFT", /\bmsft\b|\bmicrosoft\b/],
    ["GOOGL", /\bgoogl\b|\bgoogle\b|\balphabet\b/],
    ["AMZN", /\bamzn\b|\bamazon\b/],
    ["META", /\bmeta\b|\bfacebook\b/],
    ["MSTR", /\bmstr\b|\bmicrostrategy\b|\bstrategy\b/],
    ["AMD", /\bamd\b|\badvanced micro devices\b/],
    ["COIN", /\bcoin\b|\bcoinbase\b/],
    ["PLTR", /\bpltr\b|\bpalantir\b/],
    ["NFLX", /\bnflx\b|\bnetflix\b/],
    ["HOOD", /\bhood\b|\brobinhood\b/]
  ] as const;
  if (isStockMarketContext(value)) {
    for (const [asset, regex] of stockAssets) {
      if ((regex as RegExp).test(value)) return { kind: "stock-price", asset, metric: `${asset} official close` };
    }
    const tickerMatch = text.match(/\(([A-Z][A-Z0-9.-]{0,7})\)/) || text.match(/\b([A-Z][A-Z0-9.-]{0,7})\s+(?:stock|shares?|equity)\b/);
    const ticker = tickerMatch?.[1]?.toUpperCase();
    if (ticker && !["YES", "NO", "USD", "USDC", "UTC", "API", "CPI"].includes(ticker)) {
      return { kind: "stock-price", asset: ticker, metric: `${ticker} official close` };
    }
  }
  if (/\bxau\b|\bgold\b|\bgc=f\b/.test(value)) return { kind: "macro-price", asset: "GOLD", metric: "XAU/USD spot" };
  if (/\bdxy\b|\bdollar index\b|\bus dollar index\b/.test(value)) return { kind: "macro-price", asset: "DXY", metric: "US Dollar Index" };
  return { kind: "manual-review" };
}

export function buildStructuredResolutionRule(input: {
  question: string;
  category: string;
  closeTime: string;
  resolutionTime: string;
  resolutionSource: string;
  resolutionRule: string;
  fallbackSource: string;
}): StructuredResolutionRule {
  const ruleText = stripRuleMetadata(input.resolutionRule);
  const kind = inferRuleKindAndAsset(input.category, `${input.question} ${ruleText} ${input.resolutionSource}`);
  return {
    version: 1,
    ...kind,
    ...parseComparatorTarget(`${yesConditionText(ruleText)} ${input.question}`),
    closeTimeUtc: input.closeTime,
    resolutionTimeUtc: input.resolutionTime || input.closeTime,
    primarySource: input.resolutionSource,
    fallbackSource: input.fallbackSource || undefined
  };
}

export function resolutionRuleForContract(input: {
  question: string;
  category: string;
  closeTime: string;
  resolutionTime: string;
  resolutionSource: string;
  resolutionRule: string;
  fallbackSource: string;
}) {
  const humanRule = stripRuleMetadata(input.resolutionRule);
  const metadata = buildStructuredResolutionRule({ ...input, resolutionRule: humanRule });
  return `${humanRule}\n${AURA_RULE_JSON_PREFIX}${JSON.stringify(metadata)}`;
}

export function parseUtcDateTime(value: string) {
  const normalizedValue = value.trim().replace("T", " ");
  const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})\s([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    throw new Error("Use UTC format YYYY-MM-DD HH:mm (24-hour).");
  }
  const [, y, mo, d, h, mi] = match;
  const timestamp = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0);
  if (Number.isNaN(timestamp)) {
    throw new Error("Enter a valid UTC close time.");
  }
  return BigInt(Math.floor(timestamp / 1000));
}

export function parseUtcDateTimeParts(value: string) {
  const normalizedValue = value.trim().replace("T", " ");
  const match = normalizedValue.match(/^(\d{4}-\d{2}-\d{2})\s([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return {
    date: match[1],
    time: `${match[2]}:${match[3]}`
  };
}

export function combineUtcDateTimeParts(datePart: string, timePart: string) {
  const date = datePart.trim();
  const time = timePart.trim();
  if (!date || !time) return "";
  return `${date} ${time}`;
}

export function inferKnownEventDeadlineFromText(value: string) {
  const text = value.toLowerCase();
  if (
    /\b(?:2026\s+)?fifa\s+world\s+cup\b|\bworld\s+cup\s+2026\b/.test(text) &&
    /\bwin\b|\bwinner\b|\bchampion\b|\bchampionship\b/.test(text)
  ) {
    return "2026-07-19 23:59";
  }
  return "";
}

export function isSportsTournamentWinnerQuestion(value: string) {
  const text = value.toLowerCase();
  return (
    /\bwin\b|\bwinner\b|\bchampion\b|\bchampionship\b/.test(text) &&
    /\bworld cup\b|\bfifa\b|\bclub world cup\b|\btournament\b|\bleague\b|\bcup\b|\bchampions league\b|\bnba finals\b|\bsuper bowl\b|\bgrand slam\b/.test(text)
  );
}

export function parseAuraUtcCloseTimeFromText(value: string) {
  const text = value.trim();
  if (!text) return "";
  const embeddedUtcCandidates = [
    ...text.matchAll(/(\d{4}-\d{2}-\d{2})[T\s]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*(UTC|Z)\b/gi),
    ...text.matchAll(/(\d{4}-\d{2}-\d{2})[T\s]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*Z/gi)
  ]
    .map((match) => combineUtcDateTimeParts(match[1], `${match[2]}:${match[3]}`))
    .filter(Boolean);
  if (embeddedUtcCandidates.length > 0) {
    return embeddedUtcCandidates.sort((a, b) => Number(parseUtcDateTime(a) - parseUtcDateTime(b))).at(-1) || "";
  }
  const direct = parseUtcDateTimeParts(text);
  if (direct) return combineUtcDateTimeParts(direct.date, direct.time);

  const namedDateThen24hTimeMatch = text.match(
    /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),?\s+([01]?\d|2[0-3]):([0-5]\d)\s*UTC/i
  );
  if (namedDateThen24hTimeMatch) {
    const [, monthRaw, dayRaw, yearRaw, hhRaw, mmRaw] = namedDateThen24hTimeMatch;
    const monthIndex = new Date(`${monthRaw} 1, 2000`).getMonth();
    if (!Number.isNaN(monthIndex)) {
      const datePart = `${yearRaw}-${String(monthIndex + 1).padStart(2, "0")}-${String(Number(dayRaw)).padStart(2, "0")}`;
      const timePart = `${String(Number(hhRaw)).padStart(2, "0")}:${mmRaw}`;
      return combineUtcDateTimeParts(datePart, timePart);
    }
  }

  const namedDateWith24hTimeMatch = text.match(
    /([01]?\d|2[0-3]):([0-5]\d)\s*UTC\s+(?:on\s+)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i
  );
  if (namedDateWith24hTimeMatch) {
    const [, hhRaw, mmRaw, monthRaw, dayRaw, yearRaw] = namedDateWith24hTimeMatch;
    const monthIndex = new Date(`${monthRaw} 1, 2000`).getMonth();
    if (!Number.isNaN(monthIndex)) {
      const datePart = `${yearRaw}-${String(monthIndex + 1).padStart(2, "0")}-${String(Number(dayRaw)).padStart(2, "0")}`;
      const timePart = `${String(Number(hhRaw)).padStart(2, "0")}:${mmRaw}`;
      return combineUtcDateTimeParts(datePart, timePart);
    }
  }

  const namedDateMatch = text.match(
    /(\d{1,2}):(\d{2})\s*(AM|PM)\s+UTC\s+on\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i
  );
  if (namedDateMatch) {
    const [, hhRaw, mmRaw, ampmRaw, monthRaw, dayRaw, yearRaw] = namedDateMatch;
    const monthIndex = new Date(`${monthRaw} 1, 2000`).getMonth();
    if (Number.isNaN(monthIndex)) return "";
    let hour = Number(hhRaw);
    const minute = Number(mmRaw);
    const ampm = ampmRaw.toUpperCase();
    if (ampm === "AM") {
      if (hour === 12) hour = 0;
    } else if (hour < 12) {
      hour += 12;
    }
    const datePart = `${yearRaw}-${String(monthIndex + 1).padStart(2, "0")}-${String(Number(dayRaw)).padStart(2, "0")}`;
    const timePart = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return combineUtcDateTimeParts(datePart, timePart);
  }

  const namedDateOnlyMatch = text.match(/\b(?:on|by|before|until)\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\b/i);
  if (namedDateOnlyMatch) {
    const [, monthRaw, dayRaw, yearRaw] = namedDateOnlyMatch;
    const monthIndex = new Date(`${monthRaw} 1, 2000`).getMonth();
    if (Number.isNaN(monthIndex)) return "";
    const datePart = `${yearRaw}-${String(monthIndex + 1).padStart(2, "0")}-${String(Number(dayRaw)).padStart(2, "0")}`;
    return combineUtcDateTimeParts(datePart, "23:59");
  }

  const knownEventDeadline = inferKnownEventDeadlineFromText(text);
  if (knownEventDeadline) return knownEventDeadline;

  return "";
}

export function parseResolutionReferenceTime(value: string) {
  const text = value.trim();
  if (!text) return "";
  const candidates = [
    ...text.matchAll(/(\d{4}-\d{2}-\d{2})[T\s]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*(UTC|Z)\b/gi),
    ...text.matchAll(/(\d{4}-\d{2}-\d{2})[T\s]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*Z/gi)
  ]
    .map((match) => combineUtcDateTimeParts(match[1], `${match[2]}:${match[3]}`))
    .filter(Boolean);
  if (candidates.length > 0) {
    return candidates.sort((a, b) => Number(parseUtcDateTime(a) - parseUtcDateTime(b))).at(-1) || "";
  }
  return parseAuraUtcCloseTimeFromText(value);
}

export function utcInputFromUnixSeconds(value?: number) {
  if (!value || !Number.isFinite(value)) return "";
  return utcDateTimeInputValue(new Date(value * 1000));
}

export function utcInputIsWeekend(value: string) {
  const parts = parseUtcDateTimeParts(value);
  if (!parts) return false;
  const [year, month, day] = parts.date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function hostFromSource(value: string) {
  const normalized = normalizeReferenceUrl(value);
  if (!isValidHttpUrl(normalized)) return "";
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function sourcePathLooksGeneric(value: string) {
  const normalized = normalizeReferenceUrl(value);
  if (!isValidHttpUrl(normalized)) return true;
  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/g, "");
    return !path || path === "/" || path === "/en" || path === "/markets" || path === "/sports";
  } catch {
    return true;
  }
}

export function isStockMarketContext(value: string) {
  return /\b(?:stock|shares?|equity|nasdaq|nyse|official closing price|market close|yahoo finance|finance\.yahoo|tsla|tesla|nvda|aapl|msft|googl?|amzn|meta)\b/i.test(value);
}

export function isCryptoMarketContext(value: string) {
  return /\b(?:crypto|token|coinmarketcap|coingecko|binance|coinbase|kraken|btc|bitcoin|eth|ethereum|sol|solana|bnb|xrp|ada|doge|avax|link|usdt|usdc)\b/i.test(value);
}

export function isSportsMarketContext(category: string | undefined, value: string) {
  return (category || "").toLowerCase() === "sports" || /\b(?:sports?|match|fixture|group stage|fifa|uefa|nba|nfl|mlb|nhl|world cup|club world cup|premier league|champions league)\b/i.test(value);
}

export function sourceConfidenceFlag(category: string | undefined, source: string, text: string, strict = false): MarketRiskFlag | null {
  const normalizedSource = normalizeReferenceUrl(source);
  if (!isValidHttpUrl(normalizedSource)) {
    return {
      label: "Source weak",
      detail: "Primary source must be a valid http or https URL.",
      severity: "bad"
    };
  }

  const host = hostFromSource(normalizedSource);
  const sportsHosts = ["fifa.com", "uefa.com", "espn.com", "nba.com", "nfl.com", "mlb.com", "nhl.com", "olympics.com"];
  const marketHosts = ["finance.yahoo.com", "nasdaq.com", "nyse.com", "sec.gov", "marketwatch.com", "bloomberg.com", "reuters.com"];
  const cryptoHosts = ["coingecko.com", "coinmarketcap.com", "binance.com", "coinbase.com", "kraken.com"];
  const textValue = text.toLowerCase();
  const genericSourcePath = sourcePathLooksGeneric(normalizedSource);

  if (isSportsMarketContext(category, text) && !sportsHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return {
      label: "Source weak",
      detail: "Sports markets should use an official league/tournament source or a major fixture source.",
      severity: strict ? "bad" : "warn"
    };
  }

  if (strict && isSportsMarketContext(category, text) && genericSourcePath) {
    return {
      label: "Source weak",
      detail: "Sports markets need a fixture, score, standings, schedule, or article URL, not a generic homepage.",
      severity: "bad"
    };
  }

  if (isStockMarketContext(text) && !marketHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return {
      label: "Source weak",
      detail: "Stock markets should use a market-data or exchange source with the exact quote/rule.",
      severity: strict ? "bad" : "warn"
    };
  }

  if (strict && isStockMarketContext(text) && genericSourcePath) {
    return {
      label: "Source weak",
      detail: "Stock markets need an exact quote, release, filing, or calendar URL, not a generic finance homepage.",
      severity: "bad"
    };
  }

  if (isCryptoMarketContext(textValue) && !cryptoHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return {
      label: "Source weak",
      detail: "Crypto price markets should use a direct market-data source.",
      severity: strict ? "bad" : "warn"
    };
  }

  if (strict && isCryptoMarketContext(textValue) && genericSourcePath) {
    return {
      label: "Source weak",
      detail: "Crypto markets need an exact pair, asset, or price page so Oracle can parse the observed value.",
      severity: "bad"
    };
  }

  return null;
}

export function dedupeRiskFlags(flags: MarketRiskFlag[]) {
  const seen = new Set<string>();
  return flags.filter((flag) => {
    const key = `${flag.label}:${flag.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const NUMERIC_ORACLE_ADAPTERS = new Set(["crypto-price", "stock-yahoo-chart", "macro-yahoo-chart", "macro-bls-release"]);

export function parseNumericText(value?: string | number | null) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function marketRiskFlagsForInput(input: {
  question: string;
  category?: string;
  resolutionSource?: string;
  resolutionRule?: string;
  closeTime?: string;
  resolutionTime?: string;
  openReports?: number;
  authorityReviewRequired?: boolean;
  disputed?: boolean;
  proposedAt?: number;
  outcome?: Outcome;
  nowSeconds?: number;
  strictSource?: boolean;
}) {
  const question = input.question || "";
  const rule = input.resolutionRule || "";
  const source = input.resolutionSource || "";
  const text = `${question} ${rule} ${source}`;
  const effectiveTime = input.resolutionTime || input.closeTime || "";
  const ruleTime = parseResolutionReferenceTime(rule);
  const flags: MarketRiskFlag[] = [];

  const sourceFlag = sourceConfidenceFlag(input.category, source, text, Boolean(input.strictSource));
  if (sourceFlag) flags.push(sourceFlag);

  if (ruleTime && effectiveTime && ruleTime !== effectiveTime) {
    flags.push({
      label: "Date mismatch",
      detail: `Rule timestamp ${ruleTime} UTC does not match form timestamp ${effectiveTime} UTC.`,
      severity: "bad"
    });
  }

  const structuredRule = structuredRuleFromText(rule);
  const visibleCondition = parseComparatorTarget(`${yesConditionText(stripRuleMetadata(rule))} ${question}`);
  const structuredTarget = parseNumericText(structuredRule?.target);
  if (
    structuredRule?.comparator &&
    structuredTarget !== null &&
    visibleCondition.comparator &&
    visibleCondition.target &&
    (structuredRule.comparator !== visibleCondition.comparator ||
      Math.abs(structuredTarget - Number(visibleCondition.target)) > Math.max(0.000001, Math.abs(Number(visibleCondition.target)) * 0.000001))
  ) {
    flags.push({
      label: "Rule metadata mismatch",
      detail: `Saved metadata ${structuredRule.comparator.toUpperCase()} ${structuredTarget} does not match visible rule ${visibleCondition.comparator.toUpperCase()} ${visibleCondition.target}.`,
      severity: "bad"
    });
  }

  const referenceTime = ruleTime || effectiveTime;
  if (isStockMarketContext(text) && referenceTime && utcInputIsWeekend(referenceTime)) {
    flags.push({
      label: "Weekend stock close",
      detail: "Official stock closing-price markets should not resolve on Saturday or Sunday.",
      severity: "bad"
    });
  }

  if (isSportsMarketContext(input.category, text)) {
    const hasNextMatchLanguage = /\bnext\s+(?:match|game|fixture)\b/i.test(text);
    const hasFixtureTimestamp = Boolean(ruleTime || parseAuraUtcCloseTimeFromText(question));
    if (hasNextMatchLanguage && !hasFixtureTimestamp) {
      flags.push({
        label: "Unknown fixture",
        detail: "Next-match markets need the official fixture and kickoff timestamp before launch.",
        severity: "bad"
      });
    }

    if (isSportsTournamentWinnerQuestion(text) && !ruleTime && !inferKnownEventDeadlineFromText(text)) {
      flags.push({
        label: "Unknown fixture",
        detail: "Tournament markets need the official final/end timestamp before launch.",
        severity: "bad"
      });
    }
  }

  if ((input.openReports || 0) > 0) {
    flags.push({
      label: "Needs owner review",
      detail: `${input.openReports} open user report${input.openReports === 1 ? "" : "s"} for this market.`,
      severity: "warn"
    });
  }

  if (input.disputed || input.authorityReviewRequired) {
    flags.push({
      label: "Needs owner review",
      detail: input.disputed ? "A formal dispute is open." : "Authority review is required before final settlement.",
      severity: "bad"
    });
  }

  if (
    input.outcome === ("Unresolved" as unknown as Outcome) &&
    Number(input.proposedAt || 0) === 0 &&
    input.resolutionTime &&
    input.nowSeconds &&
    parseUtcInputToUnixSeconds(input.resolutionTime) !== null &&
    Number(parseUtcInputToUnixSeconds(input.resolutionTime)) <= input.nowSeconds
  ) {
    flags.push({
      label: "Needs owner review",
      detail: "Resolution time has passed and no result has been proposed.",
      severity: "info"
    });
  }

  return dedupeRiskFlags(flags);
}

export function parseUtcInputToUnixSeconds(value: string) {
  if (!value) return null;
  try {
    return Number(parseUtcDateTime(value));
  } catch {
    return null;
  }
}

export function marketQualitySnapshot(
  form: CreateFormState,
  draft: AiMarketDraft | null,
  hasRuleTimeMismatch: boolean,
  hasResolutionTime: boolean,
  needsVerifiedEventDeadline: boolean,
  validationFlags: MarketRiskFlag[] = []
) {
  let score = 35;
  const signals: Array<{ label: string; detail: string; state: "good" | "warn" | "bad" }> = [];
  const questionLength = form.question.trim().length;
  const ruleLength = form.resolutionRule.trim().length;
  const sourceOk = isValidHttpUrl(normalizeReferenceUrl(form.resolutionSource));
  const fallbackOk = !form.fallbackSource.trim() || isValidHttpUrl(normalizeReferenceUrl(form.fallbackSource));
  const hasExactRuleTime = Boolean(parseResolutionReferenceTime(form.resolutionRule));

  if (questionLength >= 24 && questionLength <= 180) {
    score += 14;
    signals.push({ label: "Question", detail: "Clear enough for a binary market.", state: "good" });
  } else {
    score -= 8;
    signals.push({ label: "Question", detail: "Make the question specific but not overloaded.", state: "warn" });
  }

  if (sourceOk) {
    score += 16;
    signals.push({ label: "Primary source", detail: "Resolvable source URL is present.", state: "good" });
  } else {
    score -= 16;
    signals.push({ label: "Primary source", detail: "Add an official or reliable URL.", state: "bad" });
  }

  if (ruleLength >= 70 && hasExactRuleTime) {
    score += 18;
    signals.push({ label: "Rule", detail: "Rule defines source, condition, and UTC event time.", state: "good" });
  } else if (ruleLength >= 35) {
    score += 5;
    signals.push({ label: "Rule", detail: "Rule exists, but should define exact value and timestamp.", state: "warn" });
  } else {
    score -= 14;
    signals.push({ label: "Rule", detail: "Resolution rule is too thin for dispute-safe settlement.", state: "bad" });
  }

  if (hasResolutionTime) {
    score += 10;
    signals.push({ label: "Timing", detail: "Separate resolution time is set onchain.", state: "good" });
  } else {
    signals.push({ label: "Timing", detail: "Set the actual event timestamp before launch.", state: "warn" });
  }

  if (hasRuleTimeMismatch) {
    score -= 25;
    signals.push({ label: "Rule time", detail: "Form time and rule time do not match.", state: "bad" });
  }

  if (needsVerifiedEventDeadline) {
    score -= 30;
    signals.push({
      label: "Event date",
      detail: "Tournament winner markets need the official final/end date before launch.",
      state: "bad"
    });
  }

  validationFlags.forEach((flag) => {
    if (flag.severity === "bad") score -= 18;
    if (flag.severity === "warn") score -= 8;
  });

  if (fallbackOk) {
    score += form.fallbackSource.trim() ? 6 : 0;
  } else {
    score -= 8;
    signals.push({ label: "Fallback", detail: "Fallback source URL is invalid.", state: "warn" });
  }

  if (typeof draft?.clarityScore === "number") {
    score = Math.round(score * 0.55 + draft.clarityScore * 0.45);
  }
  if (draft?.duplicateRisk === "HIGH") {
    score -= 20;
    signals.push({ label: "Duplicate risk", detail: "Aura found a highly similar market.", state: "bad" });
  } else if (draft?.duplicateRisk === "MEDIUM") {
    score -= 10;
    signals.push({ label: "Duplicate risk", detail: "Similar markets may split liquidity.", state: "warn" });
  } else if (draft?.duplicateRisk === "LOW") {
    score += 5;
    signals.push({ label: "Duplicate risk", detail: "Aura marked duplicate risk low.", state: "good" });
  }

  const normalizedScore = Math.max(0, Math.min(100, score));
  return {
    score: normalizedScore,
    label: normalizedScore >= 85 ? "Strong" : normalizedScore >= 70 ? "Good" : normalizedScore >= 50 ? "Needs review" : "Risky",
    signals: signals.slice(0, 6)
  };
}

export function defaultSourceByContext(category?: string, text?: string) {
  const cat = (category || "").toLowerCase();
  const content = (text || "").toLowerCase();
  if (cat === "crypto" || /\bbtc\b|\beth\b|token|price|usdt|usdc|coin|coingecko|binance|coinbase/.test(content)) {
    return "https://www.coingecko.com";
  }
  if (cat === "sports" || /match|goal|nba|nfl|mlb|fifa|uefa|atp|wta/.test(content)) {
    return "https://www.espn.com";
  }
  if (cat === "politics" || cat === "macro" || /election|president|white house|fed|cpi|inflation|war|government|parliament/.test(content)) {
    return "https://www.reuters.com";
  }
  if (cat === "arc" || /\barc\b|testnet|mainnet|chain/.test(content)) {
    return "https://docs.arc.io";
  }
  return "https://www.reuters.com";
}

export function utcDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    " ",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes())
  ].join("");
}

export function utcInputFromNow(now: Date, offsetMinutes: number) {
  const timestamp = now.getTime() + Math.max(0, offsetMinutes) * 60 * 1000;
  return utcDateTimeInputValue(new Date(timestamp));
}
