import { defineChain } from "viem";

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
