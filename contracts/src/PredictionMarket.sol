// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IMultiVault} from "./interfaces/IMultiVault.sol";

/// @title PredictionMarket — parimutuel markets on Intuition TVL deltas
/// @notice Trustless v1 prediction market. Resolution reads totalAssets from
///         the Intuition MultiVault via view calls. No external oracle.
/// @dev    Design decisions are frozen in /home/samuel_chauche/predictuition/doc.md
contract PredictionMarket is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ─────────────────────────────────────────────────

    enum Side {
        Yes,
        No
    }

    enum Duration {
        Hour,
        Day,
        Month
    }

    struct Market {
        bytes32 termId;
        uint256 curveId;
        uint256 totalAssets0;
        uint64 createdAt;
        uint64 deadline;
        uint128 yesPool;
        uint128 noPool;
        Side winningSide;
        Duration duration;
        bool resolved;
        bool refunded;
    }

    // ─── Constants ─────────────────────────────────────────────

    uint256 public constant BET_LOCK = 10 minutes;
    uint256 public constant RESOLVE_GRACE = 15 minutes;
    uint256 public constant EMERGENCY_TIMEOUT = 7 days;
    uint256 public constant MAX_FEE_BPS = 500; // 5%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ─── Immutable ─────────────────────────────────────────────

    IMultiVault public immutable multiVault;
    uint256 public immutable defaultCurveId;

    // ─── Storage ───────────────────────────────────────────────

    address public keeper;
    address public feeRecipient;
    uint256 public feeBps = 300; // 3%

    uint128 public capHour = 50 ether;
    uint128 public capDay = 200 ether;
    uint128 public capMonth = 500 ether;

    uint256 public nextMarketId;
    mapping(uint256 marketId => Market) internal _markets;
    mapping(uint256 marketId => mapping(address user => mapping(Side => uint256))) internal _stakes;

    /// @notice Tracks the native TRUST owed to users and feeRecipient across all
    ///         unclaimed markets. Maintained as an invariant:
    ///         address(this).balance >= totalLocked at all times.
    ///         The owner can only rescue the delta (balance - totalLocked).
    uint256 public totalLocked;

    // ─── Events ────────────────────────────────────────────────

    event MarketCreated(
        uint256 indexed marketId,
        bytes32 indexed termId,
        uint256 curveId,
        Duration duration,
        uint256 totalAssets0,
        uint64 deadline
    );
    event BetPlaced(uint256 indexed marketId, address indexed user, Side side, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Side winningSide, uint256 totalAssets1);
    event MarketRefunded(uint256 indexed marketId, bytes32 reason);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout, uint256 fee);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event FeeUpdated(uint256 oldBps, uint256 newBps);
    event CapsUpdated(uint128 h, uint128 d, uint128 m);
    event NativeRescued(address indexed to, uint256 amount);
    event ERC20Rescued(address indexed token, address indexed to, uint256 amount);

    // ─── Errors ────────────────────────────────────────────────

    error NotKeeper();
    error DeadTerm();
    error BetLocked();
    error CapReached();
    error AlreadySettled();
    error NotSettled();
    error TooEarly();
    error NothingToClaim();
    error ZeroAddress();
    error FeeTooHigh();
    error InvalidDuration();
    error TransferFailed();
    error NoDustToRescue();
    error RescueAmountExceedsDust(uint256 available, uint256 requested);

    // ─── Modifiers ─────────────────────────────────────────────

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    // ─── Constructor ───────────────────────────────────────────

    constructor(
        IMultiVault _multiVault,
        address _owner,
        address _keeper,
        address _feeRecipient
    ) Ownable(_owner) {
        if (address(_multiVault) == address(0)) revert ZeroAddress();
        if (_keeper == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();

        multiVault = _multiVault;
        keeper = _keeper;
        feeRecipient = _feeRecipient;

        (, uint256 curveId) = _multiVault.bondingCurveConfig();
        defaultCurveId = curveId;
    }

    // ─── Keeper ────────────────────────────────────────────────

    /// @notice Create a new market on an Intuition term.
    /// @dev Snapshots totalAssets at T0. Anyone with a valid termId can be queried;
    ///      the keeper is responsible for off-chain curation (position_count >= 5).
    function createMarket(bytes32 termId, uint256 curveId, Duration d)
        external
        onlyKeeper
        whenNotPaused
        returns (uint256 marketId)
    {
        (uint256 totalAssets0, ) = multiVault.getVault(termId, curveId);
        if (totalAssets0 == 0) revert DeadTerm();

        uint64 nowTs = uint64(block.timestamp);
        uint64 deadline = nowTs + uint64(_durationSeconds(d));

        marketId = nextMarketId++;
        _markets[marketId] = Market({
            termId: termId,
            curveId: curveId,
            totalAssets0: totalAssets0,
            createdAt: nowTs,
            deadline: deadline,
            yesPool: 0,
            noPool: 0,
            winningSide: Side.Yes,
            duration: d,
            resolved: false,
            refunded: false
        });

        emit MarketCreated(marketId, termId, curveId, d, totalAssets0, deadline);
    }

    // ─── User: bet ─────────────────────────────────────────────

    function bet(uint256 marketId, Side side) external payable whenNotPaused nonReentrant {
        Market storage m = _markets[marketId];
        if (m.resolved || m.refunded) revert AlreadySettled();
        if (m.deadline == 0) revert AlreadySettled(); // unknown marketId
        if (block.timestamp > m.deadline - BET_LOCK) revert BetLocked();

        uint128 cap = _capFor(m.duration);
        uint256 newTotal = uint256(m.yesPool) + uint256(m.noPool) + msg.value;
        if (newTotal > cap) revert CapReached();

        if (side == Side.Yes) {
            m.yesPool += uint128(msg.value);
        } else {
            m.noPool += uint128(msg.value);
        }
        _stakes[marketId][msg.sender][side] += msg.value;
        totalLocked += msg.value;

        emit BetPlaced(marketId, msg.sender, side, msg.value);
    }

    // ─── Resolution (permissionless) ───────────────────────────

    /// @notice Anyone can call after deadline + grace. Reads MultiVault TVL
    ///         and determines winning side. Tie or empty-side → refund mode.
    function resolve(uint256 marketId) external whenNotPaused {
        Market storage m = _markets[marketId];
        if (m.resolved || m.refunded) revert AlreadySettled();
        if (m.deadline == 0) revert AlreadySettled();
        if (block.timestamp < uint256(m.deadline) + RESOLVE_GRACE) revert TooEarly();

        // Empty side → refund
        if (m.yesPool == 0 || m.noPool == 0) {
            m.refunded = true;
            emit MarketRefunded(marketId, "EMPTY_SIDE");
            return;
        }

        (uint256 totalAssets1, ) = multiVault.getVault(m.termId, m.curveId);

        if (totalAssets1 == m.totalAssets0) {
            m.refunded = true;
            emit MarketRefunded(marketId, "TIE");
            return;
        }

        m.winningSide = totalAssets1 > m.totalAssets0 ? Side.Yes : Side.No;
        m.resolved = true;
        emit MarketResolved(marketId, m.winningSide, totalAssets1);
    }

    // ─── User: claim ───────────────────────────────────────────

    function claim(uint256 marketId) external nonReentrant {
        Market storage m = _markets[marketId];
        if (!m.resolved && !m.refunded) revert NotSettled();

        uint256 payout;
        uint256 fee;

        if (m.refunded) {
            uint256 yesStake = _stakes[marketId][msg.sender][Side.Yes];
            uint256 noStake = _stakes[marketId][msg.sender][Side.No];
            payout = yesStake + noStake;
            if (payout == 0) revert NothingToClaim();
            _stakes[marketId][msg.sender][Side.Yes] = 0;
            _stakes[marketId][msg.sender][Side.No] = 0;
        } else {
            Side winning = m.winningSide;
            uint256 userStake = _stakes[marketId][msg.sender][winning];
            if (userStake == 0) revert NothingToClaim();
            _stakes[marketId][msg.sender][winning] = 0;

            uint256 totalPool = uint256(m.yesPool) + uint256(m.noPool);
            uint256 winningPool = winning == Side.Yes ? m.yesPool : m.noPool;
            uint256 grossPayout = (userStake * totalPool) / winningPool;
            uint256 profit = grossPayout - userStake;
            fee = (profit * feeBps) / BPS_DENOMINATOR;
            payout = grossPayout - fee;
        }

        // Effects before interactions: decrement locked invariant first.
        totalLocked -= (payout + fee);

        _sendNative(msg.sender, payout);
        if (fee > 0) _sendNative(feeRecipient, fee);

        emit Claimed(marketId, msg.sender, payout, fee);
    }

    // ─── Owner: emergency + admin ──────────────────────────────

    /// @notice Owner can mark a market as refunded in exceptional cases:
    ///         MultiVault upgrade broke getVault, term invalidated, or
    ///         resolve() never called after EMERGENCY_TIMEOUT.
    ///         Does NOT allow forcing a winning side, seizing funds, or
    ///         selectively refunding users.
    function emergencyRefund(uint256 marketId) external onlyOwner {
        Market storage m = _markets[marketId];
        if (m.resolved || m.refunded) revert AlreadySettled();
        if (m.deadline == 0) revert AlreadySettled();
        m.refunded = true;
        emit MarketRefunded(marketId, "EMERGENCY");
    }

    function setKeeper(address newKeeper) external onlyOwner {
        if (newKeeper == address(0)) revert ZeroAddress();
        emit KeeperUpdated(keeper, newKeeper);
        keeper = newKeeper;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    function setFee(uint256 newBps) external onlyOwner {
        if (newBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit FeeUpdated(feeBps, newBps);
        feeBps = newBps;
    }

    function setCaps(uint128 h, uint128 d, uint128 mo) external onlyOwner {
        capHour = h;
        capDay = d;
        capMonth = mo;
        emit CapsUpdated(h, d, mo);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Owner: rescue dust ────────────────────────────────────

    /// @notice Rescue native TRUST sent to the contract outside the normal bet flow.
    /// @dev    Direct transfers via `receive()` are already rejected, so the only
    ///         way native TRUST can appear unexpectedly is via SELFDESTRUCT from
    ///         another contract (EIP-6780: still possible same-tx as creation),
    ///         or via pre-funded CREATE2 addresses. The rescuable amount is
    ///         strictly `balance - totalLocked` — funds owed to parieurs or
    ///         the feeRecipient CANNOT be touched.
    /// @param  to Recipient of the rescued dust (typically owner / treasury).
    /// @param  amount Amount to rescue. Pass `type(uint256).max` to rescue all dust.
    function rescueNative(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = address(this).balance;
        uint256 locked = totalLocked;
        uint256 dust = balance > locked ? balance - locked : 0;
        if (dust == 0) revert NoDustToRescue();

        uint256 toSend = amount == type(uint256).max ? dust : amount;
        if (toSend > dust) revert RescueAmountExceedsDust(dust, toSend);

        _sendNative(to, toSend);
        emit NativeRescued(to, toSend);
    }

    /// @notice Rescue any ERC20 tokens mistakenly sent to this contract.
    /// @dev    The PM contract never expects to hold ERC20 — TRUST is the native
    ///         gas token. Any ERC20 balance is 100% rescuable. This is a pure
    ///         recovery path for user mistakes (approve-and-transfer-wrong-addr).
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0) || token == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit ERC20Rescued(token, to, amount);
    }

    // ─── Views ─────────────────────────────────────────────────

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _markets[marketId];
    }

    function getUserStake(uint256 marketId, address user, Side side) external view returns (uint256) {
        return _stakes[marketId][user][side];
    }

    /// @notice Estimates the net payout for `amount` on `side`, assuming no
    ///         further bets are placed and `side` wins. Not a guarantee.
    function getPayoutQuote(uint256 marketId, Side side, uint256 amount)
        external
        view
        returns (uint256)
    {
        Market memory m = _markets[marketId];
        if (m.deadline == 0 || amount == 0) return 0;

        uint256 newSidePool = (side == Side.Yes ? uint256(m.yesPool) : uint256(m.noPool)) + amount;
        uint256 otherPool = side == Side.Yes ? uint256(m.noPool) : uint256(m.yesPool);
        if (otherPool == 0) return amount; // refund case
        uint256 newTotal = newSidePool + otherPool;
        uint256 grossPayout = (amount * newTotal) / newSidePool;
        uint256 profit = grossPayout - amount;
        uint256 fee = (profit * feeBps) / BPS_DENOMINATOR;
        return grossPayout - fee;
    }

    function capFor(Duration d) external view returns (uint128) {
        return _capFor(d);
    }

    // ─── Internals ─────────────────────────────────────────────

    function _capFor(Duration d) internal view returns (uint128) {
        if (d == Duration.Hour) return capHour;
        if (d == Duration.Day) return capDay;
        if (d == Duration.Month) return capMonth;
        revert InvalidDuration();
    }

    function _durationSeconds(Duration d) internal pure returns (uint256) {
        if (d == Duration.Hour) return 1 hours;
        if (d == Duration.Day) return 1 days;
        if (d == Duration.Month) return 30 days;
        revert InvalidDuration();
    }

    function _sendNative(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {
        revert("direct transfer disabled");
    }
}
