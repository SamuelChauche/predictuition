// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MarketFactory.sol";

/// @notice Déploie MarketFactory sur Intuition mainnet (1155) ou testnet (13579).
///
/// Mainnet:  forge script script/Deploy.s.sol --rpc-url intuition --broadcast --private-key $PRIVATE_KEY
/// Testnet:  forge script script/Deploy.s.sol --rpc-url intuition_testnet --broadcast --private-key $PRIVATE_KEY
contract DeployScript is Script {

    address constant MULTI_VAULT_MAINNET = 0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e;
    address constant MULTI_VAULT_TESTNET = 0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91;

    function run() external {
        address deployer     = vm.envAddress("DEPLOYER_ADDRESS");
        address feeCollector = vm.envOr("FEE_COLLECTOR", deployer);

        address multiVault = block.chainid == 13579
            ? MULTI_VAULT_TESTNET
            : MULTI_VAULT_MAINNET;

        vm.startBroadcast(deployer);

        MarketFactory factory = new MarketFactory(multiVault, feeCollector);

        // Testnet : paramètres allégés pour faciliter les tests
        if (block.chainid == 13579) {
            factory.setParams(
                0.001 ether,    // creationBond
                0.002 ether,    // minVolume
                100,            // protocolFeeBps 1%
                0.00001 ether   // resolverReward
            );
        }

        vm.stopBroadcast();

        console2.log("Chain:", block.chainid);
        console2.log("MultiVault:", multiVault);
        console2.log("MarketFactory:", address(factory));
        console2.log("creationBond:", factory.creationBond());
        console2.log("minVolume:", factory.minVolume());
        console2.log("protocolFeeBps:", factory.protocolFeeBps());
        console2.log("feeCollector:", factory.feeCollector());
    }
}
