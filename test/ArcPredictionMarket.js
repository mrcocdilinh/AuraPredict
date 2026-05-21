const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

const Outcome = {
  Unresolved: 0,
  Yes: 1,
  No: 2,
  Canceled: 3
};

describe("ArcPredictionMarket", function () {
  async function deployFixture() {
    const [owner, resolver, alice, bob] = await ethers.getSigners();
    const minStake = ethers.parseUnits("0.1", 18);
    const factory = await ethers.getContractFactory("ArcPredictionMarket");
    const market = await factory.deploy(minStake);
    await market.waitForDeployment();
    const creatorBond = await market.creatorBond();
    const disputeBond = await market.disputeBond();
    const disputeWindow = Number(await market.disputeWindow());
    return { market, owner, resolver, alice, bob, creatorBond, disputeBond, disputeWindow };
  }

  async function latestTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
  }

  async function increaseTime(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  it("creates a market, accepts stakes, resolves, and pays winners pro rata", async function () {
    const { market, alice, bob, creatorBond, disputeWindow } = await deployFixture();
    const closeTime = (await latestTimestamp()) + 3600;

    await market.createMarket(
      "Will Arc testnet finality stay under one second this week?",
      "Arc",
      closeTime,
      { value: creatorBond }
    );

    const one = ethers.parseUnits("1", 18);
    const two = ethers.parseUnits("2", 18);
    await market.connect(alice).bet(0, Outcome.Yes, { value: one });
    await market.connect(bob).bet(0, Outcome.No, { value: two });

    await increaseTime(3601);
    await market.resolve(0, Outcome.Yes);
    await increaseTime(disputeWindow + 1);
    await market.finalize(0);

    const before = await ethers.provider.getBalance(alice.address);
    const tx = await market.connect(alice).claim(0);
    const receipt = await tx.wait();
    const gasPaid = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);

    assert.equal(after + gasPaid - before, ethers.parseUnits("2.96", 18));
    assert.equal(await market.accumulatedProtocolFees(), ethers.parseUnits("0.04", 18));
  });

  it("lets the owner withdraw accumulated protocol fees", async function () {
    const { market, owner, alice, bob, creatorBond, disputeWindow } = await deployFixture();
    const closeTime = (await latestTimestamp()) + 3600;

    await market.createMarket("Will protocol fees accrue on winning profit?", "Arc", closeTime, { value: creatorBond });

    await market.connect(alice).bet(0, Outcome.Yes, { value: ethers.parseUnits("1", 18) });
    await market.connect(bob).bet(0, Outcome.No, { value: ethers.parseUnits("2", 18) });

    await increaseTime(3601);
    await market.resolve(0, Outcome.Yes);
    await increaseTime(disputeWindow + 1);
    await market.finalize(0);
    await market.connect(alice).claim(0);

    const before = await ethers.provider.getBalance(owner.address);
    const tx = await market.withdrawProtocolFees(owner.address, 0);
    const receipt = await tx.wait();
    const gasPaid = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(owner.address);

    assert.equal(after + gasPaid - before, ethers.parseUnits("0.04", 18));
  });

  it("refunds both sides when a market is canceled", async function () {
    const { market, resolver, alice, creatorBond, disputeWindow } = await deployFixture();
    const closeTime = (await latestTimestamp()) + 3600;
    const stake = ethers.parseUnits("1.25", 18);

    await market.connect(resolver).createMarket("Will this canceled market refund users?", "Test", closeTime, {
      value: creatorBond
    });
    await market.connect(alice).bet(0, Outcome.Yes, { value: stake });
    await increaseTime(3601);
    await market.connect(resolver).cancel(0);
    await increaseTime(disputeWindow + 1);
    await market.finalize(0);

    assert.equal(await market.potentialPayout(0, alice.address), stake);
  });

  it("lets a player dispute a proposed result and rewards the correct challenger", async function () {
    const { market, resolver, alice, bob, creatorBond, disputeBond } = await deployFixture();
    const closeTime = (await latestTimestamp()) + 3600;

    await market.connect(resolver).createMarket("Will this disputed market be corrected?", "Test", closeTime, {
      value: creatorBond
    });
    await market.connect(alice).bet(0, Outcome.Yes, { value: ethers.parseUnits("1", 18) });
    await market.connect(bob).bet(0, Outcome.No, { value: ethers.parseUnits("1", 18) });

    await increaseTime(3601);
    await market.connect(resolver).resolve(0, Outcome.No);
    await market.connect(alice).dispute(0, { value: disputeBond });

    const before = await ethers.provider.getBalance(alice.address);
    await market.finalizeDispute(0, Outcome.Yes);
    const after = await ethers.provider.getBalance(alice.address);

    assert.equal(after - before, creatorBond + disputeBond);
  });
});
