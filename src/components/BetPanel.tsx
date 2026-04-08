import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Wallet } from "lucide-react";
import type { Market } from "@/hooks/useMarkets";

type Side = "yes" | "no";

export function BetPanel({ market }: { market: Market }) {
  const [side, setSide] = useState<Side>("yes");
  const [amount, setAmount] = useState("");

  const total = market.yesPool + market.noPool;
  const yesPercent = Math.round((market.yesPool / total) * 100);
  const noPercent = 100 - yesPercent;

  const parsedAmount = parseFloat(amount) || 0;
  const pool = side === "yes" ? market.yesPool : market.noPool;
  const otherPool = side === "yes" ? market.noPool : market.yesPool;
  const newPool = pool + parsedAmount;
  const newTotal = newPool + otherPool;
  const payout = parsedAmount > 0 ? (parsedAmount / newPool) * newTotal * 0.97 : 0;
  const multiplier = parsedAmount > 0 ? payout / parsedAmount : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Place your bet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Side selector */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={side === "yes" ? "default" : "outline"}
            className={
              side === "yes"
                ? "bg-[#90D18D] hover:bg-[#90D18D]/80 text-black"
                : "hover:bg-[#90D18D]/10 hover:text-[#90D18D]"
            }
            onClick={() => setSide("yes")}
          >
            <ThumbsUp className="w-4 h-4 mr-1" />
            {market.yesLabel} {yesPercent}%
          </Button>
          <Button
            variant={side === "no" ? "default" : "outline"}
            className={
              side === "no"
                ? "bg-[#FFA2B0] hover:bg-[#FFA2B0]/80 text-black"
                : "hover:bg-[#FFA2B0]/10 hover:text-[#FFA2B0]"
            }
            onClick={() => setSide("no")}
          >
            <ThumbsDown className="w-4 h-4 mr-1" />
            {market.noLabel} {noPercent}%
          </Button>
        </div>

        {/* Amount input */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Amount (TRUST)</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-10 rounded-lg bg-input border border-border px-3 pr-16 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-olive/50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              TRUST
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            {[1, 5, 10, 50].map((v) => (
              <Button
                key={v}
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={() => setAmount(String(v))}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>

        {/* Payout info */}
        {parsedAmount > 0 && (
          <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Potential payout</span>
              <span className="font-mono font-medium text-foreground">
                {payout.toFixed(2)} TRUST
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Multiplier</span>
              <span className={`font-mono font-medium ${multiplier > 1.5 ? "text-olive" : "text-foreground"}`}>
                {multiplier.toFixed(2)}x
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Protocol fee</span>
              <span className="font-mono text-muted-foreground">3%</span>
            </div>
          </div>
        )}

        {/* Confirm */}
        <Button
          className={`w-full font-medium ${
            side === "yes"
              ? "bg-[#90D18D] hover:bg-[#90D18D]/80 text-black"
              : "bg-[#FFA2B0] hover:bg-[#FFA2B0]/80 text-black"
          }`}
          disabled={parsedAmount <= 0}
        >
          <Wallet className="w-4 h-4 mr-1" />
          {parsedAmount > 0
            ? `Bet ${parsedAmount} TRUST on ${side === "yes" ? market.yesLabel : market.noLabel}`
            : "Enter an amount"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Connect wallet to place bets. Smart contract not yet deployed.
        </p>
      </CardContent>
    </Card>
  );
}
