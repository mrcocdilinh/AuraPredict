import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, "oracle_backtest_sample.json");

const VALID_OUTCOMES = new Set(["YES", "NO", "CANCEL", "NEEDS_REVIEW", "UNSUPPORTED"]);
const rows = JSON.parse(await readFile(inputPath, "utf8"));

if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error("Backtest input must be a non-empty JSON array.");
}

const normalizedRows = rows.map((row, index) => {
  const id = String(row.id ?? `row-${index + 1}`);
  const adapter = String(row.adapter ?? "unknown");
  const oracleOutcome = String(row.oracleOutcome ?? "").toUpperCase();
  const actualOutcome = String(row.actualOutcome ?? "").toUpperCase();
  const confidence = Number(row.confidence);
  if (!VALID_OUTCOMES.has(oracleOutcome)) {
    throw new Error(`${id}: oracleOutcome must be one of ${[...VALID_OUTCOMES].join(", ")}.`);
  }
  if (!VALID_OUTCOMES.has(actualOutcome)) {
    throw new Error(`${id}: actualOutcome must be one of ${[...VALID_OUTCOMES].join(", ")}.`);
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    throw new Error(`${id}: confidence must be a number from 0 to 100.`);
  }
  return {
    id,
    adapter,
    oracleOutcome,
    actualOutcome,
    confidence,
    correct: oracleOutcome === actualOutcome
  };
});

function summarize(sample) {
  const resolved = sample.filter((row) => row.oracleOutcome !== "NEEDS_REVIEW" && row.oracleOutcome !== "UNSUPPORTED");
  const correct = resolved.filter((row) => row.correct).length;
  const coverage = sample.length === 0 ? 0 : resolved.length / sample.length;
  const accuracy = resolved.length === 0 ? 0 : correct / resolved.length;
  const avgConfidence =
    resolved.length === 0 ? 0 : resolved.reduce((sum, row) => sum + row.confidence, 0) / resolved.length;
  const calibrationGap = Math.abs(avgConfidence / 100 - accuracy);
  return {
    sample: sample.length,
    resolved: resolved.length,
    correct,
    coverage,
    accuracy,
    avgConfidence,
    calibrationGap
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function line(label, summary) {
  return [
    label.padEnd(14),
    String(summary.sample).padStart(6),
    String(summary.resolved).padStart(8),
    String(summary.correct).padStart(8),
    formatPercent(summary.coverage).padStart(10),
    formatPercent(summary.accuracy).padStart(10),
    `${summary.avgConfidence.toFixed(1)}%`.padStart(12),
    formatPercent(summary.calibrationGap).padStart(12)
  ].join("  ");
}

console.log(`Oracle backtest input: ${path.relative(process.cwd(), inputPath)}`);
console.log("");
console.log(["threshold".padEnd(14), "sample".padStart(6), "resolved".padStart(8), "correct".padStart(8), "coverage".padStart(10), "accuracy".padStart(10), "avg conf".padStart(12), "calib gap".padStart(12)].join("  "));
for (const threshold of [50, 60, 70, 75, 78, 80, 85, 90, 95]) {
  const sample = normalizedRows.filter((row) => row.confidence >= threshold);
  console.log(line(`>= ${threshold}%`, summarize(sample)));
}

console.log("");
console.log("By adapter at current 78% threshold:");
const adapters = [...new Set(normalizedRows.map((row) => row.adapter))].sort();
for (const adapter of adapters) {
  const sample = normalizedRows.filter((row) => row.adapter === adapter && row.confidence >= 78);
  if (sample.length === 0) continue;
  console.log(line(adapter.slice(0, 14), summarize(sample)));
}

console.log("");
console.log("Use a larger historical dataset before treating 78% as production-ready.");
