// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20V5 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract ArcPredictionMarketV5 {
    enum MarketState {
        Draft,
        Live,
        Proposed,
        Disputed,
        Finalized,
        Canceled,
        Rejected
    }

    enum ResolutionMode {
        CreatorWithDispute,
        AuthorityReview,
        AuthorityOnly,
        AdapterOnly
    }

    enum Role {
        Creator,
        Resolver,
        Disputer,
        Reporter,
        Oracle
    }

    struct AssetConfig {
        bool enabled;
        string symbol;
        uint8 decimals;
        uint256 minStake;
        uint256 creatorBond;
        uint256 resolverBond;
        uint256 disputeBond;
        uint256 reportBond;
        uint256 marketCreationFee;
        uint256 protocolFeeBps;
        uint256 creatorFeeBps;
    }

    struct MarketInput {
        string question;
        string category;
        string sourceUrl;
        string resolutionRule;
        string metadataURI;
        address token;
        address adapter;
        uint256 closeTime;
        uint256 resolutionTime;
        ResolutionMode mode;
        uint16 outcomeCount;
        bytes32 outcomeLabelsHash;
        bytes32 sourceHash;
        bytes32 ruleHash;
    }

    struct Market {
        string question;
        string category;
        string sourceUrl;
        string resolutionRule;
        string metadataURI;
        address token;
        address creator;
        address resolver;
        address authority;
        address adapter;
        uint256 closeTime;
        uint256 resolutionTime;
        uint256 proposedAt;
        uint256 totalPool;
        uint256 claimedWinningStake;
        uint256 grossPayoutDistributed;
        uint256 minStake;
        uint256 creatorBond;
        uint256 resolverBond;
        uint256 disputeBond;
        uint256 reportBond;
        uint256 disputeWindow;
        uint256 proposalGracePeriod;
        uint256 protocolFeeBps;
        uint256 creatorFeeBps;
        uint16 outcomeCount;
        uint16 proposedOutcome;
        uint16 finalOutcome;
        uint16 aiOutcome;
        uint16 oracleOutcome;
        uint16 oracleConfidenceBps;
        address proposer;
        address disputer;
        address reporter;
        bytes32 outcomeLabelsHash;
        bytes32 evidenceHash;
        bytes32 receiptHash;
        bytes32 ruleHash;
        bytes32 sourceHash;
        bytes32 disputeReasonHash;
        bytes32 reportReasonHash;
        bytes32 oracleAdapterId;
        ResolutionMode mode;
        MarketState state;
        bool disputed;
        bool authorityReviewRequired;
        bool reportOpen;
        bool exists;
    }

    struct Position {
        bool entered;
        bool claimed;
        uint256 totalStaked;
        mapping(uint16 => uint256) stakeByOutcome;
    }

    struct RoleStats {
        uint256 submitted;
        uint256 approved;
        uint256 rejected;
        uint256 proposed;
        uint256 correct;
        uint256 incorrect;
        uint256 disputesWon;
        uint256 disputesLost;
        int256 score;
    }

    error NotOwner();
    error NotAuthorized();
    error NotFound();
    error InvalidState();
    error InvalidInput();
    error InvalidOutcome();
    error UnsupportedAsset();
    error StakeTooSmall();
    error TransferFailed();
    error Paused();
    error Blocked();
    error MarketClosed();
    error MarketOpen();
    error TooEarly();
    error TooLate();
    error AlreadyClaimed();
    error NothingToClaim();
    error AlreadyDisputed();
    error NoPosition();
    error Reentrant();

    uint16 public constant NO_OUTCOME = type(uint16).max;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_OUTCOMES = 32;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 1_000;
    uint256 public constant MAX_CREATOR_FEE_BPS = 500;
    uint256 private constant UNLOCKED = 1;
    uint256 private constant LOCKED = 2;

    string public constant CONTRACT_VERSION = "AURAPREDICT_V5";

    address public owner;
    address public resolutionAuthority;
    address public trustedForwarder;
    address public aiAttestationSigner;
    address public immutable defaultSettlementToken;
    bool public platformPaused;
    uint256 public marketCount;
    uint256 public disputeWindow = 12 hours;
    uint256 public proposalGracePeriod = 72 hours;

    mapping(address => AssetConfig) public assetConfigs;
    mapping(address => bool) public blockedAccounts;
    mapping(address => bool) public approvedAdapters;
    mapping(address => uint256) public accumulatedProtocolFeesByToken;
    mapping(address => mapping(address => uint256)) public pendingWithdrawals;
    mapping(address => mapping(uint8 => RoleStats)) private roleStats;
    mapping(uint256 => Market) private markets;
    mapping(uint256 => mapping(uint16 => uint256)) private outcomePools;
    mapping(uint256 => mapping(address => Position)) private positions;
    uint256 private reentrancyStatus = UNLOCKED;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event SettlementAssetConfigured(address indexed token, bool enabled, string symbol, uint8 decimals);
    event TrustedForwarderUpdated(address indexed forwarder);
    event MarketDraftSubmitted(uint256 indexed marketId, address indexed creator, address indexed token, uint16 outcomeCount);
    event MarketApproved(uint256 indexed marketId, address indexed approver);
    event MarketRejected(uint256 indexed marketId, address indexed approver, bool bondSlashed, bytes32 reasonHash);
    event MarketCreated(uint256 indexed marketId, address indexed creator, address indexed token, uint16 outcomeCount);
    event PositionTaken(uint256 indexed marketId, address indexed user, uint16 indexed outcomeId, uint256 amount);
    event MarketResultProposed(uint256 indexed marketId, uint16 indexed outcomeId, address indexed proposer, bytes32 receiptHash);
    event AuthorityReviewRequested(uint256 indexed marketId, address indexed requester, bytes32 reasonHash);
    event MarketDisputed(uint256 indexed marketId, address indexed disputer, bytes32 reasonHash);
    event MarketReported(uint256 indexed marketId, address indexed reporter, bytes32 reasonHash);
    event ReportResolved(uint256 indexed marketId, bool accepted, bytes32 reasonHash);
    event MarketCanceled(uint256 indexed marketId, address indexed authority, bytes32 reasonHash, bool bondSlashed);
    event MarketFinalized(uint256 indexed marketId, uint16 indexed outcomeId, address indexed finalizer, bytes32 evidenceHash);
    event Claimed(uint256 indexed marketId, address indexed user, address indexed token, uint256 payout);
    event ClaimedBatch(address indexed user, uint256 count, uint256 totalPayout);
    event WithdrawalCredited(address indexed token, address indexed account, uint256 amount);
    event WithdrawalCompleted(address indexed token, address indexed account, uint256 amount);
    event ReputationUpdated(address indexed account, Role indexed role, uint256 indexed marketId, int256 delta, bytes32 reasonCode);

    modifier onlyOwner() {
        if (_msgSender() != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (reentrancyStatus == LOCKED) revert Reentrant();
        reentrancyStatus = LOCKED;
        _;
        reentrancyStatus = UNLOCKED;
    }

    constructor(address settlementToken, string memory symbol, uint8 decimals, uint256 assetMinStake) {
        if (settlementToken == address(0) || assetMinStake == 0) revert InvalidInput();
        owner = msg.sender;
        resolutionAuthority = msg.sender;
        defaultSettlementToken = settlementToken;
        _configureAsset(settlementToken, true, symbol, decimals, assetMinStake, 0, 0, assetMinStake, assetMinStake, 0, 0, 0);
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function _msgSender() internal view returns (address sender) {
        if (msg.sender == trustedForwarder && msg.data.length >= 20) {
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            sender = msg.sender;
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidInput();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setResolutionAuthority(address authority) external onlyOwner {
        if (authority == address(0)) revert InvalidInput();
        resolutionAuthority = authority;
    }

    function setTrustedForwarder(address forwarder) external onlyOwner {
        trustedForwarder = forwarder;
        emit TrustedForwarderUpdated(forwarder);
    }

    function isTrustedForwarder(address forwarder) external view returns (bool) {
        return forwarder == trustedForwarder;
    }

    function setAiAttestationSigner(address signer) external onlyOwner {
        aiAttestationSigner = signer;
    }

    function setPlatformPaused(bool paused) external onlyOwner {
        platformPaused = paused;
    }

    function setBlockedAccount(address account, bool blocked) external onlyOwner {
        blockedAccounts[account] = blocked;
    }

    function restrictedMarketCreation() external pure returns (bool) {
        return true;
    }

    function approvedMarketCreators(address account) external view returns (bool) {
        return account == owner;
    }

    function setRestrictedMarketCreation(bool) external onlyOwner {}

    function setApprovedMarketCreator(address, bool) external onlyOwner {}

    function setApprovedResolutionAdapter(address adapter, bool approved) external onlyOwner {
        if (adapter == address(0)) revert InvalidInput();
        approvedAdapters[adapter] = approved;
    }

    function approvedResolutionAdapters(address adapter) external view returns (bool) {
        return approvedAdapters[adapter];
    }

    function setProposalGracePeriod(uint256 newGracePeriod) external onlyOwner {
        if (newGracePeriod < disputeWindow) revert InvalidInput();
        proposalGracePeriod = newGracePeriod;
    }

    function setMarketCreationFee(uint256 newFee) external onlyOwner {
        assetConfigs[defaultSettlementToken].marketCreationFee = newFee;
    }

    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PROTOCOL_FEE_BPS) revert InvalidInput();
        assetConfigs[defaultSettlementToken].protocolFeeBps = newFeeBps;
    }

    function minStake() external view returns (uint256) {
        return assetConfigs[defaultSettlementToken].minStake;
    }

    function creatorBond() external view returns (uint256) {
        return assetConfigs[defaultSettlementToken].creatorBond;
    }

    function disputeBond() external view returns (uint256) {
        return assetConfigs[defaultSettlementToken].disputeBond;
    }

    function disputeGracePeriod() external view returns (uint256) {
        return proposalGracePeriod;
    }

    function marketCreationFee() external view returns (uint256) {
        return assetConfigs[defaultSettlementToken].marketCreationFee;
    }

    function protocolFeeBps() external view returns (uint256) {
        return assetConfigs[defaultSettlementToken].protocolFeeBps;
    }

    function accumulatedProtocolFees() external view returns (uint256) {
        return accumulatedProtocolFeesByToken[defaultSettlementToken];
    }

    function configureSettlementAsset(
        address token,
        bool enabled,
        string calldata symbol,
        uint8 decimals,
        uint256 assetMinStake,
        uint256 creatorBondAmount,
        uint256 resolverBondAmount,
        uint256 disputeBondAmount,
        uint256 reportBondAmount,
        uint256 creationFee,
        uint256 protocolFeeRateBps,
        uint256 creatorFeeBps
    ) external onlyOwner {
        _configureAsset(
            token,
            enabled,
            symbol,
            decimals,
            assetMinStake,
            creatorBondAmount,
            resolverBondAmount,
            disputeBondAmount,
            reportBondAmount,
            creationFee,
            protocolFeeRateBps,
            creatorFeeBps
        );
    }

    function submitMarketDraft(MarketInput calldata input) external nonReentrant returns (uint256 marketId) {
        address sender = _msgSender();
        _requireOpen(sender);
        AssetConfig memory asset = _asset(input.token);
        uint256 due = asset.creatorBond + asset.marketCreationFee;
        _transferFrom(input.token, sender, address(this), due);
        if (asset.marketCreationFee > 0) accumulatedProtocolFeesByToken[input.token] += asset.marketCreationFee;
        marketId = _storeMarket(sender, input, asset, MarketState.Draft);
        roleStats[sender][uint8(Role.Creator)].submitted += 1;
        _rep(sender, Role.Creator, marketId, 1, "DRAFT_SUBMITTED");
        emit MarketDraftSubmitted(marketId, sender, input.token, input.outcomeCount);
    }

    function approveMarket(uint256 marketId) external onlyOwner {
        Market storage market = _market(marketId);
        if (market.state != MarketState.Draft) revert InvalidState();
        market.state = MarketState.Live;
        roleStats[market.creator][uint8(Role.Creator)].approved += 1;
        _rep(market.creator, Role.Creator, marketId, 5, "MARKET_APPROVED");
        emit MarketApproved(marketId, _msgSender());
        emit MarketCreated(marketId, market.creator, market.token, market.outcomeCount);
    }

    function rejectMarket(uint256 marketId, bool slashCreatorBond, bytes32 reasonHash) external onlyOwner nonReentrant {
        Market storage market = _market(marketId);
        if (market.state != MarketState.Draft) revert InvalidState();
        market.state = MarketState.Rejected;
        roleStats[market.creator][uint8(Role.Creator)].rejected += 1;
        if (slashCreatorBond && market.creatorBond > 0) {
            accumulatedProtocolFeesByToken[market.token] += market.creatorBond;
            _rep(market.creator, Role.Creator, marketId, -10, "DRAFT_REJECTED_SLASHED");
        } else {
            _credit(market.token, market.creator, market.creatorBond);
            _rep(market.creator, Role.Creator, marketId, -2, "DRAFT_REJECTED");
        }
        market.creatorBond = 0;
        emit MarketRejected(marketId, _msgSender(), slashCreatorBond, reasonHash);
    }

    function createMultiOutcomeMarket(MarketInput calldata input)
        external
        nonReentrant
        onlyOwner
        returns (uint256 marketId)
    {
        return _createApprovedMarket(input);
    }

    function placePosition(uint256 marketId, uint16 outcomeId, uint256 amount) public nonReentrant {
        address sender = _msgSender();
        _requireOpen(sender);
        Market storage market = _market(marketId);
        if (market.state != MarketState.Live) revert InvalidState();
        if (block.timestamp >= market.closeTime) revert MarketClosed();
        if (outcomeId >= market.outcomeCount) revert InvalidOutcome();
        if (amount < market.minStake) revert StakeTooSmall();
        Position storage pos = positions[marketId][sender];
        if (!pos.entered) {
            pos.entered = true;
            market.totalPool += 0;
        }
        _transferFrom(market.token, sender, address(this), amount);
        pos.totalStaked += amount;
        pos.stakeByOutcome[outcomeId] += amount;
        outcomePools[marketId][outcomeId] += amount;
        market.totalPool += amount;
        emit PositionTaken(marketId, sender, outcomeId, amount);
    }

    function proposeOutcome(
        uint256 marketId,
        uint16 outcomeId,
        bytes32 evidenceHash,
        bytes32 receiptHash,
        uint16 aiOutcome,
        uint16 oracleOutcome,
        uint16 oracleConfidenceBps,
        bytes32 oracleAdapterId
    ) public nonReentrant {
        _propose(marketId, outcomeId, evidenceHash, receiptHash, aiOutcome, oracleOutcome, oracleConfidenceBps, oracleAdapterId);
    }

    function proposeCancel(uint256 marketId, bytes32 evidenceHash, bytes32 receiptHash) public nonReentrant {
        _propose(marketId, NO_OUTCOME, evidenceHash, receiptHash, NO_OUTCOME, NO_OUTCOME, 0, bytes32(0));
    }

    function requestAuthorityReview(uint256 marketId, bytes32 reasonHash) external nonReentrant {
        address sender = _msgSender();
        Market storage market = _market(marketId);
        if (market.state != MarketState.Proposed) revert InvalidState();
        if (sender != market.creator && !_isAuthority(market, sender)) revert NotAuthorized();
        market.authorityReviewRequired = true;
        emit AuthorityReviewRequested(marketId, sender, reasonHash);
    }

    function dispute(uint256 marketId) external {
        disputeWithReason(marketId, bytes32(0));
    }

    function disputeWithReason(uint256 marketId, bytes32 reasonHash) public nonReentrant {
        address sender = _msgSender();
        _requireOpen(sender);
        Market storage market = _market(marketId);
        if (market.state != MarketState.Proposed) revert InvalidState();
        if (block.timestamp > market.proposedAt + market.disputeWindow) revert TooLate();
        if (market.disputed) revert AlreadyDisputed();
        Position storage pos = positions[marketId][sender];
        if (!pos.entered) revert NoPosition();
        _transferFrom(market.token, sender, address(this), market.disputeBond);
        market.disputed = true;
        market.disputer = sender;
        market.disputeReasonHash = reasonHash;
        market.state = MarketState.Disputed;
        _rep(sender, Role.Disputer, marketId, 1, "DISPUTE_OPENED");
        emit MarketDisputed(marketId, sender, reasonHash);
    }

    function reportMarket(uint256 marketId, bytes32 reasonHash) external nonReentrant {
        address sender = _msgSender();
        _requireOpen(sender);
        Market storage market = _market(marketId);
        if (market.state != MarketState.Live && market.state != MarketState.Proposed) revert InvalidState();
        if (market.reportOpen) revert InvalidState();
        _transferFrom(market.token, sender, address(this), market.reportBond);
        market.reportOpen = true;
        market.reporter = sender;
        market.reportReasonHash = reasonHash;
        _rep(sender, Role.Reporter, marketId, 1, "REPORT_OPENED");
        emit MarketReported(marketId, sender, reasonHash);
    }

    function resolveReport(uint256 marketId, bool accepted, bytes32 reasonHash) external onlyOwner nonReentrant {
        Market storage market = _market(marketId);
        if (!market.reportOpen) revert InvalidState();
        market.reportOpen = false;
        if (accepted) {
            market.state = MarketState.Canceled;
            market.finalOutcome = NO_OUTCOME;
            _credit(market.token, market.reporter, market.reportBond + market.creatorBond);
            market.creatorBond = 0;
            _rep(market.reporter, Role.Reporter, marketId, 10, "REPORT_ACCEPTED");
            _rep(market.creator, Role.Creator, marketId, -10, "REPORT_ACCEPTED_MARKET_CANCELED");
            emit MarketCanceled(marketId, _msgSender(), reasonHash, true);
        } else {
            accumulatedProtocolFeesByToken[market.token] += market.reportBond;
            _rep(market.reporter, Role.Reporter, marketId, -4, "REPORT_REJECTED");
        }
        emit ReportResolved(marketId, accepted, reasonHash);
    }

    function finalize(uint256 marketId) external nonReentrant {
        Market storage market = _market(marketId);
        if (market.state != MarketState.Proposed) revert InvalidState();
        if (market.authorityReviewRequired && !_isAuthority(market, _msgSender())) revert NotAuthorized();
        if (!market.authorityReviewRequired && block.timestamp < market.proposedAt + market.disputeWindow) revert TooEarly();
        _finalize(marketId, market, market.proposedOutcome, market.evidenceHash);
    }

    function finalizeOutcome(uint256 marketId, uint16 outcomeId, bytes32 evidenceHash, bytes32) public nonReentrant {
        Market storage market = _market(marketId);
        if (!_isAuthority(market, _msgSender())) revert NotAuthorized();
        if (market.state != MarketState.Proposed && market.state != MarketState.Disputed) revert InvalidState();
        _finalize(marketId, market, outcomeId, evidenceHash);
    }

    function ownerCancelMarket(uint256 marketId, bool slashCreatorBond, bytes32 reasonHash) external onlyOwner nonReentrant {
        Market storage market = _market(marketId);
        if (
            market.state == MarketState.Finalized || market.state == MarketState.Canceled
                || market.state == MarketState.Rejected
        ) revert InvalidState();
        _cancel(marketId, market, slashCreatorBond, reasonHash);
    }

    function cancelUnproposedMarket(uint256 marketId) external nonReentrant {
        Market storage market = _market(marketId);
        if (market.state != MarketState.Live) revert InvalidState();
        if (block.timestamp < market.resolutionTime + market.proposalGracePeriod) revert TooEarly();
        address sender = _msgSender();
        if (sender != market.creator && !_isAuthority(market, sender)) revert NotAuthorized();
        _cancel(marketId, market, false, "UNPROPOSED_CANCEL");
    }

    function claim(uint256 marketId) public nonReentrant returns (uint256 payout) {
        payout = _claimFor(marketId, _msgSender(), false);
    }

    function claimMany(uint256[] calldata marketIds) external nonReentrant returns (uint256 totalPayout) {
        address user = _msgSender();
        uint256 count;
        for (uint256 i = 0; i < marketIds.length; i++) {
            uint256 payout = _claimFor(marketIds[i], user, true);
            if (payout > 0) {
                totalPayout += payout;
                count++;
            }
        }
        if (totalPayout == 0) revert NothingToClaim();
        emit ClaimedBatch(user, count, totalPayout);
    }

    function withdrawBalance(address token) external nonReentrant {
        address user = _msgSender();
        uint256 amount = pendingWithdrawals[token][user];
        if (amount == 0) revert NothingToClaim();
        pendingWithdrawals[token][user] = 0;
        _transfer(token, user, amount);
        emit WithdrawalCompleted(token, user, amount);
    }

    function withdrawProtocolFees(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0) || amount > accumulatedProtocolFeesByToken[token]) revert InvalidInput();
        accumulatedProtocolFeesByToken[token] -= amount;
        _transfer(token, to, amount);
    }

    function getMarket(uint256 marketId)
        external
        view
        returns (
            string memory question,
            string memory category,
            MarketState state,
            uint256 closeTime,
            uint256 resolutionTime,
            uint256 totalPool,
            address creator,
            address token,
            uint16 outcomeCount,
            string memory sourceUrl,
            string memory resolutionRule
        )
    {
        Market storage market = _market(marketId);
        question = market.question;
        category = market.category;
        state = market.state;
        closeTime = market.closeTime;
        resolutionTime = market.resolutionTime;
        totalPool = market.totalPool;
        creator = market.creator;
        token = market.token;
        outcomeCount = market.outcomeCount;
        sourceUrl = market.sourceUrl;
        resolutionRule = market.resolutionRule;
    }

    function getMarketV5(uint256 marketId)
        external
        view
        returns (
            MarketState state,
            ResolutionMode mode,
            address token,
            address resolver,
            address authority,
            address adapter,
            uint16 outcomeCount,
            uint16 proposedOutcome,
            uint16 finalOutcome,
            bytes32 outcomeLabelsHash,
            bytes32 evidenceHash,
            bytes32 receiptHash,
            uint256 proposedAt,
            uint256 termsDisputeWindow,
            uint256 termsProposalGracePeriod,
            bool authorityReviewRequired,
            bool disputed,
            address disputer
        )
    {
        Market storage market = _market(marketId);
        return (
            market.state,
            market.mode,
            market.token,
            market.resolver,
            market.authority,
            market.adapter,
            market.outcomeCount,
            market.proposedOutcome,
            market.finalOutcome,
            market.outcomeLabelsHash,
            market.evidenceHash,
            market.receiptHash,
            market.proposedAt,
            market.disputeWindow,
            market.proposalGracePeriod,
            market.authorityReviewRequired,
            market.disputed,
            market.disputer
        );
    }

    function getMarketAudit(uint256 marketId)
        external
        view
        returns (
            bool canFinalize,
            bool requiresAuthority,
            bool reportOpen,
            bool hasConflict,
            uint16 aiOutcome,
            uint16 oracleOutcome,
            uint16 oracleConfidenceBps,
            bytes32 oracleAdapterId
        )
    {
        Market storage market = _market(marketId);
        canFinalize = market.state == MarketState.Proposed
            && (block.timestamp >= market.proposedAt + market.disputeWindow || market.authorityReviewRequired);
        requiresAuthority = market.authorityReviewRequired || market.state == MarketState.Disputed;
        reportOpen = market.reportOpen;
        hasConflict = (market.aiOutcome != NO_OUTCOME && market.aiOutcome != market.proposedOutcome)
            || (market.oracleOutcome != NO_OUTCOME && market.oracleOutcome != market.proposedOutcome);
        aiOutcome = market.aiOutcome;
        oracleOutcome = market.oracleOutcome;
        oracleConfidenceBps = market.oracleConfidenceBps;
        oracleAdapterId = market.oracleAdapterId;
    }

    function getOutcomePools(uint256 marketId) external view returns (uint256[] memory pools) {
        Market storage market = _market(marketId);
        pools = new uint256[](market.outcomeCount);
        for (uint16 i = 0; i < market.outcomeCount; i++) pools[i] = outcomePools[marketId][i];
    }

    function getUserPosition(uint256 marketId, address user) external view returns (uint256[] memory stakes, bool claimed) {
        Market storage market = _market(marketId);
        Position storage pos = positions[marketId][user];
        stakes = new uint256[](market.outcomeCount);
        for (uint16 i = 0; i < market.outcomeCount; i++) stakes[i] = pos.stakeByOutcome[i];
        claimed = pos.claimed;
    }

    function getClaimable(uint256 marketId, address user) external view returns (uint256 payout) {
        Market storage market = _market(marketId);
        Position storage pos = positions[marketId][user];
        if (pos.claimed || (market.state != MarketState.Finalized && market.state != MarketState.Canceled)) return 0;
        (payout,,) = _payout(marketId, market, pos);
    }

    function getRoleStats(address account, Role role) external view returns (RoleStats memory) {
        return roleStats[account][uint8(role)];
    }

    function _createApprovedMarket(MarketInput memory input) private returns (uint256 marketId) {
        address sender = _msgSender();
        AssetConfig memory asset = _asset(input.token);
        uint256 due = asset.creatorBond + asset.marketCreationFee;
        _transferFrom(input.token, sender, address(this), due);
        if (asset.marketCreationFee > 0) accumulatedProtocolFeesByToken[input.token] += asset.marketCreationFee;
        marketId = _storeMarket(sender, input, asset, MarketState.Live);
        roleStats[sender][uint8(Role.Creator)].submitted += 1;
        roleStats[sender][uint8(Role.Creator)].approved += 1;
        _rep(sender, Role.Creator, marketId, 6, "OWNER_CREATED");
        emit MarketCreated(marketId, sender, input.token, input.outcomeCount);
    }

    function _storeMarket(
        address creator,
        MarketInput memory input,
        AssetConfig memory asset,
        MarketState state
    ) private returns (uint256 marketId) {
        _validateMarket(input);
        marketId = marketCount++;
        Market storage market = markets[marketId];
        market.question = input.question;
        market.category = input.category;
        market.token = input.token;
        market.creator = creator;
        market.resolver = creator;
        market.authority = resolutionAuthority;
        market.adapter = input.adapter;
        market.closeTime = input.closeTime;
        market.resolutionTime = input.resolutionTime;
        market.sourceUrl = input.sourceUrl;
        market.resolutionRule = input.resolutionRule;
        market.metadataURI = input.metadataURI;
        market.mode = input.mode;
        market.state = state;
        market.outcomeCount = input.outcomeCount;
        market.proposedOutcome = NO_OUTCOME;
        market.finalOutcome = NO_OUTCOME;
        market.aiOutcome = NO_OUTCOME;
        market.oracleOutcome = NO_OUTCOME;
        market.outcomeLabelsHash = input.outcomeLabelsHash;
        market.sourceHash = input.sourceHash;
        market.ruleHash = input.ruleHash;
        market.minStake = asset.minStake;
        market.creatorBond = asset.creatorBond;
        market.resolverBond = asset.resolverBond;
        market.disputeBond = asset.disputeBond;
        market.reportBond = asset.reportBond;
        market.protocolFeeBps = asset.protocolFeeBps;
        market.creatorFeeBps = asset.creatorFeeBps;
        market.disputeWindow = disputeWindow;
        market.proposalGracePeriod = proposalGracePeriod;
        market.exists = true;
    }

    function _propose(
        uint256 marketId,
        uint16 outcomeId,
        bytes32 evidenceHash,
        bytes32 receiptHash,
        uint16 aiOutcome,
        uint16 oracleOutcome,
        uint16 oracleConfidenceBps,
        bytes32 oracleAdapterId
    ) private {
        address sender = _msgSender();
        _requireOpen(sender);
        Market storage market = _market(marketId);
        if (market.state != MarketState.Live) revert InvalidState();
        if (block.timestamp < market.resolutionTime) revert TooEarly();
        if (!_canPropose(market, sender)) revert NotAuthorized();
        _validateFinalOutcome(marketId, market, outcomeId);
        _transferFrom(market.token, sender, address(this), market.resolverBond);
        market.state = MarketState.Proposed;
        market.proposedOutcome = outcomeId;
        market.proposedAt = block.timestamp;
        market.proposer = sender;
        market.evidenceHash = evidenceHash;
        market.receiptHash = receiptHash;
        market.aiOutcome = aiOutcome;
        market.oracleOutcome = oracleOutcome;
        market.oracleConfidenceBps = oracleConfidenceBps;
        market.oracleAdapterId = oracleAdapterId;
        market.authorityReviewRequired =
            market.mode == ResolutionMode.AuthorityReview
                || (aiOutcome != NO_OUTCOME && aiOutcome != outcomeId)
                || (oracleOutcome != NO_OUTCOME && oracleOutcome != outcomeId);
        roleStats[sender][uint8(Role.Resolver)].proposed += 1;
        _rep(sender, Role.Resolver, marketId, 1, "RESULT_PROPOSED");
        emit MarketResultProposed(marketId, outcomeId, sender, receiptHash);
    }

    function _finalize(uint256 marketId, Market storage market, uint16 outcomeId, bytes32 evidenceHash) private {
        _validateFinalOutcome(marketId, market, outcomeId);
        bool upheld = market.proposedOutcome == outcomeId;
        if (market.disputed) {
            if (upheld) {
                _credit(market.token, market.proposer, market.resolverBond + market.disputeBond);
                roleStats[market.proposer][uint8(Role.Resolver)].correct += 1;
                roleStats[market.disputer][uint8(Role.Disputer)].disputesLost += 1;
                _rep(market.proposer, Role.Resolver, marketId, 8, "PROPOSAL_UPHELD");
                _rep(market.disputer, Role.Disputer, marketId, -5, "DISPUTE_LOST");
            } else {
                _credit(market.token, market.disputer, market.disputeBond + market.resolverBond);
                roleStats[market.proposer][uint8(Role.Resolver)].incorrect += 1;
                roleStats[market.disputer][uint8(Role.Disputer)].disputesWon += 1;
                _rep(market.proposer, Role.Resolver, marketId, -10, "PROPOSAL_OVERTURNED");
                _rep(market.disputer, Role.Disputer, marketId, 10, "DISPUTE_WON");
            }
        } else {
            _credit(market.token, market.proposer, market.resolverBond);
            roleStats[market.proposer][uint8(Role.Resolver)].correct += 1;
            _rep(market.proposer, Role.Resolver, marketId, 5, "PROPOSAL_FINALIZED");
        }
        _credit(market.token, market.creator, market.creatorBond);
        market.creatorBond = 0;
        market.finalOutcome = outcomeId;
        market.state = outcomeId == NO_OUTCOME ? MarketState.Canceled : MarketState.Finalized;
        emit MarketFinalized(marketId, outcomeId, _msgSender(), evidenceHash);
    }

    function _cancel(uint256 marketId, Market storage market, bool slashCreatorBond, bytes32 reasonHash) private {
        market.finalOutcome = NO_OUTCOME;
        market.state = MarketState.Canceled;
        if (slashCreatorBond && market.creatorBond > 0) {
            accumulatedProtocolFeesByToken[market.token] += market.creatorBond;
            _rep(market.creator, Role.Creator, marketId, -10, "MARKET_CANCELED_SLASHED");
        } else {
            _credit(market.token, market.creator, market.creatorBond);
            _rep(market.creator, Role.Creator, marketId, -2, "MARKET_CANCELED");
        }
        market.creatorBond = 0;
        emit MarketCanceled(marketId, _msgSender(), reasonHash, slashCreatorBond);
    }

    function _claimFor(uint256 marketId, address user, bool skipUnavailable) private returns (uint256 payout) {
        Market storage market = _market(marketId);
        Position storage pos = positions[marketId][user];
        if (pos.claimed) {
            if (skipUnavailable) return 0;
            revert AlreadyClaimed();
        }
        if (market.state != MarketState.Finalized && market.state != MarketState.Canceled) {
            if (skipUnavailable) return 0;
            revert MarketOpen();
        }
        uint256 protocolFee;
        uint256 creatorFee;
        (payout, protocolFee, creatorFee) = _payout(marketId, market, pos);
        if (payout == 0) {
            if (skipUnavailable) return 0;
            revert NothingToClaim();
        }
        pos.claimed = true;
        if (market.state == MarketState.Finalized) {
            uint256 winningStake = pos.stakeByOutcome[market.finalOutcome];
            market.claimedWinningStake += winningStake;
            market.grossPayoutDistributed += payout + protocolFee + creatorFee;
        }
        if (protocolFee > 0) accumulatedProtocolFeesByToken[market.token] += protocolFee;
        if (creatorFee > 0) _credit(market.token, market.creator, creatorFee);
        _transfer(market.token, user, payout);
        emit Claimed(marketId, user, market.token, payout);
    }

    function _payout(uint256 marketId, Market storage market, Position storage pos)
        private
        view
        returns (uint256 payout, uint256 protocolFee, uint256 creatorFee)
    {
        if (market.state == MarketState.Canceled) return (pos.totalStaked, 0, 0);
        uint256 winningStake = pos.stakeByOutcome[market.finalOutcome];
        if (winningStake == 0) return (0, 0, 0);
        uint256 winningPool = outcomePools[marketId][market.finalOutcome];
        uint256 gross = market.claimedWinningStake + winningStake == winningPool
            ? market.totalPool - market.grossPayoutDistributed
            : (winningStake * market.totalPool) / winningPool;
        uint256 profit = gross > winningStake ? gross - winningStake : 0;
        protocolFee = (profit * market.protocolFeeBps) / BPS;
        creatorFee = (profit * market.creatorFeeBps) / BPS;
        payout = gross - protocolFee - creatorFee;
    }

    function _validateMarket(MarketInput memory input) private view {
        if (bytes(input.question).length < 8 || bytes(input.category).length == 0) revert InvalidInput();
        if (bytes(input.sourceUrl).length == 0 || bytes(input.resolutionRule).length == 0) revert InvalidInput();
        if (input.closeTime <= block.timestamp + 5 minutes || input.resolutionTime < input.closeTime) revert InvalidInput();
        if (input.outcomeCount < 2 || input.outcomeCount > MAX_OUTCOMES || input.outcomeLabelsHash == bytes32(0)) {
            revert InvalidOutcome();
        }
        if (input.mode == ResolutionMode.AdapterOnly) {
            if (input.adapter == address(0) || !approvedAdapters[input.adapter]) revert NotAuthorized();
        } else if (input.adapter != address(0)) {
            revert NotAuthorized();
        }
    }

    function _validateFinalOutcome(uint256 marketId, Market storage market, uint16 outcomeId) private view {
        if (outcomeId == NO_OUTCOME) return;
        if (outcomeId >= market.outcomeCount || outcomePools[marketId][outcomeId] == 0) revert InvalidOutcome();
    }

    function _configureAsset(
        address token,
        bool enabled,
        string memory symbol,
        uint8 decimals,
        uint256 assetMinStake,
        uint256 creatorBondAmount,
        uint256 resolverBondAmount,
        uint256 disputeBondAmount,
        uint256 reportBondAmount,
        uint256 creationFee,
        uint256 protocolFeeRateBps,
        uint256 creatorFeeBps
    ) private {
        if (token == address(0) || assetMinStake == 0) revert UnsupportedAsset();
        if (protocolFeeRateBps > MAX_PROTOCOL_FEE_BPS || creatorFeeBps > MAX_CREATOR_FEE_BPS) revert InvalidInput();
        assetConfigs[token] = AssetConfig(
            enabled,
            symbol,
            decimals,
            assetMinStake,
            creatorBondAmount,
            resolverBondAmount,
            disputeBondAmount,
            reportBondAmount,
            creationFee,
            protocolFeeRateBps,
            creatorFeeBps
        );
        emit SettlementAssetConfigured(token, enabled, symbol, decimals);
    }

    function _asset(address token) private view returns (AssetConfig memory asset) {
        asset = assetConfigs[token];
        if (!asset.enabled) revert UnsupportedAsset();
    }

    function _market(uint256 marketId) private view returns (Market storage market) {
        market = markets[marketId];
        if (!market.exists) revert NotFound();
    }

    function _isAuthority(Market storage market, address account) private view returns (bool) {
        return account == owner || account == market.authority;
    }

    function _canPropose(Market storage market, address account) private view returns (bool) {
        if (market.mode == ResolutionMode.AdapterOnly) {
            return account == market.adapter || _isAuthority(market, account);
        }
        if (market.mode == ResolutionMode.AuthorityOnly) return _isAuthority(market, account);
        return account == market.resolver || _isAuthority(market, account);
    }

    function _requireOpen(address account) private view {
        if (platformPaused) revert Paused();
        if (blockedAccounts[account]) revert Blocked();
    }

    function _rep(address account, Role role, uint256 marketId, int256 delta, bytes32 reasonCode) private {
        roleStats[account][uint8(role)].score += delta;
        emit ReputationUpdated(account, role, marketId, delta, reasonCode);
    }

    function _credit(address token, address account, uint256 amount) private {
        if (amount == 0) return;
        pendingWithdrawals[token][account] += amount;
        emit WithdrawalCredited(token, account, amount);
    }

    function _transfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20V5.transfer.selector, to, amount));
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _transferFrom(address token, address from, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20V5.transferFrom.selector, from, to, amount));
        if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
