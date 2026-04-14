# Predictuition — Smart Contract Design Doc (v2 CPMM)

Version verrouillée le 2026-04-13. Remplace la spec v1 parimutuel précédemment archivée. Cette version est la **cible actuelle** pour le développement.

**⚠️ Note sur le code existant dans `contracts/`** : le code Solidity actuellement dans `contracts/src/PredictionMarket.sol` implémente la v1 parimutuel. Il doit être **entièrement réécrit** pour correspondre à cette spec v2. Les 36 tests unit et 5 tests fork existants servent de référence pour les patterns Foundry mais leur logique métier est obsolète.

---

## Changelog v1 → v2

- **Pivot du modèle de marché** : parimutuel binaire → **CPMM (Constant Product Market Maker)** avec outcome positions internes
- **Oracle de résolution** : lecture spot à `deadline + 15 min` → **TWAP sur 12 observations dans l'heure avant deadline**
- **Architecture** : contrat unique monolithique (au lieu de 3 contrats dans l'itération intermédiaire), conformément au principe "three contracts is the upper bound for an MVP" du skill pack ethskills
- **Price discovery** : ratio de pool discret post-bet → **continuous real-time** via view functions lues par bloc
- **Liquidity provision** : aucune → **LPs permissionless** avec LP shares internes et fees
- **Secondary exit** : impossible jusqu'à résolution → **sell via CPMM à tout moment**
- **Target audience** : users Intuition uniquement → **ouverture élargie** (industrial-grade v1)
- **Sécurité** : basique → **defense in depth** (timelock, invariant fuzz testing, CEI systématique, observer incentivization)

---

## Table des matières

1. [Contexte et objectif](#1-contexte-et-objectif)
2. [Architecture générale](#2-architecture-générale)
3. [Rôles et permissions](#3-rôles-et-permissions)
4. [Mécanismes](#4-mécanismes)
   - 4.1 [Création d'un marché](#41-création-dun-marché)
   - 4.2 [CPMM buy (achat de YES ou NO)](#42-cpmm-buy)
   - 4.3 [CPMM sell (vente de YES ou NO)](#43-cpmm-sell)
   - 4.4 [Liquidity provision](#44-liquidity-provision)
   - 4.5 [TWAP observations](#45-twap-observations)
   - 4.6 [Résolution](#46-résolution)
   - 4.7 [Redemption et merge](#47-redemption-et-merge)
   - 4.8 [Emergency refund](#48-emergency-refund)
   - 4.9 [Rescue dust](#49-rescue-dust)
5. [Paramètres calibrés](#5-paramètres-calibrés)
6. [Interface Solidity](#6-interface-solidity)
7. [Sécurité — defense in depth](#7-sécurité)
8. [Alternatives considérées et rejetées](#8-alternatives-considérées-et-rejetées)
9. [Limitations connues v1](#9-limitations-connues-v1)
10. [Roadmap v2 — migration multi-contrat](#10-roadmap-v2--migration-multi-contrat)
11. [Intégration frontend](#11-intégration-frontend)
12. [Annexes](#12-annexes)

---

## 1. Contexte et objectif

**Predictuition** est un prediction market standalone dont les questions portent exclusivement sur des métriques onchain du protocole Intuition. La résolution est **trustless** : le contrat lit `getVault(termId, curveId)` du MultiVault via TWAP sur la dernière heure avant la deadline. Zéro oracle externe, zéro dispute humaine, zéro comité.

Le contrat PM reste **strictement read-only** vis-à-vis d'Intuition : il ne stake pas, ne dépose pas, ne modifie rien. Il lit l'état onchain et tranche mathématiquement.

### Objectifs v2 (nouveaux)

1. **Industrial-grade security dès v1** — defense in depth, timelock sur config sensible, invariant fuzz testing, external audit avant mainnet
2. **Continuous price discovery temps réel** — les users voient le prix bouger en live à chaque trade (comme Polymarket)
3. **Secondary exit permissionless** — un parieur peut sortir sa position à tout moment via le CPMM, pas de lock jusqu'à résolution
4. **Liquidity bootstrap** — des LPs permissionless peuvent ajouter/retirer de la liquidité et gagner des fees
5. **Audience élargie** — le design ne présuppose plus que les users sont des pros d'Intuition. Il doit être compréhensible pour n'importe quel utilisateur DeFi habitué à Uniswap/Polymarket.

### Ce qui reste inchangé depuis v1

- Métrique prédite : **`total_assets` (TVL)** du MultiVault (validation : share_price trop stable pour être prédictible, voir annexes)
- Template unique : **`TvlOverUnder`** (YES si TVL monte, NO si baisse)
- Durées : **1h / 1d / 1m**
- Pas de Bracket, pas de Sentiment ratio (reportés v2-final)
- Trustless resolution par read direct du MultiVault
- Native token : **TRUST** (18 decimals)

---

## 2. Architecture générale

**Un seul contrat déployé.** La logique CPMM, les outcome positions, les LP shares, les observations TWAP, les rôles keeper/owner, le rescue, le pausable — tout tient dans un contrat monolithique nommé `PredictionMarket`.

```
┌─────────────────────────────────────────────────────────────────┐
│  PredictionMarket.sol  (~1500 lignes)                           │
│                                                                 │
│  Per-market state (struct Market) :                             │
│   - termId, curveId, duration                                   │
│   - totalAssets0  (T0 snapshot at creation)                     │
│   - yesReserve, noReserve   ← CPMM pools                        │
│   - lpSupply                ← total LP shares emitted           │
│   - state: Active / Resolved / Refunded                         │
│   - winningSide                                                 │
│   - observationCount, observationHead                           │
│   - accumulatedProtocolFees                                     │
│   - feesForObservers (accumulated, distributed at resolve)      │
│                                                                 │
│  Per-user balances (mappings)                                   │
│   - yesBalance[marketId][user]                                  │
│   - noBalance[marketId][user]                                   │
│   - lpBalance[marketId][user]                                   │
│   - isObserver[marketId][user]                                  │
│                                                                 │
│  Per-market ring buffers (mappings)                             │
│   - observations[marketId][0..11]                               │
│                                                                 │
│  Keeper governance (inline from KeeperExecutor)                 │
│   - allowedTerms[termId]   ← owner-managed allowlist            │
│   - lastCreationWindow, createdInWindow  ← rate limit           │
│   - lastMarketOfTerm[termId][duration]   ← anti-dup             │
│                                                                 │
│  Invariants                                                     │
│   - totalLocked  (collateral owed to users + LPs + recipients) │
│                                                                 │
│  External functions (see §6 for full interface)                 │
│   - createMarket, addLiquidity, removeLiquidity                 │
│   - buyYes, buyNo, sellYes, sellNo                              │
│   - observe, resolve, redeem, merge                             │
│   - owner-only: pause, setFee, setCaps, setKeeper,              │
│     setAllowedTerm, emergencyRefund, rescueNative, rescueERC20  │
└─────────┬───────────────────────────────────────────────────────┘
          │ view calls only (read-only)
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  MultiVault (external, Intuition L3)                            │
│  <TBD: MultiVault address set via env at deploy>               │
│  - getVault(bytes32, uint256) → (totalAssets, totalShares)      │
│  - bondingCurveConfig() → (registry, defaultCurveId)            │
└─────────────────────────────────────────────────────────────────┘
```

### Dépendances externes minimales

- **OpenZeppelin v5.6.1** : `Ownable2Step` (transfer ownership safely), `Pausable`, `ReentrancyGuardTransient` (cancun cheap lock), `SafeERC20` (rescue ERC20), `TimelockController` (pour les fonctions sensibles)
- **Pas d'autres dépendances**. Pas de Uniswap SDK, pas de CTF, pas de bibliothèque de math externe (la math CPMM est simple et inline)

### Raisons architecturales (voir §8 pour les alternatives rejetées en détail)

- **Monolithique plutôt que multi-contrat** : le skill `ship/` d'ethskills explicite "three contracts is the upper bound for an MVP". Prediction markets sont catégorisés comme "1-2 contracts" max. Notre design tient en 1.
- **Internal positions plutôt qu'ERC20 outcome tokens** : pas de factory, pas de clone EIP-1167, pas de composability DeFi (qui n'existe pas sur Intuition L3 aujourd'hui). Migration v2 documentée §10.
- **Keeper allowlist inline plutôt que contrat séparé** : même raison de minimalisme. La logique de rate limit/allowlist fait ~80 lignes et vit dans les modifiers de `createMarket`.

---

## 3. Rôles et permissions

Trois adresses privilégiées, **strictement distinctes**, plus un rôle permissionless.

### 3.1 `keeper` — l'automatisme contraint

- **Identité** : une EOA chaude contrôlée par l'équipe Predictuition, tournant sur un VPS avec cron bot. **Clé générée dédiée, jamais utilisée ailleurs.**
- **Unique pouvoir** : appeler `createMarket(bytes32 termId, uint256 curveId, Duration d)`, avec **les contraintes suivantes enforced onchain** :
  - `allowedTerms[termId] == true` — termId doit être dans l'allowlist, sinon revert
  - `curveId == defaultCurveId` — curveId hardcodé à 1, pas de flexibilité
  - Rate limit : max 4 `createMarket` par fenêtre glissante de 1 heure
  - Anti-dup : impossible de créer un 2e marché sur `(termId, duration)` si le précédent n'est pas expiré
- **Révocable** en 1 tx par l'owner Safe via `setKeeper(address)`.
- **Blast radius si clé compromise** : l'attaquant peut créer au maximum 4 marchés par heure sur des termIds déjà légitimement dans l'allowlist. **Aucune différence fonctionnelle avec un comportement normal.** Il ne peut pas :
  - Créer sur des termIds hors allowlist (bloqué)
  - Drainer des fonds (keeper n'a aucun privilège sur les pools)
  - Modifier les paramètres (onlyOwner pour tout le reste)
  - Appeler `resolve`, `redeem`, `rescue` (permissionless ou onlyOwner)

### 3.2 `owner` — Gnosis Safe 2/3 tiers indépendant

- **Identité** : multisig Gnosis Safe, adresse `<TBD — Safe à déployer sur Intuition L3, voir doc-multisig.md>`
- **Pouvoirs administratifs** (certains timelockés) :

  **Instantanés (action d'urgence)** :
  - `pause()` / `unpause()` — gèle les entrées mais préserve les sorties (voir §7.1)
  - `setKeeper(address)` — révocation immédiate d'un keeper compromis
  - `emergencyRefund(marketId)` — force un market en état Refunded si MultiVault revert ou term invalidé
  - `rescueNative` / `rescueERC20` — recover dust

  **Timelockés (24h via `TimelockController` d'OZ)** :
  - `setFee(uint256 lpFeeBps, uint256 protocolFeeBps, uint256 observerFeeBps)` — changement de la répartition des fees
  - `setMaxCollateralPerMarket(uint256)` — changement du cap TVL par marché
  - `setObservationWindow(uint64)` — changement de la fenêtre TWAP
  - `setFeeRecipient(address)` — changement de la destination des protocol fees
  - `allowTerm(bytes32)` / `disallowTerm(bytes32)` — gestion de l'allowlist keeper

- **Limitations strictes** :
  - Ne peut **pas** forcer un résultat de marché (`winningSide` est déterminé uniquement par `resolve()` qui lit le MultiVault)
  - Ne peut **pas** saisir les fonds des users/LPs (le rescue ne touche que le dust = `balance - totalLocked`)
  - Ne peut **pas** modifier les positions d'un user
  - Ne peut **pas** bypasser le timelock (les config changes sensibles attendent 24h par design)

### 3.3 `feeRecipient` — même adresse que owner (par défaut)

- Adresse : `<TBD>` (même Safe que owner par défaut)
- Reçoit le protocol fee (0.5% de chaque swap) et les fees du `emergencyRefund`
- Settable par owner via timelock

### 3.4 `user` — le participant

- N'importe quelle adresse externe
- Peut : `buy`, `sell`, `addLiquidity`, `removeLiquidity`, `redeem`, `merge`, `observe`

### 3.5 Permissionless — `resolve`, `observe`, `redeem`

- **`resolve(marketId)`** : après `deadline + 15 minutes`, n'importe qui peut déclencher. Incentive naturelle : les gagnants veulent leur paiement, ils resolve avant de redeem.
- **`observe(marketId)`** : pendant l'heure avant deadline, n'importe qui peut pousser une observation TWAP. Incentive explicite : les observers se partagent 0.1% des swap fees accumulées au `resolve`, distribué pro-rata au nombre d'observations uniques.
- **`redeem(marketId)`** : après `resolved` ou `refunded`, n'importe qui peut claim sa position.

---

## 4. Mécanismes

### 4.1 Création d'un marché

```solidity
function createMarket(
    bytes32 termId,
    uint256 curveId,
    Duration d
) external onlyKeeper whenNotPaused returns (uint256 marketId);
```

**Étapes internes** :

1. **Check allowlist** : `require(allowedTerms[termId], "term not allowed")`. Protège contre un keeper compromis qui voudrait créer sur un termId manipulé.
2. **Lock curveId** : `require(curveId == defaultCurveId, "curveId locked")`. On ne supporte que la curve 1 en v1.
3. **Rate limit check** :
   ```
   if (block.timestamp >= lastCreationWindow + 1 hours) {
       lastCreationWindow = block.timestamp;
       createdInWindow = 0;
   }
   require(createdInWindow < 4, "rate limited");
   createdInWindow++;
   ```
4. **Anti-duplication** : vérifier qu'il n'existe pas déjà un marché actif sur `(termId, duration)` :
   ```
   uint256 prevMarketId = lastMarketOfTerm[termId][duration];
   if (prevMarketId != 0) {
       Market storage prev = _markets[prevMarketId];
       require(prev.state != State.Active || block.timestamp >= prev.deadline, "prev still active");
   }
   ```
5. **Snapshot T0 (spot)** : `(uint256 totalAssets0, ) = multiVault.getVault(termId, curveId)`. Le snapshot à la création est **spot**, pas TWAP, parce qu'il n'y a pas d'historique d'observations à la création. C'est acceptable parce que la création est `onlyKeeper` et le keeper est honnête (contraint par l'allowlist). La manipulation T0 nécessiterait de compromettre à la fois la clé keeper ET de contrôler la TVL Intuition au moment pile du `createMarket`, ce qui n'est pas rentable.
6. **Require non-empty term** : `require(totalAssets0 > 0, "dead term")`.
7. **Compute deadline** :
   ```
   uint64 deadline = uint64(block.timestamp + _durationSeconds(d));
   ```
8. **Seed liquidity initial** : le contrat reçoit `INITIAL_LIQUIDITY` TRUST (par défaut 25 TRUST) depuis le `keeper` lui-même (msg.value du createMarket), ou depuis une trésorerie dédiée. Cette liquidité split en `INITIAL_LIQUIDITY` YES + `INITIAL_LIQUIDITY` NO dans les réserves du marché. Le keeper reçoit des LP shares correspondantes (il peut les retirer après résolution comme n'importe quel LP).
9. **Store market state** :
   ```
   _markets[nextMarketId] = Market({
       termId: termId,
       curveId: curveId,
       totalAssets0: totalAssets0,
       createdAt: uint64(block.timestamp),
       deadline: deadline,
       yesReserve: uint128(INITIAL_LIQUIDITY),
       noReserve: uint128(INITIAL_LIQUIDITY),
       lpSupply: uint128(INITIAL_LIQUIDITY),
       duration: d,
       state: State.Active,
       winningSide: Side.Yes,  // placeholder
       observationCount: 0,
       observationHead: 0,
       feesForObservers: 0
   });
   _lpBalance[nextMarketId][msg.sender] = INITIAL_LIQUIDITY;
   lastMarketOfTerm[termId][duration] = nextMarketId;
   totalLocked += INITIAL_LIQUIDITY;
   emit MarketCreated(nextMarketId, termId, curveId, d, totalAssets0, deadline);
   marketId = nextMarketId++;
   ```

**Note sur le seed liquidity** : le keeper doit avoir `INITIAL_LIQUIDITY` TRUST disponible à chaque appel. Opérationnellement, cela signifie que le keeper wallet doit être rechargé régulièrement. Alternative : le contrat expose une `treasuryBalance` pré-fundée par le Safe, et `createMarket` décrémente cette balance au lieu d'exiger `msg.value`. Ma reco : **treasury pré-fundée**, plus propre, le keeper n'a à gérer que son gas.

### 4.2 CPMM buy

```solidity
function buyYes(uint256 marketId, uint256 minYesOut)
    external
    payable
    whenNotPaused
    nonReentrant
    returns (uint256 yesOut);

function buyNo(uint256 marketId, uint256 minNoOut)
    external
    payable
    whenNotPaused
    nonReentrant
    returns (uint256 noOut);
```

**Logique mathématique (cas `buyYes`)** :

Le user dépose `msg.value` TRUST. Le contract :

1. **Déduit les fees** :
   ```
   lpFee = msg.value * LP_FEE_BPS / 10000           // 1.5%
   protocolFee = msg.value * PROTOCOL_FEE_BPS / 10000   // 0.5%
   observerFee = msg.value * OBSERVER_FEE_BPS / 10000   // 0.1%
   trustInAfterFee = msg.value - lpFee - protocolFee - observerFee
   ```
   Le `lpFee` reste dans le pool (augmente `k` au profit des LPs). Le `protocolFee` est accumulé dans `accumulatedProtocolFees[marketId]` et envoyé à `feeRecipient` au `resolve`. Le `observerFee` est accumulé dans `feesForObservers[marketId]` et distribué aux observers au `resolve`.

2. **Split TRUST en YES + NO virtuel** (incrément des réserves) :
   ```
   yesReserveNew = yesReserve + trustInAfterFee
   noReserveNew = noReserve + trustInAfterFee
   ```

3. **Applique l'invariant CPMM** pour déterminer `yesOut` :
   ```
   k_old = yesReserve * noReserve
   // On veut conserver k_old (ou le voir augmenter via fee, mais ici fee déjà prise)
   // Final state: (yesReserveNew - yesOut) * noReserveNew = k_old
   //            → yesReserveNew - yesOut = k_old / noReserveNew
   //            → yesOut = yesReserveNew - k_old / noReserveNew
   // Substituting :
   yesOut = yesReserve + trustInAfterFee - (yesReserve * noReserve) / (noReserve + trustInAfterFee)
   ```

4. **Slippage check** : `require(yesOut >= minYesOut, "slippage")`.

5. **Update state** :
   ```
   yesReserve = yesReserveNew - yesOut    // i.e., (yesReserve*noReserve)/(noReserve+trustInAfterFee)
   noReserve = noReserveNew               // i.e., noReserve + trustInAfterFee
   _yesBalance[marketId][msg.sender] += yesOut
   accumulatedProtocolFees += protocolFee
   feesForObservers[marketId] += observerFee
   totalLocked += msg.value
   ```

6. **Emit `Swap(marketId, msg.sender, Side.Yes, true, msg.value, yesOut, yesReserve, noReserve)`**.

**Exemple numérique** (pool frais, seed 25 TRUST, user achète YES avec 5 TRUST, fees 2.1% total) :

```
Initial: yesReserve = 25, noReserve = 25, k = 625
msg.value = 5
fees = 5 * 0.021 = 0.105
trustInAfterFee = 4.895

yesReserveNew (temp) = 25 + 4.895 = 29.895
noReserveNew = 25 + 4.895 = 29.895
yesOut = 29.895 - 625 / 29.895 = 29.895 - 20.906 = 8.989

Final state:
  yesReserve = 29.895 - 8.989 = 20.906
  noReserve = 29.895
  k = 20.906 * 29.895 = 625.07  (légère augmentation due aux fees restantes dans le pool)
  user YES balance += 8.989

Effective price paid per YES = 5 / 8.989 ≈ 0.556 TRUST
Pre-trade price(YES) = 25/50 = 0.50
Post-trade price(YES) = 29.895/(20.906+29.895) = 0.588
```

Le user a poussé le prix YES de 0.50 → 0.588 et a reçu 8.989 YES pour 5 TRUST. Le prochain acheteur YES payera un prix effectif légèrement plus élevé.

**Cas `buyNo`** : strictement symétrique, swap les rôles de `yesReserve` et `noReserve`.

### 4.3 CPMM sell

```solidity
function sellYes(uint256 marketId, uint256 yesIn, uint256 minTrustOut)
    external
    whenNotPaused
    nonReentrant
    returns (uint256 trustOut);

function sellNo(uint256 marketId, uint256 noIn, uint256 minTrustOut)
    external
    whenNotPaused
    nonReentrant
    returns (uint256 trustOut);
```

**Logique mathématique (cas `sellYes`)** :

Le user dépose `yesIn` YES tokens virtuels (son `_yesBalance` est décrémenté). Le contract doit :

1. **Check balance** : `require(_yesBalance[marketId][msg.sender] >= yesIn, "insufficient YES")`
2. **Décrémenter la position user** : `_yesBalance[marketId][msg.sender] -= yesIn`
3. **Calculer `trustOut`** via l'invariant inverse. Rappel : vendre YES dans le CPMM, c'est ajouter YES au pool et retirer "trust equivalent" (qui est en réalité : ajouter YES au pool ET faire un merge NO correspondant). La formule Omen-style pour le calc sell :

   Étape intermédiaire : on veut trouver `trustOut` tel que, après :
   ```
   yesReserve_new = yesReserve + yesIn - trustOut
   noReserve_new  = noReserve - trustOut
   ```
   On ait `yesReserve_new * noReserve_new == k` (invariant CPMM préservé, fee appliquée après).

   C'est une quadratique en `trustOut`. La formule fermée (dérivée de l'équation quadratique standard) :
   ```
   let a = yesReserve + yesIn
   let b = noReserve
   let k = yesReserve * noReserve
   // Solving (a - trustOut) * (b - trustOut) = k
   //       → trustOut² - (a+b)*trustOut + (a*b - k) = 0
   // Discriminant: D = (a+b)² - 4*(a*b - k) = (a-b)² + 4k
   // trustOut = ((a+b) - sqrt(D)) / 2   (prendre la racine la plus petite pour rester dans le pool)
   ```

4. **Appliquer fees** : `trustOutAfterFee = trustOut * (10000 - LP_FEE_BPS - PROTOCOL_FEE_BPS - OBSERVER_FEE_BPS) / 10000`. Les fees restent dans le pool ou sont accumulées comme pour buy.

5. **Slippage check** : `require(trustOutAfterFee >= minTrustOut, "slippage")`.

6. **Update reserves** :
   ```
   yesReserve = yesReserve + yesIn - trustOut
   noReserve = noReserve - trustOut
   ```

7. **Transfer native TRUST** via `_sendNative(msg.sender, trustOutAfterFee)` (CEI : state changes first).

8. **Decrement totalLocked** : `totalLocked -= trustOutAfterFee + fees`

9. **Emit `Swap`**.

**Note sur la précision** : `sqrt` sur uint256 avec OpenZeppelin `Math.sqrt` ou Solady `FixedPointMathLib.sqrt`. Solady est plus gas-efficient, on l'importe en v1. Pas d'overflow possible sur `(a-b)² + 4k` pour des réserves réalistes (<1e24 wei).

### 4.4 Liquidity provision

```solidity
function addLiquidity(uint256 marketId, uint256 minLpShares)
    external
    payable
    whenNotPaused
    nonReentrant
    returns (uint256 lpShares);

function removeLiquidity(uint256 marketId, uint256 lpShares, uint256 minTrustOut)
    external
    nonReentrant
    returns (uint256 trustOut, uint256 residualYes, uint256 residualNo);
```

#### 4.4.1 `addLiquidity` — ajouter de la liquidité

Un LP dépose `msg.value` TRUST, qui est split équitablement en `msg.value` YES + `msg.value` NO dans les réserves. Le LP reçoit des **LP shares** proportionnelles à sa contribution sur la liquidité totale.

**Math** :

```
Market storage m = _markets[marketId];
require(m.state == State.Active, "not active");
require(block.timestamp < m.deadline, "market expired");
uint256 trustIn = msg.value;

if (m.lpSupply == 0) {
    // Premier LP — pas possible ici car createMarket seed déjà INITIAL_LIQUIDITY
    revert("unreachable — seed exists");
}

// Compute LP shares at current ratio
// Convention: LP share represents a fraction of (yesReserve + noReserve) / 2
uint256 poolValue = (m.yesReserve + m.noReserve) / 2;
uint256 lpSharesMinted = (trustIn * m.lpSupply) / poolValue;

require(lpSharesMinted >= minLpShares, "slippage");

// Split trustIn into YES + NO equally added to reserves
m.yesReserve += uint128(trustIn);
m.noReserve += uint128(trustIn);
m.lpSupply += uint128(lpSharesMinted);
_lpBalance[marketId][msg.sender] += lpSharesMinted;

totalLocked += trustIn;
emit LiquidityAdded(marketId, msg.sender, trustIn, lpSharesMinted);
```

**Attention** : l'ajout est symétrique (même quantité de YES et NO ajoutée). Sur un marché non-équilibré (yesReserve ≠ noReserve), cela **dilue le prix vers 0.5**. Les LPs acceptent ce comportement — s'ils ne veulent pas diluer, ils peuvent d'abord trade pour rééquilibrer, puis addLiquidity. Ou attendre que le marché soit équilibré.

**Alternative plus sophistiquée** (rejetée v1) : ajouter asymétriquement pour conserver le ratio actuel. Mathématiquement :
```
yesIn = trustIn * yesReserve / poolValue
noIn = trustIn * noReserve / poolValue
```
C'est plus précis mais c'est +40 lignes et plus dangereux en cas d'edge case (arrondi, pool asymétrique extrême). Reporté v2. Pour v1, on accepte la dilution symétrique.

#### 4.4.2 `removeLiquidity` — retirer sa liquidité

```solidity
function removeLiquidity(uint256 marketId, uint256 lpShares, uint256 minTrustOut)
    external
    nonReentrant
    returns (uint256 trustOut, uint256 residualYes, uint256 residualNo)
{
    Market storage m = _markets[marketId];
    require(_lpBalance[marketId][msg.sender] >= lpShares, "insufficient LP");

    // Compute LP's proportional share of pool
    uint256 yesShare = (uint256(m.yesReserve) * lpShares) / m.lpSupply;
    uint256 noShare = (uint256(m.noReserve) * lpShares) / m.lpSupply;

    // Update state first (CEI)
    _lpBalance[marketId][msg.sender] -= lpShares;
    m.lpSupply -= uint128(lpShares);
    m.yesReserve -= uint128(yesShare);
    m.noReserve -= uint128(noShare);

    if (m.state == State.Active) {
        // Pre-resolution: give back equal amounts of YES + NO as merge-able collateral
        uint256 symmetric = yesShare < noShare ? yesShare : noShare;
        trustOut = symmetric;  // User récupère `symmetric` TRUST directement
        residualYes = yesShare - symmetric;
        residualNo = noShare - symmetric;

        // Créditer les résidus comme positions user
        _yesBalance[marketId][msg.sender] += residualYes;
        _noBalance[marketId][msg.sender] += residualNo;

        _sendNative(msg.sender, trustOut);
        totalLocked -= trustOut;
    } else {
        // Post-resolution: convert position to TRUST based on winning side
        if (m.state == State.Resolved) {
            trustOut = m.winningSide == Side.Yes ? yesShare : noShare;
        } else {
            // Refunded: LP gets their proportional split back as merge
            uint256 symmetric = yesShare < noShare ? yesShare : noShare;
            trustOut = symmetric + (yesShare - symmetric) + (noShare - symmetric);
            // = yesShare + noShare, but capped to actual LP proportional share
            trustOut = yesShare + noShare;
        }
        _sendNative(msg.sender, trustOut);
        totalLocked -= trustOut;
    }

    require(trustOut >= minTrustOut, "slippage");
    emit LiquidityRemoved(marketId, msg.sender, lpShares, trustOut, residualYes, residualNo);
}
```

**Clé** : pre-resolution, le LP récupère la portion "mergeable" (min de yesShare et noShare) en TRUST direct, et le résidu asymétrique comme position ouverte (il peut ensuite trader ou attendre la résolution). Post-resolution, la conversion est linéaire selon le winning side.

#### 4.4.3 Impermanent loss — documentation obligatoire

**Le risque réel** : si le marché tranche fort vers un side, le LP se retrouve majoritairement avec le side perdant. Exemple :

```
LP ajoute 100 TRUST → pool = 100 YES + 100 NO (seed) + 100 + 100 = 200 + 200 = 400 TRUST notional
Market évolue vers YES: users buyYes, pool finit à 50 YES + 350 NO (prix YES ≈ 0.88)
LP retire sa proportion (1/4 de lpSupply):
  yesShare = 12.5 YES, noShare = 87.5 NO
  Pre-resolution merge: symmetric = 12.5, résidu = 0 YES + 75 NO
  LP récupère 12.5 TRUST + 75 NO en position ouverte
Post-résolution YES win: les 75 NO valent 0, total LP = 12.5 TRUST (loss de 87.5 sur 100 déposés)
Post-résolution NO win: les 75 NO valent 75 TRUST, total = 87.5 TRUST (loss de 12.5)
```

**Les fees cumulées pendant la vie du marché** compensent partiellement/totalement selon le volume. Un marché 1h avec 500 TRUST de volume rapporte 500 × 1.5% = 7.5 TRUST de fees aux LPs. Si l'IL est inférieur à 7.5 TRUST, le LP est net positive.

**Conclusion** : LP est profitable seulement sur les marchés à fort volume relatif au mouvement de prix. Documentation obligatoire dans l'UI avant tout addLiquidity. Reco en v1 : limiter les LPs aux utilisateurs informés (banner UI explicite "advanced feature, read the docs").

### 4.5 TWAP observations

**Pattern** : ring buffer de 12 slots, remplis par n'importe qui via `observe(marketId)`, incentivé par un reward accumulé dans les swap fees.

```solidity
struct Observation {
    uint64 timestamp;
    uint192 totalAssets;
}
// Per market
mapping(uint256 marketId => Observation[12]) internal _observations;

function observe(uint256 marketId) external whenNotPaused {
    Market storage m = _markets[marketId];
    require(m.state == State.Active, "not active");

    // Window: last 1 hour before deadline only
    require(block.timestamp >= m.deadline - OBSERVATION_WINDOW, "too early");
    require(block.timestamp <= m.deadline, "too late");

    // Min interval between observations
    uint256 prevIdx = m.observationHead == 0 ? 11 : m.observationHead - 1;
    Observation memory last = _observations[marketId][prevIdx];
    if (m.observationCount > 0) {
        require(block.timestamp >= uint256(last.timestamp) + MIN_OBSERVATION_INTERVAL, "too frequent");
    }

    // Read current TVL from MultiVault
    (uint256 totalAssets, ) = multiVault.getVault(m.termId, m.curveId);
    require(totalAssets > 0, "dead term");

    // Store in ring buffer
    _observations[marketId][m.observationHead] = Observation({
        timestamp: uint64(block.timestamp),
        totalAssets: uint192(totalAssets)
    });
    m.observationHead = uint8((m.observationHead + 1) % 12);
    if (m.observationCount < 12) m.observationCount++;

    // Register observer if not already
    if (!_isObserver[marketId][msg.sender]) {
        _isObserver[marketId][msg.sender] = true;
        _observersList[marketId].push(msg.sender);
    }

    emit Observed(marketId, msg.sender, uint64(block.timestamp), totalAssets);
}
```

**Reward observer** : au moment du `resolve`, le pool `feesForObservers[marketId]` est distribué **pro-rata** à tous les observers uniques :

```solidity
// Dans resolve(), après avoir déterminé le winning side:
uint256 totalObserversPool = feesForObservers[marketId];
uint256 numObservers = _observersList[marketId].length;
if (numObservers > 0 && totalObserversPool > 0) {
    uint256 perObserver = totalObserversPool / numObservers;
    for (uint256 i = 0; i < numObservers; i++) {
        address obs = _observersList[marketId][i];
        // Append to pending claim, or send directly via _sendNative
        _pendingObserverRewards[obs] += perObserver;
    }
    // Reset
    feesForObservers[marketId] = 0;
}
```

**Gas concern** : si `numObservers` est grand (>50), la boucle dans `resolve` peut coûter cher. Deux mitigations :

1. **Pull model plutôt que push** : au lieu de distribuer à tout le monde pendant `resolve`, on stocke `rewardPerObservation` et les observers appellent `claimObserverReward(marketId)` eux-mêmes pour récupérer. Gas constant pour `resolve`.

2. **Pour v1** : use pull model. C'est aussi plus propre du point de vue CEI (pas de transfer interne pendant `resolve`).

### 4.6 Résolution

```solidity
function resolve(uint256 marketId) external whenNotPaused nonReentrant;
```

**Étapes** :

1. `require(m.state == State.Active, "already settled")`
2. `require(block.timestamp >= uint256(m.deadline) + RESOLVE_GRACE, "too early")` — 15 minutes grace après deadline
3. `require(m.observationCount >= MIN_OBSERVATIONS_TO_RESOLVE, "insufficient obs")` — minimum 3 observations, sinon refund
4. **Compute TWAP** du totalAssets sur les observations stockées :
   ```solidity
   uint256 sum = 0;
   for (uint256 i = 0; i < m.observationCount; i++) {
       sum += uint256(_observations[marketId][i].totalAssets);
   }
   uint256 twapT1 = sum / m.observationCount;
   ```
5. **Compare à T0** :
   ```solidity
   if (twapT1 > m.totalAssets0) {
       m.winningSide = Side.Yes;
       m.state = State.Resolved;
   } else if (twapT1 < m.totalAssets0) {
       m.winningSide = Side.No;
       m.state = State.Resolved;
   } else {
       m.state = State.Refunded;
       emit MarketRefunded(marketId, "TIE");
       return;
   }
   ```
6. **Transfer accumulated protocol fees to feeRecipient** :
   ```solidity
   uint256 protoFees = accumulatedProtocolFees[marketId];
   if (protoFees > 0) {
       accumulatedProtocolFees[marketId] = 0;
       totalLocked -= protoFees;
       _sendNative(feeRecipient, protoFees);
   }
   ```
7. **Compute per-observer reward** (pull model) :
   ```solidity
   uint256 totalObsPool = feesForObservers[marketId];
   uint256 numObs = _observersList[marketId].length;
   if (numObs > 0 && totalObsPool > 0) {
       uint256 perObs = totalObsPool / numObs;
       feesForObservers[marketId] = 0;
       for (uint256 i = 0; i < numObs; i++) {
           _pendingObserverRewards[_observersList[marketId][i]] += perObs;
       }
   }
   ```
   Note : cette boucle est acceptable parce que `numObservers` est plafonné naturellement (MIN_INTERVAL = 4 min sur OBSERVATION_WINDOW = 60 min ⇒ max 15 obs, donc max ~15 distinct observers).

8. **Emit `MarketResolved(marketId, winningSide, twapT1)`**.

**Important** : `resolve` est permissionless. En pratique, le premier user qui veut redeem appellera `resolve` puis `redeem` dans la même tx si le contract expose un helper. Alternative : un petit cron non-privilégié tourne indépendamment pour resolve tous les markets expirés, payé par le reward observer. Ce cron n'est pas nécessaire à la sécurité — il améliore juste l'UX.

### 4.7 Redemption et merge

```solidity
function redeem(uint256 marketId) external nonReentrant;
function merge(uint256 marketId, uint256 amount) external nonReentrant;
```

#### 4.7.1 `redeem`

Après `resolve`, le winner appelle pour convertir ses tokens YES ou NO en TRUST :

```solidity
function redeem(uint256 marketId) external nonReentrant {
    Market storage m = _markets[marketId];
    require(m.state == State.Resolved || m.state == State.Refunded, "not settled");

    uint256 payout;
    if (m.state == State.Resolved) {
        Side win = m.winningSide;
        uint256 winBalance = win == Side.Yes
            ? _yesBalance[marketId][msg.sender]
            : _noBalance[marketId][msg.sender];
        require(winBalance > 0, "nothing to redeem");

        if (win == Side.Yes) _yesBalance[marketId][msg.sender] = 0;
        else _noBalance[marketId][msg.sender] = 0;

        // Losing side tokens are worthless, just clear them
        if (win == Side.Yes) _noBalance[marketId][msg.sender] = 0;
        else _yesBalance[marketId][msg.sender] = 0;

        payout = winBalance;
    } else {
        // Refunded: merge all available YES+NO at 1:1:1 ratio
        uint256 yesBal = _yesBalance[marketId][msg.sender];
        uint256 noBal = _noBalance[marketId][msg.sender];
        require(yesBal + noBal > 0, "nothing to redeem");

        // The user gets min(yesBal, noBal) in merged form + any asymmetric leftover
        // Actually for refund: everybody gets proportional share
        uint256 minBal = yesBal < noBal ? yesBal : noBal;
        uint256 leftover = (yesBal - minBal) + (noBal - minBal);
        // The leftover is also refunded because market is void
        _yesBalance[marketId][msg.sender] = 0;
        _noBalance[marketId][msg.sender] = 0;
        payout = minBal + leftover;
        // Equivalent: payout = yesBal + noBal (because everything refunds)
    }

    totalLocked -= payout;
    _sendNative(msg.sender, payout);
    emit Redeemed(marketId, msg.sender, payout);
}
```

**Note importante sur le refund** : dans l'état `Refunded`, les users récupèrent **la totalité** de leur position (YES + NO), pas juste la partie mergeable. C'est le comportement attendu d'un "emergency refund" ou d'un tie exact.

#### 4.7.2 `merge` (pré-résolution)

Un user qui détient simultanément YES et NO peut les **combiner** en TRUST à 1:1 à tout moment, sans attendre la résolution. C'est l'inverse du "split" implicite qui se passe lors d'un buy.

```solidity
function merge(uint256 marketId, uint256 amount) external nonReentrant {
    Market storage m = _markets[marketId];
    require(m.state == State.Active, "use redeem post-resolution");
    require(_yesBalance[marketId][msg.sender] >= amount, "insufficient YES");
    require(_noBalance[marketId][msg.sender] >= amount, "insufficient NO");

    _yesBalance[marketId][msg.sender] -= amount;
    _noBalance[marketId][msg.sender] -= amount;
    totalLocked -= amount;
    _sendNative(msg.sender, amount);
    emit Merged(marketId, msg.sender, amount);
}
```

**Cas d'usage** : un LP qui retire sa liquidité pre-resolution et se retrouve avec YES + NO asymétriques peut merger la partie symétrique en TRUST, et garder les résidus asymétriques comme position directionnelle.

### 4.8 Emergency refund

```solidity
function emergencyRefund(uint256 marketId) external onlyOwner;
```

Réservé au multisig owner. Conditions valides (documentées hors contract, owner est supposé honnête) :

- MultiVault revert à `observe()` ou `resolve()` (term invalidé, upgrade cassant)
- `resolve()` n'a pas été appelé 7 jours après deadline (keeper off + no user interest)
- Bug critique détecté, market doit être invalidé

**Effet** : marque `m.state = State.Refunded`. À partir de là, `redeem` et `removeLiquidity` renvoient la proportional total (pas de distribution selon winning side).

**Limitations strictes** :
- Ne force pas un winning side
- Ne transfère pas à une adresse arbitraire
- Ne touche pas aux fonds des autres markets
- Ne bypass pas le timelock pour autre chose que cette action unique

### 4.9 Rescue dust

Identique à ce qui a été décrit avant. Deux fonctions owner-only :

```solidity
function rescueNative(address to, uint256 amount) external onlyOwner nonReentrant;
function rescueERC20(address token, address to, uint256 amount) external onlyOwner;
```

**Invariant `totalLocked`** : maintenu en permanence. `address(this).balance >= totalLocked` est garanti par construction.

`rescueNative` peut au maximum transférer `balance - totalLocked` (le "dust"). Jamais un wei de plus.

`rescueERC20` est sans restriction parce que le PM n'est jamais censé détenir d'ERC20.

---

## 5. Paramètres calibrés

Tous les paramètres sont stockés comme `uint256` soit immuables (définis au deploy) soit mutables par owner (via timelock 24h pour les sensibles).

### 5.1 Fees (mutable, timelock)

| Paramètre | Valeur par défaut | Description |
|---|---|---|
| `LP_FEE_BPS` | `150` (1.5%) | Reste dans le pool, bénéficie aux LPs via `k` qui augmente |
| `PROTOCOL_FEE_BPS` | `50` (0.5%) | Accumulé, envoyé à `feeRecipient` au `resolve` |
| `OBSERVER_FEE_BPS` | `10` (0.1%) | Accumulé, réparti entre observers uniques au `resolve` |
| `TOTAL_FEE_BPS` | `210` (2.1%) | Somme des trois, hard cap par `MAX_TOTAL_FEE_BPS` |
| `MAX_TOTAL_FEE_BPS` | `300` (3%) immuable | Plafond dur, `setFee` revert au-delà |

### 5.2 Caps et limites

| Paramètre | Valeur par défaut | Mutable ? |
|---|---|---|
| `INITIAL_LIQUIDITY` | `25 ether` (25 TRUST) | Oui (timelock) — seed par marché |
| `MAX_COLLATERAL_PER_MARKET` | `1000 ether` | Oui (timelock) — cap systémique |
| `MAX_MARKETS_PER_HOUR` | `4` | Oui (timelock) — rate limit keeper |
| `MAX_FEE_BPS` | `300` (3%) immuable | Non |
| `MAX_COLLATERAL_IMMUTABLE_CAP` | `10000 ether` immuable | Non — plafond absolu, impossible d'élever au-delà |

### 5.3 Timing

| Paramètre | Valeur | Description |
|---|---|---|
| `OBSERVATION_WINDOW` | `1 hours` | Avant deadline, période où `observe()` est autorisé |
| `MIN_OBSERVATION_INTERVAL` | `4 minutes` | Entre deux observations |
| `MAX_OBSERVATIONS` | `12` | Taille du ring buffer (15 min × 4 = 1h couvert) |
| `MIN_OBSERVATIONS_TO_RESOLVE` | `3` | Sinon refund forcé |
| `RESOLVE_GRACE` | `15 minutes` | Après deadline avant que `resolve` soit appelable |
| `EMERGENCY_TIMEOUT` | `7 days` | Après deadline avant qu'un owner emergencyRefund ne soit la voie normale |
| `CONFIG_TIMELOCK` | `24 hours` | Délai sur `setFee`, `setCaps`, `setFeeRecipient`, `setObservationWindow` |

### 5.4 Durées des marchés

| Duration | Secondes |
|---|---|
| `Hour` | `3600` (1h) |
| `Day` | `86400` (1d) |
| `Month` | `2592000` (30j) |

### 5.5 Addresses immuables (au deploy)

| Paramètre | Description |
|---|---|
| `multiVault` | `<TBD>` — à injecter via env au deploy selon la chaîne (mainnet 1155 ou testnet 13579) |
| `defaultCurveId` | Lu dynamiquement au constructor via `multiVault.bondingCurveConfig()`, puis stocké en `immutable` |

---

## 6. Interface Solidity

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPredictionMarket {
    // ─── Types ─────────────────────────────────────────────────

    enum Side { Yes, No }
    enum Duration { Hour, Day, Month }
    enum State { Active, Resolved, Refunded }

    struct Market {
        bytes32 termId;
        uint256 curveId;
        uint256 totalAssets0;
        uint64 createdAt;
        uint64 deadline;
        uint128 yesReserve;
        uint128 noReserve;
        uint128 lpSupply;
        Duration duration;
        State state;
        Side winningSide;
        uint8 observationCount;
        uint8 observationHead;
    }

    // ─── Events ────────────────────────────────────────────────

    event MarketCreated(
        uint256 indexed marketId,
        bytes32 indexed termId,
        uint256 curveId,
        Duration duration,
        uint256 totalAssets0,
        uint64 deadline,
        uint256 initialLiquidity
    );
    event Swap(
        uint256 indexed marketId,
        address indexed user,
        Side side,
        bool isBuy,
        uint256 trustAmount,
        uint256 tokenAmount,
        uint128 newYesReserve,
        uint128 newNoReserve
    );
    event LiquidityAdded(
        uint256 indexed marketId,
        address indexed lp,
        uint256 trustIn,
        uint256 lpSharesMinted
    );
    event LiquidityRemoved(
        uint256 indexed marketId,
        address indexed lp,
        uint256 lpSharesBurned,
        uint256 trustOut,
        uint256 residualYes,
        uint256 residualNo
    );
    event Observed(uint256 indexed marketId, address indexed observer, uint64 timestamp, uint256 totalAssets);
    event MarketResolved(uint256 indexed marketId, Side winningSide, uint256 twapT1);
    event MarketRefunded(uint256 indexed marketId, bytes32 reason);
    event Redeemed(uint256 indexed marketId, address indexed user, uint256 payout);
    event Merged(uint256 indexed marketId, address indexed user, uint256 amount);
    event ObserverRewardClaimed(address indexed observer, uint256 amount);

    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event AllowedTermUpdated(bytes32 indexed termId, bool allowed);
    event FeesUpdated(uint256 lpFee, uint256 protocolFee, uint256 observerFee);
    event CapsUpdated(uint256 initialLiquidity, uint256 maxCollateral);
    event NativeRescued(address indexed to, uint256 amount);
    event ERC20Rescued(address indexed token, address indexed to, uint256 amount);

    // ─── Keeper ────────────────────────────────────────────────

    function createMarket(bytes32 termId, uint256 curveId, Duration d)
        external
        returns (uint256 marketId);

    // ─── Users: trading ────────────────────────────────────────

    function buyYes(uint256 marketId, uint256 minYesOut)
        external payable returns (uint256 yesOut);
    function buyNo(uint256 marketId, uint256 minNoOut)
        external payable returns (uint256 noOut);
    function sellYes(uint256 marketId, uint256 yesIn, uint256 minTrustOut)
        external returns (uint256 trustOut);
    function sellNo(uint256 marketId, uint256 noIn, uint256 minTrustOut)
        external returns (uint256 trustOut);
    function merge(uint256 marketId, uint256 amount) external;

    // ─── Users: LP ─────────────────────────────────────────────

    function addLiquidity(uint256 marketId, uint256 minLpShares)
        external payable returns (uint256 lpShares);
    function removeLiquidity(uint256 marketId, uint256 lpShares, uint256 minTrustOut)
        external returns (uint256 trustOut, uint256 residualYes, uint256 residualNo);

    // ─── Users: observation + resolve (permissionless) ────────

    function observe(uint256 marketId) external;
    function resolve(uint256 marketId) external;
    function redeem(uint256 marketId) external;
    function claimObserverReward() external;

    // ─── Views ─────────────────────────────────────────────────

    function getMarket(uint256 marketId) external view returns (Market memory);
    function getUserPosition(uint256 marketId, address user)
        external view returns (uint256 yesBal, uint256 noBal, uint256 lpBal);
    function getPrice(uint256 marketId) external view returns (uint256 yesPriceBps, uint256 noPriceBps);
    function getQuoteBuyYes(uint256 marketId, uint256 trustIn)
        external view returns (uint256 yesOut, uint256 fee);
    function getQuoteSellYes(uint256 marketId, uint256 yesIn)
        external view returns (uint256 trustOut, uint256 fee);
    function getPendingObserverReward(address observer) external view returns (uint256);
    function nextMarketId() external view returns (uint256);
    function keeper() external view returns (address);
    function feeRecipient() external view returns (address);
    function totalLocked() external view returns (uint256);

    // ─── Owner (with or without timelock) ─────────────────────

    function setKeeper(address newKeeper) external;  // instant
    function pause() external;                        // instant
    function unpause() external;                      // instant
    function emergencyRefund(uint256 marketId) external;  // instant

    function setAllowedTerm(bytes32 termId, bool allowed) external;  // via timelock
    function setFees(uint256 lpFee, uint256 protocolFee, uint256 observerFee) external;  // via timelock
    function setCaps(uint256 initialLiquidity, uint256 maxCollateral) external;  // via timelock
    function setFeeRecipient(address newRecipient) external;  // via timelock

    function rescueNative(address to, uint256 amount) external;
    function rescueERC20(address token, address to, uint256 amount) external;
}

interface IMultiVault {
    function getVault(bytes32 termId, uint256 curveId)
        external view returns (uint256 totalAssets, uint256 totalShares);
    function bondingCurveConfig()
        external view returns (address registry, uint256 defaultCurveId);
    function isTermCreated(bytes32 id) external view returns (bool);
    function getCounterIdFromTripleId(bytes32 tripleId) external pure returns (bytes32);
}
```

---

## 7. Sécurité — defense in depth

### 7.1 Patterns appliqués

| Pattern | Usage |
|---|---|
| **Checks-Effects-Interactions** | Toutes les fonctions state-mutating : checks → update state → external calls (transfer native TRUST en dernier) |
| **ReentrancyGuardTransient** | OZ v5.1+, utilise transient storage (EIP-1153, cancun). Moins cher que classique. Sur `buyYes`, `buyNo`, `sellYes`, `sellNo`, `addLiquidity`, `removeLiquidity`, `redeem`, `merge`, `resolve`, `rescueNative` |
| **Pausable avec exits préservés** | Owner peut pause. En pause : `createMarket`, `buyYes/No`, `addLiquidity`, `observe` sont bloqués. Mais `sellYes/No`, `removeLiquidity`, `redeem`, `merge`, `resolve`, `claimObserverReward`, `rescueNative/ERC20` restent **disponibles** pour que les users ne soient jamais piégés. |
| **TimelockController (OZ)** | Actions sensibles (changement de fees, caps, feeRecipient, allowlist adds) passent par un delay de 24h. Gives users time to react. |
| **Ownable2Step** | Transfer d'ownership en 2 étapes (propose/accept) pour éviter les transfers accidentels ou mal adressés. |
| **Immutables** | `multiVault`, `defaultCurveId`, `MAX_FEE_BPS`, `MAX_COLLATERAL_IMMUTABLE_CAP` — impossible de les modifier post-deploy |
| **Integer safety** | Solidity 0.8.24 native overflow checks. Pour la math CPMM, utilisation de `Math.mulDiv` et `FixedPointMathLib.sqrt` (Solady) pour précision et efficacité |
| **`_sendNative` helper** | Wrapper autour de `call{value}("")` avec revert si échec. Utilisé uniquement à la fin des fonctions (après state updates) |
| **`receive()` revert** | Direct native transfers revertent, seule voie d'entrée est via `msg.value` d'une fonction autorisée |

### 7.2 Invariants formels à prouver (Foundry invariant testing)

Ces 5 invariants doivent tenir **après n'importe quelle séquence aléatoire d'actions**. Un contrat `PredictionMarketHandler.t.sol` définit les actions possibles, et `forge test --match-contract Invariant --fuzz-runs 10000` vérifie les invariants.

**Invariant 1 — Collateral solvency** :
```
address(this).balance >= totalLocked
```
Le contrat détient toujours au moins autant de TRUST qu'il en doit aux users + LPs + feeRecipient.

**Invariant 2 — CPMM constant product monotone** :
```
∀ marketId ∈ Active, yesReserve[marketId] × noReserve[marketId] ≥ k_at_creation[marketId]
```
Le produit `yesReserve × noReserve` ne peut qu'augmenter (via fees). `addLiquidity` et `removeLiquidity` augmentent/diminuent proportionnellement, donc `k` augmente/diminue mais le "k per lpShare" reste constant ou augmente.

Formulation plus précise :
```
∀ marketId, (yesReserve × noReserve) / lpSupply² ≥ initial_k_per_share²
```

**Invariant 3 — YES/NO symmetry conservation via merge/split** :
```
∀ marketId, sum_users(yesBalance) + yesReserve == sum_users(noBalance) + noReserve
```
C'est le reflet de l'invariant "split = merge" : chaque TRUST qui entre via `buyYes` ou `buyNo` augmente `yesReserve + noReserve + sum_users(yesBal) + sum_users(noBal)` de manière balanced.

Plus précis : si on définit `virtualYes = sum_users(yesBalance) + yesReserve` et `virtualNo = sum_users(noBalance) + noReserve`, alors `virtualYes - virtualNo == 0` à tout moment pour un marché actif. (Hors fees captured.)

**Invariant 4 — LP share conservation** :
```
∀ marketId, sum_users(lpBalance) == lpSupply
```
Pas de création/destruction silencieuse de shares.

**Invariant 5 — State transitions monotones** :
```
∀ marketId, state transitions permises :
  Active → Resolved
  Active → Refunded
  Nothing else
```
Pas de transition backward, pas de transition illégale.

### 7.3 Stratégie de testing

**Couches de test** :

1. **Unit tests** (`test/PredictionMarket.t.sol`, ~50 tests) : chaque fonction, happy path + edge cases. Use `MockMultiVault`.
2. **Fork tests** (`test/PredictionMarketFork.t.sol`, ~10 tests) : full flow contre le vrai MultiVault sur testnet 13579. Utilise des termIds réels (ex : `intuitionbilly.eth` à `0x906527...07769`).
3. **Invariant fuzzing** (`test/invariants/PredictionMarketInvariant.t.sol`, 10k runs) : vérifie les 5 invariants ci-dessus sur des séquences aléatoires d'appels.
4. **Differential testing** (optionnel, `test/DifferentialMath.t.sol`) : compare l'implémentation Solidity de la math CPMM avec une implémentation Python de référence via `ffi`. Permet de détecter les erreurs d'arrondi.
5. **Static analysis** (`slither`, CI) : check automatique des patterns dangereux.
6. **External audit** (obligatoire avant mainnet) : budget $25-40k pour Spearbit, Cantina, Trail of Bits, Zellic ou équivalent. ~2-3 semaines de review.

### 7.4 Incentive design (perspective ethskills `concepts/`)

Le skill `concepts/` insiste : *"For every state transition: who calls it? Why would they? What if nobody does?"*

Check par fonction :

| Fonction | Qui appelle ? | Pourquoi ? | Si personne n'appelle ? |
|---|---|---|---|
| `createMarket` | Keeper bot | Son job rémunéré | Pas de nouveaux markets → pas de rev. Alerte monitoring. |
| `buyYes/buyNo` | Parieur | Convictions + ROI | Pas de volume, LPs ne gagnent rien. Market mort. |
| `sellYes/sellNo` | Parieur | Exit la position | Users sont lock jusqu'à resolve, mais ils peuvent encore merge s'ils ont YES+NO. |
| `addLiquidity` | LP | Gagner swap fees | Pas de liquidité additionnelle, seed limite les trades. |
| `removeLiquidity` | LP | Récupérer capital | Capital lock jusqu'à resolve. |
| `observe` | Observer (permissionless) | Reward au resolve | Pas d'obs → fallback refund. Mitigation : cron de backup non-privilégié. |
| `resolve` | Quiconque (permissionless) | Débloquer redeem / observer rewards | Pas de resolve → markets stuck en Active post-deadline. Mitigation : `emergencyRefund` owner après `EMERGENCY_TIMEOUT`. |
| `redeem` | Gagnant | Récupérer gains | Pas de redeem → fonds dorment mais restent `totalLocked`. Pas de risque. |
| `merge` | User avec YES+NO | Récupérer TRUST arbitrable | Optionnel, utilisé par les LPs. |

Tous les paths critiques ont une **incentive économique explicite** ou un **fallback owner**. C'est le pattern recommandé par les skills.

---

## 8. Alternatives considérées et rejetées

### 8.1 Parimutuel (design v1 précédent) ❌

**Pourquoi rejeté définitivement** :
- Pas de continuous price discovery — UX amateur vs Polymarket
- Pas de secondary market — les parieurs sont lock jusqu'à résolution
- Late entrants sur side dominant reçoivent un payout dérisoire
- Associé au pari hippique, pas aux instruments financiers
- Demande explicite user d'aller vers une qualité industrielle dès v1

### 8.2 ERC20 outcome tokens via factory (pattern Polymarket) ❌ en v1, ✅ en v2

**Pourquoi différé** :
- Skill `ship/` warning : "Factory nobody asked for — don't build factories unless deploying multiple instances for different users"
- Aucun protocole DeFi tiers n'existe sur Intuition L3 aujourd'hui → les ERC20 transférables n'ont pas de consommateur
- Coût : +500 lignes Solidity, +1 template + clones EIP-1167, +2 contrats par marché à déployer
- Les fonctionnalités qui dépendent d'ERC20 (continuous price, buy/sell, exit via CPMM) **marchent avec des internal mappings** — seul le transfer P2P est perdu, et personne ne fait de transfer P2P en v1
- Migration v2 documentée §10

### 8.3 KeeperExecutor en contrat séparé ❌

**Pourquoi rejeté** :
- Même skill `ship/` sur minimalisme architectural
- La logique allowlist + rate limit + anti-dup tient en 80 lignes dans `PredictionMarket.createMarket`
- 0 perte de sécurité (l'executor EOA est toujours contraint par les on-chain rules)
- 1 contrat déployé en moins = 1 audit surface en moins

### 8.4 Chainlink Automation / Gelato / MPC wallet / AA bundler ❌

**Pourquoi rejeté** :
- Aucune de ces infras ne tourne sur Intuition L3 (chain 1155) aujourd'hui
- Wait-and-see pour v2 si l'écosystème mûrit

### 8.5 Lazy market creation (first bet seeds) ❌

**Pourquoi rejeté** :
- Casse les slots fixes (1h / 1d / 1m alignés)
- UX dégradée (pas de dashboard "voici les markets actifs")
- Premier parieur paye un coût extra

### 8.6 Pure EOA keeper sans allowlist (plan initial v1) ❌

**Pourquoi rejeté** :
- Blast radius d'une compromission était ~20 TRUST/attaque + spam illimité
- Avec allowlist + rate limit inline, blast radius = 0
- Coût : 80 lignes. Trop peu pour ne pas le faire.

### 8.7 Spot read du MultiVault à la résolution ❌

**Pourquoi rejeté** :
- Flash loan + single-block manipulation possible
- Skill `security/` : *"Never use DEX spot prices as oracles"*
- TWAP sur 12 observations dilue la manipulation × 12

### 8.8 Chainlink price feed (pour le totalAssets) ❌

**Pourquoi rejeté** :
- Pas déployé sur Intuition L3
- Pas nécessaire : le MultiVault est déterministe, on le lit directement. C'est un **avantage** de notre design vs Polymarket (pas de UMA OO, pas de challenge humaine)

### 8.9 Option B du PROMPT.md original ("manipulation as gameplay") ❌

**Pourquoi rejeté** :
- TWAP + caps font mieux que "accepter la manipulation"

### 8.10 LMSR (Logarithmic Market Scoring Rule) ❌

**Pourquoi rejeté** :
- Nécessite un subsidy constant d'un market maker (= équipe Predictuition)
- Mathématiquement élégant mais ajoute une dépendance budgétaire
- CPMM est plus simple et atteint le même résultat (continuous price, liquidité, secondary)

### 8.11 CLOB (Central Limit Order Book) comme Polymarket ❌

**Pourquoi rejeté** :
- Nécessite un matching engine off-chain + infra signature EIP-712
- Overkill pour v1 sur pools de 25-1000 TRUST
- CPMM seul suffit jusqu'à $100k+ de volume par marché

### 8.12 Durées paramétrables par marché ❌

**Pourquoi rejeté** :
- Fragmente la liquidité
- Complexifie l'UI
- Pas de demand user

### 8.13 Multi-outcome markets (plus de 2 sides) ❌

**Pourquoi différé v2** :
- Binary CPMM est standard et prouvé
- Multi-outcome demande une généralisation non-triviale (LMSR, Gnosis CTF multi-outcome)

### 8.14 Fee sur gross payout vs profit uniquement ❌ → réévaluation

**Décision v2** : fee s'applique sur **le trade en entrée** (swap fee classique Uniswap-style), pas sur le profit à la redemption. C'est plus simple, plus standard, et cohérent avec Polymarket. La fee au swap time rend la redemption gratuite (`redeem` transfère le payout brut puisque la fee a déjà été prise au moment du buy).

---

## 9. Limitations connues v1

### 9.1 LP impermanent loss à la résolution

**Réalité** : si un marché tranche fortement vers un side, le LP se retrouve majoritairement avec le side perdant. C'est de l'**IL réel** (pas juste impermanent) parce que le side perdant vaut 0 après résolution.

**Mitigation** : les LPs gagnent 1.5% des swap fees pendant la vie du marché. Sur un marché actif (>500 TRUST de volume), les fees peuvent dépasser l'IL. Sur un marché peu actif, le LP perd.

**Documentation obligatoire** : banner UI explicite "advanced feature" avant tout `addLiquidity`.

### 9.2 Volatilité TRUST comme collatéral

**Réalité** : un parieur a double exposition — la prédiction ET le prix de TRUST vs USD. Un winner qui gagne 20 TRUST peut "gagner" en unités mais perdre en USD si TRUST a chuté pendant la durée du marché.

**Mitigation v2** : quand un stable bridgé (USDC, pyUSD) arrive sur Intuition, ajouter un mode "markets denominated in stable".

### 9.3 Dépendance au MultiVault upgrade

**Réalité** : le MultiVault est un proxy EIP-1967 (impl mainnet `0xc6f28a5f...` au 2026-04-13). Si Intuition upgrade et casse la signature de `getVault`, `observe()` et `resolve()` revertent.

**Mitigation** : `emergencyRefund` par owner Safe. À monitorer : ajouter un watcher offchain sur les events `Upgraded(address)` du proxy MultiVault pour être alerté immédiatement.

### 9.4 Observer liveness

**Réalité** : si personne n'appelle `observe()` pendant l'heure avant deadline, le market a `observationCount < 3` et tombe en refund au `resolve`. Personne ne perd son collatéral mais les LPs perdent leur fee earnings et les parieurs leur exposition directionnelle.

**Mitigation** : `OBSERVER_FEE_BPS = 0.1%` comme reward. Sur un marché avec 1000 TRUST de volume, le pool observers = 1 TRUST réparti entre ~12 observers (s'ils poke tous), soit ~0.08 TRUST per observer. Pas énorme mais positif. **Ce n'est pas suffisant pour incentiviser à soi-même**.

**Mitigation secondaire** : un **cron de backup permissionless** tourne en parallèle et poke toutes les 5 min. Si le cron tombe, les observers permissionless peuvent prendre le relais (ils sont rémunérés). Si les deux tombent, le marché refund mais personne ne perd son capital.

### 9.5 Observer reward gaming

**Attaque possible** : un acteur crée 100 adresses, chacune appelle `observe()` une fois, gagne 1/100e du pool. Il capture plus de reward qu'un observer légitime qui pushe 12 fois.

**Mitigation v1** : le reward est **par observer unique**, pas par observation. Un même adresse qui call 12 fois gagne la même chose qu'un qui call 1 fois. Sybil-résistant faiblement (pas économiquement très rentable mais techniquement possible).

**Mitigation v2** : reward pondéré par nombre d'observations effectuées par cette adresse. Plus complexe, reporté.

### 9.6 Pas de secondary market hors CPMM

**Réalité** : les positions YES/NO sont des mappings internes. Pas de transfert P2P, pas d'OTC, pas de composability avec d'autres protocoles DeFi.

**Mitigation** : les users peuvent exit à tout moment via `sellYes/No` dans le CPMM, tant que la liquidité le permet. C'est pratiquement équivalent.

**Migration v2** : extraction en ERC20 outcome tokens (voir §10).

### 9.7 Composability DeFi zéro

**Réalité** : les positions Predictuition ne peuvent pas être nanties dans un lending protocol, LP'é sur Uniswap, utilisées comme collatéral, etc.

**Justification** : aucun autre protocole DeFi n'existe sur Intuition L3 aujourd'hui. Wait-and-see v2.

### 9.8 Gas cost de `resolve()` avec beaucoup d'observers

**Réalité** : la loop de distribution des observer rewards dans `resolve()` est O(n). Avec `MIN_OBSERVATION_INTERVAL = 4 min` et `OBSERVATION_WINDOW = 1 hour`, le max théorique est 15 observations donc ~15 adresses distinctes. Acceptable (~200k gas).

**Mitigation supplémentaire** : pull model (`claimObserverReward`) au lieu de push. Déjà adopté dans la spec §4.6.

### 9.9 Initial liquidity drain

**Réalité** : chaque `createMarket` prélève `INITIAL_LIQUIDITY = 25 TRUST` de la treasury. Pour 18 markets actifs en permanence, cela lock ~450 TRUST en pools actifs. Si le keeper crée 100 markets sans attendre les résolutions, cela peut drainer la treasury.

**Mitigation** : rate limit `MAX_MARKETS_PER_HOUR = 4` limite le drain à 100 TRUST/heure. Monitoring treasury obligatoire.

### 9.10 Pas d'audit formel mathématique de la CPMM

**Réalité** : on utilise la formule Omen standard qui est battle-tested mais nous on la ré-implémente. Un bug de copie est possible.

**Mitigation** : differential testing (§7.3 item 4) contre une impl Python de référence. Plus l'audit externe avant mainnet.

---

## 10. Roadmap v2 — migration multi-contrat

Quand l'écosystème Intuition mûrira (arrivée de DeFi protocols, stable bridgé, infra AA/MPC), la roadmap v2 s'articule autour de cette **migration progressive**. Chaque étape est indépendante et peut être déployée séparément sans casser les markets v1 existants.

### 10.1 Extraction des outcome tokens en ERC20 via CTF

**Nouveau contrat : `ConditionalTokens.sol`** (~400 lignes)

Inspiré du Gnosis Conditional Tokens Framework et simplifié pour Predictuition :

```solidity
contract ConditionalTokens {
    // Per (marketId, side) → tokenAddress
    mapping(uint256 marketId => mapping(PredictionMarket.Side => address)) public outcomeTokens;

    // Template ERC20 minimal, cloné via EIP-1167
    address public immutable outcomeTokenImpl;

    function split(uint256 marketId, uint256 amount) external payable;
    function merge(uint256 marketId, uint256 amount) external;
    function redeemFinal(uint256 marketId, PredictionMarket.Side side) external;
}

contract OutcomeToken is ERC20 {
    address public immutable conditionalTokens;
    uint256 public immutable marketId;
    PredictionMarket.Side public immutable side;

    modifier onlyCT() { require(msg.sender == conditionalTokens); _; }

    function mint(address to, uint256 amount) external onlyCT { _mint(to, amount); }
    function burn(address from, uint256 amount) external onlyCT { _burn(from, amount); }
}
```

**Modifications à `PredictionMarket.sol`** :
- `buyYes` appelle `ConditionalTokens.split(marketId, trustIn)` qui mint YES + NO en ERC20 au user, puis le PM "prend" le NO via un `transferFrom` pour l'ajouter à la réserve
- `sellYes` inverse : PM calcule `trustOut` via CPMM, prend le YES du user via `transferFrom`, `merge` avec un NO pris de la réserve
- `redeem` devient une fonction du CT, pas du PM
- Les mappings `_yesBalance` / `_noBalance` disparaissent du PM (ils sont dans les ERC20 maintenant)

**Bénéfices** :
- Users voient `PM-YES-42` et `PM-NO-42` dans leur wallet
- Transférables P2P (OTC, gifts, DAO distributions)
- Composables avec d'autres protocoles DeFi
- Compatible avec les DEXes futurs sur Intuition (les ERC20 peuvent être swap sur un Uniswap fork)

**Coût** :
- ~400 lignes CT + ~100 lignes modifications PM
- 2 nouveaux ERC20 deployés par marché (via clone = ~50k gas chacun, acceptable sur L3)
- Audit supplémentaire du CT (~$10-15k)
- Migration des markets v1 existants : impossible (ils restent internes), seul les nouveaux markets utilisent le CT
- Effort total : ~2 semaines dev + 1 semaine audit

### 10.2 Extraction du KeeperExecutor

**Si la logique keeper devient plus complexe** (ex : cron multi-phases, TWAP pre-creation, batching, multi-keeper signatures), factoriser en `KeeperExecutor.sol` séparé.

**Quand déclencher** :
- Si on ajoute le support de 3+ templates (Bracket, Sentiment, multi-outcome)
- Si on veut permettre plusieurs executors EOA avec permissions granulaires différentes (ex : "executor A peut créer Hour markets, executor B peut créer Month markets")
- Si la logique createMarket dépasse 200 lignes dans PM

**Effort** : ~150 lignes contrat + tests. ~3 jours dev.

### 10.3 Oracle wrapper pour composability

**Nouveau contrat : `PredictionMarketOracle.sol`** (~200 lignes)

Expose le TWAP de chaque market résolu comme une **price feed Chainlink-compatible** :

```solidity
interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

contract PredictionMarketOracle is AggregatorV3Interface {
    PredictionMarket public immutable pm;
    uint256 public immutable marketId;

    function latestRoundData() external view override returns (...) {
        PredictionMarket.Market memory m = pm.getMarket(marketId);
        require(m.state == State.Resolved);
        // Encode winning side as 0 or 1 (or expose TWAP value)
        ...
    }
}
```

**Bénéfices** : d'autres protocoles peuvent consommer les résolutions Predictuition comme des "facts onchain" (ex : un lending protocol qui liquide conditionnellement basé sur un market Predictuition).

**Effort** : ~1 semaine dev + tests. Faible priorité jusqu'à ce qu'un consumer apparaisse.

### 10.4 Token de gouvernance PREDIC + LP mining

**Émission d'un token ERC20 `PREDIC`** distribué aux LPs comme compensation de l'IL :

- Mint PREDIC au pro-rata des LP shares détenues × temps × volume
- Non-transférable pendant les 6 premiers mois (anti-flip)
- Ensuite, governance token pour décider : allowlist adds, parameter changes, new templates

**Risques** : token émission est un gros engagement legal/tokenomic. À ne pas lancer sans consulting juridique.

**Effort** : ~3 semaines dev + tokenomic design + legal review. Low priority.

### 10.5 Templates additionnels

**Bracket template avec seuil per-market** :
- Le keeper calcule la volatilité historique du termId offchain, passe `bracketBps` au createMarket
- Le PM stocke le seuil et l'applique à `resolve` : YES gagne si `|twapT1 - T0| × 10000 / T0 >= bracketBps`
- Coût : ~50 lignes dans PM + logique keeper. ~2 jours.

**Multi-outcome markets (3+ sides)** :
- Généralisation non-triviale du CPMM. Gnosis CTF supporte nativement n outcomes mais la math LMSR est nécessaire pour price discovery.
- Coût : ~400 lignes contrat + integration frontend. ~2 semaines.

**Sentiment ratio pour triples (Triple vs CounterTriple)** :
- Retarder jusqu'à ce que les CounterTriples sur Intuition aient >$1000 TVL en moyenne (condition empirique)
- Math : compare `getVault(tripleId) / (getVault(tripleId) + getVault(counterTripleId))` à T0 vs TWAP T1
- Coût : ~100 lignes + nouveau template enum. ~3 jours.

### 10.6 USDC collateral mode

Quand un USDC bridgé arrive sur Intuition L3 :

- Ajouter un constructor param `collateralToken` (IERC20)
- Si `collateralToken == address(0)`, utiliser native TRUST (mode actuel)
- Sinon, utiliser l'ERC20 via `SafeERC20.safeTransferFrom` / `safeTransfer`
- Création de markets avec collatéral USDC aux côtés de markets TRUST (deux instances PM déployées)

**Coût** : ~100 lignes (abstraction sur les transfers) + redeploy. ~1 semaine.

### 10.7 DAO governance via Safe Module

**Migration de l'owner Safe vers un SafeModule qui délègue à une gouvernance token-weighted** (basée sur PREDIC ou un staking de TRUST). Les proposals passent par un vote avant d'atteindre le timelock.

**Effort** : 1-2 mois. Requires significant legal + tokenomic framework.

---

### Résumé roadmap v2

| Étape | Priorité | Effort | Déclencheur |
|---|---|---|---|
| 10.1 CT en ERC20 | Medium | 3 semaines | Un protocole DeFi émerge sur L3 et veut intégrer |
| 10.2 KeeperExecutor séparé | Low | 3 jours | Ajout de 3+ templates |
| 10.3 Oracle wrapper | Low | 1 semaine | Un consumer protocol apparaît |
| 10.4 PREDIC + LP mining | Low | 3 semaines | Consulting juridique OK |
| 10.5 Templates additionnels | Medium | 2 jours - 2 semaines | Demand user validée v1 |
| 10.6 USDC collateral | High | 1 semaine | USDC bridged apparaît sur L3 |
| 10.7 DAO governance | Very low | 1-2 mois | Maturité communautaire |

**Priorité absolue v2** : 10.6 (USDC) dès qu'un stable est disponible, parce que c'est ce qui unlock le vrai product-market fit.

---

## 11. Intégration frontend

Cette section liste les changements nécessaires dans `src/` quand le contrat v2 sera déployé. **Hors scope immédiat** du développement contract, documenté ici pour préparer.

### 11.1 Config

- `src/config/chains.ts` — ajouter `intuitionTestnet` (chain 13579). Déjà mentionné dans le v1 archive.
- `src/config/contracts.ts` (nouveau) — exporter l'adresse de `PredictionMarket` par chain et son ABI généré par Foundry (`out/PredictionMarket.sol/PredictionMarket.json`).

### 11.2 Hooks de lecture (read)

Nouveau hook `useMarket(marketId)` qui :

```typescript
// src/hooks/useMarket.ts
export function useMarket(marketId: bigint) {
  const { data: market } = useReadContract({
    abi: PM_ABI,
    address: PM_ADDRESS,
    functionName: "getMarket",
    args: [marketId],
    query: { refetchInterval: 2_000 },  // refresh every 2s
  });

  const { data: priceData } = useReadContract({
    abi: PM_ABI,
    address: PM_ADDRESS,
    functionName: "getPrice",
    args: [marketId],
    query: { refetchInterval: 2_000 },
  });

  // Compute real-time YES price
  const yesPrice = priceData ? Number(priceData[0]) / 10_000 : 0;  // bps → decimal
  const noPrice = 1 - yesPrice;

  // ... enrich with GraphQL (label, image, type) from Hasura

  return { market, yesPrice, noPrice, ... };
}
```

**Real-time**: `refetchInterval: 2000` est calibré sur la block time Intuition L3 (~2s). Chaque nouveau bloc, l'UI update. Gas-free reads via RPC.

### 11.3 Hook de trading (write)

```typescript
// src/hooks/useBuy.ts
export function useBuyYes(marketId: bigint) {
  const { writeContract, data: hash } = useWriteContract();

  const buy = (amount: bigint, minOut: bigint) => {
    writeContract({
      abi: PM_ABI,
      address: PM_ADDRESS,
      functionName: "buyYes",
      args: [marketId, minOut],
      value: amount,
    });
  };

  return { buy, txHash: hash };
}
```

Similaire pour `buyNo`, `sellYes`, `sellNo`, `addLiquidity`, `removeLiquidity`, `redeem`, `merge`.

### 11.4 Quote preview avant tx

Pour afficher "tu recevras approximativement X YES pour 10 TRUST" avant le clic :

```typescript
const { data: quote } = useReadContract({
  abi: PM_ABI,
  address: PM_ADDRESS,
  functionName: "getQuoteBuyYes",
  args: [marketId, parseEther("10")],
  query: { refetchInterval: 2_000 },
});
// quote = [yesOut, fee]
```

Slippage tolerance : le user choisit 0.5% / 1% / 2%, et `minYesOut = quote[0] * (1 - slippage)`.

### 11.5 Pages à refondre

- **`src/pages/Market.tsx`** — affiche la liste des markets actifs triés par volume (lire les events `Swap` pour estimer le volume, ou via un subgraph)
- **`src/pages/MarketDetail.tsx`** — ajoute :
  - **Prix live** (chart Recharts qui refresh chaque 2s)
  - **Buy/Sell panel** avec slider YES/NO, input amount, slippage
  - **Pool reserves** visualisées (yesReserve vs noReserve bar)
  - **Observer count + reward pool** (motivation pour poke)
  - **LP panel** (addLiquidity / removeLiquidity, avec warning IL)
- **`src/pages/Portfolio.tsx`** — remplace `mockBets` par les positions réelles lues depuis le contract + events

### 11.6 Subgraph / indexer

Pour les charts historiques de prix et le PnL user, un subgraph est nécessaire :
- Index tous les events `Swap` par marché → séries temporelles de prix
- Index `BetPlaced`, `Claimed` par user → historique de positions
- Reco : **The Graph** si un hosted service existe pour Intuition L3, sinon **Ponder** (TypeScript indexer self-hosted)

### 11.7 Tests frontend

Scénarios de non-régression :
1. Créer un market via testnet, vérifier qu'il apparaît dans `MarketsPage` sous 10s
2. Buy 10 TRUST sur YES, vérifier que la position apparaît dans `Portfolio` et que le prix YES dans `MarketDetail` a bougé
3. Observer le market (poke), vérifier l'event dans le dashboard
4. Resolve après deadline + grace, vérifier que `redeem` crédite bien
5. Test pause : owner pause → UI affiche un banner "paused", les boutons `buy`/`addLiquidity` sont disabled mais `sell`/`redeem` restent actifs

---

## 12. Annexes

### A. Données de calibration live (2026-04-13)

Validation des choix de design sur données réelles du MultiVault mainnet.

**Top 10 atoms par TVL** (curve 1, `position_count >= 5`) :

| Label | TVL (TRUST) | Positions |
|---|---|---|
| Intuition | 573 116 | 34 017 |
| Top Agent Skills | 139 727 | 29 |
| Saulo | 117 867 | 16 |
| has tag | 116 588 | 41 948 |
| I | 116 245 | 28 148 |
| Hive Mind | 102 180 | 5 |
| 0x34E3...F1A6 | 88 428 | 15 |
| intuitionbilly.eth | 84 701 | 76 |
| LOCKED IN | 53 044 | 7 |
| Sofia | 33 234 | 37 |

**Volatilité TVL 1d sur 6 atoms testés** (confirme la décision d'utiliser TVL, pas share_price) :

| Atom | Span (jours) | 1d p75 | 1d p90 |
|---|---|---|---|
| 0x6158 (twood.eth) | 103 | 13.55% | 26.57% |
| 0xa8a4 (Top Agent Skills) | 28 | 4.50% | 32.19% |
| 0x7ab1 (I) | 13 | 3.97% | 66.55% |
| 0x8c48 (Intuition) | 5 | 1.90% | 4.00% |
| 0x7ec3 (has tag) | 3 | 1.28% | 1.28% |
| 0xb5f4 (Saulo) | 129 | 0.16% | 22.91% |

Variation × 80 sur le p75 — aucun seuil Bracket global ne fonctionne (justification de le différer v2).

**Validation côté triples** :
- Top triple "Intuition has tag LOCKED IN" : main vault 196 723 TRUST, counter vault 0 TRUST (vide)
- Top CounterTriple trouvé globalement : 9 875 TRUST
- 99% des triples ont counter vault vide → justification de traiter les triples comme les atoms (main vault TVL delta seulement)

### B. Endpoints et adresses (vérifiés live 2026-04-13)

```
Chain ID mainnet               1155    (vérifié via eth_chainId)
Chain ID testnet               13579   (vérifié via eth_chainId)

GraphQL mainnet                https://mainnet.intuition.sh/v1/graphql
GraphQL testnet                https://testnet.intuition.sh/v1/graphql
RPC mainnet                    https://rpc.intuition.systems/http           latence ~315ms
RPC testnet                    https://testnet.rpc.intuition.systems/http

MultiVault mainnet proxy       <TBD — à rechercher et consigner au moment du deploy>
MultiVault mainnet impl        <TBD>
  (EIP-1967, upgradeable — voir §9.3 dépendance upgrade)
BondingCurveRegistry mainnet   <TBD>

MultiVault testnet proxy       <TBD — à rechercher et consigner au moment du deploy>
BondingCurveRegistry testnet   <TBD>

Owner multisig (Gnosis Safe)   <TBD — voir doc-multisig.md pour la stratégie de déploiement>
feeRecipient (default)         <TBD>

Toutes les adresses onchain (contrats Intuition, Safe owner, feeRecipient, keeper)
sont volontairement non-consignées dans ce document. Elles sont injectées via
variables d'environnement au moment du deploy (voir `contracts/script/Deploy.s.sol`
et les envs `MULTIVAULT_ADDRESS`, `PM_OWNER`, `PM_KEEPER`, `PM_FEE_RECIPIENT`).
Un fichier séparé `addresses-deployed.md` sera créé au premier deploy et tiendra
à jour les adresses réelles par chaîne. Il sera commité dans le repo car public.

Token                          TRUST (18 decimals, native gas token)
Default curve ID               1 (vérifié via bondingCurveConfig() sur mainnet ET testnet)

Faucet testnet tTRUST          https://testnet.hub.intuition.systems/
```

### C. Source ABI MultiVault

Référence : `github.com/0xIntuition/intuition-contracts-v2`

- ABI TypeScript : `abis/MultiVault.ts` (3212 lignes)
- Source Solidity : `src/protocol/MultiVault.sol`, `src/protocol/MultiVaultCore.sol`
- Interface : `src/interfaces/IMultiVault.sol`

**Enum `VaultType`** (`IMultiVault.sol:41-45`) :
```solidity
enum VaultType { ATOM, TRIPLE, COUNTER_TRIPLE }
```

**Fonctions utilisées par Predictuition** (toutes vérifiées onchain) :

```solidity
function getVault(bytes32 termId, uint256 curveId)
    external view returns (uint256 totalAssets, uint256 totalShares);
// MultiVault.sol:270-273
// Return order: (totalAssets, totalShares) — confirmé par cross-check RPC vs Hasura

function bondingCurveConfig()
    external view returns (address registry, uint256 defaultCurveId);
// MultiVault.sol (function getter), returns (registry, defaultCurveId=1)

function isTermCreated(bytes32 id) external view returns (bool);
// Optional — getVault returns (0,0) for non-existent terms, our require catches

function getCounterIdFromTripleId(bytes32 tripleId) external pure returns (bytes32);
// For v2 sentiment template, not used in v1
```

**Dérivation du counterTripleId** (pour référence v2) :
```solidity
// MultiVaultCore.sol:297-299
function _calculateCounterTripleId(bytes32 tripleId) internal pure returns (bytes32) {
    return bytes32(keccak256(abi.encodePacked(COUNTER_SALT, tripleId)));
}
```

Un triple et son counter triple sont deux `bytes32` distincts. Le counter triple a son propre vault sur la même `curveId`. Important pour la roadmap v2 (Sentiment ratio).

### D. Skill pack ethskills — guidances intégrées

Installation : `claude plugin marketplace add austintgriffith/ethskills`

Skills consultés pour cette spec :

- **`ship/`** : "three contracts is the upper bound for an MVP" → 1 contrat monolithique choisi
- **`security/`** : "Never use DEX spot prices as oracles" → TWAP sur 12 observations. CEI pattern + `nonReentrant`. Timelock sur config.
- **`building-blocks/`** : LP impermanent loss warning → documentation obligatoire dans l'UI
- **`concepts/`** : "For every state transition: who calls it? Why would they? What if nobody does?" → incentive design systématique, observer reward, permissionless resolve
- **`testing/`** : invariant fuzzing via Foundry → 5 invariants formels définis §7.2
- **Convention orthographe** : "onchain" (un mot), pas "on-chain". Adopté dans ce doc.

### E. Diff sémantique v1 (parimutuel) → v2 (CPMM)

Pour faciliter la review de ce qui change :

| Composant | v1 parimutuel | v2 CPMM |
|---|---|---|
| Nb de contrats | 1 | 1 (confirmé) |
| Marché | `yesPool`, `noPool` flats | `yesReserve`, `noReserve` avec CPMM `x*y=k` |
| Positions | `stakes[market][user][side]` | `_yesBalance[market][user]`, `_noBalance[market][user]` |
| Prix | Ratio discret après chaque bet | Continuous via pool reserves, lu par bloc |
| Bet | `bet(marketId, side) payable` — flat deposit | `buyYes(marketId, minOut) payable` — CPMM swap |
| Exit pré-résolution | ❌ impossible | ✅ `sellYes/sellNo` via CPMM |
| Liquidity | ❌ aucune (pool organique) | ✅ LPs permissionless via `addLiquidity` |
| LP shares | N/A | ERC20-like (internal mapping) |
| Oracle | Spot read à deadline+15min | TWAP 12 obs pendant l'heure avant deadline |
| Fee | 3% sur profit au claim | 2.1% total au swap (1.5% LP + 0.5% protocol + 0.1% observer) |
| Keeper | EOA hot avec createMarket simple | EOA hot avec allowlist + rate limit + anti-dup enforced onchain |
| Observer | N/A | Permissionless `observe()` avec reward |
| Complexité code | ~500 lignes | ~1500 lignes estimées |
| Complexité tests | ~550 lignes | ~2500 lignes estimées (unit + fork + invariant) |
| Audit budget | ~$5k optionnel | $25-40k fortement recommandé |
| Temps dev estimé | 2 jours | 7-10 jours |
| Continuous price UI | ❌ | ✅ |
| Secondary trading | ❌ | ✅ (via CPMM) |
| Composability DeFi | ❌ | ❌ v1, ✅ v2 post-migration ERC20 |

---

## Fin du document

Cette spec est le référentiel canonique pour le développement de PredictionMarket v2. Toute déviation doit passer par une révision explicite de ce doc.

**Prochaine étape** : implémenter ce design dans `contracts/src/PredictionMarket.sol` en remplaçant totalement le code parimutuel v1 existant. Compter ~7-10 jours de dev suivis de ~1 semaine d'audit interne + external audit avant mainnet.
