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
        "user-agent": "AuraOnSportsAdapter/1.0"
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
  const details = espnEventDetails(event);
  return details.summary;
}

function numericScore(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function competitorNameParts(competitor) {
  return [
    competitor?.team?.displayName,
    competitor?.team?.shortDisplayName,
    competitor?.team?.name,
    competitor?.team?.location,
    competitor?.team?.abbreviation,
    competitor?.team?.nickname
  ]
    .map((value) => cleanText(value, 80))
    .filter(Boolean);
}

function espnEventDetails(event) {
  const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const away = competitors.find((item) => item?.homeAway === "away") || competitors[0];
  const home = competitors.find((item) => item?.homeAway === "home") || competitors[1];
  const awayName = competitorNameParts(away)[0] || "Away";
  const homeName = competitorNameParts(home)[0] || "Home";
  const awayScore = numericScore(away?.score);
  const homeScore = numericScore(home?.score);
  const status = cleanText(competition?.status?.type?.shortDetail || competition?.status?.type?.detail || event?.status?.type?.detail || "", 80);
  const completed = Boolean(competition?.status?.type?.completed || event?.status?.type?.completed);
  const result = `${awayName}${awayScore !== null ? ` ${awayScore}` : ""} @ ${homeName}${homeScore !== null ? ` ${homeScore}` : ""}`;
  return {
    id: String(event?.id || competition?.id || ""),
    date: cleanText(event?.date || competition?.date || "", 40),
    name: cleanText(event?.name || event?.shortName || result, 140),
    shortName: cleanText(event?.shortName || "", 100),
    summary: `${result}${status ? ` (${status})` : ""}${completed ? " [final]" : ""}`,
    status,
    completed,
    competitors: [away, home].filter(Boolean).map((competitor) => ({
      homeAway: cleanText(competitor?.homeAway || "", 20),
      names: competitorNameParts(competitor),
      score: numericScore(competitor?.score),
      winner: typeof competitor?.winner === "boolean" ? competitor.winner : null
    })),
    url: cleanText(
      event?.links?.find?.((link) => link?.href)?.href ||
        competition?.links?.find?.((link) => link?.href)?.href ||
        "",
      240
    )
  };
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

function matchingEventDetailsForMarket(market, events) {
  const terms = teamTermsFromMarket(market);
  if (terms.length === 0) return events.slice(0, 8);
  return events.filter((event) => {
    const lower = `${event.summary || ""} ${event.name || ""} ${event.shortName || ""} ${(event.competitors || [])
      .flatMap((competitor) => competitor.names || [])
      .join(" ")}`.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });
}

export async function gatherEspnScoreboardSnapshot(market, options = {}) {
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
          profile,
          apiUrl,
          date,
          ok: false,
          error: `HTTP ${response.status}`,
          events: [],
          matchedEvents: [],
          finding: `${profile.label} structured scoreboard unavailable for ${date}.`,
          notes: `ESPN ${profile.label} scoreboard API returned HTTP ${response.status}. Treat the scan as inconclusive, not as proof of NO.`
        });
        continue;
      }

      const events = (Array.isArray(body.events) ? body.events : []).map(espnEventDetails).filter((event) => event.summary);
      const matchedEvents = matchingEventDetailsForMarket(market, events).slice(0, maxEvents);
      const sample = (matchedEvents.length > 0 ? matchedEvents : events.slice(0, maxEvents)).map((event) => event.summary).join(" / ");
      rows.push({
        profile,
        apiUrl,
        date,
        ok: true,
        events,
        matchedEvents,
        finding: `${events.length} ${profile.label} event(s) found for ${date}; ${matchedEvents.length} market-term match(es).`,
        notes: `ESPN ${profile.label} scoreboard API returned ${events.length} event(s) for ${date}. ${matchedEvents.length > 0 ? `${matchedEvents.length} row(s) matched terms from the market question/rule.` : "No rows clearly matched the market terms."} Sample: ${sample || "No event rows returned."}`
      });
    } catch (error) {
      rows.push({
        profile,
        apiUrl,
        date,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        events: [],
        matchedEvents: [],
        finding: `${profile.label} structured scoreboard check failed for ${date}.`,
        notes: `Aura could not read ESPN ${profile.label} scoreboard API for ${date}: ${error instanceof Error ? error.message : String(error)}. Do not infer NO from a dynamic sports page without structured evidence.`
      });
    }
  }

  return rows;
}

export async function gatherEspnScoreboardEvidence(market, options = {}) {
  const snapshots = await gatherEspnScoreboardSnapshot(market, options);
  const rows = [];

  for (const snapshot of snapshots) {
    const profile = snapshot.profile || { label: "Sports" };
    if (snapshot.ok) {
      rows.push({
        url: snapshot.apiUrl,
        title: `Objective source scan: ESPN ${profile.label} scoreboard`,
        notes: `${snapshot.notes} Use this structured row together with the official-source rule before proposing YES or NO.`,
        finding: snapshot.finding
      });
    } else if (snapshot.error?.startsWith("HTTP")) {
      rows.push({
        url: snapshot.apiUrl,
        title: `Objective source scan: ${profile.label} scoreboard unavailable`,
        notes: snapshot.notes,
        finding: snapshot.finding
      });
    } else {
      rows.push({
        url: snapshot.apiUrl,
        title: `Objective source scan: ${profile.label} scoreboard needs review`,
        notes: snapshot.notes,
        finding: snapshot.finding
      });
    }
  }

  return rows;
}

export function evaluateSimpleSportsMarket(market, snapshots) {
  const text = marketText(market);
  const lower = text.toLowerCase();
  const matched = (snapshots || [])
    .filter((row) => row?.ok)
    .flatMap((row) => row.matchedEvents || [])
    .filter((event) => event?.completed && (event.competitors || []).length >= 2)
    .filter((event) => (event.competitors || []).every((competitor) => competitor.score !== null));

  if (matched.length !== 1) {
    return null;
  }

  const event = matched[0];
  const competitors = event.competitors || [];
  const totalScore = competitors.reduce((sum, competitor) => sum + Number(competitor.score || 0), 0);
  const sample = event.summary || "final score";

  const totalGoalMatch =
    lower.match(/\bat\s+least\s+(\d+(?:\.\d+)?)\s+(?:total\s+)?(?:goals?|points?|runs?)\b/) ||
    lower.match(/\b(?:total\s+)?(?:goals?|points?|runs?)\s+(?:is\s+)?(?:at\s+least|>=)\s+(\d+(?:\.\d+)?)\b/);
  if (totalGoalMatch) {
    const target = Number(totalGoalMatch[1]);
    if (Number.isFinite(target)) {
      return {
        outcome: totalScore >= target ? "YES" : "NO",
        confidence: 88,
        observedValue: `${sample}; total score ${totalScore}`,
        summary: `ESPN structured scoreboard final was ${sample}. Total score ${totalScore}; rule target is at least ${target}.`,
        checks: ["Matched one completed scoreboard row.", "Compared total score against the market threshold."]
      };
    }
  }

  if (/\b(both teams? (?:to )?score|both.*score|btts)\b/i.test(text)) {
    const bothScored = competitors.every((competitor) => Number(competitor.score || 0) > 0);
    return {
      outcome: bothScored ? "YES" : "NO",
      confidence: 88,
      observedValue: sample,
      summary: `ESPN structured scoreboard final was ${sample}. Both teams ${bothScored ? "scored" : "did not score"}.`,
      checks: ["Matched one completed scoreboard row.", "Checked whether each team had a score above zero."]
    };
  }

  if (/\b(win|won|winner|beat|defeat)\b/i.test(text)) {
    const namedCompetitors = competitors.filter((competitor) =>
      (competitor.names || []).some((name) => hasTeamNameInText(lower, name))
    );
    if (namedCompetitors.length !== 1) return null;
    const target = namedCompetitors[0];
    const maxScore = Math.max(...competitors.map((competitor) => Number(competitor.score || 0)));
    const tiedForHigh = competitors.filter((competitor) => Number(competitor.score || 0) === maxScore).length > 1;
    const won = !tiedForHigh && Number(target.score || 0) === maxScore;
    return {
      outcome: won ? "YES" : "NO",
      confidence: 90,
      observedValue: sample,
      summary: `ESPN structured scoreboard final was ${sample}. ${target.names?.[0] || "The named team"} ${won ? "won" : "did not win"}.`,
      checks: ["Matched one completed scoreboard row.", "Detected exactly one named team from the market text."]
    };
  }

  return null;
}

function hasTeamNameInText(lowerText, rawName) {
  const name = cleanText(rawName, 80).toLowerCase();
  if (!name || name.length < 3) return false;
  const tokens = name
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !["the", "club", "team", "fc", "cf", "sc", "united", "city"].includes(token));
  if (lowerText.includes(name)) return true;
  return tokens.length > 0 && tokens.every((token) => lowerText.includes(token));
}
