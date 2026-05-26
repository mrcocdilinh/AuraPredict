const { ethers } = require("hardhat");

async function main() {
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
