import {
  compareObservedValue,
  numericOracleIntegrityIssueFromParts,
  parseNumericValue,
  priceConditionFromParts,
  yesConditionTextFromRule
} from "../indexer/oracleRuleUtils.mjs";
import { evaluateSimpleSportsMarket } from "../indexer/sportsAdapters.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function conditionFor(rule, structuredRule = null) {
  return priceConditionFromParts({
    rule,
    question: "",
    category: "crypto",
    structuredRule
  });
}

function outcomeFor(rule, observed, structuredRule = null) {
  const condition = conditionFor(rule, structuredRule);
  assert(condition, `No condition parsed for rule: ${rule}`);
  return compareObservedValue(observed, condition.comparator, condition.target) ? "YES" : "NO";
}

assertEqual(parseNumericValue(undefined), null, "undefined must not parse as zero");
assertEqual(parseNumericValue(""), null, "blank strings must not parse as zero");
assertEqual(parseNumericValue("0"), 0, "literal zero should still parse as zero");
assertEqual(parseNumericValue("BTC close 64,410.01"), 64410.01, "formatted numbers should parse");

const solRule =
  "Resolve YES if Binance SOL/USDT daily candle for 2026-06-13 UTC closes strictly above 150. Resolve NO if it closes at or below 150.";
const ethRule =
  "Resolve YES if Binance ETH/USDT daily candle for 2026-06-13 UTC closes strictly above 1800. Resolve NO if it closes at or below 1800.";
const btcRule =
  "Resolve YES if Binance BTC/USDT daily candle for 2026-06-13 UTC closes strictly above 65000. Resolve NO if it closes at or below 65000.";

assertEqual(outcomeFor(solRule, 68.81, { comparator: "gte", target: "0" }), "NO", "SOL below 150 must resolve NO even with stale target zero metadata");
assertEqual(outcomeFor(ethRule, 1679.46, { comparator: "gte", target: "0" }), "NO", "ETH below 1800 must resolve NO even with stale target zero metadata");
assertEqual(outcomeFor(btcRule, 64410.01, { comparator: "gte", target: "0" }), "NO", "BTC below 65000 must resolve NO even with stale target zero metadata");
assert(
  numericOracleIntegrityIssueFromParts({
    rule: solRule,
    category: "crypto",
    structuredRule: { comparator: "gte", target: "0" },
    proposalComparator: "gte",
    proposalTargetValue: "0",
    observedValue: "SOL/USDT close 68.81",
    actualOutcome: "YES"
  }).includes("does not match rule GT 150"),
  "a proposal using stale GTE 0 metadata must be blocked"
);
assert(
  numericOracleIntegrityIssueFromParts({
    rule: solRule,
    category: "crypto",
    structuredRule: { comparator: "gte", target: "0" },
    proposalComparator: "gt",
    proposalTargetValue: "150",
    observedValue: "SOL/USDT close 68.81",
    actualOutcome: "YES"
  }).includes("expected NO"),
  "a stale/wrong YES proposal for SOL below 150 must be blocked"
);

const yesNoRule =
  "YES: If Tesla's closing price on June 14, 2026 is greater than 200. NO: If the official closing price is at or below 200.";
const yesBranch = yesConditionTextFromRule(yesNoRule);
assert(!/NO:/i.test(yesBranch), "YES condition extraction must stop before the NO branch");
assertEqual(outcomeFor(yesNoRule, 199.99), "NO", "YES branch comparator should drive the outcome");
assertEqual(outcomeFor(yesNoRule, 200.01), "YES", "YES branch greater-than threshold should pass above target");

const mstrRule =
  "Resolve YES if the official closing price of MSTR stock on June 12, 2026 is strictly above 120. Resolve NO if it closes at or below 120.";
assertEqual(outcomeFor(mstrRule, 123.97000122070312, { kind: "stock-price", asset: "MSTR", comparator: "gte", target: "0" }), "YES", "MSTR close above 120 must resolve YES even with stale metadata");
assertEqual(outcomeFor(mstrRule, 119.99, { kind: "stock-price", asset: "MSTR", comparator: "gte", target: "0" }), "NO", "MSTR close below or equal rule threshold must resolve NO");
assert(
  numericOracleIntegrityIssueFromParts({
    rule: mstrRule,
    category: "Other",
    structuredRule: { kind: "stock-price", asset: "MSTR", comparator: "gte", target: "0" },
    proposalComparator: "gte",
    proposalTargetValue: "0",
    observedValue: "MSTR close 123.97000122070312",
    actualOutcome: "YES"
  }).includes("does not match rule GT 120"),
  "a stock proposal using stale GTE 0 metadata must be blocked"
);

const scheduleRule =
  "Resolve YES if MLB.com lists at least 10 scheduled MLB regular season games for June 7, 2026. Resolve NO if it lists fewer than 10.";
assertEqual(outcomeFor(scheduleRule, 15), "YES", "at least threshold should pass when observed is higher");
assertEqual(outcomeFor(scheduleRule, 8), "NO", "at least threshold should fail when observed is lower");

const lowerRule =
  "Resolve YES if the U.S. Dollar Index is below 100. Resolve NO if it is at or above 100.";
assertEqual(outcomeFor(lowerRule, 99.9), "YES", "below threshold should pass under target");
assertEqual(outcomeFor(lowerRule, 100), "NO", "below threshold should fail at target");

assertEqual(conditionFor("No numeric condition here."), null, "rules without numeric thresholds should not invent a condition");

const mexicoSportsMarket = {
  question: "Will Mexico win its opening match at the 2026 FIFA World Cup?",
  resolutionRule:
    "Resolve YES if FIFA's official match result lists Mexico as the winner of Mexico's first match at the 2026 FIFA World Cup after normal time including stoppage time. Resolve NO if Mexico draws or loses.",
  category: "Sports",
  primarySource: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures"
};
const mexicoSnapshot = [
  {
    ok: true,
    matchedEvents: [
      {
        completed: true,
        summary: "Mexico 2 @ South Africa 0 (FT) [final]",
        competitors: [
          { names: ["Mexico", "MEX"], score: 2, winner: true },
          { names: ["South Africa", "RSA"], score: 0, winner: false }
        ]
      }
    ]
  }
];
assertEqual(evaluateSimpleSportsMarket(mexicoSportsMarket, mexicoSnapshot)?.outcome, "YES", "sports winner market should resolve from one completed scoreboard row");

const totalGoalsMarket = {
  question: "Will Canada vs Bosnia and Herzegovina have at least 2 total goals in their 2026 FIFA World Cup match?",
  resolutionRule: "Resolve YES if the official final score has at least 2 total goals. Resolve NO otherwise.",
  category: "Sports"
};
const totalGoalsSnapshot = [
  {
    ok: true,
    matchedEvents: [
      {
        completed: true,
        summary: "Canada 1 @ Bosnia and Herzegovina 1 (FT) [final]",
        competitors: [
          { names: ["Canada", "CAN"], score: 1 },
          { names: ["Bosnia and Herzegovina", "BIH"], score: 1 }
        ]
      }
    ]
  }
];
assertEqual(evaluateSimpleSportsMarket(totalGoalsMarket, totalGoalsSnapshot)?.outcome, "YES", "sports total-goals market should compare final total against threshold");

const bttsMarket = {
  question: "Will both teams score in Mexico vs South Africa at the 2026 FIFA World Cup?",
  resolutionRule: "Resolve YES if both teams score at least one goal. Resolve NO if either team scores zero.",
  category: "Sports"
};
assertEqual(evaluateSimpleSportsMarket(bttsMarket, mexicoSnapshot)?.outcome, "NO", "BTTS market should resolve NO when one team has zero");

const ambiguousSportsSnapshot = [
  {
    ok: true,
    matchedEvents: [...mexicoSnapshot[0].matchedEvents, ...totalGoalsSnapshot[0].matchedEvents]
  }
];
assertEqual(evaluateSimpleSportsMarket(mexicoSportsMarket, ambiguousSportsSnapshot), null, "sports oracle must not auto-resolve when multiple rows match");

console.log("oracle regression checks passed");
