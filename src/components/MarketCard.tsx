import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Wallet, Users, Atom } from "lucide-react";
import { CountdownTimer } from "./CountdownTimer";
import type { Market } from "@/hooks/useMarkets";
import { highlightQuestion } from "@/lib/highlightQuestion";

function formatPool(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function MarketCard({ market }: { market: Market }) {
  const total = market.yesPool + market.noPool;
  const yesPercent = Math.round((market.yesPool / total) * 100);
  const noPercent = 100 - yesPercent;

  return (
    <Link to={`/market/${market.id}`} className="block">
      <Card className="py-0 gap-0 hover:border-olive/40 transition-all cursor-pointer">
        <CardContent className="p-4 space-y-3">
          {/* Question with inline atom links */}
          <div className="flex items-start gap-2">
            {market.image ? (
              <img src={market.image} alt="" className="w-5 h-5 rounded-full object-cover ring-1 ring-border shrink-0 mt-0.5" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-olive/20 flex items-center justify-center shrink-0 mt-0.5">
                <Atom className="w-3 h-3 text-olive" />
              </div>
            )}
            <p className="text-sm font-semibold text-foreground leading-snug">
              {highlightQuestion(market.question, {
                atoms: [{ label: market.subjectLabel, termId: market.subjectTermId }],
              })}
            </p>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
              <div className="h-full bg-[#90D18D]" style={{ width: `${yesPercent}%` }} />
              <div className="h-full bg-[#bc4b51]" style={{ width: `${noPercent}%` }} />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-[#90D18D]/15 text-[#90D18D] hover:bg-[#90D18D]/25 border-0 flex-1 h-8 text-xs"
              onClick={(e) => e.preventDefault()}
            >
              <ThumbsUp className="w-3 h-3 mr-1" />
              {market.yesLabel} {yesPercent}%
            </Button>
            <Button
              size="sm"
              className="bg-[#bc4b51]/15 text-[#bc4b51] hover:bg-[#bc4b51]/25 border-0 flex-1 h-8 text-xs"
              onClick={(e) => e.preventDefault()}
            >
              <ThumbsDown className="w-3 h-3 mr-1" />
              {market.noLabel} {noPercent}%
            </Button>
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                {formatPool(total)} TRUST
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {market.positions} pos.
              </span>
            </span>
            <CountdownTimer deadline={market.deadline} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
