import { useParams, Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Atom, User, Calendar } from "lucide-react";
import { useAtomDetail, useSharePriceHistory } from "@/hooks/useAtoms";
import { useFilteredChartData } from "@/hooks/useFilteredChartData";
import { shortenAddress, formatDate } from "@/lib/format";
import { getAtomTypeIcon } from "@/components/AtomTypeIcon";
import { PriceChart } from "@/components/PriceChart";
import { PositionsTable } from "@/components/PositionsTable";
import { VaultStats } from "@/components/VaultStats";

export default function AtomDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAtomDetail(id!);
  const priceHistory = useSharePriceHistory(id);
  const { chartData, timeRange, setTimeRange } = useFilteredChartData(priceHistory.data);

  const atom = data?.atom;
  const vault = data?.vaults?.[0];
  const positions = data?.positions?.slice(0, 10);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (error || !atom) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load atom.{" "}
          <Link to="/" className="underline">Back to dashboard</Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          {atom.image ? (
            <img src={atom.image} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-olive/30" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-olive/20 flex items-center justify-center">
              <Atom className="w-5 h-5 text-olive" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">{atom.label || "Atom"}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 text-teal">
                {getAtomTypeIcon(atom.type, "w-3.5 h-3.5")}
                {atom.type}
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {shortenAddress(atom.creator_id)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(atom.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {vault && (
        <VaultStats
          totalAssets={vault.total_assets}
          currentSharePrice={vault.current_share_price}
          totalShares={vault.total_shares}
          positionCount={vault.position_count}
        />
      )}

      <PriceChart
        rawData={priceHistory.data}
        chartData={chartData}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />

      <PositionsTable
        positions={positions}
        positionCount={vault?.position_count}
      />
    </div>
  );
}
