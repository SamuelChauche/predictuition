// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Market.sol";

/// @title MarketFactory
/// @notice Déploie et indexe les marchés Predictuition.
/// @dev    Déployé sur Intuition L3 (chain 1155).
///         Le curveId par défaut est lu depuis MultiVault.getBondingCurveConfig()
///         et stocké à la construction — governable via setCurveId().
contract MarketFactory {

    // ─── Config ───────────────────────────────────────────────────────────────

    IEthMultiVault public immutable intuition;

    uint256 public curveId;               // bonding curve ID (1 sur mainnet)
    uint256 public creationBond       = 0.05 ether;
    uint256 public minVolume          = 0.5 ether;
    uint256 public protocolFeeBps     = 100;  // 1%
    uint256 public stakerDividendBps  = 100;  // 1%
    uint256 public resolverReward     = 0.005 ether;

    address public owner;
    address public feeCollector;

    // ─── Registre ─────────────────────────────────────────────────────────────

    address[] public markets;
    mapping(address => bool)    public isMarket;
    mapping(address => uint256) public bondPerMarket;
    mapping(address => bool)    public bondClaimed;

    // ─── Events ───────────────────────────────────────────────────────────────

    event MarketCreated(
        address indexed market,
        address indexed creator,
        uint8   conditionType,
        bytes32 targetId,
        uint256 targetValue,
        uint256 deadline
    );
    event BondClaimed(address indexed market, address indexed recipient, uint256 amount);
    event ParamsUpdated();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _intuition, address _feeCollector) {
        intuition    = IEthMultiVault(_intuition);
        feeCollector = _feeCollector;
        owner        = msg.sender;

        // Lit le curveId par défaut depuis le contrat Intuition
        (, uint256 _curveId) = IEthMultiVault(_intuition).getBondingCurveConfig();
        curveId = _curveId;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ─── Création ─────────────────────────────────────────────────────────────

    /// @param _conditionType  Type de condition (voir constantes Market.sol)
    /// @param _targetId       bytes32 termId de l'atom ou triple sur Intuition
    /// @param _targetValue    Seuil : wei pour TVL/PRICE, bps pour RATIO
    /// @param _deadline       Block number de résolution
    /// @param _lockBuffer     Blocks avant deadline où les paris sont fermés
    function createMarket(
        uint8   _conditionType,
        bytes32 _targetId,
        uint256 _targetValue,
        uint256 _deadline,
        uint256 _lockBuffer
    ) external payable returns (address) {
        require(msg.value >= creationBond,                 "Bond insuffisant");
        require(_deadline > block.number + _lockBuffer,    "Deadline trop courte");
        require(_lockBuffer < _deadline - block.number,    "Buffer trop grand");

        // Vérifie que le term existe sur Intuition
        require(intuition.isTermCreated(_targetId), "Term inconnu sur Intuition");

        uint256 lockTime = _deadline - _lockBuffer;

        Market market = new Market(
            address(intuition),
            msg.sender,
            _conditionType,
            _targetId,
            curveId,
            _targetValue,
            _deadline,
            lockTime,
            minVolume,
            protocolFeeBps,
            stakerDividendBps,
            resolverReward,
            feeCollector
        );

        address marketAddr = address(market);
        markets.push(marketAddr);
        isMarket[marketAddr]      = true;
        bondPerMarket[marketAddr] = msg.value;

        emit MarketCreated(marketAddr, msg.sender, _conditionType, _targetId, _targetValue, _deadline);

        return marketAddr;
    }

    // ─── Bond ─────────────────────────────────────────────────────────────────

    /// @notice Rembourse le bond au créateur si volume atteint, sinon au feeCollector.
    function claimBond(address _market) external {
        require(isMarket[_market],     "Marche inconnu");
        require(!bondClaimed[_market], "Bond deja claim");

        Market m = Market(payable(_market));
        require(m.resolved(), "Pas encore resolu");

        bondClaimed[_market] = true; // CEI avant transfer

        uint256 bond = bondPerMarket[_market];
        require(bond > 0, "Pas de bond");

        address recipient = m.totalPool() >= minVolume ? m.creator() : feeCollector;

        (bool _ok,) = payable(recipient).call{value: bond}(""); require(_ok, "Transfer failed");
        emit BondClaimed(_market, recipient, bond);
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    function setParams(
        uint256 _creationBond,
        uint256 _minVolume,
        uint256 _protocolFeeBps,
        uint256 _stakerDividendBps,
        uint256 _resolverReward
    ) external onlyOwner {
        require(_protocolFeeBps + _stakerDividendBps <= 3000, "Fees > 30%");
        creationBond      = _creationBond;
        minVolume         = _minVolume;
        protocolFeeBps    = _protocolFeeBps;
        stakerDividendBps = _stakerDividendBps;
        resolverReward    = _resolverReward;
        emit ParamsUpdated();
    }

    function setCurveId(uint256 _curveId) external onlyOwner {
        curveId = _curveId;
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Zero address");
        feeCollector = _feeCollector;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Zero address");
        owner = _newOwner;
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }

    function getMarkets(uint256 offset, uint256 limit)
        external view
        returns (address[] memory result)
    {
        uint256 end = offset + limit;
        if (end > markets.length) end = markets.length;
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = markets[i];
        }
    }
}
