import { useSwitchChain, useAccount } from "wagmi";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { intuitionMainnet, intuitionTestnet } from "@/config/chains";

export function NetworkSwitch() {
  const { chain } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  const isMainnet = chain?.id === intuitionMainnet.id;

  return (
    <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs mb-2">

      {/* Testnet */}
      <button
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md transition-colors",
          !isMainnet
            ? "bg-background text-foreground font-medium shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => {
          if (isMainnet) switchChain({ chainId: intuitionTestnet.id });
        }}
        disabled={isPending}
      >
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            !isMainnet ? "bg-olive" : "bg-muted-foreground/50"
          )}
        />
        Testnet
      </button>

      {/* Mainnet — Coming Soon */}
      <div className="group relative flex-1">
        <button
          disabled
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-muted-foreground/40 cursor-not-allowed"
        >
          Mainnet
          <Lock className="w-2.5 h-2.5" />
        </button>

        {/* Popup Coming Soon */}
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
          <div className="bg-popover border border-border rounded-md px-2.5 py-1.5 text-xs text-muted-foreground whitespace-nowrap shadow-lg">
            Coming Soon
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-border" />
        </div>
      </div>

    </div>
  );
}
