import { http, createConfig } from "wagmi";
import { intuitionMainnet, intuitionTestnet } from "./chains";

// Connectors are managed by Privy — no connectors needed here
export const wagmiConfig = createConfig({
  chains: [intuitionMainnet, intuitionTestnet],
  transports: {
    [intuitionMainnet.id]: http("https://rpc.intuition.systems/http"),
    [intuitionTestnet.id]: http("https://testnet.rpc.intuition.systems"),
  },
});
