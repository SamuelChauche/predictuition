// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MarketFactory.sol";
import "../src/Market.sol";

/// @notice Scripts du flow complet Predictuition sur testnet Intuition (chain 13579).
///
/// ─── Étapes ──────────────────────────────────────────────────────────────────
///
/// 1. Déploie la factory (ou use existante) + crée le marché :
///    forge script script/Flow.s.sol --sig "createMarket()" \
///      --rpc-url intuition_testnet --broadcast --private-key $PRIVATE_KEY
///
/// 2. Parie YES puis NO :
///    forge script script/Flow.s.sol --sig "betYesNo(address)" $MARKET_ADDR \
///      --rpc-url intuition_testnet --broadcast --private-key $PRIVATE_KEY
///
/// 3. Résous après deadline :
///    forge script script/Flow.s.sol --sig "resolve(address)" $MARKET_ADDR \
///      --rpc-url intuition_testnet --broadcast --private-key $PRIVATE_KEY
///
/// 4. Récupère les gains :
///    forge script script/Flow.s.sol --sig "claim(address)" $MARKET_ADDR \
///      --rpc-url intuition_testnet --broadcast --private-key $PRIVATE_KEY
///
contract FlowScript is Script {

    bytes32 constant TEST_ATOM   = 0x0000491522e120a9b3cb9964bfb34fadbac429b5b978ae1691af5013104909a4;
    uint256 constant TARGET_VALUE = 500_000;
    uint256 constant CURVE_LINEAR = 1;

    // ─── 1. createMarket ──────────────────────────────────────────────────────

    function createMarket() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        MarketFactory factory = MarketFactory(payable(vm.envAddress("FACTORY_ADDR")));

        uint256 curTs      = block.timestamp;
        uint256 lockBuffer = 60;
        uint256 deadline   = curTs + 180;

        console2.log("Timestamp actuel :", curTs);
        console2.log("LockTime         :", deadline - lockBuffer);
        console2.log("Deadline         :", deadline);

        vm.startBroadcast(deployer);
        address market = factory.createMarket{value: factory.creationBond()}(
            1,            // TVL_ABOVE
            TEST_ATOM,
            CURVE_LINEAR, // curveId
            TARGET_VALUE,
            deadline,
            lockBuffer
        );
        vm.stopBroadcast();

        console2.log("Market deploye :", market);
        console2.log("export MARKET_ADDR=", market);
    }

    // ─── 2. betYesNo ──────────────────────────────────────────────────────────

    function betYesNo(address marketAddr) external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        Market  market   = Market(payable(marketAddr));

        uint256 betAmt = 0.001 ether;

        vm.startBroadcast(deployer);
        market.bet{value: betAmt}(true);
        market.bet{value: betAmt}(false);
        vm.stopBroadcast();

        console2.log("Bets places (YES + NO) de", betAmt, "tTRUST chacun");
        console2.log("poolYes :", market.poolYes());
        console2.log("poolNo  :", market.poolNo());
        console2.log("oddsYes (bps) :", market.oddsYesBps());
    }

    // ─── 3. resolve ───────────────────────────────────────────────────────────

    function resolve(address marketAddr) external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        Market  market   = Market(payable(marketAddr));

        console2.log("Block actuel :", block.number);
        console2.log("Deadline     :", market.deadline());

        vm.startBroadcast(deployer);
        market.resolve();
        vm.stopBroadcast();

        console2.log("Resolu !");
        console2.log("Outcome (true=YES) :", market.outcome());
        console2.log("remainingPool      :", market.remainingPoolAfterFees());
    }

    // ─── 4. claim ─────────────────────────────────────────────────────────────

    function claim(address marketAddr) external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        Market  market   = Market(payable(marketAddr));

        console2.log("Outcome :", market.outcome());
        console2.log("Shares YES deployer :", market.sharesYes(deployer));
        console2.log("Shares NO  deployer :", market.sharesNo(deployer));

        vm.startBroadcast(deployer);
        market.claim();
        vm.stopBroadcast();

        console2.log("Claim effectue !");
    }

    // ─── Status (lecture seule) ───────────────────────────────────────────────

    function status(address marketAddr) external view {
        Market market = Market(payable(marketAddr));
        console2.log("=== Market status ===");
        console2.log("resolved   :", market.resolved());
        console2.log("refundMode :", market.refundMode());
        console2.log("poolYes    :", market.poolYes());
        console2.log("poolNo     :", market.poolNo());
        console2.log("deadline   :", market.deadline());
        console2.log("curveId    :", market.curveId());
        if (market.resolved()) {
            console2.log("outcome    :", market.outcome());
            console2.log("remaining  :", market.remainingPoolAfterFees());
        }
    }
}
