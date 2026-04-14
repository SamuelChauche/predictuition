// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {IMultiVault} from "../src/interfaces/IMultiVault.sol";

/// @notice Deploy script for PredictionMarket.
/// @dev Env vars expected:
///   MULTIVAULT_ADDRESS   — Intuition MultiVault address on target chain
///   PM_OWNER             — Gnosis Safe multisig (emergency only)
///   PM_KEEPER            — Bot EOA that creates markets
///   PM_FEE_RECIPIENT     — Treasury (usually same as owner)
///
/// Usage (testnet):
///   forge script script/Deploy.s.sol \
///     --rpc-url intuition_testnet \
///     --account <keystore-name> \
///     --broadcast
///
/// Usage (mainnet):
///   forge script script/Deploy.s.sol \
///     --rpc-url intuition_mainnet \
///     --account <keystore-name> \
///     --broadcast \
///     --verify
contract Deploy is Script {
    // No hardcoded addresses — all addresses MUST be provided via env at deploy time.
    // This prevents drift between docs and code, and forces explicit operator attention
    // when switching between chains.

    function run() external returns (PredictionMarket pm) {
        address mv = vm.envAddress("MULTIVAULT_ADDRESS");
        require(mv != address(0), "MULTIVAULT_ADDRESS must be set");

        address pmOwner = vm.envAddress("PM_OWNER");
        address pmKeeper = vm.envAddress("PM_KEEPER");
        address pmFeeRecipient = vm.envAddress("PM_FEE_RECIPIENT");

        console2.log("=== PredictionMarket Deployment ===");
        console2.log("chain id:      ", block.chainid);
        console2.log("MultiVault:    ", mv);
        console2.log("owner:         ", pmOwner);
        console2.log("keeper:        ", pmKeeper);
        console2.log("feeRecipient:  ", pmFeeRecipient);

        vm.startBroadcast();
        pm = new PredictionMarket(IMultiVault(mv), pmOwner, pmKeeper, pmFeeRecipient);
        vm.stopBroadcast();

        console2.log("deployed at:   ", address(pm));

        // Sanity checks
        require(pm.owner() == pmOwner, "owner mismatch");
        require(pm.keeper() == pmKeeper, "keeper mismatch");
        require(pm.feeRecipient() == pmFeeRecipient, "feeRecipient mismatch");
        require(pm.defaultCurveId() == 1, "defaultCurveId should be 1");
        require(pm.feeBps() == 300, "feeBps should be 300");
        require(pm.capHour() == 50 ether, "capHour");
        require(pm.capDay() == 200 ether, "capDay");
        require(pm.capMonth() == 500 ether, "capMonth");

        console2.log("=== All sanity checks passed ===");
    }
}
