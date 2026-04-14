// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMultiVault} from "../../src/interfaces/IMultiVault.sol";

/// @notice Minimal MultiVault mock for unit tests.
/// @dev Only implements the functions PredictionMarket actually calls.
contract MockMultiVault is IMultiVault {
    struct VaultState {
        uint256 totalAssets;
        uint256 totalShares;
        bool exists;
    }

    mapping(bytes32 termId => mapping(uint256 curveId => VaultState)) internal _vaults;
    uint256 public defaultCurveId = 1;
    address public registry = address(0xBEEF);
    bool public shouldRevertOnGetVault;

    function setVault(
        bytes32 termId,
        uint256 curveId,
        uint256 totalAssets,
        uint256 totalShares
    ) external {
        _vaults[termId][curveId] = VaultState(totalAssets, totalShares, true);
    }

    function setRevertMode(bool on) external {
        shouldRevertOnGetVault = on;
    }

    function getVault(bytes32 termId, uint256 curveId)
        external
        view
        returns (uint256, uint256)
    {
        if (shouldRevertOnGetVault) revert("MultiVault: forced revert");
        VaultState memory v = _vaults[termId][curveId];
        return (v.totalAssets, v.totalShares);
    }

    function isTermCreated(bytes32 id) external view returns (bool) {
        return _vaults[id][defaultCurveId].exists;
    }

    function bondingCurveConfig() external view returns (address, uint256) {
        return (registry, defaultCurveId);
    }

    function getCounterIdFromTripleId(bytes32 tripleId)
        external
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked("COUNTER", tripleId));
    }
}
