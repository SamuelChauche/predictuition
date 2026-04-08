import { useParams, Link } from "react-router-dom";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  ArrowRight,
  Triangle,
  Wallet,
  Coins,
  Users,
  TrendingUp,
  User,
  Calendar,
  Atom,
} from "lucide-react";
import { useTripleDetail } from "@/hooks/useTriples";
import {
  useSharePriceHistory,
  usePositionChangeDaily,
} from "@/hooks/useAtoms";
import {
  formatEth,
  formatSharePrice,
  formatNumber,
  shortenAddress,
  formatDate,
} from "@/lib/format";
import type { TripleAtomRef } from "@/hooks/useTriples";

function AtomLink({ atom }: { atom: TripleAtomRef }) {
  return (
    <Link
      to={`/atoms/${atom.term_id}`}
      className="inline-flex items-center gap-2 hover:underline text-olive font-medium"
    >
      {atom.image ? (
        <img
          src={atom.image}
          alt=""
          className="w-6 h-6 rounded-full object-cover ring-1 ring-border"
        />
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
  const positionHistory = usePositionChangeDaily(id);

  const triple = data?.triple;
  const vault = data?.triple_vault;
  const positions = data?.positions?.slice(0, 10);

  const priceChartData = useMemo(() => {
    if (!priceHistory.data) return [];
    return priceHistory.data.map((p) => ({
      date: new Date(Number(p.block_timestamp) * 1000).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      ),
      price: Number(p.share_price) / 1e18,
    }));
  }, [priceHistory.data]);

  const positionChartData = useMemo(() => {
    if (!positionHistory.data) return [];
    let cumulative = 0;
    return positionHistory.data.map((p) => {
      cumulative += p.transaction_count;
      return {
        date: new Date(p.bucket).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        positions: cumulative,
      };
    });
  }, [positionHistory.data]);

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
          <Link to="/" className="underline">
            Back to dashboard
          </Link>
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
            <span className="text-sandy font-medium flex items-center gap-1">
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

      {/* Vault Stats Cards */}
      {vault && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Wallet className="w-4 h-4 text-olive" />
              <CardDescription>Total Assets</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-olive">
                {formatEth(vault.total_assets)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Coins className="w-4 h-4 text-sandy" />
              <CardDescription>Total Shares</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-sandy">
                {formatSharePrice(vault.total_shares)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2">
              <Users className="w-4 h-4 text-gold" />
              <CardDescription>Positions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-gold">
                {formatNumber(vault.position_count)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Share Price Chart */}
      {priceChartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-olive" />
              Share Price Over Time
            </CardTitle>
            <CardDescription>TRUST per share</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--foreground)",
                  }}
                  formatter={(value) => [
                    `${Number(value).toFixed(4)} TRUST`,
                    "Price",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="var(--olive)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Positions Over Time */}
      {positionChartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-teal" />
              Positions Over Time
            </CardTitle>
            <CardDescription>Cumulative position activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={positionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--foreground)",
                  }}
                  formatter={(value) => [
                    formatNumber(Number(value)),
                    "Positions",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="positions"
                  stroke="var(--teal)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-sandy" />
            Top Positions
          </CardTitle>
          {vault && (
            <CardDescription>
              {formatNumber(vault.position_count)} total positions (showing top 10)
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {positions && positions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((pos, i) => (
                    <TableRow key={pos.id}>
                      <TableCell className="text-muted-foreground font-mono">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono">
                        {pos.account.label || shortenAddress(pos.account.id)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-olive">
                        {formatSharePrice(pos.shares)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No positions yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
