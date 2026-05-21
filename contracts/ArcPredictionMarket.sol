// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcPredictionMarket {
    enum Outcome {
        Unresolved,
        Yes,
        No,
        Canceled
    }

    struct Market {
        string question;
        string category;
        uint256 closeTime;
        address creator;
        address resolver;
        uint256 yesPool;
        uint256 noPool;
        uint256 traderCount;
        Outcome proposedOutcome;
        uint256 proposedAt;
        bool disputed;
        address disputer;
        Outcome outcome;
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
    error MarketNotFound();
    error InvalidOutcome();
    error MarketClosed();
    error MarketStillOpen();
    error AlreadyResolved();
    error NothingToClaim();
    error AlreadyClaimed();
    error TransferFailed();
    error StakeTooSmall();
    error InvalidFee();
    error ZeroRecipient();
    error InvalidBond();
    error ResultAlreadyProposed();
    error ResultNotProposed();
    error DisputeWindowOpen();
    error DisputeWindowClosed();
    error AlreadyDisputed();
    error DisputedMarket();

    uint256 private constant REENTRANCY_UNLOCKED = 1;
    uint256 private constant REENTRANCY_LOCKED = 2;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 500;

    address public owner;
    uint256 public immutable minStake;
    uint256 public immutable creatorBond;
    uint256 public immutable disputeBond;
    uint256 public immutable disputeWindow;
    uint256 public protocolFeeBps = 200;
    uint256 public accumulatedProtocolFees;
    uint256 public marketCount;

    mapping(uint256 => Market) private markets;
    mapping(uint256 => mapping(address => Position)) private positions;
    uint256 private reentrancyStatus = REENTRANCY_UNLOCKED;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MarketCreated(
        uint256 indexed marketId,
        string question,
        string category,
        uint256 closeTime,
        address indexed creator,
        address indexed resolver
    );
    event BetPlaced(
        uint256 indexed marketId,
        address indexed user,
        Outcome indexed side,
        uint256 amount,
        uint256 yesPool,
        uint256 noPool
    );
    event MarketResolved(uint256 indexed marketId, Outcome outcome);
    event MarketResultProposed(uint256 indexed marketId, Outcome outcome, uint256 disputeDeadline);
    event MarketDisputed(uint256 indexed marketId, address indexed disputer, Outcome proposedOutcome);
    event DisputeFinalized(uint256 indexed marketId, Outcome finalOutcome, address indexed bondRecipient);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout);
    event ProtocolFeeUpdated(uint256 previousFeeBps, uint256 newFeeBps);
    event ProtocolFeeCollected(uint256 indexed marketId, address indexed user, uint256 fee);
    event ProtocolFeesWithdrawn(address indexed recipient, uint256 amount);

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

    constructor(uint256 _minStake) {
        owner = msg.sender;
        minStake = _minStake;
        creatorBond = _minStake * 10;
        disputeBond = _minStake * 10;
        disputeWindow = 12 hours;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PROTOCOL_FEE_BPS) revert InvalidFee();
        emit ProtocolFeeUpdated(protocolFeeBps, newFeeBps);
        protocolFeeBps = newFeeBps;
    }

    function withdrawProtocolFees(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroRecipient();
        uint256 withdrawAmount = amount == 0 ? accumulatedProtocolFees : amount;
        require(withdrawAmount <= accumulatedProtocolFees, "INSUFFICIENT_FEES");

        accumulatedProtocolFees -= withdrawAmount;
        (bool success, ) = recipient.call{value: withdrawAmount}("");
        if (!success) revert TransferFailed();

        emit ProtocolFeesWithdrawn(recipient, withdrawAmount);
    }

    function createMarket(
        string calldata question,
        string calldata category,
        uint256 closeTime
    ) external payable returns (uint256 marketId) {
        require(bytes(question).length >= 8, "QUESTION_TOO_SHORT");
        require(closeTime > block.timestamp + 5 minutes, "CLOSE_TIME_TOO_SOON");
        if (msg.value != creatorBond) revert InvalidBond();

        marketId = marketCount;
        marketCount += 1;

        markets[marketId] = Market({
            question: question,
            category: category,
            closeTime: closeTime,
            creator: msg.sender,
            resolver: msg.sender,
            yesPool: 0,
            noPool: 0,
            traderCount: 0,
            proposedOutcome: Outcome.Unresolved,
            proposedAt: 0,
            disputed: false,
            disputer: address(0),
            outcome: Outcome.Unresolved,
            exists: true
        });

        emit MarketCreated(marketId, question, category, closeTime, msg.sender, msg.sender);
    }

    function bet(uint256 marketId, Outcome side) external payable nonReentrant {
        Market storage market = _market(marketId);
        if (side != Outcome.Yes && side != Outcome.No) revert InvalidOutcome();
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (block.timestamp >= market.closeTime) revert MarketClosed();
        if (msg.value < minStake) revert StakeTooSmall();

        Position storage position = positions[marketId][msg.sender];
        if (!position.entered) {
            position.entered = true;
            market.traderCount += 1;
        }

        if (side == Outcome.Yes) {
            position.yes += msg.value;
            market.yesPool += msg.value;
        } else {
            position.no += msg.value;
            market.noPool += msg.value;
        }

        emit BetPlaced(marketId, msg.sender, side, msg.value, market.yesPool, market.noPool);
    }

    function resolve(uint256 marketId, Outcome outcome) external {
        Market storage market = _market(marketId);
        if (msg.sender != market.resolver && msg.sender != owner) revert NotResolver();
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (block.timestamp < market.closeTime) revert MarketStillOpen();
        if (market.proposedAt != 0) revert ResultAlreadyProposed();
        if (outcome != Outcome.Yes && outcome != Outcome.No && outcome != Outcome.Canceled) {
            revert InvalidOutcome();
        }

        if (outcome == Outcome.Yes && market.yesPool == 0) revert InvalidOutcome();
        if (outcome == Outcome.No && market.noPool == 0) revert InvalidOutcome();

        market.proposedOutcome = outcome;
        market.proposedAt = block.timestamp;

        emit MarketResultProposed(marketId, outcome, block.timestamp + disputeWindow);
    }

    function cancel(uint256 marketId) external {
        Market storage market = _market(marketId);
        if (msg.sender != market.resolver && msg.sender != owner) revert NotResolver();
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (block.timestamp < market.closeTime) revert MarketStillOpen();
        if (market.proposedAt != 0) revert ResultAlreadyProposed();

        market.proposedOutcome = Outcome.Canceled;
        market.proposedAt = block.timestamp;

        emit MarketResultProposed(marketId, Outcome.Canceled, block.timestamp + disputeWindow);
    }

    function dispute(uint256 marketId) external payable {
        Market storage market = _market(marketId);
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (market.proposedAt == 0) revert ResultNotProposed();
        if (block.timestamp >= market.proposedAt + disputeWindow) revert DisputeWindowClosed();
        if (market.disputed) revert AlreadyDisputed();
        if (msg.value != disputeBond) revert InvalidBond();

        market.disputed = true;
        market.disputer = msg.sender;

        emit MarketDisputed(marketId, msg.sender, market.proposedOutcome);
    }

    function finalize(uint256 marketId) external nonReentrant {
        Market storage market = _market(marketId);
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (market.proposedAt == 0) revert ResultNotProposed();
        if (market.disputed) revert DisputedMarket();
        if (block.timestamp < market.proposedAt + disputeWindow) revert DisputeWindowOpen();

        _finalizeMarket(marketId, market, market.proposedOutcome);
        _sendValue(payable(market.creator), creatorBond);
    }

    function finalizeDispute(uint256 marketId, Outcome finalOutcome) external onlyOwner nonReentrant {
        Market storage market = _market(marketId);
        if (market.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (!market.disputed) revert DisputedMarket();
        if (finalOutcome != Outcome.Yes && finalOutcome != Outcome.No && finalOutcome != Outcome.Canceled) {
            revert InvalidOutcome();
        }
        if (finalOutcome == Outcome.Yes && market.yesPool == 0) revert InvalidOutcome();
        if (finalOutcome == Outcome.No && market.noPool == 0) revert InvalidOutcome();

        bool creatorCorrect = finalOutcome == market.proposedOutcome;
        address payable bondRecipient = payable(creatorCorrect ? market.creator : market.disputer);
        _finalizeMarket(marketId, market, finalOutcome);
        _sendValue(bondRecipient, creatorBond + disputeBond);

        emit DisputeFinalized(marketId, finalOutcome, bondRecipient);
    }

    function claim(uint256 marketId) external nonReentrant returns (uint256 payout) {
        Market storage market = _market(marketId);
        Position storage position = positions[marketId][msg.sender];

        if (market.outcome == Outcome.Unresolved) revert MarketStillOpen();
        if (position.claimed) revert AlreadyClaimed();

        uint256 fee;
        (payout, fee) = _payout(market, position);
        if (payout == 0) revert NothingToClaim();

        position.claimed = true;
        if (fee > 0) {
            accumulatedProtocolFees += fee;
            emit ProtocolFeeCollected(marketId, msg.sender, fee);
        }

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        if (!success) revert TransferFailed();

        emit Claimed(marketId, msg.sender, payout);
    }

    function getMarket(uint256 marketId)
        external
        view
        returns (
            string memory question,
            string memory category,
            uint256 closeTime,
            address creator,
            address resolver,
            uint256 yesPool,
            uint256 noPool,
            uint256 traderCount,
            Outcome proposedOutcome,
            uint256 proposedAt,
            uint256 disputeDeadline,
            bool disputed,
            address disputer,
            Outcome outcome
        )
    {
        Market storage market = _market(marketId);
        return (
            market.question,
            market.category,
            market.closeTime,
            market.creator,
            market.resolver,
            market.yesPool,
            market.noPool,
            market.traderCount,
            market.proposedOutcome,
            market.proposedAt,
            market.proposedAt == 0 ? 0 : market.proposedAt + disputeWindow,
            market.disputed,
            market.disputer,
            market.outcome
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

    function potentialPayout(uint256 marketId, address user) external view returns (uint256) {
        Market storage market = _market(marketId);
        Position storage position = positions[marketId][user];

        if (market.outcome == Outcome.Unresolved || position.claimed) {
            return 0;
        }

        (uint256 payout, ) = _payout(market, position);
        return payout;
    }

    function _market(uint256 marketId) private view returns (Market storage market) {
        market = markets[marketId];
        if (!market.exists) revert MarketNotFound();
    }

    function _finalizeMarket(uint256 marketId, Market storage market, Outcome finalOutcome) private {
        market.outcome = finalOutcome;
        emit MarketResolved(marketId, finalOutcome);
    }

    function _payout(Market storage market, Position storage position) private view returns (uint256 payout, uint256 fee) {
        if (market.outcome == Outcome.Canceled) {
            return (position.yes + position.no, 0);
        }

        uint256 winningStake = market.outcome == Outcome.Yes ? position.yes : position.no;
        if (winningStake == 0) {
            return (0, 0);
        }

        uint256 winningPool = market.outcome == Outcome.Yes ? market.yesPool : market.noPool;
        uint256 totalPool = market.yesPool + market.noPool;
        uint256 grossPayout = (winningStake * totalPool) / winningPool;
        uint256 profit = grossPayout > winningStake ? grossPayout - winningStake : 0;
        fee = (profit * protocolFeeBps) / BPS;
        payout = grossPayout - fee;
    }

    function _sendValue(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    receive() external payable {
        revert("USE_BET");
    }
}
