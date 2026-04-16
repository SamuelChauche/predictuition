// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IEthMultiVault.sol";

/// @title Market
/// @notice Marché de prédiction binaire (YES/NO) résolu trustlessly via Intuition MultiVault.
contract Market {

    // ─── Condition types ──────────────────────────────────────────────────────

    uint8 public constant TVL_ABOVE    = 1;  // atom totalAssets >= targetValue
    uint8 public constant TVL_BELOW    = 2;  // atom totalAssets <  targetValue
    uint8 public constant PRICE_ABOVE  = 3;  // atom sharePrice  >= targetValue
    uint8 public constant PRICE_BELOW  = 4;  // atom sharePrice  <  targetValue
    uint8 public constant TRIPLE_RATIO = 5;  // ratio for/(for+against) >= targetValue (bps)
    uint8 public constant TRIPLE_FLIP  = 6;  // le côté majoritaire s'inverse vs snapshot

    // ─── Immutables ───────────────────────────────────────────────────────────

    IEthMultiVault public immutable intuition;
    address        public immutable creator;
    uint8          public immutable conditionType;
    bytes32        public immutable targetId;
    uint256        public immutable curveId;
    uint256        public immutable targetValue;
    uint256        public immutable deadline;
    uint256        public immutable lockTime;
    uint256        public immutable minVolume;
    uint256        public immutable protocolFeeBps;
    uint256        public immutable resolverReward;
    address        public immutable feeCollector;

    // ─── Betting state ────────────────────────────────────────────────────────

    uint256 public poolYes;
    uint256 public poolNo;

    mapping(address => uint256) public sharesYes;
    mapping(address => uint256) public sharesNo;
    mapping(address => bool)    public claimed;

    // ─── Resolution state ─────────────────────────────────────────────────────

    bool    public resolved;
    bool    public refundMode;
    bool    public outcome;

    uint256 public remainingPoolAfterFees;

    /// @notice Snapshot du ratio initial (TRIPLE_FLIP uniquement)
    uint256 public initialForAssets;
    uint256 public initialAgainstAssets;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BetPlaced(address indexed user, bool side, uint256 amount);
    event MarketResolved(bool outcome, uint256 pool, uint256 resolverPay);
    event Claimed(address indexed user, uint256 payout);
    event Refunded(address indexed user, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _intuition,
        address _creator,
        uint8   _conditionType,
        bytes32 _targetId,
        uint256 _curveId,
        uint256 _targetValue,
        uint256 _deadline,
        uint256 _lockTime,
        uint256 _minVolume,
        uint256 _protocolFeeBps,
        uint256 _resolverReward,
        address _feeCollector
    ) {
        require(_deadline > _lockTime,       "Deadline <= lockTime");
        require(_lockTime > block.timestamp,  "LockTime dans le passe");
        require(_protocolFeeBps <= 3000,      "Fee > 30%");
        require(_conditionType >= 1 && _conditionType <= 6, "ConditionType invalide");

        intuition         = IEthMultiVault(_intuition);
        creator           = _creator;
        conditionType     = _conditionType;
        targetId          = _targetId;
        curveId           = _curveId;
        targetValue       = _targetValue;
        deadline          = _deadline;
        lockTime          = _lockTime;
        minVolume         = _minVolume;
        protocolFeeBps    = _protocolFeeBps;
        resolverReward    = _resolverReward;
        feeCollector      = _feeCollector;

        // Snapshot initial pour TRIPLE_FLIP
        if (_conditionType == TRIPLE_FLIP) {
            (uint256 forAssets,)     = intuition.getVault(_targetId, _curveId);
            bytes32 counterId        = intuition.getCounterIdFromTripleId(_targetId);
            (uint256 againstAssets,) = intuition.getVault(counterId, _curveId);
            initialForAssets     = forAssets;
            initialAgainstAssets = againstAssets;
        }
    }

    // ─── Betting ──────────────────────────────────────────────────────────────

    function bet(bool _yes) external payable {
        require(block.timestamp < lockTime, "Marche verrouille");
        require(!resolved,   "Deja resolu");
        require(!refundMode, "Mode remboursement");
        require(msg.value > 0, "Montant nul");

        if (_yes) {
            poolYes               += msg.value;
            sharesYes[msg.sender] += msg.value;
        } else {
            poolNo               += msg.value;
            sharesNo[msg.sender] += msg.value;
        }

        emit BetPlaced(msg.sender, _yes, msg.value);
    }

    function totalPool() public view returns (uint256) {
        return poolYes + poolNo;
    }

    function oddsYesBps() external view returns (uint256) {
        uint256 tp = totalPool();
        if (tp == 0) return 5000;
        return (poolYes * 10000) / tp;
    }

    // ─── Resolution ───────────────────────────────────────────────────────────

    function resolve() external {
        require(block.timestamp >= deadline, "Trop tot");
        require(!resolved,   "Deja resolu");
        require(!refundMode, "Mode remboursement");

        uint256 pool = address(this).balance;

        if (pool < minVolume) {
            refundMode = true;
            return;
        }

        resolved = true;
        outcome  = _evaluateCondition();

        uint256 protocolFee = (pool * protocolFeeBps) / 10000;
        uint256 reward      = (resolverReward > 0 && pool > protocolFee + resolverReward)
                              ? resolverReward : 0;

        remainingPoolAfterFees = pool - protocolFee - reward;

        if (protocolFee > 0) {
            (bool ok1,) = payable(feeCollector).call{value: protocolFee}("");
            require(ok1, "Transfer failed");
        }
        if (reward > 0) {
            (bool ok2,) = payable(msg.sender).call{value: reward}("");
            require(ok2, "Transfer failed");
        }

        emit MarketResolved(outcome, pool, reward);
    }

    // ─── Claim ────────────────────────────────────────────────────────────────

    function claim() external {
        require(resolved,             "Pas resolu");
        require(!claimed[msg.sender], "Deja claim");

        claimed[msg.sender] = true;

        uint256 payout = _calculatePayout(msg.sender);
        require(payout > 0, "Rien a claim");

        (bool _ok,) = payable(msg.sender).call{value: payout}("");
        require(_ok, "Transfer failed");
        emit Claimed(msg.sender, payout);
    }

    function _calculatePayout(address _user) internal view returns (uint256) {
        if (outcome) {
            if (poolYes == 0) return 0;
            return (sharesYes[_user] * remainingPoolAfterFees) / poolYes;
        } else {
            if (poolNo == 0) return 0;
            return (sharesNo[_user] * remainingPoolAfterFees) / poolNo;
        }
    }

    // ─── Emergency refund ─────────────────────────────────────────────────────

    function emergencyRefund() external {
        require(block.timestamp >= deadline, "Trop tot");
        require(!resolved, "Deja resolu");

        if (!refundMode) {
            require(totalPool() < minVolume, "Volume suffisant, appelle resolve()");
            refundMode = true;
        }

        uint256 refund = sharesYes[msg.sender] + sharesNo[msg.sender];
        require(refund > 0, "Rien a rembourser");

        sharesYes[msg.sender] = 0;
        sharesNo[msg.sender]  = 0;

        (bool _ok,) = payable(msg.sender).call{value: refund}("");
        require(_ok, "Transfer failed");
        emit Refunded(msg.sender, refund);
    }

    // ─── Condition evaluation ─────────────────────────────────────────────────

    function _evaluateCondition() internal view returns (bool) {

        if (conditionType == TVL_ABOVE) {
            (uint256 totalAssets,) = intuition.getVault(targetId, curveId);
            return totalAssets >= targetValue;
        }

        if (conditionType == TVL_BELOW) {
            (uint256 totalAssets,) = intuition.getVault(targetId, curveId);
            return totalAssets < targetValue;
        }

        if (conditionType == PRICE_ABOVE) {
            uint256 price = intuition.currentSharePrice(targetId, curveId);
            return price >= targetValue;
        }

        if (conditionType == PRICE_BELOW) {
            uint256 price = intuition.currentSharePrice(targetId, curveId);
            return price < targetValue;
        }

        if (conditionType == TRIPLE_RATIO) {
            (uint256 forAssets,)     = intuition.getVault(targetId, curveId);
            bytes32 counterId        = intuition.getCounterIdFromTripleId(targetId);
            (uint256 againstAssets,) = intuition.getVault(counterId, curveId);
            uint256 total = forAssets + againstAssets;
            if (total == 0) return false;
            return (forAssets * 10000) / total >= targetValue;
        }

        if (conditionType == TRIPLE_FLIP) {
            (uint256 forAssets,)     = intuition.getVault(targetId, curveId);
            bytes32 counterId        = intuition.getCounterIdFromTripleId(targetId);
            (uint256 againstAssets,) = intuition.getVault(counterId, curveId);
            bool wasForMajority = initialForAssets >= initialAgainstAssets;
            bool isForMajority  = forAssets >= againstAssets;
            return wasForMajority != isForMajority;
        }

        revert("Condition inconnue");
    }

    // ─── Reject unexpected ETH ────────────────────────────────────────────────

    receive() external payable {
        require(!resolved && !refundMode, "Marche termine");
    }
}
