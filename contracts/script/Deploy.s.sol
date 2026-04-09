// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MarketFactory.sol";

/// @notice Déploie MarketFactory sur Intuition L3 (chain 1155)
/// Usage: forge script script/Deploy.s.sol --rpc-url intuition --broadcast
contract DeployScript is Script {

    // Intuition L3 mainnet
    address constant MULTI_VAULT = 0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e;

    function run() external {
        address deployer     = vm.envAddress("DEPLOYER_ADDRESS");
        address feeCollector = vm.envOr("FEE_COLLECTOR", deployer);

        vm.startBroadcast(deployer);

        MarketFactory factory = new MarketFactory(MULTI_VAULT, feeCollector);

        console2.log("MarketFactory deployed:", address(factory));
        console2.log("curveId:", factory.curveId());
        console2.log("feeCollector:", factory.feeCollector());

        vm.stopBroadcast();
    }
}
