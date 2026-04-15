import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Atom, Triangle, Clock, RadioTower } from "lucide-react";
import { useOnChainMarkets } from "@/hooks/useOnChainMarkets";

import { OnChainMarketCard } from "@/components/OnChainMarketCard";
import { CreateMarketForm } from "@/components/CreateMarketForm";
import type { OnChainMarket } from "@/hooks/useOnChainMarkets";

type MarketDuration = "1h" | "1d" | "1m";

const durationLabels: Record<MarketDuration, string> = {
  "1h": "Resolves in ~1 hour",
  "1d": "Resolves in ~24 hours",
  "1m": "Resolves in ~1 month",
};

const durationColors: Record<MarketDuration, string> = {
  "1h": "text-brick",
  "1d": "text-sandy",
  "1m": "text-teal",
};

function getDuration(deadlineTs: number): MarketDuration {
  const remaining = deadlineTs - Math.floor(Date.now() / 1000);
  if (remaining < 2 * 3600) return "1h";
  if (remaining < 2 * 86400) return "1d";
  return "1m";
}

// Classify atom vs triple using the vault target data fetched per card.
// For layout purposes, we use conditionType as a fast heuristic:
// 5 (Triple Ratio) and 6 (Triple Flip) are always triples.
// 1-4 default to atoms unless the vault query says otherwise.
function getColumnHint(m: OnChainMarket): "atoms" | "triples" {
  return m.conditionType >= 5 ? "triples" : "atoms";
}

function DurationSection({
  duration,
  markets,
  onRefetch,
}: {
  duration: MarketDuration;
  markets: OnChainMarket[];
  onRefetch: () => void;
}) {
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
          <OnChainMarketCard key={m.address} market={m} onRefetch={onRefetch} />
        ))}
      </div>
    </div>
  );
}

// Column that also reads vault target to get the real category.
// Falls back to conditionType hint while data loads.
function SmartCategoryColumn({
  label,
  icon: Icon,
  color,
  markets,
  onRefetch,
}: {
  label: string;
  icon: typeof Atom;
  color: string;
  markets: OnChainMarket[];
  onRefetch: () => void;
}) {
  const durations: MarketDuration[] = ["1h", "1d", "1m"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <h2 className="text-base font-bold text-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground">({markets.length})</span>
      </div>

      {markets.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          No {label.toLowerCase()} markets yet.
        </p>
      )}

      {durations.map((d) => (
        <DurationSection
          key={d}
          duration={d}
          markets={markets.filter((m) => getDuration(m.deadlineTs) === d)}
          onRefetch={onRefetch}
        />
      ))}
    </div>
  );
}

function LoadingColumns() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {[0, 1].map((col) => (
        <div key={col} className="space-y-4">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Market() {
  const { markets, isLoading, error, refetch } = useOnChainMarkets();

  const atomMarkets   = markets.filter((m) => getColumnHint(m) === "atoms");
  const tripleMarkets = markets.filter((m) => getColumnHint(m) === "triples");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Predict on-chain metrics from Intuition Protocol. Questions resolve trustlessly via MultiVault view calls.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-3">
        <RadioTower className="w-5 h-5 text-teal" />
        <h2 className="text-base font-bold text-foreground">Live Markets</h2>
        <span className="text-xs text-muted-foreground">(Intuition Testnet · chain 13579)</span>
        <span className="flex items-center gap-1 text-xs text-teal">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
          On-chain
        </span>
        <div className="ml-auto">
          <CreateMarketForm onCreated={refetch} />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load on-chain markets.</AlertDescription>
        </Alert>
      )}

      {isLoading && <LoadingColumns />}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SmartCategoryColumn
            label="Atoms"
            icon={Atom}
            color="text-sandy"
            markets={atomMarkets}
            onRefetch={refetch}
          />
          <SmartCategoryColumn
            label="Triples"
            icon={Triangle}
            color="text-teal"
            markets={tripleMarkets}
            onRefetch={refetch}
          />
        </div>
      )}
    </div>
  );
}
