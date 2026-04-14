// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";
contract Check is Script {
    function run() external view {
        console2.log("block.number  (via script):", block.number);
        console2.log("block.timestamp:", block.timestamp);
    }
}
