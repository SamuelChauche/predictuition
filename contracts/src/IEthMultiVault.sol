// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IEthMultiVault
/// @notice Interface read-only vers le contrat Intuition MultiVault.
///         Toutes les signatures ont été vérifiées on-chain via eth_call + selector matching.
///
/// @dev Adresse mainnet : 0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e (chain 1155)
///      Adresse testnet : 0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91 (chain 13579)
///
///      Les IDs sont des bytes32 (hash du contenu de l'atom/triple), pas des uint256.
///      La plupart des fonctions prennent (bytes32 termId, uint256 curveId).
///      Le curveId par défaut est 1 sur mainnet — lire via getBondingCurveConfig().
interface IEthMultiVault {

    // ─── Vault state ──────────────────────────────────────────────────────────

    /// @notice État d'un vault : total ETH déposé + total shares émises.
    /// @dev    Vérifié : selector 0x01a21760 ✓
    ///         Appels confirmés on-chain sur chain 1155.
    function getVault(bytes32 termId, uint256 curveId)
        external view
        returns (uint256 totalAssets, uint256 totalShares);

    /// @notice Prix actuel d'une share en wei (18 décimales).
    /// @dev    Vérifié : selector 0x1a2385de ✓
    function currentSharePrice(bytes32 termId, uint256 curveId)
        external view
        returns (uint256 sharePrice);

    // ─── User position ────────────────────────────────────────────────────────

    /// @notice Shares détenues par `account` dans le vault `termId`.
    /// @dev    Vérifié : selector 0xee3abe38 ✓
    ///         Note : l'adresse passe EN PREMIER.
    function getShares(address account, bytes32 termId, uint256 curveId)
        external view
        returns (uint256 shares);

    // ─── Triple helpers ───────────────────────────────────────────────────────

    /// @notice Retourne les composants d'un triple (subject, predicate, object).
    /// @dev    Vérifié : selector 0xc12f7947 ✓
    function getTriple(bytes32 tripleId)
        external view
        returns (bytes32 subjectId, bytes32 predicateId, bytes32 objectId);

    /// @notice Retourne le termId du vault "contre" (against) pour un triple.
    /// @dev    Vérifié : selector 0xc9cedcd0 ✓
    ///         Le vault "pour" = termId, le vault "contre" = retour de cette fonction.
    function getCounterIdFromTripleId(bytes32 tripleId)
        external view
        returns (bytes32 counterTermId);

    /// @notice Teste si un termId est un triple (vs atom).
    /// @dev    Vérifié : selector 0x1fdc812e ✓
    function isTriple(bytes32 termId)
        external view
        returns (bool);

    /// @notice Teste si un termId a été créé sur Intuition.
    /// @dev    Selector à vérifier on-chain avant déploiement.
    function isTermCreated(bytes32 termId)
        external view
        returns (bool);

    // ─── Config ───────────────────────────────────────────────────────────────

    /// @notice Retourne (registryAddress, defaultCurveId).
    ///         Sur mainnet, defaultCurveId = 1. Toujours interroger plutôt que hardcoder.
    /// @dev    Vérifié : selector 0xf5da42f3 ✓
    function getBondingCurveConfig()
        external view
        returns (address registry, uint256 defaultCurveId);
}
