import { defineChain } from "viem";

export const intuitionTestnet = defineChain({
  id: 13579,
  name: "Intuition Testnet",
  nativeCurrency: { decimals: 18, name: "Intuition", symbol: "TRUST" },
  rpcUrls: {
    default: { http: ["https://testnet.rpc.intuition.systems"] },
  },
  blockExplorers: {
    default: {
      name: "Testnet Explorer",
      url: "https://testnet.explorer.intuition.systems",
    },
  },
});

export const intuitionMainnet = defineChain({
  id: 1155,
  name: "Intuition",
  nativeCurrency: { decimals: 18, name: "Intuition", symbol: "TRUST" },
  rpcUrls: {
    default: { http: ["https://rpc.intuition.systems/http"] },
  },
  blockExplorers: {
    default: {
      name: "Intuition Explorer",
      url: "https://explorer.intuition.systems",
    },
  },
});
