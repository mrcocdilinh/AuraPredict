const ESPN_SCOREBOARD_BASE = "https://site.api.espn.com/apis/site/v2/sports";

const ESPN_PROFILES = [
  {
    id: "mlb",
    label: "MLB",
    sportPath: "baseball/mlb",
    patterns: [/\bmlb\b/i, /\bmajor league baseball\b/i]
  },
  {
    id: "nba",
    label: "NBA",
    sportPath: "basketball/nba",
    patterns: [/\bnba\b/i, /\bnational basketball association\b/i]
  },
  {
    id: "nfl",
    label: "NFL",
    sportPath: "football/nfl",
    patterns: [/\bnfl\b/i, /\bnational football league\b/i]
  },
  {
    id: "nhl",
    label: "NHL",
    sportPath: "hockey/nhl",
    patterns: [/\bnhl\b/i, /\bnational hockey league\b/i]
  },
  {
    id: "fifa-world-cup",
    label: "FIFA World Cup",
    sportPath: "soccer/fifa.world",
    patterns: [/\bfifa world cup\b/i, /\bworld cup\b/i]
  },
  {
    id: "fifa-club-world-cup",
    label: "FIFA Club World Cup",
    sportPath: "soccer/fifa.cwc",
    patterns: [/\bfifa club world cup\b/i, /\bclub world cup\b/i]
  },
  {
    id: "uefa-champions",
    label: "UEFA Champions League",
    sportPath: "soccer/uefa.champions",
    patterns: [/\buefa champions league\b/i, /\bchampions league\b/i]
  }
];

function cleanText(value, max = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function marketText(market) {
  return [
    market?.question,
    market?.resolutionRule,
    market?.category,
    market?.primarySource,
    market?.fallbackSource
  ]
    .filter(Boolean)
    .join(" ");
}

function utcDateFromSeconds(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(value * 1000).toISOString().slice(0, 10);
}

function espnDateFromYmd(ymd) {
  return String(ymd || "").replace(/-/g, "");
}

function extractExplicitYmd(text) {
  const iso = String(text || "").match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const longDate = String(text || "").match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (!longDate) return "";
  const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].findIndex((month) =>
    longDate[1].toLowerCase().startsWith(month)
  );
  if (monthIndex < 0) return "";
  return `${longDate[3]}-${String(monthIndex + 1).padStart(2, "0")}-${String(Number(longDate[2])).padStart(2, "0")}`;
}

function eventDateForMarket(market) {
  const text = marketText(market);
  return (
    extractExplicitYmd(text) ||
    utcDateFromSeconds(market?.resolutionTime) ||
    utcDateFromSeconds(market?.closeTime)
  );
}

function scoreboardProfilesForMarket(market) {
  const text = marketText(market);
  if (!/\b(score|scores?|fixture|fixtures?|schedule|scheduled|match|game|games?|won|win|winner|beat|defeat|draw|loss|final|opening)\b/i.test(text)) {
    return [];
  }
  const directProfiles = ESPN_PROFILES.filter((profile) => profile.patterns.some((pattern) => pattern.test(text)));
  if (directProfiles.length > 0) return directProfiles.slice(0, 3);
  if (String(market?.category || "").toLowerCase() !== "sports") return [];
  return ESPN_PROFILES.filter((profile) => ["fifa-world-cup", "nba", "nfl", "nhl", "mlb"].includes(profile.id)).slice(0, 3);
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "AuraPredictSportsAdapter/1.0"
      },
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function formatEspnEvent(event) {
  const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const away = competitors.find((item) => item?.homeAway === "away") || competitors[0];
  const home = competitors.find((item) => item?.homeAway === "home") || competitors[1];
  const awayName = cleanText(away?.team?.displayName || away?.team?.shortDisplayName || away?.team?.name || "Away", 80);
  const homeName = cleanText(home?.team?.displayName || home?.team?.shortDisplayName || home?.team?.name || "Home", 80);
  const awayScore = away?.score ?? "";
  const homeScore = home?.score ?? "";
  const status = cleanText(competition?.status?.type?.shortDetail || competition?.status?.type?.detail || event?.status?.type?.detail || "", 80);
  const completed = Boolean(competition?.status?.type?.completed || event?.status?.type?.completed);
  const result = `${awayName}${awayScore !== "" ? ` ${awayScore}` : ""} @ ${homeName}${homeScore !== "" ? ` ${homeScore}` : ""}`;
  return `${result}${status ? ` (${status})` : ""}${completed ? " [final]" : ""}`;
}

function teamTermsFromMarket(market) {
  const text = cleanText(marketText(market), 1000).toLowerCase();
  return [...new Set(
    text
      .split(/[^a-z0-9]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 4 && !["will", "with", "from", "their", "match", "game", "world", "fifa", "club", "score", "open", "opening", "before", "after"].includes(term))
  )].slice(0, 12);
}

function matchingEventsForMarket(market, eventSummaries) {
  const terms = teamTermsFromMarket(market);
  if (terms.length === 0) return eventSummaries.slice(0, 8);
  return eventSummaries.filter((summary) => {
    const lower = summary.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });
}

export async function gatherEspnScoreboardEvidence(market, options = {}) {
  const date = eventDateForMarket(market);
  if (!date) return [];
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 6500));
  const maxEvents = Math.max(1, Number(options.maxEvents || 8));
  const profiles = scoreboardProfilesForMarket(market);
  const rows = [];

  for (const profile of profiles) {
    const apiUrl = `${ESPN_SCOREBOARD_BASE}/${profile.sportPath}/scoreboard?dates=${espnDateFromYmd(date)}`;
    try {
      const { response, body } = await fetchJson(apiUrl, timeoutMs);
      if (!response.ok || !body || typeof body !== "object") {
        rows.push({
          url: apiUrl,
          title: `Objective source scan: ${profile.label} scoreboard unavailable`,
          notes: `ESPN ${profile.label} scoreboard API returned HTTP ${response.status}. Treat the official/source scan as inconclusive, not as proof of NO.`,
          finding: `${profile.label} structured scoreboard unavailable for ${date}.`
        });
        continue;
      }

      const events = Array.isArray(body.events) ? body.events : [];
      const eventSummaries = events.map(formatEspnEvent).filter(Boolean);
      const matched = matchingEventsForMarket(market, eventSummaries).slice(0, maxEvents);
      const sample = (matched.length > 0 ? matched : eventSummaries.slice(0, maxEvents)).join(" / ");
      rows.push({
        url: apiUrl,
        title: `Objective source scan: ESPN ${profile.label} scoreboard`,
        notes: `ESPN ${profile.label} scoreboard API returned ${events.length} event(s) for ${date}. ${matched.length > 0 ? `${matched.length} row(s) matched terms from the market question/rule.` : "No rows clearly matched the market terms."} Sample: ${sample || "No event rows returned."} Use this structured row together with the official-source rule before proposing YES or NO.`,
        finding: `${events.length} ${profile.label} event(s) found for ${date}; ${matched.length} market-term match(es).`
      });
    } catch (error) {
      rows.push({
        url: apiUrl,
        title: `Objective source scan: ${profile.label} scoreboard needs review`,
        notes: `Aura could not read ESPN ${profile.label} scoreboard API for ${date}: ${error instanceof Error ? error.message : String(error)}. Do not infer NO from a dynamic sports page without structured evidence.`,
        finding: `${profile.label} structured scoreboard check failed for ${date}.`
      });
    }
  }

  return rows;
}
