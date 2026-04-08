import { useParams, Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Triangle, Atom, User, Calendar } from "lucide-react";
import { useTripleDetail } from "@/hooks/useTriples";
import { useSharePriceHistory } from "@/hooks/useAtoms";
import { useFilteredChartData } from "@/hooks/useFilteredChartData";
import { shortenAddress, formatDate } from "@/lib/format";
import { PriceChart } from "@/components/PriceChart";
import { PositionsTable } from "@/components/PositionsTable";
import { VaultStats } from "@/components/VaultStats";
import type { TripleAtomRef } from "@/hooks/useTriples";

function AtomLink({ atom }: { atom: TripleAtomRef }) {
  return (
    <Link
      to={`/atoms/${atom.term_id}`}
      className="inline-flex items-center gap-2 hover:underline text-olive font-medium"
    >
      {atom.image ? (
        <img src={atom.image} alt="" className="w-6 h-6 rounded-full object-cover ring-1 ring-border" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-olive/20 flex items-center justify-center">
          <Atom className="w-3.5 h-3.5 text-olive" />
        </div>
      )}
      {atom.label || shortenAddress(atom.term_id)}
    </Link>
  );
}

export default function TripleDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useTripleDetail(id!);
  const priceHistory = useSharePriceHistory(id);
  const { chartData, timeRange, setTimeRange } = useFilteredChartData(priceHistory.data);

  const triple = data?.triple;
  const vault = data?.triple_vault;
  const positions = data?.positions?.slice(0, 10);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[150px] w-full" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !triple) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load triple.{" "}
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
        <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
          <Triangle className="w-6 h-6 text-teal" />
          Triple
        </h1>
      </div>

      {/* Triple Structure */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Triangle className="w-5 h-5 text-teal" />
            Structure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 text-lg">
            <AtomLink atom={triple.subject} />
            <ArrowRight className="w-4 h-4 text-sandy shrink-0" />
            <span className="text-sandy font-medium">
              {triple.predicate.label || shortenAddress(triple.predicate.term_id)}
            </span>
            <ArrowRight className="w-4 h-4 text-teal shrink-0" />
            <AtomLink atom={triple.object} />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {shortenAddress(triple.creator_id)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(triple.created_at)}
            </span>
          </div>
        </CardContent>
      </Card>

      {vault && (
        <VaultStats
          totalAssets={vault.total_assets}
          totalShares={vault.total_shares}
          positionCount={vault.position_count}
          columns={3}
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
