// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal read-only interface for the Intuition MultiVault.
/// @dev Signatures verified against
///      github.com/0xIntuition/intuition-contracts-v2/src/protocol/MultiVault.sol
///      and cross-checked live against the deployed MultiVault on 2026-04-13.
///      Concrete MultiVault address is injected at deploy time via env,
///      not hardcoded here.
interface IMultiVault {
    function getVault(bytes32 termId, uint256 curveId)
        external
        view
        returns (uint256 totalAssets, uint256 totalShares);

    function isTermCreated(bytes32 id) external view returns (bool);

    function bondingCurveConfig()
        external
        view
        returns (address registry, uint256 defaultCurveId);

    function getCounterIdFromTripleId(bytes32 tripleId)
        external
        pure
        returns (bytes32);
}
