// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {IMultiVault} from "../src/interfaces/IMultiVault.sol";

/// @notice Fork test against real Intuition testnet MultiVault.
/// @dev    Run with:
///           MV_TESTNET_ADDR=<addr> \
///           TEST_TERM_ID_BILLY=<bytes32> \
///           TEST_TERM_ID_HAS_TAG=<bytes32> \
///           forge test --match-contract Fork --fork-url <intuition_testnet_rpc>
///         All onchain addresses and test term ids are injected via env vars
///         so this repo contains no hardcoded references to live onchain state.
contract PredictionMarketForkTest is Test {
    PredictionMarket pm;
    IMultiVault internal MV_TESTNET;

    // Real termIds from testnet 13579 (position_count >= 5), injected via env
    bytes32 internal INTUITIONBILLY;
    bytes32 internal HAS_TAG;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address feeRecipient = makeAddr("feeRecipient");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        // Skip gracefully if no fork URL provided
        try vm.activeFork() returns (uint256) {
            // Good
        } catch {
            vm.skip(true);
        }

        // Load addresses and term ids from env — no hardcoded onchain references
        MV_TESTNET = IMultiVault(vm.envAddress("MV_TESTNET_ADDR"));
        INTUITIONBILLY = vm.envBytes32("TEST_TERM_ID_BILLY");
        HAS_TAG = vm.envBytes32("TEST_TERM_ID_HAS_TAG");

        pm = new PredictionMarket(MV_TESTNET, owner, keeper, feeRecipient);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_fork_defaultCurveIdIs1() public view {
        assertEq(pm.defaultCurveId(), 1);
    }

    function test_fork_getVaultReturnsNonZeroForRealAtom() public view {
        (uint256 totalAssets, uint256 totalShares) = MV_TESTNET.getVault(INTUITIONBILLY, 1);
        assertGt(totalAssets, 0, "intuitionbilly.eth should have TVL");
        assertGt(totalShares, 0);
        console2.log("intuitionbilly.eth TVL (wei):", totalAssets);
        console2.log("intuitionbilly.eth shares:   ", totalShares);
    }

    function test_fork_createMarketOnRealAtom() public {
        vm.prank(keeper);
        uint256 id = pm.createMarket(INTUITIONBILLY, 1, PredictionMarket.Duration.Hour);

        PredictionMarket.Market memory m = pm.getMarket(id);
        assertEq(m.termId, INTUITIONBILLY);
        assertEq(m.curveId, 1);
        assertGt(m.totalAssets0, 0);
        assertEq(m.deadline, uint64(block.timestamp + 1 hours));
    }

    function test_fork_fullFlowBetResolveClaim() public {
        // Create market
        vm.prank(keeper);
        uint256 id = pm.createMarket(INTUITIONBILLY, 1, PredictionMarket.Duration.Hour);

        // Bet from two sides
        vm.prank(alice);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.Yes);
        vm.prank(bob);
        pm.bet{value: 10 ether}(id, PredictionMarket.Side.No);

        // Move past deadline + grace
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);

        // Resolve against live MultiVault — since we can't manipulate real TVL,
        // we just ensure resolve() doesn't revert and picks a side (or refunds on tie)
        pm.resolve(id);

        PredictionMarket.Market memory m = pm.getMarket(id);
        assertTrue(m.resolved || m.refunded, "market should be settled");

        // If tied in fork view (unlikely but possible), both can claim full refund
        // Otherwise winner claims
        if (m.refunded) {
            uint256 aBefore = alice.balance;
            vm.prank(alice);
            pm.claim(id);
            assertEq(alice.balance - aBefore, 10 ether);
        } else {
            address winner = m.winningSide == PredictionMarket.Side.Yes ? alice : bob;
            uint256 winBefore = winner.balance;
            vm.prank(winner);
            pm.claim(id);
            // Gross payout = 20, profit 10, fee 0.3, net 19.7
            assertEq(winner.balance - winBefore, 19.7 ether);
        }
    }

    function test_fork_deadTermReverts() public {
        bytes32 fakeId = bytes32(uint256(0xdead));
        vm.prank(keeper);
        vm.expectRevert(PredictionMarket.DeadTerm.selector);
        pm.createMarket(fakeId, 1, PredictionMarket.Duration.Hour);
    }
}
