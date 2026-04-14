// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {IMultiVault} from "../src/interfaces/IMultiVault.sol";
import {MockMultiVault} from "./mocks/MockMultiVault.sol";

contract PredictionMarketTest is Test {
    PredictionMarket pm;
    MockMultiVault mv;

    // Avoid addresses < 0x100 (precompile range)
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address feeRecipient = makeAddr("feeRecipient");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    bytes32 constant TERM = bytes32(uint256(0xA70));
    bytes32 constant TERM2 = bytes32(uint256(0xA71));

    function setUp() public {
        mv = new MockMultiVault();
        pm = new PredictionMarket(IMultiVault(address(mv)), owner, keeper, feeRecipient);

        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(carol, 1000 ether);
    }

    // ─── Helpers ───────────────────────────────────────────────

    function _createHourMarket(bytes32 term, uint256 tvl0) internal returns (uint256 id) {
        mv.setVault(term, 1, tvl0, tvl0 / 2);
        vm.prank(keeper);
        id = pm.createMarket(term, 1, PredictionMarket.Duration.Hour);
    }

    // ─── Constructor ───────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(address(pm.multiVault()), address(mv));
        assertEq(pm.defaultCurveId(), 1);
        assertEq(pm.owner(), owner);
        assertEq(pm.keeper(), keeper);
        assertEq(pm.feeRecipient(), feeRecipient);
        assertEq(pm.feeBps(), 300);
        assertEq(pm.capHour(), 50 ether);
        assertEq(pm.capDay(), 200 ether);
        assertEq(pm.capMonth(), 500 ether);
    }

    function test_constructor_revertsOnZeroAddresses() public {
        vm.expectRevert(PredictionMarket.ZeroAddress.selector);
        new PredictionMarket(IMultiVault(address(0)), owner, keeper, feeRecipient);

        vm.expectRevert(PredictionMarket.ZeroAddress.selector);
        new PredictionMarket(IMultiVault(address(mv)), owner, address(0), feeRecipient);

        vm.expectRevert(PredictionMarket.ZeroAddress.selector);
        new PredictionMarket(IMultiVault(address(mv)), owner, keeper, address(0));
    }

    // ─── createMarket ──────────────────────────────────────────

    function test_createMarket_onlyKeeper() public {
        mv.setVault(TERM, 1, 100 ether, 50 ether);
        vm.expectRevert(PredictionMarket.NotKeeper.selector);
        vm.prank(alice);
        pm.createMarket(TERM, 1, PredictionMarket.Duration.Hour);
    }

    function test_createMarket_revertsOnDeadTerm() public {
        vm.prank(keeper);
        vm.expectRevert(PredictionMarket.DeadTerm.selector);
        pm.createMarket(TERM, 1, PredictionMarket.Duration.Hour);
    }

    function test_createMarket_storesSnapshot() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        PredictionMarket.Market memory m = pm.getMarket(id);
        assertEq(m.termId, TERM);
        assertEq(m.curveId, 1);
        assertEq(m.totalAssets0, 100 ether);
        assertEq(m.deadline, uint64(block.timestamp + 1 hours));
        assertEq(m.yesPool, 0);
        assertEq(m.noPool, 0);
        assertFalse(m.resolved);
        assertFalse(m.refunded);
    }

    function test_createMarket_whenPausedReverts() public {
        mv.setVault(TERM, 1, 100 ether, 50 ether);
        vm.prank(owner);
        pm.pause();
        vm.prank(keeper);
        vm.expectRevert();
        pm.createMarket(TERM, 1, PredictionMarket.Duration.Hour);
    }

    // ─── bet ───────────────────────────────────────────────────

    function test_bet_happyPath() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);

        assertEq(pm.getUserStake(id, alice, PredictionMarket.Side.Yes), 10 ether);
        assertEq(pm.totalLocked(), 10 ether);
        PredictionMarket.Market memory m = pm.getMarket(id);
        assertEq(m.yesPool, 10 ether);
        assertEq(m.noPool, 0);
    }

    function test_bet_accumulates() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 5 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(alice);
        pm.bet{value: 3 ether}(id, PredictionMarket.Side.Yes);
        assertEq(pm.getUserStake(id, alice, PredictionMarket.Side.Yes), 8 ether);
    }

    function test_bet_revertsIfBetLocked() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        // Move to just inside the 10-min lock before deadline
        vm.warp(block.timestamp + 1 hours - 9 minutes);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.BetLocked.selector);
        pm.bet{value: 1 ether}(id, PredictionMarket.Side.Yes);
    }

    function test_bet_revertsIfCapExceeded() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 40 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        vm.expectRevert(PredictionMarket.CapReached.selector);
        pm.bet{value: 11 ether}(id, PredictionMarket.Side.No);
    }

    function test_bet_capExactBoundary() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 50 ether}(id, PredictionMarket.Side.Yes);
        // Any additional wei should revert
        vm.prank(bob);
        vm.expectRevert(PredictionMarket.CapReached.selector);
        pm.bet{value: 1}(id, PredictionMarket.Side.No);
    }

    function test_bet_revertsOnUnknownMarket() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.AlreadySettled.selector);
        pm.bet{value: 1 ether}(999, PredictionMarket.Side.Yes);
    }

    // ─── resolve ───────────────────────────────────────────────

    function test_resolve_revertsTooEarly() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);

        vm.expectRevert(PredictionMarket.TooEarly.selector);
        pm.resolve(id);

        // At deadline but before grace
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert(PredictionMarket.TooEarly.selector);
        pm.resolve(id);
    }

    function test_resolve_yesWins() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);

        // TVL goes up → YES wins
        mv.setVault(TERM, 1, 150 ether, 50 ether);
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        PredictionMarket.Market memory m = pm.getMarket(id);
        assertTrue(m.resolved);
        assertFalse(m.refunded);
        assertEq(uint8(m.winningSide), uint8(PredictionMarket.Side.Yes));
    }

    function test_resolve_noWins() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);

        mv.setVault(TERM, 1, 50 ether, 50 ether);
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        PredictionMarket.Market memory m = pm.getMarket(id);
        assertEq(uint8(m.winningSide), uint8(PredictionMarket.Side.No));
    }

    function test_resolve_tieRefunds() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);

        // TVL unchanged
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        PredictionMarket.Market memory m = pm.getMarket(id);
        assertFalse(m.resolved);
        assertTrue(m.refunded);
    }

    function test_resolve_emptySideRefunds() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        // nobody bets NO

        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        PredictionMarket.Market memory m = pm.getMarket(id);
        assertTrue(m.refunded);
    }

    function test_resolve_doubleResolveReverts() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);
        mv.setVault(TERM, 1, 150 ether, 50 ether);
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);
        vm.expectRevert(PredictionMarket.AlreadySettled.selector);
        pm.resolve(id);
    }

    // ─── claim ─────────────────────────────────────────────────

    function test_claim_winnerGets2xMinusFee() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);

        mv.setVault(TERM, 1, 150 ether, 50 ether);
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        uint256 aliceBefore = alice.balance;
        uint256 feeRecipBefore = feeRecipient.balance;

        vm.prank(alice);
        pm.claim(id);

        // Alice stakes 10, wins 10 from Bob. Gross payout = 20.
        // Profit = 10. Fee = 10 * 3% = 0.3. Net = 19.7.
        assertEq(alice.balance - aliceBefore, 19.7 ether);
        assertEq(feeRecipient.balance - feeRecipBefore, 0.3 ether);
        assertEq(pm.totalLocked(), 0);
    }

    function test_claim_loserGetsNothing() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);

        mv.setVault(TERM, 1, 150 ether, 50 ether);
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NothingToClaim.selector);
        pm.claim(id);
    }

    function test_claim_refundCase() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 7 ether}(id, PredictionMarket.Side.Yes);
        // Empty NO → refund

        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        uint256 before = alice.balance;
        vm.prank(alice);
        pm.claim(id);
        assertEq(alice.balance - before, 7 ether);
        assertEq(pm.totalLocked(), 0);
    }

    function test_claim_proportionalPayout() public {
        // Use a Day market (cap 200) so we can fit 60 total
        mv.setVault(TERM, 1, 100 ether, 50 ether);
        vm.prank(keeper);
        uint256 id = pm.createMarket(TERM, 1, PredictionMarket.Duration.Day);

        // Alice 30 YES, Carol 10 YES, Bob 20 NO
        vm.prank(alice);
        pm.bet{value: 30 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(carol);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 20 ether}(id, PredictionMarket.Side.No);

        mv.setVault(TERM, 1, 150 ether, 50 ether);
        vm.warp(block.timestamp + 1 days + 15 minutes + 1);
        pm.resolve(id);

        // totalPool = 60, winningPool = 40
        // Alice gross = 30 * 60 / 40 = 45, profit 15, fee 0.45, net 44.55
        // Carol gross = 10 * 60 / 40 = 15, profit  5, fee 0.15, net 14.85
        // Total payouts to users = 59.4, fees = 0.6, total drained = 60
        uint256 aliceBefore = alice.balance;
        uint256 carolBefore = carol.balance;
        uint256 feeBefore = feeRecipient.balance;

        vm.prank(alice);
        pm.claim(id);
        vm.prank(carol);
        pm.claim(id);

        assertEq(alice.balance - aliceBefore, 44.55 ether);
        assertEq(carol.balance - carolBefore, 14.85 ether);
        assertEq(feeRecipient.balance - feeBefore, 0.6 ether);
        assertEq(pm.totalLocked(), 0);
    }

    function test_claim_doubleClaimReverts() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);
        mv.setVault(TERM, 1, 150 ether, 50 ether);
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        vm.prank(alice);
        pm.claim(id);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NothingToClaim.selector);
        pm.claim(id);
    }

    // ─── emergency / admin ─────────────────────────────────────

    function test_emergencyRefund_onlyOwner() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        vm.expectRevert();
        pm.emergencyRefund(id);
    }

    function test_emergencyRefund_allowsClaim() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 5 ether}(id, PredictionMarket.Side.No);

        vm.prank(owner);
        pm.emergencyRefund(id);

        uint256 aBefore = alice.balance;
        uint256 bBefore = bob.balance;
        vm.prank(alice);
        pm.claim(id);
        vm.prank(bob);
        pm.claim(id);
        assertEq(alice.balance - aBefore, 10 ether);
        assertEq(bob.balance - bBefore, 5 ether);
        assertEq(pm.totalLocked(), 0);
    }

    function test_setFee_cappedAt5pct() public {
        vm.prank(owner);
        pm.setFee(500);
        assertEq(pm.feeBps(), 500);

        vm.prank(owner);
        vm.expectRevert(PredictionMarket.FeeTooHigh.selector);
        pm.setFee(501);
    }

    function test_setKeeper_onlyOwner() public {
        address newKeeper = address(0xBABE);
        vm.prank(alice);
        vm.expectRevert();
        pm.setKeeper(newKeeper);

        vm.prank(owner);
        pm.setKeeper(newKeeper);
        assertEq(pm.keeper(), newKeeper);
    }

    function test_setCaps_updatesAll() public {
        vm.prank(owner);
        pm.setCaps(10 ether, 100 ether, 300 ether);
        assertEq(pm.capHour(), 10 ether);
        assertEq(pm.capDay(), 100 ether);
        assertEq(pm.capMonth(), 300 ether);
    }

    // ─── rescue ────────────────────────────────────────────────

    function test_rescueNative_revertsWhenNoDust() public {
        vm.prank(owner);
        vm.expectRevert(PredictionMarket.NoDustToRescue.selector);
        pm.rescueNative(owner, 1);
    }

    function test_rescueNative_onlyRescuesDustNotLockedFunds() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        // Contract balance = 10, totalLocked = 10 → no dust
        vm.prank(owner);
        vm.expectRevert(PredictionMarket.NoDustToRescue.selector);
        pm.rescueNative(owner, 1);

        // Force inject 3 ether via selfdestruct-like vm.deal
        vm.deal(address(pm), address(pm).balance + 3 ether);

        // Now dust = 3 ether, totalLocked still 10
        vm.prank(owner);
        uint256 before = owner.balance;
        pm.rescueNative(owner, 2 ether);
        assertEq(owner.balance - before, 2 ether);
        assertEq(address(pm).balance, 11 ether); // 10 locked + 1 remaining dust
        assertEq(pm.totalLocked(), 10 ether);
    }

    function test_rescueNative_maxAmount() public {
        vm.deal(address(pm), 5 ether);
        vm.prank(owner);
        pm.rescueNative(owner, type(uint256).max);
        assertEq(owner.balance, 5 ether);
        assertEq(address(pm).balance, 0);
    }

    function test_rescueNative_exceedsDustReverts() public {
        vm.deal(address(pm), 5 ether);
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarket.RescueAmountExceedsDust.selector,
                uint256(5 ether),
                uint256(6 ether)
            )
        );
        pm.rescueNative(owner, 6 ether);
    }

    function test_rescueNative_onlyOwner() public {
        vm.deal(address(pm), 5 ether);
        vm.prank(alice);
        vm.expectRevert();
        pm.rescueNative(alice, 1 ether);
    }

    // ─── pause ─────────────────────────────────────────────────

    function test_pause_blocksBetAndCreate() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        vm.prank(owner);
        pm.pause();

        vm.prank(alice);
        vm.expectRevert();
        pm.bet{value: 1 ether}(id, PredictionMarket.Side.Yes);

        mv.setVault(TERM2, 1, 50 ether, 25 ether);
        vm.prank(keeper);
        vm.expectRevert();
        pm.createMarket(TERM2, 1, PredictionMarket.Duration.Day);

        vm.prank(owner);
        pm.unpause();
        vm.prank(alice);
        pm.bet{value: 1 ether}(id, PredictionMarket.Side.Yes);
    }

    // ─── direct transfer rejected ──────────────────────────────

    function test_directTransferReverts() public {
        (bool ok, ) = address(pm).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ─── getPayoutQuote ────────────────────────────────────────

    function test_getPayoutQuote_matchesClaim() public {
        uint256 id = _createHourMarket(TERM, 100 ether);
        // Build up state: 10 NO already, quote for 10 more YES
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);

        uint256 quote = pm.getPayoutQuote(id, PredictionMarket.Side.Yes, 10 ether);

        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        mv.setVault(TERM, 1, 150 ether, 50 ether);
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);
        pm.resolve(id);

        uint256 before = alice.balance;
        vm.prank(alice);
        pm.claim(id);
        assertEq(alice.balance - before, quote);
    }
}
