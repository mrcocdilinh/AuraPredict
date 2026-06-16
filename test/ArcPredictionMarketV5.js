const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

const ResolutionMode = {
  CreatorWithDispute: 0,
  AuthorityReview: 1,
  AuthorityOnly: 2,
  AdapterOnly: 3
};

const MarketState = {
  Draft: 0,
  Live: 1,
  Proposed: 2,
  Disputed: 3,
  Finalized: 4,
  Canceled: 5,
  Rejected: 6
};

const NO_OUTCOME = 65535;

describe("ArcPredictionMarket V5", function () {
  async function latestTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
  }

  async function increaseTime(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  async function deployFixture() {
    const [owner, alice, bob, reporter, forwarder, adapter] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("MockERC20");
    const usdc = await tokenFactory.deploy("USD Coin", "USDC", 6);
    const xusd = await tokenFactory.deploy("Future USD", "XUSD", 18);
    await usdc.waitForDeployment();
    await xusd.waitForDeployment();

    const minStake = ethers.parseUnits("1", 6);
    const factory = await ethers.getContractFactory("ArcPredictionMarketV5");
    const market = await factory.deploy(await usdc.getAddress(), "USDC", 6, minStake);
    await market.waitForDeployment();

    await market.configureSettlementAsset(
      await usdc.getAddress(),
      true,
      "USDC",
      6,
      minStake,
      ethers.parseUnits("5", 6),
      ethers.parseUnits("2", 6),
      ethers.parseUnits("1", 6),
      ethers.parseUnits("1", 6),
      0,
      0,
      0
    );
    await market.configureSettlementAsset(
      await xusd.getAddress(),
      true,
      "XUSD",
      18,
      ethers.parseUnits("1", 18),
      ethers.parseUnits("5", 18),
      ethers.parseUnits("2", 18),
      ethers.parseUnits("1", 18),
      ethers.parseUnits("1", 18),
      0,
      0,
      0
    );

    const usdcFunding = ethers.parseUnits("1000", 6);
    const xusdFunding = ethers.parseUnits("1000", 18);
    for (const account of [owner, alice, bob, reporter, forwarder, adapter]) {
      await usdc.mint(account.address, usdcFunding);
      await xusd.mint(account.address, xusdFunding);
      await usdc.connect(account).approve(await market.getAddress(), usdcFunding);
      await xusd.connect(account).approve(await market.getAddress(), xusdFunding);
    }

    return { market, usdc, xusd, owner, alice, bob, reporter, forwarder, adapter };
  }

  async function inputFor(token, overrides = {}) {
    const now = await latestTimestamp();
    return {
      question: overrides.question || "Which outcome will resolve for this V5 market?",
      category: overrides.category || "V5",
      sourceUrl: overrides.sourceUrl || "https://example.com/source",
      resolutionRule: overrides.resolutionRule || "Resolve to the objectively verified winning outcome.",
      metadataURI: overrides.metadataURI || "ipfs://aurapredict/v5",
      token: await token.getAddress(),
      adapter: overrides.adapter || ethers.ZeroAddress,
      closeTime: overrides.closeTime || now + 3600,
      resolutionTime: overrides.resolutionTime || now + 4200,
      mode: overrides.mode ?? ResolutionMode.CreatorWithDispute,
      outcomeCount: overrides.outcomeCount || 2,
      outcomeLabelsHash: overrides.outcomeLabelsHash || ethers.keccak256(ethers.toUtf8Bytes("YES|NO")),
      sourceHash: overrides.sourceHash || ethers.ZeroHash,
      ruleHash: overrides.ruleHash || ethers.ZeroHash
    };
  }

  it("requires owner approval before user-created markets accept positions", async function () {
    const { market, usdc, owner, alice } = await deployFixture();
    await market.connect(alice).submitMarketDraft(await inputFor(usdc));

    const draft = await market.getMarket(0);
    assert.equal(Number(draft[2]), MarketState.Draft);
    await assert.rejects(
      market.connect(alice).placePosition(0, 0, ethers.parseUnits("1", 6)),
      /InvalidState/
    );

    await market.connect(owner).approveMarket(0);
    const live = await market.getMarket(0);
    assert.equal(Number(live[2]), MarketState.Live);
    await market.connect(alice).placePosition(0, 0, ethers.parseUnits("1", 6));
  });

  it("settles multi-outcome markets and supports 18-decimal future stable assets", async function () {
    const { market, xusd, owner, alice, bob } = await deployFixture();
    await market.connect(owner).createMultiOutcomeMarket(
      await inputFor(xusd, {
        outcomeCount: 3,
        outcomeLabelsHash: ethers.keccak256(ethers.toUtf8Bytes("France|Argentina|Brazil"))
      })
    );
    await market.connect(alice).placePosition(0, 0, ethers.parseUnits("10", 18));
    await market.connect(bob).placePosition(0, 2, ethers.parseUnits("20", 18));

    await increaseTime(4201);
    await market.connect(owner).proposeOutcome(0, 2, ethers.id("evidence"), ethers.id("receipt"), NO_OUTCOME, 2, 9500, ethers.id("sports"));
    await increaseTime(Number(await market.disputeWindow()) + 1);
    await market.connect(owner).finalize(0);
    await market.connect(bob).claim(0);

    const claimed = await market.getUserPosition(0, bob.address);
    assert.equal(claimed[1], true);
    assert.equal(await xusd.balanceOf(bob.address), ethers.parseUnits("1010", 18));
  });

  it("claimMany skips open, already-claimed, and losing positions instead of blocking the whole batch", async function () {
    const { market, usdc, owner, alice, bob } = await deployFixture();
    for (let i = 0; i < 3; i++) {
      await market.connect(owner).createMultiOutcomeMarket(await inputFor(usdc));
    }
    await market.connect(alice).placePosition(0, 0, ethers.parseUnits("2", 6));
    await market.connect(bob).placePosition(0, 1, ethers.parseUnits("2", 6));
    await market.connect(alice).placePosition(1, 0, ethers.parseUnits("1", 6));
    await market.connect(bob).placePosition(1, 1, ethers.parseUnits("3", 6));
    await market.connect(alice).placePosition(2, 0, ethers.parseUnits("1", 6));

    await increaseTime(4201);
    await market.connect(owner).proposeOutcome(0, 0, ethers.id("m0"), ethers.ZeroHash, NO_OUTCOME, 0, 9000, ethers.id("manual"));
    await market.connect(owner).proposeOutcome(1, 0, ethers.id("m1"), ethers.ZeroHash, NO_OUTCOME, 0, 9000, ethers.id("manual"));
    await increaseTime(Number(await market.disputeWindow()) + 1);
    await market.connect(owner).finalize(0);
    await market.connect(owner).finalize(1);
    await market.connect(alice).claim(0);

    await market.connect(alice).claimMany([0, 1, 2]);
    const pos1 = await market.getUserPosition(1, alice.address);
    const pos2 = await market.getUserPosition(2, alice.address);
    assert.equal(pos1[1], true);
    assert.equal(pos2[1], false);
  });

  it("lets reporters challenge bad markets and receive per-market bond rewards when accepted", async function () {
    const { market, usdc, owner, alice, reporter } = await deployFixture();
    await market.connect(alice).submitMarketDraft(await inputFor(usdc));
    await market.connect(owner).approveMarket(0);
    await market.connect(reporter).reportMarket(0, ethers.id("bad-market"));
    await market.connect(owner).resolveReport(0, true, ethers.id("confirmed"));

    const row = await market.getMarket(0);
    assert.equal(Number(row[2]), MarketState.Canceled);
    assert.equal(await market.pendingWithdrawals(await usdc.getAddress(), reporter.address), ethers.parseUnits("6", 6));
  });

  it("accepts ERC-2771 style forwarded calls for seedless smart-wallet flows", async function () {
    const { market, usdc, owner, alice, forwarder } = await deployFixture();
    await market.connect(owner).setTrustedForwarder(forwarder.address);
    await market.connect(owner).createMultiOutcomeMarket(await inputFor(usdc));

    const amount = ethers.parseUnits("1", 6);
    const data = `${market.interface.encodeFunctionData("placePosition", [0, 0, amount])}${alice.address.slice(2)}`;
    await forwarder.sendTransaction({ to: await market.getAddress(), data });

    const position = await market.getUserPosition(0, alice.address);
    assert.equal(position[0][0], amount);
    const forwarderPosition = await market.getUserPosition(0, forwarder.address);
    assert.equal(forwarderPosition[0][0], 0n);
  });
});
