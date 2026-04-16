import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Atom, Triangle, Clock, RadioTower, CheckCircle } from "lucide-react";
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

function CategoryColumn({
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

function ResolvedColumn({
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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <h2 className="text-base font-bold text-foreground">{label}</h2>
        <span className="text-xs text-muted-foreground">({markets.length})</span>
      </div>

      {markets.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          No resolved {label.toLowerCase()} markets yet.
        </p>
      )}

      <div className="space-y-3">
        {markets.map((m) => (
          <OnChainMarketCard key={m.address} market={m} onRefetch={onRefetch} />
        ))}
      </div>
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

  const liveMarkets     = markets.filter((m) => !m.resolved && !m.refundMode);
  const resolvedMarkets = markets.filter((m) => m.resolved || m.refundMode);

  const liveAtoms     = liveMarkets.filter((m) => !m.isTriple);
  const liveTriples   = liveMarkets.filter((m) => m.isTriple);
  const resolvedAtoms   = resolvedMarkets.filter((m) => !m.isTriple);
  const resolvedTriples = resolvedMarkets.filter((m) => m.isTriple);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Market</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Predict on-chain metrics from Intuition Protocol. Questions resolve trustlessly via MultiVault view calls.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load on-chain markets.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="live">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="live">
              <RadioTower className="w-3.5 h-3.5" />
              Live Markets
              {liveMarkets.length > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({liveMarkets.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="resolved">
              <CheckCircle className="w-3.5 h-3.5" />
              Resolved
              {resolvedMarkets.length > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({resolvedMarkets.length})</span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-teal">
              <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
              Intuition Testnet · chain 13579
            </span>
            <CreateMarketForm onCreated={refetch} />
          </div>
        </div>

        <TabsContent value="live" className="mt-6">
          {isLoading && <LoadingColumns />}
          {!isLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <CategoryColumn
                label="Atoms"
                icon={Atom}
                color="text-sandy"
                markets={liveAtoms}
                onRefetch={refetch}
              />
              <CategoryColumn
                label="Triples"
                icon={Triangle}
                color="text-teal"
                markets={liveTriples}
                onRefetch={refetch}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="resolved" className="mt-6">
          {isLoading && <LoadingColumns />}
          {!isLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ResolvedColumn
                label="Atoms"
                icon={Atom}
                color="text-sandy"
                markets={resolvedAtoms}
                onRefetch={refetch}
              />
              <ResolvedColumn
                label="Triples"
                icon={Triangle}
                color="text-teal"
                markets={resolvedTriples}
                onRefetch={refetch}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
