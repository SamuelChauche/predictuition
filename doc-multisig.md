# Predictuition — Stratégie multisig et ownership

Document dédié à la stratégie de gouvernance onchain du contrat `PredictionMarket`. Spécifie comment l'owner multisig est configuré sur Intuition L3 (chain 1155) et comment les signataires interagissent avec lui sans accès à `app.safe.global`.

**Dernière mise à jour** : 2026-04-13
**Scope** : testnet 13579 + mainnet 1155
**Dépendance** : ce doc est un compagnon de `doc.md`. Il approfondit uniquement les aspects ownership, signing et gouvernance.

---

## Table des matières

1. [Contexte et problème](#1-contexte-et-problème)
2. [Ce que l'owner peut faire](#2-ce-que-lowner-peut-faire)
3. [Pourquoi la Safe Ethereum mainnet ne suffit pas](#3-pourquoi-la-safe-ethereum-mainnet-ne-suffit-pas)
4. [Options considérées](#4-options-considérées)
5. [Chemin recommandé par environnement](#5-chemin-recommandé-par-environnement)
6. [Déploiement manuel de Safe sur Intuition L3](#6-déploiement-manuel-de-safe-sur-intuition-l3)
7. [Cérémonie de signature sans app.safe.global](#7-cérémonie-de-signature-sans-appsafeglobal)
8. [CLI tooling — `predictuition-safe`](#8-cli-tooling--predictuition-safe)
9. [Sécurité et hygiène des clés](#9-sécurité-et-hygiène-des-clés)
10. [Migration EOA → Safe](#10-migration-eoa--safe)
11. [Procédures opérationnelles](#11-procédures-opérationnelles)
12. [Alternatives rejetées](#12-alternatives-rejetées)
13. [Timeline et checklist](#13-timeline-et-checklist)

---

## 1. Contexte et problème

Le contrat `PredictionMarket` expose plusieurs fonctions sensibles derrière un modificateur `onlyOwner` (voir doc.md §3.2 et §6 pour la liste exhaustive). En production mainnet avec une demande explicite d'**industrial-grade security**, cet owner **ne peut pas être une simple EOA** — un single point of failure est inacceptable pour un contrat qui gère des fonds utilisateurs.

La solution standard est d'utiliser un **Gnosis Safe multisig** avec 2-of-3 ou 3-of-5 signatures. L'utilisateur possède déjà une Safe sur Ethereum mainnet (chain 1) — adresse volontairement non-consignée dans ce document.

**Le problème découvert le 2026-04-13** : cette Safe n'existe pas sur Intuition L3 (chain 1155). Un contrat déployé sur une chaîne EVM n'est pas automatiquement présent sur les autres chaînes. Et l'UI `app.safe.global` ne liste pas Intuition comme réseau supporté, donc on ne peut pas créer une nouvelle Safe sur 1155 via le chemin standard.

**Conséquence** : il faut **déployer Safe manuellement sur Intuition L3**, ou trouver une alternative.

---

## 2. Ce que l'owner peut faire

Récap des fonctions `onlyOwner` du contrat `PredictionMarket` (référence : `doc.md` §3.2, §6) :

### 2.1 Actions instantanées (pas de timelock)

| Fonction | Usage | Fréquence attendue |
|---|---|---|
| `pause()` | Gèle les entrées en urgence | Très rare, incident seulement |
| `unpause()` | Lève la pause | Très rare |
| `setKeeper(address)` | Rotation d'un keeper compromis | Rare (compromission ou rotation planifiée) |
| `emergencyRefund(marketId)` | Force le refund d'un marché cassé | Rare (MultiVault revert, term invalidé) |
| `rescueNative(to, amount)` | Récupère le dust natif | Très rare |
| `rescueERC20(token, to, amount)` | Récupère des ERC20 envoyés par erreur | Très rare |

### 2.2 Actions timelockées (24h delay)

| Fonction | Usage | Fréquence attendue |
|---|---|---|
| `setAllowedTerm(termId, bool)` | Gestion de l'allowlist keeper | **Hebdomadaire** ← la plus fréquente |
| `setFees(lp, protocol, observer)` | Ajustement des fees | Très rare |
| `setCaps(initial, max)` | Ajustement des caps liquidity | Rare |
| `setFeeRecipient(address)` | Change la destination des protocol fees | Très rare |

**Observation critique** : la fonction la plus fréquente (`setAllowedTerm`, hebdomadaire) est celle qui détermine si on peut tolérer un signing process lent ou pas. Un cérémonie de signing de 30-45 min par semaine est acceptable. Si la curation devenait quotidienne (1 tx/jour), ce serait trop et il faudrait automatiser.

### 2.3 Actions que l'owner ne peut PAS faire

Par design, l'owner est contraint. Il **ne peut pas** :

- Forcer un `winningSide` (déterminé uniquement par `resolve()` qui lit le MultiVault)
- Modifier les positions utilisateur (mappings internes non-exposés)
- Saisir les fonds dus aux parieurs ou aux LPs (`rescueNative` est plafonné par l'invariant `totalLocked`)
- Bypasser le timelock 24h pour les actions timelockées
- Se modifier lui-même hors de l'Ownable2Step (transfer d'ownership en 2 étapes)

C'est une architecture **defense-in-depth** : même un owner compromis ne peut pas vider le contrat directement.

---

## 3. Pourquoi la Safe Ethereum mainnet ne suffit pas

### 3.1 Les Safes ne sont pas cross-chain par défaut

Une Gnosis Safe est un **contrat** déployé à une adresse spécifique sur une chaîne spécifique. Le code de ta Safe vit sur Ethereum mainnet (chain 1), pas ailleurs. Vérifié onchain le 2026-04-13 via `cast code` — aucun bytecode à cette adresse sur Intuition 1155.

Le fait que tu puisses "voir" ta Safe sur `app.safe.global` depuis ton navigateur est une illusion cross-chain côté UI : l'app interroge une API centralisée (Safe Transaction Service) qui indexe les Safes sur plusieurs chaînes. Quand tu signes une tx, elle est exécutée **sur la chaîne où la Safe vit**, pas ailleurs.

### 3.2 CREATE2 deterministic deployment — possible mais complexe

Techniquement, si les contrats Safe sont déployés sur Intuition L3 aux **mêmes adresses** que sur Ethereum mainnet (via le deterministic deployer d'Arachnid, adresse canonique à re-vérifier au moment du deploy), on pourrait redéployer ta Safe à la même adresse sur 1155 via CREATE2 en réutilisant le même salt/init code.

**Conditions nécessaires** :

1. Le deterministic deployer d'Arachnid est déployé sur Intuition 1155 (à vérifier empiriquement avec `cast code <deployer address> --rpc-url <intuition>` au moment du setup)
2. Le Safe singleton et la ProxyFactory sont déployés aux **mêmes adresses** que sur mainnet (adresses canoniques Safe 1.4.1 à retrouver dans `safe-deployments/` au moment du setup)
3. Tu connais le salt exact utilisé pour créer ta Safe sur mainnet (c'est typiquement `nonce=0` mais ça dépend de l'UI qui a créé la Safe)
4. Tu connais l'init code exact (signataires, threshold, fallback handler, payment token, etc.)

**Vraie-vie** : les conditions 1 et 2 ne sont presque jamais toutes satisfaites sur une L3 aussi jeune qu'Intuition. Vérifier puis déployer prend autant d'effort que créer une nouvelle Safe fresh.

**Décision** : on part sur une **Safe fraîche à une nouvelle adresse** sur 1155. C'est conceptuellement plus simple et aussi propre d'un point de vue sécurité (pas de couplage avec ta Safe mainnet qui pourrait avoir des usages séparés).

---

## 4. Options considérées

### 4.1 Option A — Déploiement manuel de Safe sur Intuition L3 ⭐ recommandée

Déployer le code open-source de Safe (repo `github.com/safe-global/safe-smart-account`) sur Intuition 1155 via un script Foundry. Créer une nouvelle Safe proxy avec tes signataires. Utiliser cette nouvelle Safe comme owner de `PredictionMarket`.

- **Pour** : contrats Safe battle-tested ($60B+ sécurisés), pattern standard, ownership audit-able, multisig réel
- **Contre** : pas d'UI Safe, signing via CLI uniquement, cérémonie de signing manuelle, setup 1.5-2 jours
- **Blast radius** : acceptable industrial quality si bien opéré

### 4.2 Option B — Custom minimal multisig (100 lignes Solidity)

Écrire un contrat multisig minimaliste nous-mêmes, style :
```solidity
contract MiniMultisig {
    address[] public signers;
    uint256 public threshold;
    mapping(bytes32 => uint256) public confirmations;
    function propose(...) external;
    function confirm(bytes32) external;
    function execute(bytes32) external;
}
```

- **Pour** : 100 lignes, facile à auditer, pas de dépendance Safe, 100% sur 1155
- **Contre** : **rolling your own crypto**. Les bugs classiques (replay, ordering, reentrancy dans execute, malleability des signatures) sont subtils même en 100 lignes. Le skill `security/` d'ethskills recommande explicitement Safe ("Safe (Gnosis Safe) secures $60B+ in assets. Use it for production treasuries.")
- **Rejeté** : le gain en simplicité ne compense pas le risque d'introduire un bug dans ta couche de gouvernance

### 4.3 Option C — EOA simple avec rotation

Pas de multisig du tout. Owner = une EOA contrôlée par l'équipe. Rotation périodique (tous les 3 mois) pour limiter l'exposition temporelle.

- **Pour** : 0 setup, signing instantané, itération rapide
- **Contre** : **single point of failure**. Violation directe de la demande "industrial-grade security". Une clé compromise = le owner est compromis.
- **Acceptable en testnet uniquement**

### 4.4 Option D — Timelock + EOA hybride

Utiliser un `TimelockController` d'OpenZeppelin comme owner. Le TimelockController a un "proposer" (EOA) et un "executor" (EOA ou AddressZero pour permissionless), avec un délai minimum entre proposition et exécution.

- **Pour** : défense en profondeur sans la complexité d'un vrai multisig. Si l'EOA proposer est compromise, il y a 24h pour réagir avant que l'attaquant ne puisse exécuter.
- **Contre** : ce n'est **pas un multisig** au sens 2-of-3. C'est un 1-of-1 avec un délai. Un attaquant qui contrôle la clé peut propose+attendre 24h+execute, et si la détection est lente, il réussit.
- **Position** : meilleur qu'EOA nue, moins bon que vraie multisig. **Peut être un fallback en cas d'échec du déploiement Safe manuel**.

### 4.5 Option E — Bridge vers ta Safe Ethereum mainnet

Relayer les signatures depuis ta Safe mainnet vers Intuition 1155 via un bridge cross-chain (LayerZero, Axelar, Wormhole, Hyperlane). La Safe sur mainnet signe, le bridge vérifie la signature, un relay contract sur Intuition exécute.

- **Pour** : réutilise ta Safe existante, pas besoin d'en déployer une nouvelle
- **Contre** : **aucun de ces bridges n'est déployé sur Intuition L3 aujourd'hui** (confirmé via les addresses verified du skill `addresses/`). Et ajouter une dépendance bridge augmente énormément la surface d'attaque.
- **Rejeté définitivement** pour v1

### 4.6 Option F — Safe UI fork self-hosted

Déployer un fork de l'UI Safe (`github.com/safe-global/safe-wallet-web`) configuré contre Intuition L3. L'UI communique directement avec le node RPC, sans passer par le Safe Transaction Service officiel (qui ne supporte que les chaînes officielles).

- **Pour** : UX proche de l'UI officielle, signing via MetaMask/Ledger comme d'habitude
- **Contre** : 2-3 jours de setup infra, hosting à maintenir, risque de divergence avec l'upstream Safe UI, configuration pas triviale (il faut aussi un SafeTransactionService ou bien le désactiver côté UI)
- **Position** : intéressant en **phase 3** quand Predictuition aura un peu de users et qu'on voudra un workflow plus propre. Pas prioritaire pour le lancement.

---

## 5. Chemin recommandé par environnement

Deux environnements, deux stratégies :

### 5.1 Testnet 13579 — Option C (EOA simple)

**Justification** : aucune valeur en jeu, priorité à la vitesse d'itération. Les bugs qu'on va trouver en testnet seront résolus en quelques heures, on n'a pas besoin d'un cérémonie de signing pour pousser un fix.

**Setup** :

1. Générer 2 EOAs dédiées via `cast wallet new` :
   - `pm-owner-testnet` — owner du PredictionMarket testnet
   - `pm-keeper-testnet` — keeper EOA pour appeler createMarket
2. Importer les clés dans le keystore chiffré Foundry :
   ```bash
   cast wallet import pm-owner-testnet --interactive
   cast wallet import pm-keeper-testnet --interactive
   ```
3. Récupérer du tTRUST via le faucet `https://testnet.hub.intuition.systems/` pour les 2 adresses
4. Au moment du déploy testnet, les envs sont :
   ```
   PM_OWNER=<address of pm-owner-testnet>
   PM_KEEPER=<address of pm-keeper-testnet>
   PM_FEE_RECIPIENT=<same as PM_OWNER>
   ```

### 5.2 Mainnet 1155 — Option A (Safe manuelle)

**Justification** : argent réel en jeu, demande explicite industrial-grade security, la cérémonie de signing manuelle (~30 min hebdo pour la curation allowlist) est un coût opérationnel acceptable.

**Setup** (détaillé en §6 et §7) :

1. Déployer les contrats Safe standard sur Intuition 1155
2. Déployer un Safe proxy avec tes signataires et threshold
3. Transférer l'ownership du PredictionMarket vers cette nouvelle Safe via `transferOwnership` (Ownable2Step)
4. Tester la cérémonie de signing avec une tx non-critique (ex : `setAllowedTerm` d'un test termId)
5. Documenter les procédures pour les co-signataires

---

## 6. Déploiement manuel de Safe sur Intuition L3

### 6.1 Architecture Safe à déployer

Pour une Safe fonctionnelle, on a besoin de **4 contrats de l'écosystème Safe** :

| Contrat | Rôle | Source |
|---|---|---|
| `Safe` (singleton) | Implémentation master, contient la logique Safe (exec, signature verification, etc.) | `safe-smart-account/contracts/Safe.sol` |
| `SafeProxyFactory` | Factory qui clone des `SafeProxy` pointant vers le singleton | `safe-smart-account/contracts/proxies/SafeProxyFactory.sol` |
| `CompatibilityFallbackHandler` | Gère les signatures EIP-1271 et autres callbacks fallback | `safe-smart-account/contracts/handler/CompatibilityFallbackHandler.sol` |
| `MultiSendCallOnly` | Permet de batcher plusieurs calls dans une seule `execTransaction` | `safe-smart-account/contracts/libraries/MultiSendCallOnly.sol` |

Optionnellement utiles mais pas requis pour v1 :
- `SimulateTxAccessor` — simulation de tx
- `SignMessageLib` — signing de messages arbitraires
- `CreateCall` — permet à la Safe de créer de nouveaux contrats

**Pour v1, on ne déploie que les 4 principaux.**

### 6.2 Source de vérité et version

**Version Safe cible** : **1.4.1** (la plus récente stable au 2026-04-13, utilisée sur mainnet et toutes les principales L2s).

**Repo** : `https://github.com/safe-global/safe-smart-account`, tag `v1.4.1`

**Vérification pré-déploiement** : comparer le bytecode compilé localement avec le bytecode de la Safe 1.4.1 sur Ethereum mainnet (adresse canonique à retrouver dans `safe-deployments/` au moment du setup) pour s'assurer qu'on déploie bien le même contrat. Reproductibilité du build via Docker + pinned Solidity version.

### 6.3 Script de déploiement Foundry

À écrire : `contracts/script/DeploySafe.s.sol`

Squelette :

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

// Safe contracts (importés via git submodule ou copie locale)
import {Safe} from "safe-smart-account/contracts/Safe.sol";
import {SafeProxyFactory} from "safe-smart-account/contracts/proxies/SafeProxyFactory.sol";
import {CompatibilityFallbackHandler} from "safe-smart-account/contracts/handler/CompatibilityFallbackHandler.sol";
import {MultiSendCallOnly} from "safe-smart-account/contracts/libraries/MultiSendCallOnly.sol";

contract DeploySafe is Script {
    function run()
        external
        returns (
            address singleton,
            address proxyFactory,
            address fallbackHandler,
            address multiSend,
            address safeProxy
        )
    {
        // Read signers from env
        address signer1 = vm.envAddress("SAFE_SIGNER_1");
        address signer2 = vm.envAddress("SAFE_SIGNER_2");
        address signer3 = vm.envAddress("SAFE_SIGNER_3");
        uint256 threshold = vm.envUint("SAFE_THRESHOLD"); // e.g., 2

        address[] memory owners = new address[](3);
        owners[0] = signer1;
        owners[1] = signer2;
        owners[2] = signer3;

        vm.startBroadcast();

        // 1. Deploy singleton (once per chain)
        singleton = address(new Safe());
        console2.log("Safe singleton deployed:", singleton);

        // 2. Deploy factory
        proxyFactory = address(new SafeProxyFactory());
        console2.log("SafeProxyFactory deployed:", proxyFactory);

        // 3. Deploy fallback handler
        fallbackHandler = address(new CompatibilityFallbackHandler());
        console2.log("FallbackHandler deployed:", fallbackHandler);

        // 4. Deploy MultiSendCallOnly
        multiSend = address(new MultiSendCallOnly());
        console2.log("MultiSendCallOnly deployed:", multiSend);

        // 5. Build setup calldata
        bytes memory setupData = abi.encodeWithSelector(
            Safe.setup.selector,
            owners,                    // _owners
            threshold,                 // _threshold
            address(0),                // to (optional delegatecall at setup)
            bytes(""),                 // data (optional)
            fallbackHandler,           // fallbackHandler
            address(0),                // paymentToken
            0,                         // payment
            payable(address(0))        // paymentReceiver
        );

        // 6. Create Safe proxy via factory
        uint256 saltNonce = vm.envOr("SAFE_SALT_NONCE", uint256(0));
        safeProxy = address(
            SafeProxyFactory(proxyFactory).createProxyWithNonce(
                singleton,
                setupData,
                saltNonce
            )
        );
        console2.log("Safe proxy deployed:", safeProxy);

        vm.stopBroadcast();

        // Sanity checks
        require(Safe(payable(safeProxy)).getThreshold() == threshold, "threshold mismatch");
        address[] memory deployedOwners = Safe(payable(safeProxy)).getOwners();
        require(deployedOwners.length == 3, "owner count mismatch");
    }
}
```

### 6.4 Procédure de déploiement

```bash
# 1. Préparer les variables d'env
export SAFE_SIGNER_1=0xAAA...  # adresse EOA signataire 1
export SAFE_SIGNER_2=0xBBB...  # adresse EOA signataire 2
export SAFE_SIGNER_3=0xCCC...  # adresse EOA signataire 3
export SAFE_THRESHOLD=2         # 2-of-3 par exemple
export SAFE_SALT_NONCE=0        # salt pour CREATE2, garder 0 pour la première Safe

# 2. Tester d'abord sur testnet
forge script script/DeploySafe.s.sol \
  --rpc-url https://testnet.rpc.intuition.systems/http \
  --account pm-deployer \
  --broadcast \
  -vvv

# Output attendu:
#   Safe singleton deployed: 0x...
#   SafeProxyFactory deployed: 0x...
#   FallbackHandler deployed: 0x...
#   MultiSendCallOnly deployed: 0x...
#   Safe proxy deployed: 0x...  ← c'est celle-ci qu'on utilise

# 3. Noter les 5 adresses dans doc-multisig-deployed.md
# 4. Valider le flow signing via predictuition-safe CLI (§8)
# 5. Répéter sur mainnet quand testnet est OK
forge script script/DeploySafe.s.sol \
  --rpc-url https://rpc.intuition.systems/http \
  --account pm-deployer \
  --broadcast \
  --verify \
  -vvv
```

### 6.5 Coût de déploiement estimé

Basé sur les gas prices Intuition L3 observés (~0.2 gwei) et la taille du bytecode Safe :

| Contrat | Gas estimé | Coût (à 0.2 gwei) |
|---|---|---|
| Safe singleton | ~4 500 000 | ~0.0009 TRUST |
| SafeProxyFactory | ~600 000 | ~0.00012 TRUST |
| CompatibilityFallbackHandler | ~900 000 | ~0.00018 TRUST |
| MultiSendCallOnly | ~150 000 | ~0.00003 TRUST |
| Safe proxy (createProxyWithNonce) | ~250 000 | ~0.00005 TRUST |
| **Total** | **~6 400 000** | **~0.00128 TRUST** |

Négligeable. Un déploiement complet coûte **moins de 0.002 TRUST**.

### 6.6 Addresses déployées — à remplir

Après le déploiement, créer `doc-multisig-deployed.md` avec les adresses exactes :

```markdown
# Safe déploiement — Intuition Testnet 13579

Date : YYYY-MM-DD
Deployer : 0x... (pm-deployer)

- Safe singleton         : 0x...
- SafeProxyFactory       : 0x...
- CompatibilityFallback  : 0x...
- MultiSendCallOnly      : 0x...
- Safe proxy (owner)     : 0x...
- Signers                : 0xAAA, 0xBBB, 0xCCC
- Threshold              : 2

# Safe déploiement — Intuition Mainnet 1155

Date : YYYY-MM-DD
...
```

Ce fichier doit être commité dans le repo (les adresses sont publiques, seules les clés privées sont secrètes).

---

## 7. Cérémonie de signature sans app.safe.global

Sans `app.safe.global` qui supporte Intuition, on signe les transactions Safe via un processus off-chain manuel. Voici le flow complet.

### 7.1 Vue d'ensemble

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│  Proposeur  │     │  Signer 1   │     │  Signer 2   │     │  Safe    │
│  (any EOA)  │     │  (EOA)      │     │  (EOA)      │     │  onchain │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └────┬─────┘
       │ 1. Generate        │                   │                  │
       │    safeTxHash      │                   │                  │
       │────────────────────┼──────────────────>│                  │
       │                    │                   │                  │
       │ 2. Send hash via   │                   │                  │
       │    Signal/email    │                   │                  │
       │<───────────────────┤                   │                  │
       │                    │  3. Sign hash     │                  │
       │                    │     → sig1        │                  │
       │ 4. Collect sig1    │                   │                  │
       │<───────────────────┘                   │                  │
       │                                        │  5. Sign hash    │
       │                                        │     → sig2       │
       │ 6. Collect sig2                        │                  │
       │<───────────────────────────────────────┘                  │
       │                                                           │
       │ 7. Concatenate sig1+sig2 in signer address order          │
       │                                                           │
       │ 8. Call safe.execTransaction(..., sigs) ──────────────────>│
       │                                                           │
       │ 9. Safe verifies sigs, executes the target call           │
       │                                                           │
```

### 7.2 Étape 1 — Générer le Safe transaction hash

Le proposeur doit calculer le **hash EIP-712 de la transaction Safe**. Ce hash est unique par `(tx params, nonce, safeAddress, chainId)`.

Formule : `safe.getTransactionHash(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce)`

Où pour la plupart des cas de Predictuition :

- `to` = adresse du contrat `PredictionMarket`
- `value` = `0` (sauf pour `rescueNative` qui ne prend pas de value)
- `data` = calldata de la fonction à appeler (ex : `setAllowedTerm(0x..., true)` encodé en ABI)
- `operation` = `0` (Call, pas Delegatecall)
- `safeTxGas` = `0` (auto-estimation)
- `baseGas` = `0`
- `gasPrice` = `0`
- `gasToken` = `address(0)` (pas de refund en token)
- `refundReceiver` = `address(0)`
- `nonce` = `safe.nonce()` à l'instant T (read via `cast call`)

Commande CLI :

```bash
# 1. Construire le calldata de la target fonction
CALLDATA=$(cast calldata "setAllowedTerm(bytes32,bool)" 0x8c486fd3... true)

# 2. Lire le nonce courant de la Safe
NONCE=$(cast call $SAFE "nonce()(uint256)" --rpc-url $RPC_INTUITION)

# 3. Calculer le safeTxHash
SAFE_TX_HASH=$(cast call $SAFE "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
    $PM_ADDRESS \
    0 \
    $CALLDATA \
    0 \
    0 0 0 \
    0x0000000000000000000000000000000000000000 \
    0x0000000000000000000000000000000000000000 \
    $NONCE \
    --rpc-url $RPC_INTUITION)

echo "safeTxHash: $SAFE_TX_HASH"
echo "nonce: $NONCE"
```

### 7.3 Étape 2 — Distribuer le hash aux signataires

Le proposeur envoie aux autres signataires :
- Le `safeTxHash`
- La description de ce que la tx fait (ex : "Add termId 0x8c48.. to allowlist")
- Le nonce utilisé (important : si un autre signataire utilise un nonce différent, le hash sera différent)
- Les paramètres bruts (to, value, data) pour que les signataires puissent **vérifier eux-mêmes** que le hash correspond à ce qu'ils pensent signer

**Important** : ne **jamais** faire confiance au hash fourni par le proposeur sans le recalculer. Chaque signataire devrait reconstruire le hash à partir des params bruts pour éviter une attaque où le proposeur enverrait un faux hash qui correspond à une tx malicieuse.

Distribution possible via : Signal, email chiffré (PGP), document partagé (Google Docs lu par les signers), Keybase, canal Slack interne privé. **Éviter** : Twitter DMs, WhatsApp non-chiffré, SMS.

### 7.4 Étape 3 — Chaque signataire signe

Chaque signataire reçoit le hash, **le re-vérifie** en reconstruisant à partir des params, puis signe avec sa clé privée.

Commande avec Foundry keystore :

```bash
# Le signataire a sa clé dans le keystore chiffré
cast wallet sign $SAFE_TX_HASH --account my-signer-1
# → sortie: 0x<65-byte signature>
```

Avec Ledger :

```bash
cast wallet sign $SAFE_TX_HASH --ledger
# → demande validation sur l'écran du Ledger
```

**Note sur le type de signature** : Safe accepte plusieurs types de signatures (voir `Safe.checkSignatures`) :
- **Type 1 (EOA contract signature)** — pour les EOAs signataires classiques. C'est notre cas. La signature est 65 bytes (r, s, v) avec `v ∈ {27, 28}`.
- **Type 2 (EIP-1271 contract signature)** — si un signer est un smart contract
- **Type 3 (pre-approved hash)** — si un signer a déjà appelé `approveHash(hash)` onchain

Pour Predictuition, **on utilise exclusivement type 1** (EOA signatures). Signing via `cast wallet sign` produit directement le bon format.

**Gotcha** : `cast wallet sign` signe directement le hash (equivalent à `ecrecover`). C'est ce qu'il nous faut. **Ne pas** utiliser `eth_sign` ou `personal_sign` qui ajoutent un préfixe `\x19Ethereum Signed Message:\n32` qui casserait la vérification Safe.

### 7.5 Étape 4 — Collecter les signatures

Le proposeur collecte N signatures (N = threshold). Chaque signataire renvoie sa signature via le même canal chiffré que l'étape 2.

### 7.6 Étape 5 — Concaténer les signatures dans l'ordre

Safe requiert que les signatures soient **concaténées dans l'ordre croissant des adresses signataires** (pas l'ordre d'arrivée). Sinon, `execTransaction` revert.

```bash
# Si signer1 < signer2 (comparaison d'adresse):
# signatures = sig1 || sig2
# Sinon:
# signatures = sig2 || sig1

# Exemple d'un bash simple (à proprement faire dans le CLI helper):
if [ "$SIGNER_1_ADDR" \< "$SIGNER_2_ADDR" ]; then
    SIGS="${SIG_1:2}${SIG_2:2}"  # remove 0x prefix from each
else
    SIGS="${SIG_2:2}${SIG_1:2}"
fi
SIGS="0x$SIGS"
```

Notre CLI helper (§8) automatisera cette concaténation.

### 7.7 Étape 6 — Exécuter

Le proposeur (ou n'importe qui, en fait — le proposeur n'a pas besoin d'être un signataire) appelle `safe.execTransaction` avec tous les params + les signatures concaténées :

```bash
cast send $SAFE \
    "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)" \
    $PM_ADDRESS \
    0 \
    $CALLDATA \
    0 \
    0 0 0 \
    0x0000000000000000000000000000000000000000 \
    0x0000000000000000000000000000000000000000 \
    $SIGS \
    --rpc-url $RPC_INTUITION \
    --account pm-executor \
    -vvv
```

Le compte qui fait le `cast send` (ici `pm-executor`) **n'a pas besoin d'être un signataire** — il n'est que l'**executor** qui paie le gas et broadcast. Il peut être n'importe quelle EOA avec du TRUST pour le gas. Souvent, c'est le proposeur lui-même pour simplifier.

### 7.8 Gestion des erreurs courantes

**`GS013` — Invalid signatures** : une signature est mal formée. Causes courantes :
- Signatures pas dans l'ordre croissant des adresses signataires
- Un signataire a utilisé `personal_sign` au lieu de signer le hash brut (le préfixe `\x19...` a changé le hash)
- Nombre de signatures < threshold
- Un signataire n'est pas dans la liste des owners

**`GS026` — Invalid owner provided** : l'adresse qui a signé n'est pas dans les owners de la Safe

**`GS025` — Invalid threshold** : pas assez de signatures

**`GS004` — Transaction signature verification failed** : une signature ne correspond pas au hash

**Gotcha sur les EIP-712 domain separators** : le Safe calcule le hash avec son propre `DOMAIN_SEPARATOR` qui inclut la `chainId` et la `safeAddress`. Si tu signes un hash calculé sur testnet et tu l'utilises sur mainnet, ça ne marchera pas — les hashes sont chain-specific.

---

## 8. CLI tooling — `predictuition-safe`

Pour éviter aux signataires de taper 50 commandes cast à chaque action, on va fournir un petit outil CLI maison.

### 8.1 Cahier des charges

Un script bash ou un mini outil TypeScript (via Bun, déjà installé) qui expose 3 sous-commandes principales :

```bash
# Propose a new Safe transaction
predictuition-safe propose \
    --target-call "setAllowedTerm(bytes32,bool)" \
    --args "0x8c486fd3...,true" \
    [--value 0]

# Output:
#   Safe tx hash:   0xabcd...
#   Target:         PredictionMarket (0x...)
#   Function:       setAllowedTerm(bytes32,bool)
#   Arguments:      [0x8c486fd3..., true]
#   Nonce:          42
#
#   Send this hash to signers for signing.
#   Signers sign with: predictuition-safe sign <hash>


# Sign a proposed Safe transaction
predictuition-safe sign 0xabcd... --account my-signer-1

# Output:
#   Signer address: 0xAAA...
#   Signature:      0x<130 hex chars>
#
#   Send this signature back to the proposer.


# Execute a Safe transaction with collected signatures
predictuition-safe execute \
    --hash 0xabcd... \
    --sigs 0xsig1,0xsig2 \
    --target-call "setAllowedTerm(bytes32,bool)" \
    --args "0x8c486fd3...,true"

# Output:
#   Verifying signatures...     OK
#   Ordering by signer addr...  [0xAAA, 0xBBB]
#   Broadcasting...
#   tx hash: 0xdef...
#   Waiting for confirmation... OK (block 1234567)
#   PredictionMarket.setAllowedTerm executed successfully.
```

### 8.2 Implémentation proposée

Deux options :

**A — Script bash pur** : utilise `cast` sous le capot, pas de dépendance supplémentaire. ~300 lignes de bash. Facile à review, portable.

**B — Script TypeScript (Bun)** : utilise `viem` pour tout, plus type-safe, meilleure UX d'erreur. ~200 lignes de TS. Dépend de Bun + viem (déjà dans predictuition).

**Ma reco** : **B (TypeScript avec viem)** parce qu'on a déjà bun et viem dans le projet Predictuition. On peut mettre le tool dans `tooling/predictuition-safe/` et l'appeler via `bun tooling/predictuition-safe/cli.ts propose ...`. Pas besoin d'install global.

### 8.3 Structure du tool

```
predictuition/
└── tooling/
    └── predictuition-safe/
        ├── cli.ts              # entry point, parse args
        ├── propose.ts          # command: propose
        ├── sign.ts             # command: sign
        ├── execute.ts          # command: execute
        ├── safe-abi.ts         # Safe contract ABI
        ├── config.ts           # RPC URLs, Safe address per chain
        └── README.md           # usage examples
```

Usage typique :

```bash
# Proposer (assuming env SAFE_ADDRESS, RPC_URL are set)
bun tooling/predictuition-safe/cli.ts propose \
    --function setAllowedTerm \
    --args '["0x8c486fd3...","true"]'

# Signataire 1
bun tooling/predictuition-safe/cli.ts sign 0xabcd... --account signer1

# Signataire 2
bun tooling/predictuition-safe/cli.ts sign 0xabcd... --account signer2

# Executor
bun tooling/predictuition-safe/cli.ts execute \
    --hash 0xabcd... \
    --sigs 0xsig1,0xsig2
```

### 8.4 Édition d'une transaction multi-call (MultiSend)

Pour batcher plusieurs actions en une seule Safe tx (ex : ajouter 5 termIds à l'allowlist en une fois), on utilise le contrat `MultiSendCallOnly` déployé à §6.

Le CLI devrait supporter :

```bash
predictuition-safe propose-batch --calls-file batch.json
```

Avec `batch.json` de la forme :
```json
[
  { "function": "setAllowedTerm", "args": ["0x8c48...", true] },
  { "function": "setAllowedTerm", "args": ["0xa8a4...", true] },
  { "function": "setAllowedTerm", "args": ["0x7ec3...", true] }
]
```

Ce qui produit une seule Safe tx (donc un seul signing ceremony) qui exécute les 3 setAllowedTerm atomiquement. Fait passer la cérémonie hebdomadaire de "30 min par term" à "30 min pour toute la curation de la semaine".

**Scope** : ce batching est une amélioration UX importante mais peut être ajoutée plus tard. Pour le v1 du tool, on commence par les 3 commandes de base (propose/sign/execute).

---

## 9. Sécurité et hygiène des clés

### 9.1 Qui détient les clés ?

Pour un 2-of-3 multi-sig, tu dois choisir **3 personnes/entités indépendantes** qui détiennent chacune une clé. Compromettre une seule n'est pas suffisant pour prendre le contrôle.

**Anti-patterns à éviter absolument** :

- ❌ Les 3 clés sont dans le même password manager → si le password manager fuit, toutes les clés fuient en même temps
- ❌ Les 3 clés appartiennent à la même personne → c'est un 1-of-1 déguisé en 3-of-3
- ❌ Une des 3 clés est sur un serveur connecté à internet → la "valeur" multisig est diluée
- ❌ Les signataires sont sur la même location physique → un incendie/cambriolage emporte tout

**Patterns recommandés** :

- ✅ 3 signataires sont 3 personnes différentes (toi + 2 co-fondateurs/advisors/trusted parties)
- ✅ Chaque signataire utilise un **hardware wallet** (Ledger Nano, Trezor, GridPlus) pour sa clé
- ✅ Un des 3 est une "clé de récupération" dans un coffre physique, utilisable seulement en cas d'urgence
- ✅ Les signataires sont géographiquement distribués (pas tous à Paris, un à Berlin, un à San Francisco…)
- ✅ Des backups chiffrés des seed phrases dans un coffre (acier gravé ou papier dans une enveloppe scellée, dans un coffre bancaire)

### 9.2 Threshold recommandé

Pour v1 de Predictuition :

**2-of-3** est le sweet spot pour la plupart des projets early-stage :
- Pas de single point of failure (besoin de 2 compromissions)
- Tolerant à la perte d'une clé (si tu perds ta clé, les 2 autres peuvent reconfig)
- Cérémonie de signing pas trop lourde (2 personnes à coordonner vs 3)

**3-of-5** est overkill pour v1 mais peut être utile quand le projet aura grossi (ajouter 2 advisors/investors comme co-signers).

**1-of-1** n'est pas un multisig — c'est une EOA avec des étapes supplémentaires. À proscrire.

**3-of-3** est dangereux — si une seule clé est perdue, la Safe est bricked pour toujours (impossible d'atteindre le threshold).

### 9.3 Hardware wallets et signature EIP-712

**Gotcha critique** : Ledger supporte `eth_sign` et `eth_signTypedData_v4`, mais le flow Safe utilise des hashs bruts (32 bytes). Il faut donc utiliser le mode "blind signing" du Ledger, qui affiche le hash sur l'écran du device — pas super UX car tu ne vois pas ce que tu signes directement.

**Alternative** : activer "Clear signing" pour Safe dans l'app Ethereum de Ledger. Les versions récentes de l'app supportent l'affichage clair des paramètres Safe (to, value, data decoded). À vérifier que ça marche sur Intuition (chain 1155 non-officielle).

**Workaround si clear signing ne marche pas** : chaque signataire doit manuellement recalculer le hash à partir des params avant de signer en blind. Le CLI helper facilite ça en affichant les params bruts.

### 9.4 Rotation des signataires

**Quand** :
- Un signataire quitte l'équipe → remplacer immédiatement
- Une clé est suspectée compromise → révoquer immédiatement
- Rotation planifiée tous les 6-12 mois → bonne pratique générale

**Comment** :
La Safe expose `swapOwner(prevOwner, oldOwner, newOwner)` pour remplacer un signataire. C'est une **tx Safe elle-même**, donc elle doit être signée par threshold signataires. Processus :
1. Proposer une tx `swapOwner(...)` via le CLI predictuition-safe
2. Threshold signataires signent (y compris l'ancien signataire si tu as encore accès à sa clé)
3. Executer

**Edge case** : si le signataire est compromis et refuse de coopérer, les autres signataires peuvent toujours l'expulser **tant qu'ils ont le threshold ensemble**. Exemple : 2-of-3 avec Alice compromise, Bob+Carol peuvent signer `swapOwner(Alice, newSigner)` sans la participation d'Alice.

### 9.5 Emergency recovery

**Si tu perds `threshold` clés ou plus** : la Safe est **définitivement bricked**. Plus aucune action owner possible sur le PredictionMarket. Les fonds dans les pools actifs sont toujours recouvrables par les users via `sell`, `redeem`, `merge` (ces fonctions ne sont pas onlyOwner). Mais :
- Plus de pause possible en cas d'urgence
- Plus de `emergencyRefund` possible
- Plus de `rescueNative` possible
- Plus de `setAllowedTerm` → plus de nouveaux markets créés (rate limit global via allowlist vide)

**Mitigation** : toujours avoir au moins **threshold+1 clés sécurisées**. Pour un 2-of-3, garder les 3 clés distinctes en sécurité. Ne jamais perdre 2 en même temps.

**Backup plan extrême** : si tout tombe, le contrat PredictionMarket ne peut plus être administré mais reste fonctionnel en lecture et en sell/redeem/merge. Les users peuvent toujours sortir leurs fonds. Le projet est "mort" mais pas "volé".

---

## 10. Migration EOA → Safe

### 10.1 Scénario : tu as déployé le PredictionMarket avec `PM_OWNER = EOA` (testnet ou mainnet initial)

Transfer d'ownership vers une Safe fraîchement déployée :

**Pattern `Ownable2Step`** (utilisé par le contrat, voir doc.md §7.1) :

1. L'EOA owner actuelle appelle `transferOwnership(safeAddress)` — propose le transfert
2. La Safe doit ensuite appeler `acceptOwnership()` pour accepter. Cette 2e étape nécessite que la Safe soit déjà déployée et fonctionnelle sur 1155.

Processus complet :

```bash
# 1. Déployer Safe sur 1155 (voir §6)
forge script script/DeploySafe.s.sol --rpc-url intuition --account pm-deployer --broadcast

# 2. L'EOA owner propose le transfert
cast send $PM_ADDRESS "transferOwnership(address)" $SAFE_ADDRESS \
    --rpc-url intuition \
    --account pm-owner-eoa

# 3. La Safe accepte via une cérémonie de signing
#    (premier usage du flow predictuition-safe)
bun tooling/predictuition-safe/cli.ts propose \
    --target $PM_ADDRESS \
    --function acceptOwnership \
    --args '[]'

# → signing ceremony → execute

# 4. Vérifier
cast call $PM_ADDRESS "owner()(address)" --rpc-url intuition
# → doit retourner l'adresse de la Safe

# 5. L'EOA pm-owner-eoa n'a plus aucun pouvoir
```

**Pourquoi Ownable2Step et pas simple Ownable** : le pattern 2-step protège contre le cas où tu transfères accidentellement à une adresse incorrecte. Si la nouvelle adresse ne peut pas appeler `acceptOwnership` (par exemple parce qu'elle n'existe pas onchain ou n'a pas les bons signataires), l'ownership reste à l'ancienne adresse. Safety net.

### 10.2 Quand faire la migration ?

**Testnet** : jamais. Reste en EOA pour itérer vite.

**Mainnet** : **avant le premier market créé en production**. Une fois qu'il y a des fonds users dans le contrat, la migration reste possible mais devient un événement plus sensible (les users te regardent, tout doit être smooth).

**Timeline idéale** :
```
J-7  : Finaliser le contrat PredictionMarket (code freeze)
J-6  : Audit externe commence
J-3  : Audit externe terminé, fixes mineurs intégrés
J-2  : Déployer PredictionMarket sur mainnet avec PM_OWNER = EOA
J-2  : Déployer Safe sur mainnet (§6)
J-2  : Transférer ownership vers la Safe (§10.1)
J-1  : Tester toutes les fonctions owner via cérémonie de signing (§7)
J-1  : Ajouter les premiers termIds à l'allowlist (batch via MultiSend)
J    : Go-live, activer le keeper bot
```

---

## 11. Procédures opérationnelles

### 11.1 Routine hebdomadaire : curation de l'allowlist

**Une fois par semaine**, l'équipe revue les top atoms/triples Intuition et met à jour l'allowlist. Procédure :

1. **Analyse off-chain** (mardi matin, par exemple) :
   - Query Hasura `mainnet.intuition.sh/v1/graphql` pour les top atoms/triples par position_count
   - Filtrer ceux avec `position_count >= 5` et TVL `>= 1000 TRUST`
   - Identifier les changements vs la semaine précédente :
     - Nouveaux termIds à ajouter
     - Termids à retirer (devenus inactifs, spam, etc.)

2. **Proposition** (mardi après-midi) :
   - Le proposeur (toi ou un ops) construit un batch JSON `batch.json` avec tous les adds/removes
   - Run `predictuition-safe propose-batch --calls-file batch.json`
   - Récupère le safeTxHash

3. **Distribution aux signataires** (mardi soir) :
   - Envoi du hash + description + params bruts via canal chiffré
   - Chaque signataire vérifie indépendamment et signe

4. **Exécution** (mercredi matin) :
   - Proposeur collecte les sigs, exécute `predictuition-safe execute`
   - Allowlist est à jour
   - **Délai de 24h du timelock** : l'action n'est pas immédiate. Elle est `queue` dans le TimelockController et devient exécutable 24h plus tard.

5. **Finalisation** (jeudi matin, après les 24h du timelock) :
   - Appeler `TimelockController.execute(...)` pour effectivement appliquer le changement
   - Cette 2e étape ne requiert **pas** de signing ceremony (le timelock expose une fonction publique ou onlyExecutor sans threshold)

**Temps total** : ~45 min de travail humain, étalé sur 2 jours. Acceptable pour une fréquence hebdomadaire.

### 11.2 Incident : keeper compromis

**Detection** : via monitoring off-chain des events `MarketCreated` (pattern anormal, burst de créations, termIds non-vus en allowlist cache, etc.)

**Réponse** :

1. **Phase 1 — Damage control immédiat** (minutes) :
   - Un signataire appelle `pause()` via propose → mais PAUSE est INSTANT (pas de timelock), donc :
   - Un membre du multisig signe directement une `pause()` tx → 2 signataires valident en 5-10 min → exécuté
   - Le contrat est pausé. Plus aucun `createMarket`, `buy`, `addLiquidity`.
   - Les utilisateurs existants peuvent toujours `sell`, `redeem`, `merge`. Aucun fonds bloqué.

2. **Phase 2 — Révocation du keeper compromis** (minutes) :
   - Même flow : propose `setKeeper(newKeeperAddress)` avec une EOA fresh → signing ceremony → execute
   - Nouveau keeper est en place

3. **Phase 3 — Forensics** (heures) :
   - Identifier ce que l'attaquant a fait sur la période de compromission
   - Des marchés spam ont-ils été créés ? Si oui, owner peut `emergencyRefund` chacun
   - Investiguer comment la clé a été compromise (serveur, fuite, exploit, malware)

4. **Phase 4 — Reprise** (après le post-mortem) :
   - `unpause()` une fois le nouveau keeper et les fixes d'infra validés

**Temps de réponse minimum** : 15 min si tous les signataires sont disponibles rapidement. C'est pourquoi le multisig doit privilégier 2-of-3 (2 signataires à coordonner, pas 3) et les signataires doivent être sur des fuseaux horaires distincts (au moins un doit être awake 24/7 indirectement).

### 11.3 Incident : signataire perd sa clé ou part

**Detection** : un signataire te contacte ("j'ai perdu mon Ledger", "je quitte l'équipe", etc.)

**Réponse** :

1. **Immédiat** : considère ce signataire comme non-fiable. Ne lui envoie plus de hashs à signer.

2. **Dans les 24h** : cérémonie de `swapOwner` avec les threshold signataires restants :
   - Propose `swapOwner(prevOwner, lostSignerAddr, newSignerAddr)` où `prevOwner` est l'owner précédent dans la linked list interne de Safe
   - Les 2 autres signataires signent et exécutent
   - Le signataire perdu est remplacé par une nouvelle adresse (toi, un nouveau co-fondateur, un advisor)

3. **Post-incident** : vérifier que le nombre effectif de signataires actifs est toujours `>= threshold`. Si non, tu es en danger (1 de plus perdu = Safe bricked).

---

## 12. Alternatives rejetées

### 12.1 Timelock onchain pur (sans multisig)

Un `TimelockController` avec 1 proposer EOA + delay 48h au lieu d'une Safe.

**Pour** : simple, onchain, 0 cérémonie de signing
**Contre** : 1 seul proposer = 1-of-1 avec délai. Une clé compromise = tout est compromis après 48h. Le delay ne fait que donner plus de temps à la détection, pas à la prévention.
**Conclusion** : **Rejeté** pour mainnet. Pas de défense en profondeur réelle, demande de la détection manuelle perpétuelle.

### 12.2 Safe fork self-hosted avec backend custom

Forker `safe-wallet-web` et déployer une UI Safe custom connectée à un node Intuition + un SafeTransactionService self-hosted.

**Pour** : UX familière pour les signataires (pas de CLI)
**Contre** : 3-5 jours d'infra + maintenance perpétuelle + base de données à héberger. Risque de drift avec l'upstream Safe
**Conclusion** : **Différé post-v1**. Si la cadence opérationnelle devient quotidienne, à reconsidérer. Pour du hebdo, pas justifié.

### 12.3 Bridging via LayerZero/Axelar/Wormhole

Signer sur la Safe Ethereum mainnet, relayer la signature via un bridge vers un relay contract sur 1155.

**Pour** : réutilise la Safe existante
**Contre** : **aucun bridge n'est déployé sur Intuition L3 aujourd'hui**. Ajout d'une dépendance infra externe. Coût gas cross-chain. Risque de bridge hack (Ronin, Wormhole, Nomad).
**Conclusion** : **Rejeté définitivement** pour v1.

### 12.4 Social recovery via Argent-style guardians

Utiliser une Safe qui supporte la "social recovery" : un ensemble de "guardians" peut voter pour réinitialiser les signataires si les clés sont perdues.

**Pour** : backup en cas de perte de clés
**Contre** : Safe standard ne supporte pas nativement. Il faut un module custom. Complexité en plus.
**Conclusion** : **Nice-to-have v2**. Safe Guard Modules existent (ex : `Zodiac Recovery Module`). À explorer une fois que v1 est stable.

### 12.5 Biconomy / Gnosis Chain / autre chaîne dédiée multisig

Déployer le multisig sur une autre chaîne et cross-exécuter sur 1155.

**Pour** : utilisation de Safes sur une chaîne où Safe est déjà supporté
**Contre** : double la complexité, nécessite un bridge sécurisé (inexistant sur Intuition)
**Conclusion** : **Rejeté**

### 12.6 DAO token-weighted governance

Émettre un token PREDIC et donner le pouvoir de gouvernance aux holders via Governor + Timelock.

**Pour** : décentralisation pure
**Contre** : prématuré pour v1. Demande un tokenomic design, un legal review, un bootstrap de holders. Out of scope.
**Conclusion** : **v2 lointain**. Documenté dans doc.md §10 roadmap.

---

## 13. Timeline et checklist

### 13.1 Effort estimé

| Phase | Tâche | Durée | Bloquant |
|---|---|---|---|
| Préparation | Choisir les 3 signataires | 1 jour | Decision humaine |
| Préparation | Générer 3 wallets (hardware + software hybride) | 0.5 jour | Livraison hardware |
| Préparation | Tester chaque wallet individuellement | 0.5 jour | - |
| Dev | Cloner safe-smart-account, vendoriser dans `lib/` | 0.5 jour | - |
| Dev | Écrire `DeploySafe.s.sol` | 0.5 jour | - |
| Dev | Tester sur testnet 13579 | 0.5 jour | tTRUST via faucet |
| Dev | Écrire `tooling/predictuition-safe/` CLI | 1.5 jours | - |
| Dev | Tester la cérémonie de signing complète | 0.5 jour | - |
| Docs | Finaliser procédures pour les signataires | 0.5 jour | - |
| Deploy | Déployer Safe sur mainnet 1155 | 0.5 jour | Prérequis 1-9 |
| Deploy | Transférer ownership PredictionMarket | 0.5 jour | Prérequis 10 |
| Deploy | Populate allowlist (premier batch) | 0.5 jour | Prérequis 11 |
| **Total** | | **~7-8 jours** | |

**En parallèle** du développement du contrat PredictionMarket (~10 jours), le setup Safe peut être fait en overlap, pour que les 2 soient prêts en même temps pour le go-live.

### 13.2 Checklist pré-mainnet

À valider **avant** de déployer la Safe sur mainnet :

- [ ] 3 signataires identifiés et contactés, chacun a accepté la responsabilité
- [ ] Threshold choisi (recommandé : 2/3)
- [ ] 3 hardware wallets commandés et testés
- [ ] 3 seed phrases backup dans un coffre physique (gravé acier ou papier scellé)
- [ ] Le `DeploySafe.s.sol` a été testé sur testnet 13579 et la Safe résultante fonctionne
- [ ] La cérémonie de signing a été répétée au moins 1 fois sur testnet avec une tx non-critique
- [ ] Le CLI `predictuition-safe` est fonctionnel et documenté
- [ ] Les procédures (routine hebdo, incident keeper, incident signataire) sont écrites et comprises par l'équipe
- [ ] Un canal de communication chiffré (Signal group ou équivalent) est en place entre les signataires
- [ ] Un monitoring alert existe pour les events onchain critiques (MarketCreated, KeeperUpdated, etc.)

### 13.3 Checklist post-déploiement Safe mainnet

- [ ] Safe déployée à une adresse notée dans `doc-multisig-deployed.md`
- [ ] `cast call $SAFE "getThreshold()(uint256)"` retourne le threshold attendu
- [ ] `cast call $SAFE "getOwners()(address[])"` retourne les 3 signataires attendus
- [ ] Une tx test triviale a été exécutée avec succès via la cérémonie de signing
- [ ] Le PredictionMarket a été transféré à la Safe via Ownable2Step
- [ ] `cast call $PM "owner()(address)"` retourne l'adresse de la Safe
- [ ] L'ancienne EOA owner (si utilisée) a été confirmée sans pouvoir
- [ ] Les signataires ont été formés sur la procédure d'incident keeper

---

## Annexe A — Références et liens

- Safe smart contracts (source) : `https://github.com/safe-global/safe-smart-account`
- Safe contracts audits : `https://github.com/safe-global/safe-smart-account/tree/main/docs/audits`
- Safe canonical deployments : `https://github.com/safe-global/safe-deployments`
- Safe deployment script officiel (pour référence) : `https://github.com/safe-global/safe-deployments/tree/main/src`
- EIP-712 spec : `https://eips.ethereum.org/EIPS/eip-712`
- Ownable2Step (OpenZeppelin) : `https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable2Step`
- Skill `security/` ethskills : `https://ethskills.com/security/SKILL.md`
- Skill `wallets/` ethskills : `https://ethskills.com/wallets/SKILL.md`

---

## Annexe B — Questions ouvertes à trancher avec le user

Avant de démarrer l'implémentation de ce plan multisig, il reste quelques décisions à prendre avec le user :

1. **Qui sont les 3 signataires ?** Toi + 2 autres personnes de confiance. Les identités exactes déterminent les clés à générer.

2. **Threshold : 2-of-3 ou 3-of-5 ?** Ma reco est 2-of-3 pour v1. 3-of-5 devient pertinent quand l'équipe grossit au-delà de 3 personnes.

3. **Hardware wallets : Ledger, Trezor, GridPlus ?** Tous fonctionnent. Ledger est le plus courant et testé avec Safe. GridPlus est plus sécurisé mais plus cher. Recommandé : Ledger Nano S Plus ou X.

4. **Budget temps pour le setup Safe manuel (~7-8 jours) acceptable ?** Si non, fallback sur Option C (EOA) pour v1 mainnet avec rotation régulière, migration Safe en v1.1.

5. **Le user fait-il le signing ceremony lui-même pour les 3 signataires** (les 3 clés lui appartiennent), ou y a-t-il vraiment 3 personnes distinctes impliquées ? Cette question change radicalement le modèle de sécurité — voir §9.1 anti-patterns.

6. **Souhait d'une UI Safe fork self-hosted en v1.5** (~3 jours de setup additionnel) pour un workflow plus propre ? Pas bloquant pour v1.

---

## Fin du document

Ce plan est un companion de `doc.md` et se focalise exclusivement sur l'ownership multisig. Toute décision ici doit rester cohérente avec l'architecture du contrat PredictionMarket décrite dans `doc.md`.

**Prochaine action suggérée** : répondre aux questions de l'annexe B avec le user, puis commencer l'implémentation en parallèle du développement du contrat PredictionMarket (voir `doc.md` §12 pour la suite).
