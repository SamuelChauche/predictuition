import { http } from "wagmi";
import { createConfig } from "@privy-io/wagmi";
import { intuitionMainnet } from "./chains";

export const wagmiConfig = createConfig({
  chains: [intuitionMainnet],
  transports: {
    [intuitionMainnet.id]: http(),
  },
});
