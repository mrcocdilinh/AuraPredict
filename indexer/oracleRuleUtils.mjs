export const NUMERIC_COMPARATORS = new Set(["gt", "gte", "lt", "lte", "eq"]);

export function parseNumericValue(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function detectComparatorTarget(text) {
  const value = String(text || "").toLowerCase().replace(/\s+/g, " ");
  const patterns = [
    { comparator: "gte", regex: /(?:at\s+or\s+above|at\s+least|greater than or equal(?:s)?(?: to)?|no less than|>=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "gte", regex: /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|usdc|points?|index|per ounce)?\s*(?:or higher|or above|or more|or greater)/i },
    { comparator: "lte", regex: /(?:at\s+or\s+below|at\s+most|less than or equal(?:s)?(?: to)?|no more than|<=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "lte", regex: /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:usd|usdc|points?|index|per ounce)?\s*(?:or lower|or below|or less)/i },
    { comparator: "gt", regex: /(?:strictly\s+above|above|higher than|greater than|exceeds?|over|>)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "lt", regex: /(?:strictly\s+below|below|lower than|less than|under|<)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i },
    { comparator: "eq", regex: /(?:exactly|equal(?:s)?|=)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i }
  ];

  let best = null;
  patterns.forEach((pattern, priority) => {
    const match = value.match(pattern.regex);
    const target = parseNumericValue(match?.[1]);
    if (target === null) return;
    const index = match?.index ?? value.length;
    if (!best || index < best.index || (index === best.index && priority < best.priority)) {
      best = { comparator: pattern.comparator, target, index, priority };
    }
  });

  return best ? { comparator: best.comparator, target: best.target } : null;
}

export function compareObservedValue(observed, comparator, target) {
  if (comparator === "gt") return observed > target;
  if (comparator === "gte") return observed >= target;
  if (comparator === "lt") return observed < target;
  if (comparator === "lte") return observed <= target;
  if (comparator === "eq") return Math.abs(observed - target) < 0.000001;
  return false;
}

export function yesConditionTextFromRule(ruleText, fallbackText = "") {
  const rule = String(ruleText || "").replace(/\s+/g, " ").trim();
  if (!rule) return String(fallbackText || "");

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
    .filter(Boolean)
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

export function significantTargetMismatch(left, right) {
  return Math.abs(left - right) > Math.max(0.000001, Math.abs(right) * 0.000001);
}

export function conditionTextFromParts({ rule, question, category } = {}) {
  return [rule, question, category]
    .map((value) => String(value || ""))
    .join(" ")
    .toLowerCase();
}

export function priceConditionFromParts({ rule, question, category, structuredRule } = {}) {
  const conditionText = conditionTextFromParts({ rule, question, category });
  const textCondition =
    detectComparatorTarget(yesConditionTextFromRule(rule, conditionText)) ||
    detectComparatorTarget(conditionText);
  const structuredComparator = String(structuredRule?.comparator || "");
  const structuredTarget = parseNumericValue(structuredRule?.target);
  const hasStructuredCondition =
    NUMERIC_COMPARATORS.has(structuredComparator) &&
    structuredTarget !== null;

  if (textCondition) {
    if (!hasStructuredCondition) return { ...textCondition, source: "text" };
    if (
      structuredComparator !== textCondition.comparator ||
      significantTargetMismatch(structuredTarget, textCondition.target)
    ) {
      return { ...textCondition, source: "text" };
    }
    return { comparator: structuredComparator, target: structuredTarget, source: "structured" };
  }

  return hasStructuredCondition
    ? { comparator: structuredComparator, target: structuredTarget, source: "structured" }
    : null;
}

export function numericOracleIntegrityIssueFromParts({
  rule,
  question,
  category,
  structuredRule,
  proposalComparator,
  proposalTargetValue,
  observedValue,
  actualOutcome
} = {}) {
  const condition = priceConditionFromParts({ rule, question, category, structuredRule });
  if (!condition) return "No numeric YES condition could be parsed from the market rule.";

  const comparator = String(proposalComparator || "");
  const target = parseNumericValue(proposalTargetValue);
  if (!NUMERIC_COMPARATORS.has(comparator) || target === null) {
    return "Oracle proposal has an invalid comparator or target.";
  }

  if (comparator !== condition.comparator || significantTargetMismatch(target, condition.target)) {
    return `Oracle target ${comparator.toUpperCase()} ${target} does not match rule ${condition.comparator.toUpperCase()} ${condition.target}.`;
  }

  const observed = parseNumericValue(observedValue);
  if (observed === null) return "Oracle proposal has no parseable observed value.";

  const expected = compareObservedValue(observed, comparator, target) ? "YES" : "NO";
  if (String(actualOutcome || "").toUpperCase() !== expected) {
    return `Oracle outcome ${String(actualOutcome || "").toUpperCase()} conflicts with observed ${observed} ${comparator.toUpperCase()} ${target}; expected ${expected}.`;
  }
  return "";
}
