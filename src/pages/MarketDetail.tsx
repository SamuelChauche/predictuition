import { useParams, Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Atom, Users, Wallet, TrendingUp, Shield } from "lucide-react";
import { highlightQuestion } from "@/lib/highlightQuestion";
import { useMarket } from "@/hooks/useMarkets";
import { useFilteredChartData } from "@/hooks/useFilteredChartData";
import { PriceChart } from "@/components/PriceChart";
import { BetPanel } from "@/components/BetPanel";
import { PoolBar } from "@/components/PoolBar";
import { CountdownTimer } from "@/components/CountdownTimer";

export default function MarketDetail() {
  const { id } = useParams<{ id: string }>();
  const { market, isLoading, error } = useMarket(id!);
  const { chartData, timeRange, setTimeRange } = useFilteredChartData(market?.termId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[200px] w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[400px] lg:col-span-2" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (error || !market) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Market not found.{" "}
          <Link to="/market" className="underline">
            Back to markets
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/market">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Markets
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {market.image ? (
              <img src={market.image} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-olive/30" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-olive/20 flex items-center justify-center">
                <Atom className="w-4 h-4 text-olive" />
              </div>
            )}
            <h1 className="text-xl font-bold text-foreground">
              {highlightQuestion(market.question, {
                atoms: [{ label: market.subjectLabel, termId: market.subjectTermId }],
              })}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">{market.description}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Wallet className="w-4 h-4 text-olive" />
            <CardDescription>Pool Size</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-olive">
              {(market.yesPool + market.noPool).toFixed(0)} TRUST
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal" />
            <CardDescription>Current Price</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-teal">
              {market.currentPrice.toFixed(4)} TRUST
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Users className="w-4 h-4 text-sandy" />
            <CardDescription>Positions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-sandy">
              {market.positions}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Shield className="w-4 h-4 text-gold" />
            <CardDescription>Resolves in</CardDescription>
          </CardHeader>
          <CardContent>
            <CountdownTimer deadline={market.deadline} className="text-xl font-bold" />
          </CardContent>
        </Card>
      </div>

      {/* Pool visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pool Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <PoolBar market={market} />
        </CardContent>
      </Card>

      {/* Chart + Bet Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PriceChart
            chartData={chartData}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
          />
        </div>
        <div>
          <BetPanel market={market} />
        </div>
      </div>

      {/* Resolution info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-teal" />
            Resolution
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            This market resolves by reading <code className="text-foreground bg-muted px-1 py-0.5 rounded text-xs">currentSharePrice()</code> on the
            Intuition MultiVault contract at the deadline.
          </p>
          <p>
            No external oracle. No dispute. The on-chain state is the truth.
          </p>
          <div className="flex items-center gap-4 text-xs mt-3">
            <span>
              MultiVault: <code className="text-foreground">0x6E35...Fe7e</code>
            </span>
            <span>
              Chain: <code className="text-foreground">1155</code>
            </span>
            <span>
              Term: <code className="text-foreground">{market.termId.slice(0, 10)}...{market.termId.slice(-4)}</code>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
