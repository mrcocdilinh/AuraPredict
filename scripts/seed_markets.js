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
  const v5Factory = await ethers.getContractFactory("ArcPredictionMarketV5");
  const legacyFactory = await ethers.getContractFactory("ArcPredictionMarket");
  let contract = v5Factory.attach(contractAddress);
  const version = await contract.CONTRACT_VERSION().catch(() => "legacy");
  const isV5 = version === "AURAPREDICT_V5";
  if (!isV5) {
    contract = legacyFactory.attach(contractAddress);
  }
  const isStablecoinContract = version === "AURAPREDICT_V3" || version === "AURAPREDICT_V4" || isV5;
  const isV4 = version === "AURAPREDICT_V4";
  const settlementToken = isStablecoinContract ? await contract.defaultSettlementToken() : ethers.ZeroAddress;
  const asset = isStablecoinContract ? await contract.assetConfigs(settlementToken) : null;
  const creatorBond = isStablecoinContract ? asset.creatorBond : await contract.creatorBond();
  const marketCreationFee = isStablecoinContract ? asset.marketCreationFee : await contract.marketCreationFee();
  const requiredValue = creatorBond + marketCreationFee;
  const tokenDecimals = isStablecoinContract ? Number(asset.decimals) : 18;
  const symbol = isStablecoinContract ? asset.symbol : "USDC";
  const token = isStablecoinContract
    ? new ethers.Contract(
        settlementToken,
        [
          "function approve(address spender,uint256 amount) returns (bool)",
          "function balanceOf(address owner) view returns (uint256)"
        ],
        signer
      )
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
  const selectedCount = endExclusive - startIndex;

  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= markets.length) {
    throw new Error(`Invalid START_INDEX=${process.env.START_INDEX || "undefined"}`);
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid LIMIT=${process.env.LIMIT || "undefined"}`);
  }

  console.log(`Seeding range: [${startIndex}..${endExclusive - 1}] (${selectedCount} markets)`);

  if (isStablecoinContract && !dryRun) {
    const balance = await token.balanceOf(signer.address);
    const requiredForRange = requiredValue * BigInt(selectedCount);
    console.log("Wallet balance:", ethers.formatUnits(balance, tokenDecimals), symbol);
    if (balance < requiredForRange) {
      throw new Error(
        `Insufficient ${symbol}: need ${ethers.formatUnits(requiredForRange, tokenDecimals)}, have ${ethers.formatUnits(balance, tokenDecimals)}`
      );
    }
  }

  for (let i = startIndex; i < endExclusive; i += 1) {
    const item = markets[i];
    const question = String(item.question || "").trim();
    const category = String(item.category || "Other").trim() || "Other";
    const closeInHours = Number(item.closeInHours || 24);
    const resolutionInHours = Number(item.resolutionInHours || closeInHours);

    if (question.length < 8) {
      throw new Error(`Invalid question at index ${i}: must be >= 8 chars`);
    }
    if (!Number.isFinite(closeInHours) || closeInHours < 1) {
      throw new Error(`Invalid closeInHours at index ${i}`);
    }
    if (!Number.isFinite(resolutionInHours) || resolutionInHours < closeInHours) {
      throw new Error(`Invalid resolutionInHours at index ${i}`);
    }

    const closeTime = BigInt(now + Math.floor(closeInHours * 3600));
    const resolutionTime = BigInt(now + Math.floor(resolutionInHours * 3600));
    console.log(
      `[${i + 1}/${markets.length}] ${question} | ${category} | closeInHours=${closeInHours} | resolutionInHours=${resolutionInHours}`
    );

    if (dryRun) continue;

    let tx;
    if (isStablecoinContract) {
      const metadataHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify({ question, category, closeTime: closeTime.toString(), resolutionTime: resolutionTime.toString() }))
      );
      const approveTx = await token.approve(contractAddress, requiredValue);
      await approveTx.wait();
      const resolutionSource = String(item.resolutionSource || item.source || "https://app.aurapredict.xyz").trim();
      const fallbackSource = String(item.fallbackSource || "").trim();
      const resolutionRule = String(
        item.resolutionRule ||
          "Resolve YES if the stated event is verified by the primary source by the market's onchain resolution time; otherwise resolve NO. Resolve CANCEL only if the source is unavailable or the rule is ambiguous."
      ).trim();
      const resolutionMode = Number(item.resolutionMode ?? 0);
      const resolutionAdapter = String(item.resolutionAdapter || ethers.ZeroAddress).trim();

      if (isV4 && (!resolutionSource || resolutionSource.length > 512)) {
        throw new Error(`Invalid resolutionSource at index ${i}`);
      }
      if (isV4 && (!resolutionRule || resolutionRule.length > 2048)) {
        throw new Error(`Invalid resolutionRule at index ${i}`);
      }
      if (isV5) {
        tx = await contract.submitMarketDraft({
          question,
          category,
          sourceUrl: resolutionSource,
          resolutionRule,
          metadataURI: String(item.metadataURI || resolutionSource || "").trim(),
          token: settlementToken,
          adapter: resolutionAdapter,
          closeTime,
          resolutionTime,
          mode: resolutionMode,
          outcomeCount: Number(item.outcomeCount || 2),
          outcomeLabelsHash: item.outcomeLabelsHash || ethers.keccak256(ethers.toUtf8Bytes("YES|NO")),
          sourceHash: ethers.keccak256(ethers.toUtf8Bytes(resolutionSource)),
          ruleHash: ethers.keccak256(ethers.toUtf8Bytes(resolutionRule))
        });
      } else {
        tx = isV4
        ? await contract.createMarket(
            question,
            category,
            settlementToken,
            closeTime,
            resolutionTime,
            resolutionSource,
            fallbackSource,
            resolutionRule,
            resolutionMode,
            resolutionAdapter
          )
        : await contract.createMarket(question, category, settlementToken, closeTime, resolutionTime, metadataHash, "", 0);
      }
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
