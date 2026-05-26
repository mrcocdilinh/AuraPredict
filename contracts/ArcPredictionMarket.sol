// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract ArcPredictionMarket {
    enum Outcome {
        Unresolved,
        Yes,
        No,
        Canceled
    }

    enum ResolutionMode {
        CreatorWithDispute,
        AuthorityReview,
        AuthorityOnly,
        AdapterOnly
    }

    struct AssetConfig {
        bool enabled;
        string symbol;
        uint8 decimals;
        uint256 minStake;
        uint256 creatorBond;
        uint256 disputeBond;
        uint256 marketCreationFee;
    }

    struct Market {
        string question;
        string category;
        string metadataURI;
        string fallbackSourceURI;
        string resolutionRule;
        bytes32 metadataHash;
        address settlementToken;
        uint256 closeTime;
        uint256 resolutionTime;
        address creator;
        address resolver;
        address authority;
        address resolutionAdapter;
        ResolutionMode resolutionMode;
        uint256 protocolFeeBps;
        uint256 minStake;
        uint256 creatorBond;
        uint256 disputeBond;
        uint256 disputeWindow;
        uint256 disputeGracePeriod;
        uint256 proposalGracePeriod;
        uint256 yesPool;
        uint256 noPool;
        uint256 traderCount;
        Outcome proposedOutcome;
        uint256 proposedAt;
        address proposer;
        bytes32 proposalEvidenceHash;
        bytes32 aiReceiptHash;
        bool authorityReviewRequired;
        bool disputed;
        address disputer;
        Outcome outcome;
        uint256 claimedWinningStake;
        uint256 grossPayoutDistributed;
        bool exists;
    }

    struct Position {
        uint256 yes;
        uint256 no;
        bool entered;
        bool claimed;
    }

    error NotOwner();
    error NotResolver();
    error NotResolutionAuthority();
    error MarketNotFound();
    error InvalidOutcome();
    error InvalidTime();
    error MarketClosed();
    error MarketStillOpen();
    error ResolutionNotReady();
    error AlreadyResolved();
    error NothingToClaim();
    error AlreadyClaimed();
    error TransferFailed();
    error StakeTooSmall();
    error InvalidFee();
    error ZeroRecipient();
    error InvalidBond();
    error NoPosition();
    error ResultAlreadyProposed();
    error ResultNotProposed();
    error DisputeWindowOpen();
    error DisputeWindowClosed();
    error DisputeGracePeriodOpen();
    error AlreadyDisputed();
    error DisputedMarket();
    error AuthorityReviewRequired();
    error UnsupportedAsset();
    error InvalidDecimals();
    error NonEmptyMarket();
    error InvalidMetadata();
    error PlatformPaused();
    error AccountBlocked();
    error CreatorNotApproved();
    error InvalidResolutionAdapter();
    error InvalidAiAttestation();
    error ProposalGracePeriodOpen();

    uint256 private constant REENTRANCY_UNLOCKED = 1;
    uint256 private constant REENTRANCY_LOCKED = 2;
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 500;
    uint256 public constant MAX_QUESTION_LENGTH = 280;
    uint256 public constant MAX_CATEGORY_LENGTH = 32;
    uint256 public constant MAX_SOURCE_URI_LENGTH = 512;
    uint256 public constant MAX_RESOLUTION_RULE_LENGTH = 2_048;
    uint8 public constant SETTLEMENT_DECIMALS = 6;
    string public constant CONTRACT_VERSION = "AURAPREDICT_V4";

    address public owner;
    address public resolutionAuthority;
    address public aiAttestationSigner;
    address public immutable defaultSettlementToken;
    uint256 public disputeWindow = 12 hours;
    uint256 public disputeGracePeriod = 72 hours;
    uint256 public proposalGracePeriod = 72 hours;
    uint256 public protocolFeeBps = 200;
    uint256 public marketCount;
    bool public platformPaused;
    bool public restrictedMarketCreation;

    mapping(address => AssetConfig) public assetConfigs;
    mapping(address => uint256) public accumulatedProtocolFeesByToken;
    mapping(address => mapping(address => uint256)) public pendingWithdrawals;
    mapping(address => bool) public approvedMarketCreators;
    mapping(address => bool) public blockedAccounts;
    mapping(address => bool) public approvedResolutionAdapters;
    mapping(uint256 => Market) private markets;
    mapping(uint256 => mapping(address => Position)) private positions;
    uint256 private reentrancyStatus = REENTRANCY_UNLOCKED;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ResolutionAuthorityUpdated(address indexed previousAuthority, address indexed newAuthority);
    event AiAttestationSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event ResolutionAdapterApprovalUpdated(address indexed adapter, bool approved);
    event SettlementAssetConfigured(
        address indexed token,
        bool enabled,
        string symbol,
        uint8 decimals,
        uint256 minStake,
        uint256 creatorBond,
        uint256 disputeBond,
        uint256 marketCreationFee
    );
    event ProtocolFeeUpdated(uint256 previousFeeBps, uint256 newFeeBps);
    event DisputeWindowUpdated(uint256 previousWindow, uint256 newWindow);
    event DisputeGracePeriodUpdated(uint256 previousGracePeriod, uint256 newGracePeriod);
    event ProposalGracePeriodUpdated(uint256 previousGracePeriod, uint256 newGracePeriod);
    event MarketCreated(
        uint256 indexed marketId,
        string question,
        string category,
        address indexed settlementToken,
        uint256 closeTime,
        uint256 resolutionTime,
        address indexed creator,
        address authority,
        address resolutionAdapter,
        ResolutionMode resolutionMode,
        bytes32 metadataHash,
        string metadataURI,
        string fallbackSourceURI,
        string resolutionRule
    );
    event BetPlaced(
        uint256 indexed marketId,
        address indexed user,
        Outcome indexed side,
        uint256 amount,
        uint256 yesPool,
        uint256 noPool
    );
    event MarketResultProposed(
        uint256 indexed marketId,
        Outcome outcome,
        uint256 disputeDeadline,
        address indexed proposer,
        bytes32 evidenceHash,
        bytes32 aiReceiptHash,
        bool authorityReviewRequired
    );
    event AuthorityReviewRequested(uint256 indexed marketId, address indexed authority, bytes32 reasonHash);
    event MarketDisputed(uint256 indexed marketId, address indexed disputer, Outcome proposedOutcome);
    event MarketResolved(uint256 indexed marketId, Outcome outcome);
    event DisputeFinalized(uint256 indexed marketId, Outcome finalOutcome, address indexed bondRecipient);
    event DisputeCanceledByTimeout(uint256 indexed marketId, address indexed creator, address indexed disputer);
    event EmptyMarketCanceled(uint256 indexed marketId);
    event UnproposedMarketCanceled(uint256 indexed marketId);
    event Claimed(uint256 indexed marketId, address indexed user, address indexed token, uint256 payout);
    event MarketCreationFeeCollected(uint256 indexed marketId, address indexed creator, address indexed token, uint256 fee);
    event ProtocolFeeCollected(uint256 indexed marketId, address indexed user, address indexed token, uint256 fee);
    event ProtocolFeesWithdrawn(address indexed token, address indexed recipient, uint256 amount);
    event WithdrawalCredited(address indexed token, address indexed recipient, uint256 amount);
    event WithdrawalCompleted(address indexed token, address indexed recipient, uint256 amount);
    event PlatformPauseUpdated(bool paused);
    event RestrictedMarketCreationUpdated(bool restricted);
    event MarketCreatorApprovalUpdated(address indexed account, bool approved);
    event AccountBlockUpdated(address indexed account, bool blocked);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        require(reentrancyStatus == REENTRANCY_UNLOCKED, "REENTRANT_CALL");
        reentrancyStatus = REENTRANCY_LOCKED;
        _;
        reentrancyStatus = REENTRANCY_UNLOCKED;
    }

    constructor(address _defaultSettlementToken, address _eurcToken, uint256 _minStake) {
        if (_defaultSettlementToken == address(0) || _minStake == 0) revert ZeroRecipient();
        owner = msg.sender;
        resolutionAuthority = msg.sender;
        approvedMarketCreators[msg.sender] = true;
        defaultSettlementToken = _defaultSettlementToken;
        _configureSettlementAsset(_defaultSettlementToken, true, "USDC", SETTLEMENT_DECIMALS, _minStake, _minStake * 10, _minStake * 10, 0);
        if (_eurcToken != address(0) && _eurcToken != _defaultSettlementToken) {
            _configureSettlementAsset(_eurcToken, true, "EURC", SETTLEMENT_DECIMALS, _minStake, _minStake * 10, _minStake * 10, 0);
        }
        emit OwnershipTransferred(address(0), msg.sender);
        emit ResolutionAuthorityUpdated(address(0), msg.sender);
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

    function marketCreationFee() external view returns (uint256) {
        return assetConfigs[defaultSettlementToken].marketCreationFee;
    }

    function accumulatedProtocolFees() external view returns (uint256) {
        return accumulatedProtocolFeesByToken[defaultSettlementToken];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroRecipient();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
        if (resolutionAuthority == previousOwner) {
            resolutionAuthority = newOwner;
            emit ResolutionAuthorityUpdated(previousOwner, newOwner);
        }
    }

    function setResolutionAuthority(address newAuthority) external onlyOwner {
        if (newAuthority == address(0)) revert ZeroRecipient();
        emit ResolutionAuthorityUpdated(resolutionAuthority, newAuthority);
        resolutionAuthority = newAuthority;
    }

    function setAiAttestationSigner(address newSigner) external onlyOwner {
        emit AiAttestationSignerUpdated(aiAttestationSigner, newSigner);
        aiAttestationSigner = newSigner;
    }

    function setApprovedResolutionAdapter(address adapter, bool approved) external onlyOwner {
        if (adapter == address(0)) revert ZeroRecipient();
        approvedResolutionAdapters[adapter] = approved;
        emit ResolutionAdapterApprovalUpdated(adapter, approved);
    }

    function setPlatformPaused(bool paused) external onlyOwner {
        platformPaused = paused;
        emit PlatformPauseUpdated(paused);
    }

    function setRestrictedMarketCreation(bool restricted) external onlyOwner {
        restrictedMarketCreation = restricted;
        emit RestrictedMarketCreationUpdated(restricted);
    }

    function setApprovedMarketCreator(address account, bool approved) external onlyOwner {
        if (account == address(0)) revert ZeroRecipient();
        approvedMarketCreators[account] = approved;
        emit MarketCreatorApprovalUpdated(account, approved);
    }

    function setBlockedAccount(address account, bool blocked) external onlyOwner {
        if (account == address(0)) revert ZeroRecipient();
        blockedAccounts[account] = blocked;
        emit AccountBlockUpdated(account, blocked);
    }

    function configureSettlementAsset(
        address token,
        bool enabled,
        string calldata symbol,
        uint8 decimals,
        uint256 assetMinStake,
        uint256 assetCreatorBond,
        uint256 assetDisputeBond,
        uint256 assetCreationFee
    ) external onlyOwner {
        _configureSettlementAsset(
            token,
            enabled,
            symbol,
            decimals,
            assetMinStake,
            assetCreatorBond,
            assetDisputeBond,
            assetCreationFee
        );
    }

    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PROTOCOL_FEE_BPS) revert InvalidFee();
        emit ProtocolFeeUpdated(protocolFeeBps, newFeeBps);
        protocolFeeBps = newFeeBps;
    }

    function setMarketCreationFee(uint256 newFee) external onlyOwner {
        AssetConfig memory config = assetConfigs[defaultSettlementToken];
        _configureSettlementAsset(
            defaultSettlementToken,
            config.enabled,
            config.symbol,
            config.decimals,
            config.minStake,
            config.creatorBond,
            config.disputeBond,
            newFee
        );
    }

    function setDisputeWindow(uint256 newWindow) external onlyOwner {
        require(newWindow >= 1 hours && newWindow <= 30 days, "BAD_DISPUTE_WINDOW");
        emit DisputeWindowUpdated(disputeWindow, newWindow);
        disputeWindow = newWindow;
    }

    function setDisputeGracePeriod(uint256 newGracePeriod) external onlyOwner {
        require(newGracePeriod >= 1 hours && newGracePeriod <= 30 days, "BAD_GRACE_PERIOD");
        emit DisputeGracePeriodUpdated(disputeGracePeriod, newGracePeriod);
        disputeGracePeriod = newGracePeriod;
    }

    function setProposalGracePeriod(uint256 newGracePeriod) external onlyOwner {
        require(newGracePeriod >= 1 hours && newGracePeriod <= 30 days, "BAD_PROPOSAL_GRACE_PERIOD");
        emit ProposalGracePeriodUpdated(proposalGracePeriod, newGracePeriod);
        proposalGracePeriod = newGracePeriod;
    }

    function withdrawProtocolFees(address token, address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroRecipient();
        uint256 available = accumulatedProtocolFeesByToken[token];
        uint256 withdrawAmount = amount == 0 ? available : amount;
        require(withdrawAmount <= available, "INSUFFICIENT_FEES");
        accumulatedProtocolFeesByToken[token] = available - withdrawAmount;
        _safeTransfer(token, recipient, withdrawAmount);
        emit ProtocolFeesWithdrawn(token, recipient, withdrawAmount);
    }

    function withdrawProtocolFees(address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroRecipient();
        uint256 available = accumulatedProtocolFeesByToken[defaultSettlementToken];
        uint256 withdrawAmount = amount == 0 ? available : amount;
        require(withdrawAmount <= available, "INSUFFICIENT_FEES");
        accumulatedProtocolFeesByToken[defaultSettlementToken] = available - withdrawAmount;
        _safeTransfer(defaultSettlementToken, recipient, withdrawAmount);
        emit ProtocolFeesWithdrawn(defaultSettlementToken, recipient, withdrawAmount);
    }

    function withdrawBalance(address token) external nonReentrant {
        uint256 amount = pendingWithdrawals[token][msg.sender];
        if (amount == 0) revert NothingToClaim();
        pendingWithdrawals[token][msg.sender] = 0;
        _safeTransfer(token, msg.sender, amount);
        emit WithdrawalCompleted(token, msg.sender, amount);
    }

    function createMarket(
        string calldata question,
        string calldata category,
        address settlementToken,
        uint256 closeTime,
        uint256 resolutionTime,
        string calldata metadataURI,
        string calldata fallbackSourceURI,
        string calldata resolutionRule,
        ResolutionMode resolutionMode,
        address resolutionAdapter
    ) external nonReentrant returns (uint256 marketId) {
        if (platformPaused) revert PlatformPaused();
        if (blockedAccounts[msg.sender]) revert AccountBlocked();
        if (restrictedMarketCreation && !approvedMarketCreators[msg.sender]) revert CreatorNotApproved();
        AssetConfig memory config = _asset(settlementToken);
        require(bytes(question).length >= 8 && bytes(question).length <= MAX_QUESTION_LENGTH, "INVALID_QUESTION_LENGTH");
        require(bytes(category).length > 0 && bytes(category).length <= MAX_CATEGORY_LENGTH, "INVALID_CATEGORY_LENGTH");
        if (closeTime <= block.timestamp + 5 minutes || resolutionTime < closeTime) revert InvalidTime();
        if (
            bytes(metadataURI).length == 0 || bytes(metadataURI).length > MAX_SOURCE_URI_LENGTH
                || bytes(fallbackSourceURI).length > MAX_SOURCE_URI_LENGTH || bytes(resolutionRule).length == 0
                || bytes(resolutionRule).length > MAX_RESOLUTION_RULE_LENGTH
        ) revert InvalidMetadata();
        if (resolutionMode == ResolutionMode.AdapterOnly) {
            if (resolutionAdapter == address(0) || !approvedResolutionAdapters[resolutionAdapter]) {
                revert InvalidResolutionAdapter();
            }
        } else if (resolutionAdapter != address(0)) {
            revert InvalidResolutionAdapter();
        }
        bytes32 metadataHash = keccak256(
            abi.encode(
                question,
                category,
                settlementToken,
                closeTime,
                resolutionTime,
                metadataURI,
                fallbackSourceURI,
                resolutionRule,
                resolutionMode,
                resolutionAdapter
            )
        );

        uint256 amountDue = config.creatorBond + config.marketCreationFee;
        _safeTransferFrom(settlementToken, msg.sender, address(this), amountDue);

        marketId = marketCount;
        marketCount += 1;
        markets[marketId] = Market({
            question: question,
            category: category,
            metadataURI: metadataURI,
            fallbackSourceURI: fallbackSourceURI,
            resolutionRule: resolutionRule,
            metadataHash: metadataHash,
            settlementToken: settlementToken,
            closeTime: closeTime,
            resolutionTime: resolutionTime,
            creator: msg.sender,
            resolver: msg.sender,
            authority: resolutionAuthority,
            resolutionAdapter: resolutionAdapter,
            resolutionMode: resolutionMode,
            protocolFeeBps: protocolFeeBps,
            minStake: config.minStake,
            creatorBond: config.creatorBond,
            disputeBond: config.disputeBond,
            disputeWindow: disputeWindow,
            disputeGracePeriod: disputeGracePeriod,
            proposalGracePeriod: proposalGracePeriod,
            yesPool: 0,
            noPool: 0,
            traderCount: 0,
            proposedOutcome: Outcome.Unresolved,
            proposedAt: 0,
            proposer: address(0),
            proposalEvidenceHash: bytes32(0),
            aiReceiptHash: bytes32(0),
            authorityReviewRequired: false,
            disputed: false,
            disputer: address(0),
            outcome: Outcome.Unresolved,
            claimedWinningStake: 0,
            grossPayoutDistributed: 0,
            exists: true
        });

        if (config.marketCreationFee > 0) {
            accumulatedProtocolFeesByToken[settlementToken] += config.marketCreationFee;
            emit MarketCreationFeeCollected(marketId, msg.sender, settlementToken, config.marketCreationFee);
        }
        emit MarketCreated(
            marketId,
            question,
            category,
            settlementToken,
            closeTime,
            resolutionTime,
            msg.sender,
            resolutionAuthority,
            resolutionAdapter,
            resolutionMode,
            metadataHash,
            metadataURI,
            fallbackSourceURI,
            resolutionRule
        );
    }

    function bet(uint256 marketId, Outcome side, uint256 amount) external nonReentrant {
        if (platformPaused) revert PlatformPaused();
        if (blockedAccounts[msg.sender]) revert AccountBlocked();
        Market storage market = _market(marketId);
        if (side != Outcome.Yes && side != Outcome.No) revert InvalidOutcome();
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (block.timestamp >= market.closeTime) revert MarketClosed();
        if (amount < market.minStake) revert StakeTooSmall();
        _safeTransferFrom(market.settlementToken, msg.sender, address(this), amount);

        Position storage position = positions[marketId][msg.sender];
        if (!position.entered) {
            position.entered = true;
            market.traderCount += 1;
        }
        if (side == Outcome.Yes) {
            position.yes += amount;
            market.yesPool += amount;
        } else {
            position.no += amount;
            market.noPool += amount;
        }
        emit BetPlaced(marketId, msg.sender, side, amount, market.yesPool, market.noPool);
    }

    function resolve(uint256 marketId, Outcome outcome, bytes32 evidenceHash, bytes32 receiptHash) external {
        _proposeResult(marketId, outcome, evidenceHash, receiptHash, Outcome.Unresolved, "");
    }

    function cancel(uint256 marketId, bytes32 evidenceHash, bytes32 receiptHash) external {
        _proposeResult(marketId, Outcome.Canceled, evidenceHash, receiptHash, Outcome.Unresolved, "");
    }

    function resolveWithAiAttestation(
        uint256 marketId,
        Outcome outcome,
        bytes32 evidenceHash,
        bytes32 receiptHash,
        Outcome suggestedOutcome,
        bytes calldata attestation
    ) external {
        if (!_validAiAttestation(marketId, suggestedOutcome, receiptHash, attestation)) revert InvalidAiAttestation();
        _proposeResult(marketId, outcome, evidenceHash, receiptHash, suggestedOutcome, attestation);
    }

    function requestAuthorityReview(uint256 marketId, bytes32 reasonHash) external {
        Market storage market = _market(marketId);
        if (!_isAuthority(market, msg.sender)) revert NotResolutionAuthority();
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (market.proposedAt == 0) revert ResultNotProposed();
        market.authorityReviewRequired = true;
        emit AuthorityReviewRequested(marketId, msg.sender, reasonHash);
    }

    function dispute(uint256 marketId) external nonReentrant {
        Market storage market = _market(marketId);
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (market.proposedAt == 0) revert ResultNotProposed();
        if (block.timestamp >= market.proposedAt + market.disputeWindow) revert DisputeWindowClosed();
        if (market.disputed) revert AlreadyDisputed();
        Position storage position = positions[marketId][msg.sender];
        if (position.yes + position.no == 0) revert NoPosition();
        _safeTransferFrom(market.settlementToken, msg.sender, address(this), market.disputeBond);
        market.disputed = true;
        market.disputer = msg.sender;
        market.authorityReviewRequired = true;
        emit MarketDisputed(marketId, msg.sender, market.proposedOutcome);
    }

    function finalize(uint256 marketId) external nonReentrant {
        Market storage market = _market(marketId);
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (market.proposedAt == 0) revert ResultNotProposed();
        if (market.disputed) revert DisputedMarket();
        if (market.authorityReviewRequired) revert AuthorityReviewRequired();
        if (block.timestamp < market.proposedAt + market.disputeWindow) revert DisputeWindowOpen();
        _finalizeMarket(marketId, market, market.proposedOutcome);
        _creditWithdrawal(market.settlementToken, market.creator, market.creatorBond);
    }

    function finalizeDispute(
        uint256 marketId,
        Outcome finalOutcome,
        bytes32 evidenceHash,
        bytes32 receiptHash
    ) external nonReentrant {
        Market storage market = _market(marketId);
        if (!_isAuthority(market, msg.sender)) revert NotResolutionAuthority();
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (!market.disputed && !market.authorityReviewRequired) revert DisputedMarket();
        _validateResolvableOutcome(market, finalOutcome);

        market.proposalEvidenceHash = evidenceHash;
        market.aiReceiptHash = receiptHash;
        bool creatorCorrect = finalOutcome == market.proposedOutcome;
        address bondRecipient = market.creator;
        if (market.disputed) {
            bondRecipient = creatorCorrect ? market.creator : market.disputer;
            _creditWithdrawal(market.settlementToken, bondRecipient, market.creatorBond + market.disputeBond);
        } else {
            _creditWithdrawal(market.settlementToken, market.creator, market.creatorBond);
        }
        _finalizeMarket(marketId, market, finalOutcome);
        emit DisputeFinalized(marketId, finalOutcome, bondRecipient);
    }

    function cancelStaleDispute(uint256 marketId) external nonReentrant {
        Market storage market = _market(marketId);
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (!market.disputed && !market.authorityReviewRequired) revert DisputedMarket();
        if (block.timestamp < market.proposedAt + market.disputeWindow + market.disputeGracePeriod) {
            revert DisputeGracePeriodOpen();
        }
        _finalizeMarket(marketId, market, Outcome.Canceled);
        _creditWithdrawal(market.settlementToken, market.creator, market.creatorBond);
        if (market.disputed) {
            _creditWithdrawal(market.settlementToken, market.disputer, market.disputeBond);
        }
        emit DisputeCanceledByTimeout(marketId, market.creator, market.disputer);
    }

    function cancelEmptyMarket(uint256 marketId) external nonReentrant {
        Market storage market = _market(marketId);
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (block.timestamp < market.resolutionTime) revert ResolutionNotReady();
        if (market.proposedAt != 0) revert ResultAlreadyProposed();
        if (market.yesPool != 0 || market.noPool != 0) revert NonEmptyMarket();
        _finalizeMarket(marketId, market, Outcome.Canceled);
        _creditWithdrawal(market.settlementToken, market.creator, market.creatorBond);
        emit EmptyMarketCanceled(marketId);
    }

    function cancelUnproposedMarket(uint256 marketId) external nonReentrant {
        Market storage market = _market(marketId);
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (market.proposedAt != 0) revert ResultAlreadyProposed();
        if (block.timestamp < market.resolutionTime + market.proposalGracePeriod) {
            revert ProposalGracePeriodOpen();
        }
        _finalizeMarket(marketId, market, Outcome.Canceled);
        _creditWithdrawal(market.settlementToken, market.creator, market.creatorBond);
        emit UnproposedMarketCanceled(marketId);
    }

    function claim(uint256 marketId) external nonReentrant returns (uint256 payout) {
        Market storage market = _market(marketId);
        Position storage position = positions[marketId][msg.sender];
        if (market.outcome == Outcome.Unresolved) revert MarketStillOpen();
        if (position.claimed) revert AlreadyClaimed();
        uint256 fee;
        uint256 grossPayout;
        (payout, fee, grossPayout) = _payout(market, position);
        if (payout == 0) revert NothingToClaim();
        position.claimed = true;
        if (market.outcome == Outcome.Yes || market.outcome == Outcome.No) {
            uint256 winningStake = market.outcome == Outcome.Yes ? position.yes : position.no;
            market.claimedWinningStake += winningStake;
            market.grossPayoutDistributed += grossPayout;
        }
        if (fee > 0) {
            accumulatedProtocolFeesByToken[market.settlementToken] += fee;
            emit ProtocolFeeCollected(marketId, msg.sender, market.settlementToken, fee);
        }
        _safeTransfer(market.settlementToken, msg.sender, payout);
        emit Claimed(marketId, msg.sender, market.settlementToken, payout);
    }

    function getMarket(uint256 marketId)
        external
        view
        returns (
            string memory question,
            string memory category,
            address settlementToken,
            uint256 closeTime,
            uint256 resolutionTime,
            address creator,
            address resolver,
            address authority,
            ResolutionMode resolutionMode,
            bytes32 metadataHash,
            string memory metadataURI,
            uint256 termsProtocolFeeBps,
            uint256 termsCreatorBond,
            uint256 termsDisputeBond,
            uint256 termsDisputeWindow,
            uint256 yesPool,
            uint256 noPool,
            uint256 traderCount,
            Outcome proposedOutcome,
            uint256 proposedAt,
            uint256 disputeDeadline,
            bool authorityReviewRequired,
            bool disputed,
            address disputer,
            Outcome outcome,
            uint256 termsDisputeGracePeriod
        )
    {
        Market storage market = _market(marketId);
        return (
            market.question,
            market.category,
            market.settlementToken,
            market.closeTime,
            market.resolutionTime,
            market.creator,
            market.resolver,
            market.authority,
            market.resolutionMode,
            market.metadataHash,
            market.metadataURI,
            market.protocolFeeBps,
            market.creatorBond,
            market.disputeBond,
            market.disputeWindow,
            market.yesPool,
            market.noPool,
            market.traderCount,
            market.proposedOutcome,
            market.proposedAt,
            market.proposedAt == 0 ? 0 : market.proposedAt + market.disputeWindow,
            market.authorityReviewRequired,
            market.disputed,
            market.disputer,
            market.outcome,
            market.disputeGracePeriod
        );
    }

    function positionOf(uint256 marketId, address user)
        external
        view
        returns (uint256 yes, uint256 no, bool claimed)
    {
        _market(marketId);
        Position storage position = positions[marketId][user];
        return (position.yes, position.no, position.claimed);
    }

    function getMarketTerms(uint256 marketId)
        external
        view
        returns (
            bytes32 metadataHash,
            string memory primarySourceURI,
            string memory fallbackSourceURI,
            string memory resolutionRule
        )
    {
        Market storage market = _market(marketId);
        return (market.metadataHash, market.metadataURI, market.fallbackSourceURI, market.resolutionRule);
    }

    function getMarketPolicy(uint256 marketId)
        external
        view
        returns (
            address resolutionAdapter,
            uint256 termsMinStake,
            uint256 termsProposalGracePeriod,
            uint256 claimedWinningStake,
            uint256 grossPayoutDistributed
        )
    {
        Market storage market = _market(marketId);
        return (
            market.resolutionAdapter,
            market.minStake,
            market.proposalGracePeriod,
            market.claimedWinningStake,
            market.grossPayoutDistributed
        );
    }

    function potentialPayout(uint256 marketId, address user) external view returns (uint256) {
        Market storage market = _market(marketId);
        Position storage position = positions[marketId][user];
        if (market.outcome == Outcome.Unresolved || position.claimed) {
            return 0;
        }
        (uint256 payout, , ) = _payout(market, position);
        return payout;
    }

    function _configureSettlementAsset(
        address token,
        bool enabled,
        string memory symbol,
        uint8 decimals,
        uint256 assetMinStake,
        uint256 assetCreatorBond,
        uint256 assetDisputeBond,
        uint256 assetCreationFee
    ) private {
        if (token == address(0) || assetMinStake == 0) revert UnsupportedAsset();
        if (decimals != SETTLEMENT_DECIMALS) revert InvalidDecimals();
        assetConfigs[token] = AssetConfig({
            enabled: enabled,
            symbol: symbol,
            decimals: decimals,
            minStake: assetMinStake,
            creatorBond: assetCreatorBond,
            disputeBond: assetDisputeBond,
            marketCreationFee: assetCreationFee
        });
        emit SettlementAssetConfigured(
            token,
            enabled,
            symbol,
            decimals,
            assetMinStake,
            assetCreatorBond,
            assetDisputeBond,
            assetCreationFee
        );
    }

    function _asset(address token) private view returns (AssetConfig memory config) {
        config = assetConfigs[token];
        if (!config.enabled) revert UnsupportedAsset();
    }

    function _market(uint256 marketId) private view returns (Market storage market) {
        market = markets[marketId];
        if (!market.exists) revert MarketNotFound();
    }

    function _isAuthority(Market storage market, address account) private view returns (bool) {
        return account == owner || account == market.authority;
    }

    function _canProposeResult(Market storage market) private view returns (bool) {
        if (market.resolutionMode == ResolutionMode.AdapterOnly) {
            return
                (msg.sender == market.resolutionAdapter && approvedResolutionAdapters[market.resolutionAdapter])
                    || _isAuthority(market, msg.sender);
        }
        if (market.resolutionMode == ResolutionMode.AuthorityOnly) {
            return _isAuthority(market, msg.sender);
        }
        return msg.sender == market.resolver || _isAuthority(market, msg.sender);
    }

    function _proposeResult(
        uint256 marketId,
        Outcome proposedOutcome,
        bytes32 evidenceHash,
        bytes32 receiptHash,
        Outcome suggestedOutcome,
        bytes memory attestation
    ) private {
        Market storage market = _market(marketId);
        if (!_canProposeResult(market)) revert NotResolver();
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (block.timestamp < market.resolutionTime) revert ResolutionNotReady();
        if (market.proposedAt != 0) revert ResultAlreadyProposed();
        _validateResolvableOutcome(market, proposedOutcome);
        market.proposedOutcome = proposedOutcome;
        market.proposedAt = block.timestamp;
        market.proposer = msg.sender;
        market.proposalEvidenceHash = evidenceHash;
        market.aiReceiptHash = receiptHash;
        bool hasValidAiAttestation = _validAiAttestation(marketId, suggestedOutcome, receiptHash, attestation);
        if (market.resolutionMode == ResolutionMode.CreatorWithDispute && msg.sender == market.resolver) {
            market.authorityReviewRequired = !hasValidAiAttestation || suggestedOutcome != proposedOutcome;
        }
        if (market.resolutionMode == ResolutionMode.AuthorityReview && msg.sender == market.resolver) {
            market.authorityReviewRequired = true;
        }
        emit MarketResultProposed(
            marketId,
            proposedOutcome,
            block.timestamp + market.disputeWindow,
            msg.sender,
            evidenceHash,
            receiptHash,
            market.authorityReviewRequired
        );
    }

    function _validAiAttestation(
        uint256 marketId,
        Outcome suggestedOutcome,
        bytes32 receiptHash,
        bytes memory attestation
    ) private view returns (bool) {
        if (aiAttestationSigner == address(0) || receiptHash == bytes32(0) || attestation.length != 65) return false;
        if (suggestedOutcome != Outcome.Yes && suggestedOutcome != Outcome.No && suggestedOutcome != Outcome.Canceled) {
            return false;
        }
        bytes32 payload = keccak256(abi.encode(address(this), block.chainid, marketId, suggestedOutcome, receiptHash));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payload));
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(attestation, 32))
            s := mload(add(attestation, 64))
            v := byte(0, mload(add(attestation, 96)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER) return false;
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return false;
        return ecrecover(digest, v, r, s) == aiAttestationSigner;
    }

    function _validateResolvableOutcome(Market storage market, Outcome finalOutcome) private view {
        if (finalOutcome != Outcome.Yes && finalOutcome != Outcome.No && finalOutcome != Outcome.Canceled) {
            revert InvalidOutcome();
        }
        if (finalOutcome == Outcome.Yes && market.yesPool == 0) revert InvalidOutcome();
        if (finalOutcome == Outcome.No && market.noPool == 0) revert InvalidOutcome();
    }

    function _finalizeMarket(uint256 marketId, Market storage market, Outcome finalOutcome) private {
        market.outcome = finalOutcome;
        emit MarketResolved(marketId, finalOutcome);
    }

    function _payout(Market storage market, Position storage position)
        private
        view
        returns (uint256 payout, uint256 fee, uint256 grossPayout)
    {
        if (market.outcome == Outcome.Canceled) {
            return (position.yes + position.no, 0, position.yes + position.no);
        }
        uint256 winningStake = market.outcome == Outcome.Yes ? position.yes : position.no;
        if (winningStake == 0) {
            return (0, 0, 0);
        }
        uint256 winningPool = market.outcome == Outcome.Yes ? market.yesPool : market.noPool;
        uint256 totalPool = market.yesPool + market.noPool;
        if (market.claimedWinningStake + winningStake == winningPool) {
            grossPayout = totalPool - market.grossPayoutDistributed;
        } else {
            grossPayout = (winningStake * totalPool) / winningPool;
        }
        uint256 profit = grossPayout > winningStake ? grossPayout - winningStake : 0;
        fee = (profit * market.protocolFeeBps) / BPS;
        payout = grossPayout - fee;
    }

    function _creditWithdrawal(address token, address recipient, uint256 amount) private {
        if (amount == 0) return;
        pendingWithdrawals[token][recipient] += amount;
        emit WithdrawalCredited(token, recipient, amount);
    }

    function _safeTransfer(address token, address recipient, uint256 amount) private {
        (bool success, bytes memory result) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, recipient, amount));
        if (!success || (result.length > 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address token, address sender, address recipient, uint256 amount) private {
        (bool success, bytes memory result) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, sender, recipient, amount));
        if (!success || (result.length > 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }
}
