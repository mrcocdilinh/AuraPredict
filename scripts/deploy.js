const { ethers } = require("hardhat");

function readAddress(name, fallback = ethers.ZeroAddress) {
  const value = String(process.env[name] || fallback).trim();
  if (!ethers.isAddress(value)) {
    throw new Error(`${name} must be a valid address.`);
  }
  return value;
}

function readUnits(name, fallback, decimals) {
  return ethers.parseUnits(String(process.env[name] || fallback), decimals);
}

async function main() {
  const version = String(process.env.AURA_CONTRACT_VERSION || "V5").trim().toUpperCase();
  if (version === "V5") {
    await deployV5();
    return;
  }
  await deployV4();
}

async function deployV4() {
  const minStakeUsdc = process.env.MIN_STAKE_USDC || "0.1";
  const usdcToken = String(process.env.ARC_USDC_TOKEN_ADDRESS || "").trim();
  const eurcToken = String(process.env.ARC_EURC_TOKEN_ADDRESS || ethers.ZeroAddress).trim();
  if (!ethers.isAddress(usdcToken)) {
    throw new Error("Missing valid ARC_USDC_TOKEN_ADDRESS for the V4 settlement token.");
  }
  if (!ethers.isAddress(eurcToken)) {
    throw new Error("ARC_EURC_TOKEN_ADDRESS must be empty or a valid address.");
  }
  const minStake = ethers.parseUnits(minStakeUsdc, 6);
  const factory = await ethers.getContractFactory("ArcPredictionMarket");
  const predictionMarket = await factory.deploy(usdcToken, eurcToken, minStake);

  await predictionMarket.waitForDeployment();
  const address = await predictionMarket.getAddress();
  const aiAttestationSigner = String(process.env.AURA_ATTESTATION_SIGNER_ADDRESS || "").trim();
  if (aiAttestationSigner) {
    if (!ethers.isAddress(aiAttestationSigner)) {
      throw new Error("AURA_ATTESTATION_SIGNER_ADDRESS must be a valid address.");
    }
    const tx = await predictionMarket.setAiAttestationSigner(aiAttestationSigner);
    await tx.wait();
  }

  console.log("ArcPredictionMarket deployed:", address);
  console.log("Version: AURAPREDICT_V4");
  console.log("USDC token:", usdcToken);
  if (eurcToken !== ethers.ZeroAddress) console.log("EURC token:", eurcToken);
  console.log("Min stake:", minStakeUsdc, "USDC");
  console.log("Aura attestation signer:", aiAttestationSigner || "disabled (manual proposals require authority review)");
  console.log("Explorer:", `https://testnet.arcscan.app/address/${address}`);
}

async function deployV5() {
  const usdcToken = readAddress("ARC_USDC_TOKEN_ADDRESS");
  const eurcToken = readAddress("ARC_EURC_TOKEN_ADDRESS", ethers.ZeroAddress);
  const usdcDecimals = Number(process.env.ARC_USDC_DECIMALS || 6);
  const eurcDecimals = Number(process.env.ARC_EURC_DECIMALS || 6);
  const minStakeUsdcText = String(process.env.MIN_STAKE_USDC || "0.1");
  const minStakeUsdc = ethers.parseUnits(minStakeUsdcText, usdcDecimals);

  const factory = await ethers.getContractFactory("ArcPredictionMarketV5");
  const predictionMarket = await factory.deploy(usdcToken, "USDC", usdcDecimals, minStakeUsdc);
  await predictionMarket.waitForDeployment();
  const address = await predictionMarket.getAddress();

  await configureV5Asset(predictionMarket, usdcToken, "USDC", usdcDecimals, "USDC");
  if (eurcToken !== ethers.ZeroAddress) {
    await configureV5Asset(predictionMarket, eurcToken, "EURC", eurcDecimals, "EURC");
  }

  const resolutionAuthority = String(process.env.AURA_RESOLUTION_AUTHORITY_ADDRESS || "").trim();
  if (resolutionAuthority) {
    if (!ethers.isAddress(resolutionAuthority)) throw new Error("AURA_RESOLUTION_AUTHORITY_ADDRESS must be valid.");
    await (await predictionMarket.setResolutionAuthority(resolutionAuthority)).wait();
  }

  const trustedForwarder = String(process.env.AURA_TRUSTED_FORWARDER_ADDRESS || "").trim();
  if (trustedForwarder) {
    if (!ethers.isAddress(trustedForwarder)) throw new Error("AURA_TRUSTED_FORWARDER_ADDRESS must be valid.");
    await (await predictionMarket.setTrustedForwarder(trustedForwarder)).wait();
  }

  const aiAttestationSigner = String(process.env.AURA_ATTESTATION_SIGNER_ADDRESS || "").trim();
  if (aiAttestationSigner) {
    if (!ethers.isAddress(aiAttestationSigner)) throw new Error("AURA_ATTESTATION_SIGNER_ADDRESS must be valid.");
    await (await predictionMarket.setAiAttestationSigner(aiAttestationSigner)).wait();
  }

  console.log("ArcPredictionMarket deployed:", address);
  console.log("Version: AURAPREDICT_V5");
  console.log("USDC token:", usdcToken, "min stake:", minStakeUsdcText);
  if (eurcToken !== ethers.ZeroAddress) console.log("EURC token:", eurcToken);
  console.log("Resolution authority:", resolutionAuthority || "owner");
  console.log("Trusted forwarder:", trustedForwarder || "disabled");
  console.log("Aura attestation signer:", aiAttestationSigner || "disabled");
  console.log("Explorer:", `https://testnet.arcscan.app/address/${address}`);
}

async function configureV5Asset(contract, token, symbol, decimals, suffix) {
  const tx = await contract.configureSettlementAsset(
    token,
    true,
    symbol,
    decimals,
    readUnits(`AURA_MIN_STAKE_${suffix}`, process.env[`MIN_STAKE_${suffix}`] || "0.1", decimals),
    readUnits(`AURA_CREATOR_BOND_${suffix}`, "1", decimals),
    readUnits(`AURA_RESOLVER_BOND_${suffix}`, "1", decimals),
    readUnits(`AURA_DISPUTE_BOND_${suffix}`, "1", decimals),
    readUnits(`AURA_REPORT_BOND_${suffix}`, "1", decimals),
    readUnits(`AURA_MARKET_CREATION_FEE_${suffix}`, "0", decimals),
    Number(process.env[`AURA_PROTOCOL_FEE_BPS_${suffix}`] || 0),
    Number(process.env[`AURA_CREATOR_FEE_BPS_${suffix}`] || 0)
  );
  await tx.wait();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
