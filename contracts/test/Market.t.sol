// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Market} from "../src/Market.sol";
import {IEthMultiVault} from "../src/IEthMultiVault.sol";

// ─── Mock ─────────────────────────────────────────────────────────────────────

contract MockMultiVault is IEthMultiVault {
    bytes32 public counterId = bytes32(uint256(999));

    uint256 public vaultAssets;
    uint256 public vaultShares;
    uint256 public counterAssets;
    uint256 public counterShares;
    uint256 public mockSharePrice;

    function setVault(uint256 _assets, uint256 _shares) external {
        vaultAssets = _assets;
        vaultShares = _shares;
    }

    function setCounter(uint256 _assets, uint256 _shares) external {
        counterAssets = _assets;
        counterShares = _shares;
    }

    function setSharePrice(uint256 _price) external { mockSharePrice = _price; }

    function getVault(bytes32 termId, uint256) external view override returns (uint256, uint256) {
        if (termId == counterId) return (counterAssets, counterShares);
        return (vaultAssets, vaultShares);
    }

    function currentSharePrice(bytes32, uint256) external view override returns (uint256) {
        return mockSharePrice;
    }

    function getShares(address, bytes32, uint256) external pure override returns (uint256) {
        return 0;
    }

    function getTriple(bytes32) external pure override returns (bytes32, bytes32, bytes32) {
        return (bytes32(0), bytes32(0), bytes32(0));
    }

    function getCounterIdFromTripleId(bytes32) external view override returns (bytes32) {
        return counterId;
    }

    function isTriple(bytes32) external pure override returns (bool) { return false; }

    function getBondingCurveConfig() external pure override returns (address, uint256) {
        return (address(0), 1);
    }

    function isTermCreated(bytes32) external pure override returns (bool) { return true; }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

contract MarketTest is Test {
    receive() external payable {}

    event BetPlaced(address indexed user, bool side, uint256 amount);
    event MarketResolved(bool outcome, uint256 pool, uint256 resolverPay);
    event Claimed(address indexed user, uint256 payout);
    event Refunded(address indexed user, uint256 amount);

    MockMultiVault public vault;
    Market public market;

    address public alice       = makeAddr("alice");
    address public bob         = makeAddr("bob");
    address public carol       = makeAddr("carol");
    address public feeCollector = makeAddr("feeCollector");
    address public resolver    = makeAddr("resolver");

    bytes32 constant TARGET_ID = bytes32(uint256(42));
    uint256 constant CURVE_ID  = 1;

    uint256 constant MIN_VOLUME       = 0.5 ether;
    uint256 constant PROTOCOL_FEE_BPS = 100;   // 1%
    uint256 constant RESOLVER_REWARD  = 0.005 ether;
    uint256 constant TARGET_VALUE     = 1 ether;

    uint8 constant TVL_ABOVE    = 1;
    uint8 constant TVL_BELOW    = 2;
    uint8 constant PRICE_ABOVE  = 3;
    uint8 constant PRICE_BELOW  = 4;
    uint8 constant TRIPLE_RATIO = 5;
    uint8 constant TRIPLE_FLIP  = 6;

    uint256 constant LOCK_TS     = 101;
    uint256 constant DEADLINE_TS = 201;

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _makeMarket(uint8 conditionType, uint256 targetValue) internal returns (Market) {
        return new Market(
            address(vault),
            address(this),
            conditionType,
            TARGET_ID,
            CURVE_ID,
            targetValue,
            DEADLINE_TS,
            LOCK_TS,
            MIN_VOLUME,
            PROTOCOL_FEE_BPS,
            RESOLVER_REWARD,
            feeCollector
        );
    }

    function _resolveWith(Market m, bool vaultAboveTarget) internal {
        vm.prank(alice); m.bet{value: 2 ether}(true);
        vm.prank(bob);   m.bet{value: 2 ether}(false);

        vault.setVault(vaultAboveTarget ? 2 ether : 0.5 ether, 1000e18);
        vm.warp(DEADLINE_TS);
        vm.prank(resolver);
        m.resolve();
    }

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        vault = new MockMultiVault();
        vault.setVault(2 ether, 1000e18);
        vault.setSharePrice(1 ether);

        market = _makeMarket(TVL_ABOVE, TARGET_VALUE);

        vm.deal(alice,    10 ether);
        vm.deal(bob,      10 ether);
        vm.deal(carol,    10 ether);
        vm.deal(resolver, 1 ether);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Betting
    // ══════════════════════════════════════════════════════════════════════════

    function test_BetYesUpdatesPoolAndShares() public {
        vm.prank(alice);
        market.bet{value: 1 ether}(true);

        assertEq(market.poolYes(), 1 ether);
        assertEq(market.sharesYes(alice), 1 ether);
        assertEq(market.poolNo(), 0);
    }

    function test_BetNoUpdatesPoolAndShares() public {
        vm.prank(bob);
        market.bet{value: 0.5 ether}(false);

        assertEq(market.poolNo(), 0.5 ether);
        assertEq(market.sharesNo(bob), 0.5 ether);
    }

    function test_MultipleBetsAccumulate() public {
        vm.prank(alice); market.bet{value: 1 ether}(true);
        vm.prank(alice); market.bet{value: 0.5 ether}(true);

        assertEq(market.sharesYes(alice), 1.5 ether);
        assertEq(market.poolYes(), 1.5 ether);
    }

    function test_BetBothSidesTrackedSeparately() public {
        vm.prank(alice); market.bet{value: 1 ether}(true);
        vm.prank(alice); market.bet{value: 0.5 ether}(false);

        assertEq(market.sharesYes(alice), 1 ether);
        assertEq(market.sharesNo(alice), 0.5 ether);
        assertEq(market.totalPool(), 1.5 ether);
    }

    function test_BetEmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit BetPlaced(alice, true, 1 ether);

        vm.prank(alice);
        market.bet{value: 1 ether}(true);
    }

    function test_RevertWhen_BetAtLockTime() public {
        vm.warp(LOCK_TS);
        vm.prank(alice);
        vm.expectRevert("Marche verrouille");
        market.bet{value: 1 ether}(true);
    }

    function test_RevertWhen_BetZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("Montant nul");
        market.bet{value: 0}(true);
    }

    function test_RevertWhen_BetAfterResolved() public {
        _resolveWith(market, true);

        vm.prank(carol);
        vm.expectRevert("Marche verrouille");
        market.bet{value: 1 ether}(true);
    }

    function test_RevertWhen_BetInRefundMode() public {
        vm.prank(alice); market.bet{value: 0.1 ether}(true);
        vm.warp(DEADLINE_TS);
        market.resolve();

        vm.prank(carol);
        vm.expectRevert("Marche verrouille");
        market.bet{value: 1 ether}(true);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Odds
    // ══════════════════════════════════════════════════════════════════════════

    function test_Odds50WhenNoPool() public view {
        assertEq(market.oddsYesBps(), 5000);
    }

    function test_Odds75WhenYesIsThreeFourths() public {
        vm.prank(alice); market.bet{value: 3 ether}(true);
        vm.prank(bob);   market.bet{value: 1 ether}(false);

        assertEq(market.oddsYesBps(), 7500);
    }

    function test_Odds100WhenAllBetsYes() public {
        vm.prank(alice); market.bet{value: 1 ether}(true);

        assertEq(market.oddsYesBps(), 10000);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Resolution — condition types
    // ══════════════════════════════════════════════════════════════════════════

    function test_ResolveTvlAboveTrue() public {
        vm.prank(alice); market.bet{value: 1 ether}(true);
        vm.prank(bob);   market.bet{value: 1 ether}(false);

        vault.setVault(2 ether, 1000e18);
        vm.warp(DEADLINE_TS);
        market.resolve();

        assertTrue(market.resolved());
        assertTrue(market.outcome());
    }

    function test_ResolveTvlAboveFalse() public {
        vm.prank(alice); market.bet{value: 1 ether}(true);
        vm.prank(bob);   market.bet{value: 1 ether}(false);

        vault.setVault(0.5 ether, 1000e18);
        vm.warp(DEADLINE_TS);
        market.resolve();

        assertTrue(market.resolved());
        assertFalse(market.outcome());
    }

    function test_ResolveTvlBelowTrue() public {
        Market m = _makeMarket(TVL_BELOW, 1 ether);
        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setVault(0.5 ether, 1000e18);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertTrue(m.outcome());
    }

    function test_ResolveTvlBelowFalse() public {
        Market m = _makeMarket(TVL_BELOW, 1 ether);
        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setVault(2 ether, 1000e18);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertFalse(m.outcome());
    }

    function test_ResolvePriceAboveTrue() public {
        Market m = _makeMarket(PRICE_ABOVE, 1 ether);
        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setSharePrice(2 ether);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertTrue(m.outcome());
    }

    function test_ResolvePriceAboveFalse() public {
        Market m = _makeMarket(PRICE_ABOVE, 1 ether);
        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setSharePrice(0.5 ether);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertFalse(m.outcome());
    }

    function test_ResolvePriceBelowTrue() public {
        Market m = _makeMarket(PRICE_BELOW, 1 ether);
        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setSharePrice(0.5 ether);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertTrue(m.outcome());
    }

    function test_ResolveTripleRatioTrue() public {
        Market m = _makeMarket(TRIPLE_RATIO, 7500);
        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setVault(3 ether, 1000e18);
        vault.setCounter(1 ether, 100e18);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertTrue(m.outcome());
    }

    function test_ResolveTripleRatioFalse() public {
        Market m = _makeMarket(TRIPLE_RATIO, 7500);
        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setVault(1 ether, 1000e18);
        vault.setCounter(1 ether, 100e18);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertFalse(m.outcome());
    }

    function test_ResolveTripleRatioReturnsFalseWhenTotalZero() public {
        Market m = _makeMarket(TRIPLE_RATIO, 7500);
        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setVault(0, 0);
        vault.setCounter(0, 0);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertFalse(m.outcome());
    }

    function test_ResolveTripleFlipTrue() public {
        vault.setVault(2 ether, 1000e18);
        vault.setCounter(1 ether, 100e18);

        Market m = new Market(
            address(vault), address(this), TRIPLE_FLIP,
            TARGET_ID, CURVE_ID, 0,
            DEADLINE_TS, LOCK_TS, MIN_VOLUME,
            PROTOCOL_FEE_BPS, RESOLVER_REWARD, feeCollector
        );

        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setVault(0.5 ether, 1000e18);
        vault.setCounter(2 ether, 100e18);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertTrue(m.outcome());
    }

    function test_ResolveTripleFlipFalseWhenNoFlip() public {
        vault.setVault(2 ether, 1000e18);
        vault.setCounter(1 ether, 100e18);

        Market m = new Market(
            address(vault), address(this), TRIPLE_FLIP,
            TARGET_ID, CURVE_ID, 0,
            DEADLINE_TS, LOCK_TS, MIN_VOLUME,
            PROTOCOL_FEE_BPS, RESOLVER_REWARD, feeCollector
        );

        vm.prank(alice); m.bet{value: 1 ether}(true);
        vm.prank(bob);   m.bet{value: 1 ether}(false);

        vault.setVault(3 ether, 1000e18);
        vault.setCounter(1 ether, 100e18);
        vm.warp(DEADLINE_TS);
        m.resolve();

        assertFalse(m.outcome());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Resolution — reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_RevertWhen_ResolveTooEarly() public {
        vm.expectRevert("Trop tot");
        market.resolve();
    }

    function test_RevertWhen_ResolveAlreadyResolved() public {
        _resolveWith(market, true);

        vm.expectRevert("Deja resolu");
        market.resolve();
    }

    function test_RevertWhen_ResolveInRefundMode() public {
        vm.prank(alice); market.bet{value: 0.1 ether}(true);
        vm.warp(DEADLINE_TS);
        market.resolve();

        vm.expectRevert("Mode remboursement");
        market.resolve();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Resolution — fee distribution
    // ══════════════════════════════════════════════════════════════════════════

    function test_ResolveDistributesFees() public {
        vm.prank(alice); market.bet{value: 2 ether}(true);
        vm.prank(bob);   market.bet{value: 2 ether}(false);
        // pool = 4 ether

        uint256 fcBefore  = feeCollector.balance;
        uint256 resBefore = resolver.balance;

        vault.setVault(2 ether, 1000e18);
        vm.warp(DEADLINE_TS);
        vm.prank(resolver);
        market.resolve();

        uint256 pool              = 4 ether;
        uint256 expectedFee       = (pool * PROTOCOL_FEE_BPS) / 10000; // 0.04 ether
        uint256 expectedReward    = RESOLVER_REWARD;                    // 0.005 ether
        uint256 expectedRemaining = pool - expectedFee - expectedReward;

        assertEq(feeCollector.balance - fcBefore, expectedFee,       "protocolFee");
        assertEq(resolver.balance - resBefore,    expectedReward,    "resolverReward");
        assertEq(market.remainingPoolAfterFees(),  expectedRemaining, "remaining");
    }

    function test_ResolveActivatesRefundWhenVolumeLow() public {
        vm.prank(alice); market.bet{value: 0.1 ether}(true);

        vm.warp(DEADLINE_TS);
        market.resolve();

        assertTrue(market.refundMode());
        assertFalse(market.resolved());
    }

    function test_ResolveEmitsEvent() public {
        vm.prank(alice); market.bet{value: 1 ether}(true);
        vm.prank(bob);   market.bet{value: 1 ether}(false);

        vault.setVault(2 ether, 1000e18);
        vm.warp(DEADLINE_TS);

        vm.expectEmit(false, false, false, true);
        emit MarketResolved(true, 2 ether, RESOLVER_REWARD);
        market.resolve();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Claim
    // ══════════════════════════════════════════════════════════════════════════

    function test_ClaimSoleYesWinnerGetsFullRemaining() public {
        _resolveWith(market, true);

        uint256 remaining = market.remainingPoolAfterFees();
        uint256 before = alice.balance;
        vm.prank(alice);
        market.claim();

        assertEq(alice.balance - before, remaining);
    }

    function test_ClaimProportionalToShares() public {
        vm.prank(alice); market.bet{value: 1 ether}(true);
        vm.prank(carol); market.bet{value: 3 ether}(true);
        vm.prank(bob);   market.bet{value: 2 ether}(false);

        vault.setVault(2 ether, 1000e18);
        vm.warp(DEADLINE_TS);
        market.resolve();

        uint256 remaining = market.remainingPoolAfterFees();
        uint256 poolYes   = market.poolYes();

        uint256 aliceBefore = alice.balance;
        uint256 carolBefore = carol.balance;

        vm.prank(alice); market.claim();
        vm.prank(carol); market.claim();

        assertEq(alice.balance - aliceBefore, (1 ether * remaining) / poolYes);
        assertEq(carol.balance - carolBefore, (3 ether * remaining) / poolYes);
    }

    function test_RevertWhen_ClaimBeforeResolved() public {
        vm.prank(alice);
        vm.expectRevert("Pas resolu");
        market.claim();
    }

    function test_RevertWhen_ClaimTwice() public {
        _resolveWith(market, true);

        vm.startPrank(alice);
        market.claim();
        vm.expectRevert("Deja claim");
        market.claim();
        vm.stopPrank();
    }

    function test_RevertWhen_ClaimLosingShares() public {
        _resolveWith(market, true);

        vm.prank(bob);
        vm.expectRevert("Rien a claim");
        market.claim();
    }

    function test_ClaimEmitsEvent() public {
        _resolveWith(market, true);

        vm.expectEmit(true, false, false, false);
        emit Claimed(alice, 0);
        vm.prank(alice);
        market.claim();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Emergency refund
    // ══════════════════════════════════════════════════════════════════════════

    function test_EmergencyRefundReturnsFullBet() public {
        vm.prank(alice); market.bet{value: 0.2 ether}(true);
        vm.prank(alice); market.bet{value: 0.1 ether}(false);

        uint256 before = alice.balance;
        vm.warp(DEADLINE_TS);
        vm.prank(alice);
        market.emergencyRefund();

        assertEq(alice.balance - before, 0.3 ether);
    }

    function test_EmergencyRefundClearsShares() public {
        vm.prank(alice); market.bet{value: 0.2 ether}(true);
        vm.prank(alice); market.bet{value: 0.1 ether}(false);

        vm.warp(DEADLINE_TS);
        vm.prank(alice);
        market.emergencyRefund();

        assertEq(market.sharesYes(alice), 0);
        assertEq(market.sharesNo(alice), 0);
    }

    function test_EmergencyRefundSetsRefundMode() public {
        vm.prank(alice); market.bet{value: 0.1 ether}(true);

        vm.warp(DEADLINE_TS);
        vm.prank(alice);
        market.emergencyRefund();

        assertTrue(market.refundMode());
    }

    function test_RevertWhen_EmergencyRefundTooEarly() public {
        vm.prank(alice); market.bet{value: 0.1 ether}(true);

        vm.prank(alice);
        vm.expectRevert("Trop tot");
        market.emergencyRefund();
    }

    function test_RevertWhen_EmergencyRefundWhenAlreadyResolved() public {
        _resolveWith(market, true);

        vm.prank(alice);
        vm.expectRevert("Deja resolu");
        market.emergencyRefund();
    }

    function test_RevertWhen_EmergencyRefundWhenVolumeSufficient() public {
        vm.prank(alice); market.bet{value: 1 ether}(true);
        vm.prank(bob);   market.bet{value: 1 ether}(false);

        vm.warp(DEADLINE_TS);
        vm.prank(alice);
        vm.expectRevert("Volume suffisant, appelle resolve()");
        market.emergencyRefund();
    }

    function test_EmergencyRefundEmitsEvent() public {
        vm.prank(alice); market.bet{value: 0.2 ether}(true);

        vm.warp(DEADLINE_TS);
        vm.expectEmit(true, false, false, true);
        emit Refunded(alice, 0.2 ether);

        vm.prank(alice);
        market.emergencyRefund();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Receive guard
    // ══════════════════════════════════════════════════════════════════════════

    function test_ReceiveRejectsEthAfterResolved() public {
        _resolveWith(market, true);

        vm.prank(carol);
        (bool ok,) = address(market).call{value: 0.1 ether}("");
        assertFalse(ok);
    }

    function test_ReceiveRejectsEthInRefundMode() public {
        vm.prank(alice); market.bet{value: 0.1 ether}(true);
        vm.warp(DEADLINE_TS);
        market.resolve();

        vm.prank(carol);
        (bool ok,) = address(market).call{value: 0.1 ether}("");
        assertFalse(ok);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Constructor guards
    // ══════════════════════════════════════════════════════════════════════════

    function test_RevertWhen_DeadlineNotAfterLockTime() public {
        vm.expectRevert("Deadline <= lockTime");
        new Market(
            address(vault), address(this), TVL_ABOVE, TARGET_ID, CURVE_ID, TARGET_VALUE,
            LOCK_TS, LOCK_TS,
            MIN_VOLUME, PROTOCOL_FEE_BPS, RESOLVER_REWARD, feeCollector
        );
    }

    function test_RevertWhen_LockTimeInPast() public {
        vm.warp(150);

        vm.expectRevert("LockTime dans le passe");
        new Market(
            address(vault), address(this), TVL_ABOVE, TARGET_ID, CURVE_ID, TARGET_VALUE,
            300, 100,
            MIN_VOLUME, PROTOCOL_FEE_BPS, RESOLVER_REWARD, feeCollector
        );
    }

    function test_RevertWhen_FeeExceeds30Percent() public {
        vm.expectRevert("Fee > 30%");
        new Market(
            address(vault), address(this), TVL_ABOVE, TARGET_ID, CURVE_ID, TARGET_VALUE,
            DEADLINE_TS, LOCK_TS, MIN_VOLUME,
            3001, // 30.01%
            RESOLVER_REWARD, feeCollector
        );
    }

    function test_RevertWhen_InvalidConditionType() public {
        vm.expectRevert("ConditionType invalide");
        new Market(
            address(vault), address(this),
            7, TARGET_ID, CURVE_ID, TARGET_VALUE,
            DEADLINE_TS, LOCK_TS, MIN_VOLUME,
            PROTOCOL_FEE_BPS, RESOLVER_REWARD, feeCollector
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Fuzz
    // ══════════════════════════════════════════════════════════════════════════

    function testFuzz_BetPoolConsistency(uint96 yesAmt, uint96 noAmt) public {
        vm.assume(yesAmt > 0);
        vm.assume(noAmt > 0);

        vm.deal(alice, uint256(yesAmt) + uint256(noAmt));
        vm.prank(alice); market.bet{value: yesAmt}(true);
        vm.prank(alice); market.bet{value: noAmt}(false);

        assertEq(market.totalPool(), uint256(yesAmt) + uint256(noAmt));
        assertEq(market.sharesYes(alice), yesAmt);
        assertEq(market.sharesNo(alice), noAmt);
    }

    function testFuzz_PayoutsSumDoesNotExceedRemaining(uint96 amt1, uint96 amt2) public {
        uint256 a = bound(uint256(amt1), 1, 10 ether);
        uint256 b = bound(uint256(amt2), 1, 10 ether);

        vm.deal(alice, a);
        vm.deal(carol, b);
        vm.deal(bob, 1 ether);

        vm.prank(alice); market.bet{value: a}(true);
        vm.prank(carol); market.bet{value: b}(true);
        vm.prank(bob);   market.bet{value: 1 ether}(false);

        vault.setVault(2 ether, 1000e18);
        vm.warp(DEADLINE_TS);
        market.resolve();

        uint256 remaining = market.remainingPoolAfterFees();
        uint256 poolYes   = market.poolYes();

        uint256 payA = (a * remaining) / poolYes;
        uint256 payB = (b * remaining) / poolYes;

        assertLe(payA + payB, remaining, "payouts exceed remaining");
    }

    function testFuzz_FeeInvariant(uint96 rawPool, uint16 feeBps) public {
        uint256 pool   = bound(uint256(rawPool), MIN_VOLUME, 100 ether);
        uint256 fBps   = bound(uint256(feeBps), 0, 3000);
        uint256 reward = RESOLVER_REWARD;

        uint256 fee = (pool * fBps) / 10000;

        if (pool > fee + reward) {
            uint256 remaining = pool - fee - reward;
            assertEq(fee + reward + remaining, pool);
        }
    }
}
