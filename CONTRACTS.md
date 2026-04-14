# Smart contracts

The Solidity contracts and design specs for Predictuition live in a dedicated repository:

**https://github.com/SamuelChauche/predictuition-contracts**

That repo contains:

- `src/PredictionMarket.sol` — the on-chain prediction market (current v1 parimutuel, v2 CPMM in spec)
- `src/interfaces/IMultiVault.sol` — read-only interface to the Intuition MultiVault
- `test/` — Foundry unit tests + fork tests
- `script/Deploy.s.sol` — env-driven deploy script
- `doc.md` — canonical design spec for the v2 CPMM rewrite
- `doc-multisig.md` — multisig ownership strategy for Intuition L3

This repo (`predictuition`) contains only the **React frontend** built with Vite, Tailwind, wagmi and TanStack Query. The frontend reads markets from the deployed contract via wagmi and enriches the data with GraphQL queries against the Intuition Hasura endpoint.

## Why two repos

- Cleaner audit scope (the contracts repo has no frontend noise)
- Independent CI: Foundry / Solidity versus Vite / TypeScript
- Different release cycles (contracts move slowly, frontend iterates fast)
- Granular access control (give the auditor read access to one repo, not both)
