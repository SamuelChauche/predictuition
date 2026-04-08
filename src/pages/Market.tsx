import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Users,
  Wallet,
  Atom,
  ThumbsUp,
  ThumbsDown,
  Flame,
  Crown,
} from "lucide-react";
import {
  useTopTriplesBySharePrice,
  useTopTriplesByPositionCount,
} from "@/hooks/useTriples";
import { formatNumber, formatEth } from "@/lib/format";
import type { TripleVaultRow } from "@/hooks/useTriples";

function MarketCard({ row, rank }: { row: TripleVaultRow; rank: number }) {
  const t = row.term.triple;
  const price = Number(row.current_share_price) / 1e18;
  const yesPercent = Math.min(95, Math.max(5, Math.round(Math.log10(Math.max(price, 0.01)) * 25 + 50)));
  const noPercent = 100 - yesPercent;

  return (
    <Link to={`/triples/${t.term_id}`} className="block">
      <Card className="hover:border-olive/40 transition-all cursor-pointer py-0 gap-0">
        <CardContent className="p-4 space-y-3">
          {/* Header: rank + question */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">#{rank}</span>
            {t.subject.image ? (
              <img src={t.subject.image} alt="" className="w-5 h-5 rounded-full object-cover ring-1 ring-border shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-olive/20 flex items-center justify-center shrink-0">
                <Atom className="w-3 h-3 text-olive" />
              </div>
            )}
            <p className="text-sm font-medium text-foreground leading-snug">
              <span className="text-olive">{t.subject.label || "Unknown"}</span>
              {" "}{t.predicate.label || "→"}{" "}
              <span className="text-teal">{t.object.label || "Unknown"}</span>
              {" ?"}
            </p>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-olive"
                style={{ width: `${yesPercent}%` }}
              />
              <div
                className="h-full bg-brick"
                style={{ width: `${noPercent}%` }}
              />
            </div>
            <span className="text-xs font-mono text-olive">{yesPercent}%</span>
          </div>

          {/* Buttons + Stats */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-olive/15 text-olive hover:bg-olive/25 border-0 flex-1 h-8 text-xs"
              onClick={(e) => e.preventDefault()}
            >
              <ThumbsUp className="w-3 h-3 mr-1" />
              Yes {yesPercent}%
            </Button>
            <Button
              size="sm"
              className="bg-brick/15 text-brick hover:bg-brick/25 border-0 flex-1 h-8 text-xs"
              onClick={(e) => e.preventDefault()}
            >
              <ThumbsDown className="w-3 h-3 mr-1" />
              No {noPercent}%
            </Button>
            <div className="hidden sm:flex items-center gap-3 ml-2 text-xs text-muted-foreground shrink-0">
              <span className="inline-flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                {formatEth(row.total_assets)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {formatNumber(row.position_count)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function Market() {
  const topByPrice = useTopTriplesBySharePrice(20);
  const topByVolume = useTopTriplesByPositionCount(20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Take a position on on-chain claims. Each market is backed by TRUST on Intuition Protocol.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trending by Price */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-sandy" />
            <h2 className="text-base font-semibold text-foreground">Trending</h2>
          </div>
          <div className="space-y-4">
            {topByPrice.isLoading && <LoadingCards />}
            {topByPrice.error && (
              <Alert variant="destructive">
                <AlertDescription>Failed to load markets.</AlertDescription>
              </Alert>
            )}
            {topByPrice.data?.map((row, i) => (
              <MarketCard key={row.term_id} row={row} rank={i + 1} />
            ))}
          </div>
        </div>

        {/* Popular by Volume */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Crown className="w-5 h-5 text-gold" />
            <h2 className="text-base font-semibold text-foreground">Most Popular</h2>
          </div>
          <div className="space-y-4">
            {topByVolume.isLoading && <LoadingCards />}
            {topByVolume.error && (
              <Alert variant="destructive">
                <AlertDescription>Failed to load markets.</AlertDescription>
              </Alert>
            )}
            {topByVolume.data?.map((row, i) => (
              <MarketCard key={row.term_id} row={row} rank={i + 1} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
