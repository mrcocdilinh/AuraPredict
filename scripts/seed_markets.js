const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const contractAddress = process.env.PREDICTION_MARKET_ADDRESS || process.env.VITE_PREDICTION_MARKET_ADDRESS;
  if (!contractAddress) {
    throw new Error("Missing PREDICTION_MARKET_ADDRESS (or VITE_PREDICTION_MARKET_ADDRESS).");
  }

  const fileArg = process.env.SEED_FILE || process.argv[2] || "scripts/seed_markets_80.json";
  const absolutePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Seed file not found: ${absolutePath}`);
  }

  const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
  const raw = fs.readFileSync(absolutePath, "utf8");
  const markets = JSON.parse(raw);
  if (!Array.isArray(markets) || markets.length === 0) {
    throw new Error("Seed file must be a non-empty JSON array.");
  }

  const [signer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("ArcPredictionMarket");
  const contract = factory.attach(contractAddress);
  const version = await contract.CONTRACT_VERSION().catch(() => "legacy");
  const isV3 = version === "AURAPREDICT_V3";
  const settlementToken = isV3 ? await contract.defaultSettlementToken() : ethers.ZeroAddress;
  const asset = isV3 ? await contract.assetConfigs(settlementToken) : null;
  const creatorBond = isV3 ? asset.creatorBond : await contract.creatorBond();
  const marketCreationFee = isV3 ? asset.marketCreationFee : await contract.marketCreationFee();
  const requiredValue = creatorBond + marketCreationFee;
  const tokenDecimals = isV3 ? Number(asset.decimals) : 18;
  const symbol = isV3 ? asset.symbol : "USDC";
  const token = isV3
    ? new ethers.Contract(settlementToken, ["function approve(address spender,uint256 amount) returns (bool)"], signer)
    : null;

  console.log("Seeder wallet:", signer.address);
  console.log("Contract:", contractAddress);
  console.log("Markets in file:", markets.length);
  console.log("Contract version:", version);
  console.log("Per market cost:", ethers.formatUnits(requiredValue, tokenDecimals), symbol);
  console.log("Total cost:", ethers.formatUnits(requiredValue * BigInt(markets.length), tokenDecimals), symbol);
  if (dryRun) {
    console.log("Mode: dry-run (no transaction will be sent)");
  }

  const now = Math.floor(Date.now() / 1000);
  const startIndex = Number(process.env.START_INDEX || 0);
  const limit = Number(process.env.LIMIT || markets.length);
  const endExclusive = Math.min(markets.length, startIndex + limit);

  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= markets.length) {
    throw new Error(`Invalid START_INDEX=${process.env.START_INDEX || "undefined"}`);
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid LIMIT=${process.env.LIMIT || "undefined"}`);
  }

  console.log(`Seeding range: [${startIndex}..${endExclusive - 1}] (${endExclusive - startIndex} markets)`);

  for (let i = startIndex; i < endExclusive; i += 1) {
    const item = markets[i];
    const question = String(item.question || "").trim();
    const category = String(item.category || "Other").trim() || "Other";
    const closeInHours = Number(item.closeInHours || 24);

    if (question.length < 8) {
      throw new Error(`Invalid question at index ${i}: must be >= 8 chars`);
    }
    if (!Number.isFinite(closeInHours) || closeInHours < 1) {
      throw new Error(`Invalid closeInHours at index ${i}`);
    }

    const closeTime = BigInt(now + Math.floor(closeInHours * 3600));
    console.log(`[${i + 1}/${markets.length}] ${question} | ${category} | closeInHours=${closeInHours}`);

    if (dryRun) continue;

    let tx;
    if (isV3) {
      const metadataHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify({ question, category, closeTime: closeTime.toString(), resolutionTime: closeTime.toString() }))
      );
      const approveTx = await token.approve(contractAddress, requiredValue);
      await approveTx.wait();
      tx = await contract.createMarket(question, category, settlementToken, closeTime, closeTime, metadataHash, "", 0);
    } else {
      tx = await contract.createMarket(question, category, closeTime, { value: requiredValue });
    }
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
