const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

const Outcome = {
  Unresolved: 0,
  Yes: 1,
  No: 2,
  Canceled: 3
};

const ResolutionMode = {
  CreatorWithDispute: 0,
  AuthorityReview: 1,
  AuthorityOnly: 2
};

describe("ArcPredictionMarket V3", function () {
  async function deployFixture() {
    const [owner, resolver, alice, bob, committee] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("MockERC20");
    const usdc = await tokenFactory.deploy("USD Coin", "USDC", 6);
    const eurc = await tokenFactory.deploy("Euro Coin", "EURC", 6);
    await usdc.waitForDeployment();
    await eurc.waitForDeployment();
    const minStake = ethers.parseUnits("0.1", 6);
    const factory = await ethers.getContractFactory("ArcPredictionMarket");
    const market = await factory.deploy(await usdc.getAddress(), await eurc.getAddress(), minStake);
    await market.waitForDeployment();
    const funding = ethers.parseUnits("1000", 6);
    for (const account of [owner, resolver, alice, bob, committee]) {
      await usdc.mint(account.address, funding);
      await eurc.mint(account.address, funding);
      await usdc.connect(account).approve(await market.getAddress(), funding);
      await eurc.connect(account).approve(await market.getAddress(), funding);
    }
    const creatorBond = await market.creatorBond();
    const disputeBond = await market.disputeBond();
    const disputeWindow = Number(await market.disputeWindow());
    return { market, usdc, eurc, owner, resolver, alice, bob, committee, creatorBond, disputeBond, disputeWindow };
  }

  async function latestTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
  }

  async function increaseTime(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  function metadataHash(label = "rules") {
    return ethers.keccak256(ethers.toUtf8Bytes(label));
  }

  async function createDefaultMarket(market, signer, token, closeTime, resolutionTime, mode = ResolutionMode.CreatorWithDispute) {
    return market.connect(signer).createMarket(
      "Will the referenced event occur by the stated deadline?",
      "Arc",
      await token.getAddress(),
      closeTime,
      resolutionTime,
      metadataHash(),
      "ipfs://aurapredict/market-rules",
      mode
    );
  }

  it("separates betting close time from resolution time", async function () {
    const { market, usdc, resolver, alice } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 4200);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));

    await increaseTime(3601);
    await assert.rejects(
      market.connect(resolver).resolve(0, Outcome.Yes, metadataHash("evidence"), ethers.ZeroHash),
      /ResolutionNotReady/
    );
    await increaseTime(600);
    await market.connect(resolver).resolve(0, Outcome.Yes, metadataHash("evidence"), ethers.ZeroHash);
  });

  it("creates an immutable EURC market with token-denominated pools", async function () {
    const { market, eurc, resolver, alice } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, eurc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("2.5", 6));

    const row = await market.getMarket(0);
    assert.equal(row[2], await eurc.getAddress());
    assert.equal(row[9], metadataHash());
    assert.equal(row[15], ethers.parseUnits("2.5", 6));
  });

  it("rejects settlement assets with incompatible decimal units", async function () {
    const { market, owner } = await deployFixture();
    const tokenFactory = await ethers.getContractFactory("MockERC20");
    const eighteenDecimalToken = await tokenFactory.deploy("Other USD", "OUSD", 18);
    await eighteenDecimalToken.waitForDeployment();

    await assert.rejects(
      market.connect(owner).configureSettlementAsset(
        await eighteenDecimalToken.getAddress(),
        true,
        "OUSD",
        18,
        ethers.parseUnits("0.1", 18),
        ethers.parseUnits("1", 18),
        ethers.parseUnits("1", 18),
        0
      ),
      /InvalidDecimals/
    );
  });

  it("snapshots protocol fee per market when default fee changes", async function () {
    const { market, usdc, resolver, alice, bob, disputeWindow } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await market.connect(bob).bet(0, Outcome.No, ethers.parseUnits("2", 6));
    await market.setProtocolFeeBps(500);

    await increaseTime(3601);
    await market.connect(resolver).resolve(0, Outcome.Yes, metadataHash("result"), ethers.ZeroHash);
    await increaseTime(disputeWindow + 1);
    await market.finalize(0);
    await market.connect(alice).claim(0);

    assert.equal(await market.accumulatedProtocolFees(), ethers.parseUnits("0.04", 6));
    const row = await market.getMarket(0);
    assert.equal(Number(row[11]), 200);
  });

  it("does not permit protocol fee withdrawal to the zero address", async function () {
    const { market } = await deployFixture();

    await assert.rejects(
      market["withdrawProtocolFees(address,uint256)"](ethers.ZeroAddress, 0),
      /ZeroRecipient/
    );
  });

  it("snapshots the stale-review grace period per market", async function () {
    const { market, usdc, resolver } = await deployFixture();
    const originalGracePeriod = await market.disputeGracePeriod();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.setDisputeGracePeriod(24 * 60 * 60);

    const row = await market.getMarket(0);
    assert.equal(row[25], originalGracePeriod);
  });

  it("credits creator bonds for withdrawal instead of transferring during finalization", async function () {
    const { market, usdc, resolver, alice, creatorBond, disputeWindow } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await increaseTime(3601);
    await market.connect(resolver).resolve(0, Outcome.Yes, metadataHash("result"), ethers.ZeroHash);
    await increaseTime(disputeWindow + 1);
    await market.finalize(0);

    assert.equal(await market.pendingWithdrawals(await usdc.getAddress(), resolver.address), creatorBond);
    const before = await usdc.balanceOf(resolver.address);
    await market.connect(resolver).withdrawBalance(await usdc.getAddress());
    const after = await usdc.balanceOf(resolver.address);
    assert.equal(after - before, creatorBond);
  });

  it("lets a participant dispute and lets authority correct a result", async function () {
    const { market, usdc, resolver, alice, bob, creatorBond, disputeBond } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await market.connect(bob).bet(0, Outcome.No, ethers.parseUnits("1", 6));
    await increaseTime(3601);
    await market.connect(resolver).resolve(0, Outcome.No, metadataHash("bad"), ethers.ZeroHash);
    await market.connect(alice).dispute(0);
    await market.finalizeDispute(0, Outcome.Yes, metadataHash("correct"), metadataHash("ai"));

    assert.equal(await market.pendingWithdrawals(await usdc.getAddress(), alice.address), creatorBond + disputeBond);
    const row = await market.getMarket(0);
    assert.equal(Number(row[24]), Outcome.Yes);
  });

  it("allows authority to stop a mismatched proposal without a participant dispute", async function () {
    const { market, usdc, resolver, alice } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await increaseTime(3601);
    await market.connect(resolver).resolve(0, Outcome.Yes, metadataHash("creator"), metadataHash("receipt"));
    await market.requestAuthorityReview(0, metadataHash("mismatch"));
    await assert.rejects(market.finalize(0), /AuthorityReviewRequired/);
    await market.finalizeDispute(0, Outcome.Yes, metadataHash("reviewed"), metadataHash("receipt"));
    const row = await market.getMarket(0);
    assert.equal(Number(row[24]), Outcome.Yes);
  });

  it("supports authority-only markets and a committee authority captured per market", async function () {
    const { market, usdc, resolver, alice, committee } = await deployFixture();
    await market.setResolutionAuthority(committee.address);
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600, ResolutionMode.AuthorityOnly);
    await market.connect(alice).bet(0, Outcome.No, ethers.parseUnits("1", 6));
    await increaseTime(3601);
    await assert.rejects(
      market.connect(resolver).resolve(0, Outcome.No, metadataHash("creator"), ethers.ZeroHash),
      /NotResolver/
    );
    await market.connect(committee).resolve(0, Outcome.No, metadataHash("committee"), ethers.ZeroHash);
  });

  it("cancels an empty market immediately after resolution time without AI or dispute", async function () {
    const { market, usdc, resolver, creatorBond } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 4200);
    await increaseTime(4201);
    await market.cancelEmptyMarket(0);
    const row = await market.getMarket(0);
    assert.equal(Number(row[24]), Outcome.Canceled);
    assert.equal(await market.pendingWithdrawals(await usdc.getAddress(), resolver.address), creatorBond);
  });

  it("pauses new exposure without blocking settlement and claims", async function () {
    const { market, usdc, resolver, alice, disputeWindow } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await market.setPlatformPaused(true);

    await assert.rejects(
      market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6)),
      /PlatformPaused/
    );
    await assert.rejects(
      createDefaultMarket(market, resolver, usdc, now + 7200, now + 7200),
      /PlatformPaused/
    );

    await increaseTime(3601);
    await market.connect(resolver).resolve(0, Outcome.Yes, metadataHash("settled"), ethers.ZeroHash);
    await increaseTime(disputeWindow + 1);
    await market.finalize(0);
    await market.connect(alice).claim(0);
  });

  it("restricts market creation and blocks accounts from opening new positions", async function () {
    const { market, usdc, resolver, alice } = await deployFixture();
    const now = await latestTimestamp();
    await market.setRestrictedMarketCreation(true);

    await assert.rejects(
      createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600),
      /CreatorNotApproved/
    );
    await market.setApprovedMarketCreator(resolver.address, true);
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.setBlockedAccount(alice.address, true);
    await assert.rejects(
      market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6)),
      /AccountBlocked/
    );
  });
});
