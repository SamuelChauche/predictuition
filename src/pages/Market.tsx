import { Link } from "react-router-dom";
import { Atom, ArrowUpRight, ArrowDownRight, Radio, Swords, Landmark } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DAILY_MARKETS,
  formatPrice,
  useLiveAttestations,
  useLiveMarketPrice,
  type DailyMarketConfig,
} from "@/mocks/dailyMarkets";

const FEATURED = [DAILY_MARKETS["melee-daily"], DAILY_MARKETS["arena-daily"]];

export default function Market() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Daily Up/Down markets powered by Intuition atom attestations.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Atom className="w-5 h-5 text-sandy" />
        <h2 className="text-base font-bold text-foreground">Atoms</h2>
        <span className="text-xs text-muted-foreground">({FEATURED.length})</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-teal">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
          Intuition Testnet · chain 13579
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FEATURED.map((m) => (
          <FeaturedMarketCard key={m.slug} config={m} />
        ))}
      </div>
    </div>
  );
}

function FeaturedMarketCard({ config }: { config: DailyMarketConfig }) {
  const livePrice = useLiveMarketPrice(config.openingPrice, config.volatility, 4000);
  const { up, down } = useLiveAttestations(config);

  const total = up + down;
  const upPct = total === 0 ? 50 : (up / total) * 100;
  const isUp = livePrice >= config.openingPrice;
  const diffPct = ((livePrice - config.openingPrice) / config.openingPrice) * 100;

  const accent = config.accent === "sandy" ? "text-sandy" : "text-teal";
  const accentBg = config.accent === "sandy" ? "bg-sandy/10 ring-sandy/40" : "bg-teal/10 ring-teal/40";
  const Icon: LucideIcon = config.slug === "melee-daily" ? Swords : Landmark;

  return (
    <Link to={config.path} className="group">
      <Card className="p-5 border-border bg-card transition-all hover:border-foreground/30 hover:-translate-y-0.5">
        <div className="flex items-start gap-3 mb-4">
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center ring-2 shrink-0", accentBg)}>
            <Icon className={cn("w-5 h-5", accent)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{config.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Powered by <span className="text-foreground">{config.atomLabel}</span> atom
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-brick">
            <Radio className="w-3 h-3 animate-pulse" />
            Live
          </span>
        </div>

        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</p>
            <p
              className={cn(
                "text-xl font-bold font-mono tabular-nums transition-colors",
                isUp ? "text-up" : "text-brick"
              )}
            >
              {formatPrice(livePrice, config.priceUnit)}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-mono",
              isUp ? "text-up bg-up/10" : "text-brick bg-brick/10"
            )}
          >
            {isUp ? (
              <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} />
            ) : (
              <ArrowDownRight className="w-3 h-3" strokeWidth={2.5} />
            )}
            {diffPct >= 0 ? "+" : ""}
            {diffPct.toFixed(2)}%
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
          <span className="text-up">↑ UP {upPct.toFixed(0)}%</span>
          <span className="text-brick">DOWN {(100 - upPct).toFixed(0)}% ↓</span>
        </div>
        <div className="relative h-1.5 rounded-full bg-brick/25 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-up transition-all duration-700 ease-out rounded-full"
            style={{ width: `${upPct}%` }}
          />
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {total.toLocaleString()} attestations · opens at{" "}
          <span className="text-foreground font-mono">{formatPrice(config.openingPrice, config.priceUnit)}</span>
        </p>
      </Card>
    </Link>
  );
}
