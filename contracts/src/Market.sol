// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IEthMultiVault.sol";

/// @title Market
/// @notice Marché de prédiction binaire (YES/NO) résolu trustlessly via Intuition MultiVault.
/// @dev    Déployé sur Intuition L3 (chain 1155) pour accès direct aux view calls.
///         Les IDs Intuition sont des bytes32 (hash du contenu), pas des uint256.
///         curveId = valeur retournée par getBondingCurveConfig() — 1 sur mainnet.
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
    bytes32        public immutable targetId;      // termId Intuition (bytes32, pas uint256)
    uint256        public immutable curveId;       // bonding curve ID (1 sur mainnet)
    uint256        public immutable targetValue;   // seuil en wei ou en bps
    uint256        public immutable deadline;      // timestamp (seconds) de résolution
    uint256        public immutable lockTime;      // timestamp (seconds) de fermeture des paris
    uint256        public immutable minVolume;
    uint256        public immutable protocolFeeBps;
    uint256        public immutable stakerDividendBps;
    uint256        public immutable resolverReward;
    address        public immutable feeCollector;
    bool           public immutable isTripleMarket; // true si targetId est un triple

    // ─── Betting state ────────────────────────────────────────────────────────

    uint256 public poolYes;
    uint256 public poolNo;

    mapping(address => uint256) public sharesYes;
    mapping(address => uint256) public sharesNo;
    mapping(address => bool)    public claimed;

    // ─── Resolution state ─────────────────────────────────────────────────────

    bool    public resolved;
    bool    public refundMode;
    bool    public outcome; // true = YES gagne

    /// @notice Snapshot du pool restant pour les gagnants (fixé à resolve())
    uint256 public remainingPoolAfterFees;

    /// @notice Snapshot du ratio initial (TRIPLE_FLIP uniquement)
    uint256 public initialForAssets;
    uint256 public initialAgainstAssets;

    // ─── Staker dividend state ────────────────────────────────────────────────

    /// @notice ETH réservé aux stakers Intuition de targetId
    uint256 public totalDividend;

    /// @notice Total de shares Intuition au block de résolution (dénominateur)
    uint256 public vaultTotalSharesAtResolution;

    mapping(address => bool) public dividendClaimed;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BetPlaced(address indexed user, bool side, uint256 amount);
    event MarketResolved(bool outcome, uint256 pool, uint256 resolverPay);
    event Claimed(address indexed user, uint256 payout);
    event DividendClaimed(address indexed staker, uint256 payout);
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
        uint256 _stakerDividendBps,
        uint256 _resolverReward,
        address _feeCollector
    ) {
        require(_deadline > _lockTime,       "Deadline <= lockTime");
        require(_lockTime > block.timestamp,  "LockTime dans le passe");
        require(_protocolFeeBps + _stakerDividendBps <= 3000, "Fees > 30%");
        require(_conditionType >= 1 && _conditionType <= 6,   "ConditionType invalide");

        intuition          = IEthMultiVault(_intuition);
        creator            = _creator;
        conditionType      = _conditionType;
        targetId           = _targetId;
        curveId            = _curveId;
        targetValue        = _targetValue;
        deadline           = _deadline;
        lockTime           = _lockTime;
        minVolume          = _minVolume;
        protocolFeeBps     = _protocolFeeBps;
        stakerDividendBps  = _stakerDividendBps;
        resolverReward     = _resolverReward;
        feeCollector       = _feeCollector;
        isTripleMarket     = (_conditionType == TRIPLE_RATIO || _conditionType == TRIPLE_FLIP);

        // Snapshot initial pour TRIPLE_FLIP
        if (_conditionType == TRIPLE_FLIP) {
            (uint256 forAssets,)    = intuition.getVault(_targetId, _curveId);
            bytes32 counterId       = intuition.getCounterIdFromTripleId(_targetId);
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

    /// @notice Cotes côté YES en bps (5000 = 50%)
    function oddsYesBps() external view returns (uint256) {
        uint256 tp = totalPool();
        if (tp == 0) return 5000;
        return (poolYes * 10000) / tp;
    }

    // ─── Resolution ───────────────────────────────────────────────────────────

    /// @notice Résout le marché en lisant Intuition on-chain.
    ///         N'importe qui peut appeler après la deadline — le resolver est récompensé.
    function resolve() external {
        require(block.timestamp >= deadline, "Trop tot");
        require(!resolved,   "Deja resolu");
        require(!refundMode, "Mode remboursement");

        uint256 pool = address(this).balance;

        // Volume insuffisant → mode remboursement
        if (pool < minVolume) {
            refundMode = true;
            return;
        }

        // ── CEI : état avant appels externes ──
        resolved = true;
        outcome  = _evaluateCondition();

        uint256 protocolFee = (pool * protocolFeeBps)    / 10000;
        uint256 dividend    = (pool * stakerDividendBps) / 10000;
        uint256 reward      = (resolverReward > 0 && pool > protocolFee + dividend + resolverReward)
                              ? resolverReward : 0;

        // Pool pour les gagnants — snapshoté ici, ne changera plus
        remainingPoolAfterFees = pool - protocolFee - dividend - reward;
        totalDividend          = dividend;

        // Snapshot shares Intuition pour le dividend
        vaultTotalSharesAtResolution = _getTotalVaultShares();

        // Appels externes après mise à jour complète de l'état
        if (protocolFee > 0) {
            (bool ok1,) = payable(feeCollector).call{value: protocolFee}("");
            require(ok1, "Transfer failed");
        }
        if (reward > 0) {
            (bool ok2,) = payable(msg.sender).call{value: reward}("");
            require(ok2, "Transfer failed");
        }
        // `dividend` reste dans le contrat — récupérable via claimStakerDividend()

        emit MarketResolved(outcome, pool, reward);
    }

    // ─── Claim — gagnants ─────────────────────────────────────────────────────

    function claim() external {
        require(resolved,            "Pas resolu");
        require(!claimed[msg.sender], "Deja claim");

        claimed[msg.sender] = true;

        uint256 payout = _calculatePayout(msg.sender);
        require(payout > 0, "Rien a claim");

        (bool _ok,) = payable(msg.sender).call{value: payout}(""); require(_ok, "Transfer failed");
        emit Claimed(msg.sender, payout);
    }

    /// @dev Utilise remainingPoolAfterFees (snapshot fixe) — pas de balance dynamique.
    function _calculatePayout(address _user) internal view returns (uint256) {
        if (outcome) {
            if (poolYes == 0) return 0;
            return (sharesYes[_user] * remainingPoolAfterFees) / poolYes;
        } else {
            if (poolNo == 0) return 0;
            return (sharesNo[_user] * remainingPoolAfterFees) / poolNo;
        }
    }

    // ─── Claim — stakers Intuition ────────────────────────────────────────────

    /// @notice Les stakers Intuition de targetId récupèrent leur part du dividend.
    ///         Pull model : chaque staker appelle cette fonction individuellement.
    ///
    ///         Distribution : (shares du staker) / (total shares au moment de resolve)
    ///
    ///         Note anti-gaming : le dénominateur est snapshoté à resolve().
    ///         Un achat de shares Intuition post-résolution ne gonfle pas le dénominateur,
    ///         mais l'acheteur peut quand même claim (coût : fees Intuition ~0.5%).
    ///         Acceptable car le dividend est généralement faible vs le coût d'entrée.
    ///
    ///         Pour un triple : les stakers des deux côtés (for + against) sont éligibles.
    function claimStakerDividend() external {
        require(resolved,                      "Pas resolu");
        require(!dividendClaimed[msg.sender],   "Deja claim");
        require(vaultTotalSharesAtResolution > 0, "Pas de shares au snapshot");

        uint256 userShares = _getUserVaultShares(msg.sender);
        require(userShares > 0, "Pas de shares Intuition");

        dividendClaimed[msg.sender] = true;

        uint256 payout = (userShares * totalDividend) / vaultTotalSharesAtResolution;
        require(payout > 0, "Dividend nul");

        (bool _ok,) = payable(msg.sender).call{value: payout}(""); require(_ok, "Transfer failed");
        emit DividendClaimed(msg.sender, payout);
    }

    // ─── Emergency refund ─────────────────────────────────────────────────────

    /// @notice Remboursement intégral si volume < minVolume après deadline.
    function emergencyRefund() external {
        require(block.timestamp >= deadline, "Trop tot");
        require(!resolved, "Deja resolu");

        if (!refundMode) {
            require(totalPool() < minVolume, "Volume suffisant, appelle resolve()");
            refundMode = true;
        }

        uint256 refund = sharesYes[msg.sender] + sharesNo[msg.sender];
        require(refund > 0, "Rien a rembourser");

        sharesYes[msg.sender] = 0; // CEI avant transfer
        sharesNo[msg.sender]  = 0;

        (bool _ok,) = payable(msg.sender).call{value: refund}(""); require(_ok, "Transfer failed");
        emit Refunded(msg.sender, refund);
    }

    // ─── Helpers internes ─────────────────────────────────────────────────────

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

    /// @notice Total shares Intuition pour targetId.
    ///         Triple : somme des deux côtés (for + against).
    function _getTotalVaultShares() internal view returns (uint256) {
        if (!isTripleMarket) {
            (, uint256 totalShares) = intuition.getVault(targetId, curveId);
            return totalShares;
        } else {
            (, uint256 sharesFor)     = intuition.getVault(targetId, curveId);
            bytes32 counterId         = intuition.getCounterIdFromTripleId(targetId);
            (, uint256 sharesAgainst) = intuition.getVault(counterId, curveId);
            return sharesFor + sharesAgainst;
        }
    }

    /// @notice Shares Intuition d'un compte pour targetId.
    ///         Triple : somme des deux côtés.
    function _getUserVaultShares(address _user) internal view returns (uint256) {
        if (!isTripleMarket) {
            return intuition.getShares(_user, targetId, curveId);
        } else {
            uint256 sharesFor     = intuition.getShares(_user, targetId, curveId);
            bytes32 counterId     = intuition.getCounterIdFromTripleId(targetId);
            uint256 sharesAgainst = intuition.getShares(_user, counterId, curveId);
            return sharesFor + sharesAgainst;
        }
    }

    // ─── Reject unexpected ETH ────────────────────────────────────────────────

    receive() external payable {
        require(!resolved && !refundMode, "Marche termine");
    }
}
