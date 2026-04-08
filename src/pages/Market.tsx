import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Atom, Triangle, Clock } from "lucide-react";
import { useMarkets } from "@/hooks/useMarkets";
import { MarketCard } from "@/components/MarketCard";
import type { Market, MarketDuration } from "@/hooks/useMarkets";

const durationLabels: Record<MarketDuration, string> = {
  "1h": "Resolves in 1 hour",
  "1d": "Resolves in 24 hours",
  "1m": "Resolves in 1 month",
};

const durationColors: Record<MarketDuration, string> = {
  "1h": "text-brick",
  "1d": "text-sandy",
  "1m": "text-teal",
};

function DurationSection({ duration, markets }: { duration: MarketDuration; markets: Market[] }) {
  if (markets.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className={`w-3.5 h-3.5 ${durationColors[duration]}`} />
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${durationColors[duration]}`}>
          {durationLabels[duration]}
        </h3>
      </div>
      <div className="space-y-3">
        {markets.map((m) => (
          <MarketCard key={m.id} market={m} />
        ))}
      </div>
    </div>
  );
}

function CategoryColumn({
  label,
  icon: Icon,
  color,
  markets,
}: {
  label: string;
  icon: typeof Atom;
  color: string;
  markets: Market[];
}) {
  const durations: MarketDuration[] = ["1h", "1d", "1m"];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <h2 className="text-base font-bold text-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground">({markets.length})</span>
      </div>
      {durations.map((d) => (
        <DurationSection
          key={d}
          duration={d}
          markets={markets.filter((m) => m.duration === d)}
        />
      ))}
    </div>
  );
}

function LoadingMarkets() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {[0, 1].map((col) => (
        <div key={col} className="space-y-4">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Market() {
  const { markets, isLoading, error } = useMarkets();

  const atomMarkets = markets.filter((m) => m.category === "atoms");
  const tripleMarkets = markets.filter((m) => m.category === "triples");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Predict on-chain metrics from Intuition Protocol. Questions resolve trustlessly via MultiVault view calls.
        </p>
      </div>

      {isLoading && <LoadingMarkets />}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load markets.</AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <CategoryColumn
            label="Atoms"
            icon={Atom}
            color="text-sandy"
            markets={atomMarkets}
          />
          <CategoryColumn
            label="Triples"
            icon={Triangle}
            color="text-teal"
            markets={tripleMarkets}
          />
        </div>
      )}
    </div>
  );
}
