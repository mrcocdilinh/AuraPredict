import fs from "node:fs";
import path from "node:path";

const artifactPath = path.resolve("artifacts/contracts/ArcPredictionMarketV5.sol/ArcPredictionMarketV5.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const abiJson = JSON.stringify(artifact.abi, null, 2);

fs.writeFileSync(
  path.resolve("src/contracts/arcPredictionMarketV5Abi.ts"),
  `export const arcPredictionMarketV5Abi = ${abiJson} as const;\n`
);

fs.writeFileSync(
  path.resolve("indexer/arcPredictionMarketV5Abi.mjs"),
  `export const arcPredictionMarketV5Abi = ${abiJson};\n`
);

console.log("Exported ArcPredictionMarketV5 ABI to src/contracts and indexer.");
