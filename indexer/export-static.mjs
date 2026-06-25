import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data", "aurapredict-index.json");
const OUT_DIR = path.resolve(process.argv[2] || "static-index");

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const state = JSON.parse(await readFile(DATA_FILE, "utf8"));
  const markets = Object.values(state.markets ?? {}).sort((a, b) => b.id - a.id);
  const activities = [...(state.trades ?? [])].sort((a, b) => b.timestamp - a.timestamp);

  await writeJson(path.join(OUT_DIR, "health.json"), {
    ok: true,
    contractAddress: state.contractAddress,
    chainId: state.chainId,
    updatedAt: state.updatedAt,
    lastIndexedBlock: state.lastIndexedBlock,
    marketCount: state.marketCount
  });
  await writeJson(path.join(OUT_DIR, "api", "stats.json"), {
    stats: state.stats,
    updatedAt: state.updatedAt,
    lastIndexedBlock: state.lastIndexedBlock
  });
  await writeJson(path.join(OUT_DIR, "api", "markets.json"), {
    markets,
    total: state.marketCount,
    updatedAt: state.updatedAt
  });
  await writeJson(path.join(OUT_DIR, "api", "activity.json"), {
    activities,
    updatedAt: state.updatedAt
  });
  await writeJson(path.join(OUT_DIR, "state", "aurapredict-index.json"), state);
  await writeFile(
    path.join(OUT_DIR, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>AuraOn Index</title><pre>AuraOn static index updated ${state.updatedAt}</pre>`,
    "utf8"
  );

  console.log(`[indexer] exported static API to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
