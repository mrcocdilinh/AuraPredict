const { ethers } = require("hardhat");

async function main() {
  const minStakeUsdc = process.env.MIN_STAKE_USDC || "0.1";
  const minStake = ethers.parseUnits(minStakeUsdc, 18);
  const factory = await ethers.getContractFactory("ArcPredictionMarket");
  const predictionMarket = await factory.deploy(minStake);

  await predictionMarket.waitForDeployment();
  const address = await predictionMarket.getAddress();

  console.log("ArcPredictionMarket deployed:", address);
  console.log("Min stake:", minStakeUsdc, "USDC");
  console.log("Explorer:", `https://testnet.arcscan.app/address/${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
