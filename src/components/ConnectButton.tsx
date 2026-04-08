import { useAccount, useBalance } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut } from "lucide-react";
import { useState } from "react";

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { address, isConnected } = useAccount();
  const { login, logout, authenticated, ready } = usePrivy();
  const [hovered, setHovered] = useState(false);

  if (isConnected && authenticated && address) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={`${compact ? "" : "w-full"} ${hovered ? "border-brick/50 text-brick" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => logout()}
      >
        {hovered ? (
          <>
            <LogOut className="w-4 h-4 mr-1" />
            {compact ? "" : "Disconnect"}
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-olive mr-2" />
            <span className="font-mono text-xs">{shortenAddr(address)}</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      className={`bg-olive hover:bg-olive/80 text-black font-medium ${compact ? "" : "w-full"}`}
      disabled={!ready}
      onClick={() => login()}
    >
      <Wallet className="w-4 h-4 mr-1" />
      {!ready ? "Loading..." : compact ? "" : "Connect Wallet"}
    </Button>
  );
}

export function useWalletInfo() {
  const { address, isConnected, chain } = useAccount();
  const { data: balance } = useBalance({ address });

  const balanceStr = balance
    ? `${(Number(balance.value) / 10 ** balance.decimals).toFixed(4)} ${balance.symbol}`
    : undefined;

  return {
    address,
    shortAddress: address ? shortenAddr(address) : undefined,
    isConnected,
    chainName: chain?.name,
    chainId: chain?.id,
    balance: balanceStr,
  };
}
