# Predictuition — Prompt d'intégration

## Contexte

Predictuition est un prediction market standalone (style Polymarket) dont les questions portent exclusivement sur des métriques on-chain du protocole Intuition. La résolution est trustless — le contrat PM lit directement les getters `view` du MultiVault Intuition. Zéro oracle externe, zéro dispute.

Le PM est **read-only** vis-à-vis d'Intuition. Il ne stake pas, ne dépose pas, ne modifie rien sur Intuition. Il lit l'état on-chain et tranche.

Le document de design complet est dans `~/prediction-market-intuition.md`.

---

## Stack du projet

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4
- React Query (TanStack Query v5)
- graphql-request pour les données Intuition
- Recharts pour les visualisations
- react-router-dom v7

---

## Ce qu'on construit

### Phase 1 — Dashboard des métriques Intuition (en cours)

Un dashboard qui affiche les plus gros atoms et triples du protocole Intuition avec leurs métriques clés (TVL, share price, nombre de stakers, ratio for/against pour les triples).

**Source de données :**

GraphQL endpoint : `https://mainnet.intuition.sh/v1/graphql`

```graphql
# Top atoms par TVL
query TopAtoms($limit: Int!) {
  atoms(
    order_by: { vault { total_shares: desc } }
    limit: $limit
    where: { vault: { total_shares: { _gt: "0" } } }
  ) {
    id
    term_id
    label
    image
    type
    vault {
      total_shares
      current_share_price
      position_count
    }
  }
}

# Top triples par activité
query TopTriples($limit: Int!) {
  triples(
    order_by: { vault { total_shares: desc } }
    limit: $limit
    where: { vault: { total_shares: { _gt: "0" } } }
  ) {
    id
    term_id
    subject { label image }
    predicate { label }
    object { label image }
    vault {
      total_shares
      current_share_price
      position_count
    }
    counter_vault {
      total_shares
      current_share_price
      position_count
    }
  }
}
```

RPC endpoint (pour les lectures on-chain directes) : `https://rpc.intuition.systems/http`
MultiVault address : `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e`
Chain ID : `1155`

### Phase 2 — Intégration du Prediction Market

Intégrer un système de prediction market par-dessus le dashboard. Les marchés sont des questions fixes renouvelées quotidiennement sur les métriques affichées dans le dashboard.

**Référence Scaffold-ETH :** Le challenge prediction-markets de Scaffold-ETH (`https://github.com/scaffold-eth/se-2-challenges/tree/challenge-prediction-markets`) fournit le squelette smart contract. Il faut en extraire la logique et l'adapter.

---

## Architecture du Prediction Market

### Smart Contract (Solidity)

Extraire du scaffold-eth `PredictionMarket.sol` et `PredictionMarketToken.sol`, puis adapter :

**Ce qu'on garde du scaffold :**
- Structure de marché binaire (YES/NO pools)
- Tokens ERC20 pour les positions (YES token, NO token)
- Mécanisme de deposit/withdraw dans les pools
- Distribution des gains au prorata des shares
- Fee system (2-3% protocol fee)
- Rôles : market owner, trader

**Ce qu'on remplace :**
- L'oracle humain → appel `view` vers le MultiVault Intuition
- Le thème "course de voitures" → métriques Intuition
- Le pricing linéaire → pool fixe simple (Option A)

**Ce qu'on ajoute :**
- Resolver automatique qui lit `currentSharePrice()` ou `getVault()` sur le MultiVault
- Système de questions templates (voir section Templates ci-dessous)
- TWAP optionnel pour l'Option B
- Early exit avec pénalité (10-20%)
- Cap dynamique du pool (Option A) ou pas de cap (Option B)

### Interface avec Intuition (read-only)

Le contrat PM a besoin d'une interface pour lire le MultiVault :

```solidity
interface IMultiVaultReader {
    function currentSharePrice(bytes32 termId, uint256 curveId) external view returns (uint256);
    function getVault(bytes32 termId, uint256 curveId) external view returns (uint256 totalAssets, uint256 totalShares);
    function isAtom(bytes32 atomId) external view returns (bool);
    function isTriple(bytes32 id) external view returns (bool);
}
```

Le contrat PM appelle ces fonctions au moment de la résolution. Pas d'écriture, pas de permission nécessaire.

**Important :** Le PM doit être déployé sur le même L3 Intuition (chain 1155) pour que les appels `view` soient directs. Si déployé sur une autre chaîne, il faudrait un bridge/relayer — à éviter dans un premier temps.

### Templates de questions quotidiennes

```
TEMPLATE 1 — Over/Under (recommandé pour le lancement)
"Le share price de l'atom [X] sera-t-il HIGHER ou LOWER
 demain à 00:00 UTC par rapport à aujourd'hui ?"

Resolver :
  snapshot T0 = currentSharePrice(termId, curveId) à la création
  snapshot T1 = currentSharePrice(termId, curveId) à la résolution
  HIGHER gagne si T1 > T0, sinon LOWER gagne

TEMPLATE 2 — Le duel
"Quel atom parmi [A, B, C, D] aura le plus gros delta de TVL
 dans les prochaines 24h ?"

TEMPLATE 3 — Sentiment
"Le ratio for/against du triple [Z] sera-t-il plus BULLISH
 ou plus BEARISH demain ?"

TEMPLATE 4 — Fourchette
"Dans quelle tranche sera le share price de l'atom [X] demain ?"
  [< -5%]  [-5% à 0%]  [0% à +5%]  [> +5%]
```

---

## Les deux options anti-manipulation

### Option A — Pool cappé (sécurité prouvable)

Le pool PM est plafonné pour que la manipulation ne soit jamais rentable.

```
max_pool = coût_manipulation_intuition × 0.3

coût_manipulation = montant_pour_bouger_la_métrique × 3.7% (fees Intuition aller-retour)
```

Avantages : manipulation impossible par design.
Inconvénients : petits pools, scale avec la TVL Intuition.

Questions uniquement sur les atoms à forte TVL (>500 TRUST, >5 stakers).

### Option B — Manipulation comme gameplay (Polymarket-like)

Pas de cap. La manipulation sur Intuition est une stratégie légitime et transparente.

Protections :
- TWAP sur 1-4h autour de la deadline (pas de lecture instantanée)
- Lock time (plus de paris 2h avant résolution)
- Transparence : le frontend affiche les mouvements Intuition en temps réel
- Les cotes s'ajustent naturellement (si tout le monde voit un whale staker, ils parient pareil → les cotes bougent)

Avantages : pools illimités, méta-jeu excitant, manipulation = fees pour Intuition.
Inconvénients : les whales peuvent dominer les petits marchés.

---

## Structure de fichiers cible

```
src/
├── pages/
│   ├── DashboardPage.tsx        # Top atoms/triples + métriques
│   ├── MarketsPage.tsx          # Liste des marchés actifs
│   ├── MarketDetailPage.tsx     # Détail d'un marché (parier, voir les pools)
│   └── PortfolioPage.tsx        # Mes paris, mes gains
│
├── components/
│   ├── atoms/
│   │   ├── AtomCard.tsx         # Card d'un atom avec métriques
│   │   └── AtomTable.tsx        # Table des top atoms
│   ├── triples/
│   │   ├── TripleCard.tsx       # Card d'un triple avec ratio for/against
│   │   └── TripleTable.tsx      # Table des top triples
│   ├── markets/
│   │   ├── MarketCard.tsx       # Card d'un marché (question, cotes, deadline)
│   │   ├── BetPanel.tsx         # Panel pour parier (YES/NO, montant)
│   │   ├── PoolBar.tsx          # Barre visuelle du ratio YES/NO
│   │   ├── CountdownTimer.tsx   # Timer jusqu'à la résolution
│   │   └── MarketHistory.tsx    # Historique des marchés résolus
│   ├── charts/
│   │   ├── SharePriceChart.tsx  # Évolution du share price (Recharts)
│   │   └── TVLChart.tsx         # Évolution de la TVL
│   └── ui/                      # Composants UI réutilisables
│
├── hooks/
│   ├── useTopAtoms.ts           # Query GraphQL top atoms
│   ├── useTopTriples.ts         # Query GraphQL top triples
│   ├── useAtomMetrics.ts        # Métriques temps réel d'un atom
│   ├── useActiveMarkets.ts      # Marchés en cours
│   ├── useMarketDetail.ts       # Détail d'un marché
│   └── useUserBets.ts           # Paris de l'utilisateur
│
├── services/
│   ├── graphqlClient.ts         # Client graphql-request configuré
│   ├── intuitionReader.ts       # Lectures on-chain (viem publicClient)
│   └── marketService.ts         # Logique des marchés (créer, parier, résoudre)
│
├── config/
│   ├── chains.ts                # Définition chain Intuition (viem defineChain)
│   ├── contracts.ts             # Adresses MultiVault, PM contract
│   └── marketTemplates.ts       # Templates de questions
│
├── types/
│   ├── atom.ts
│   ├── triple.ts
│   ├── market.ts                # Market, Bet, Resolution types
│   └── index.ts
│
└── lib/
    └── utils.ts                 # Formatters (TRUST amounts, dates, etc.)
```

---

## Étapes d'implémentation

### Étape 1 — Dashboard métriques (frontend only)

1. Setup graphql-request client vers `https://mainnet.intuition.sh/v1/graphql`
2. Hooks `useTopAtoms` et `useTopTriples` avec React Query
3. Pages `DashboardPage` avec tables/cards des top atoms et triples
4. Charts share price et TVL avec Recharts
5. Routing : `/` → Dashboard, `/atoms/:id` → détail atom, `/triples/:id` → détail triple

### Étape 2 — Smart contract PM

1. Cloner le scaffold-eth challenge prediction-markets
2. Extraire `PredictionMarket.sol` et `PredictionMarketToken.sol`
3. Remplacer l'oracle par l'interface `IMultiVaultReader`
4. Ajouter le système de templates de questions
5. Implémenter Option A (pool cappé) ou Option B (TWAP + pas de cap)
6. Ajouter early exit avec pénalité
7. Tester sur Intuition testnet (chain 13579, MultiVault `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91`)
8. Déployer sur Intuition mainnet (chain 1155)

### Étape 3 — Intégration frontend PM

1. Ajouter viem pour les lectures on-chain et interactions avec le contrat PM
2. Page `MarketsPage` : liste des marchés actifs avec countdown, cotes, volume
3. Page `MarketDetailPage` : parier YES/NO, voir l'évolution des pools en temps réel
4. Connecter les marchés aux atoms/triples du dashboard (lien direct "Parier sur cet atom")
5. Page `PortfolioPage` : mes paris actifs, historique, gains/pertes

---

## Configuration Intuition

```typescript
// config/chains.ts
import { defineChain } from 'viem'

export const intuitionMainnet = defineChain({
  id: 1155,
  name: 'Intuition',
  nativeCurrency: { decimals: 18, name: 'Intuition', symbol: 'TRUST' },
  rpcUrls: { default: { http: ['https://rpc.intuition.systems/http'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.intuition.systems' } },
})

export const intuitionTestnet = defineChain({
  id: 13579,
  name: 'Intuition Testnet',
  nativeCurrency: { decimals: 18, name: 'Test Trust', symbol: 'tTRUST' },
  rpcUrls: { default: { http: ['https://testnet.rpc.intuition.systems/http'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://testnet.explorer.intuition.systems' } },
})

// config/contracts.ts
export const MULTIVAULT_ADDRESS = '0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e' as const
export const DEFAULT_CURVE_ID = 1n
export const GRAPHQL_ENDPOINT = 'https://mainnet.intuition.sh/v1/graphql'
```

## Fees Intuition (référence pour le calcul du cap Option A)

```
feeDenominator = 10000
entryFee       = 50     → 0.50%
exitFee        = 75     → 0.75%
protocolFee    = 125    → 1.25%

Coût aller-retour manipulation ≈ 3.7% du montant déposé
```
