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
  AuthorityOnly: 2,
  AdapterOnly: 3
};

describe("ArcPredictionMarket V4", function () {
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

  async function signAuraSuggestion(market, signer, marketId, outcome, receiptHash) {
    const networkDetails = await ethers.provider.getNetwork();
    const payload = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "uint8", "bytes32"],
        [await market.getAddress(), networkDetails.chainId, marketId, outcome, receiptHash]
      )
    );
    return signer.signMessage(ethers.getBytes(payload));
  }

  async function createDefaultMarket(
    market,
    signer,
    token,
    closeTime,
    resolutionTime,
    mode = ResolutionMode.CreatorWithDispute,
    adapter = ethers.ZeroAddress
  ) {
    return market.connect(signer).createMarket(
      "Will the referenced event occur by the stated deadline?",
      "Arc",
      await token.getAddress(),
      closeTime,
      resolutionTime,
      "ipfs://aurapredict/market-rules",
      "",
      "YES if the referenced event occurs by the stated deadline. NO otherwise.",
      mode,
      adapter
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
    assert.equal(row[15], ethers.parseUnits("2.5", 6));
    const terms = await market.getMarketTerms(0);
    assert.equal(terms[1], "ipfs://aurapredict/market-rules");
    assert.match(terms[3], /YES if/);
  });

  it("bounds public onchain market terms so a creator cannot publish oversized metadata", async function () {
    const { market, usdc, resolver } = await deployFixture();
    const now = await latestTimestamp();

    await assert.rejects(
      market.connect(resolver).createMarket(
        `Will ${"x".repeat(280)} happen?`,
        "Arc",
        await usdc.getAddress(),
        now + 3600,
        now + 3600,
        "https://example.com",
        "",
        "YES if verified; NO otherwise.",
        ResolutionMode.CreatorWithDispute,
        ethers.ZeroAddress
      ),
      /INVALID_QUESTION_LENGTH/
    );
    await assert.rejects(
      market.connect(resolver).createMarket(
        "Will this acceptable market resolve cleanly?",
        "Arc",
        await usdc.getAddress(),
        now + 3600,
        now + 3600,
        "https://example.com",
        "",
        "r".repeat(2049),
        ResolutionMode.CreatorWithDispute,
        ethers.ZeroAddress
      ),
      /InvalidMetadata/
    );
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
    await market.finalizeDispute(0, Outcome.Yes, metadataHash("reviewed"), ethers.ZeroHash);
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
    await market.finalizeDispute(0, Outcome.Yes, metadataHash("reviewed"), ethers.ZeroHash);

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
    await market.finalizeDispute(0, Outcome.Yes, metadataHash("reviewed"), ethers.ZeroHash);
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

  it("requires authority review when a creator proposal has no signed Aura attestation", async function () {
    const { market, usdc, resolver, alice } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await increaseTime(3601);

    await market.connect(resolver).resolve(0, Outcome.Yes, metadataHash("evidence"), ethers.ZeroHash);
    const row = await market.getMarket(0);
    assert.equal(row[21], true);
    await assert.rejects(market.finalize(0), /AuthorityReviewRequired/);
  });

  it("permits normal dispute finalization when a creator follows a signed Aura suggestion", async function () {
    const { market, usdc, resolver, alice, committee, disputeWindow } = await deployFixture();
    await market.setAiAttestationSigner(committee.address);
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await increaseTime(3601);
    const receiptHash = metadataHash("signed-ai-receipt");
    const signature = await signAuraSuggestion(market, committee, 0, Outcome.Yes, receiptHash);

    await market.connect(resolver).resolveWithAiAttestation(
      0,
      Outcome.Yes,
      metadataHash("evidence"),
      receiptHash,
      Outcome.Yes,
      signature
    );
    let row = await market.getMarket(0);
    assert.equal(row[21], false);
    await increaseTime(disputeWindow + 1);
    await market.finalize(0);
    row = await market.getMarket(0);
    assert.equal(Number(row[24]), Outcome.Yes);
  });

  it("forces authority review when the creator contradicts a signed Aura suggestion", async function () {
    const { market, usdc, resolver, alice, bob, committee } = await deployFixture();
    await market.setAiAttestationSigner(committee.address);
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await market.connect(bob).bet(0, Outcome.No, ethers.parseUnits("1", 6));
    await increaseTime(3601);
    const receiptHash = metadataHash("signed-ai-no");
    const signature = await signAuraSuggestion(market, committee, 0, Outcome.No, receiptHash);

    await market.connect(resolver).resolveWithAiAttestation(
      0,
      Outcome.Yes,
      metadataHash("creator-contradicts"),
      receiptHash,
      Outcome.No,
      signature
    );
    const row = await market.getMarket(0);
    assert.equal(row[21], true);
  });

  it("lets a registered oracle adapter resolve new adapter-only markets without redeploying the core", async function () {
    const { market, usdc, resolver, alice, committee } = await deployFixture();
    await market.setApprovedResolutionAdapter(committee.address, true);
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600, ResolutionMode.AdapterOnly, committee.address);
    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("1", 6));
    await increaseTime(3601);

    await assert.rejects(
      market.connect(resolver).resolve(0, Outcome.Yes, metadataHash("creator"), ethers.ZeroHash),
      /NotResolver/
    );
    await market.connect(committee).resolve(0, Outcome.Yes, metadataHash("oracle"), ethers.ZeroHash);
  });

  it("refunds a funded market that receives no proposal by its timeout", async function () {
    const { market, usdc, resolver, alice, creatorBond } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    const stake = ethers.parseUnits("2", 6);
    await market.connect(alice).bet(0, Outcome.Yes, stake);
    await increaseTime(3600 + 72 * 60 * 60 + 1);

    await market.connect(alice).cancelUnproposedMarket(0);
    const row = await market.getMarket(0);
    assert.equal(Number(row[24]), Outcome.Canceled);
    assert.equal(await market.pendingWithdrawals(await usdc.getAddress(), resolver.address), creatorBond);
    assert.equal(await market.connect(alice).potentialPayout(0, alice.address), stake);
  });

  it("snapshots minimum stake per market even when asset settings later change", async function () {
    const { market, usdc, resolver, alice, creatorBond, disputeBond } = await deployFixture();
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600);
    await market.configureSettlementAsset(
      await usdc.getAddress(),
      true,
      "USDC",
      6,
      ethers.parseUnits("5", 6),
      creatorBond,
      disputeBond,
      0
    );

    await market.connect(alice).bet(0, Outcome.Yes, ethers.parseUnits("0.1", 6));
    const policy = await market.getMarketPolicy(0);
    assert.equal(policy[1], ethers.parseUnits("0.1", 6));
  });

  it("assigns rounding remainder to the final winning claimant instead of trapping funds", async function () {
    const { market, usdc, resolver, alice, bob, committee } = await deployFixture();
    await market.setProtocolFeeBps(0);
    const now = await latestTimestamp();
    await createDefaultMarket(market, resolver, usdc, now + 3600, now + 3600, ResolutionMode.AuthorityOnly);
    const aliceStake = 100001n;
    const bobStake = 100002n;
    const losingStake = 100000n;
    await market.connect(alice).bet(0, Outcome.Yes, aliceStake);
    await market.connect(bob).bet(0, Outcome.Yes, bobStake);
    await market.connect(committee).bet(0, Outcome.No, losingStake);
    await increaseTime(3601);
    await market.resolve(0, Outcome.Yes, metadataHash("authority"), ethers.ZeroHash);
    await increaseTime(12 * 60 * 60 + 1);
    await market.finalize(0);
    await market.connect(alice).claim(0);
    await market.connect(bob).claim(0);

    const policy = await market.getMarketPolicy(0);
    assert.equal(policy[4], aliceStake + bobStake + losingStake);
  });
});
